import type { CharacterState, StateUpdates, Emotion } from '$lib/types/character';
import type { MessageAnalysis, TopicDepth } from '$lib/types/memory';
import { calculateMessageImpact } from './state-updates.ts';

// Sentiment keywords for analysis
const POSITIVE_KEYWORDS = [
	'happy',
	'glad',
	'love',
	'great',
	'awesome',
	'amazing',
	'wonderful',
	'thank',
	'thanks',
	'appreciate',
	'enjoy',
	'fun',
	'excited',
	'nice',
	'good',
	'best',
	'beautiful',
	'cute',
	'sweet',
	'kind',
	'funny',
	'haha',
	'lol',
	'lmao',
	':)',
	':D',
	'<3',
	'❤',
	'😊',
	'😄',
	'🥰',
	'💕'
];

// "sorry" is deliberately absent: apologizing is repair, not negativity, and
// counting it dinged comfort every time the user said sorry for being away.
const NEGATIVE_KEYWORDS = [
	'sad',
	'hate',
	'bad',
	'awful',
	'terrible',
	'angry',
	'upset',
	'annoyed',
	'frustrated',
	'disappointed',
	'worry',
	'worried',
	'scared',
	'afraid',
	'hurt',
	'pain',
	'lonely',
	'alone',
	'cry',
	'crying',
	':(',
	'😢',
	'😔',
	'😞'
];

// Deep conversation markers
const DEPTH_MARKERS = [
	'feel',
	'feeling',
	'feelings',
	'think',
	'believe',
	'hope',
	'dream',
	'wish',
	'fear',
	'scared',
	'worry',
	'love',
	'hate',
	'care',
	'mean',
	'matter',
	'important',
	'understand',
	'remember',
	'miss',
	'future',
	'past',
	'life',
	'death',
	'relationship',
	'family',
	'friend',
	'trust',
	'honest',
	'truth',
	'secret'
];

// Emotional content markers
const EMOTIONAL_MARKERS = [
	'feel',
	'feeling',
	'emotion',
	'emotional',
	'heart',
	'soul',
	'cry',
	'tears',
	'happy',
	'sad',
	'angry',
	'scared',
	'love',
	'hate',
	'miss',
	'hurt',
	'pain',
	'joy',
	'excited',
	'nervous',
	'anxious',
	'worried'
];

// All keyword lists above are English. When a message is written mostly in a
// non-Latin script (Japanese being the obvious audience), none of them can
// match, so sentiment would read as a meaningless flat zero-negative and the
// caller should lean on the LLM's own deltas instead. Letters are counted via
// Unicode script classes; symbols, digits, and emoji don't vote.
export function isNonLatinDominant(content: string): boolean {
	let letters = 0;
	let latin = 0;
	for (const ch of content) {
		if (!/\p{L}/u.test(ch)) continue;
		letters++;
		if (/\p{Script=Latin}/u.test(ch)) latin++;
	}
	if (letters < 4) return false;
	return latin / letters < 0.5;
}

// Analyze a message for sentiment, depth, and other characteristics
export function analyzeMessage(content: string): MessageAnalysis {
	const lowerContent = content.toLowerCase();
	const words = lowerContent.split(/\s+/);
	const nonLatinDominant = isNonLatinDominant(content);

	// Calculate sentiment (English keywords; skipped for non-Latin input)
	let positiveCount = 0;
	let negativeCount = 0;

	if (!nonLatinDominant) {
		for (const word of words) {
			if (POSITIVE_KEYWORDS.some((kw) => word.includes(kw))) positiveCount++;
			if (NEGATIVE_KEYWORDS.some((kw) => word.includes(kw))) negativeCount++;
		}

		// Also check for emoticons/emoji in full content
		for (const kw of POSITIVE_KEYWORDS) {
			if (lowerContent.includes(kw)) positiveCount++;
		}
		for (const kw of NEGATIVE_KEYWORDS) {
			if (lowerContent.includes(kw)) negativeCount++;
		}
	}

	const totalSentiment = positiveCount + negativeCount;
	const sentiment = totalSentiment > 0 ? (positiveCount - negativeCount) / totalSentiment : 0;

	// Calculate topic depth
	let depthMarkerCount = 0;
	for (const marker of DEPTH_MARKERS) {
		if (lowerContent.includes(marker)) depthMarkerCount++;
	}

	let topicDepth: TopicDepth = 'shallow';
	if (depthMarkerCount >= 3 || content.length > 200) {
		topicDepth = 'deep';
	} else if (depthMarkerCount >= 1 || content.length > 80) {
		topicDepth = 'moderate';
	}

	// Check for emotional content
	let hasEmotionalContent = false;
	for (const marker of EMOTIONAL_MARKERS) {
		if (lowerContent.includes(marker)) {
			hasEmotionalContent = true;
			break;
		}
	}

	// Check if it's a question (both ASCII and full-width question marks)
	const isQuestion = content.includes('?') || content.includes('？') || /^(what|who|where|when|why|how|do|does|did|is|are|was|were|can|could|would|will|should)\b/i.test(content);

	// Extract potential facts (very basic)
	const extractedFacts: string[] = [];

	// Look for "I am/I'm" statements
	const iAmMatches = content.match(/\b(i'?m|i am|my name is)\s+(\w+)/gi);
	if (iAmMatches) {
		extractedFacts.push(...iAmMatches.map((m) => `User said: ${m}`));
	}

	// Look for "I like/love/hate" statements
	const preferenceMatches = content.match(/\b(i (?:really )?(like|love|hate|enjoy|prefer))\s+([^.!?]+)/gi);
	if (preferenceMatches) {
		extractedFacts.push(...preferenceMatches.map((m) => `User preference: ${m}`));
	}

	// Detect emotion from content
	let detectedEmotion: string | undefined;
	if (sentiment > 0.5) {
		detectedEmotion = 'happy';
	} else if (sentiment < -0.5) {
		detectedEmotion = 'sad';
	} else if (isQuestion && depthMarkerCount > 0) {
		detectedEmotion = 'curious';
	}

	return {
		sentiment,
		topicDepth,
		detectedEmotion,
		extractedFacts,
		isQuestion,
		hasEmotionalContent,
		nonLatinDominant
	};
}

// Calculate baseline state updates from a user message
export function calculateBaselineUpdates(content: string, state: CharacterState): StateUpdates {
	const analysis = analyzeMessage(content);

	// Get impact calculations
	const impact = calculateMessageImpact(
		analysis.sentiment,
		analysis.topicDepth,
		analysis.hasEmotionalContent,
		analysis.isQuestion,
		state
	);

	// Build state updates
	const updates: StateUpdates = {
		energyDelta: impact.energyDelta,
		affectionDelta: impact.affectionDelta,
		trustDelta: impact.trustDelta,
		intimacyDelta: impact.intimacyDelta,
		comfortDelta: impact.comfortDelta,
		respectDelta: impact.respectDelta
	};

	// Mood influence based on sentiment
	if (Math.abs(analysis.sentiment) > 0.3) {
		let emotion: Emotion = 'neutral';
		if (analysis.sentiment > 0.5) {
			emotion = 'happy';
		} else if (analysis.sentiment > 0.3) {
			emotion = 'content';
		} else if (analysis.sentiment < -0.5) {
			emotion = 'sad';
		} else if (analysis.sentiment < -0.3) {
			emotion = 'anxious';
		}

		updates.moodChange = {
			emotion,
			intensityDelta: Math.floor(Math.abs(analysis.sentiment) * 20),
			cause: analysis.sentiment > 0 ? 'positive conversation' : 'concerning conversation'
		};
	}

	return updates;
}


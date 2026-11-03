import type { SpeechSegment } from '$lib/services/voice-orchestrator';

/**
 * Split text into sentence-like chunks using punctuation followed by whitespace
 * or end-of-string. CJK full-width marks split on their own since those scripts
 * don't put a space after them. Falls back to the whole trimmed text if no
 * boundary is found.
 */
export function splitIntoSentences(text: string): string[] {
	if (!text.trim()) return [];
	const parts = text
		.split(/(?<=[.!?…])\s+|(?<=[。！？])\s*/u)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	return parts.length > 0 ? parts : [text.trim()];
}

/**
 * Remove JSON state-update blocks and other artifacts that should never be
 * spoken. Collapses multiple spaces but preserves leading/trailing whitespace
 * so it is safe to use while text is still being streamed.
 */
export function stripSpeechArtifacts(text: string): { cleaned: string; removed: string[] } {
	const removed: string[] = [];

	// Remove complete fenced JSON blocks first (state or otherwise; JSON is
	// never speech), then any leftover fence markers so a fence cut off by the
	// end of the stream doesn't get read out as "json".
	let cleaned = text.replace(/```json\s*([\s\S]*?)\s*```/gi, (_match, content) => {
		removed.push('```json' + (content ? ' ' + content.slice(0, 200) : '') + '```');
		return '';
	});
	cleaned = cleaned.replace(/```+[a-zA-Z]*/g, '');

	// Remove reminder/task tags the LLM uses for scheduling
	// ([reminder:5min]text[/reminder]).
	cleaned = cleaned.replace(/\[reminder:\d+[a-z]*\].*?\[\/reminder\]/gi, ' ');

	// Remove inline JSON state-update blocks with brace balancing.
	cleaned = stripStateUpdateBlocks(cleaned, removed);

	// Remove Markdown asterisks that TTS would read aloud.
	cleaned = cleaned.replace(/\*+/g, ' ');

	// Remove arrows and other symbols that TTS engines read aloud as text.
	cleaned = cleaned.replace(/[→←↑↓⇒⇐⇑⇓]/g, ' ');

	// Ensure a space after sentence/clause punctuation when followed by a letter.
	// After "." only before a capital, so "utsuwa.ai" and "e.g." stay whole.
	cleaned = cleaned.replace(/([,;:!?])([a-zA-ZäöüÄÖÜß])/g, '$1 $2').replace(/\.([A-ZÄÖÜ])/g, '. $1');

	// Collapse whitespace runs (fence removal leaves newline gaps) but keep
	// leading/trailing whitespace for streaming.
	cleaned = cleaned.replace(/\s{2,}/g, ' ');

	return { cleaned, removed: removed.filter((r) => r.trim().length > 0) };
}

/**
 * Final cleanup of text for speech. Same as stripSpeechArtifacts but trims
 * leading/trailing whitespace for finished output.
 */
export function stripForSpeech(text: string): { cleaned: string; removed: string[] } {
	const result = stripSpeechArtifacts(text);
	return { cleaned: result.cleaned.trim(), removed: result.removed };
}

const STATE_UPDATE_KEYS = [
	'mood_change',
	'affection_delta',
	'trust_delta',
	'intimacy_delta',
	'comfort_delta',
	'respect_delta',
	'energy_delta',
	'new_memory',
	'triggered_event',
	'structured_fact_seen'
];

const STATE_KEY_FRAGMENT_RE = new RegExp(
	`["']?(?:${STATE_UPDATE_KEYS.join('|')})["']?\\s*[:}]`
);

/**
 * True when `text` contains a state-update key fragment. State blocks that
 * arrive without the outer braces (or that survive block stripping as key
 * fragments) must never be spoken; callers use this to drop such segments.
 */
export function hasStateBlockFragment(text: string): boolean {
	return STATE_KEY_FRAGMENT_RE.test(text);
}

function stripStateUpdateBlocks(text: string, removed: string[]): string {
	// Keys may be double- or single-quoted; JS-style models emit single quotes.
	const keyPattern = new RegExp(`["'](?:${STATE_UPDATE_KEYS.join('|')})["']`);
	let result = '';
	let i = 0;

	while (i < text.length) {
		const ch = text[i];
		if (ch !== '{') {
			result += ch;
			i++;
			continue;
		}

		const rest = text.slice(i);
		const keyMatch = keyPattern.exec(rest);
		if (!keyMatch || keyMatch.index > 200) {
			result += ch;
			i++;
			continue;
		}

		let depth = 1;
		// Remember which quote opened the string so an apostrophe inside a
		// double-quoted value ("user's dog") doesn't end it early.
		let quote: string | null = null;
		let escape = false;
		let j = i + 1;
		for (; j < text.length && depth > 0; j++) {
			const c = text[j];
			if (escape) {
				escape = false;
				continue;
			}
			if (c === '\\') {
				escape = true;
				continue;
			}
			if (quote) {
				if (c === quote) quote = null;
				continue;
			}
			if (c === '"' || c === "'") {
				quote = c;
				continue;
			}
			if (c === '{') depth++;
			else if (c === '}') depth--;
		}

		if (depth === 0) {
			const block = text.slice(i, j);
			removed.push(block.slice(0, 500));
			i = j;
		} else {
			result += ch;
			i++;
		}
	}

	return result;
}

/**
 * Split text into speech segments. For Phase 1 this is a simple wrapper around
 * sentence splitting; language/emotion tags are added in later phases.
 */
export function splitIntoSegments(
	text: string,
	defaultLanguage?: string
): SpeechSegment[] {
	if (!text.trim()) return [];
	return splitIntoSentences(text).map((sentence) => ({
		text: sentence,
		language: defaultLanguage
	}));
}

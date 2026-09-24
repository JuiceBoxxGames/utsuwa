import type { StateUpdates, Emotion } from '$lib/types/character';
import { stripThinkingBlocks } from './thinking-blocks.ts';

// Parsed response structure
export interface ParsedResponse {
	dialogue: string;
	stateUpdates: Partial<StateUpdates> | null;
	parseError?: string;
}

// LLM JSON output structure
interface LLMStateOutput {
	mood_change?: {
		emotion: string;
		intensity_delta?: number;
	};
	affection_delta?: number;
	trust_delta?: number;
	intimacy_delta?: number;
	comfort_delta?: number;
	respect_delta?: number;
	new_memory?: string | null;
	new_inside_joke?: string | null;
	triggered_event?: string | null;
	action?: string | null;
	expression?: string | null;
}

// Animation ids the model may name in "action"; the library checks it exists
const ACTION_ID = /^[a-z0-9_-]{1,64}$/i;

function normalizeAction(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const id = value.trim().toLowerCase();
	return ACTION_ID.test(id) ? id : undefined;
}

// Valid emotions for validation
const VALID_EMOTIONS: Emotion[] = [
	'happy',
	'sad',
	'excited',
	'anxious',
	'content',
	'frustrated',
	'curious',
	'affectionate',
	'playful',
	'melancholy',
	'flustered',
	'neutral'
];

// Common free-form / compound emotions weaker and RP-tuned models emit, mapped
// to our canonical set. Lets their mood signal land instead of being dropped.
const EMOTION_SYNONYMS: Record<string, Emotion> = {
	joy: 'happy', joyful: 'happy', glad: 'happy', cheerful: 'happy', pleased: 'happy',
	grateful: 'happy', thankful: 'happy', delighted: 'happy', proud: 'happy',
	excitement: 'excited', thrilled: 'excited', eager: 'excited', enthusiastic: 'excited',
	nervous: 'anxious', worried: 'anxious', scared: 'anxious', afraid: 'anxious',
	fearful: 'anxious', uneasy: 'anxious', tense: 'anxious', stressed: 'anxious',
	calm: 'content', relaxed: 'content', peaceful: 'content', satisfied: 'content',
	comfortable: 'content', 'cared-for': 'content', serene: 'content', reassured: 'content',
	angry: 'frustrated', annoyed: 'frustrated', irritated: 'frustrated', upset: 'frustrated',
	mad: 'frustrated', exasperated: 'frustrated',
	interested: 'curious', intrigued: 'curious', inquisitive: 'curious',
	loving: 'affectionate', warm: 'affectionate', tender: 'affectionate', fond: 'affectionate',
	caring: 'affectionate', affection: 'affectionate', adoring: 'affectionate',
	fun: 'playful', teasing: 'playful', mischievous: 'playful', silly: 'playful', cheeky: 'playful',
	down: 'melancholy', blue: 'melancholy', wistful: 'melancholy', nostalgic: 'melancholy',
	lonely: 'melancholy', somber: 'melancholy', gloomy: 'melancholy',
	unhappy: 'sad', hurt: 'sad', disappointed: 'sad', heartbroken: 'sad', sorrowful: 'sad',
	embarrassed: 'flustered', shy: 'flustered', bashful: 'flustered', blushing: 'flustered',
	fine: 'neutral', okay: 'neutral', indifferent: 'neutral',
	surprised: 'curious', shocked: 'curious', amazed: 'excited', amused: 'playful',
	laughing: 'happy', giggling: 'playful', smiling: 'happy', smile: 'happy', laugh: 'happy',
	wink: 'playful', grin: 'playful', pout: 'flustered'
};

// Resolve a model's emotion string to one of our canonical emotions, taking the
// first of a compound ("happy|curious", "warm, caring") and mapping synonyms.
function normalizeEmotion(raw: string | undefined): Emotion | null {
	if (!raw) return null;
	const first = raw.toLowerCase().trim().split(/[|/,]/)[0].trim();
	if (VALID_EMOTIONS.includes(first as Emotion)) return first as Emotion;
	return EMOTION_SYNONYMS[first] ?? null;
}

// Chat-template / stop tokens some local GGUFs leak into their text output. An
// end-of-turn marker means the turn is over, so anything after it is a
// hallucinated next turn and gets cut; the rest are just removed.
const END_OF_TURN_RE = /<\/s>|<\|im_end\|>|<\|eot_id\|>|<\|end_of_text\|>|<\|endoftext\|>|<end_of_turn>/i;
const STRAY_TOKEN_RE = /<\|[a-z0-9_]+\|>|<\/?s>|<\/?(?:bos|eos)>|<\/?(?:start|end)_of_turn>|\[\/?INST\]/gi;

function stripControlTokens(text: string): string {
	const idx = text.search(END_OF_TURN_RE);
	const cut = idx === -1 ? text : text.slice(0, idx);
	return cut.replace(STRAY_TOKEN_RE, '');
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Transcript labels the model bleeds through when it keeps writing past its own
// reply as the user or a narrator.
const TRANSCRIPT_LABELS = ['They', 'You', 'User', 'Human', 'Assistant', 'Narrator', 'System', 'AI', 'Companion'];

// Cut at the first transcript turn on a LATER line (anchored to \n, so the real
// reply on line one is never the cut point). Two triggers: a known transcript
// label or the companion's own name followed by a colon, OR any capitalized
// name that opens a quoted line (the model leaking a third-person memory note as
// a fake turn, e.g. `CJ: "They asked how my day is going."`).
function cutHallucinatedTurn(text: string, companionName?: string): string {
	const labels = [...TRANSCRIPT_LABELS];
	if (companionName?.trim()) labels.push(companionName.trim());
	const labelAlt = labels.map(escapeRegExp).join('|');
	const re = new RegExp(
		`\\n[ \\t]*(?:(?:${labelAlt})[ \\t]*:[ \\t]|[A-Z][\\w'’.-]{0,19}[ \\t]*:[ \\t]*["“])`
	);
	const m = text.match(re);
	return m && m.index !== undefined ? text.slice(0, m.index) : text;
}

// JSON objects we care about carry at least one of these keys.
const STATE_KEY_RE =
	/"(?:mood_change|affection_delta|trust_delta|intimacy_delta|comfort_delta|respect_delta|new_memory)"/;

// Reasoning models (R1-style) emit a scratchpad before the answer. Strip it so
// the trace never reaches the chat bubble or the JSON parser. Handles the
// well-formed <think>...</think> pair and the lone </think> some endpoints
// return when the opening tag was consumed as a special token.
// The shared stream-safe strip also cuts dangling openers, so reasoning
// never leaks into speech, display or dialogue regardless of stream state.
function stripReasoning(text: string): string {
	return stripThinkingBlocks(text).trim();
}

// Scan from `start` (a '{') to its matching '}', ignoring braces inside strings.
function balancedObjectFrom(text: string, start: number): string | null {
	let depth = 0;
	let inStr = false;
	let esc = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inStr) {
			if (esc) esc = false;
			else if (ch === '\\') esc = true;
			else if (ch === '"') inStr = false;
		} else if (ch === '"') inStr = true;
		else if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}
	return null;
}

// First balanced {...} that actually carries a state key, so we don't grab
// unrelated JSON the user may have pasted into the chat.
function findStateObject(text: string): string | null {
	for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
		const obj = balancedObjectFrom(text, i);
		if (obj && STATE_KEY_RE.test(obj)) return obj;
	}
	return null;
}

// Tolerant parse for the JSON weaker models and non-conforming endpoints emit:
// strips // and /* */ comments and trailing commas, then falls back to pulling
// the first balanced object out of surrounding prose.
function tryParseJson(text: string): LLMStateOutput | null {
	const repaired = text
		.replace(/\/\/[^\n\r]*/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/,\s*([}\]])/g, '$1')
		.trim();
	try {
		return JSON.parse(repaired) as LLMStateOutput;
	} catch {
		const obj = findStateObject(repaired);
		if (obj && obj !== repaired) {
			try {
				return JSON.parse(obj) as LLMStateOutput;
			} catch {
				/* give up */
			}
		}
		return null;
	}
}

/** Opening fence of the JSON state block (```json …). */
export const STATE_FENCE_OPEN = /```json/i;

// Parse LLM response to extract dialogue and state updates
export function parseResponse(rawResponse: string, companionName?: string): ParsedResponse {
	const raw = stripReasoning(rawResponse);
	let dialogue = raw.trim();
	let stateUpdates: Partial<StateUpdates> | null = null;
	let parseError: string | undefined;

	// Prefer a fenced ```json block; otherwise grab the first bare JSON object
	// that carries a state key (models that skip the fence).
	const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
	if (fenced) {
		const parsed = tryParseJson(fenced[1]);
		if (parsed) {
			stateUpdates = convertLLMOutput(parsed);
		} else {
			parseError = 'Failed to parse JSON state block';
			console.debug('Failed to parse LLM state updates:', fenced[1]);
		}
		// The prompt ends each reply with the JSON state block and allows no
		// spoken text after it. Content after the block (repeated sentences,
		// leaked instructions) is model drift — only the part before the block
		// is the reply. If the block sits at the start, fall back to the part
		// after it.
		const before = raw.slice(0, fenced.index ?? 0).trim();
		dialogue = before || raw.slice((fenced.index ?? 0) + fenced[0].length).trim();
	} else {
		const obj = findStateObject(raw);
		if (obj) {
			const parsed = tryParseJson(obj);
			if (parsed) {
				stateUpdates = convertLLMOutput(parsed);
				dialogue = raw.replace(obj, '').trim();
			}
		}
	}

	dialogue = cleanDialogue(dialogue, companionName);
	return { dialogue, stateUpdates, parseError };
}

// Convert LLM output format to our StateUpdates format
function convertLLMOutput(output: LLMStateOutput): Partial<StateUpdates> {
	const updates: Partial<StateUpdates> = {};

	// Convert mood change
	if (output.mood_change) {
		const emotion = normalizeEmotion(output.mood_change.emotion);
		if (emotion) {
			updates.moodChange = {
				emotion,
				intensityDelta: clampDelta(output.mood_change.intensity_delta, -30, 30)
			};
		}
	}

	// Convert stat deltas with bounds
	if (output.affection_delta !== undefined) {
		updates.affectionDelta = clampDelta(output.affection_delta, -20, 20);
	}

	if (output.trust_delta !== undefined) {
		updates.trustDelta = clampDelta(output.trust_delta, -10, 10);
	}

	if (output.intimacy_delta !== undefined) {
		updates.intimacyDelta = clampDelta(output.intimacy_delta, -10, 10);
	}

	if (output.comfort_delta !== undefined) {
		updates.comfortDelta = clampDelta(output.comfort_delta, -10, 10);
	}

	if (output.respect_delta !== undefined) {
		updates.respectDelta = clampDelta(output.respect_delta, -10, 10);
	}

	// Pass through memory and event suggestions
	if (output.new_memory && typeof output.new_memory === 'string') {
		updates.newMemory = output.new_memory.trim();
	}

	if (output.triggered_event && typeof output.triggered_event === 'string') {
		updates.triggeredEvent = output.triggered_event.trim();
	}

	const action = normalizeAction(output.action);
	if (action) updates.action = action;
	// neutral is no reaction at all, so it never flashes
	const expression = typeof output.expression === 'string' ? normalizeEmotion(output.expression) : null;
	if (expression && expression !== 'neutral') {
		updates.expression = expression;
	}

	return updates;
}

// Clamp a delta value
function clampDelta(value: number | undefined, min: number, max: number): number {
	if (value === undefined || isNaN(value)) return 0;
	return Math.max(min, Math.min(max, Math.round(value)));
}

// Clean up dialogue text
// State-block markers used to spot a truncated JSON block leaking into dialogue.
const STATE_BLOCK_START =
	/\{[^{}]*"(?:mood_change|affection_delta|trust_delta|intimacy_delta|comfort_delta|respect_delta|energy_delta|new_memory)"/i;

// Cut a trailing state block that was never closed (unterminated ```json fence,
// or a bare `{...` whose braces never balance) — the mark of a response truncated
// mid-JSON. Balanced blocks and ordinary prose with a stray brace are left alone.
function stripTruncatedStateBlock(text: string): string {
	// Unterminated ```json fence: an opener with no matching closing fence.
	const fence = text.search(/```json/i);
	if (fence !== -1 && !/```json[\s\S]*?```/i.test(text)) {
		return text.slice(0, fence).trimEnd();
	}

	// Bare block: find where a state object starts, then walk braces. If depth
	// never returns to zero, the block is truncated and everything from it is cut.
	const match = text.match(STATE_BLOCK_START);
	if (match?.index !== undefined) {
		let depth = 0;
		let balanced = false;
		for (const ch of text.slice(match.index)) {
			if (ch === '{') depth++;
			else if (ch === '}' && --depth === 0) {
				balanced = true;
				break;
			}
		}
		if (!balanced) return text.slice(0, match.index).trimEnd();
	}

	return text;
}

function cleanDialogue(text: string, companionName?: string): string {
	// Cut runaway output at a leaked stop token and drop stray template tokens.
	let cleaned = stripControlTokens(text);

	// Cut if the model kept going as the user / a narrator instead of replying.
	cleaned = cutHallucinatedTurn(cleaned, companionName);

	// Drop a trailing UNterminated state block first (small models truncated
	// mid-JSON): it has no closing ``` or `}`, so the closed-object cleaner below
	// would only fragment it and leave shards in the dialogue.
	cleaned = stripTruncatedStateBlock(cleaned);

	// Remove any leftover (closed) JSON-like content
	cleaned = cleaned.replace(/\{[^}]*"(?:mood|delta|emotion|action|expression)[^}]*\}/gi, '');

	// Remove action asterisks (we want dialogue only)
	cleaned = cleaned.replace(/\*[^*]+\*/g, '');

	// Remove stage directions in parentheses
	cleaned = cleaned.replace(/\([^)]*(?:smiles|laughs|sighs|blushes|looks|nods)[^)]*\)/gi, '');

	// Remove leading transcript/name labels only (e.g. "Luna: ", "User: "), NOT
	// arbitrary "Word:" prefixes — legit replies like "Note: ..." or
	// "Reminder: ..." must survive. Keyed on known labels + the companion's name.
	const labels = [...TRANSCRIPT_LABELS];
	if (companionName?.trim()) labels.push(companionName.trim());
	const labelRe = new RegExp(`^[ \\t]*(?:${labels.map(escapeRegExp).join('|')})[ \\t]*:[ \\t]*`, 'i');
	cleaned = cleaned
		.split('\n')
		.map((line) => line.replace(labelRe, ''))
		.join('\n');

	// Clean up whitespace
	cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
	cleaned = cleaned.trim();

	// If we stripped everything, return a fallback
	if (!cleaned) {
		cleaned = 'Hmm... *thinking*';
	}

	return cleaned;
}

// Validate state updates (sanity check)
export function validateStateUpdates(updates: Partial<StateUpdates>): {
	valid: boolean;
	sanitized: Partial<StateUpdates>;
	warnings: string[];
} {
	const warnings: string[] = [];
	const sanitized: Partial<StateUpdates> = {};

	// Validate mood change
	if (updates.moodChange) {
		if (VALID_EMOTIONS.includes(updates.moodChange.emotion)) {
			sanitized.moodChange = {
				emotion: updates.moodChange.emotion,
				intensityDelta: clampDelta(updates.moodChange.intensityDelta, -30, 30),
				cause: updates.moodChange.cause
			};
		} else {
			warnings.push(`Invalid emotion: ${updates.moodChange.emotion}`);
		}
	}

	// Validate numeric deltas
	if (updates.affectionDelta !== undefined) {
		if (Math.abs(updates.affectionDelta) > 50) {
			warnings.push(`Affection delta too large: ${updates.affectionDelta}`);
		}
		sanitized.affectionDelta = clampDelta(updates.affectionDelta, -20, 20);
	}

	if (updates.trustDelta !== undefined) {
		if (Math.abs(updates.trustDelta) > 20) {
			warnings.push(`Trust delta too large: ${updates.trustDelta}`);
		}
		sanitized.trustDelta = clampDelta(updates.trustDelta, -10, 10);
	}

	if (updates.intimacyDelta !== undefined) {
		sanitized.intimacyDelta = clampDelta(updates.intimacyDelta, -10, 10);
	}

	if (updates.comfortDelta !== undefined) {
		sanitized.comfortDelta = clampDelta(updates.comfortDelta, -10, 10);
	}

	if (updates.respectDelta !== undefined) {
		sanitized.respectDelta = clampDelta(updates.respectDelta, -10, 10);
	}

	// Pass through strings
	if (updates.newMemory) {
		sanitized.newMemory = updates.newMemory;
	}

	if (updates.triggeredEvent) {
		sanitized.triggeredEvent = updates.triggeredEvent;
	}

	if (updates.action !== undefined) {
		const action = normalizeAction(updates.action);
		if (action) sanitized.action = action;
		else warnings.push(`Invalid action: ${updates.action}`);
	}

	if (updates.expression !== undefined) {
		if (VALID_EMOTIONS.includes(updates.expression)) {
			sanitized.expression = updates.expression;
		} else {
			warnings.push(`Invalid expression: ${updates.expression}`);
		}
	}

	return {
		valid: warnings.length === 0,
		sanitized,
		warnings
	};
}

// Extract potential facts from response (for memory system)
export function extractPotentialFacts(dialogue: string, userMessage: string): string[] {
	const facts: string[] = [];

	// User self-statements (first person)
	const userSelfPatterns = [
		/\bI(?:'m| am)\s+(?:a |an )?([^.!?,]+)/gi,
		/\bmy (?:name|job|hobby|favorite|family) is\s+([^.!?,]+)/gi,
		/\bI (?:work|live|study) (?:at|in|as)\s+([^.!?,]+)/gi,
		/\bI (?:like|love|enjoy|hate|prefer)\s+([^.!?,]+)/gi
	];

	for (const pattern of userSelfPatterns) {
		let match;
		while ((match = pattern.exec(userMessage)) !== null) {
			const fact = match[match.length - 1].trim();
			if (fact.length > 2) {
				facts.push(`User: ${fact}`);
			}
		}
	}

	// AI perspective patterns (from dialogue)
	const aiPerspectivePatterns = [
		/you (?:are|work as|live in|like|love|enjoy|hate|prefer|have)\s+([^.!?]+)/gi,
		/your (?:name|job|favorite|hobby|family|home|work)\s+(?:is|are)\s+([^.!?]+)/gi,
		/you (?:said|mentioned|told me)\s+(?:that\s+)?([^.!?]+)/gi
	];

	for (const pattern of aiPerspectivePatterns) {
		let match;
		while ((match = pattern.exec(dialogue)) !== null) {
			facts.push(match[1].trim());
		}
	}

	// Look for companion statements about remembering
	const rememberPatterns = [
		/I(?:'ll)? remember (?:that )?([^.!?]+)/gi,
		/I(?:'ll)? keep that in mind[.!]?\s*([^.!?]*)/gi,
		/noted[!.]?\s*([^.!?]*)/gi
	];

	for (const pattern of rememberPatterns) {
		let match;
		while ((match = pattern.exec(dialogue)) !== null) {
			if (match[1].trim()) {
				facts.push(match[1].trim());
			}
		}
	}

	return facts.filter((f) => f.length > 5 && f.length < 200);
}

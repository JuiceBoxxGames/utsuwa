import {
	parsePseudoToolCalls,
	parseActionsEnvelope,
	parseXmlSpeakTags,
	parseXmlAttributes,
	findClosingBrace
} from './speech-compiler.ts';
import { stripThinkingBlocks } from '../../ai/thinking-blocks.ts';
import { STATE_FENCE_OPEN } from '../../ai/response-parser.ts';

/**
 * Official OmniVoice non-verbal markers (k2-fsa/OmniVoice docs). They are part
 * of the TTS text (rendered as expressive audio) but must never appear in the
 * visible chat bubble.
 */
const NON_VERBAL_MARKERS = [
	'laughter',
	'sigh',
	'confirmation-en',
	'question-en',
	'question-ah',
	'question-oh',
	'question-ei',
	'question-yi',
	'surprise-ah',
	'surprise-oh',
	'surprise-wa',
	'surprise-yo',
	'dissatisfaction-hnn'
];

const NON_VERBAL_RE = new RegExp(`\\[(?:${NON_VERBAL_MARKERS.join('|')})\\]`, 'gi');

// Legacy inline language/gesture markup. We only strip it from the visible
// text; it is never converted into speech segments (speak({...}) is the only
// supported syntax). Closing tags are tolerant: some models repeat the code
// in the closer (`[/lang:es]`, `</speak:es>`).
const SPEAK_BRACKET_RE = /\[lang:([a-zA-Z\-]{2,8})\]([\s\S]*?)\[\/lang(?::[a-zA-Z\-]{2,8})?\]/g;
const SPEAK_ANGLE_COLON_RE = /<speak:([a-zA-Z\-]{2,8})>([\s\S]*?)<\/speak(?::[a-zA-Z\-]{2,8})?>/g;
const SPEAK_ANGLE_EQUALS_RE = /<lang=([a-zA-Z\-]{2,8})>([\s\S]*?)<\/lang(?::[a-zA-Z\-]{2,8})?>/g;
const SPEAK_ANGLE_CODE_RE = /<lang\s+code=["']([a-zA-Z\-]{2,8})["']>([\s\S]*?)<\/lang(?::[a-zA-Z\-]{2,8})?>/g;
const GESTURE_ANGLE_COLON_RE = /<gesture:([a-zA-Z\-]+)>/g;
const GESTURE_BRACKET_RE = /\[gesture:([a-zA-Z\-]+)\]/g;
// Openers/closers left over after pair stripping — the model forgot the
// matching partner. Must not leak into speech or display.
const ORPHAN_LANG_TAG_RE = /\[\/?lang(?::[a-zA-Z\-]{2,8})?\]|<\/?lang(?::[a-zA-Z\-]{2,8})?>|<\/?speak(?::[a-zA-Z\-]{2,8})?>/g;

/** Strip non-verbal markers (e.g. [laughter]) from visible text. */
function stripNonVerbalMarkers(text: string): string {
	return text.replace(NON_VERBAL_RE, '');
}

/**
 * Some models emit section markers as angle brackets around the text
 * (`< Hier ist der Text >`) with empty `< >` separators instead of real XML
 * tags. Strip the brackets; real `<speak ...>` tags (no space after `<`) are
 * left untouched.
 */
export function stripAngleBlocks(text: string): string {
	return text
		.replace(/<\s+([^<>]+?)\s+>/g, '$1')
		.replace(/<\s*>\s*/g, ' ');
}

/** Strip legacy inline language/gesture markup, keeping the inner text. */
export function stripLegacyTags(text: string): string {
	let cleaned = text
		.replace(SPEAK_BRACKET_RE, '$2')
		.replace(SPEAK_ANGLE_COLON_RE, '$2')
		.replace(SPEAK_ANGLE_EQUALS_RE, '$2')
		.replace(SPEAK_ANGLE_CODE_RE, '$2');
	cleaned = cleaned.replace(GESTURE_ANGLE_COLON_RE, '').replace(GESTURE_BRACKET_RE, '');
	// Whatever lang/speak tags remain has lost its matching partner — drop it
	// so it is not spoken or displayed. Ordinary bracketed words stay intact.
	cleaned = cleaned.replace(ORPHAN_LANG_TAG_RE, '');
	return cleaned.replace(/  +/g, ' ').trim();
}

/** Replace complete `{"actions":[...]}` envelopes with their speak texts. */
function inlineActionsSpeakTexts(text: string): string {
	let result = text;
	const openerRe = /\{\s*"actions"\s*:/g;
	let m: RegExpExecArray | null;
	while ((m = openerRe.exec(result)) !== null) {
		const open = m.index;
		const close = findClosingBrace(result, open);
		if (close === null) continue;
		const { calls } = parseActionsEnvelope(result.slice(open, close + 1));
		const inline = calls
			.filter((c) => c.name === 'speak' && typeof c.arguments.text === 'string')
			.map((c) => String(c.arguments.text).trim())
			.filter(Boolean)
			.join(' ');
		result = result.slice(0, open) + inline + result.slice(close + 1);
		openerRe.lastIndex = open + inline.length;
	}
	return result;
}

/** Replace complete XML speech tags (`<speak text="..." />`) with their texts. */
function inlineXmlSpeakTexts(text: string): string {
	let result = text;
	const openRe = /<(speak|gesture|pause)\b/g;
	let m: RegExpExecArray | null;
	while ((m = openRe.exec(result)) !== null) {
		const name = m[1] as 'speak' | 'gesture' | 'pause';
		const gt = result.indexOf('>', m.index + m[0].length);
		if (gt === -1) continue;
		const tagInner = result.slice(m.index + m[0].length, gt);
		const attrs = parseXmlAttributes(tagInner);
		const selfClosing = /\/\s*$/.test(tagInner);
		const hasTextAttr = typeof attrs.text === 'string' && attrs.text.trim().length > 0;
		let tagEnd = gt + 1;
		let inner = '';
		if (!selfClosing && !hasTextAttr && name === 'speak') {
			const close = result.indexOf('</speak>', gt + 1);
			if (close === -1) continue;
			inner = result.slice(gt + 1, close);
			tagEnd = close + '</speak>'.length;
		}
		const inline = name === 'speak' ? (attrs.text ?? inner).replace(/\\"/g, '"') : '';
		result = result.slice(0, m.index) + inline + result.slice(tagEnd);
		openRe.lastIndex = m.index + inline.length;
	}
	// Some models emit only closing </speak> tags as section separators.
	return result.replace(/<\/speak>/g, ' ');
}

/**
 * Removes reasoning blocks (<thinking>, <thinking>…) so they never reach
 * speech or the chat. Stream-safe: a block that is still open (no closing
 * tag yet) is cut from its opener on, so partial reasoning never gets
 * spoken; a stray closing tag keeps only the text after it.
 *
 * Re-exported from ai/thinking-blocks.ts — reasoning tags are a property
 * of the model response format, not of speech synthesis.
 */
export { stripThinkingBlocks } from '../../ai/thinking-blocks.ts';

/**
 * Remove OmniVoice speech/gesture control markers from visible chat text.
 *
 * - `speak({...})` pseudo-calls: the spoken text is inlined, the syntax removed.
 * - `pause(...)` / `gesture(...)` calls are dropped.
 * - `{"actions":[...]}` JSON envelopes (some models emit them instead of
 *   speak() calls) are replaced by their speak texts.
 * - Legacy inline markup (`[lang:es]...[/lang]`, `<speak:es>...`, ...) is
 *   stripped, keeping the inner text.
 * - Non-verbal markers (`[laughter]`, `[sigh]`, ...) are removed from the
 *   display; they stay in the TTS text because the synthesis needs them.
 */
export interface CleanSpeechMarkersOptions {
	/**
	 * Keep ```json state fences intact (default: strip them).
	 * parseResponse() needs the fence to extract state updates and to cut
	 * the dialogue at the block — models sometimes repeat their whole reply
	 * after it. When the fence is stripped before parsing (as it must be
	 * for display and TTS), that cut has no anchor and the repeated reply
	 * survives in the dialogue.
	 */
	keepStateFences?: boolean;
}

export function cleanSpeechMarkers(
	text: string,
	options?: CleanSpeechMarkersOptions
): string {
	const noThinking = stripThinkingBlocks(text);
	const pseudo = parsePseudoToolCalls(noThinking);
	const withEnvelope = inlineActionsSpeakTexts(pseudo.cleanedText);
	const withXml = inlineXmlSpeakTexts(withEnvelope);
	const withLegacy = stripLegacyTags(stripNonVerbalMarkers(withXml));
	const withStateFences = options?.keepStateFences
		? withLegacy
		: withLegacy.replace(/```json[\s\S]*?```/gi, '');
	const textOnly = stripAngleBlocks(withStateFences).replace(/(?<=[.!?])\s+/g, ' ');
	// A model can emit the same reply once as native speech text and once as
	// plain text. Collapse an exact doubled block, but keep short repeats.
	const doubled = textOnly.match(/^([\s\S]{20,}?)\s+\1$/i);
	return doubled ? doubled[1].trim() : textOnly;
}

/**
 * Splits a raw streaming buffer at the first ```json state fence.
 *
 * The model writes its state block at the end of the reply; what follows
 * the fence is a post-state repeat, not dialogue. The live display must
 * freeze at the fence so the repeat never builds the message up twice —
 * the final parser cut replaces the message with the correct dialogue
 * anyway.
 */
export function cutAtStateFence(raw: string): { visible: string; capped: boolean } {
	const fenceIndex = raw.search(STATE_FENCE_OPEN);
	if (fenceIndex < 0) return { visible: raw, capped: false };
	return { visible: raw.slice(0, fenceIndex), capped: true };
}

/**
 * Aggregates streaming fragments into the visible chat text.
 *
 * `cleanSpeechMarkers()` trims every fragment it cleans, so naive
 * concatenation eats the whitespace that separated two fragments in the
 * raw stream ("¡Muy bien," + " mi vida!" → "¡Muy bien,mi vida!"). The
 * cleaner reconstructs exactly one separator space when the raw stream
 * had whitespace at the boundary; fragments split mid-word (tokenizer
 * artifacts) are rejoined without a separator because the raw boundary
 * had none. Fragments that clean to nothing (pure markup) contribute no
 * text but carry their boundary whitespace over to the next visible
 * fragment, mirroring the single space the full-text cleanup inserts
 * around removed markup.
 */
export class StreamingDisplayCleaner {
	private displayed = '';
	private boundarySpace = false;

	/**
	 * Feed one raw fragment that has passed the `hasIncompleteTrailingMarkup`
	 * gate; returns the current display text.
	 */
	push(rawFragment: string): string {
		const cleaned = cleanSpeechMarkers(rawFragment);
		if (cleaned !== '') {
			if (
				this.displayed !== '' &&
				!/\s$/.test(this.displayed) &&
				(this.boundarySpace || /^\s/.test(rawFragment))
			) {
				this.displayed += ' ';
			}
			this.displayed += cleaned;
			this.boundarySpace = /\s$/.test(rawFragment);
		} else {
			this.boundarySpace =
				this.boundarySpace || /^\s/.test(rawFragment) || /\s$/.test(rawFragment);
		}
		return this.displayed;
	}

	get text(): string {
		return this.displayed;
	}
}

/**
 * Returns true when `text` ends with an incomplete speak/pause/gesture call or
 * an incomplete legacy language tag. Used by the streaming delta cleaner to
 * decide whether it can flush the current chunk or needs to wait for more data.
 *
 * Parentheses and braces are balanced from the last call opener onwards,
 * skipping double-quoted strings, so a ")" or "}" inside the text argument
 * (e.g. `speak({"text":"(hallo"`) does not count as the closing delimiter.
 */
export function hasIncompleteTrailingMarkup(text: string): boolean {
	const trimmed = text.trimEnd();
	// Incomplete call: speak( ... without closing brace/paren
	const callRe = /(speak|pause|gesture)\s*\(/gi;
	let callMatch: RegExpExecArray | null;
	let lastCallStart: number | null = null;
	while ((callMatch = callRe.exec(trimmed)) !== null) {
		lastCallStart = callMatch.index + callMatch[0].length;
	}
	if (lastCallStart !== null) {
		let parenDepth = 1;
		let braceDepth = 0;
		let inString = false;
		for (let i = lastCallStart; i < trimmed.length; i++) {
			const ch = trimmed[i];
			// Skip escaped characters so \" does not toggle the string state.
			if (inString && ch === '\\') {
				i++;
				continue;
			}
			if (ch === '"') inString = !inString;
			else if (!inString && ch === '(') parenDepth++;
			else if (!inString && ch === ')') parenDepth--;
			else if (!inString && ch === '{') braceDepth++;
			else if (!inString && ch === '}') braceDepth--;
			if (!inString && parenDepth === 0 && braceDepth === 0) break;
		}
		if (parenDepth > 0 || braceDepth > 0) return true;
	}
	// Incomplete <lang ...> opening
	if (/<lang(\s+code=["']?)?$/i.test(trimmed)) return true;
	// Legacy bracket tag opened but not closed yet — wait for the closer so
	// the raw tag never appears in the flushed chunk.
	const bracketOpen = trimmed.lastIndexOf('[lang:');
	if (bracketOpen !== -1 && !/\[\/lang(?::[a-zA-Z\-]{2,8})?\]/.test(trimmed.slice(bracketOpen))) {
		return true;
	}
	// Incomplete {"actions":[...] JSON envelope
	if (/\{\s*"actions"\s*:/i.test(trimmed)) {
		let depth = 0;
		for (const ch of trimmed) {
			if (ch === '{') depth++;
			else if (ch === '}') depth--;
		}
		if (depth > 0) return true;
	}
	// Incomplete XML speech tag (<speak text="..." without closing >)
	if (/<(speak|gesture|pause)[a-z]*[^>]*$/.test(trimmed)) return true;
	// Unclosed code fence — while a ```json state block is still
	// streaming, its backticks and raw JSON would leak into the display
	// because cleanSpeechMarkers() only strips complete fences.
	const fences = (trimmed.match(/```/g) ?? []).length;
	if (fences % 2 === 1) return true;
	return false;
}

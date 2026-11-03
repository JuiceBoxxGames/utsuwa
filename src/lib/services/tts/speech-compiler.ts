import { parseToolCall } from './tool-definitions.ts';

export interface ToolCall {
	name: string;
	arguments: Record<string, unknown>;
}

export interface CompiledSegment {
	type: 'speak' | 'pause' | 'gesture';
	text?: string;
	language: string;
	durationMs?: number;
	gestureType?: string;
}

export interface CompilerResult {
	segments: CompiledSegment[];
}

/**
 * Validate raw tool calls from the LLM. Delegates argument parsing to the
 * shared schema validator and only adds the primary-language fallback here.
 */
export function validateCalls(calls: ToolCall[], primaryLanguage: string): ToolCall[] {
	const result: ToolCall[] = [];
	for (const c of calls) {
		const parsed = parseToolCall(c);
		if (!parsed) continue;

		if (parsed.name === 'speak') {
			parsed.arguments.lang = (parsed.arguments.lang as string | undefined) || primaryLanguage;
		}

		result.push(parsed);
	}
	return result;
}

const SENTENCE_TERMINATOR_RE = /[.!?…。！？]+[\s'")\]]*/g;

/**
 * Split long speak() calls at sentence boundaries.
 * Ensures early TTS start even with uncooperative LLMs.
 *
 * A speak with more than 2 sentences is broken into individual sentences.
 * Any trailing fragment without a terminator is preserved as its own segment
 * so no text is silently dropped.
 */
export function splitLongSegments(calls: ToolCall[]): ToolCall[] {
	const result: ToolCall[] = [];

	for (const call of calls) {
		if (call.name !== 'speak') {
			result.push(call);
			continue;
		}
		const text = String(call.arguments.text ?? '');
		const lang = String(call.arguments.lang ?? '');
		const terminators = Array.from(text.matchAll(SENTENCE_TERMINATOR_RE));

		if (terminators.length <= 2) {
			result.push(call);
			continue;
		}

		let lastIndex = 0;
		for (const match of terminators) {
			const endIndex = (match.index ?? 0) + match[0].length;
			const sentence = text.slice(lastIndex, endIndex).trim();
			if (sentence.length > 0) {
				result.push({ name: 'speak', arguments: { text: sentence, lang } });
			}
			lastIndex = endIndex;
		}

		// Preserve any trailing text that did not end with a terminator.
		const trailing = text.slice(lastIndex).trim();
		if (trailing.length > 0) {
			result.push({ name: 'speak', arguments: { text: trailing, lang } });
		}
	}
	return result;
}

function wordCount(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Merge consecutive speak() calls with the same language,
 * as long as total word count stays under ~15 words.
 *
 * The function never mutates the input calls; it only mutates copies it owns.
 */
export function mergeSegments(calls: ToolCall[]): ToolCall[] {
	const result: ToolCall[] = [];

	for (const call of calls) {
		if (call.name !== 'speak') {
			result.push({ ...call, arguments: { ...call.arguments } });
			continue;
		}

		const prev = result.length > 0 ? result[result.length - 1] : null;
		if (prev && prev.name === 'speak' && prev.arguments.lang === call.arguments.lang) {
			const combined = String(prev.arguments.text) + ' ' + String(call.arguments.text);
			if (wordCount(combined) <= 15) {
				prev.arguments = { ...prev.arguments, text: combined.trim() };
				continue;
			}
		}
		result.push({ ...call, arguments: { ...call.arguments } });
	}
	return result;
}

/**
 * Resolve undefined lang to primaryLanguage on every speak() call.
 */
export function resolveLanguage(calls: ToolCall[], primaryLanguage: string): ToolCall[] {
	return calls.map((c) => {
		if (c.name === 'speak' && !c.arguments.lang) {
			return { ...c, arguments: { ...c.arguments, lang: primaryLanguage } };
		}
		return c;
	});
}

/**
 * Convert validated and merged tool calls into CompiledSegments.
 */
export function compileSegments(calls: ToolCall[]): CompiledSegment[] {
	return calls.map((c) => {
		if (c.name === 'pause') {
			return {
				type: 'pause',
				language: '',
				durationMs: c.arguments.ms as number
			};
		}
		if (c.name === 'gesture') {
			return {
				type: 'gesture',
				language: '',
				gestureType: c.arguments.type as string,
				durationMs: 1500
			};
		}
		return {
			type: 'speak',
			text: c.arguments.text as string,
			language: c.arguments.lang as string
		};
	});
}

/**
 * Full compiler pipeline: validate → split → merge → resolve → compile.
 * Returns compiled segments and any errors.
 *
 * If no calls are provided, returns an empty segment list without errors. The
 * caller can fall back to compileFromText() if needed.
 */
export function compile(calls: ToolCall[], primaryLanguage: string): CompilerResult {
	if (!calls || calls.length === 0) {
		return { segments: [] };
	}

	const validated = validateCalls(calls, primaryLanguage);
	const split = splitLongSegments(validated);
	const merged = mergeSegments(split);
	const resolved = resolveLanguage(merged, primaryLanguage);
	const segments = compileSegments(resolved);

	return { segments };
}

/**
 * Fallback: treat the entire raw LLM text as a single speak() call in primaryLanguage.
 */
export function compileFromText(text: string, primaryLanguage: string): CompilerResult {
	if (!text || !text.trim()) {
		return { segments: [] };
	}
	return {
		segments: [{ type: 'speak', text: text.trim(), language: primaryLanguage }]
	};
}

export interface ParsedChunk {
	type: 'prose' | 'call';
	text?: string;
	call?: ToolCall;
}

export interface ParsedCalls {
	calls: ToolCall[];
	cleanedText: string;
	/** Ordered list of prose fragments and calls as they appeared in the text. */
	chunks: ParsedChunk[];
}

/**
 * Repair JavaScript-style object literals (unquoted keys, single quotes) so
 * they can be parsed as JSON. Models often emit `{ lang: "es", text: "..." }`
 * instead of strict JSON.
 *
 * The repair respects string boundaries so single quotes inside double-quoted
 * strings (e.g. `"...'perro'..."`) are kept intact.
 */
export function parseJsonArgs(raw: string): Record<string, unknown> {
	try {
		return JSON.parse(raw);
	} catch {
		const repaired = repairJsObjectLiteral(raw);
		try {
			return JSON.parse(repaired);
		} catch {
			return {};
		}
	}
}

function repairJsObjectLiteral(raw: string): string {
	let result = '';
	let i = 0;
	while (i < raw.length) {
		const ch = raw[i];

		// Whitespace passes through unchanged.
		if (/\s/.test(ch)) {
			result += ch;
			i++;
			continue;
		}

		// Unquoted object key at the start of the object or after {/,
		if (/[a-zA-Z_$]/.test(ch)) {
			const keyMatch = raw.slice(i).match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/);
			const trimmed = result.trim();
			if (
				keyMatch &&
				(trimmed === '' || trimmed.endsWith('{') || trimmed.endsWith(','))
			) {
				result += `"${keyMatch[1]}":`;
				i += keyMatch[1].length;
				while (i < raw.length && /\s/.test(raw[i])) i++;
				if (i < raw.length && raw[i] === ':') i++;
				continue;
			}
		}

		// Double-quoted string: copy as-is, but repair nested unescaped quotes
		// (e.g. a quoted foreign word inside the text) by escaping them.
		if (ch === '"') {
			const collected = copyDoubleQuotedString(raw, i);
			if (collected !== null) {
				result += collected.text;
				i = collected.end + 1;
				continue;
			}
		}

		// Single-quoted string: convert to double-quoted JSON. A quote only
		// closes when followed by a delimiter, so apostrophes stay content.
		if (ch === "'") {
			const end = findSingleQuoteClose(raw, i);
			if (end !== -1) {
				const content = raw.slice(i + 1, end);
				result += `"${content.replace(/"/g, '\\"')}"`;
				i = end + 1;
				continue;
			}
		}

		result += ch;
		i++;
	}
	return result;
}

/**
 * True when the double quote at `i` is a structural string boundary, i.e. the
 * next non-whitespace character is a JSON/JS delimiter: `}`, `)`, `]`, `:`,
 * or `,` that starts a new key (`,"key":`) or closes the object (`,}`).
 * Quotes followed by anything else are content (e.g. a quoted foreign word
 * inside the text) and must not terminate the string.
 */
function isStructuralQuote(text: string, i: number): boolean {
	let j = i + 1;
	while (j < text.length && /\s/.test(text[j])) j++;
	const next = text[j];
	if (next === '}' || next === ')' || next === ']' || next === ':') return true;
	if (next === ',') {
		let k = j + 1;
		while (k < text.length && /\s/.test(text[k])) k++;
		if (text[k] === '}' || text[k] === ']') return true;
		// A new key after the comma, quoted ("key":) or unquoted (key:).
		return /^"?([a-zA-Z_$][a-zA-Z0-9_$]*)"?\s*:/.test(text.slice(k));
	}
	return false;
}

/**
 * Copy a double-quoted string starting at `start` (which points at the
 * opening quote). Nested unescaped quotes that are not structural string
 * boundaries are escaped, so a text like `"Das Wort "ir" bedeutet gehen."`
 * becomes valid JSON. Returns the copied string including both quotes and
 * the index of the closing quote, or null when no structural close exists.
 */
function copyDoubleQuotedString(raw: string, start: number): { text: string; end: number } | null {
	let result = '"';
	let i = start + 1;
	while (i < raw.length) {
		const ch = raw[i];
		if (ch === '\\') {
			result += raw.slice(i, i + 2);
			i += 2;
			continue;
		}
		if (ch === '"') {
			if (isStructuralQuote(raw, i)) {
				return { text: result + '"', end: i };
			}
			result += '\\"';
			i++;
			continue;
		}
		result += ch;
		i++;
	}
	return null;
}

/**
 * A single quote closes a JS-style string only when the next non-whitespace
 * character is a delimiter (`,`, `:`, `}`, `)`). Apostrophes inside the text
 * (`'kochen'`, `l'osso`) are content, not string boundaries. `:` is included
 * so single-quoted object keys (`'text': ...`) parse correctly.
 */
function isSingleQuoteCloser(text: string, quoteIndex: number): boolean {
	let j = quoteIndex + 1;
	while (j < text.length && /\s/.test(text[j])) j++;
	const next = text[j];
	return next === ',' || next === ':' || next === '}' || next === ')';
}

/**
 * Find the closing quote of a single-quoted JS-style string starting at
 * `start` (which points at the opening quote). Returns the index of the
 * closing quote, or -1 when no valid closer exists. Escapes are honored.
 */
function findSingleQuoteClose(text: string, start: number): number {
	let escaped = false;
	for (let j = start + 1; j < text.length; j++) {
		if (escaped) {
			escaped = false;
			continue;
		}
		if (text[j] === '\\') {
			escaped = true;
			continue;
		}
		if (text[j] === "'" && isSingleQuoteCloser(text, j)) return j;
	}
	return -1;
}

/**
 * Skip a double-quoted string, returning the index of the closing quote.
 * Nested unescaped quotes that are not structural boundaries (e.g. a quoted
 * word inside the text) are treated as content, mirroring the repair in
 * copyDoubleQuotedString, so the brace scan stays aligned.
 */
function skipDoubleQuotedString(text: string, start: number): number {
	let escaped = false;
	for (let j = start + 1; j < text.length; j++) {
		if (escaped) {
			escaped = false;
			continue;
		}
		if (text[j] === '\\') {
			escaped = true;
			continue;
		}
		if (text[j] === '"' && isStructuralQuote(text, j)) return j;
	}
	return text.length - 1;
}

/**
 * Find the index of the closing brace that matches the first opening brace
 * after `start`, respecting strings and nested braces.
 *
 * Single-quoted strings only count as strings when their closing quote is
 * followed by a delimiter, so apostrophes inside the text (very common in
 * German/Spanish LLM output) do not break the scan.
 */
export function findClosingBrace(text: string, start: number): number | null {
	let depth = 0;
	let i = start;

	while (i < text.length) {
		const ch = text[i];
		if (ch === '"') {
			i = skipDoubleQuotedString(text, i);
			i++;
			continue;
		}
		if (ch === "'") {
			const close = findSingleQuoteClose(text, i);
			if (close !== -1) {
				i = close + 1;
				continue;
			}
		}
		if (ch === '{') {
			depth++;
		} else if (ch === '}') {
			depth--;
			if (depth === 0) return i;
		}
		i++;
	}
	return null;
}

export interface ScannedCall {
	name: 'speak' | 'pause' | 'gesture';
	args: Record<string, unknown>;
	rawArgsStr: string;
	startIndex: number;
	afterIndex: number;
	/**
	 * True when the closing paren was present in the scanned text. False means
	 * the call body is complete but the ")" is still streaming (afterIndex ends
	 * at "}"); streaming callers must hold such a call so the paren is not
	 * orphaned into the plaintext path.
	 */
	hasClosingParen: boolean;
}

/**
 * Scan raw LLM text for complete OmniVoice-style pseudo tool calls.
 * Returns parsed calls with absolute positions in the original text.
 * Incomplete calls (unmatched braces) are skipped so callers can decide
 * whether to wait for more streaming chunks.
 */
export function scanPseudoToolCalls(text: string): ScannedCall[] {
	const calls: ScannedCall[] = [];
	const callStartRe = /(speak|pause|gesture)\s*\(/g;
	let match: RegExpExecArray | null;

	while ((match = callStartRe.exec(text)) !== null) {
		const name = match[1] as ScannedCall['name'];
		const argsStart = match.index + match[0].length;
		const rest = text.slice(argsStart);
		const wsMatch = rest.match(/\S/);
		if (!wsMatch || wsMatch[0] !== '{') continue;

		const objStart = argsStart + wsMatch.index!;
		const argsEnd = findClosingBrace(text, objStart);
		if (argsEnd === null) continue;

		let after = argsEnd + 1;
		const parenMatch = text.slice(after).match(/^\s*\)/);
		if (parenMatch) after += parenMatch[0].length;

		const rawArgsStr = text.slice(objStart, argsEnd + 1);
		calls.push({
			name,
			args: parseJsonArgs(rawArgsStr),
			rawArgsStr,
			startIndex: match.index,
			afterIndex: after,
			hasClosingParen: parenMatch !== null
		});
		callStartRe.lastIndex = after;
	}

	return calls;
}

/**
 * Parse pseudo-tool-calls from raw LLM text output.
 *
 * This is a fallback for models that do not support native tool calling (R1).
 * The LLM is instructed to emit `speak({...})`, `pause({...})`,
 * `gesture({...})` as part of its text response. This function extracts those
 * calls and returns the cleaned display text.
 *
 * Handles quoted strings containing `}` and JavaScript-style object literals
 * with unquoted keys.
 *
 * Returns parsed ToolCalls and the cleaned text with calls removed.
 * If no calls are found, returns an empty calls array and the original text.
 */
export function parsePseudoToolCalls(text: string): ParsedCalls {
	const calls: ToolCall[] = [];
	const chunks: ParsedChunk[] = [];
	const parts: string[] = [];
	let lastIndex = 0;

	for (const scanned of scanPseudoToolCalls(text)) {
		const before = text.slice(lastIndex, scanned.startIndex).trim();
		if (before) {
			parts.push(before);
			chunks.push({ type: 'prose', text: before });
		}

		const call: ToolCall = { name: scanned.name, arguments: scanned.args };

		// Inline speak text into the cleaned display text so foreign-language
		// segments still appear in the chat bubble. Drop pause/gesture markers.
		if (scanned.name === 'speak' && typeof scanned.args.text === 'string') {
			parts.push(scanned.args.text);
		}

		calls.push(call);
		chunks.push({ type: 'call', call });
		lastIndex = scanned.afterIndex;
	}

	// Remaining text after last call
	const after = text.slice(lastIndex).trim();
	if (after) {
		parts.push(after);
		chunks.push({ type: 'prose', text: after });
	}

	return {
		calls,
		cleanedText: parts.join(' ').trim(),
		chunks
	};
}

/** Gesture types the speech prompt and the gesture_segment tool teach. */
export const GESTURE_TYPES = ['smile', 'laugh', 'surprise', 'nod', 'shake_head', 'wave'] as const;

/**
 * Convert a native tool call (speak_segment / pause_segment / gesture_segment)
 * to its inline pseudo-call text so the streaming speech buffer can process it
 * like model-written markup. Returns null for unknown tools or invalid args —
 * callers drop those silently. Keeping this lenient is intentional: a native
 * call arrives whole, so there is no chunk-boundary risk on this path.
 */
export function pseudoCallFromTool(name: string, args: Record<string, unknown> | null | undefined): string | null {
	if (!args) return null;
	if (name === 'speak_segment') {
		const text = typeof args.text === 'string' ? args.text : '';
		const lang = typeof args.language === 'string' ? args.language : '';
		return `speak({"text":${JSON.stringify(text)}${lang ? `,"lang":${JSON.stringify(lang)}` : ''}})`;
	}
	if (name === 'pause_segment') {
		// Finite numbers are clamped to the taught range (100-5000 ms) so a
		// pause intent survives; wrong-typed values drop the call entirely.
		const ms = typeof args.ms === 'number' && Number.isFinite(args.ms) ? Math.round(Math.min(5000, Math.max(100, args.ms))) : null;
		if (ms == null) return null;
		return `pause({"ms":${ms}})`;
	}
	if (name === 'gesture_segment') {
		// Validate against the taught gesture set: an unknown type would be
		// ignored by the avatar anyway and must not reach the pseudo-call path.
		const type = typeof args.type === 'string' ? args.type.trim() : '';
		if (!(GESTURE_TYPES as readonly string[]).includes(type)) return null;
		return `gesture({"type":${JSON.stringify(type)}})`;
	}
	return null;
}

/**
 * Parse the `{"actions":[{"function":"speak","args":{...}}]}` JSON envelope
 * some models emit instead of speak() pseudo-calls. Returns the extracted
 * tool calls and the text with the envelope removed. Never throws; an
 * incomplete envelope yields no calls and is left in place.
 */
export function parseActionsEnvelope(text: string): { calls: ToolCall[]; cleanedText: string; spans: Array<[number, number]> } {
	const calls: ToolCall[] = [];
	const spans: Array<[number, number]> = [];
	const openerRe = /\{\s*"actions"\s*:/g;
	let match: RegExpExecArray | null;

	while ((match = openerRe.exec(text)) !== null) {
		const openIndex = match.index;
		const closeIndex = findClosingBrace(text, openIndex);
		if (closeIndex === null) continue;

		const raw = text.slice(openIndex, closeIndex + 1);
		const parsed = parseJsonArgs(raw);
		const actions = parsed.actions;
		if (Array.isArray(actions)) {
			for (const action of actions) {
				if (!action || typeof action !== 'object') continue;
				const record = action as Record<string, unknown>;
				const name = String(record.function ?? record.name ?? '');
				const args = record.args;
				if (typeof args !== 'object' || args === null) continue;
				if (name === 'speak' || name === 'pause' || name === 'gesture') {
					calls.push({ name, arguments: args as Record<string, unknown> });
				}
			}
		}

		spans.push([openIndex, closeIndex + 1]);
	}

	// Remove spans in reverse order so indices stay valid.
	let cleaned = text;
	for (let i = spans.length - 1; i >= 0; i--) {
		cleaned = cleaned.slice(0, spans[i][0]) + ' ' + cleaned.slice(spans[i][1]);
	}

	return { calls, cleanedText: cleaned.replace(/\s+/g, ' ').trim(), spans };
}

/**
 * Parse XML-style attributes (`text="..."`, `lang="es"`, `type="smile"`),
 * honouring escaped quotes inside the values. Shared by the XML-tag parser and
 * the display cleaner.
 */
export function parseXmlAttributes(attrs: string): Record<string, string> {
	const result: Record<string, string> = {};
	const attrRe = /([a-zA-Z]+)\s*=\s*("([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)')/g;
	let m: RegExpExecArray | null;
	while ((m = attrRe.exec(attrs)) !== null) {
		const raw = m[3] ?? m[4] ?? '';
		result[m[1]] = raw.replace(/\\"/g, '"').replace(/\\'/g, "'");
	}
	return result;
}

export interface XmlTagParseResult {
	calls: ToolCall[];
	/** Text with all complete tags removed (prose around the tags kept). */
	cleanedText: string;
	/** Offset just past the last complete tag, relative to the input text. */
	endOffset: number;
	/** True when the last tag is incomplete (no closing `>` or `</speak>`). */
	incomplete: boolean;
	/** Offset of the incomplete tag start, or null when no incomplete tag. */
	incompleteStart: number | null;
	/** [start, end) spans of every complete tag, in source order. */
	spans: Array<[number, number]>;
}

export interface TagOpener {
	index: number;
	tag: string;
}

const TAG_NAMES = ['speak', 'gesture', 'pause'];

/**
 * Find the last `<`-opener that could be the start of an unfinished tag:
 * a `<` followed by a speak/gesture/pause name, a prefix of one still
 * streaming ("<spe"), or nothing yet (a trailing `<` or `< `). Spaced
 * `< Text >` section markers count too. `<3`, `x < 5`, `a < b` and `<space>`
 * are prose, not tags.
 */
export function findLastTagOpener(text: string): TagOpener | null {
	for (let i = text.length - 1; i >= 0; i--) {
		if (text[i] !== '<') continue;
		const next = text[i + 1];
		if (next !== undefined && next !== ' ' && !/[a-z]/i.test(next)) continue;
		const rest = text.slice(i + 1).trimStart();
		const name = (rest.match(/^[a-zA-Z]*/) ?? [''])[0].toLowerCase();
		const couldBeTag =
			name === rest
				? TAG_NAMES.some((tag) => tag.startsWith(name))
				: TAG_NAMES.some((tag) => name.startsWith(tag));
		// "< Text >" section markers open a section instead of comparing two things
		const opensSection =
			/^\s+\p{L}/u.test(text.slice(i + 1)) && /(?:^|[>.!?…。！？])$/.test(text.slice(0, i).trimEnd());
		if (!couldBeTag && !opensSection) continue;
		const letters = (text.slice(i + 1).match(/[a-zA-Z]*/) ?? [''])[0];
		return { index: i, tag: '<' + letters };
	}
	return null;
}

/**
 * Parse XML-style speech tags some models emit instead of speak() pseudo-calls:
 *
 *   <speak text="..." lang="es" />
 *   <speak lang="es" text="...">inner text</speak>
 *   <gesture type="smile" />
 *
 * Returns the extracted tool calls and the text with the tags removed. Never
 * throws; an incomplete trailing tag yields no calls for it and is left in
 * place.
 */
export function parseXmlSpeakTags(text: string): XmlTagParseResult {
	const calls: ToolCall[] = [];
	const spans: Array<[number, number]> = [];
	let endOffset = 0;
	let incomplete = false;
	let incompleteStart: number | null = null;

	const openRe = /<(speak|gesture|pause)[a-z]*/gi;
	let m: RegExpExecArray | null;
	while ((m = openRe.exec(text)) !== null) {
		const name = m[1] as 'speak' | 'gesture' | 'pause';
		const gt = text.indexOf('>', m.index + m[0].length);
		if (gt === -1) {
			incomplete = true;
			incompleteStart = m.index;
			break;
		}
		const tagInner = text.slice(m.index + m[0].length, gt);
		const attrs = parseXmlAttributes(tagInner);
		const selfClosing = /\/\s*$/.test(tagInner);
		// Some models open <speak text="..."> without `/>` and without a
		// closing tag; the text is complete inside the attribute, so the tag
		// is finished at `>`.
		const hasTextAttr = typeof attrs.text === 'string' && attrs.text.trim().length > 0;
		let tagEnd = gt + 1;
		let innerText = '';

		if (!selfClosing && !hasTextAttr && name === 'speak') {
			const close = text.indexOf('</speak>', gt + 1);
			if (close === -1) {
				incomplete = true;
				incompleteStart = m.index;
				break;
			}
			innerText = text.slice(gt + 1, close);
			tagEnd = close + '</speak>'.length;
		}

		let createdCall = false;
		if (name === 'speak') {
			const value = (attrs.text ?? innerText).replace(/\\"/g, '"');
			if (value.trim()) {
				calls.push({ name: 'speak', arguments: { text: value, lang: attrs.lang } });
				createdCall = true;
			}
		} else if (name === 'pause' && attrs.ms !== undefined) {
			const ms = Number(attrs.ms);
			if (!Number.isNaN(ms)) {
				calls.push({ name: 'pause', arguments: { ms } });
				createdCall = true;
			}
		} else if (attrs.type) {
			calls.push({ name: 'gesture', arguments: { type: attrs.type } });
			createdCall = true;
		}

		// Only record the span when it produced a call, so `spans` stays
		// aligned with `calls` (M-1: interleaving relies on the pairing).
		if (createdCall) {
			spans.push([m.index, tagEnd]);
		}
		endOffset = Math.max(endOffset, tagEnd);
	}

	// Remove spans in reverse order so indices stay valid.
	let cleaned = text;
	for (let i = spans.length - 1; i >= 0; i--) {
		cleaned = cleaned.slice(0, spans[i][0]) + ' ' + cleaned.slice(spans[i][1]);
	}

	// Any "<letter" opener after the last complete tag might be a tag name in
	// progress (<g, <spe) that streaming has not finished yet. Hold it so raw
	// fragments are never spoken; the incomplete tail must not count as prose.
	if (!incomplete) {
		const lastAny = findLastTagOpener(text);
		if (lastAny && lastAny.index >= endOffset) {
			const gt = text.indexOf('>', lastAny.index);
			if (gt === -1) {
				incomplete = true;
				incompleteStart = lastAny.index;
			}
		}
	}

	// The incomplete tail (from the last unfinished tag on) must not count as
	// prose: the caller holds it back until the tag completes. Prose after a
	// complete tag stays.
	if (incompleteStart !== null) {
		let removedBefore = 0;
		for (const [s, e] of spans) {
			if (e <= incompleteStart) removedBefore += e - s;
		}
		cleaned = cleaned.slice(0, incompleteStart - removedBefore);
	}

	return {
		calls,
		cleanedText: cleaned.replace(/\s+/g, ' ').trim(),
		endOffset,
		incomplete,
		incompleteStart,
		spans
	};
}

import type { SpeechSegment } from '../voice-orchestrator.ts';
import {
	scanPseudoToolCalls,
	parseJsonArgs,
	parseActionsEnvelope,
	parseXmlSpeakTags,
	findLastTagOpener,
	splitLongSegments,
	findClosingBrace,
	type ToolCall
} from './speech-compiler.ts';
import { parseToolCall } from './tool-definitions.ts';
import { stripAngleBlocks, cleanSpeechMarkers } from './chat-text.ts';
import { splitIntoSegments, stripSpeechArtifacts, stripForSpeech, hasStateBlockFragment } from '../../utils/sentences.ts';

export interface StreamingSpeechBufferOptions {
	defaultLanguage?: string;
	streaming?: boolean;
	onSegment: (segment: SpeechSegment) => void;
}

/** Word cap for merging adjacent same-language segments (mirrors the compiler). */
const MAX_MERGE_WORDS = 15;

function wordCount(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Offset just past the last complete `{"actions":[...]}` envelope in `text`. */
function findEnvelopeEnd(text: string): number {
	const openerRe = /\{\s*"actions"\s*:/g;
	let end = 0;
	let m: RegExpExecArray | null;
	while ((m = openerRe.exec(text)) !== null) {
		const close = findClosingBrace(text, m.index);
		if (close !== null) end = close + 1;
	}
	return end;
}

/** True when the last `{"actions"` opener has no matching closing brace yet. */
function hasIncompleteActionsEnvelope(text: string): boolean {
	const openerRe = /\{\s*"actions"\s*:/g;
	let lastOpen = -1;
	let m: RegExpExecArray | null;
	while ((m = openerRe.exec(text)) !== null) lastOpen = m.index;
	if (lastOpen === -1) return false;
	return findClosingBrace(text, lastOpen) === null;
}

/** True when the text ends inside an unfinished `<speak`/`<gesture` tag. */
function hasIncompleteXmlTag(text: string): boolean {
	const trimmed = text.trimEnd();
	const lastOpen = findLastTagOpener(trimmed);
	if (!lastOpen) return false;
	// Incomplete when the tag has no closing '>' yet, or an open <speak> has
	// no text attribute and no matching </speak>.
	const gt = trimmed.indexOf('>', lastOpen.index);
	if (gt === -1) return true;
	const tagInner = trimmed.slice(lastOpen.index + lastOpen.tag.length, gt);
	// Angle-bracket sections like "< Hier ist der Text >" are NOT tags: only
	// real tag names (speak/gesture/pause prefixes) count as markup.
	if (!/^(spea?k|ges|pau)/i.test(tagInner.trimStart())) return false;
	const selfClosing = /\/\s*$/.test(tagInner);
	if (selfClosing) return false;
	// <speak text="..." without `/>` is complete: the text sits in the attribute.
	const hasTextAttr = /(?:^|\s)text\s*=\s*["']/.test(tagInner);
	if (hasTextAttr) return false;
	if (trimmed.slice(lastOpen.index).startsWith('<gesture')) return false;
	return trimmed.indexOf('</speak>', gt + 1) === -1;
}

/**
 * Buffers streaming LLM text and emits SpeechSegments as soon as complete
 * sentences are available. A flush timer ensures trailing text without a
 * sentence terminator is still emitted after a short timeout.
 *
 * For OmniVoice the buffer also recognises language-marked tool calls of the
 * form `speak({"text":"...","lang":"xx"})`. Complete calls are emitted
 * immediately; incomplete call syntax suppresses the plaintext flush timer so
 * raw syntax is never spoken.
 */
export class StreamingSpeechBuffer {
	private buffer = '';
	private emittedLength = 0;
	// Tracks depth of curly braces so JSON state-update blocks that span
	// multiple streaming chunks are held back from TTS until fully received.
	private jsonDepth = 0;
	// True while a double-quoted string value is open inside the JSON state
	// tracking, so braces inside string values (e.g. {"text":"{hello}"}) are
	// not counted and cannot leave the depth wrong. Kept across chunks because
	// strings can be split by the stream.
	private jsonStringOpen = false;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly FLUSH_TIMEOUT_MS = 1500;
	private readonly options: StreamingSpeechBufferOptions;

	constructor(options: StreamingSpeechBufferOptions) {
		this.options = options;
	}

	feed(chunk: string): void {
		// Track curly-brace depth across chunks so we never emit text that is
		// inside an open JSON state-update block. Braces inside double-quoted
		// string values are ignored so e.g. {"text":"{hello}"} does not leave
		// the depth wrong and block TTS for the following text.
		for (let i = 0; i < chunk.length; i++) {
			const ch = chunk[i];
			if (this.jsonStringOpen) {
				if (ch === '\\') i++;
				else if (ch === '"') this.jsonStringOpen = false;
			} else if (ch === '"') {
				this.jsonStringOpen = true;
			} else if (ch === '{') {
				this.jsonDepth++;
			} else if (ch === '}') {
				// Never go negative on a stray '}' (m1): an unmatched closing
				// brace must not flip the depth into a blocking state.
				if (this.jsonDepth > 0) this.jsonDepth--;
			}
		}
		this.buffer += chunk;

		// Markup mode takes precedence: once we see speak(/pause(/gesture(
		// calls we only emit complete markup and never fall back to sentence-based
		// plaintext emission, which would speak raw syntax.
		if (this.tryEmitLanguageCalls()) {
			this.compact();
			// Arm the flush timer so trailing content after a complete speak()
			// call is spoken even if no further chunks arrive (e.g. at stream end).
			this.armFlushTimer();
			return;
		}

		this.tryEmit();
		this.compact();
		this.armFlushTimer();
	}

	// The timer flushes with final=false and holds incomplete markup for later
	// chunks. Half-speaking it there got it spoken twice (#319). The
	// end-of-stream flush speaks what it can and consumes everything.
	flush(final = true): void {
		this.tryEmitLanguageCalls();
		if (!final && this.hasIncompleteMarkup(this.buffer.slice(this.emittedLength))) {
			this.clearFlushTimer();
			return;
		}
		let remaining = this.buffer.slice(this.emittedLength).trim();

		// Remove any complete actions envelopes left over (e.g. empty ones with
		// no speak actions) so their JSON is never spoken.
		remaining = parseActionsEnvelope(remaining).cleanedText;

		// If the tail contains incomplete markup (a truncated speak() call that
		// was still streaming when the stream ended), extract whatever speakable
		// text is already there instead of discarding the whole fragment (H3).
		let speakable = remaining;
		if (this.hasIncompleteMarkup(speakable)) {
			speakable = this.extractIncompleteSpeakText(speakable);
		}

		// Only speak remaining plaintext if it does not contain raw or incomplete
		// markup syntax. Anything that looks like a call or tag has already been
		// handled; leftover fragments are discarded. A fragment without any
		// letter or digit (e.g. a bare opening punctuation) is never speakable.
		// The bare-name drop is case-sensitive on purpose: the taught call
		// syntax is lowercase, while a capitalized word (German "Pause") is
		// legitimate prose and must survive.
		speakable = speakable.replace(/(?:^|[\s(>"'¿¡])(?:speak|pause|gesture)\s*$/, '');
		// An unclosed "{" means an incomplete JSON block (e.g. a state block
		// the stream ended inside) — never speakable prose.
		if (speakable && !this.hasIncompleteMarkup(speakable) && !/\{[^{}]*$/.test(speakable)) {
			const { cleaned } = stripForSpeech(speakable);
			// A fragment without any letter or digit (e.g. a bare "{" left
			// over from a stripped fence label) is never speakable.
			if (cleaned && /[\p{L}\p{N}]/u.test(cleaned)) {
				for (const seg of splitIntoSegments(
					stripAngleBlocks(cleaned.trim().replace(/<\/speak>/g, ' ')),
					this.options.defaultLanguage
				)) {
					// State-block fragments (e.g. a JSON block the model wrote
					// without outer braces) must never be spoken.
					if (hasStateBlockFragment(seg.text)) continue;
					this.options.onSegment(seg);
				}
			}
		}

		this.emittedLength = this.buffer.length;

		this.clearFlushTimer();
	}

	/**
	 * Pull the speakable text out of a truncated speak() call that was still
	 * streaming at end-of-stream, e.g. `speak({"text":"Hallo` -> `Hallo`.
	 * This stops the last sentence from being silently dropped (H3).
	 */
	private extractIncompleteSpeakText(text: string): string {
		// Match a trailing incomplete speak/pause/gesture call and pull out the
		// `text:"..."` value already present. scanPseudoToolCalls skips
		// incomplete calls, so we parse the fragment directly.
		//
		// Handles both orderings:
		//   speak({"text":"Hallo, wie geht es dir
		//   speak({"lang":"es","text":"Hallo
		//   speak({"text":"Hallo","lang":"es"  (text closed, more keys follow)
		const incompleteCallRe = /(?:speak|pause|gesture)\s*\(\s*\{[^{}]*"text"\s*:\s*"([^"]*)/;
		const m = incompleteCallRe.exec(text);
		if (m && m[1]) return m[1];
		// Fallback: strip an incomplete call opener that has no text value yet.
		const noText = /(?:speak|pause|gesture)\s*\(\s*\{[^{}]*$/;
		if (noText.test(text)) return '';
		// A bare call name at end-of-stream is an aborted call opener (the
		// paren never arrived), not legitimate prose — drop it but keep any
		// prose before it.
		return text.replace(/(?:^|[\s(>"'¿¡])(?:speak|pause|gesture)\s*$/i, '');
	}

	reset(): void {
		this.buffer = '';
		this.emittedLength = 0;
		this.jsonDepth = 0;
		this.jsonStringOpen = false;
		this.clearFlushTimer();
	}

	/**
	 * Trim the already-processed prefix from the buffer. This keeps the buffer
	 * size bounded during long OmniVoice streams, so parsePseudoToolCalls() does
	 * not re-scan text that has already been emitted.
	 */
	private compact(): void {
		if (this.emittedLength <= 0) return;
		this.buffer = this.buffer.slice(this.emittedLength);
		this.emittedLength = 0;
	}

	private tryEmit(): void {
		this.clearFlushTimer();

		let unprocessed = this.buffer.slice(this.emittedLength);
		while (unprocessed.length > 0) {
			const before = this.emittedLength;
			this.tryEmitBlock(unprocessed);
			if (this.emittedLength === before) break; // no sentence boundary found
			unprocessed = this.buffer.slice(this.emittedLength);
		}

		if (this.emittedLength < this.buffer.length) {
			this.armFlushTimer();
		}
	}

	private armFlushTimer(): void {
		if (this.flushTimer) return;
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			this.flush(false);
		}, this.FLUSH_TIMEOUT_MS);
	}

	private clearFlushTimer(): void {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
	}

	private emit(block: string): void {
		const { cleaned } = stripForSpeech(block);
		for (const seg of splitIntoSegments(
			// cleanSpeechMarkers also runs on the plaintext path so legacy
			// inline language markup ("[lang:es]…[/lang]") never reaches TTS —
			// the envelope paths clean it, this path did not.
			stripAngleBlocks(cleanSpeechMarkers(cleaned.replace(/<\/speak>/g, ' '))),
			this.options.defaultLanguage
		)) {
			// State-block fragments must never be spoken, even when they reach
			// the plaintext path with a sentence boundary.
			if (hasStateBlockFragment(seg.text)) continue;
			this.options.onSegment(seg);
		}
	}

	private tryEmitBlock(text: string): void {
		// While we are inside an open JSON state-update block, do not emit anything
		// that follows the opening brace. Content before the brace is still safe to
		// emit (e.g. a completed sentence before a state-update block starts).
		if (this.jsonDepth > 0) {
			const braceIndex = text.indexOf('{');
			if (braceIndex <= 0) return;
			text = text.slice(0, braceIndex);
		}

		// A trailing run of backticks may be an incomplete code fence whose
		// language label arrives in the next chunk ("```" then "json"). A
		// partial label must also be held ("```j" may complete to "```json"),
		// otherwise stripping it now orphans the label remainder ("son") and
		// speaks it as a stray word. It is excluded from the artifact pass and
		// kept in the buffer.
		const trailingFence = /`{3,}[a-zA-Z]*\s*$/.exec(text);
		const fenceTail = trailingFence ? text.slice(trailingFence.index) : '';
		const body = trailingFence ? text.slice(0, trailingFence.index) : text;

		// Strip any completed JSON state-update block(s) from the current tail.
		// Use the non-trimming variant so trailing whitespace is preserved for the
		// next streaming chunk. Angle-bracket sections (< Text >) are unwrapped
		// here, before sentence splitting would cut them apart.
		let { cleaned } = stripSpeechArtifacts(body);
		cleaned = stripAngleBlocks(cleaned);
		if (cleaned !== body) {
			this.buffer = this.buffer.slice(0, this.emittedLength) + cleaned + fenceTail;
			text = cleaned;
		} else {
			text = body;
		}

		const paraBreak = text.indexOf('\n\n');
		if (paraBreak > 0) {
			const block = text.slice(0, paraBreak);
			if (block.trim()) {
				this.emit(block);
				this.emittedLength += paraBreak + 2;
			}
			return;
		}

		const singleBreak = text.indexOf('\n');
		if (singleBreak > 0) {
			const block = text.slice(0, singleBreak);
			if (block.trim()) {
				this.emit(block);
				this.emittedLength += singleBreak + 1;
			}
			return;
		}

		// Emit up to the first sentence boundary so TTS can start immediately.
		const sentenceEnd = /([.!?…。！？])\s*/;
		const m = sentenceEnd.exec(text);
		if (!m) return;

		const firstEnd = m.index + m[0].length;
		const block = text.slice(0, firstEnd);
		if (block.trim()) {
			this.emit(block);
			this.emittedLength += firstEnd;
		}
	}

	/**
	 * Scans the unprocessed buffer for complete OmniVoice-style tool calls
	 * (`speak(...)`, `pause(...)`, `gesture(...)`). Emits each complete speak
	 * call as a SpeechSegment, emits plaintext that precedes a complete call,
	 * and advances `emittedLength` past consumed content.
	 *
	 * Returns `true` when the buffer is in tool-call mode, i.e. when at least
	 * one complete call was emitted or an incomplete call opening remains. In
	 * that mode the caller must not fall back to plaintext sentence emission.
	 */
	private tryEmitLanguageCalls(): boolean {
		const unprocessed = this.buffer.slice(this.emittedLength);
		const scanned = scanPseudoToolCalls(unprocessed);

		// Segments are collected per group: plaintext blocks and individual
		// speak() calls each form a group. Parts of a long call are never merged
		// with each other (the split exists so the first sentence starts early),
		// but adjacent groups with the same language are merged when the combined
		// text stays small, so isolated short words are synthesised as longer,
		// more stable input.
		const groups: SpeechSegment[][] = [];

		let consumed = 0;
		for (const call of scanned) {
			if (!call.hasClosingParen) {
				// Call body complete but the closing paren is still streaming:
				// hold it so the ")" is consumed together with the call and
				// does not leak into the plaintext path as a stray segment.
				break;
			}
			const before = unprocessed.slice(consumed, call.startIndex).trim();
			// A complete XML speak tag sitting before the call opener is
			// consumed by the XML pass below — defer the call so the tag is
			// not spoken as raw syntax inside the call's before-plaintext.
			if (before && /<(?:speak|gesture|pause)[a-z]*/i.test(before)) {
				break;
			}
			if (before) {
				// A dangling "<" + optional call-name prefix right before the
				// call opener is the leftover of a mixed "<speak({...})"
				// syntax or an unfinished tag — never speakable prose.
				const speakableBefore = before.replace(/<(?:s|sp|spe|spea|p|pa|pau|paus|g|ge|ges|gest|gestu|gestur)?$/i, '').trim();
				if (speakableBefore) {
					groups.push(this.segmentsFromPlaintext(speakableBefore));
				}
			}
			if (call.name === 'speak') {
				groups.push(this.segmentsFromToolCall(call.rawArgsStr));
			}
			consumed = call.afterIndex;
		}

		// Some models emit a {"actions":[{"function":"speak","args":{...}}]}
		// JSON envelope instead of speak() pseudo-calls. Parse complete
		// envelopes; an incomplete envelope holds the buffer in markup mode so
		// the raw JSON is never spoken.
		let markupEnd = consumed;
		let envelopeIncomplete = false;
		const envelope = parseActionsEnvelope(unprocessed.slice(consumed));
		if (envelope.calls.length > 0) {
			// Interleave prose and envelope calls in their original order so
			// prose before the envelope precedes the calls and prose after the
			// last envelope follows them (order inversion fix).
			let cursor = 0;
			for (let i = 0; i < envelope.calls.length; i++) {
				const span = envelope.spans[i];
				const before = cleanSpeechMarkers(unprocessed.slice(consumed + cursor, consumed + (span ? span[0] : envelope.spans[envelope.spans.length - 1][1])).trim());
				if (before) {
					groups.push(this.segmentsFromPlaintext(before));
				}
				const validated = parseToolCall(envelope.calls[i]);
				if (validated) {
					groups.push(this.segmentsFromParsedToolCall(validated));
				}
				cursor = span ? span[1] : cursor;
			}
			const lastSpanEnd = envelope.spans.length > 0 ? envelope.spans[envelope.spans.length - 1][1] : cursor;
			const tail = unprocessed.slice(consumed + lastSpanEnd);
			// Mirror of the XML guard: don't advance past incomplete markup or a
			// truncated call-name prefix ("spea" from "speak(" still streaming).
			const incompleteMatch = tail.match(/<(?:speak|pause|gesture)|(?:speak|pause|gesture)\s*\(/);
			const openerPrefix = /(?:^|[\s(>"'¿¡])(?:s|sp|spe|spea|p|pa|pau|paus|g|ge|ges|gest|gestu|gestur)$/i.exec(tail);
			const proseEnd = Math.min(
				incompleteMatch ? incompleteMatch.index! : tail.length,
				openerPrefix && openerPrefix.index != null ? openerPrefix.index : tail.length
			);
			const after = cleanSpeechMarkers(tail.slice(0, proseEnd).trim());
			if (after) {
				groups.push(this.segmentsFromPlaintext(after));
			}
			markupEnd = consumed + lastSpanEnd + proseEnd;
		} else if (hasIncompleteActionsEnvelope(unprocessed.slice(consumed))) {
			envelopeIncomplete = true;
		}

		// Some models emit XML-style tags (<speak text="..." lang="es" />,
		// <gesture type="smile" />) instead of speak() pseudo-calls. Parse
		// complete tags; an incomplete tag holds the buffer in markup mode so
		// the raw XML is never spoken.
		let xmlIncomplete = false;
		const xml = parseXmlSpeakTags(unprocessed.slice(markupEnd));
		if (xml.calls.length > 0) {
			// Interleave prose and tag calls in their original order so trailing
			// prose is not spoken before the preceding tag text (order inversion).
			const xmlSlice = unprocessed.slice(markupEnd);
			let cursor = 0;
			for (let i = 0; i < xml.calls.length; i++) {
				const span = xml.spans[i];
				const before = cleanSpeechMarkers(xmlSlice.slice(cursor, span ? span[0] : xmlSlice.length).trim());
				if (before) {
					groups.push(this.segmentsFromPlaintext(before));
				}
				const validated = parseToolCall(xml.calls[i]);
				if (validated) {
					groups.push(this.segmentsFromParsedToolCall(validated));
				}
				cursor = span ? span[1] : cursor;
			}
			// Prose after the last complete tag — but never past an incomplete
			// tag's start (its raw syntax must stay held for the next chunk), a
			// truncated call-name prefix ("spea" from "speak(" still streaming)
			// or an incomplete call opener ("speak(" / "speak({..."), so none of
			// them is spoken prematurely.
			let afterEnd = xml.incomplete && xml.incompleteStart != null ? xml.incompleteStart : xmlSlice.length;
			const afterProse = xmlSlice.slice(cursor, afterEnd);
			const openerStart = /(?:^|[\s(>"'¿¡])(?:(?:s|sp|spe|spea|p|pa|pau|paus|g|ge|ges|gest|gestu|gestur)|(?:speak|pause|gesture)\s*\((?:\s*\{[^{}]*)?)$/i.exec(afterProse);
			if (openerStart && openerStart.index != null) {
				afterEnd = cursor + openerStart.index;
			}
			const after = cleanSpeechMarkers(xmlSlice.slice(cursor, afterEnd).trim());
			if (after) {
				groups.push(this.segmentsFromPlaintext(after));
			}
			// Advance past all complete tags AND any prose emitted before an
			// incomplete tag, so neither is re-emitted on the next pass (M-1).
			if (xml.incomplete && xml.incompleteStart != null) {
				markupEnd = markupEnd + Math.min(xml.incompleteStart, afterEnd);
			} else {
				markupEnd = markupEnd + Math.min(xml.endOffset, afterEnd);
				const tail = unprocessed.slice(markupEnd);
				if (
					!hasIncompleteXmlTag(tail) &&
					!/(?:speak|pause|gesture)\s*\(/.test(tail) &&
					!/(?:^|[\s(>"'¿¡])(?:s|sp|spe|spea|p|pa|pau|paus|g|ge|ges|gest|gestu|gestur)$/i.test(tail)
				) {
					markupEnd = unprocessed.length;
				}
			}
		} else if (xml.incomplete || hasIncompleteXmlTag(unprocessed.slice(markupEnd))) {
			xmlIncomplete = true;
		}

		this.emittedLength += markupEnd;
		this.emitMergedGroups(groups);

		const remaining = this.buffer.slice(this.emittedLength);
		const hasIncompletePattern =
			/(?:speak|pause|gesture)\s*\(/.test(remaining) ||
			hasIncompleteActionsEnvelope(remaining) ||
			hasIncompleteXmlTag(remaining);

		return (
			scanned.length > 0 ||
			markupEnd > consumed ||
			envelopeIncomplete ||
			xmlIncomplete ||
			hasIncompletePattern
		);
	}

	/** Split plaintext into sentence segments with the default language. */
	private segmentsFromPlaintext(block: string): SpeechSegment[] {
		const { cleaned } = stripForSpeech(block);
		return splitIntoSegments(
			stripAngleBlocks(cleaned.replace(/<\/speak>/g, ' ')),
			this.options.defaultLanguage
		).filter((seg) => !hasStateBlockFragment(seg.text));
	}

	/** Parse a complete speak() call into one or more segments. */
	private segmentsFromToolCall(argsStr: string): SpeechSegment[] {
		const args = parseJsonArgs(argsStr);
		const parsed = parseToolCall({ name: 'speak', arguments: args });
		if (!parsed || parsed.name !== 'speak') return [];
		return this.segmentsFromParsedToolCall(parsed);
	}

	/**
	 * Convert a validated speak() tool call into one or more segments. Long
	 * calls are split at sentence boundaries so the first sentence can be
	 * synthesised immediately.
	 *
	 * Language correction is intentionally not done here: the orchestrator
	 * re-validates and splits every segment against the session's ELD subset
	 * (validateAndSplitSegment), which is the single arbiter for the final
	 * voice. Pre-tagging in the buffer was provisional work that the
	 * orchestrator always re-decided.
	 */
	private segmentsFromParsedToolCall(parsed: ToolCall): SpeechSegment[] {
		if (parsed.name !== 'speak') return [];
		const { text: rawText, lang } = parsed.arguments as { text?: string; lang?: string };
		const text = (rawText ?? '').trim();
		if (!text) return [];
		const primary = this.options.defaultLanguage || 'de';
		const language = lang || primary;

		const split = splitLongSegments([{ name: 'speak', arguments: { text, lang: language } }]);
		return split
			.map((call) => ({ text: String(call.arguments.text ?? '').trim(), language }))
			.filter((seg) => seg.text.length > 0);
	}

	/**
	 * Emit all segments of one emission pass. Adjacent groups (plaintext blocks
	 * and speak() calls) with the same language are merged at their boundary up
	 * to MAX_MERGE_WORDS; segments within a group are never merged.
	 */
	private emitMergedGroups(groups: SpeechSegment[][]): void {
		const out: SpeechSegment[] = [];
		for (const group of groups) {
			if (group.length === 0) continue;

			let first: SpeechSegment | null = group[0];
			const prev = out.length > 0 ? out[out.length - 1] : null;
			if (prev && prev.language === first.language) {
				const combined = prev.text + ' ' + first.text;
				if (wordCount(combined) <= MAX_MERGE_WORDS) {
					out[out.length - 1] = { ...prev, text: combined.trim() };
					first = null;
				}
			}
			if (first) out.push(first);
			for (let i = 1; i < group.length; i++) out.push(group[i]);
		}
		for (const seg of out) this.options.onSegment(seg);
	}

	private hasIncompleteMarkup(text: string): boolean {
		return (
			/(?:speak|pause|gesture)\s*\(/.test(text) ||
			hasIncompleteActionsEnvelope(text) ||
			hasIncompleteXmlTag(text) ||
			// Trailing naked backticks or a partial fence label ("```j"): the
			// fence label may arrive in the next chunk, so the text is not yet
			// safe to flush.
			/`{3,}[a-zA-Z]*\s*$/.test(text) ||
			// Truncated call opener still streaming ("spea" from "speak("):
			// hold it so a later chunk can complete the call name. Strict
			// prefixes only; complete words like "pause" are legitimate prose
			// and are dropped separately at flush time.
			/(?:^|[\s(>"'¿¡])(?:s|sp|spe|spea|p|pa|pau|paus|g|ge|ges|gest|gestu|gestur)$/i.test(text)
		);
	}
}

import { STATE_FENCE_OPEN } from '../../ai/response-parser.ts';
import {
	cutAtStateFence,
	hasIncompleteTrailingMarkup,
	stripThinkingBlocks,
	StreamingDisplayCleaner
} from '../tts/chat-text.ts';
import { stripFromStateFence } from '../mcp/loop.ts';
import { withNativeContent } from './turn-context.ts';

export interface TurnStreamSinks {
	/** The live chat message. */
	show: (text: string) => void;
	/** Only set while an OmniVoice streaming TTS session is running. */
	speak?: (chunk: string) => void;
}

/**
 * One reply as it streams in, across MCP rounds: what the chat shows, what
 * streaming TTS is fed, and the assembled response the turn saves.
 */
export class TurnStream {
	private assembled = '';
	private native = '';
	private roundTextLen = 0;
	private ttsFedUntil = 0;
	private pendingRaw = '';
	private displayCapped = false;
	private readonly cleaner = new StreamingDisplayCleaner();
	private readonly omnivoice: boolean;
	private readonly sinks: TurnStreamSinks;

	constructor(omnivoice: boolean, sinks: TurnStreamSinks) {
		this.omnivoice = omnivoice;
		this.sinks = sinks;
	}

	startRound() {
		this.roundTextLen = 0;
		this.ttsFedUntil = 0;
		this.pendingRaw = '';
		this.displayCapped = false;
	}

	/** The round's full text so far. */
	delta(roundFull: string) {
		if (!this.omnivoice) {
			// Across MCP rounds the message shows everything produced so far.
			this.sinks.show(this.assembled + roundFull);
			this.roundTextLen = roundFull.length;
			return;
		}

		const delta = roundFull.slice(this.roundTextLen);

		// Feed the live display only until the ```json state fence appears:
		// what follows the fence is the model's post-state repeat, and the
		// final parser cut replaces the message anyway. Without the cap the
		// repeat visibly built the message up twice.
		if (!this.displayCapped) {
			this.pendingRaw += delta;

			const cut = cutAtStateFence(this.pendingRaw);
			if (cut.capped) {
				// Show what precedes the fence, unless it ends mid-markup:
				// that incomplete tail would flash raw fragments.
				if (cut.visible && !hasIncompleteTrailingMarkup(cut.visible)) {
					this.cleaner.push(cut.visible);
				}
				this.pendingRaw = '';
				this.displayCapped = true;
			} else if (!hasIncompleteTrailingMarkup(this.pendingRaw)) {
				// No fence yet: flush only when no incomplete
				// speak/pause/gesture call, language tag or code fence is
				// dangling at the end. This keeps the incremental cleanup
				// O(1) per chunk, and the cleaner reconstructs boundary
				// whitespace the per-fragment trim would otherwise eat.
				this.cleaner.push(this.pendingRaw);
				this.pendingRaw = '';
			}
		}

		this.sinks.show(this.cleaner.text);

		if (this.sinks.speak && roundFull.length > this.roundTextLen) {
			// Reasoning blocks (<thinking>…) and the trailing JSON state
			// block are instructions, not speech; never feed them to TTS.
			// These cuts mirror parseResponse so chat, display and speech
			// agree; they also stop repeated text after the state block
			// from being spoken twice.
			const speechSource = stripThinkingBlocks(roundFull);
			const fenceIndex = speechSource.match(STATE_FENCE_OPEN)?.index ?? -1;
			const speechEnd = fenceIndex === -1 ? speechSource.length : fenceIndex;
			if (this.ttsFedUntil < speechEnd) {
				this.sinks.speak(speechSource.slice(this.ttsFedUntil, speechEnd));
			}
			this.ttsFedUntil = speechEnd;
		}
		this.roundTextLen = roundFull.length;
	}

	/** A speech tool call, already turned into its pseudo-call. */
	toolCall(pseudo: string) {
		this.native += pseudo + '\n';
		this.cleaner.push(pseudo + '\n');
		this.sinks.show(this.cleaner.text);
		this.sinks.speak?.(pseudo);
	}

	/** Intermediate rounds drop a premature state fence so the final round's block is the one parsed. */
	endRound(roundText: string, final: boolean) {
		this.assembled += final ? roundText : stripFromStateFence(roundText);
	}

	/** The saved response, with native dialogue kept before the state fence. */
	get content(): string {
		return withNativeContent(this.assembled, this.native);
	}
}

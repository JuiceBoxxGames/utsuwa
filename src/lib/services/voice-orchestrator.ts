import {
	getTTSProvider,
	getSharedAudioContext,
	type TTSOptions,
	type StreamOptions,
	type ITTSProvider
} from './tts/index.ts';
import { getSpeakableText } from '../utils/speech-content.ts';
import { initLanguageDetector, splitByDetectedLanguage } from './tts/language-detector.ts';

/**
 * Metadata attached to each speech segment by the response parser.
 * Fields beyond `text` are optional and only used by capable providers.
 */
export interface SpeechSegment {
	text: string;
	/** Emotion style hint forwarded to TTS (e.g. 'happy', 'sad') */
	emotion?: string;
	/** Emotion intensity 0.0-1.0 */
	exaggeration?: number;
	/** ISO 639-1 language code for multilingual switching */
	language?: string;
	/** VRM body action to trigger (e.g. wave, nod, jump) */
	action?: string;
	/** Optional speech speed override */
	speed?: number;
	/** Optional pitch override (formant shift multiplier) */
	pitch?: number;
	/** Optional volume override (gain multiplier) */
	volume?: number;
	/** Voice selector: 'default' | 'alt' | literal voice ID. Resolved by orchestrator. */
	voiceId?: string;
}

/** Result of resolving whether a segment should use the alternative voice. */
export interface VoiceResolution {
	voiceId?: string;
	inferredPrimaryLang: string | undefined;
}

/** Primary subtag of a BCP-47-ish language tag ("es-ES" -> "es"). */
function primarySubtag(lang: string): string {
	return lang.toLowerCase().split('-')[0];
}

/**
 * Decide whether a segment should switch to the alternative voice.
 *
 * The switch only happens when the user explicitly enabled the alternative
 * voice (`enableAltLanguage === true`) and configured an `altVoiceId`. The
 * segment must not already have an explicit voice selector. An alternative
 * language equal to the primary language is treated as unset so the switch
 * can never consume the whole conversation. Language codes are compared by
 * their primary subtag, so a model emitting "es-ES" still matches a
 * configured "es".
 *
 * Keeps the inferred primary language so the caller can update its session
 * bookkeeping.
 */
export function resolveSegmentVoice(
	segment: SpeechSegment,
	sessionOptions: TTSOptions,
	inferredPrimaryLang: string | undefined
): VoiceResolution {
	let voiceId = segment.voiceId;
	let newInferredPrimaryLang = inferredPrimaryLang;

	if (
		!voiceId &&
		sessionOptions.enableAltLanguage === true &&
		sessionOptions.altVoiceId &&
		segment.language
	) {
		if (newInferredPrimaryLang === undefined) {
			newInferredPrimaryLang = segment.language;
		}
		const primaryLang = sessionOptions.language || newInferredPrimaryLang;
		const altLang =
			sessionOptions.altLanguage && sessionOptions.altLanguage !== primaryLang
				? sessionOptions.altLanguage
				: undefined;
		const segLang = primarySubtag(segment.language);
		// Only switch to the alternative voice when the segment language matches
		// the configured alternative language. When no alt language is configured
		// (auto-switch), any non-primary language still goes to the alt voice.
		const shouldUseAlt = altLang
			? segLang === primarySubtag(altLang)
			: segLang !== primarySubtag(primaryLang ?? '');
		if (shouldUseAlt) {
			voiceId = 'alt';
		}
	}

	return { voiceId, inferredPrimaryLang: newInferredPrimaryLang };
}

/** Callbacks the orchestrator fires so the UI can react synchronously. */
export interface OrchestratorCallbacks {
	/** Fired when a segment starts playing - for speech bubble sync */
	onSegmentStart?: (segment: SpeechSegment, index: number) => void;
	/** Fired when all segments have finished */
	onComplete?: () => void;
	/** Fired continuously with analyser data for lip-sync */
	onAnalyserUpdate?: (analyser: AnalyserNode) => void;
	/** Fired when a segment with an emotion tag starts */
	onEmotionChange?: (emotion: string | null) => void;
	/** Fired when a segment has an [action:xxx] tag */
	onAction?: (action: string) => void;
}

// Cloud TTS plans commonly cap concurrent synthesis (ElevenLabs Free allows 2),
// and the pipeline only needs to stay one segment ahead of playback anyway.
// Providers that tolerate more can raise this via capabilities.maxConcurrentSynthesis.
const DEFAULT_MAX_CONCURRENT_SYNTHESIS = 2;

// ---------------------------------------------------------------------------
// Simple counting semaphore for limiting parallel TTS synthesis requests
// ---------------------------------------------------------------------------

class Semaphore {
	private slots: number;
	private queue: (() => void)[] = [];

	constructor(limit: number) {
		this.slots = limit;
	}

	acquire(): Promise<void> {
		if (this.slots > 0) {
			this.slots--;
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => this.queue.push(resolve));
	}

	release(): void {
		const next = this.queue.shift();
		if (next) {
			next();
		} else {
			this.slots++;
		}
	}

	/** Drain pending waiters (e.g. on interrupt) so they can check abort state. */
	drainAndReset(limit: number): void {
		this.slots = limit;
		const pending = this.queue.splice(0);
		for (const w of pending) w();
	}
}

// ---------------------------------------------------------------------------
// Internal async producer-consumer queue for the pipeline
// ---------------------------------------------------------------------------

interface PipelineItem {
	segment: SpeechSegment;
	index: number;
	/** Batch path: resolves to the decoded AudioBuffer once synthesis is complete */
	bufferPromise?: Promise<AudioBuffer | null>;
	/** Streaming path: called when the runner is ready to play this segment */
	streamPlay?: (callbacks?: OrchestratorCallbacks) => Promise<void>;
}

/**
 * Lightweight single-consumer async queue.
 * push() adds items; close() signals the end of the stream.
 * next() returns the next item or null when the queue is closed and drained.
 */
class PipelineQueue {
	private queue: PipelineItem[] = [];
	private waiter: ((item: PipelineItem | null) => void) | null = null;
	private closed = false;

	push(item: PipelineItem): void {
		if (this.waiter) {
			const w = this.waiter;
			this.waiter = null;
			w(item);
		} else {
			this.queue.push(item);
		}
	}

	close(): void {
		this.closed = true;
		if (this.waiter) {
			const w = this.waiter;
			this.waiter = null;
			w(null);
		}
	}

	next(): Promise<PipelineItem | null> {
		if (this.queue.length > 0) return Promise.resolve(this.queue.shift()!);
		if (this.closed) return Promise.resolve(null);
		return new Promise((resolve) => {
			this.waiter = resolve;
		});
	}
}

// ---------------------------------------------------------------------------

/**
 * VoiceOrchestrator — central layer between LLM output and TTS/VRM.
 *
 * Pipeline mode (preferred):
 *   beginSession() → pushSegment() × N → endSession() → await result
 *
 * Legacy batch mode (still supported):
 *   speakSegments(allSegments, …)
 *
 * Key property: synthesis of segment N+1 starts as soon as pushSegment() is
 * called, overlapping with playback of segment N. This eliminates the
 * inter-sentence gap caused by sequential fetch → play → fetch → play.
 */
export class VoiceOrchestrator {
	private bufferedStreamingSegments: SpeechSegment[] = [];
	private currentSource: AudioBufferSourceNode | null = null;
	private currentAnalyser: AnalyserNode | null = null;
	private isPlaying = false;

	// Pipeline state
	private channel: PipelineQueue | null = null;
	private pipelineAbort: AbortController | null = null;
	private sessionOptions: TTSOptions | null = null;
	private pipelineIndex = 0;
	private inferredPrimaryLang: string | undefined = undefined;
	private pipelineDoneResolve: (() => void) | null = null;
	private pipelineDoneReject: ((err: unknown) => void) | null = null;
	private pipelineDone: Promise<void> = Promise.resolve();
	private pipelineDoneResolved = true;
	private pipelineErrors: unknown[] = [];
	private detectorReady: Promise<void> = Promise.resolve();

	// Limits parallel TTS synthesis requests (important for single-GPU diffusion models)
	private synthesisLimiter = new Semaphore(Infinity);

	getAnalyser(): AnalyserNode | null {
		return this.currentAnalyser;
	}

	getIsPlaying(): boolean {
		return this.isPlaying;
	}

	// -------------------------------------------------------------------------
	// Legacy batch API — keeps backward compatibility
	// -------------------------------------------------------------------------

	async speakSegments(
		segments: SpeechSegment[],
		options: TTSOptions,
		callbacks?: OrchestratorCallbacks
	): Promise<void> {
		await this.beginSession(options, callbacks);
		for (const seg of segments) {
			this.pushSegment(seg);
		}
		return this.endSession();
	}

	// -------------------------------------------------------------------------
	// Pipeline API — preferred for streaming LLM output
	// -------------------------------------------------------------------------

	/**
	 * Start a new speech session.
	 * Any in-progress session is interrupted first.
	 */
	async beginSession(options: TTSOptions, callbacks?: OrchestratorCallbacks): Promise<void> {
		this.interrupt();

		this.sessionOptions = options;
		this.pipelineAbort = new AbortController();
		this.pipelineIndex = 0;
		this.inferredPrimaryLang = undefined;
		this.bufferedStreamingSegments = [];
		this.channel = new PipelineQueue();

		// Kick off the on-demand detector load for this session's language pair.
		// Kept as a field so the promise (and any later await) can never surface
		// an unhandled rejection when the optional eld model fails to load.
		if (options.enableAltLanguage === true && options.language) {
			const languages = [options.language];
			if (options.altLanguage) languages.push(options.altLanguage);
			this.detectorReady = initLanguageDetector(languages).catch((err) => {
				// Detection is best-effort: fall back to the declared language.
				console.warn('[VoiceOrchestrator] language detector failed to load:', err);
			});
		} else {
			this.detectorReady = Promise.resolve();
		}

		// Apply provider-specific concurrency limit (e.g. OmniVoice = 2)
		const provider = getTTSProvider(options);
		const limit = provider.capabilities?.maxConcurrentSynthesis ?? DEFAULT_MAX_CONCURRENT_SYNTHESIS;
		this.synthesisLimiter.drainAndReset(limit);
		this.pipelineErrors = [];
		this.pipelineDoneResolved = false;
		this.pipelineDone = new Promise<void>((resolve, reject) => {
			this.pipelineDoneResolve = resolve;
			this.pipelineDoneReject = reject;
		});

		// Start the async pipeline runner (fire-and-forget; resolves pipelineDone)
		this.runPipeline(callbacks).catch((err) => {
			if ((err as Error).name !== 'AbortError') {
				console.error('[VoiceOrchestrator] Pipeline error:', err);
			}
		});

		// Wait until the language detector is ready before callers start pushing
		// segments. This avoids classifying the first chunk before ELD has loaded
		// its subset for the active language pair.
		await this.detectorReady;
	}

	/**
	 * Push a segment into the pipeline.
	 * Synthesis starts immediately in the background.
	 */
	pushSegment(segment: SpeechSegment): void {
		if (!this.channel || !this.sessionOptions || this.pipelineAbort?.signal.aborted) return;

		// Skip segments that contain only emoji, whitespace, or punctuation — these produce
		// no meaningful speech but still incur full TTS generation overhead.
		if (!getSpeakableText(segment.text)) return;

		for (const seg of this.validateAndSplitSegment(segment)) {
			this.enqueueSegment(seg);
		}
	}

	/**
	 * Teacher-style splitting and ELD validation (M2/M4): run BEFORE
	 * resolveSegmentVoice so mixed-language segments are split and every
	 * fragment is re-validated before a voice is assigned. Validation happens
	 * per fragment inside splitByDetectedLanguage; the segment's declared tag
	 * is passed through as-is. A whole-segment verdict is deliberately not
	 * taken here: on mixed sentences it is arbitrary (the splitter resolves
	 * the same question per fragment), and it would cost one extra ELD call
	 * per segment.
	 */
	private validateAndSplitSegment(segment: SpeechSegment): SpeechSegment[] {
		if (this.sessionOptions?.enableAltLanguage !== true || !this.sessionOptions.language) return [segment];
		const declared = segment.language ?? this.sessionOptions.language;
		const fragments = splitByDetectedLanguage(
			segment.text ?? '',
			declared,
			this.sessionOptions.language,
			this.sessionOptions.altLanguage
		);
		if (fragments.length === 0) return [segment];
		if (fragments.length === 1) return [{ ...segment, language: fragments[0].language }];
		// A separator-only fragment (e.g. a lone ". " between two languages)
		// must not enqueue an empty TTS segment.
		return fragments
			.filter((f) => getSpeakableText(f.text))
			.map((f) => ({ ...segment, text: f.text, language: f.language }));
	}

	private enqueueSegment(segment: SpeechSegment): void {
		// Guaranteed by pushSegment (the only caller); narrows the optional
		// fields for the type checker.
		if (!this.channel || !this.sessionOptions) return;
		// Auto-assign alt voice when the user explicitly enabled the alternative
		// voice and configured an altVoiceId.
		const resolution = resolveSegmentVoice(
			segment,
			this.sessionOptions,
			this.inferredPrimaryLang
		);
		segment = { ...segment, voiceId: resolution.voiceId };
		this.inferredPrimaryLang = resolution.inferredPrimaryLang;

		const provider = getTTSProvider(this.sessionOptions);
		const abort = this.pipelineAbort;
		if (!abort) return;
		const signal = abort.signal;
		const index = this.pipelineIndex++;

		// For streaming providers (Chatterbox): buffer segments and combine into one
		// request in endSession. This enables sentence_pipelining=true which drops
		// RTF and allows gapless progressive playback.
		if (provider.capabilities?.streaming && provider.speakStreaming) {
			this.bufferedStreamingSegments.push(segment);
			return;
		}

		// Non-streaming providers: batch path (prefetch while previous segment plays)
		const bufferPromise = this.fetchBuffer(provider, segment, signal);
		// runPipeline awaits this later; the no-op catch just keeps a fast rejection
		// from surfacing as an unhandled-rejection warning in the meantime.
		bufferPromise.catch(() => {});
		this.channel.push({ segment, index, bufferPromise });
	}

	/**
	 * Signal that no more segments will be pushed.
	 * Returns a promise that resolves when all audio has finished playing.
	 */
	endSession(): Promise<void> {
		// Flush buffered streaming segments as one combined streaming call.
		if (
			this.bufferedStreamingSegments.length > 0 &&
			this.channel &&
			this.sessionOptions &&
			this.pipelineAbort
		) {
			const segments = [...this.bufferedStreamingSegments];
			this.bufferedStreamingSegments = [];
			const provider = getTTSProvider(this.sessionOptions);
			const signal = this.pipelineAbort.signal;
			const index = this.pipelineIndex++;
			this.channel.push({
				segment: segments[0],
				index,
				streamPlay: (cb) => this.playAllAsOneStream(provider, segments, index, signal, cb)
			});
		}
		this.channel?.close();
		return this.pipelineDone;
	}

	interrupt(): void {
		this.pipelineAbort?.abort();
		this.pipelineAbort = null;

		this.synthesisLimiter.drainAndReset(Infinity);

		this.channel?.close();
		this.channel = null;

		if (this.currentSource) {
			try {
				this.currentSource.stop();
			} catch {
				// Already stopped
			}
			this.currentSource = null;
		}

		this.currentAnalyser = null;
		this.isPlaying = false;
		this.resolvePipeline();
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	private resolvePipeline(): void {
		if (!this.pipelineDoneResolved) {
			this.pipelineDoneResolved = true;
			this.pipelineDoneResolve?.();
			this.pipelineDoneResolve = null;
			this.pipelineDoneReject = null;
		}
	}

	private rejectPipeline(err: unknown): void {
		if (!this.pipelineDoneResolved) {
			this.pipelineDoneResolved = true;
			this.pipelineDoneReject?.(err);
			this.pipelineDoneResolve = null;
			this.pipelineDoneReject = null;
		}
	}

	private async runPipeline(callbacks?: OrchestratorCallbacks): Promise<void> {
		// Pin this runner to its own session. After interrupt() + beginSession()
		// the fields point at the next session, which a stale runner must not
		// pull from or resolve.
		const channel = this.channel;
		const abort = this.pipelineAbort;
		this.isPlaying = true;
		const provider = this.sessionOptions ? getTTSProvider(this.sessionOptions) : null;
		const clientSideSpeed = provider?.capabilities?.clientSideSpeed ?? false;

		try {
			while (true) {
				if (abort?.signal.aborted) break;

				const item = await (channel?.next() ?? Promise.resolve(null));
				if (item === null) break; // channel closed (endSession called)

				if (abort?.signal.aborted) break;

				// Streaming path: synthesis and playback happen together
				if (item.streamPlay) {
					await item.streamPlay(callbacks);
					continue;
				}

				// Batch path: wait for synthesis to finish (may already be done)
				let buffer: AudioBuffer | null = null;
				try {
					buffer = await item.bufferPromise!;
				} catch (err) {
					if ((err as Error).name === 'AbortError' || abort?.signal.aborted) break;
					console.error(
						'[VoiceOrchestrator] Synthesis failed for segment:',
						item.segment.text,
						err
					);
					// Keep playing the remaining segments, but remember the failure so
					// the session promise rejects and the store can show its toast.
					this.pipelineErrors.push(err);
					continue;
				}

				if (!buffer || abort?.signal.aborted) continue;

				// Near-empty audio (OmniVoice returns a few samples for very short
				// inputs) would play as a click; skip it silently.
				if (buffer.duration < 0.05) continue;

				if (item.segment.action) callbacks?.onAction?.(item.segment.action);

				const playbackRate = clientSideSpeed
					? (item.segment.speed ?? this.sessionOptions?.speed ?? 1)
					: undefined;
				await this.playBuffer(buffer, item.segment, item.index, callbacks, playbackRate);
			}
		} finally {
			callbacks?.onEmotionChange?.(null);
			callbacks?.onComplete?.();
			// interrupt() already settled this session; a newer one is not ours.
			if (this.pipelineAbort === abort) {
				this.isPlaying = false;
				this.currentSource = null;
				this.currentAnalyser = null;
				const firstError = this.pipelineErrors[0];
				if (firstError !== undefined && !abort?.signal.aborted) {
					this.rejectPipeline(
						firstError instanceof Error ? firstError : new Error(String(firstError))
					);
				} else {
					this.resolvePipeline();
				}
			}
		}
	}

	/**
	 * Fetch and decode audio to an AudioBuffer (without starting playback).
	 * Synthesis runs in the background while the previous segment plays.
	 */
	private resolveVoiceId(tag: string | undefined): string | undefined {
		if (!tag || tag === 'default') return undefined;
		if (tag === 'alt') return this.sessionOptions?.altVoiceId || undefined;
		return tag;
	}

	private async fetchBuffer(
		provider: ITTSProvider,
		segment: SpeechSegment,
		signal: AbortSignal
	): Promise<AudioBuffer | null> {
		const resolvedVoiceId = this.resolveVoiceId(segment.voiceId);
		const isAlt = !!resolvedVoiceId && resolvedVoiceId === this.sessionOptions?.altVoiceId;

		const streamOpts: StreamOptions = {
			emotion: segment.emotion,
			exaggeration: segment.exaggeration,
			language: segment.language,
			speed: segment.speed
				?? (isAlt ? this.sessionOptions?.altSpeed : undefined)
				?? this.sessionOptions?.speed,
			pitch: segment.pitch,
			volume: segment.volume,
			voiceId: resolvedVoiceId,
			signal
		};
		if (this.sessionOptions?.provider === 'omnivoice') {
			const instr = isAlt
				? this.sessionOptions.altInstructions
				: this.sessionOptions.instructions;
			if (instr) {
				streamOpts.instructions = instr;
			}

			if (this.sessionOptions.numStep != null || this.sessionOptions.altNumStep != null) {
				streamOpts.numStep = (isAlt ? this.sessionOptions.altNumStep : undefined)
					?? this.sessionOptions.numStep;
			}
			if (
				this.sessionOptions.positionTemperature != null ||
				this.sessionOptions.altPositionTemperature != null
			) {
				streamOpts.positionTemperature = (isAlt
					? this.sessionOptions.altPositionTemperature
					: undefined
				) ?? this.sessionOptions.positionTemperature;
			}
			if (
				this.sessionOptions.classTemperature != null ||
				this.sessionOptions.altClassTemperature != null
			) {
				streamOpts.classTemperature = (isAlt
					? this.sessionOptions.altClassTemperature
					: undefined
				) ?? this.sessionOptions.classTemperature;
			}
		}

		if (signal.aborted) return null;

		// Acquire a synthesis slot — limits parallel requests to the provider's
		// maxConcurrentSynthesis cap (e.g. 2 for OmniVoice). This prevents all
		// segments from being synthesised in one GPU batch, which would delay the
		// first segment by the full batch duration instead of just one segment.
		await this.synthesisLimiter.acquire();
		if (signal.aborted) {
			this.synthesisLimiter.release();
			return null;
		}

		try {
			// Preferred path: provider implements fetchAudioBuffer
			if (provider.fetchAudioBuffer) {
				return await provider.fetchAudioBuffer(segment.text, streamOpts);
			}

			// Fallback: use speak() and extract the decoded buffer from the source.
			const result = await provider.speak(segment.text);
			return result.source.buffer;
		} finally {
			this.synthesisLimiter.release();
		}
	}

	private async playBuffer(
		buffer: AudioBuffer,
		segment: SpeechSegment,
		index: number,
		callbacks?: OrchestratorCallbacks,
		playbackRate?: number
	): Promise<void> {
		const audioContext = getSharedAudioContext();
		if (audioContext.state === 'suspended') {
			await audioContext.resume();
		}

		const source = audioContext.createBufferSource();
		source.buffer = buffer;
		if (playbackRate !== undefined && playbackRate > 0 && playbackRate !== 1) {
			source.playbackRate.value = playbackRate;
		}

		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;

		source.connect(analyser);
		analyser.connect(audioContext.destination);

		this.currentSource = source;
		this.currentAnalyser = analyser;

		callbacks?.onSegmentStart?.(segment, index);
		callbacks?.onAnalyserUpdate?.(analyser);

		await new Promise<void>((resolve) => {
			source.onended = () => resolve();
			source.start(0);
		});

		// One analyser is created per segment; leaving them connected to the
		// destination accumulates nodes on the shared context over a session.
		source.disconnect();
		analyser.disconnect();
	}

	/**
	 * Stream all segments as ONE request with sentence_pipelining=true.
	 *
	 * Each streamed binary chunk is decoded and scheduled with precise Web Audio
	 * timestamps: source.start(nextPlayTime); nextPlayTime += buffer.duration.
	 * SCHEDULE_AHEAD_S seconds of "pre-roll" means the first chunk starts playing
	 * slightly in the future, giving subsequent chunks time to arrive before their
	 * scheduled start — gapless even at RTF ~1.0.
	 */
	private async playAllAsOneStream(
		provider: ITTSProvider,
		segments: SpeechSegment[],
		index: number,
		signal: AbortSignal,
		callbacks?: OrchestratorCallbacks
	): Promise<void> {
		const SCHEDULE_AHEAD_S = 1.5;

		const audioContext = getSharedAudioContext();
		if (audioContext.state === 'suspended') {
			await audioContext.resume();
		}

		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;
		analyser.connect(audioContext.destination);
		this.currentAnalyser = analyser;

		try {
			const firstSeg = segments[0];
			if (firstSeg.action) callbacks?.onAction?.(firstSeg.action);
			callbacks?.onSegmentStart?.(firstSeg, index);
			callbacks?.onAnalyserUpdate?.(analyser);

			// Estimate per-sentence timings and fire onSegmentStart for subsequent
			// segments so the speech bubble advances sentence-by-sentence.
			const segmentTimers: ReturnType<typeof setTimeout>[] = [];
			const CHARS_PER_SECOND = 13;
			let accumulatedMs = 0;
			for (let i = 1; i < segments.length; i++) {
				accumulatedMs += (segments[i - 1].text.length / CHARS_PER_SECOND) * 1000;
				const seg = segments[i];
				const segIndex = index + i;
				const fireAt = accumulatedMs;
				segmentTimers.push(
					setTimeout(() => {
						if (signal.aborted) return;
						callbacks?.onSegmentStart?.(seg, segIndex);
					}, fireAt)
				);
			}
			signal.addEventListener(
				'abort',
				() => {
					for (const t of segmentTimers) clearTimeout(t);
				},
				{ once: true }
			);

			const combinedText = segments
				.map((s, i) => {
					const t = s.text.trim();
					if (i < segments.length - 1 && !/[.!?…。！？]$/.test(t)) return t + '.';
					return t;
				})
				.join(' ');

			const streamOpts: StreamOptions = {
				emotion: firstSeg.emotion,
				exaggeration: firstSeg.exaggeration,
				language: firstSeg.language,
				speed: firstSeg.speed,
				signal
			};

			const PCM_HEADER_SIZE = 44;
			let headerParsed = false;
			let audioFormat = 3; // default: IEEE float32
			let numChannels = 1;
			let sampleRate = 24000;
			let bytesPerSample = 4;

			let remainder: Uint8Array = new Uint8Array(0);
			let nextPlayTime = 0;
			let firstChunk = true;
			let lastSourceEndTime = 0;
			const sources: AudioBufferSourceNode[] = [];

			const abortHandler = () => {
				for (const src of sources) {
					try {
						src.stop();
					} catch {
						/* already stopped */
					}
				}
			};
			signal.addEventListener('abort', abortHandler, { once: true });

			try {
				const generator = provider.speakStreaming!(combinedText, streamOpts);

				for await (const chunk of generator) {
					if (signal.aborted) break;
					if (chunk.done) break;
					if (chunk.data.byteLength === 0) continue;

					const incoming = new Uint8Array(chunk.data);
					let raw: Uint8Array;
					if (remainder.byteLength > 0) {
						raw = new Uint8Array(remainder.byteLength + incoming.byteLength);
						raw.set(remainder);
						raw.set(incoming, remainder.byteLength);
						remainder = new Uint8Array(0);
					} else {
						raw = incoming;
					}

					let pcmBytes: Uint8Array;

					if (!headerParsed) {
						if (raw.byteLength < PCM_HEADER_SIZE) {
							remainder = raw;
							continue;
						}
						const hdv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
						audioFormat = hdv.getUint16(20, true);
						numChannels = hdv.getUint16(22, true);
						sampleRate = hdv.getUint32(24, true);
						const bps = hdv.getUint16(34, true);
						bytesPerSample = bps / 8;
						headerParsed = true;
						pcmBytes = raw.slice(PCM_HEADER_SIZE);
					} else {
						pcmBytes = raw;
					}

					if (pcmBytes.byteLength === 0) continue;

					const frameSize = bytesPerSample * numChannels;
					const alignedBytes = Math.floor(pcmBytes.byteLength / frameSize) * frameSize;
					if (alignedBytes === 0) {
						remainder = pcmBytes;
						continue;
					}
					remainder = pcmBytes.slice(alignedBytes);

					const numSamples = alignedBytes / bytesPerSample;
					const samplesPerChannel = numSamples / numChannels;
					const float32 = new Float32Array(numSamples);
					const pdv = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, alignedBytes);
					if (audioFormat === 3) {
						for (let i = 0; i < numSamples; i++) float32[i] = pdv.getFloat32(i * 4, true);
					} else {
						for (let i = 0; i < numSamples; i++) float32[i] = pdv.getInt16(i * 2, true) / 32768.0;
					}

					const audioBuffer = audioContext.createBuffer(
						numChannels,
						samplesPerChannel,
						sampleRate
					);
					if (numChannels === 1) {
						audioBuffer.getChannelData(0).set(float32);
					} else {
						for (let ch = 0; ch < numChannels; ch++) {
							const chData = audioBuffer.getChannelData(ch);
							for (let i = 0; i < samplesPerChannel; i++) {
								chData[i] = float32[i * numChannels + ch];
							}
						}
					}

					if (firstChunk) {
						nextPlayTime = audioContext.currentTime + SCHEDULE_AHEAD_S;
						firstChunk = false;
					}

					const src = audioContext.createBufferSource();
					src.buffer = audioBuffer;
					src.connect(analyser);
					this.currentSource = src;
					sources.push(src);
					src.start(nextPlayTime);
					lastSourceEndTime = nextPlayTime + audioBuffer.duration;
					nextPlayTime = lastSourceEndTime;
				}
			} catch (err) {
				if ((err as Error).name !== 'AbortError' && !signal.aborted) {
					console.error('[VoiceOrchestrator] playAllAsOneStream error:', err);
				}
			} finally {
				signal.removeEventListener('abort', abortHandler);
			}

			if (signal.aborted) return;

			// Wait until all scheduled audio has finished playing.
			const remainingMs = (lastSourceEndTime - audioContext.currentTime) * 1000;
			if (remainingMs > 0) {
				await new Promise<void>((resolve) => {
					const id = setTimeout(resolve, remainingMs + 150);
					signal.addEventListener('abort', () => {
						clearTimeout(id);
						resolve();
					}, { once: true });
				});
			}
		} finally {
			analyser.disconnect();
		}
	}
}

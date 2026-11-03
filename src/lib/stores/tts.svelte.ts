import { type TTSOptions } from '$lib/services/tts';
import { VoiceOrchestrator } from '$lib/services/voice-orchestrator';
import { splitIntoSentences } from '$lib/utils/sentences';
import { getSpeakableText } from '$lib/utils/speech-content';
import {
	parsePseudoToolCalls,
	compile,
	compileFromText,
	type CompiledSegment,
	type ToolCall
} from '$lib/services/tts/speech-compiler';
import { stripLegacyTags } from '$lib/services/tts/chat-text';
import { SpeechScheduler } from '$lib/services/tts/speech-scheduler';
import { StreamingSpeechBuffer } from '$lib/services/tts/streaming-speech-buffer';
import {
	canSpeak,
	clearQueue,
	enqueue,
	runQueue,
	type QueueEngine,
	type QueueItem
} from './tts-store-logic';

function createTTSStore() {
	let isSpeaking = $state(false);
	let currentAnalyser = $state<AnalyserNode | null>(null);
	let queue = $state<QueueItem[]>([]);
	let lastError = $state<string | null>(null);
	let errorTimer: ReturnType<typeof setTimeout> | null = null;
	let streamingBuffer: StreamingSpeechBuffer | null = null;
	let streamingSessionId = 0;
	let streamingDefaultLanguage = 'de';

	const orchestrator = new VoiceOrchestrator();

	function reportError(error: unknown) {
		lastError = error instanceof Error ? error.message : 'Voice playback failed';
		if (errorTimer) clearTimeout(errorTimer);
		errorTimer = setTimeout(() => (lastError = null), 8000);
	}

	/** Convert plain prose around tool calls into primary-language speak() calls. */
	function proseToSpeakCalls(prose: string, primaryLang: string): ToolCall[] {
		return splitIntoSentences(prose).map((sentence) => ({
			name: 'speak' as const,
			arguments: { text: sentence, lang: primaryLang }
		}));
	}

	function buildCompiledSegments(text: string, options: TTSOptions): CompiledSegment[] {
		const primaryLang = options.language || 'en';

		if (options.provider === 'omnivoice') {
			// First try real tool-call syntax emitted by the model.
			const parsed = parsePseudoToolCalls(text);
			if (parsed.calls.length > 0) {
				// If the model also wrote plain prose around the calls, treat that
				// prose as primary-language speak() segments so nothing is lost.
				const mixedCalls = parsed.chunks.flatMap((chunk) => {
					if (chunk.type === 'call' && chunk.call) {
						return [chunk.call];
					}
					if (chunk.type === 'prose' && chunk.text) {
						return proseToSpeakCalls(chunk.text, primaryLang);
					}
					return [];
				});
				return compile(mixedCalls, primaryLang).segments;
			}

			// Fallback: strip any legacy inline markup and speak the visible text
			// in the primary language. Legacy tags are never converted into
			// language-aware segments — speak({...}) is the only syntax.
			return compileFromText(stripLegacyTags(text), primaryLang).segments;
		}

		const sentences = splitIntoSentences(text);
		return sentences.map((sentence) => ({ type: 'speak' as const, text: sentence, language: primaryLang }));
	}

	const engine: QueueEngine = {
		get snapshot() {
			return { isSpeaking, queue };
		},
		set snapshot(value) {
			isSpeaking = value.isSpeaking;
			queue = value.queue;
		},
		play: async (item) => {
			const segments = buildCompiledSegments(item.text, item.options);

			// Skip non-speech content early (emoji-only, empty, etc.).
			const hasSpeakable = segments.some(
				(s) => s.type === 'speak' && getSpeakableText(s.text)
			);
			if (!hasSpeakable) {
				return;
			}

			const scheduler = new SpeechScheduler(orchestrator);
			await scheduler.beginPlan(segments, item.options, (analyser) => {
				currentAnalyser = analyser;
			});
		},
		onError: (error) => {
			console.error('TTS error:', error);
			reportError(error);
		},
		onFinished: () => {
			currentAnalyser = null;
		}
	};

	async function speak(text: string, options: TTSOptions) {
		if (!canSpeak(options)) {
			console.warn('TTS not configured - missing API key');
			return;
		}

		const next = enqueue(text, options, { isSpeaking, queue });
		queue = next.queue;
		await processQueue();
	}

	async function processQueue() {
		await runQueue(engine);
	}

	async function beginStreaming(options: TTSOptions): Promise<boolean> {
		if (options.provider !== 'omnivoice' || !canSpeak(options)) return false;

		stop();
		const sessionId = ++streamingSessionId;
		streamingDefaultLanguage = options.language || 'en';
		streamingBuffer = new StreamingSpeechBuffer({
			defaultLanguage: streamingDefaultLanguage,
			onSegment: (segment) => {
				if (sessionId === streamingSessionId) orchestrator.pushSegment(segment);
			}
		});
		await orchestrator.beginSession(options, {
			onAnalyserUpdate: (analyser) => {
				if (sessionId === streamingSessionId) currentAnalyser = analyser;
			}
		});
		isSpeaking = true;
		return true;
	}

	function feedStreaming(chunk: string): void {
		streamingBuffer?.feed(chunk);
	}

	async function endStreaming(): Promise<void> {
		const buffer = streamingBuffer;
		if (!buffer) return;
		const sessionId = streamingSessionId;
		streamingBuffer = null;
		buffer.flush();

		try {
			await orchestrator.endSession();
		} catch (error) {
			console.error('Streaming TTS error:', error);
			reportError(error);
		} finally {
			if (sessionId === streamingSessionId) {
				isSpeaking = false;
				currentAnalyser = null;
			}
		}
	}

	function cancelStreaming(): void {
		streamingSessionId++;
		streamingBuffer?.reset();
		streamingBuffer = null;
		// Also while endStreaming waits: interrupt() settles its endSession.
		orchestrator.interrupt();
		isSpeaking = false;
		currentAnalyser = null;
	}

	function stop() {
		streamingSessionId++;
		streamingBuffer?.reset();
		streamingBuffer = null;
		orchestrator.interrupt();
		const cleared = clearQueue({ isSpeaking, queue });
		isSpeaking = cleared.isSpeaking;
		queue = cleared.queue;
		currentAnalyser = null;
	}

	return {
		get isSpeaking() {
			return isSpeaking;
		},
		get currentAnalyser() {
			return currentAnalyser;
		},
		get lastError() {
			return lastError;
		},
		speak,
		beginStreaming,
		feedStreaming,
		endStreaming,
		cancelStreaming,
		stop
	};
}

export const ttsStore = createTTSStore();

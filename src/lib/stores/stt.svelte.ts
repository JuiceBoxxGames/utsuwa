import { browser } from '$app/environment';
import { webSpeechService } from '$lib/services/stt/web-speech';
import { openAiSttService } from '$lib/services/stt/openai-stt';
import { getSTTBaseUrl, getLocalSTTConnectionHint } from '$lib/services/providers/local-endpoints';
import { getSTTProvider } from '$lib/services/providers/registry';
import { isTauri } from '$lib/services/platform/platform';
import { settingsStore } from '$lib/stores/settings.svelte';

function createSttStore() {
	let isListening = $state(false);
	let isTranscribing = $state(false);
	let transcript = $state('');
	let interimTranscript = $state('');
	let error = $state<string | null>(null);
	let audioLevel = $state(0);

	// Which OpenAI-compatible STT provider to use, if any. A configured local
	// server wins over Groq (mirrors how a Groq key wins over Web Speech), and
	// both fall back to the browser's Web Speech API when neither is set up.
	const activeOpenAiStt = $derived.by<string | null>(() => {
		if (!browser) return null;
		if (settingsStore.isProviderAdded('local-stt')) return 'local-stt';
		if (settingsStore.getProviderConfig('groq-stt').apiKey) return 'groq-stt';
		if (settingsStore.getProviderConfig('openai-stt').apiKey) return 'openai-stt';
		return null;
	});
	const useOpenAiStt = $derived(activeOpenAiStt !== null);

	// Point the shared recorder at the active provider's endpoint before a session.
	function configureOpenAiStt(providerId: string) {
		const config = settingsStore.getProviderConfig(providerId);
		const meta = getSTTProvider(providerId);
		const baseUrl = getSTTBaseUrl(providerId, config.baseUrl || meta?.defaultBaseUrl);
		const model =
			config.modelId ||
			meta?.models?.[0]?.id ||
			(providerId === 'groq-stt' ? 'whisper-large-v3-turbo' : 'whisper-1');
		const isLocal = providerId === 'local-stt';
		openAiSttService.configure({
			baseUrl,
			model,
			apiKey: config.apiKey || undefined,
			label: isLocal ? 'the local STT server' : (meta?.name ?? 'the STT server'),
			connectionHint: isLocal
				? getLocalSTTConnectionHint(baseUrl, browser ? window.location.origin : undefined)
				: undefined,
			timeoutMs: config.timeoutMs
		});
	}

	async function startListening(onComplete: (text: string) => void) {
		if (!browser) return;
		if (isListening || isTranscribing) return;

		error = null;
		transcript = '';
		interimTranscript = '';
		audioLevel = 0.2;

		if (useOpenAiStt && activeOpenAiStt) {
			// Point the recorder at the active provider (local server or Groq)
			configureOpenAiStt(activeOpenAiStt);

			const started = await openAiSttService.startListening({
				onResult: (text, isFinal) => {
					if (isFinal) {
						transcript = transcript ? transcript + ' ' + text : text;
						interimTranscript = '';
					} else {
						interimTranscript = text;
					}
				},
				onEnd: () => {
					isListening = false;
					isTranscribing = false;
					audioLevel = 0;
					const finalText = transcript.trim();
					transcript = '';
					interimTranscript = '';
					if (finalText) {
						onComplete(finalText);
					}
				},
				onError: (err) => {
					console.error('[STT Store] Error:', err);
					setError(err);
					isListening = false;
					isTranscribing = false;
					transcript = '';
					interimTranscript = '';
					audioLevel = 0;
				},
				onAudioLevel: (level) => {
					audioLevel = level;
				}
			});

			if (started) {
				isListening = true;
			}
		} else {
			const started = webSpeechService.startListening({
				onResult: (text, isFinal) => {
					if (isFinal) {
						transcript = transcript ? transcript + ' ' + text : text;
						interimTranscript = '';
						audioLevel = 0.3;
					} else {
						interimTranscript = text;
						audioLevel = 0.5 + Math.random() * 0.5;
					}
				},
				onEnd: () => {
					isListening = false;
					audioLevel = 0;
					const finalText = transcript.trim();
					transcript = '';
					interimTranscript = '';
					if (finalText) {
						onComplete(finalText);
					}
				},
				onError: (err) => {
					console.error('[STT Store] Error:', err);
					setError(err);
					isListening = false;
					transcript = '';
					interimTranscript = '';
					audioLevel = 0;
				}
			});

			if (started) {
				isListening = true;
			}
		}
	}

	function stopListening() {
		if (useOpenAiStt) {
			// Recorded audio is transcribed on stop
			isTranscribing = true;
			openAiSttService.stopListening();
		} else {
			webSpeechService.stopListening();
		}
	}

	function cancel() {
		if (useOpenAiStt) {
			openAiSttService.abort();
		} else {
			webSpeechService.abort();
		}
		isListening = false;
		isTranscribing = false;
		transcript = '';
		interimTranscript = '';
		audioLevel = 0;
	}

	function isSupported() {
		if (!browser) return false;
		// A local or Groq server works on any platform if a mic is available
		if (useOpenAiStt && openAiSttService.isSupported()) return true;
		// Web Speech only works in browsers (not Tauri's webview)
		if (!isTauri() && webSpeechService.isSupported()) return true;
		return false;
	}

	function showUnsupportedError() {
		if (isTauri()) {
			setError('Add a Groq key or a local STT server in Settings > STT for voice input on desktop.');
		} else {
			setError('Voice input is not supported in this browser. Add a Groq key or a local STT server in Settings > STT, or try Chrome/Edge.');
		}
	}

	function setError(message: string) {
		error = message;
	}

	function clearError() {
		error = null;
	}

	return {
		get isListening() {
			return isListening;
		},
		get isTranscribing() {
			return isTranscribing;
		},
		get transcript() {
			return transcript;
		},
		get interimTranscript() {
			return interimTranscript;
		},
		get displayTranscript() {
			if (transcript && interimTranscript) {
				return transcript + ' ' + interimTranscript;
			}
			return transcript || interimTranscript;
		},
		get error() {
			return error;
		},
		get audioLevel() {
			return audioLevel;
		},
		startListening,
		stopListening,
		cancel,
		isSupported,
		showUnsupportedError,
		clearError
	};
}

export const sttStore = createSttStore();

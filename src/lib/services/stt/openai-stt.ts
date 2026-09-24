import type { SpeechRecognitionCallbacks } from './web-speech';

export interface OpenAiSttConfig {
	// Base URL ending in /v1 (or a full custom URL). Trailing slashes are trimmed.
	baseUrl: string;
	model: string;
	// Omitted for local servers that don't require auth.
	apiKey?: string;
	// Shown in error messages, e.g. "Groq" or "the local STT server".
	label: string;
	// Optional richer message for a network failure (CORS/unreachable hints).
	connectionHint?: string;
	// Transcription request timeout in ms. Defaults to 30 s.
	timeoutMs?: number;
}

export const DEFAULT_STT_TIMEOUT_MS = 30_000;

// Settings store seconds; the service wants ms. Clamps so a stray value cannot disable the timeout.
export function resolveSttTimeoutMs(seconds: number | undefined): number {
	if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
		return DEFAULT_STT_TIMEOUT_MS;
	}
	return Math.min(600, Math.max(5, seconds)) * 1000;
}

export function sttTimeoutMessage(label: string, timeoutMs: number): string {
	const seconds = Math.round(timeoutMs / 1000);
	const msg = `${label} did not respond within ${seconds} seconds. Raise the transcription timeout in Settings > STT if your server is slow.`;
	// Labels like "the local STT server" start lowercase; the toast should not
	return msg.charAt(0).toUpperCase() + msg.slice(1);
}

// The transcription request shape, split out so it can be unit tested without a
// browser (MediaRecorder/getUserMedia). OpenAI-compatible servers — OpenAI,
// Groq, Speaches, faster-whisper-server, whisper.cpp — all accept this.
export function buildTranscriptionRequest(
	config: OpenAiSttConfig,
	audio: Blob,
	filename: string
): { url: string; headers: Record<string, string>; body: FormData } {
	const base = config.baseUrl.replace(/\/+$/, '');
	const form = new FormData();
	form.append('file', audio, filename);
	form.append('model', config.model);

	const headers: Record<string, string> = {};
	// Local servers usually need no key; only send auth when one is set.
	if (config.apiKey) {
		headers.Authorization = `Bearer ${config.apiKey}`;
	}

	return { url: `${base}/audio/transcriptions`, headers, body: form };
}

// Records mic audio and transcribes it via any OpenAI-compatible
// /v1/audio/transcriptions endpoint. Groq and local servers (Speaches,
// faster-whisper-server, whisper.cpp) share this exact client — only the base
// URL, model, and whether an API key is sent differ.
class OpenAiSttService {
	private config: OpenAiSttConfig | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private audioChunks: Blob[] = [];
	private stream: MediaStream | null = null;
	private analyser: AnalyserNode | null = null;
	private audioContext: AudioContext | null = null;
	private animFrameId: number | null = null;
	private callbacks: SpeechRecognitionCallbacks | null = null;
	private abortController: AbortController | null = null;
	private listening = false;
	private transcribing = false;

	configure(config: OpenAiSttConfig) {
		this.config = config;
	}

	isSupported(): boolean {
		return !!navigator.mediaDevices?.getUserMedia;
	}

	isConfigured(): boolean {
		return !!this.config?.baseUrl && !!this.config?.model;
	}

	getIsListening(): boolean {
		return this.listening;
	}

	getIsTranscribing(): boolean {
		return this.transcribing;
	}

	async startListening(callbacks: SpeechRecognitionCallbacks): Promise<boolean> {
		if (this.listening) return true;
		if (!this.config) {
			callbacks.onError('Speech-to-text is not configured. Set it up in Settings > STT.');
			return false;
		}

		this.callbacks = callbacks;
		this.audioChunks = [];

		try {
			this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch (err) {
			if (err instanceof DOMException) {
				const messages: Record<string, string> = {
					NotAllowedError: 'Microphone access denied. Check system permissions.',
					NotFoundError: 'No microphone found. Please connect a microphone.',
					NotReadableError: 'Microphone is busy or in use by another app.',
					OverconstrainedError: 'Microphone does not meet requirements.'
				};
				callbacks.onError(messages[err.name] || `Microphone error: ${err.message}`);
			} else {
				callbacks.onError('Failed to access microphone');
			}
			return false;
		}

		// Watch for mic disconnection
		this.stream.getTracks().forEach((track) => {
			track.onended = () => {
				if (this.listening) {
					this.callbacks?.onError('Microphone disconnected');
					this.cleanup();
					this.listening = false;
					this.callbacks?.onEnd();
				}
			};
		});

		// Set up audio analysis for real levels
		this.audioContext = new AudioContext();
		const source = this.audioContext.createMediaStreamSource(this.stream);
		this.analyser = this.audioContext.createAnalyser();
		this.analyser.fftSize = 256;
		source.connect(this.analyser);
		this.startLevelMonitoring();

		// Record audio — mimeType may be undefined to let browser pick default
		const mimeType = this.getSupportedMimeType();
		try {
			this.mediaRecorder = mimeType
				? new MediaRecorder(this.stream, { mimeType })
				: new MediaRecorder(this.stream);
		} catch {
			callbacks.onError('Audio recording not supported on this platform');
			this.releaseStream();
			return false;
		}

		this.mediaRecorder.ondataavailable = (e) => {
			if (e.data.size > 0) this.audioChunks.push(e.data);
		};

		this.mediaRecorder.onstop = () => this.handleRecordingStop();

		this.mediaRecorder.start(250);
		this.listening = true;
		return true;
	}

	stopListening(): void {
		if (this.mediaRecorder && this.listening) {
			this.mediaRecorder.stop();
		}
	}

	abort(): void {
		this.abortController?.abort();
		this.abortController = null;
		this.callbacks = null;
		this.cleanup();
		this.listening = false;
		this.transcribing = false;
	}

	private getSupportedMimeType(): string | undefined {
		// mp4/m4a first for Safari/WKWebView, then webm for Chromium
		const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
		for (const type of types) {
			if (MediaRecorder.isTypeSupported(type)) return type;
		}
		// Let browser pick its default
		return undefined;
	}

	private startLevelMonitoring() {
		if (!this.analyser || !this.callbacks?.onAudioLevel) return;

		const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
		const tick = () => {
			if (!this.analyser || !this.listening) return;
			this.analyser.getByteFrequencyData(dataArray);
			let sum = 0;
			for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
			const level = sum / (dataArray.length * 255);
			this.callbacks?.onAudioLevel?.(level);
			this.animFrameId = requestAnimationFrame(tick);
		};
		this.animFrameId = requestAnimationFrame(tick);
	}

	private async handleRecordingStop() {
		this.listening = false;
		this.stopLevelMonitoring();
		this.releaseStream();

		// abort() was called — don't transcribe or fire callbacks
		if (!this.callbacks || !this.config) return;

		if (this.audioChunks.length === 0) {
			this.callbacks?.onEnd();
			return;
		}

		this.transcribing = true;
		const actualMime = this.mediaRecorder?.mimeType || 'audio/mp4';
		const audioBlob = new Blob(this.audioChunks, { type: actualMime });
		this.audioChunks = [];

		const ext = actualMime.includes('webm') ? 'webm' : actualMime.includes('ogg') ? 'ogg' : 'm4a';

		this.abortController = new AbortController();
		const timeoutMs = this.config.timeoutMs ?? DEFAULT_STT_TIMEOUT_MS;
		let timedOut = false;
		const timeoutId = setTimeout(() => {
			timedOut = true;
			this.abortController?.abort();
		}, timeoutMs);

		try {
			const { url, headers, body } = buildTranscriptionRequest(
				this.config,
				audioBlob,
				`recording.${ext}`
			);

			const response = await fetch(url, {
				method: 'POST',
				headers,
				body,
				signal: this.abortController.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				const msg =
					(errorData as { error?: { message?: string } })?.error?.message ||
					`${this.config.label} error (${response.status})`;
				this.callbacks?.onError(msg);
				this.transcribing = false;
				return;
			}

			const data = (await response.json()) as { text: string };
			const text = data.text?.trim();
			this.transcribing = false;

			if (text) {
				this.callbacks?.onResult(text, true);
			}
			this.callbacks?.onEnd();
		} catch (err) {
			clearTimeout(timeoutId);
			this.transcribing = false;
			if (err instanceof DOMException && err.name === 'AbortError') {
				if (timedOut) {
					this.callbacks?.onError(sttTimeoutMessage(this.config.label, timeoutMs));
					return;
				}
				// User cancelled, stay quiet
				this.callbacks?.onEnd();
				return;
			}
			// A thrown fetch means the server was unreachable/blocked (vs. an HTTP
			// error, handled above), so prefer the connection hint when we have one.
			const msg =
				this.config.connectionHint ||
				(err instanceof Error ? err.message : `Failed to reach ${this.config.label}`);
			this.callbacks?.onError(msg);
		} finally {
			this.abortController = null;
		}
	}

	private stopLevelMonitoring() {
		if (this.animFrameId !== null) {
			cancelAnimationFrame(this.animFrameId);
			this.animFrameId = null;
		}
	}

	private releaseStream() {
		if (this.stream) {
			this.stream.getTracks().forEach((t) => t.stop());
			this.stream = null;
		}
		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}
		this.analyser = null;
	}

	private cleanup() {
		this.stopLevelMonitoring();
		if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
			this.mediaRecorder.stop();
		}
		this.mediaRecorder = null;
		this.audioChunks = [];
		this.releaseStream();
	}
}

// A single shared recorder. The store configures it for whichever OpenAI-compatible
// STT provider (Groq or a local server) is active before each session.
export const openAiSttService = new OpenAiSttService();

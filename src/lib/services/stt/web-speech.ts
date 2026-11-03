export interface SpeechRecognitionCallbacks {
	onResult: (transcript: string, isFinal: boolean) => void;
	onEnd: () => void;
	onError: (error: string) => void;
	onAudioLevel?: (level: number) => void;
}

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
	results: SpeechRecognitionResultList;
	resultIndex: number;
}

interface SpeechRecognitionResultList {
	length: number;
	item(index: number): SpeechRecognitionResult;
	[index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
	length: number;
	item(index: number): SpeechRecognitionAlternative;
	[index: number]: SpeechRecognitionAlternative;
	isFinal: boolean;
}

interface SpeechRecognitionAlternative {
	transcript: string;
	confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
	error: string;
	message: string;
}

interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	maxAlternatives: number;
	onresult: ((event: SpeechRecognitionEvent) => void) | null;
	onend: (() => void) | null;
	onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
	onstart: (() => void) | null;
	onaudiostart: (() => void) | null;
	onspeechstart: (() => void) | null;
	onspeechend: (() => void) | null;
	start(): void;
	stop(): void;
	abort(): void;
}

declare global {
	interface Window {
		SpeechRecognition?: new () => SpeechRecognition;
		webkitSpeechRecognition?: new () => SpeechRecognition;
	}
}

class WebSpeechService {
	private recognition: SpeechRecognition | null = null;
	private callbacks: SpeechRecognitionCallbacks | null = null;
	private isListening = false;

	isSupported(): boolean {
		return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
	}

	startListening(callbacks: SpeechRecognitionCallbacks): boolean {
		if (!this.isSupported()) {
			callbacks.onError('Speech recognition not supported in this browser');
			return false;
		}

		if (this.isListening) {
			return true;
		}

		const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
		this.recognition = new SpeechRecognition!();
		this.callbacks = callbacks;

		this.recognition.continuous = true;
		this.recognition.interimResults = true;
		this.recognition.lang = navigator.language || 'en-US';
		this.recognition.maxAlternatives = 1;

		this.recognition.onstart = () => {
			this.isListening = true;
		};

		this.recognition.onresult = (event: SpeechRecognitionEvent) => {
			let finalTranscript = '';
			let interimTranscript = '';

			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i];
				const transcript = result[0].transcript;
				if (result.isFinal) {
					finalTranscript += transcript;
				} else {
					interimTranscript += transcript;
				}
			}

			if (finalTranscript) {
				this.callbacks?.onResult(finalTranscript, true);
			} else if (interimTranscript) {
				this.callbacks?.onResult(interimTranscript, false);
			}
		};

		this.recognition.onend = () => {
			this.isListening = false;
			this.callbacks?.onEnd();
		};

		this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
			this.isListening = false;
			// Silently ignore these common non-error cases
			if (event.error === 'aborted' || event.error === 'no-speech') {
				this.callbacks?.onEnd();
				return;
			}
			// Map error codes to user-friendly messages
			const errorMessages: Record<string, string> = {
				'not-allowed': 'Microphone access denied',
				'audio-capture': 'No microphone found',
				'network': 'Network error occurred',
				'service-not-allowed': 'Speech service not allowed'
			};
			this.callbacks?.onError(errorMessages[event.error] || `Speech error: ${event.error}`);
		};

		try {
			this.recognition.start();
			return true;
		} catch (e) {
			callbacks.onError('Failed to start speech recognition');
			return false;
		}
	}

	stopListening(): void {
		if (this.recognition && this.isListening) {
			this.recognition.stop();
		}
	}

	abort(): void {
		if (this.recognition) {
			this.recognition.abort();
			this.isListening = false;
		}
	}

	getIsListening(): boolean {
		return this.isListening;
	}
}

export const webSpeechService = new WebSpeechService();

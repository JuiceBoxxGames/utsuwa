import { providerFetch } from '../platform/provider-fetch.ts';
import {
	getSharedAudioContext,
	type ITTSProvider,
	type TTSOptions,
	type TTSSpeakResult,
	type StreamOptions
} from './index.ts';
import { providerErrorMessage } from './provider-utils.ts';

function ensureTrailingSlash(url: string): string {
	return url.endsWith('/') ? url : url + '/';
}

export class ElevenLabsTTS implements ITTSProvider {
	private apiKey: string;
	private voiceId: string;
	private model: string;
	private speed: number;
	private baseUrl: string;

	readonly capabilities = {
		streaming: false,
		emotion: false,
		multilingual: true,
		clientSideSpeed: true
	};

	constructor(options: TTSOptions) {
		this.apiKey = options.apiKey || '';
		this.voiceId = options.voiceId || 'EXAVITQu4vr4xnSDxMaL';
		this.model = options.model || 'eleven_turbo_v2_5';
		this.speed = options.speed ?? 1;
		this.baseUrl = ensureTrailingSlash(options.baseUrl || 'https://api.elevenlabs.io/v1/');
	}

	getAudioContext(): AudioContext {
		return getSharedAudioContext();
	}

	async speak(text: string): Promise<TTSSpeakResult> {
		const audioBuffer = await this.fetchAudioBuffer(text);
		return this.playAudioBuffer(audioBuffer);
	}

	async fetchAudioBuffer(text: string, options?: StreamOptions): Promise<AudioBuffer> {
		const response = await providerFetch(
			`${this.baseUrl}text-to-speech/${this.voiceId}/stream`,
			{
				method: 'POST',
				headers: {
					'xi-api-key': this.apiKey,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					text,
					model_id: this.model,
					voice_settings: {
						stability: 0.5,
						similarity_boost: 0.75
					}
				}),
				signal: options?.signal
			}
		);

		if (!response.ok) {
			// Keep the API's own explanation (voice_not_found, quota_exceeded, ...)
			// so the failure is self-diagnosing instead of a bare status code.
			let body: unknown;
			try {
				body = await response.json();
			} catch {
				// non-JSON error body
			}
			throw new Error(providerErrorMessage('ElevenLabs', response.status, body));
		}

		const arrayBuffer = await response.arrayBuffer();
		const audioContext = this.getAudioContext();

		// Resume audio context if suspended
		if (audioContext.state === 'suspended') {
			await audioContext.resume();
		}

		return audioContext.decodeAudioData(arrayBuffer);
	}

	private playAudioBuffer(audioBuffer: AudioBuffer): TTSSpeakResult {
		const audioContext = this.getAudioContext();

		const source = audioContext.createBufferSource();
		source.buffer = audioBuffer;
		source.playbackRate.value = this.speed;

		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;

		source.connect(analyser);
		analyser.connect(audioContext.destination);

		source.start(0);

		return { source, analyser };
	}
}

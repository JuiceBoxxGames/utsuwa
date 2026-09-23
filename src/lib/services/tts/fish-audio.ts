import { isTauri } from '@tauri-apps/api/core';
import {
	getSharedAudioContext,
	type ITTSProvider,
	type TTSOptions,
	type TTSSpeakResult,
	type StreamOptions
} from './index.ts';
import { FISH_AUDIO_TTS_URL } from '../providers/provider-defaults.ts';
import { providerErrorMessage } from './provider-utils.ts';

// People copy voices off fish.audio as links (fish.audio/m/<id>), so pull the
// 32-hex id out of whatever was pasted.
function toVoiceId(voice: string): string {
	return voice.match(/\b[0-9a-f]{32}\b/i)?.[0] ?? voice;
}

// Desktop builds have no server routes, but the Tauri HTTP plugin skips CORS.
async function post(init: RequestInit): Promise<Response> {
	if (isTauri()) {
		const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
		return tauriFetch(FISH_AUDIO_TTS_URL, init);
	}
	return fetch('/api/tts/fish-audio', init);
}

export class FishAudioTTS implements ITTSProvider {
	private apiKey: string;
	private voiceId: string;
	private model: string;
	private speed: number;

	readonly capabilities = {
		streaming: false,
		emotion: false,
		multilingual: true,
		// Fish Audio applies speed itself (prosody), which keeps the pitch natural
		clientSideSpeed: false
	};

	constructor(options: TTSOptions) {
		this.apiKey = options.apiKey || '';
		// Every sentence is its own request, so always name a voice or Fish Audio
		// may pick a different one each time. Sarah matches the registry default.
		this.voiceId = options.voiceId || '933563129e564b19a115bedd57b7406a';
		this.model = options.model || 's2.1-pro';
		this.speed = options.speed ?? 1;
	}

	getAudioContext(): AudioContext {
		return getSharedAudioContext();
	}

	async speak(text: string): Promise<TTSSpeakResult> {
		const audioContext = this.getAudioContext();
		const source = audioContext.createBufferSource();
		source.buffer = await this.fetchAudioBuffer(text);

		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;
		source.connect(analyser);
		analyser.connect(audioContext.destination);
		source.start(0);

		return { source, analyser };
	}

	async fetchAudioBuffer(text: string, options?: StreamOptions): Promise<AudioBuffer> {
		const response = await post({
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
				model: this.model
			},
			body: JSON.stringify({
				text,
				reference_id: toVoiceId(options?.voiceId ?? this.voiceId),
				format: 'mp3',
				prosody: { speed: options?.speed ?? this.speed }
			}),
			signal: options?.signal
		});

		if (!response.ok) {
			let body: unknown;
			try {
				body = await response.json();
			} catch {
				// non-JSON error body
			}
			throw new Error(providerErrorMessage('Fish Audio', response.status, body));
		}

		const arrayBuffer = await response.arrayBuffer();
		const audioContext = this.getAudioContext();
		if (audioContext.state === 'suspended') {
			await audioContext.resume();
		}
		return audioContext.decodeAudioData(arrayBuffer);
	}
}

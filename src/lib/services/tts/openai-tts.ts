import { isTauri } from '@tauri-apps/api/core';
import {
	getSharedAudioContext,
	type ITTSProvider,
	type TTSOptions,
	type TTSSpeakResult,
	type StreamOptions,
	type TTSCapabilities
} from './index.ts';
import {
	getTTSBaseUrl,
	getLocalTTSConnectionHint,
	getOmniVoiceConnectionHint,
	isLocalTTSProvider
} from '../providers/local-endpoints.ts';
import { providerErrorMessage, shouldProxyLocalTts } from './provider-utils.ts';

function ensureTrailingSlash(url: string): string {
	return url.endsWith('/') ? url : url + '/';
}

/**
 * Quote marks must never reach OmniVoice: measured against the live proxy,
 * inputs wrapped in double quotes ("es", „es") always return empty audio.
 * Guillemets and quoting apostrophes are dropped as well; apostrophes
 * between letters (l'osso) are kept because they shape pronunciation.
 */
const QUOTE_CHARS_RE = /["„“”«»]/g;
const QUOTING_APOSTROPHE_RE = /(?<![\p{L}\p{N}])['’]|['’](?![\p{L}\p{N}])/gu;

/** True when the text contains at least one letter or number to speak. */
function hasSpeakableChar(text: string): boolean {
	return /[\p{L}\p{N}]/u.test(text);
}

/** Primary subtag of a BCP-47-ish language tag ("es-ES" -> "es"). */
function primarySubtag(lang: string): string {
	return lang.toLowerCase().split('-')[0];
}

/**
/**
 * Sanitise the text sent to OmniVoice.
 *
 * - Quote marks around words are removed (they produce empty audio).
 * - Very short foreign-language inputs (<= 2 words) are capitalised and given
 *   a closing period ("ir" -> "Ir.") to signal a natural utterance boundary.
 *   This is more reliable than the old carrier-phrase approach and avoids
 *   the "Se dice: X — X." repetition pattern.
 *
 * Pure function, exported for unit tests. Applied to OmniVoice requests only.
 */
export function sanitizeOmniVoiceInput(
	text: string,
	language?: string,
	primaryLanguage?: string
): string {
	const clean = text
		.replace(QUOTE_CHARS_RE, '')
		.replace(QUOTING_APOSTROPHE_RE, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
	if (!hasSpeakableChar(clean)) return clean;

	// Non-verbal markers ([laughter], [sigh], ...) are rendered by OmniVoice
	// itself; enriching them would destroy the marker syntax and read the
	// marker word aloud instead.
	if (/^(?:\[[^\]]+\]\s*)+$/.test(clean)) return clean;

	const words = clean.split(/\s+/);
	if (words.length > 2) return clean;

	const isForeign =
		!!language && !!primaryLanguage && primarySubtag(language) !== primarySubtag(primaryLanguage);
	if (!isForeign) return clean;

	// Short foreign input: capitalise first letter, add a trailing period
	// so the model sees a natural utterance boundary instead of a bare word.
	const core = clean.replace(/[.!?…。！？]+\s*$/, '');
	// Inverted punctuation pairs (¿…?, ¡…!) must stay intact: swapping
	// the closing mark for a period breaks the pair.
	if (core.startsWith('¿') || core.startsWith('¡')) {
		const capped = core.charAt(0) + core.charAt(1).toUpperCase() + core.slice(2);
		return capped + (core.startsWith('¿') ? '?' : '!');
	}
	const capped = core.charAt(0).toUpperCase() + core.slice(1);
	return capped + '.';
}

function getCurrentSiteOrigin(): string | undefined {
	return typeof window !== 'undefined' ? window.location.origin : undefined;
}

/**
 * Build the request body for an OpenAI-compatible /audio/speech endpoint.
 * Exported so the body-construction logic can be unit-tested without an
 * AudioContext or a real fetch.
 *
 * Session-level defaults (language, instructions, ...) come from the provider
 * config; per-segment `streamOptions` overrides them (e.g. the alternative
 * language voice).
 */
export function buildOpenAITTSRequestBody(
	providerId: string,
	model: string,
	voiceId: string,
	speed: number,
	text: string,
	sessionOptions: {
		language?: string;
		instructions?: string;
		numStep?: number;
		positionTemperature?: number;
		classTemperature?: number;
	},
	streamOptions?: StreamOptions
): Record<string, unknown> {
	const isOmnivoice = providerId === 'omnivoice';
	// Per-segment voice overrides (e.g. alternative language voice) take precedence
	// over the provider's default/primary voice.
	const effectiveVoiceId = streamOptions?.voiceId ?? voiceId;
	// Sanitising needs the per-segment language (foreign short inputs get a
	// carrier phrase of their own language).
	const segmentLanguage = streamOptions?.language ?? sessionOptions.language;
	const body: Record<string, unknown> = {
		model,
		// OmniVoice gets a sanitised input: quote marks render as silence and
		// very short foreign inputs are unstable — see sanitizeOmniVoiceInput.
		input: isOmnivoice
			? sanitizeOmniVoiceInput(text, segmentLanguage, sessionOptions.language)
			: text,
		voice: effectiveVoiceId,
		speed: streamOptions?.speed ?? speed,
		response_format: isOmnivoice ? 'wav' : 'mp3'
	};

	if (isOmnivoice) {
		if (segmentLanguage) body.language = segmentLanguage;

		const isForeign =
			!!segmentLanguage &&
			!!sessionOptions.language &&
			primarySubtag(segmentLanguage) !== primarySubtag(sessionOptions.language);

		const instructions = streamOptions?.instructions ?? sessionOptions.instructions;
		if (instructions && !effectiveVoiceId.startsWith('clone:')) {
			body.instructions = instructions;
		}
		// OmniVoice accepts num_step in the range 4-64. 0 is invalid and would
		// trigger a server error, so we drop out-of-range values instead.
		const numStep = streamOptions?.numStep ?? sessionOptions.numStep;
		if (numStep != null && numStep >= 4 && numStep <= 64) {
			body.num_step = numStep;
		}
		const positionTemperature = streamOptions?.positionTemperature ?? sessionOptions.positionTemperature;
		if (positionTemperature != null) {
			body.position_temperature = positionTemperature;
		}
		const classTemperature = streamOptions?.classTemperature ?? sessionOptions.classTemperature;
		if (classTemperature != null) {
			body.class_temperature = classTemperature;
		}
		// Foreign (alt-language) segments get a higher guidance scale and
		// disabled silence removal to prevent the model from dropping short
		// words or producing empty audio.
		if (isForeign) {
			body.guidance_scale = 6.0;
			body.postprocess_output = false;
		}
		// Per-segment overrides, if set, take precedence over the defaults.
		if (streamOptions?.guidanceScale != null) {
			body.guidance_scale = streamOptions.guidanceScale;
		}
		if (streamOptions?.postprocessOutput != null) {
			body.postprocess_output = streamOptions.postprocessOutput;
		}
	}
	return body;
}

// Shared by OpenAI's hosted TTS and any OpenAI-compatible local server
// (Kokoro-FastAPI, openedai-speech, the OmniVoice proxy). The provider id
// decides URL normalization, whether an API key is required, the request
// format, and the failure message.
export class OpenAITTS implements ITTSProvider {
	private apiKey: string;
	private voiceId: string;
	private model: string;
	private speed: number;
	private language: string;
	private instructions: string;
	private numStep: number;
	private positionTemperature: number;
	private classTemperature: number;
	private baseUrl: string;
	private isLocal: boolean;
	private isOmniVoice: boolean;
	private isPlainLocal: boolean;
	private providerId: string;

	readonly capabilities: TTSCapabilities;

	constructor(options: TTSOptions) {
		this.providerId = options.provider;
		this.isOmniVoice = options.provider === 'omnivoice';
		this.apiKey = options.apiKey || '';
		this.voiceId = options.voiceId || 'alloy';
		this.model = options.model || (this.isOmniVoice ? 'omnivoice' : 'tts-1');
		this.speed = options.speed ?? 1;
		this.language = options.language || 'en';
		this.instructions = options.instructions || '';
		this.numStep = options.numStep ?? 32;
		this.positionTemperature = options.positionTemperature ?? 1;
		this.classTemperature = options.classTemperature ?? 0.2;
		this.isLocal = isLocalTTSProvider(options.provider);
		// omnivoice is a member of LOCAL_TTS_PROVIDERS, so isLocal alone sweeps it
		// in. URL normalization does want that; the hints and error text do not.
		this.isPlainLocal = this.isLocal && !this.isOmniVoice;
		this.baseUrl = this.isLocal
			? getTTSBaseUrl(options.provider, options.baseUrl)
			: ensureTrailingSlash(options.baseUrl || 'https://api.openai.com/v1/');

		// Only OmniVoice takes a language hint per request.
		this.capabilities = {
			streaming: false,
			emotion: false,
			multilingual: this.isOmniVoice
		};
	}

	getAudioContext(): AudioContext {
		return getSharedAudioContext();
	}

	async speak(text: string): Promise<TTSSpeakResult> {
		const audioBuffer = await this.fetchAudioBuffer(text);
		return this.playAudioBuffer(audioBuffer);
	}

	async fetchAudioBuffer(text: string, options?: StreamOptions): Promise<AudioBuffer> {
		// Segments without any speakable character (a bare ".", an empty
		// fragment) would only synthesise noise — skip the request entirely.
		if (this.isOmniVoice && !hasSpeakableChar(sanitizeOmniVoiceInput(text))) {
			return this.getAudioContext().createBuffer(1, 1, 24000);
		}

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		// Local servers don't need a key; only send auth when we actually have one.
		if (this.apiKey) {
			headers.Authorization = `Bearer ${this.apiKey}`;
		}

		const body = buildOpenAITTSRequestBody(
			this.providerId,
			this.model,
			this.voiceId,
			this.speed,
			text,
			{
				language: this.language,
				instructions: this.instructions,
				numStep: this.numStep,
				positionTemperature: this.positionTemperature,
				classTemperature: this.classTemperature
			},
			options
		);

		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}audio/speech`, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options?.signal
			});
		} catch (err) {
			// A thrown fetch is usually a refused connection or a CORS block, which
			// is the exact failure mode that broke local LLMs before they were fixed.
			if (!this.isLocal) throw err;
			const hint = new Error(
				this.isOmniVoice
					? getOmniVoiceConnectionHint(this.baseUrl, getCurrentSiteOrigin())
					: getLocalTTSConnectionHint(this.baseUrl, getCurrentSiteOrigin())
			);
			const proxy = shouldProxyLocalTts({
				isLocal: this.isLocal,
				isTauri: isTauri(),
				directFailedAtNetwork: !options?.signal?.aborted
			});
			if (!proxy) throw hint;
			response = await this.fetchViaServer(body, headers, hint, options?.signal);
		}

		if (!response.ok) {
			// OmniVoice returns structured JSON errors, so it uses the shared
			// provider message rather than the generic local-server hint.
			if (this.isPlainLocal) {
				throw new Error(
					`Local TTS server returned ${response.status} at ${this.baseUrl}. Check the model and voice are valid for this server.`
				);
			}
			let body: unknown;
			try {
				body = await response.json();
			} catch {
				// non-JSON error body
			}
			throw new Error(
				providerErrorMessage(this.isOmniVoice ? 'OmniVoice' : 'OpenAI TTS', response.status, body)
			);
		}

		const arrayBuffer = await response.arrayBuffer();
		const audioContext = this.getAudioContext();

		// OmniVoice sometimes returns a near-empty WAV for very short inputs
		// (e.g. a two-letter word): header plus a few samples. decodeAudioData
		// can reject such buffers, which would surface as a spurious "unable to
		// decode audio" error. Treat them as silence instead — the orchestrator
		// skips near-empty buffers.
		if (arrayBuffer.byteLength < 128) {
			return audioContext.createBuffer(1, 1, 24000);
		}

		if (audioContext.state === 'suspended') {
			await audioContext.resume();
		}

		return audioContext.decodeAudioData(arrayBuffer);
	}

	// One retry through the self-hosted server, which can reach engines that
	// reject the browser's origin. 403 means the server has not opted in and 404
	// means a static build with no routes; either way today's hint still applies.
	private async fetchViaServer(
		body: Record<string, unknown>,
		headers: Record<string, string>,
		hint: Error,
		signal?: AbortSignal
	): Promise<Response> {
		let response: Response;
		try {
			response = await fetch('/api/tts/local', {
				method: 'POST',
				headers,
				body: JSON.stringify({ provider: this.providerId, baseUrl: this.baseUrl, body }),
				signal
			});
		} catch {
			throw hint;
		}
		if (response.status === 403 || response.status === 404) throw hint;
		if (response.status === 400 || response.status === 502) {
			const data: unknown = await response
				.clone()
				.json()
				.catch(() => null);
			const message = (data as { message?: unknown } | null)?.message;
			if (typeof message === 'string') throw new Error(message);
		}
		return response;
	}

	private playAudioBuffer(audioBuffer: AudioBuffer): TTSSpeakResult {
		const audioContext = this.getAudioContext();

		const source = audioContext.createBufferSource();
		source.buffer = audioBuffer;

		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;

		source.connect(analyser);
		analyser.connect(audioContext.destination);

		source.start(0);

		return { source, analyser };
	}
}

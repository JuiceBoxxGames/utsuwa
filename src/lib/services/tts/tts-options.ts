import type { TTSOptions } from './index.ts';
import type { SpeechSettings } from '../modules/settings.ts';
import type { ProviderConfig, TTSProvider } from '$lib/types';
import type { ProviderMetadata } from '../providers/registry.ts';

/** Per-turn TTS options from the speech settings and the provider's saved config. */
export function buildTTSOptions(
	speech: SpeechSettings,
	provider: TTSProvider,
	config: ProviderConfig,
	meta: Pick<ProviderMetadata, 'defaultBaseUrl'> | undefined
): TTSOptions {
	const base: TTSOptions = {
		provider,
		apiKey: config.apiKey,
		voiceId: speech.activeVoiceId || undefined,
		model: speech.activeModel || config.modelId,
		baseUrl: config.baseUrl || meta?.defaultBaseUrl,
		speed: speech.speed,
		// Leave unset when the user hasn't picked one; the orchestrator
		// infers the primary language from the first segment instead.
		language: speech.activeLanguage || undefined,
		altLanguage: speech.altLanguage || undefined,
		altVoiceId: speech.altVoiceId || undefined,
		enableAltLanguage: speech.enableAltLanguage,
		altSpeed: speech.altSpeed
	};
	if (provider !== 'omnivoice') return base;
	return {
		...base,
		instructions: speech.instructions || undefined,
		altInstructions: speech.altInstructions || undefined,
		numStep: speech.numStep,
		altNumStep: speech.altNumStep,
		positionTemperature: speech.positionTemperature,
		classTemperature: speech.classTemperature,
		altPositionTemperature: speech.altPositionTemperature,
		altClassTemperature: speech.altClassTemperature
	};
}

/** The speak_segment language enum: only what the user has set up. */
export function buildSpeechToolLanguages(speech: Pick<SpeechSettings, 'activeLanguage' | 'altLanguage'>): string[] {
	const primary = speech.activeLanguage.toLowerCase() || 'en';
	const alt = speech.altLanguage.toLowerCase();
	return Array.from(new Set([primary, alt].filter(Boolean)));
}

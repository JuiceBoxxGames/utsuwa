import type { ModelInfo } from '$lib/services/providers/use-model-fetch';
import type { ProviderMetadata } from '$lib/services/providers/registry';
import type { ProviderConfig } from '$lib/types';

/**
 * Pure helpers for the LLM/TTS/STT settings UI.
 * Kept separate from the Svelte-runes state so they can be unit-tested
 * without a Svelte compiler.
 */

/**
 * Returns the model id that should be considered selected.
 * If the current selection exists in the available list it is preserved;
 * otherwise the first available model is selected.
 */
export function selectDefaultModel(
	models: ModelInfo[],
	currentModel: string | undefined
): string | undefined {
	if (!models.length) return currentModel;
	const modelExists = currentModel && models.some((m) => m.id === currentModel);
	return modelExists ? currentModel : models[0].id;
}

/**
 * Determines whether a provider is ready to have its models fetched.
 * - Custom endpoints need a base URL.
 * - Local providers are always ready.
 * - Cloud providers need an API key.
 */
export function isProviderReadyForFetch(
	provider: ProviderMetadata,
	config: ProviderConfig
): boolean {
	if (provider.custom) {
		return !!config.baseUrl;
	}
	if (provider.isLocal || !provider.requiresApiKey) {
		return true;
	}
	return !!config.apiKey;
}

/**
 * Builds a stable signature for the current provider + endpoint combination.
 * Used to avoid redundant fetches when the effect re-runs with the same values.
 */
export function createFetchSignature(providerId: string, baseUrl: string | undefined): string {
	return `${providerId}:${baseUrl ?? ''}`;
}

// ── OmniVoice voice design helpers ───────────────────────────────────────────

export const OMNI_VOICE_GENDERS = ['male', 'female'] as const;
export type OmniVoiceGender = (typeof OMNI_VOICE_GENDERS)[number];

export const OMNI_VOICE_AGES = ['child', 'teenager', 'young adult', 'middle-aged', 'elderly'] as const;
export type OmniVoiceAge = (typeof OMNI_VOICE_AGES)[number];

export const OMNI_VOICE_PITCHES = ['very low', 'low', 'moderate', 'high', 'very high'] as const;
export type OmniVoicePitch = (typeof OMNI_VOICE_PITCHES)[number];

export const OMNI_VOICE_ACCENTS = ['american', 'british', 'australian', 'indian', 'neutral'] as const;
export type OmniVoiceAccent = (typeof OMNI_VOICE_ACCENTS)[number];

export interface OmniVoiceDesign {
	gender: OmniVoiceGender;
	age: OmniVoiceAge;
	pitch: OmniVoicePitch;
	accent: OmniVoiceAccent;
}

export const DEFAULT_OMNI_VOICE_DESIGN: OmniVoiceDesign = {
	gender: 'female',
	age: 'young adult',
	pitch: 'moderate',
	accent: 'american'
};

export interface OmniVoicePresetAttributes {
	gender: string;
	age: string;
	pitch: string;
	accent: string;
}

/**
 * Builds the OmniVoice instruction string from voice design attributes.
 * Example: "female, young adult, moderate pitch, american accent".
 */
export function buildInstructions(
	gender: string,
	age: string,
	pitch: string,
	accent: string
): string {
	const accentPart = accent && accent !== 'neutral' ? `, ${accent} accent` : '';
	return `${gender}, ${age}, ${pitch} pitch${accentPart}`;
}

/**
 * Builds the OmniVoice instruction string for a preset voice.
 * If the active language is not 'en', the accent part is omitted.
 */
export function buildPresetInstructions(
	voiceId: string,
	language: string,
	presetAttributes: Record<string, OmniVoicePresetAttributes>
): string {
	const attrs = presetAttributes[voiceId] ?? DEFAULT_OMNI_VOICE_DESIGN;
	const accent = language === 'en' ? attrs.accent : '';
	return buildInstructions(attrs.gender, attrs.age, attrs.pitch, accent);
}

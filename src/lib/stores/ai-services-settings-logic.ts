import type { ModelInfo } from '$lib/services/providers/use-model-fetch';
import type { ProviderMetadata } from '$lib/services/providers/registry';
import type { ProviderConfig } from '$lib/types';
import type { SpeechSettings } from '$lib/services/modules/settings';

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

/**
 * Whether onboarding can move past the chat step. Local providers need an
 * installed model picked, custom endpoints a base URL and a typed model, and
 * cloud providers a key when they require one.
 */
export function isLlmConfigured(
	provider: ProviderMetadata | undefined,
	config: ProviderConfig,
	activeModel: string | undefined,
	models: ModelInfo[]
): boolean {
	if (!provider) return false;
	if (provider.isLocal) return !!activeModel && models.some((model) => model.id === activeModel);
	if (provider.custom) return !!config.baseUrl && !!activeModel;
	if (!provider.requiresApiKey) return true;
	return !!config.apiKey;
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

export const DEFAULT_OMNIVOICE_PRESET = 'alloy';

export const OMNIVOICE_LANGUAGES = [
	{ code: 'en', name: 'English' },
	{ code: 'de', name: 'German' },
	{ code: 'es', name: 'Spanish' },
	{ code: 'fr', name: 'French' },
	{ code: 'it', name: 'Italian' },
	{ code: 'pt', name: 'Portuguese' },
	{ code: 'ja', name: 'Japanese' },
	{ code: 'ko', name: 'Korean' },
	{ code: 'zh', name: 'Chinese' },
	{ code: 'ru', name: 'Russian' },
	{ code: 'ar', name: 'Arabic' },
	{ code: 'nl', name: 'Dutch' },
	{ code: 'pl', name: 'Polish' },
	{ code: 'tr', name: 'Turkish' },
	{ code: 'sv', name: 'Swedish' }
];

export const OMNIVOICE_TEST_PHRASES: Record<string, string> = {
	en: 'Hello, this is a test of OmniVoice text to speech.',
	de: 'Hallo, dies ist ein Test von OmniVoice.',
	es: 'Hola, esta es una prueba de OmniVoice.',
	fr: 'Bonjour, ceci est un test de OmniVoice.',
	it: 'Ciao, questo è un test di OmniVoice.',
	pt: 'Olá, este é um teste do OmniVoice.',
	ja: 'こんにちは、これはOmniVoiceのテストです。',
	ko: '안녕하세요, OmniVoice 테스트입니다.',
	zh: '你好，这是OmniVoice的测试。',
	ru: 'Здравствуйте, это тест OmniVoice.',
	ar: 'مرحباً، هذا اختبار لـ OmniVoice.',
	nl: 'Hallo, dit is een test van OmniVoice.',
	pl: 'Cześć, to jest test OmniVoice.',
	tr: 'Merhaba, bu OmniVoice bir testidir.',
	sv: 'Hej, detta är ett test av OmniVoice.'
};

export const OMNIVOICE_PRESET_ATTRIBUTES: Record<string, OmniVoicePresetAttributes> = {
	alloy: { gender: 'female', age: 'young adult', pitch: 'moderate', accent: 'american' },
	ash: { gender: 'male', age: 'young adult', pitch: 'low', accent: 'american' },
	ballad: { gender: 'male', age: 'middle-aged', pitch: 'low', accent: 'british' },
	cedar: { gender: 'male', age: 'middle-aged', pitch: 'low', accent: 'american' },
	coral: { gender: 'female', age: 'young adult', pitch: 'high', accent: 'australian' },
	echo: { gender: 'male', age: 'middle-aged', pitch: 'moderate', accent: 'canadian' },
	fable: { gender: 'female', age: 'middle-aged', pitch: 'moderate', accent: 'british' },
	marin: { gender: 'female', age: 'middle-aged', pitch: 'moderate', accent: 'canadian' },
	nova: { gender: 'female', age: 'young adult', pitch: 'high', accent: 'american' },
	onyx: { gender: 'male', age: 'middle-aged', pitch: 'very low', accent: 'british' },
	sage: { gender: 'female', age: 'elderly', pitch: 'low', accent: 'british' },
	shimmer: { gender: 'female', age: 'young adult', pitch: 'very high', accent: 'american' },
	verse: { gender: 'male', age: 'young adult', pitch: 'moderate', accent: 'british' }
};

export function omnivoicePresetInstructions(voiceId: string, language: string): string {
	return buildPresetInstructions(voiceId || DEFAULT_OMNIVOICE_PRESET, language, OMNIVOICE_PRESET_ATTRIBUTES);
}

type OmniVoiceParam = 'speed' | 'numStep' | 'positionTemperature' | 'classTemperature';

/** Synthesis sliders, shared by the primary voice and its alt* twin. */
export const OMNIVOICE_PARAMS: Array<{
	key: OmniVoiceParam & keyof SpeechSettings;
	altKey: `alt${Capitalize<OmniVoiceParam>}` & keyof SpeechSettings;
	id: string;
	label: string;
	min: number;
	max: number;
	step: number;
}> = [
	{ key: 'speed', altKey: 'altSpeed', id: 'speed', label: 'Speed', min: 0.5, max: 2, step: 0.1 },
	{ key: 'numStep', altKey: 'altNumStep', id: 'num-step', label: 'Num Step', min: 4, max: 64, step: 1 },
	{ key: 'positionTemperature', altKey: 'altPositionTemperature', id: 'position-temperature', label: 'Position Temperature', min: 0, max: 2, step: 0.1 },
	{ key: 'classTemperature', altKey: 'altClassTemperature', id: 'class-temperature', label: 'Class Temperature', min: 0, max: 2, step: 0.1 }
];

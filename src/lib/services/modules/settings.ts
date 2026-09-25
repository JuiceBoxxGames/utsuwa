// Shape and defaults of the two essential modules' settings. The store merges
// saved settings over these, so readers never need their own fallbacks.

export interface ConsciousnessSettings {
	activeProvider: string;
	activeModel?: string;
	temperature: number;
	topP: number;
	/** Unset means the provider default. */
	maxTokens?: number;
	/** Unset keeps the default memory budget. */
	contextSize?: number;
	presencePenalty: number;
	frequencyPenalty: number;
}

export interface SpeechSettings {
	activeProvider: string;
	activeModel?: string;
	activeVoiceId?: string;
	activeLanguage: string;
	enableAltLanguage: boolean;
	enableToolCalling: boolean;
	altLanguage: string;
	altVoiceId: string;
	altInstructions: string;
	altSpeed: number;
	altNumStep: number;
	altPositionTemperature: number;
	altClassTemperature: number;
	speed: number;
	instructions?: string;
	numStep: number;
	positionTemperature: number;
	classTemperature: number;
}

export const DEFAULT_CONSCIOUSNESS_SETTINGS: Readonly<ConsciousnessSettings> = {
	activeProvider: '',
	temperature: 0.7,
	topP: 1,
	presencePenalty: 0,
	frequencyPenalty: 0
};

export const DEFAULT_SPEECH_SETTINGS: Readonly<SpeechSettings> = {
	activeProvider: '',
	activeLanguage: 'en',
	enableAltLanguage: false,
	enableToolCalling: true,
	altLanguage: '',
	altVoiceId: '',
	altInstructions: '',
	altSpeed: 1,
	altNumStep: 32,
	altPositionTemperature: 1,
	altClassTemperature: 0.2,
	speed: 1,
	numStep: 32,
	positionTemperature: 1,
	classTemperature: 0.2
};

export interface TypedModuleSettings {
	consciousness: ConsciousnessSettings;
	speech: SpeechSettings;
}

export type ModuleSettings<Id extends string> = Id extends keyof TypedModuleSettings
	? TypedModuleSettings[Id]
	: Record<string, unknown>;

const MODULE_DEFAULTS: Record<string, object> = {
	consciousness: DEFAULT_CONSCIOUSNESS_SETTINGS,
	speech: DEFAULT_SPEECH_SETTINGS
};

/** Saved keys win (including 0, false, ''); missing ones come from the defaults. */
export function withModuleDefaults(moduleId: string, saved: object | undefined): Record<string, unknown> {
	return { ...MODULE_DEFAULTS[moduleId], ...saved };
}

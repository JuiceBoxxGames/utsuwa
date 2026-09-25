import type { ModuleDefinition } from '$lib/types/module';

export const speechModule: ModuleDefinition = {
	metadata: {
		id: 'speech',
		name: 'Speech',
		description: 'Text-to-Speech for voice output',
		category: 'essential',
		icon: 'volume'
	},

	settingsSchema: {
		fields: [
			{
				key: 'activeProvider',
				type: 'provider-select',
				label: 'TTS Provider',
				description: 'Select from your configured TTS providers',
				providerCategory: 'tts'
			},
			{
				key: 'activeModel',
				type: 'model-select',
				label: 'Model',
				description: 'Select a TTS model from the chosen provider',
				dependsOnField: 'activeProvider',
				providerCategory: 'tts'
			},
			{
				key: 'activeVoiceId',
				type: 'text',
				label: 'Voice ID',
				description: 'Voice identifier for the selected provider',
				placeholder: 'Select a voice'
			},
			{
				key: 'activeLanguage',
				type: 'text',
				label: 'Language',
				description: 'Primary language for multilingual TTS (ISO 639-1)',
				placeholder: 'en'
			},
			{
				key: 'enableAltLanguage',
				type: 'boolean',
				label: 'Enable Alternative Language',
				description: 'Use a different voice for foreign-language text'
			},
			{
				key: 'enableToolCalling',
				type: 'boolean',
				label: 'Enable Function Calling',
				description: 'Force language per speech segment (more reliable, but requires LLM function-calling support)'
			},
			{
				key: 'altLanguage',
				type: 'text',
				label: 'Alternative Language',
				description: 'ISO 639-1 code for the alternative language',
				placeholder: 'es'
			},
			{
				key: 'altVoiceId',
				type: 'text',
				label: 'Alternative Voice',
				description: 'Voice ID for the alternative language',
				placeholder: 'Select a voice'
			},
			{
				key: 'altInstructions',
				type: 'text',
				label: 'Alternative Voice Instructions',
				description: 'Voice design instructions for the alternative language',
				placeholder: 'e.g. male, middle-aged'
			},
			{
				key: 'altSpeed',
				type: 'number',
				label: 'Alternative Voice Speed',
				description: 'Speech rate for the alternative language (0.5-2.0). Falls back to primary speed.'
			},
			{
				key: 'altNumStep',
				type: 'number',
				label: 'Alternative Voice Num Steps',
				description: 'OmniVoice quality steps for the alternative language (4-64). Falls back to primary.'
			},
			{
				key: 'altPositionTemperature',
				type: 'number',
				label: 'Alternative Position Temperature',
				description: 'Voice diversity temperature for the alternative language (0-2). Falls back to primary.'
			},
			{
				key: 'altClassTemperature',
				type: 'number',
				label: 'Alternative Class Temperature',
				description: 'Token sampling temperature for the alternative language (0-2). Falls back to primary.'
			},
			{
				key: 'speed',
				type: 'number',
				label: 'Speed',
				description: 'Speech rate (0.5-2.0)'
			},
			{
				key: 'instructions',
				type: 'text',
				label: 'Voice Instructions',
				description: 'Natural-language description of the synthetic voice',
			},
			{
				key: 'numStep',
				type: 'number',
				label: 'Num Steps',
				description: 'OmniVoice quality steps (4-64)'
			},
			{
				key: 'positionTemperature',
				type: 'number',
				label: 'Position Temperature',
				description: 'OmniVoice position temperature (0-2)'
			},
			{
				key: 'classTemperature',
				type: 'number',
				label: 'Class Temperature',
				description: 'OmniVoice class temperature (0-2)'
			}
		]
	},

	isConfigured(settings: Record<string, unknown>): boolean {
		// Speech is configured if a provider is selected
		// Some providers (like browser TTS) don't require voice ID
		return !!settings.activeProvider;
	},

	async onEnable() {
	},

	async onDisable() {
	},

	onSettingsChange(settings: Record<string, unknown>) {
	}
};

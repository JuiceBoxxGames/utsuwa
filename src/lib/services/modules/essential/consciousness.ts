import type { ModuleDefinition } from '$lib/types/module';

export const consciousnessModule: ModuleDefinition = {
	metadata: {
		id: 'consciousness',
		name: 'Consciousness',
		description: 'Large Language Model for AI responses and reasoning',
		category: 'essential',
		icon: 'brain'
	},

	settingsSchema: {
		fields: [
			{
				key: 'activeProvider',
				type: 'provider-select',
				label: 'LLM Provider',
				description: 'Select from your configured LLM providers',
				providerCategory: 'llm'
			},
			{
				key: 'activeModel',
				type: 'model-select',
				label: 'Model',
				description: 'Select a model from the chosen provider',
				dependsOnField: 'activeProvider',
				providerCategory: 'llm'
			},
			{
				key: 'temperature',
				type: 'number',
				label: 'Temperature',
				description: 'Controls randomness in responses (0.0-2.0)'
			},
			{
				key: 'topP',
				type: 'number',
				label: 'Top P',
				description: 'Nucleus sampling threshold (0.0-1.0)'
			},
			{
				key: 'maxTokens',
				type: 'number',
				label: 'Max Tokens',
				description: 'Maximum tokens in response. Leave empty to use the provider default.'
			},
			{
				key: 'contextSize',
				type: 'number',
				label: 'Context Window',
				description: 'Maximum context size of the selected model in tokens. Used to scale memory injection and truncate history. Leave empty to keep the default behavior.'
			},
			{
				key: 'presencePenalty',
				type: 'number',
				label: 'Presence Penalty',
				description: 'Penalizes tokens that have already appeared (-2.0 to 2.0)'
			},
			{
				key: 'frequencyPenalty',
				type: 'number',
				label: 'Frequency Penalty',
				description: 'Penalizes tokens based on how often they appeared (-2.0 to 2.0)'
			}
		]
	},

	isConfigured(settings: Record<string, unknown>): boolean {
		// Consciousness is configured if a provider is selected
		return !!settings.activeProvider && !!settings.activeModel;
	},

	async onEnable() {
	},

	async onDisable() {
	},

	onSettingsChange(settings: Record<string, unknown>) {
	}
};

import type { ModuleDefinition } from '$lib/types/module';

export const visionModule: ModuleDefinition = {
	metadata: {
		id: 'vision',
		name: 'Vision',
		description: 'A separate model that describes photos for the chat model',
		category: 'essential',
		icon: 'camera'
	},

	settingsSchema: {
		fields: [
			{
				key: 'activeProvider',
				type: 'provider-select',
				label: 'Vision Provider',
				description: 'Provider for the model that looks at photos',
				providerCategory: 'llm'
			},
			{
				key: 'activeModel',
				type: 'model-select',
				label: 'Vision Model',
				description: 'A model that accepts images',
				dependsOnField: 'activeProvider',
				providerCategory: 'llm'
			}
		]
	},

	isConfigured(settings: Record<string, unknown>): boolean {
		return !!settings.activeProvider && !!settings.activeModel;
	}
};

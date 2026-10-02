// The chat model the user picked, with its key and base URL, as every caller
// (chat, the extraction fallback, generated moments) needs it.
import { modulesStore } from '$lib/stores/modules.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { getLLMProvider, type ProviderMetadata } from '$lib/services/providers/registry';
import type { LLMProvider } from '$lib/types';
import type { LLMTarget } from './transport';

export interface ActiveLLM extends LLMTarget {
	meta: ProviderMetadata | undefined;
	/** Empty when neither the user nor the registry names one. */
	model: string;
	isLocal: boolean;
	custom: boolean;
}

/** Null when chat is off, no provider is picked, or its required key is missing. */
export function resolveActiveLLM(): ActiveLLM | null {
	return resolveModuleLLM('consciousness');
}

/** True when photos should go to the separate vision model instead of the chat model. */
export function visionModelEnabled(): boolean {
	return modulesStore.isModuleEnabled('vision');
}

/** The separate vision model, or null when it's off or not fully set up. */
export function resolveVisionLLM(): ActiveLLM | null {
	const llm = resolveModuleLLM('vision');
	return llm?.model ? llm : null;
}

function resolveModuleLLM(moduleId: 'consciousness' | 'vision'): ActiveLLM | null {
	if (!modulesStore.isModuleEnabled(moduleId)) return null;
	const settings = modulesStore.getModuleSettings(moduleId);
	const provider = settings.activeProvider;
	if (!provider) return null;
	const meta = getLLMProvider(provider);
	const { apiKey, baseUrl } = settingsStore.getProviderConfig(provider);
	if (meta?.requiresApiKey && !apiKey) return null;
	return {
		provider: provider as LLMProvider,
		meta,
		model: settings.activeModel || meta?.models?.[0]?.id || '',
		apiKey: apiKey || undefined,
		baseURL: baseUrl || meta?.defaultBaseUrl,
		isLocal: !!meta?.isLocal,
		custom: !!meta?.custom
	};
}

/** What to tell the user when resolveActiveLLM() comes back empty with chat on. */
export function missingLLMMessage(): string {
	const provider = modulesStore.getModuleSettings('consciousness').activeProvider;
	const meta = provider ? getLLMProvider(provider) : undefined;
	return meta
		? `Please configure API key for ${meta.name} in Settings > LLM Model`
		: 'Please configure a provider in Settings > LLM Model';
}

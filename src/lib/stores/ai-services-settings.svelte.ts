import { modulesStore } from '$lib/stores/modules.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { getLLMProvider, getTTSProvider } from '$lib/services/providers/registry';
import { defaultVoiceForProvider } from '$lib/services/tts/provider-utils';
import type { ConsciousnessSettings, SpeechSettings } from '$lib/services/modules/settings';
import {
	fetchModels,
	getCachedModelsForProvider,
	debounce,
	type ModelInfo
} from '$lib/services/providers/use-model-fetch';
import {
	selectDefaultModel,
	isProviderReadyForFetch,
	createFetchSignature
} from './ai-services-settings-logic.ts';

/**
 * Shared helper: persists an API key and marks the provider as added when a key
 * is present. Both LLM and TTS settings use the exact same flow.
 */
function applyApiKey(providerId: string, apiKey: string) {
	settingsStore.setProviderConfig(providerId, { apiKey });
	if (apiKey) {
		settingsStore.markProviderAdded(providerId);
	}
}

/**
 * Shared reactive state for the LLM settings page.
 * Extracted from the persona page so the same UI can live in the settings sidebar.
 */
export function createLlmSettingsState() {
	const consciousnessSettings = $derived(modulesStore.getModuleSettings('consciousness'));
	const isLLMEnabled = $derived.by(() => modulesStore.isModuleEnabled('consciousness'));

	let llmIsLoading = $state(false);
	let llmFetchError = $state<string | null>(null);
	let llmDynamicModels = $state<ModelInfo[] | null>(null);
	let lastLocalLLMFetchKey = $state('');

	const staticLLMModels = $derived.by(() => {
		const providerId = consciousnessSettings.activeProvider;
		if (!providerId) return [];
		const provider = getLLMProvider(providerId);
		return provider?.models ?? [];
	});

	const llmModels = $derived(llmDynamicModels ?? staticLLMModels);

	const llmHasApiKey = $derived.by(() => {
		const providerId = consciousnessSettings.activeProvider;
		if (!providerId) return false;
		const provider = getLLMProvider(providerId);
		if (!provider) return false;
		return isProviderReadyForFetch(provider, settingsStore.getProviderConfig(providerId));
	});

	function activeLLMProviderForFetch() {
		const providerId = consciousnessSettings.activeProvider;
		if (!providerId) return null;
		const provider = getLLMProvider(providerId);
		if (!provider) return null;

		const config = settingsStore.getProviderConfig(provider.id);
		if (!isProviderReadyForFetch(provider, config)) {
			llmDynamicModels = null;
			return null;
		}
		return { provider, config };
	}

	async function fetchLLMModels() {
		const target = activeLLMProviderForFetch();
		if (!target) return;

		const cached = getCachedModelsForProvider(target.provider.id);
		if (cached) {
			llmDynamicModels = cached;
			return;
		}

		await fetchLLMModelsFromNetwork(target.provider, target.config);
	}

	// Explicit user refresh: skip the 24h cache so "pull a model, then refresh"
	// actually shows the new model. The successful fetch re-populates the cache.
	async function refreshLLMModels() {
		const target = activeLLMProviderForFetch();
		if (!target) return;
		await fetchLLMModelsFromNetwork(target.provider, target.config);
	}

	async function fetchLLMModelsFromNetwork(
		provider: NonNullable<ReturnType<typeof getLLMProvider>>,
		config: ReturnType<typeof settingsStore.getProviderConfig>
	) {
		await fetchModels({
			providerId: provider.id,
			apiKey: config.apiKey ?? '',
			baseUrl: config.baseUrl,
			isLocal: provider.isLocal,
			getCurrentProviderId: () => modulesStore.getModuleSettings('consciousness').activeProvider,
			onStart: () => {
				llmIsLoading = true;
				llmFetchError = null;
			},
			onSuccess: (models) => {
				llmIsLoading = false;
				llmDynamicModels = models;
				const currentModel = consciousnessSettings.activeModel;
				const nextModel = selectDefaultModel(models, currentModel);
				if (nextModel !== currentModel) {
					modulesStore.setModuleSetting('consciousness', 'activeModel', nextModel);
				}
			},
			onError: (error) => {
				llmIsLoading = false;
				llmFetchError = error ?? 'Could not fetch installed models';
				llmDynamicModels = provider.isLocal ? [] : null;
			},
			onEmpty: () => {
				llmIsLoading = false;
				llmFetchError = provider.isLocal
					? 'No installed models found. Pull a model, then refresh.'
					: null;
				llmDynamicModels = provider.isLocal ? [] : null;
			},
			onStale: () => {
				llmIsLoading = false;
			}
		});
	}

	const debouncedFetchLLMModels = debounce(fetchLLMModels, 300);

	function handleLLMProviderChange(providerId: string) {
		modulesStore.setModuleSetting('consciousness', 'activeProvider', providerId);
		const provider = getLLMProvider(providerId);

		llmDynamicModels = null;
		llmFetchError = null;
		llmIsLoading = false;

		const cached = getCachedModelsForProvider(providerId);
		if (cached) {
			llmDynamicModels = cached;
		}

		if (provider && !provider.isLocal && provider.models?.length) {
			modulesStore.setModuleSetting('consciousness', 'activeModel', provider.models[0].id);
		}

		if (provider?.custom) {
			modulesStore.setModuleSetting('consciousness', 'activeModel', '');
		}

		if (provider?.isLocal || !provider?.requiresApiKey) {
			settingsStore.markProviderAdded(providerId);
		}
	}

	type LlmNumberKey = 'temperature' | 'topP' | 'maxTokens' | 'contextSize' | 'presencePenalty' | 'frequencyPenalty';

	function handleLLMNumberSetting<K extends LlmNumberKey>(key: K, value: ConsciousnessSettings[K]) {
		if (value !== undefined && Number.isNaN(value)) return;
		modulesStore.setModuleSetting('consciousness', key, value);
	}

	function handleLLMModelChange(modelId: string) {
		modulesStore.setModuleSetting('consciousness', 'activeModel', modelId);
	}

	function handleLLMBaseUrlChange(providerId: string, baseUrl: string) {
		settingsStore.setProviderConfig(providerId, { baseUrl });
		llmFetchError = null;
	}

	function handleApiKeyChange(providerId: string, apiKey: string) {
		llmFetchError = null;
		applyApiKey(providerId, apiKey);
	}

	function handleLLMApiKeyBlur() {
		const providerId = consciousnessSettings.activeProvider;
		if (!providerId) return;
		const provider = getLLMProvider(providerId);
		const config = settingsStore.getProviderConfig(providerId);
		if (config.apiKey && provider && !provider.isLocal) {
			debouncedFetchLLMModels();
		}
	}

	function toggleLLM() {
		modulesStore.setModuleEnabled('consciousness', !isLLMEnabled);
	}

	return {
		get consciousnessSettings() {
			return consciousnessSettings;
		},
		get isLLMEnabled() {
			return isLLMEnabled;
		},
		get llmIsLoading() {
			return llmIsLoading;
		},
		get llmFetchError() {
			return llmFetchError;
		},
		get llmModels() {
			return llmModels;
		},
		get llmHasApiKey() {
			return llmHasApiKey;
		},
		get lastLocalLLMFetchKey() {
			return lastLocalLLMFetchKey;
		},
		set lastLocalLLMFetchKey(value: string) {
			lastLocalLLMFetchKey = value;
		},
		fetchLLMModels,
		refreshLLMModels,
		debouncedFetchLLMModels,
		handleLLMProviderChange,
		handleLLMNumberSetting,
		handleLLMModelChange,
		handleLLMBaseUrlChange,
		handleApiKeyChange,
		handleLLMApiKeyBlur,
		toggleLLM
	};
}

export type LlmSettingsState = ReturnType<typeof createLlmSettingsState>;

/**
 * Shared reactive state for the TTS settings page.
 */
export function createTtsSettingsState() {
	const speechSettings = $derived(modulesStore.getModuleSettings('speech'));
	const isTTSEnabled = $derived.by(() => modulesStore.isModuleEnabled('speech'));

	let ttsIsLoading = $state(false);
	let ttsFetchError = $state<string | null>(null);
	// Start from the cached list so a provider without static models (ElevenLabs)
	// shows the saved model instead of the placeholder until someone hits refresh.
	let ttsDynamicModels = $state<ModelInfo[] | null>(
		getCachedModelsForProvider(modulesStore.getModuleSettings('speech').activeProvider)
	);

	const staticTTSModels = $derived.by(() => {
		const providerId = speechSettings.activeProvider;
		if (!providerId) return [];
		const provider = getTTSProvider(providerId);
		return provider?.models ?? [];
	});

	const ttsModels = $derived(ttsDynamicModels ?? staticTTSModels);

	const ttsHasApiKey = $derived.by(() => {
		const providerId = speechSettings.activeProvider;
		if (!providerId) return false;
		const provider = getTTSProvider(providerId);
		if (!provider) return false;
		return isProviderReadyForFetch(provider, settingsStore.getProviderConfig(providerId));
	});

	async function fetchTTSModels() {
		const targetProvider = speechSettings.activeProvider;
		if (!targetProvider) return;
		const provider = getTTSProvider(targetProvider);
		if (!provider) return;

		const config = settingsStore.getProviderConfig(provider.id);

		await fetchModels({
			providerId: provider.id,
			apiKey: config.apiKey ?? '',
			baseUrl: config.baseUrl,
			isLocal: provider.isLocal,
			getCurrentProviderId: () => speechSettings.activeProvider,
			onStart: () => {
				ttsIsLoading = true;
				ttsFetchError = null;
			},
			onSuccess: (models) => {
				ttsIsLoading = false;
				ttsDynamicModels = models;
				const currentModel = speechSettings.activeModel;
				const nextModel = selectDefaultModel(models, currentModel);
				if (nextModel !== currentModel) {
					modulesStore.setModuleSetting('speech', 'activeModel', nextModel);
				}
			},
			onError: (error) => {
				ttsIsLoading = false;
				ttsFetchError = error ?? 'Using default list';
				ttsDynamicModels = null;
			},
			onEmpty: () => {
				ttsIsLoading = false;
				ttsDynamicModels = null;
			},
			onStale: () => {
				ttsIsLoading = false;
			}
		});
	}

	const debouncedFetchTTSModels = debounce(fetchTTSModels, 300);

	function handleTTSProviderChange(providerId: string) {
		modulesStore.setModuleSetting('speech', 'activeProvider', providerId);
		const provider = getTTSProvider(providerId);

		ttsDynamicModels = null;
		ttsFetchError = null;
		ttsIsLoading = false;

		const cached = getCachedModelsForProvider(providerId);
		if (cached) {
			ttsDynamicModels = cached;
		}

		if (provider?.models?.length) {
			modulesStore.setModuleSetting('speech', 'activeModel', provider.models[0].id);
		}

		modulesStore.setModuleSetting('speech', 'activeVoiceId', defaultVoiceForProvider(provider));

		if (provider?.isLocal || !provider?.requiresApiKey) {
			settingsStore.markProviderAdded(providerId);
		}
	}

	function setSpeech<K extends keyof SpeechSettings>(key: K, value: SpeechSettings[K]) {
		modulesStore.setModuleSetting('speech', key, value);
	}

	function handleTTSApiKeyBlur() {
		const providerId = speechSettings.activeProvider;
		if (!providerId) return;
		const provider = getTTSProvider(providerId);
		const config = settingsStore.getProviderConfig(providerId);
		if (config.apiKey && provider && !provider.isLocal) {
			debouncedFetchTTSModels();
		}
	}

	function handleApiKeyChange(providerId: string, apiKey: string) {
		ttsFetchError = null;
		applyApiKey(providerId, apiKey);
	}

	function toggleTTS() {
		modulesStore.setModuleEnabled('speech', !isTTSEnabled);
	}

	return {
		get speechSettings() {
			return speechSettings;
		},
		get isTTSEnabled() {
			return isTTSEnabled;
		},
		get ttsIsLoading() {
			return ttsIsLoading;
		},
		get ttsFetchError() {
			return ttsFetchError;
		},
		get ttsModels() {
			return ttsModels;
		},
		get ttsHasApiKey() {
			return ttsHasApiKey;
		},
		fetchTTSModels,
		debouncedFetchTTSModels,
		handleTTSProviderChange,
		setSpeech,
		handleTTSApiKeyBlur,
		handleApiKeyChange,
		toggleTTS
	};
}

export type TtsSettingsState = ReturnType<typeof createTtsSettingsState>;

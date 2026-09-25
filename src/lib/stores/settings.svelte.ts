import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import type { ProviderConfig } from '$lib/types';
import { LLM_PROVIDERS, TTS_PROVIDERS, STT_PROVIDERS } from '$lib/services/providers/registry';
import { DEFAULT_HOTKEYS, type HotkeyConfig } from '$lib/services/platform/hotkeys';

export type ProviderCategory = 'llm' | 'tts' | 'stt';

function createSettingsStore() {
	// Provider configurations (keyed by provider id)
	// This is the SINGLE SOURCE OF TRUTH for credentials
	let providerConfigs = $state<Record<string, ProviderConfig>>({});

	// Track which providers have been explicitly added by user
	let addedProviders = $state<Record<string, boolean>>({});

	// Desktop hotkey configuration
	let hotkeys = $state<HotkeyConfig>({ ...DEFAULT_HOTKEYS });

	// Load from localStorage on init
	if (browser) {
		const saved = localStorage.getItem(STORAGE_INVENTORY.localStorage.settings);
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				providerConfigs = parsed.providerConfigs ?? {};
				addedProviders = parsed.addedProviders ?? {};
				hotkeys = { ...DEFAULT_HOTKEYS, ...parsed.hotkeys };

				// Migrate old settings format if needed
				if (parsed.anthropicApiKey && !providerConfigs.anthropic) {
					providerConfigs.anthropic = { apiKey: parsed.anthropicApiKey };
					addedProviders.anthropic = true;
				}
				if (parsed.openaiApiKey && !providerConfigs.openai) {
					providerConfigs.openai = { apiKey: parsed.openaiApiKey };
					addedProviders.openai = true;
				}
				if (parsed.elevenLabsApiKey && !providerConfigs.elevenlabs) {
					providerConfigs.elevenlabs = {
						apiKey: parsed.elevenLabsApiKey,
						voiceId: parsed.elevenLabsVoiceId
					};
					addedProviders.elevenlabs = true;
				}

				// Migrate old llmProvider/ttsProvider - mark them as added
				if (parsed.llmProvider && providerConfigs[parsed.llmProvider]?.apiKey) {
					addedProviders[parsed.llmProvider] = true;
				}
				if (parsed.ttsProvider && providerConfigs[parsed.ttsProvider]?.apiKey) {
					addedProviders[parsed.ttsProvider] = true;
				}
			} catch (e) {
				console.error('Failed to load settings:', e);
			}
		}
	}

	function save() {
		if (browser) {
			localStorage.setItem(
				STORAGE_INVENTORY.localStorage.settings,
				JSON.stringify({
					providerConfigs,
					addedProviders,
					hotkeys
				})
			);
		}
	}

	// Sync settings across windows (main ↔ overlay)
	if (browser) {
		window.addEventListener('storage', (e) => {
			if (e.key === STORAGE_INVENTORY.localStorage.settings && e.newValue) {
				try {
					const parsed = JSON.parse(e.newValue);
					providerConfigs = parsed.providerConfigs ?? {};
					addedProviders = parsed.addedProviders ?? {};
					hotkeys = { ...DEFAULT_HOTKEYS, ...parsed.hotkeys };
				} catch {
					// Ignore malformed data from other window
				}
			}
		});
	}

	// Provider configuration
	function setProviderConfig(providerId: string, config: Partial<ProviderConfig>) {
		const oldApiKey = providerConfigs[providerId]?.apiKey;
		const oldBaseUrl = providerConfigs[providerId]?.baseUrl;
		providerConfigs[providerId] = {
			...providerConfigs[providerId],
			...config
		};
		// Invalidate model cache if credentials or endpoint changed.
		if ((config.apiKey && config.apiKey !== oldApiKey) || (config.baseUrl !== undefined && config.baseUrl !== oldBaseUrl)) {
			delete providerConfigs[providerId].cachedModels;
			delete providerConfigs[providerId].modelsFetchedAt;
		}
		save();
	}

	function getProviderConfig(providerId: string): ProviderConfig {
		return providerConfigs[providerId] ?? {};
	}

	// Mark a provider as added (user has explicitly added it to their setup)
	function markProviderAdded(providerId: string) {
		addedProviders[providerId] = true;
		save();
	}

	// Remove a provider from user's setup
	function removeProvider(providerId: string) {
		delete addedProviders[providerId];
		delete providerConfigs[providerId];
		save();
	}

	// Check if a provider has been added by user
	function isProviderAdded(providerId: string): boolean {
		return addedProviders[providerId] ?? false;
	}

	// Check if a provider is properly configured (has required credentials)
	function isProviderConfigured(providerId: string): boolean {
		const config = providerConfigs[providerId];
		if (!config) return false;

		// Find the provider metadata to check if it requires an API key
		const llmProvider = LLM_PROVIDERS.find((p) => p.id === providerId);
		const ttsProvider = TTS_PROVIDERS.find((p) => p.id === providerId);
		const sttProvider = STT_PROVIDERS.find((p) => p.id === providerId);
		const provider = llmProvider || ttsProvider || sttProvider;

		if (!provider) return false;

		// Local providers don't require API keys
		if (provider.isLocal) return true;
		if (!provider.requiresApiKey) return true;

		// For providers that require API key, check if it's set
		return !!config.apiKey;
	}

	// Get all configured providers for a category
	function getConfiguredProviders(category: ProviderCategory): string[] {
		const providers = category === 'llm' ? LLM_PROVIDERS : category === 'tts' ? TTS_PROVIDERS : STT_PROVIDERS;

		return providers
			.filter((p) => {
				const isAdded = isProviderAdded(p.id);
				const isConfigured = isProviderConfigured(p.id);
				return isAdded && isConfigured;
			})
			.map((p) => p.id);
	}

	// Get all added providers (even if not fully configured)
	function getAddedProviders(category: ProviderCategory): string[] {
		const providers = category === 'llm' ? LLM_PROVIDERS : category === 'tts' ? TTS_PROVIDERS : STT_PROVIDERS;

		return providers.filter((p) => isProviderAdded(p.id)).map((p) => p.id);
	}

	// Legacy compatibility getters
	function getAnthropicApiKey(): string {
		return providerConfigs.anthropic?.apiKey ?? '';
	}

	function getOpenaiApiKey(): string {
		return providerConfigs.openai?.apiKey ?? '';
	}

	function getElevenLabsApiKey(): string {
		return providerConfigs.elevenlabs?.apiKey ?? '';
	}

	// Legacy compatibility setters
	function setAnthropicApiKey(key: string) {
		setProviderConfig('anthropic', { apiKey: key });
		markProviderAdded('anthropic');
	}

	function setOpenaiApiKey(key: string) {
		setProviderConfig('openai', { apiKey: key });
		markProviderAdded('openai');
	}

	function setElevenLabsApiKey(key: string) {
		setProviderConfig('elevenlabs', { apiKey: key });
		markProviderAdded('elevenlabs');
	}

	// Cached models management
	const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

	function setCachedModels(providerId: string, models: Array<{ id: string; name: string }>) {
		setProviderConfig(providerId, {
			cachedModels: models,
			modelsFetchedAt: Date.now()
		});
	}

	function getCachedModels(providerId: string): Array<{ id: string; name: string }> | null {
		const config = providerConfigs[providerId];
		if (!config?.cachedModels) return null;

		// Check if cache has expired
		const age = Date.now() - (config.modelsFetchedAt ?? 0);
		if (age > CACHE_TTL_MS) return null;

		return config.cachedModels;
	}

	// Hotkey configuration
	function setHotkey(action: keyof HotkeyConfig, shortcut: string) {
		hotkeys[action] = shortcut;
		save();
	}

	function resetHotkeys() {
		hotkeys = { ...DEFAULT_HOTKEYS };
		save();
	}

	return {
		// Provider configs
		get providerConfigs() {
			return providerConfigs;
		},
		get addedProviders() {
			return addedProviders;
		},

		// Legacy compatibility getters
		get anthropicApiKey() {
			return getAnthropicApiKey();
		},
		get openaiApiKey() {
			return getOpenaiApiKey();
		},
		get elevenLabsApiKey() {
			return getElevenLabsApiKey();
		},

		// Provider management
		setProviderConfig,
		getProviderConfig,
		markProviderAdded,
		removeProvider,
		isProviderAdded,
		isProviderConfigured,
		getConfiguredProviders,
		getAddedProviders,

		// Legacy compatibility setters
		setAnthropicApiKey,
		setOpenaiApiKey,
		setElevenLabsApiKey,

		// Cached models
		setCachedModels,
		getCachedModels,

		// Hotkeys
		get hotkeys() {
			return hotkeys;
		},
		setHotkey,
		resetHotkeys
	};
}

export const settingsStore = createSettingsStore();

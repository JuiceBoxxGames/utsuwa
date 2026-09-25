<script lang="ts">
	import Switch from '$lib/components/ui/Switch.svelte';
	import { Icon, ProviderDropdown, ModelDropdown, ContextSizeSlider } from '$lib/components/ui';
	import { modulesStore } from '$lib/stores/modules.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { getLLMProvider, getTTSProvider } from '$lib/services/providers/registry';
	import { defaultVoiceForProvider } from '$lib/services/tts/provider-utils';
	import {
		fetchModels,
		getCachedModelsForProvider,
		debounce,
		type ModelInfo
	} from '$lib/services/providers/use-model-fetch';
	import { DOCS_URL } from '$lib/config/site';
	import { isTauri } from '$lib/services/platform';

	const LOCAL_LLM_DOCS_URL = `${DOCS_URL}/guides/local-llm-setup#allowing-utsuwa-to-reach-ollama`;

	// Always open the docs subdomain; on desktop route it to the system browser.
	function openLocalLlmDocs(e: MouseEvent) {
		if (isTauri()) {
			e.preventDefault();
			import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(LOCAL_LLM_DOCS_URL));
		}
	}

	interface Props {
		onNext: () => void;
		onBack: () => void;
		stage: 'chat' | 'voice';
		ttsEnabled?: boolean;
	}

	let { onNext, onBack, stage, ttsEnabled = $bindable(false) }: Props = $props();

	function handleContextSizeChange(value: number | undefined) {
		modulesStore.setModuleSetting('consciousness', 'contextSize', value);
	}

	// LLM State
	const llmSettings = $derived(modulesStore.getModuleSettings('consciousness'));
	const llmProvider = $derived(getLLMProvider(llmSettings.activeProvider));
	const staticLLMModels = $derived(llmProvider?.models ?? []);
	const llmContextSize = $derived(llmSettings.contextSize);

	// Dynamic model fetching state for LLM
	let llmIsLoading = $state(false);
	let llmFetchError = $state<string | null>(null);
	let llmDynamicModels = $state<ModelInfo[] | null>(null);
	let lastLocalLLMFetchKey = $state('');

	// Use dynamic models if available, otherwise static
	const llmModels = $derived(llmDynamicModels ?? staticLLMModels);

	// Check if API key is present for current LLM provider
	const llmHasApiKey = $derived.by(() => {
		if (!llmProvider) return false;
		if (llmProvider.isLocal || !llmProvider.requiresApiKey) return true;
		const config = settingsStore.getProviderConfig(llmProvider.id);
		return !!config.apiKey;
	});

	// TTS state

	const ttsSettings = $derived(modulesStore.getModuleSettings('speech'));
	const ttsProvider = $derived(getTTSProvider(ttsSettings.activeProvider));
	const staticTTSModels = $derived(ttsProvider?.models ?? []);

	// Dynamic model fetching state for TTS
	let ttsIsLoading = $state(false);
	let ttsFetchError = $state<string | null>(null);
	let ttsDynamicModels = $state<ModelInfo[] | null>(null);

	// Use dynamic models if available, otherwise static
	const ttsModels = $derived(ttsDynamicModels ?? staticTTSModels);

	// Check if API key is present for current TTS provider
	const ttsHasApiKey = $derived.by(() => {
		if (!ttsProvider) return false;
		if (ttsProvider.isLocal || !ttsProvider.requiresApiKey) return true;
		const config = settingsStore.getProviderConfig(ttsProvider.id);
		return !!config.apiKey;
	});

	// Validation
	const isLLMConfigured = $derived.by(() => {
		if (!llmSettings.activeProvider) return false;
		const provider = getLLMProvider(llmSettings.activeProvider);
		if (!provider) return false;
		if (provider.isLocal) {
			const activeModel = llmSettings.activeModel;
			return !!activeModel && llmModels.some((model) => model.id === activeModel);
		}
		// Custom endpoints need a base URL and a hand-entered model to work.
		if (provider.custom) {
			const config = settingsStore.getProviderConfig(provider.id);
			return !!config.baseUrl && !!llmSettings.activeModel;
		}
		if (!provider.requiresApiKey) return true;
		const config = settingsStore.getProviderConfig(provider.id);
		return !!config.apiKey;
	});

	// Fetch LLM models from provider API
	async function fetchLLMModels() {
		const targetProvider = llmProvider?.id;
		if (!targetProvider) return;

		const config = settingsStore.getProviderConfig(targetProvider);

		await fetchModels({
			providerId: targetProvider,
			apiKey: config.apiKey ?? '',
			baseUrl: config.baseUrl,
			isLocal: llmProvider?.isLocal,
			getCurrentProviderId: () => llmProvider?.id,
			onStart: () => {
				llmIsLoading = true;
				llmFetchError = null;
			},
			onSuccess: (models) => {
				llmIsLoading = false;
				llmDynamicModels = models;
				const currentModel = llmSettings.activeModel;
				const modelExists = models.some((m) => m.id === currentModel);
				if (!currentModel || !modelExists) {
					modulesStore.setModuleSetting('consciousness', 'activeModel', models[0].id);
				}
			},
			onError: (error) => {
				llmIsLoading = false;
				llmFetchError = error ?? 'Could not fetch installed models';
				llmDynamicModels = llmProvider?.isLocal ? [] : null;
			},
			onEmpty: () => {
				llmIsLoading = false;
				llmFetchError = llmProvider?.isLocal
					? 'No installed models found. Pull a model, then refresh.'
					: null;
				llmDynamicModels = llmProvider?.isLocal ? [] : null;
			},
			onStale: () => {
				llmIsLoading = false;
			}
		});
	}

	// Fetch TTS models from provider API
	async function fetchTTSModels() {
		const targetProvider = ttsProvider?.id;
		if (!targetProvider) return;

		const config = settingsStore.getProviderConfig(targetProvider);

		await fetchModels({
			providerId: targetProvider,
			apiKey: config.apiKey ?? '',
			baseUrl: config.baseUrl,
			isLocal: ttsProvider?.isLocal,
			getCurrentProviderId: () => ttsProvider?.id,
			onStart: () => {
				ttsIsLoading = true;
				ttsFetchError = null;
			},
			onSuccess: (models) => {
				ttsIsLoading = false;
				ttsDynamicModels = models;
				// Auto-select first model if none selected
				if (!ttsSettings.activeModel && models.length > 0) {
					modulesStore.setModuleSetting('speech', 'activeModel', models[0].id);
				}
			},
			onError: () => {
				ttsIsLoading = false;
				ttsFetchError = 'Using default list';
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

	// Debounced fetch to avoid rapid API calls
	const debouncedFetchLLMModels = debounce(fetchLLMModels, 300);
	const debouncedFetchTTSModels = debounce(fetchTTSModels, 300);

	$effect(() => {
		if (stage !== 'chat') return;
		if (!llmProvider?.isLocal) {
			lastLocalLLMFetchKey = '';
			return;
		}

		const baseUrl = settingsStore.getProviderConfig(llmProvider.id).baseUrl ?? llmProvider.defaultBaseUrl ?? '';
		const fetchKey = `${llmProvider.id}:${baseUrl}`;

		if (fetchKey !== lastLocalLLMFetchKey) {
			lastLocalLLMFetchKey = fetchKey;
			debouncedFetchLLMModels();
		}
	});

	// Handlers
	function handleLLMProviderChange(providerId: string) {
		modulesStore.setModuleSetting('consciousness', 'activeProvider', providerId);
		const provider = getLLMProvider(providerId);

		// Reset dynamic models when provider changes
		llmDynamicModels = null;
		llmFetchError = null;
		llmIsLoading = false;

		// Check for cached models
		const cached = getCachedModelsForProvider(providerId);
		if (cached) {
			llmDynamicModels = cached;
		}

		if (provider && !provider.isLocal && provider.models?.length) {
			modulesStore.setModuleSetting('consciousness', 'activeModel', provider.models[0].id);
		}
		// Custom endpoints have no preset models; clear any stale selection so the
		// manual model field starts empty.
		if (provider?.custom) {
			modulesStore.setModuleSetting('consciousness', 'activeModel', '');
		}
		// Mark local providers as added immediately (they don't need API keys)
		if (provider?.isLocal || !provider?.requiresApiKey) {
			settingsStore.markProviderAdded(providerId);
		}
	}

	function handleLLMModelChange(modelId: string) {
		modulesStore.setModuleSetting('consciousness', 'activeModel', modelId);
	}

	function handleLLMApiKeyChange(apiKey: string) {
		if (llmProvider) {
			llmFetchError = null; // Clear error when user types
			settingsStore.setProviderConfig(llmProvider.id, { apiKey });
			if (apiKey) {
				settingsStore.markProviderAdded(llmProvider.id);
			}
		}
	}

	function handleLLMApiKeyBlur() {
		const config = settingsStore.getProviderConfig(llmProvider?.id ?? '');
		if (config.apiKey && llmProvider && !llmProvider.isLocal) {
			debouncedFetchLLMModels();
		}
	}

	function handleLLMBaseUrlChange(baseUrl: string) {
		if (llmProvider) {
			settingsStore.setProviderConfig(llmProvider.id, { baseUrl });
			llmFetchError = null;
		}
	}

	function handleTTSProviderChange(providerId: string) {
		modulesStore.setModuleSetting('speech', 'activeProvider', providerId);
		const provider = getTTSProvider(providerId);

		// Reset dynamic models when provider changes
		ttsDynamicModels = null;
		ttsFetchError = null;
		ttsIsLoading = false;

		// Check for cached models
		const cached = getCachedModelsForProvider(providerId);
		if (cached) {
			ttsDynamicModels = cached;
		}

		if (provider?.models?.length) {
			modulesStore.setModuleSetting('speech', 'activeModel', provider.models[0].id);
		}
		// Voice ids are provider-specific (a Kokoro voice id means nothing to
		// ElevenLabs), so switching providers always resets the voice: the new
		// provider's first declared voice, or empty so its own default applies.
		// Carrying the old value over made the next provider 404 silently.
		modulesStore.setModuleSetting('speech', 'activeVoiceId', defaultVoiceForProvider(provider));
		// Mark local providers as added immediately (they don't need API keys)
		if (provider?.isLocal || !provider?.requiresApiKey) {
			settingsStore.markProviderAdded(providerId);
		}
	}

	function handleTTSVoiceChange(voiceId: string) {
		modulesStore.setModuleSetting('speech', 'activeVoiceId', voiceId.trim());
	}

	function handleTTSModelChange(modelId: string) {
		modulesStore.setModuleSetting('speech', 'activeModel', modelId);
	}

	function handleTTSApiKeyChange(apiKey: string) {
		if (ttsProvider) {
			ttsFetchError = null; // Clear error when user types
			settingsStore.setProviderConfig(ttsProvider.id, { apiKey });
			if (apiKey) {
				settingsStore.markProviderAdded(ttsProvider.id);
			}
		}
	}

	function handleTTSApiKeyBlur() {
		const config = settingsStore.getProviderConfig(ttsProvider?.id ?? '');
		if (config.apiKey && ttsProvider && !ttsProvider.isLocal) {
			debouncedFetchTTSModels();
		}
	}

	function handleTTSBaseUrlChange(baseUrl: string) {
		if (ttsProvider) {
			settingsStore.setProviderConfig(ttsProvider.id, { baseUrl });
		}
	}

	async function handleNext() {
		if (stage === 'chat') await modulesStore.setModuleEnabled('consciousness', true);
		else await modulesStore.setModuleEnabled('speech', ttsEnabled && !!ttsSettings.activeProvider);
		onNext();
	}
</script>

{#snippet troubleHelp()}
	<p class="provider-help">
		Having trouble? Click <a
			href={LOCAL_LLM_DOCS_URL}
			target="_blank"
			rel="noopener"
			onclick={openLocalLlmDocs}>here</a
		>
	</p>
{/snippet}

<div class="ob-step services-step">
	<div class="ob-head">
		<h2 class="ob-title" tabindex="-1">{stage === 'chat' ? 'Connect a chat model' : 'Want to hear them?'}</h2>
		<p class="ob-subtitle">{stage === 'chat' ? 'Choose the service that powers your conversations. You can connect it later in Settings.' : 'Add spoken replies, or keep things quiet for now.'}</p>
	</div>

	{#if stage === 'chat'}
	<!-- LLM Section -->
	<div class="service-section">
		<div class="service-header">
			<Icon name="brain" size={16} />
			<span class="service-title">Chat provider</span>
		</div>

		<ProviderDropdown
			type="llm"
			value={llmSettings.activeProvider}
			onSelect={handleLLMProviderChange}
			placeholder="Select LLM provider..."
		/>

		{#if llmProvider?.requiresApiKey || llmProvider?.custom}
			<input
				type="password"
				class="api-key-input"
				class:error={llmFetchError}
				aria-label="Chat API key"
				placeholder={llmProvider?.custom ? 'API Key (optional)' : 'Enter API Key...'}
				value={settingsStore.getProviderConfig(llmProvider.id).apiKey ?? ''}
				oninput={(e) => handleLLMApiKeyChange(e.currentTarget.value)}
				onblur={llmProvider?.custom ? undefined : handleLLMApiKeyBlur}
			/>
		{/if}

		<!-- Base URL for local providers and custom OpenAI-compatible endpoints -->
		{#if llmProvider?.isLocal || llmProvider?.custom}
			{#if llmProvider.isLocal && llmFetchError}
				<div class="provider-error">
					<p class="provider-note error">
						<Icon name="alert-circle" size={14} />
						{llmFetchError}
					</p>
					{@render troubleHelp()}
				</div>
			{/if}
			<input
				type="text"
				class="api-key-input"
				placeholder={llmProvider.custom
					? 'https://api.openai.com/v1/ or your endpoint'
					: llmProvider.defaultBaseUrl || 'http://localhost:11434/v1/'}
				value={settingsStore.getProviderConfig(llmProvider.id).baseUrl ?? ''}
				oninput={(e) => handleLLMBaseUrlChange(e.currentTarget.value)}
				onblur={llmProvider.custom ? undefined : fetchLLMModels}
			/>
			{#if llmProvider.isLocal}
				<p class="provider-note">
					<Icon name="check-circle" size={14} />
					Local provider, no API key needed
				</p>
				{#if !llmFetchError}
					{@render troubleHelp()}
				{/if}
			{/if}
		{/if}

		<!-- Model: manual entry for custom endpoints, discovered dropdown otherwise -->
		{#if llmProvider?.custom}
			{@const customConfig = settingsStore.getProviderConfig(llmProvider.id)}
			<input
				type="text"
				class="api-key-input"
				placeholder="Model (e.g. gpt-4o-mini, meta-llama/llama-3-70b)"
				value={llmSettings.activeModel ?? ''}
				oninput={(e) => handleLLMModelChange(e.currentTarget.value.trim())}
			/>
			{#if customConfig.baseUrl}
				<ModelDropdown
					models={llmModels}
					value={llmSettings.activeModel}
					onSelect={handleLLMModelChange}
					placeholder="Pick a fetched model..."
					isLoading={llmIsLoading}
					onRefresh={fetchLLMModels}
					disabled={false}
				/>
			{:else}
				<p class="provider-note">Enter a base URL to fetch available models.</p>
			{/if}
		{:else if llmSettings.activeProvider}
			<ModelDropdown
				models={llmModels}
				value={llmSettings.activeModel}
				onSelect={handleLLMModelChange}
				placeholder="Select model..."
				isLoading={llmIsLoading}
				onRefresh={llmHasApiKey ? fetchLLMModels : undefined}
				disabled={!llmHasApiKey}
				disabledMessage="Enter API key first"
			/>
		{/if}

		<details class="ob-advanced"><summary>Advanced options</summary>
		<ContextSizeSlider
			contextSize={llmContextSize}
			onChange={handleContextSizeChange}
			id="ob-llm-context-size-toggle"
		/>
		</details>
	</div>

	{:else}
	<!-- TTS Section -->
	<div class="service-section">
		<div class="service-header">
			<Icon name="mic" size={16} />
			<span class="service-title">Spoken replies</span>

			<Switch label="Spoken replies" checked={ttsEnabled} onchange={(value) => ttsEnabled = value} />
		</div>

		{#if ttsEnabled}
			<ProviderDropdown
				type="tts"
				value={ttsSettings.activeProvider}
				onSelect={handleTTSProviderChange}
				placeholder="Select TTS provider..."
			/>

			{#if ttsProvider?.requiresApiKey}
				<input
					type="password"
					class="api-key-input"
					class:error={ttsFetchError}
					aria-label="Voice API key" placeholder="Enter API Key..."
					value={settingsStore.getProviderConfig(ttsProvider.id).apiKey ?? ''}
					oninput={(e) => handleTTSApiKeyChange(e.currentTarget.value)}
					onblur={handleTTSApiKeyBlur}
				/>
			{/if}

			{#if ttsSettings.activeProvider && !ttsProvider?.isLocal}
				<ModelDropdown
					models={ttsModels}
					value={ttsSettings.activeModel}
					onSelect={handleTTSModelChange}
					placeholder="Select model..."
					isLoading={ttsIsLoading}
					onRefresh={ttsHasApiKey ? fetchTTSModels : undefined}
					disabled={!ttsHasApiKey}
					disabledMessage="Enter API key first"
				/>
			{/if}

			{#if ttsProvider?.id === 'elevenlabs' || ttsProvider?.id === 'fish-audio'}
				<input
					type="text"
					class="api-key-input"
					list="{ttsProvider.id}-voices"
					placeholder="Voice ID"
					value={ttsSettings.activeVoiceId ?? ''}
					oninput={(e) => handleTTSVoiceChange(e.currentTarget.value)}
				/>
				<datalist id="{ttsProvider.id}-voices">
					{#each ttsProvider?.voices ?? [] as voice}
						<option value={voice.id}>{voice.name}</option>
					{/each}
				</datalist>
			{/if}

			{#if ttsProvider?.isLocal}
				<input
					type="text"
					class="api-key-input"
					placeholder="Model/voice name"
					value={ttsSettings.activeModel ?? ''}
					oninput={(e) => handleTTSModelChange(e.currentTarget.value)}
				/>
			{/if}

			{#if ttsProvider?.isLocal}
				<input
					type="text"
					class="api-key-input"
					placeholder={ttsProvider.defaultBaseUrl || 'http://localhost:5000/'}
					value={settingsStore.getProviderConfig(ttsProvider.id).baseUrl ?? ''}
					oninput={(e) => handleTTSBaseUrlChange(e.currentTarget.value)}
				/>
				<p class="provider-note">
					<Icon name="check-circle" size={14} />
					Local provider - no API key needed
				</p>
			{/if}
		{:else}
			<p class="skip-note">Enable to add voice to your companion</p>
		{/if}
	</div>

	<p class="skip-note">You can use the microphone button to speak instead of type. Transcription options live in Settings.</p>
	{/if}

	<div class="ob-actions ob-actions--split">
		<button class="btn btn-secondary" onclick={onBack}>
			<Icon name="chevron-left" size={16} />
			Back
		</button>
		<button class="btn btn-primary" onclick={handleNext} disabled={stage === 'chat' ? !isLLMConfigured : ttsEnabled && (!ttsSettings.activeProvider || !ttsHasApiKey)}>
			Next
			<Icon name="chevron-right" size={16} />
		</button>
	</div>
	<button class="btn btn-ghost btn-block" onclick={onNext}>Set up later</button>
	<p class="ob-hint">Provider keys save on this device. Requests go to the provider you choose.</p>
</div>

<style>
	.service-header > :global(.ui-switch) { margin-left: auto; }
	/* Scrollable variant of the shared ob-step layout */
	.services-step {
		max-height: 70vh;
		overflow-y: auto;
	}

	.service-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.1rem;
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	.service-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text-secondary);
	}

	.service-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.api-key-input {
		width: 100%;
		padding: 6px 11px;
		min-height: 32px;
		background: var(--bg-secondary);
		border-radius: var(--radius-lg);
		font-size: 0.9rem;
		font-family: inherit;
		color: var(--text-primary);
		transition: box-shadow 0.15s, background 0.15s;
	}

	.api-key-input::placeholder {
		color: var(--text-tertiary);
	}

	.api-key-input:focus {
		outline: none;
		background: var(--bg-primary);
		box-shadow: 0 0 0 3px var(--accent-muted);
	}

	.api-key-input.error {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-error), transparent 78%);
		animation: shake 0.4s ease-out;
	}

	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		20% { transform: translateX(-4px); }
		40% { transform: translateX(4px); }
		60% { transform: translateX(-3px); }
		80% { transform: translateX(2px); }
	}

	.provider-note {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin: 0;
		font-size: 0.75rem;
		color: var(--color-success);
	}

	.provider-note :global(svg) {
		flex-shrink: 0;
	}

	.provider-note.error {
		align-items: flex-start;
		line-height: 1.45;
		color: var(--color-error);
	}

	.provider-error {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.provider-error .provider-help {
		margin: 0;
	}

	.provider-help {
		margin: 0.375rem 0 0;
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}

	.provider-help a {
		color: var(--text-secondary);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.provider-help a:hover {
		color: var(--text-primary);
	}

	.skip-note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-tertiary);
	}

</style>

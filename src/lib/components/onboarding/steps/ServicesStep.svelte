<script lang="ts">
	import Switch from '$lib/components/ui/Switch.svelte';
	import { Icon, ProviderDropdown, ModelDropdown, ContextSizeSlider } from '$lib/components/ui';
	import { modulesStore } from '$lib/stores/modules.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { createLlmSettingsState, createTtsSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import { createFetchSignature } from '$lib/stores/ai-services-settings-logic';
	import { getLLMProvider, getTTSProvider } from '$lib/services/providers/registry';
	import { debounce } from '$lib/services/providers/use-model-fetch';
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

	const llm = createLlmSettingsState();
	const tts = createTtsSettingsState();
	const llmSettings = $derived(llm.consciousnessSettings);
	const ttsSettings = $derived(tts.speechSettings);
	const llmProvider = $derived(getLLMProvider(llmSettings.activeProvider));
	const ttsProvider = $derived(getTTSProvider(ttsSettings.activeProvider));

	// Setup always asks the provider instead of the 24h model cache, so a stale
	// model from an earlier session gets swapped for one the provider has.
	const refreshLLMModelsSoon = debounce(llm.refreshLLMModels, 300);

	$effect(() => {
		if (stage !== 'chat') return;
		if (!llmProvider?.isLocal) {
			llm.lastLocalLLMFetchKey = '';
			return;
		}
		const baseUrl = settingsStore.getProviderConfig(llmProvider.id).baseUrl ?? llmProvider.defaultBaseUrl ?? '';
		const fetchKey = createFetchSignature(llmProvider.id, baseUrl);
		if (fetchKey !== llm.lastLocalLLMFetchKey) {
			llm.lastLocalLLMFetchKey = fetchKey;
			refreshLLMModelsSoon();
		}
	});

	function handleLLMApiKeyBlur() {
		if (llmProvider && !llmProvider.isLocal && settingsStore.getProviderConfig(llmProvider.id).apiKey) {
			refreshLLMModelsSoon();
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
		Having trouble? Click <a href={LOCAL_LLM_DOCS_URL} target="_blank" rel="noopener" onclick={openLocalLlmDocs}>here</a>
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

		<ProviderDropdown type="llm" value={llmSettings.activeProvider} onSelect={llm.handleLLMProviderChange} placeholder="Select LLM provider..." />

		{#if llmProvider?.requiresApiKey || llmProvider?.custom}
			<input type="password" class="api-key-input" class:error={llm.llmFetchError} aria-label="Chat API key"
				placeholder={llmProvider?.custom ? 'API Key (optional)' : 'Enter API Key...'}
				value={settingsStore.getProviderConfig(llmProvider.id).apiKey ?? ''}
				oninput={(e) => llm.handleApiKeyChange(llmProvider.id, e.currentTarget.value)}
				onblur={llmProvider?.custom ? undefined : handleLLMApiKeyBlur} />
		{/if}

		<!-- Base URL for local providers and custom OpenAI-compatible endpoints -->
		{#if llmProvider?.isLocal || llmProvider?.custom}
			{#if llmProvider.isLocal && llm.llmFetchError}
				<div class="provider-error">
					<p class="provider-note error">
						<Icon name="alert-circle" size={14} />
						{llm.llmFetchError}
					</p>
					{@render troubleHelp()}
				</div>
			{/if}
			<input type="text" class="api-key-input"
				placeholder={llmProvider.custom ? 'https://api.openai.com/v1/ or your endpoint' : llmProvider.defaultBaseUrl || 'http://localhost:11434/v1/'}
				value={settingsStore.getProviderConfig(llmProvider.id).baseUrl ?? ''}
				oninput={(e) => llm.handleLLMBaseUrlChange(llmProvider.id, e.currentTarget.value)}
				onblur={llmProvider.custom ? undefined : llm.refreshLLMModels} />
			{#if llmProvider.isLocal}
				<p class="provider-note">
					<Icon name="check-circle" size={14} />
					Local provider, no API key needed
				</p>
				{#if !llm.llmFetchError}
					{@render troubleHelp()}
				{/if}
			{/if}
		{/if}

		<!-- Model: manual entry for custom endpoints, discovered dropdown otherwise -->
		{#if llmProvider?.custom}
			{@const customConfig = settingsStore.getProviderConfig(llmProvider.id)}
			<input type="text" class="api-key-input" placeholder="Model (e.g. gpt-4o-mini, meta-llama/llama-3-70b)" value={llmSettings.activeModel ?? ''}
				oninput={(e) => llm.handleLLMModelChange(e.currentTarget.value.trim())} />
			{#if customConfig.baseUrl}
				<ModelDropdown models={llm.llmModels} value={llmSettings.activeModel} onSelect={llm.handleLLMModelChange} placeholder="Pick a fetched model..."
					isLoading={llm.llmIsLoading} onRefresh={llm.refreshLLMModels} disabled={false} />
			{:else}
				<p class="provider-note">Enter a base URL to fetch available models.</p>
			{/if}
		{:else if llmSettings.activeProvider}
			<ModelDropdown models={llm.llmModels} value={llmSettings.activeModel} onSelect={llm.handleLLMModelChange} placeholder="Select model..."
				isLoading={llm.llmIsLoading} onRefresh={llm.llmHasApiKey ? llm.refreshLLMModels : undefined}
				disabled={!llm.llmHasApiKey} disabledMessage="Enter API key first" />
		{/if}

		<details class="ob-advanced"><summary>Advanced options</summary>
		<ContextSizeSlider contextSize={llmSettings.contextSize} onChange={(value) => llm.handleLLMNumberSetting('contextSize', value)} id="ob-llm-context-size-toggle" />
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
			<ProviderDropdown type="tts" value={ttsSettings.activeProvider} onSelect={tts.handleTTSProviderChange} placeholder="Select TTS provider..." />

			{#if ttsProvider?.requiresApiKey}
				<input type="password" class="api-key-input" class:error={tts.ttsFetchError} aria-label="Voice API key" placeholder="Enter API Key..."
					value={settingsStore.getProviderConfig(ttsProvider.id).apiKey ?? ''}
					oninput={(e) => tts.handleApiKeyChange(ttsProvider.id, e.currentTarget.value)} onblur={tts.handleTTSApiKeyBlur} />
			{/if}

			{#if ttsSettings.activeProvider && !ttsProvider?.isLocal}
				<ModelDropdown models={tts.ttsModels} value={ttsSettings.activeModel} onSelect={(id) => tts.setSpeech('activeModel', id)} placeholder="Select model..."
					isLoading={tts.ttsIsLoading} onRefresh={tts.ttsHasApiKey ? tts.fetchTTSModels : undefined}
					disabled={!tts.ttsHasApiKey} disabledMessage="Enter API key first" />
			{/if}

			{#if ttsProvider?.id === 'elevenlabs' || ttsProvider?.id === 'fish-audio'}
				<input type="text" class="api-key-input" list="{ttsProvider.id}-voices" placeholder="Voice ID" value={ttsSettings.activeVoiceId ?? ''}
					oninput={(e) => tts.setSpeech('activeVoiceId', e.currentTarget.value.trim())} />
				<datalist id="{ttsProvider.id}-voices">
					{#each ttsProvider?.voices ?? [] as voice}
						<option value={voice.id}>{voice.name}</option>
					{/each}
				</datalist>
			{/if}

			{#if ttsProvider?.isLocal}
				<input type="text" class="api-key-input" placeholder="Model/voice name" value={ttsSettings.activeModel ?? ''}
					oninput={(e) => tts.setSpeech('activeModel', e.currentTarget.value)} />
				<input type="text" class="api-key-input" placeholder={ttsProvider.defaultBaseUrl || 'http://localhost:5000/'}
					value={settingsStore.getProviderConfig(ttsProvider.id).baseUrl ?? ''}
					oninput={(e) => settingsStore.setProviderConfig(ttsProvider.id, { baseUrl: e.currentTarget.value })} />
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
		<button class="btn btn-primary" onclick={handleNext} disabled={stage === 'chat' ? !llm.isLLMConfigured : ttsEnabled && (!ttsSettings.activeProvider || !tts.ttsHasApiKey)}>
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

	/* The shared field recipe in app-controls.css sets the rest. */
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

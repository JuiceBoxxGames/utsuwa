<script lang="ts">
	import { rangeProgress } from '$lib/utils/range-progress';
	import Switch from '$lib/components/ui/Switch.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { getLLMProvider } from '$lib/services/providers/registry';
	import type { VisionSource } from '$lib/services/providers/vision';
	import { Icon, ProviderDropdown, ModelDropdown, ContextSizeSlider } from '$lib/components/ui';
	import { DOCS_URL } from '$lib/config/site';
	import { isTauri } from '$lib/services/platform';
	import type { LlmSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import SettingsSection from './SettingsSection.svelte';

	let { state }: { state: LlmSettingsState } = $props();

	// The same fields serve the chat model and the separate vision model
	const vision = $derived(state.moduleId === 'vision');
	const idp = $derived(vision ? 'vision' : 'llm');
	const title = $derived(vision ? 'Vision' : 'Chat (LLM)');
	const switchLabel = $derived(vision ? 'Separate vision model' : 'Chat (LLM)');

	const LOCAL_LLM_DOCS_URL = `${DOCS_URL}/guides/local-llm-setup#allowing-utsuwa-to-reach-ollama`;

	function openLocalLlmDocs(e: MouseEvent) {
		if (isTauri()) {
			e.preventDefault();
			import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(LOCAL_LLM_DOCS_URL));
		}
	}

	function handleContextSizeChange(value: number | undefined) {
		state.handleLLMNumberSetting('contextSize', value);
	}

	function visionNote(capable: boolean, source: VisionSource, providerName = 'the provider') {
		if (source === 'you') return 'Set by you.';
		if (source === 'provider') return `Reported by ${providerName}.`;
		return capable
			? 'Guessed from the model name. Turn this off if photos fail.'
			: 'Guessed from the model name. Turn this on if the model takes images.';
	}
</script>

{#snippet troubleHelp()}
	<p class="hint">
		Having trouble? Click <a
			href={LOCAL_LLM_DOCS_URL}
			target="_blank"
			rel="noopener"
			onclick={openLocalLlmDocs}>here</a
		>
	</p>
{/snippet}

<SettingsSection
	{title}
	description={vision ? 'Let a different model look at photos for your chat model.' : undefined}
>
	{#snippet actions()}<Switch checked={state.isLLMEnabled} onchange={state.toggleLLM} label={switchLabel} />{/snippet}
	<div class="ai-fields">
		{#if state.isLLMEnabled}
			<div class="ai-field">
				<span class="settings-label">Provider</span>
				<ProviderDropdown
					type="llm"
					value={state.activeProvider}
					onSelect={state.handleLLMProviderChange}
					placeholder={vision ? 'Select vision provider...' : 'Select LLM provider...'}
				/>
			</div>

			{#if state.activeProvider}
				{@const provider = getLLMProvider(state.activeProvider)}

				{#if provider?.requiresApiKey || provider?.custom}
					<div class="ai-field">
						<label class="settings-label" for="{idp}-api-key">{provider?.custom ? 'API key (optional)' : 'API key'}</label>
						<input
							id="{idp}-api-key"
							type="password"
							class="settings-field"
							class:error={state.llmFetchError}
							placeholder={provider?.custom ? 'API Key (optional)' : 'API Key'} aria-label={provider?.custom ? 'API Key (optional)' : 'API Key'}
							value={settingsStore.getProviderConfig(provider.id).apiKey ?? ''}
							oninput={(e) => state.handleApiKeyChange(provider.id, e.currentTarget.value)}
							onblur={provider?.custom ? undefined : state.handleLLMApiKeyBlur}
						/>
					</div>
				{/if}

				{#if provider?.isLocal || provider?.custom}
					<div class="ai-field">
						<label class="settings-label" for="{idp}-base-url">Base URL</label>
						<input
							id="{idp}-base-url"
							type="text"
							class="settings-field"
							placeholder={provider.custom
								? 'https://api.openai.com/v1/ or your endpoint'
								: provider.defaultBaseUrl || 'http://localhost:11434/v1/'}
							value={settingsStore.getProviderConfig(provider.id).baseUrl ?? ''}
							oninput={(e) => state.handleLLMBaseUrlChange(provider.id, e.currentTarget.value)}
							onblur={provider.custom ? undefined : () => state.debouncedFetchLLMModels()}
						/>
						{#if state.llmFetchError}
							<p class="hint error">
								<Icon name="alert-circle" size={14} />
								{state.llmFetchError}
							</p>
							{@render troubleHelp()}
						{/if}
						{#if provider?.isLocal && !state.llmFetchError}
							{@render troubleHelp()}
						{/if}
					</div>
				{/if}

				{#if provider?.custom}
					{@const customConfig = settingsStore.getProviderConfig(provider.id)}
					<div class="ai-field">
						<label class="settings-label" for="{idp}-custom-model">Model</label>
						<input
							id="{idp}-custom-model"
							type="text"
							class="settings-field"
							placeholder="Model (e.g. gpt-4o-mini, meta-llama/llama-3-70b)" aria-label="Model (e.g. gpt-4o-mini, meta-llama/llama-3-70b)"
							value={state.activeModel ?? ''}
							oninput={(e) => state.handleLLMModelChange(e.currentTarget.value.trim())}
						/>
						{#if customConfig.baseUrl}
							<ModelDropdown
								models={state.llmModels}
								value={state.activeModel}
								onSelect={state.handleLLMModelChange}
								placeholder="Pick a fetched model..."
								isLoading={state.llmIsLoading}
								onRefresh={state.refreshLLMModels}
								disabled={false}
							/>
						{:else}
							<p class="hint">Enter a base URL to fetch available models.</p>
						{/if}
					</div>

					{#if !vision}
					<details class="llm-advanced-params">
						<summary>Advanced Parameters</summary>
						<div class="llm-param-grid">
							<div class="llm-param-row">
								<label class="llm-param-label" for="llm-temperature">
									Temperature
									<span class="llm-param-value">{state.consciousnessSettings.temperature.toFixed(2)}</span>
								</label>
								<input
									id="llm-temperature"
									type="range" use:rangeProgress={state.consciousnessSettings.temperature}
									class="settings-range"
									min="0"
									max="2"
									step="0.05"
									value={state.consciousnessSettings.temperature}
									oninput={(e) => state.handleLLMNumberSetting('temperature', Number(e.currentTarget.value))}
								/>
								<p class="hint">Controls randomness: 0 = focused, 2 = highly creative.</p>
							</div>

							<div class="llm-param-row">
								<label class="llm-param-label" for="llm-top-p">
									Top P
									<span class="llm-param-value">{state.consciousnessSettings.topP.toFixed(2)}</span>
								</label>
								<input
									id="llm-top-p"
									type="range" use:rangeProgress={state.consciousnessSettings.topP}
									class="settings-range"
									min="0"
									max="1"
									step="0.05"
									value={state.consciousnessSettings.topP}
									oninput={(e) => state.handleLLMNumberSetting('topP', Number(e.currentTarget.value))}
								/>
								<p class="hint">Nucleus sampling: 1 = disabled.</p>
							</div>

							<div class="llm-param-row">
								<label class="llm-param-label" for="llm-max-tokens">
									Max Tokens
									<span class="llm-param-value">{state.consciousnessSettings.maxTokens ?? 'Default'}</span>
								</label>
								<input
									id="llm-max-tokens"
									type="number"
									class="settings-field"
									min="1"
									step="1"
									placeholder="Unlimited" aria-label="Unlimited"
									value={state.consciousnessSettings.maxTokens ?? ''}
									oninput={(e) => {
										const val = e.currentTarget.value;
										state.handleLLMNumberSetting('maxTokens', val ? parseInt(val, 10) : undefined);
									}}
								/>
								<p class="hint">Hard limit for the number of tokens in the response. Leave empty to use the provider default.</p>
							</div>

							<div class="llm-param-row">
								<label class="llm-param-label" for="llm-presence-penalty">
									Presence Penalty
									<span class="llm-param-value">{state.consciousnessSettings.presencePenalty.toFixed(1)}</span>
								</label>
								<input
									id="llm-presence-penalty"
									type="range" use:rangeProgress={state.consciousnessSettings.presencePenalty}
									class="settings-range"
									min="-2"
									max="2"
									step="0.1"
									value={state.consciousnessSettings.presencePenalty}
									oninput={(e) => state.handleLLMNumberSetting('presencePenalty', Number(e.currentTarget.value))}
								/>
								<p class="hint">Reduces repetition of tokens already used.</p>
							</div>

							<div class="llm-param-row">
								<label class="llm-param-label" for="llm-frequency-penalty">
									Frequency Penalty
									<span class="llm-param-value">{state.consciousnessSettings.frequencyPenalty.toFixed(1)}</span>
								</label>
								<input
									id="llm-frequency-penalty"
									type="range" use:rangeProgress={state.consciousnessSettings.frequencyPenalty}
									class="settings-range"
									min="-2"
									max="2"
									step="0.1"
									value={state.consciousnessSettings.frequencyPenalty}
									oninput={(e) => state.handleLLMNumberSetting('frequencyPenalty', Number(e.currentTarget.value))}
								/>
								<p class="hint">Stronger penalty for frequently repeated tokens.</p>
							</div>
						</div>
					</details>
					{/if}
				{:else}
					<div class="ai-field">
						<span class="settings-label">Model</span>
						<ModelDropdown
							models={state.llmModels}
							value={state.activeModel}
							onSelect={state.handleLLMModelChange}
							placeholder="Select model..."
							isLoading={state.llmIsLoading}
							onRefresh={state.llmHasApiKey ? state.refreshLLMModels : undefined}
							disabled={!state.llmHasApiKey}
							disabledMessage="Enter API key first"
						/>
					</div>
				{/if}

				{#if state.activeModel}
					{@const model = state.activeModel}
					{@const sight = settingsStore.resolveModelVision(state.activeProvider, model)}
					<div class="setting-row">
						<div class="setting-info">
							<span class="setting-label">Can see images</span>
							<span class="setting-desc">{visionNote(sight.capable, sight.source, provider?.name)}</span>
						</div>
						<Switch
							id="{idp}-sees-images"
							label="This model can see images"
							checked={sight.capable}
							onchange={(on) => settingsStore.setVisionOverride(state.activeProvider, model, on)}
						/>
					</div>
				{/if}

				{#if !vision}
					<ContextSizeSlider
						contextSize={state.consciousnessSettings.contextSize}
						onChange={handleContextSizeChange}
						id="llm-context-size-toggle"
					/>
				{/if}
			{/if}
		{:else}
			<p class="hint">
				{vision
					? "Off. Photos go to your chat model. Turn this on to have another model describe them instead, and your chat model replies from that description. Useful when the chat model can't see images, or its image tokens cost more."
					: 'Turn on chat to pick a provider and model.'}
			</p>
		{/if}
	</div>
</SettingsSection>

<style>
	.hint.error {
		display: flex;
		align-items: flex-start;
		gap: 6px;
	}

	.hint.error {
		color: var(--color-error);
	}

	.hint :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.hint a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.hint a:hover {
		color: var(--text-primary);
	}

	.llm-advanced-params {
		border-radius: var(--radius-lg);
		padding: 12px 16px;
		background: var(--bg-secondary);
	}

	.llm-advanced-params summary {
		font-size: 14px;
		font-weight: 500;
		color: var(--text-primary);
		cursor: pointer;
		user-select: none;
	}

	.llm-param-grid {
		margin-top: 12px;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 16px;
	}

	.llm-param-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.llm-param-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-primary);
	}

	.llm-param-value {
		font-size: 13px;
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 640px) {
		.llm-advanced-params {
			padding: 12px;
		}
	}
</style>

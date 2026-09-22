<script lang="ts">
	import { rangeProgress } from '$lib/utils/range-progress';
	import Switch from '$lib/components/ui/Switch.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { getLLMProvider } from '$lib/services/providers/registry';
	import { Icon, ProviderDropdown, ModelDropdown, ContextSizeSlider } from '$lib/components/ui';
	import { DOCS_URL } from '$lib/config/site';
	import { isTauri } from '$lib/services/platform';
	import type { LlmSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import './ai-services-settings.css';

	let { state }: { state: LlmSettingsState } = $props();

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

<div class="service-group">
	<div class="service-header">
		<Icon name="brain" size={14} />
		<span>Chat (LLM)</span>
		<Switch checked={state.isLLMEnabled} onchange={state.toggleLLM} label="Chat (LLM)" />
	</div>

	{#if state.isLLMEnabled}
		<ProviderDropdown
			type="llm"
			value={state.consciousnessSettings.activeProvider as string}
			onSelect={state.handleLLMProviderChange}
			placeholder="Select LLM provider..."
		/>

		{#if state.consciousnessSettings.activeProvider}
			{@const provider = getLLMProvider(state.consciousnessSettings.activeProvider as string)}

			{#if provider?.requiresApiKey || provider?.custom}
				<div class="api-key-row">
					<input
						type="password"
						class="api-key-input"
						class:error={state.llmFetchError}
						placeholder={provider?.custom ? 'API Key (optional)' : 'API Key'} aria-label={provider?.custom ? 'API Key (optional)' : 'API Key'}
						value={settingsStore.getProviderConfig(provider.id).apiKey ?? ''}
						oninput={(e) => state.handleApiKeyChange(provider.id, e.currentTarget.value)}
						onblur={provider?.custom ? undefined : state.handleLLMApiKeyBlur}
					/>
				</div>
			{/if}

			{#if provider?.isLocal || provider?.custom}
				{#if state.llmFetchError}
					<div class="provider-error">
						<p class="provider-note error">
							<Icon name="alert-circle" size={14} />
							{state.llmFetchError}
						</p>
						{@render troubleHelp()}
					</div>
				{/if}
				<div class="api-key-row">
					<input
						type="text"
						class="api-key-input"
						placeholder={provider.custom
							? 'https://api.openai.com/v1/ or your endpoint'
							: provider.defaultBaseUrl || 'http://localhost:11434/v1/'}
						value={settingsStore.getProviderConfig(provider.id).baseUrl ?? ''}
						oninput={(e) => state.handleLLMBaseUrlChange(provider.id, e.currentTarget.value)}
						onblur={provider.custom ? undefined : () => state.debouncedFetchLLMModels()}
					/>
				</div>
				{#if provider?.isLocal && !state.llmFetchError}
					{@render troubleHelp()}
				{/if}
			{/if}

			{#if provider?.custom}
				{@const customConfig = settingsStore.getProviderConfig(provider.id)}
				<div class="api-key-row">
					<input
						type="text"
						class="api-key-input"
						placeholder="Model (e.g. gpt-4o-mini, meta-llama/llama-3-70b)" aria-label="Model (e.g. gpt-4o-mini, meta-llama/llama-3-70b)"
						value={(state.consciousnessSettings.activeModel as string) ?? ''}
						oninput={(e) => state.handleLLMModelChange(e.currentTarget.value.trim())}
					/>
				</div>
				{#if customConfig.baseUrl}
					<div class="api-key-row">
						<ModelDropdown
							models={state.llmModels}
							value={state.consciousnessSettings.activeModel as string}
							onSelect={state.handleLLMModelChange}
							placeholder="Pick a fetched model..."
							isLoading={state.llmIsLoading}
							onRefresh={state.refreshLLMModels}
							disabled={false}
						/>
					</div>
				{:else}
					<p class="provider-note">Enter a base URL to fetch available models.</p>
				{/if}

				<details class="llm-advanced-params">
					<summary>Advanced Parameters</summary>
					<div class="llm-param-grid">
						<div class="llm-param-row">
							<label class="llm-param-label" for="llm-temperature">
								Temperature
								<span class="llm-param-value">{((state.consciousnessSettings.temperature as number) ?? 0.7).toFixed(2)}</span>
							</label>
							<input
								id="llm-temperature"
								type="range" use:rangeProgress={(state.consciousnessSettings.temperature as number) ?? 0.7}
								class="settings-range"
								min="0"
								max="2"
								step="0.05"
								value={(state.consciousnessSettings.temperature as number) ?? 0.7}
								oninput={(e) => state.handleLLMNumberSetting('temperature', Number(e.currentTarget.value))}
							/>
							<p class="provider-note">Controls randomness: 0 = focused, 2 = highly creative.</p>
						</div>

						<div class="llm-param-row">
							<label class="llm-param-label" for="llm-top-p">
								Top P
								<span class="llm-param-value">{((state.consciousnessSettings.topP as number) ?? 1.0).toFixed(2)}</span>
							</label>
							<input
								id="llm-top-p"
								type="range" use:rangeProgress={(state.consciousnessSettings.topP as number) ?? 1.0}
								class="settings-range"
								min="0"
								max="1"
								step="0.05"
								value={(state.consciousnessSettings.topP as number) ?? 1.0}
								oninput={(e) => state.handleLLMNumberSetting('topP', Number(e.currentTarget.value))}
							/>
							<p class="provider-note">Nucleus sampling: 1 = disabled.</p>
						</div>

						<div class="llm-param-row">
							<label class="llm-param-label" for="llm-max-tokens">
								Max Tokens
								<span class="llm-param-value">{state.consciousnessSettings.maxTokens ?? '—'}</span>
							</label>
							<input
								id="llm-max-tokens"
								type="number"
								class="api-key-input"
								min="1"
								step="1"
								placeholder="Unlimited" aria-label="Unlimited"
								value={(state.consciousnessSettings.maxTokens as number) ?? ''}
								oninput={(e) => {
									const val = e.currentTarget.value;
									state.handleLLMNumberSetting('maxTokens', val ? parseInt(val, 10) : undefined);
								}}
							/>
							<p class="provider-note">Hard limit for the number of tokens in the response. Leave empty to use the provider default.</p>
						</div>

						<div class="llm-param-row">
							<label class="llm-param-label" for="llm-presence-penalty">
								Presence Penalty
								<span class="llm-param-value">{((state.consciousnessSettings.presencePenalty as number) ?? 0).toFixed(1)}</span>
							</label>
							<input
								id="llm-presence-penalty"
								type="range" use:rangeProgress={(state.consciousnessSettings.presencePenalty as number) ?? 0}
								class="settings-range"
								min="-2"
								max="2"
								step="0.1"
								value={(state.consciousnessSettings.presencePenalty as number) ?? 0}
								oninput={(e) => state.handleLLMNumberSetting('presencePenalty', Number(e.currentTarget.value))}
							/>
							<p class="provider-note">Reduces repetition of tokens already used.</p>
						</div>

						<div class="llm-param-row">
							<label class="llm-param-label" for="llm-frequency-penalty">
								Frequency Penalty
								<span class="llm-param-value">{((state.consciousnessSettings.frequencyPenalty as number) ?? 0).toFixed(1)}</span>
							</label>
							<input
								id="llm-frequency-penalty"
								type="range" use:rangeProgress={(state.consciousnessSettings.frequencyPenalty as number) ?? 0}
								class="settings-range"
								min="-2"
								max="2"
								step="0.1"
								value={(state.consciousnessSettings.frequencyPenalty as number) ?? 0}
								oninput={(e) => state.handleLLMNumberSetting('frequencyPenalty', Number(e.currentTarget.value))}
							/>
							<p class="provider-note">Stronger penalty for frequently repeated tokens.</p>
						</div>
					</div>
				</details>
			{:else}
				<ModelDropdown
					models={state.llmModels}
					value={state.consciousnessSettings.activeModel as string}
					onSelect={state.handleLLMModelChange}
					placeholder="Select model..."
					isLoading={state.llmIsLoading}
					onRefresh={state.llmHasApiKey ? state.refreshLLMModels : undefined}
					disabled={!state.llmHasApiKey}
					disabledMessage="Enter API key first"
				/>
			{/if}

			<ContextSizeSlider
				contextSize={state.consciousnessSettings.contextSize as number | undefined}
				onChange={handleContextSizeChange}
				id="llm-context-size-toggle"
			/>
		{/if}
	{/if}
</div>

<style>
	.provider-note {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-tertiary);
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

	.llm-advanced-params {
		margin-top: 0.75rem;
		border: 1px solid transparent;
		border-radius: var(--radius-lg);
		padding: 0.75rem;
		background: var(--bg-primary);
	}

	.llm-advanced-params summary {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-secondary);
		cursor: pointer;
		user-select: none;
	}

	.llm-param-grid {
		margin-top: 0.75rem;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.75rem;
	}

	.llm-param-row {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.llm-param-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.llm-param-value {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		font-variant-numeric: tabular-nums;
	}

</style>

<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import {
		TTS_PROVIDERS,
		getLLMProvider,
		getTTSProvider,
		type ProviderMetadata
	} from '$lib/services/providers/registry';

	import {
		checkTTSProviderHealth,
		getTTSProviderHealth,
		subscribeTTSProviderHealth,
		type HealthStatus
	} from '$lib/services/providers/health-check';

	import { isLocalTTSProvider } from '$lib/services/providers/local-endpoints';
	import ProviderIcon from '$lib/components/icons/ProviderIcons.svelte';
	import { Icon } from '$lib/components/ui';

	interface Props {
		type: 'llm' | 'tts';
		value: string | null | undefined;
		onSelect: (providerId: string) => void;
		placeholder?: string;
	}

	let { type, value, onSelect, placeholder = 'Select provider...' }: Props = $props();

	const getProvider = $derived(type === 'llm' ? getLLMProvider : getTTSProvider);
	const selectedProvider = $derived(value ? getProvider(value) : null);

	// Group providers by category for LLM
	const llmCategories = [
		{ id: 'cloud-commercial', label: 'Cloud Commercial', providers: ['openai', 'anthropic', 'google', 'deepseek', 'mistral', 'xai', 'groq', 'perplexity', 'moonshot', 'together'] },
		{ id: 'cloud-additional', label: 'Cloud Additional', providers: ['cerebras', 'fireworks', 'novita', '302ai', 'comet'] },
		{ id: 'aggregators', label: 'Aggregators', providers: ['openrouter', 'openai-compatible'] },
		{ id: 'local', label: 'Local', providers: ['ollama', 'lmstudio', 'vllm', 'player2'] },
		{ id: 'enterprise', label: 'Enterprise', providers: ['azure', 'cloudflare'] }
	];

	// Group providers by category for TTS
	const ttsCategories = [
		{ id: 'cloud', label: 'Cloud TTS', providers: ['elevenlabs', 'openai-tts', 'azure-speech', 'deepgram', 'alibaba-cosyvoice', 'volcengine', 'comet-tts'] },
		{ id: 'local', label: 'Local / Free', providers: ['local-tts', 'omnivoice', 'web-speech', 'index-tts', 'browser-local', 'app-local'] },
		{ id: 'generic', label: 'Generic', providers: ['openai-compatible-tts', 'player2-tts'] }
	];

	const categories = $derived(type === 'llm' ? llmCategories : ttsCategories);

	function isConfigured(providerId: string): boolean {
		const provider = getProvider(providerId);
		if (provider?.isLocal) return true;
		if (!provider?.requiresApiKey) return true;
		const config = settingsStore.getProviderConfig(providerId);
		return !!config.apiKey;
	}

	function getProvidersByCategory(providerIds: string[]): ProviderMetadata[] {
		return providerIds
			.map((id) => getProvider(id))
			.filter((p): p is ProviderMetadata => p !== undefined);
	}

	let healthRevision = $state(0);

	$effect(() => {
		return subscribeTTSProviderHealth(() => {
			healthRevision += 1;
		});
	});

	function providerHealthStatus(providerId: string): HealthStatus {
		// Reference the revision so Svelte re-runs this when health state changes.
		healthRevision;
		if (type !== 'tts') return 'unknown';
		if (!isLocalTTSProvider(providerId)) return 'unknown';
		const config = settingsStore.getProviderConfig(providerId);
		return getTTSProviderHealth(providerId, config.baseUrl);
	}

	function runTTSHealthChecks() {
		if (type !== 'tts') return;
		for (const provider of TTS_PROVIDERS) {
			if (isLocalTTSProvider(provider.id)) {
				const config = settingsStore.getProviderConfig(provider.id);
				checkTTSProviderHealth(provider.id, config.baseUrl);
			}
		}
	}

	function handleOpenChange(open: boolean) {
		if (open) {
			runTTSHealthChecks();
		}
	}
	function handleSelect(providerId: string) {
		onSelect(providerId);
	}
</script>

<DropdownMenu.Root onOpenChange={handleOpenChange}>
	<DropdownMenu.Trigger class="dropdown-trigger">
		{#if selectedProvider}
			<span class="trigger-icon">
				<ProviderIcon provider={selectedProvider.id} size={18} themed />
			</span>
			<span class="trigger-label">{selectedProvider.name}</span>
				{@const status = providerHealthStatus(selectedProvider.id)}
				{#if status !== 'unknown'}
					<span class="health-dot {status}" title={status === 'healthy' ? 'Reachable' : 'Unreachable'}></span>
				{/if}
		{:else}
			<span class="trigger-placeholder">{placeholder}</span>
		{/if}
		<Icon name="chevron-down" size={14} />
	</DropdownMenu.Trigger>

	<DropdownMenu.Portal>
		<DropdownMenu.Content class="dropdown-content" align="start" sideOffset={4} collisionPadding={8}>
			<div class="dropdown-scroll">
				{#each categories as category}
					{@const categoryProviders = getProvidersByCategory(category.providers)}
					{#if categoryProviders.length > 0}
						<div class="category-group">
							<div class="category-label">{category.label}</div>
							{#each categoryProviders as provider}
								<DropdownMenu.Item
									class="provider-item {value === provider.id ? 'selected' : ''}"
									onSelect={() => handleSelect(provider.id)}
								>
									<span class="provider-icon">
										<ProviderIcon provider={provider.id} size={16} themed />
									</span>
									<span class="provider-name">{provider.name}</span>
							{@const status = providerHealthStatus(provider.id)}
							{#if status !== 'unknown'}
								<span class="health-dot {status}" title={status === 'healthy' ? 'Reachable' : 'Unreachable'}></span>
							{/if}
									{#if provider.isLocal}
										<span class="ui-badge">Local</span>
									{:else if isConfigured(provider.id)}
										<span class="configured" aria-label="Configured">
											<Icon name="check" size={10} strokeWidth={3} />
										</span>
									{/if}
								</DropdownMenu.Item>
							{/each}
						</div>
					{/if}
				{/each}
			</div>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	.configured { display: flex; color: var(--color-success); }

	.trigger-icon {
		display: flex;
		flex-shrink: 0;
	}

	.trigger-label { flex: 1; }

	.trigger-placeholder {
		flex: 1;
		color: var(--text-tertiary);
	}

	.dropdown-scroll {
		max-height: 320px;
		overflow-y: auto;
	}

	.category-group {
		margin-bottom: 0.5rem;
	}

	.category-group:last-child {
		margin-bottom: 0;
	}

	.category-label { color: var(--text-secondary); }

	.provider-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--text-secondary); }

	.provider-name { flex: 1; }

	.health-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-tertiary);
		flex-shrink: 0;
	}

	.health-dot.healthy {
		background: var(--color-success);
	}

	.health-dot.unhealthy {
		background: var(--color-error);
	}
</style>

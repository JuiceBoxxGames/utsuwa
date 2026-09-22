<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { Icon } from '$lib/components/ui';

	interface Model {
		id: string;
		name: string;
	}

	interface Props {
		models: Model[];
		value: string | null | undefined;
		onSelect: (modelId: string) => void;
		placeholder?: string;
		isLoading?: boolean;
		onRefresh?: () => void;
		disabled?: boolean;
		disabledMessage?: string;
	}

	let {
		models,
		value,
		onSelect,
		placeholder = 'Select model...',
		isLoading = false,
		onRefresh,
		disabled = false,
		disabledMessage = 'Enter API key first'
	}: Props = $props();

	let searchQuery = $state('');
	let open = $state(false);

	const isDisabled = $derived(disabled || isLoading);

	const selectedModel = $derived(models.find((m) => m.id === value));

	// Always include the currently selected model, even if it doesn't match the filter
	const filteredModels = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return models;
		const filtered = models.filter(
			(m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
		);
		if (selectedModel && !filtered.some((m) => m.id === selectedModel.id)) {
			return [selectedModel, ...filtered];
		}
		return filtered;
	});

	function handleSelect(modelId: string) {
		searchQuery = '';
		onSelect(modelId);
	}

	// Clear the search filter when the dropdown closes so reopening starts fresh.
	$effect(() => {
		if (!open) searchQuery = '';
	});
</script>

<div class="model-dropdown-wrapper">
	<DropdownMenu.Root bind:open>
		<DropdownMenu.Trigger class="model-dropdown-trigger" disabled={isDisabled}>
			{#if isLoading}
				<span class="trigger-loading">
					<span class="loading-spinner"></span>
					Fetching models...
				</span>
			{:else if disabled}
				<span class="trigger-placeholder">{disabledMessage}</span>
			{:else if selectedModel}
				<span class="trigger-label">{selectedModel.name}</span>
			{:else}
				<span class="trigger-placeholder">{placeholder}</span>
			{/if}
			{#if !isLoading}
				<Icon name="chevron-down" size={14} />
			{/if}
		</DropdownMenu.Trigger>

		<DropdownMenu.Portal>
			<DropdownMenu.Content class="model-dropdown-content" align="start" sideOffset={4} collisionPadding={8}>
				<div class="search-row">
					<Icon name="search" size={14} />
					<input
						type="text"
						class="search-input"
						placeholder="Search models..."
						aria-label="Search models"
						bind:value={searchQuery}
						onclick={(e) => e.stopPropagation()}
						onkeydown={(e) => {
							// Keep text editing out of menu typeahead; let Escape and arrows reach the menu.
							if (!['Escape', 'ArrowDown', 'ArrowUp', 'Tab'].includes(e.key)) e.stopPropagation();
						}}
					/>
					{#if searchQuery}
						<button aria-label="Clear model search" class="btn btn-ghost btn-icon" onclick={() => (searchQuery = '')}>
							<Icon name="x" size={12} />
						</button>
					{/if}
				</div>
				<div class="model-dropdown-scroll">
					{#each filteredModels as model (model.id)}
						<DropdownMenu.Item
							class="model-item {value === model.id ? 'selected' : ''}"
							onSelect={() => handleSelect(model.id)}
						>
							<span class="model-name">{model.name}</span>
							{#if value === model.id}
								<span class="check-icon">
									<Icon name="check" size={14} strokeWidth={2.5} />
								</span>
							{/if}
						</DropdownMenu.Item>
					{/each}
					{#if filteredModels.length === 0 && !isLoading}
						<div class="no-models">No models found</div>
					{/if}
				</div>
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	</DropdownMenu.Root>

	{#if onRefresh && !isLoading}
		<button class="btn btn-secondary btn-icon" onclick={onRefresh} title="Refresh models" aria-label="Refresh models">
			<Icon name="refresh-cw" size={14} />
		</button>
	{/if}
</div>

<style>
	.model-dropdown-wrapper {
		display: flex;
		gap: 0.375rem;
		align-items: stretch;
	}

	.trigger-label { flex: 1; }

	.trigger-placeholder {
		flex: 1;
		color: var(--text-tertiary);
	}

	.trigger-loading {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text-tertiary);
	}

	.loading-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--border-light);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.search-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }

	.search-row :global(svg) {
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-family: inherit;
		color: var(--text-primary);
	}

	.search-input::placeholder {
		color: var(--text-tertiary);
	}

	.model-dropdown-scroll {
		max-height: 280px;
		overflow-y: auto;
	}

	.model-name { flex: 1; }

	.check-icon { display: flex; align-items: center; }

	.no-models {
		padding: 0.75rem;
		text-align: center;
		font-size: 0.8rem;
		color: var(--text-tertiary);
	}
</style>

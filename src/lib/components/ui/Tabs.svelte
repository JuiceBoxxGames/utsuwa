<script lang="ts">
	import { Tabs } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		value = $bindable(''),
		items,
		label,
		children
	}: {
		value?: string;
		items: { value: string; label: string }[];
		label: string;
		children: Snippet<[string]>;
	} = $props();
</script>

<Tabs.Root bind:value>
	<Tabs.List aria-label={label} class="ui-tabs-list">
		{#each items as item (item.value)}
			<Tabs.Trigger value={item.value} class="ui-tab">{item.label}</Tabs.Trigger>
		{/each}
	</Tabs.List>
	{#each items as item (item.value)}
		<Tabs.Content value={item.value} class="ui-tab-panel">
			{#if value === item.value}{@render children(item.value)}{/if}
		</Tabs.Content>
	{/each}
</Tabs.Root>

<style>
	:global(.ui-tabs-list) {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		overflow-x: auto;
		background: var(--bg-secondary);
		border-radius: var(--radius-lg);
	}
	:global(.ui-tab) {
		flex: 1 0 auto;
		min-height: 32px;
		padding: 0.5rem 0.875rem;
		border: 0;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.875rem;
		cursor: pointer;
		transition:
			background 200ms ease-out,
			color 200ms ease-out;
	}
	:global(.ui-tab[data-state='active']) {
		background: var(--selection-bg);
		box-shadow: var(--shadow-xs);
		color: var(--text-primary);
		font-weight: 500;
	}
	:global(.ui-tab:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	:global(.ui-tab-panel) {
		margin-top: 1rem;
		min-width: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.ui-tab) {
			transition: none;
		}
	}
	@media (pointer: coarse) { :global(.ui-tab) { min-height: 44px; } }
</style>

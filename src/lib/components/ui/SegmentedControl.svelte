<script lang="ts" generics="Value extends string">
	import Icon from './Icon.svelte';
	let {
		value,
		options,
		label,
		onchange,
		compact = false
	}: {
		value: Value;
		options: ReadonlyArray<{ value: Value; label: string; icon?: string }>;
		label: string;
		onchange: (value: Value) => void;
		compact?: boolean;
	} = $props();
</script>

<div class="segmented-control" class:compact role="group" aria-label={label}>
	{#each options as option (option.value)}
		<button
			type="button"
			aria-pressed={value === option.value}
			onclick={() => onchange(option.value)}
		>
			{#if option.icon}<Icon name={option.icon} size={16} />{/if}
			{option.label}
		</button>
	{/each}
</div>

<style>
	.segmented-control {
		display: flex;
		flex-wrap: wrap;
		width: fit-content;
		max-width: 100%;
		min-width: 0;
		gap: 2px;
		padding: 2px;
		border: 1px solid var(--border-light);
		border-radius: var(--radius-md);
		background: var(--bg-secondary);
	}
	.compact {
		width: auto;
	}
	button {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.375rem;
		flex: 1 0 auto;
		white-space: nowrap;
		min-height: 28px;
		padding: 4px 10px;
		border: none;
		border-radius: calc(var(--radius-md) - 2px);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			background 150ms ease,
			color 150ms ease;
	}
	button:hover {
		color: var(--text-primary);
		background: var(--bg-tertiary);
	}
	button[aria-pressed='true'] {
		color: var(--text-primary);
		background: var(--selection-bg);
		box-shadow: var(--shadow-xs);
	}
	@media (pointer: coarse) { button { min-height: 44px; } }
	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}
</style>

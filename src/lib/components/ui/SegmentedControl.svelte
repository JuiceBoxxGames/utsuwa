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
		width: 100%;
		min-width: 0;
		gap: 0.25rem;
		padding: 0.25rem;
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
		flex: 1;
		min-height: 44px;
		padding: 0.5rem 0.75rem;
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
		color: var(--accent);
		background: var(--accent-muted);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}
</style>

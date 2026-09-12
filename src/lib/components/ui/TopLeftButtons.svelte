<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { photomodeStore } from '$lib/stores/photomode.svelte';

	interface Props {
		onOpenMemoryGraph?: () => void;
		onBoardClick?: () => void;
	}

	let { onOpenMemoryGraph, onBoardClick }: Props = $props();
</script>

<div class="top-left-buttons">
	<button class="icon-btn" onclick={() => photomodeStore.enter()} aria-label="Open photo mode">
		<Icon name="camera" size={20} />
	</button>
	{#if onOpenMemoryGraph}
		<button class="icon-btn" onclick={onOpenMemoryGraph} aria-label="Open memory graph">
			<Icon name="brain" size={20} />
		</button>
	{/if}
	{#if onBoardClick}
		<button class="icon-btn" onclick={onBoardClick} aria-label="Photoboard" title="Things you've shown her">
			<Icon name="image" size={20} />
		</button>
	{/if}
</div>

<style>
	.top-left-buttons {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 50;
		display: flex;
		gap: 0.5rem;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: var(--bg-tertiary);
		border: none;
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		cursor: pointer;
		transition: color 0.15s ease, background 0.15s ease,
			box-shadow 0.15s ease, transform 0.15s ease;
		box-shadow: var(--shadow-sm);
	}

	.icon-btn:hover {
		color: var(--text-primary);
		background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 8%);
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}

	.icon-btn:focus-visible {
		outline: none;
		color: var(--text-primary);
		box-shadow: 0 0 0 3px var(--accent-muted);
	}

	.icon-btn:active {
		color: var(--accent);
		transform: translateY(0) scale(0.96);
		box-shadow: var(--shadow-sm);
	}
</style>

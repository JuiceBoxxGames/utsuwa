<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { displayStore } from '$lib/stores/display.svelte';
	import { wakeLockStore } from '$lib/stores/wake-lock.svelte';
	const labels = {
		active: 'Screen awake',
		requesting: 'Requesting screen wake lock',
		inactive: 'Screen wake lock inactive',
		unsupported: 'Screen wake lock unavailable',
		off: 'Screen wake lock off'
	};
	const label = $derived(labels[wakeLockStore.status]);
</script>

{#if displayStore.keepScreenAwake}
	<button
		class="wake-indicator"
		class:active={wakeLockStore.status === 'active'}
		aria-label={`${label}. Turn off keep screen awake`}
		title={`${label}. Click to turn off.`}
		onclick={() => displayStore.setKeepScreenAwake(false)}
	>
		<Icon name="sun" size={16} />
		<span>{wakeLockStore.status === 'active' ? 'Awake' : 'Inactive'}</span>
	</button>
{/if}

<style>
	.wake-indicator {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-height: 32px;
		padding: 0.375rem 0.625rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-full);
		background: var(--bg-primary);
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.75rem;
		box-shadow: var(--shadow-sm);
		cursor: pointer;
	}
	.wake-indicator.active {
		color: var(--accent);
		background: var(--accent-subtle);
	}
	.wake-indicator:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>

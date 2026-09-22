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
		class="wake-indicator btn btn-secondary btn-sm"
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
	.wake-indicator.active { color: var(--accent); }
</style>

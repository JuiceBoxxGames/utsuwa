<script lang="ts">
	import { statChangesStore } from '$lib/stores/stat-changes.svelte';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import FloatingStatIndicator from './FloatingStatIndicator.svelte';

	// Get screen position from VRM store for 3D tracking
	const screenPos = $derived(vrmStore.headScreenPosition);

	// Calculate position on the opposite side of the head from speech bubble
	const indicatorStyle = $derived(() => {
		if (!screenPos) {
			// Fallback to fixed position
			return 'top: 25%; left: 45%;';
		}
		// Position to the LEFT of the head (opposite of speech bubble)
		const x = Math.min(Math.max(screenPos.x - 15, 5), 70);
		const y = Math.min(Math.max(screenPos.y, 5), 70);
		return `top: ${y}%; left: ${x}%;`;
	});
</script>

{#if statChangesStore.changes.length > 0}
	<div class="floating-indicators" style={indicatorStyle()}>
		{#each statChangesStore.changes as change (change.id)}
			<FloatingStatIndicator
				stat={change.stat}
				delta={change.delta}
				color={change.color}
				icon={change.icon}
				onComplete={() => statChangesStore.remove(change.id)}
			/>
		{/each}
	</div>
{/if}

<style>
	.floating-indicators {
		position: fixed;
		z-index: 24;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
		pointer-events: none;
		transition: top 0.1s ease-out, left 0.1s ease-out;
	}
</style>

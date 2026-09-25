<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { localPath } from '$lib/config/links';

	onMount(() => {
		goto(localPath('app', '/settings/persona'), { replaceState: true });
	});
</script>

<div class="redirect">
	<p>Redirecting to settings...</p>
</div>

<style>
	.redirect {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-secondary);
	}
</style>

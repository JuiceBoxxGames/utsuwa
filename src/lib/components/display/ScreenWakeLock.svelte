<script lang="ts">
	import { onMount } from 'svelte';
	import { displayStore } from '$lib/stores/display.svelte';
	import { wakeLockStore } from '$lib/stores/wake-lock.svelte';
	onMount(() => wakeLockStore.start());
	$effect(() => wakeLockStore.setEnabled(displayStore.keepScreenAwake));
</script>

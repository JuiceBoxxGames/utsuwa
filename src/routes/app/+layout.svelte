<script lang="ts">
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import UpdateBanner from '$lib/components/updater/UpdateBanner.svelte';

	let { children } = $props();
	let viewportHeight = $state<number>();
	onMount(() => {
		const viewport = window.visualViewport;
		const resize = () => { viewportHeight = viewport?.height ?? window.innerHeight; };
		resize();
		viewport?.addEventListener('resize', resize);
		window.addEventListener('resize', resize);
		return () => { viewport?.removeEventListener('resize', resize); window.removeEventListener('resize', resize); };
	});

	// Crossfade app-side navigations (app <-> settings) where supported.
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="app" style:height={viewportHeight ? `${viewportHeight}px` : undefined}>
	{@render children()}
	<UpdateBanner />
</div>

<style>
	.app {
		height: 100dvh;
		width: 100vw;
		overflow: hidden;
	}
</style>

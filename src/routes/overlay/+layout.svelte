<script lang="ts">
	import { onMount } from 'svelte';
	let { children } = $props();
	let viewportHeight = $state<number>();

	// Make html/body transparent for overlay mode
	onMount(() => {
		document.documentElement.style.background = 'transparent';
		document.body.style.background = 'transparent';
		const viewport = window.visualViewport;
		const resize = () => { viewportHeight = viewport?.height ?? window.innerHeight; };
		resize();
		viewport?.addEventListener('resize', resize);
		window.addEventListener('resize', resize);

		return () => {
			document.documentElement.style.background = '';
			document.body.style.background = '';
			viewport?.removeEventListener('resize', resize);
			window.removeEventListener('resize', resize);
		};
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="overlay-app" style:height={viewportHeight ? `${viewportHeight}px` : undefined}>
	{@render children()}
</div>

<style>
	.overlay-app {
		height: 100vh;
		width: 100vw;
		overflow: hidden;
		background: transparent;
	}
</style>

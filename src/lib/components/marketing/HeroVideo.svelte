<script lang="ts">
	import { onMount } from 'svelte';

	// The device loop (laptop, wall screen, phone), rendered once per theme.
	// Only the loop for the current theme loads and plays; reduced motion keeps
	// the poster frame.
	let { label }: { label: string } = $props();

	let light = $state<HTMLVideoElement>();
	let dark = $state<HTMLVideoElement>();

	onMount(() => {
		const html = document.documentElement;
		const still = matchMedia('(prefers-reduced-motion: reduce)');
		const sync = () => {
			const [on, off] = html.classList.contains('dark') ? [dark!, light!] : [light!, dark!];
			off.pause();
			if (still.matches) on.pause();
			else void on.play().catch(() => {});
		};
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(html, { attributes: true, attributeFilter: ['class'] });
		still.addEventListener('change', sync);
		return () => {
			observer.disconnect();
			still.removeEventListener('change', sync);
		};
	});
</script>

<video
	bind:this={light}
	class="hero-video hero-video--light"
	src="/landing-page/hero-devices-light.mp4"
	poster="/landing-page/hero-devices-light.webp"
	preload="none"
	muted
	loop
	playsinline
	disablepictureinpicture
	aria-label={label}
></video>
<video
	bind:this={dark}
	class="hero-video hero-video--dark"
	src="/landing-page/hero-devices-dark.mp4"
	poster="/landing-page/hero-devices-dark.webp"
	preload="none"
	muted
	loop
	playsinline
	disablepictureinpicture
	aria-label={label}
></video>

<style>
	.hero-video {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.hero-video--dark,
	:global(html.dark) .hero-video--light {
		display: none;
	}

	:global(html.dark) .hero-video--dark {
		display: block;
	}
</style>

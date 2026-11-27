<script lang="ts">
	import { onMount } from 'svelte';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import PlayIcon from '@lucide/svelte/icons/play';
	import { m } from '$lib/paraglide/messages';

	// The device loop (laptop, wall screen, phone), rendered once per theme.
	// Only the loop for the current theme loads and plays; reduced motion keeps
	// the poster frame until someone presses play.
	let { label }: { label: string } = $props();

	let light = $state<HTMLVideoElement>();
	let dark = $state<HTMLVideoElement>();
	let paused = $state(false);
	let sync = () => {};

	onMount(() => {
		const html = document.documentElement;
		const still = matchMedia('(prefers-reduced-motion: reduce)');
		paused = still.matches;
		sync = () => {
			const [on, off] = html.classList.contains('dark') ? [dark!, light!] : [light!, dark!];
			off.pause();
			if (paused) on.pause();
			else void on.play().catch(() => {});
		};
		sync();
		const onMotion = () => {
			paused = still.matches;
			sync();
		};
		const observer = new MutationObserver(() => sync());
		observer.observe(html, { attributes: true, attributeFilter: ['class'] });
		still.addEventListener('change', onMotion);
		return () => {
			observer.disconnect();
			still.removeEventListener('change', onMotion);
		};
	});

	function toggle() {
		paused = !paused;
		sync();
	}
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

<button type="button" class="hero-toggle" onclick={toggle} aria-label={paused ? m.hero_play() : m.hero_pause()} title={paused ? m.hero_play() : m.hero_pause()}>
	{#if paused}<PlayIcon size={14} strokeWidth={2.25} />{:else}<PauseIcon size={14} strokeWidth={2.25} />{/if}
</button>

<style>
	/* Quiet until hovered */
	.hero-toggle {
		position: absolute;
		right: 16px;
		bottom: 16px;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: color-mix(in srgb, var(--bg-page) 72%, transparent);
		color: var(--text-primary);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		cursor: pointer;
		opacity: 0.7;
		transition-property: opacity, scale;
		transition-duration: 0.15s, 0.1s;
	}

	.hero-toggle:hover,
	.hero-toggle:focus-visible {
		opacity: 1;
	}

	.hero-toggle:active {
		scale: 0.96;
	}

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

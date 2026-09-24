<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import WindowLight from './WindowLight.svelte';
	import { PALETTES, TIMES, timeOfDay, type TimeOfDay } from './window-light';

	// Full-bleed window light behind the hero content. `fade` melts the bottom
	// edge into the white page. The light follows the visitor's clock;
	// ?time=morning|day|evening|night pins it (handy for screenshots).
	let { children, fade = false }: { children: Snippet; fade?: boolean } = $props();

	// SSR and prerender get daytime
	let time = $state<TimeOfDay>('day');
	let live = $state(false);

	onMount(() => {
		const pinned = new URLSearchParams(location.search).get('time') as TimeOfDay | null;
		time = pinned && TIMES.includes(pinned) ? pinned : timeOfDay(new Date().getHours());
		live = !matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	const look = $derived(PALETTES[time]);
</script>

<div class="sky-zone" class:fade style="--glass-glow: {look.glassGlow}">
	<div
		class="sky"
		aria-hidden="true"
		style="background-color: {look.base}; background-image: url('/landing-page/backdrop-window-{time}.webp')"
	></div>
	{#if live}<WindowLight {time} />{/if}
	<div class="sky-overlay" aria-hidden="true" style="--scrim: {look.scrim}"></div>
	{@render children()}
</div>

<style>
	.sky-zone {
		position: relative;
		isolation: isolate;
		width: 100%;
	}

	.sky,
	.sky-overlay {
		position: absolute;
		inset: 0;
		z-index: -1;
	}

	.sky {
		background-position: center top;
		background-size: cover;
		background-repeat: no-repeat;
	}

	/* Deepen the top edge so the header reads over anything */
	.sky-overlay::before {
		content: '';
		position: absolute;
		inset: 0 0 auto;
		height: 260px;
		background: linear-gradient(to bottom, var(--scrim), transparent);
	}

	/* A touch of film grain over the light */
	.sky-overlay::after {
		content: '';
		position: absolute;
		inset: 0;
		opacity: 0.09;
		mix-blend-mode: overlay;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
	}

	.fade::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		z-index: 1;
		height: 240px;
		pointer-events: none;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.3) 52%, #fff);
	}
</style>

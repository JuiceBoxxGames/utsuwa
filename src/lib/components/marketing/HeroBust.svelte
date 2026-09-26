<script lang="ts">
	import { onMount } from 'svelte';

	// Head-and-shoulders companion standing in the room's light. Each character
	// has a 5x3 grid of prerendered head turns (row by row from up-left; the
	// middle of row 1 looks straight at you). On desktop she turns toward the
	// cursor.
	let {
		characters,
		active = 0
	}: {
		characters: { alt: string; frames: string[] }[];
		active?: number;
	} = $props();

	const COLS = 5;
	const CENTER = 7;

	let figure: HTMLDivElement;
	let cell = $state(CENTER);
	let tracking = $state(false);
	let settling = $state(false);

	// Whoever steps in looks at you first, then back toward the cursor
	$effect(() => {
		void active;
		settling = true;
		const id = setTimeout(() => (settling = false), 900);
		return () => clearTimeout(id);
	});

	onMount(() => {
		const canTrack =
			matchMedia('(hover: hover) and (pointer: fine)').matches &&
			!matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!canTrack) return;

		let frame = 0;
		let x = 0;
		let y = 0;
		const aim = () => {
			frame = 0;
			// Her eyes sit about 40% of the way down the frame
			const r = figure.getBoundingClientRect();
			const dx = (x - (r.left + r.width / 2)) / (window.innerWidth * 0.36);
			const dy = (y - (r.top + r.height * 0.4)) / (window.innerHeight * 0.32);
			const col = Math.round((Math.max(-1, Math.min(1, dx)) + 1) * 2);
			const row = dy < -0.45 ? 0 : dy > 0.55 ? 2 : 1;
			cell = row * COLS + col;
		};
		const onMove = (e: PointerEvent) => {
			x = e.clientX;
			y = e.clientY;
			if (!frame) frame = requestAnimationFrame(aim);
		};
		const onLeave = () => (cell = CENTER);

		// Fetch the turns once the page has settled
		const load = () => {
			for (const c of characters) for (const src of c.frames) new Image().src = src;
			tracking = true;
			window.addEventListener('pointermove', onMove, { passive: true });
			document.documentElement.addEventListener('pointerleave', onLeave);
		};
		const idle = 'requestIdleCallback' in window ? requestIdleCallback(load, { timeout: 3000 }) : setTimeout(load, 1500);

		return () => {
			if ('cancelIdleCallback' in window) cancelIdleCallback(idle as number);
			clearTimeout(idle as number);
			cancelAnimationFrame(frame);
			window.removeEventListener('pointermove', onMove);
			document.documentElement.removeEventListener('pointerleave', onLeave);
		};
	});
</script>

<div class="bust" bind:this={figure}>
	<div class="figure">
		<!-- Her shadow on the wall: the window is to the left, so it falls right -->
		{#each characters as c, i}
			<img class="shade" class:is-on={i === active} src={c.frames[CENTER]} alt="" width="1800" height="1500" aria-hidden="true" />
		{/each}

		{#each characters as c, i}
			<img
				class="frame"
				class:is-on={i === active}
				src={c.frames[CENTER]}
				alt={i === active ? c.alt : ''}
				width="1800"
				height="1500"
				fetchpriority={i === 0 ? 'high' : 'auto'}
				loading={i === 0 ? 'eager' : 'lazy'}
				decoding="async"
			/>
		{/each}

		<!-- Head turns sit over the looking-at-you frame, so nothing dips between them -->
		{#if tracking}
			{#each characters[active].frames as src, i (src)}
				{#if i !== CENTER}
					<img class="frame turn" class:is-on={!settling && i === cell} {src} alt="" width="1800" height="1500" decoding="async" />
				{/if}
			{/each}
		{/if}
	</div>
</div>

<style>
	.bust {
		position: relative;
		aspect-ratio: 6 / 5;
		height: 100%;
	}

	/* A slow breath, so a still frame never reads as a photo */
	.figure {
		position: absolute;
		inset: 0;
		transform-origin: 50% 100%;
		animation: breathe 5.2s ease-in-out infinite;
	}

	.frame,
	.shade {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity 0.8s ease;
	}

	.frame.is-on {
		opacity: 1;
	}

	.frame.turn {
		transition-duration: 0.16s;
	}

	.shade {
		filter: brightness(0) blur(22px);
		transform: translate(3%, 2%);
	}

	.shade.is-on {
		opacity: 0.2;
	}

	@keyframes breathe {
		0%,
		100% {
			transform: none;
		}
		50% {
			transform: translateY(-0.35%) scale(1.004);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.figure {
			animation: none;
		}
	}
</style>

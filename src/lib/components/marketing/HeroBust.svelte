<script lang="ts">
	import { onMount } from 'svelte';

	// Head-and-shoulders companion standing in the room's light, no card. Each
	// character has a 5x3 grid of prerendered head turns (row by row from
	// up-left; the middle of row 1 looks straight at you). On desktop she turns
	// toward the cursor. Her line types into the app's speech bubble.
	let {
		characters,
		active = 0,
		bubble,
		meta = ''
	}: {
		characters: { alt: string; frames: string[] }[];
		active?: number;
		bubble: string;
		meta?: string;
	} = $props();

	const COLS = 5;
	const CENTER = 7;

	// SSR and the first beat show the full line; later beats stream in like a reply.
	let shown = $state(Infinity);
	let first = true;

	$effect(() => {
		const text = bubble;
		if (first || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			first = false;
			shown = Infinity;
			return;
		}
		shown = 0;
		const start = performance.now() + 260;
		let frame = requestAnimationFrame(function tick(now) {
			shown = Math.max(0, Math.floor((now - start) / 26));
			if (shown < text.length) frame = requestAnimationFrame(tick);
		});
		return () => cancelAnimationFrame(frame);
	});

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
			// Her face sits a little under a third of the way down the figure
			const r = figure.getBoundingClientRect();
			const dx = (x - (r.left + r.width / 2)) / (window.innerWidth * 0.36);
			const dy = (y - (r.top + r.height * 0.3)) / (window.innerHeight * 0.32);
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
			<img class="shade" class:is-on={i === active} src={c.frames[CENTER]} alt="" width="1000" height="1250" aria-hidden="true" />
		{/each}

		{#each characters as c, i}
			<img
				class="frame"
				class:is-on={i === active}
				src={c.frames[CENTER]}
				alt={i === active ? c.alt : ''}
				width="1000"
				height="1250"
				fetchpriority={i === 0 ? 'high' : 'auto'}
				loading={i === 0 ? 'eager' : 'lazy'}
				decoding="async"
			/>
		{/each}

		<!-- Head turns sit over the looking-at-you frame, so nothing dips between them -->
		{#if tracking}
			{#each characters[active].frames as src, i (src)}
				{#if i !== CENTER}
					<img class="frame turn" class:is-on={!settling && i === cell} {src} alt="" width="1000" height="1250" decoding="async" />
				{/if}
			{/each}
		{/if}
	</div>

	{#key active}
		<div class="bubble">
			<p>
				<span class="sr-only">{bubble}</span>
				<span aria-hidden="true">{bubble.slice(0, shown)}<span class="bubble-rest">{bubble.slice(shown)}</span></span>
				{#if meta}<span class="meta">{meta}</span>{/if}
			</p>
			<span class="bubble-tail" aria-hidden="true"></span>
		</div>
	{/key}
</div>

<style>
	.bust {
		position: relative;
		aspect-ratio: 4 / 5;
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
		/* Shoulders dissolve into the room instead of ending at a hard edge */
		-webkit-mask-image: linear-gradient(to bottom, #000 72%, transparent 97%);
		mask-image: linear-gradient(to bottom, #000 72%, transparent 97%);
	}

	.frame.is-on {
		opacity: 1;
	}

	.frame.turn {
		transition-duration: 0.16s;
	}

	.shade {
		filter: brightness(0) blur(22px);
		transform: translate(5%, 2.5%);
	}

	.shade.is-on {
		opacity: 0.2;
	}

	/* The app's speech bubble, beside her face with the tail pointing back */
	.bubble {
		position: absolute;
		top: 13%;
		left: 70%;
		z-index: 3;
		width: max-content;
		max-width: 236px;
		filter: drop-shadow(0 12px 24px rgba(40, 16, 8, 0.16));
		animation: bubbleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.bubble p {
		margin: 0;
		padding: 12px 16px;
		border-radius: 16px;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-size: 13px;
		line-height: 1.5;
	}

	.bubble-rest {
		visibility: hidden;
	}

	/* Status line under her message, like a chat timestamp */
	.meta {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin-top: 6px;
		padding-top: 6px;
		border-top: 1px solid color-mix(in srgb, var(--text-primary) 8%, transparent);
		color: var(--text-secondary);
		font-size: 11.5px;
		font-weight: 500;
		line-height: 1.3;
	}

	.meta::before {
		content: '';
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		margin-top: 4px;
		border-radius: 50%;
		background: var(--color-success);
	}

	.bubble-tail {
		position: absolute;
		top: 50%;
		left: -9px;
		width: 0;
		height: 0;
		border-top: 8px solid transparent;
		border-bottom: 8px solid transparent;
		border-right: 10px solid var(--bg-secondary);
		transform: translateY(-50%);
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

	@keyframes bubbleIn {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	@media (max-width: 956px) {
		.bust {
			width: 100%;
			height: auto;
		}

		.bubble {
			top: 6%;
			left: auto;
			right: -2%;
		}

		.bubble p {
			padding: 10px 14px;
			font-size: 12px;
		}

		.bubble-tail {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.figure,
		.bubble {
			animation: none;
		}
	}
</style>

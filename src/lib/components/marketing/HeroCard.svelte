<script lang="ts">
	import { onMount } from 'svelte';

	// Frosted glass card with a companion inside. Her line types into the app's
	// own speech bubble, with a small status line under it (`meta`). With `gaze`
	// frames (nine per image, row by row from up-left), she looks toward the
	// cursor on desktop.
	let {
		images,
		active = 0,
		bubble,
		meta = ''
	}: {
		images: { src: string; alt: string; gaze?: string[] }[];
		active?: number;
		bubble: string;
		meta?: string;
	} = $props();

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

	const CENTER = 4;
	let card: HTMLDivElement;
	let cell = $state(CENTER);
	let tracking = $state(false);
	let settling = $state(false);

	// A new companion looks at you first, then glances toward the cursor
	$effect(() => {
		void active;
		settling = true;
		const id = setTimeout(() => (settling = false), 900);
		return () => clearTimeout(id);
	});

	onMount(() => {
		const canTrack =
			images.some((image) => image.gaze) &&
			matchMedia('(hover: hover) and (pointer: fine)').matches &&
			!matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!canTrack) return;

		let frame = 0;
		let x = 0;
		let y = 0;
		const aim = () => {
			frame = 0;
			// Her face sits about a quarter of the way down the card
			const r = card.getBoundingClientRect();
			const dx = (x - (r.left + r.width / 2)) / (window.innerWidth * 0.22);
			const dy = (y - (r.top + r.height * 0.26)) / (window.innerHeight * 0.3);
			const col = dx < -0.45 ? 0 : dx > 0.45 ? 2 : 1;
			const row = dy < -0.5 ? 0 : dy > 0.6 ? 2 : 1;
			cell = row * 3 + col;
		};
		const onMove = (e: PointerEvent) => {
			x = e.clientX;
			y = e.clientY;
			if (!frame) frame = requestAnimationFrame(aim);
		};
		const onLeave = () => (cell = CENTER);

		// Fetch the frames once the page has settled
		const load = () => {
			for (const image of images) for (const src of image.gaze ?? []) new Image().src = src;
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

<div class="hero-card" bind:this={card}>
	<div class="card-glass">
		{#each images as image, i}
			<img
				class="card-img"
				class:is-on={i === active}
				src={image.src}
				alt={i === active ? image.alt : ''}
				width="734"
				height="1116"
				fetchpriority={i === 0 ? 'high' : 'auto'}
				loading={i === 0 ? 'eager' : 'lazy'}
				decoding="async"
			/>
		{/each}

		<!-- Gaze frames sit over the base image, which is the looking-at-you frame -->
		{#if tracking && images[active].gaze}
			{#each images[active].gaze ?? [] as src, i (src)}
				<img
					class="card-img gaze"
					class:is-on={!settling && i === cell && i !== CENTER}
					{src}
					alt=""
					width="734"
					height="1116"
					decoding="async"
				/>
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
	.hero-card {
		position: relative;
		display: flex;
		justify-content: center;
		flex-shrink: 0;
		width: 100%;
		max-width: var(--card-w, 400px);
		height: calc(var(--card-w, 400px) * 1.52);
	}

	.card-glass {
		position: relative;
		view-transition-name: hero-card;
		width: 100%;
		height: 100%;
		overflow: hidden;
		/* Frosted glass: the room's light blurs through it, with a lit top edge */
		border: 1px solid rgba(255, 255, 255, 0.34);
		border-radius: calc(var(--card-w, 400px) * 0.15);
		background: rgba(255, 255, 255, 0.07);
		-webkit-backdrop-filter: blur(14px) saturate(1.15);
		backdrop-filter: blur(14px) saturate(1.15);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.45),
			0 40px 70px -40px rgba(40, 15, 5, 0.45);
	}

	.card-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center bottom;
		opacity: 0;
		transition: opacity 0.8s ease;
		-webkit-mask-image: linear-gradient(to bottom, #000 74%, transparent 99%);
		mask-image: linear-gradient(to bottom, #000 74%, transparent 99%);
	}

	.card-img.is-on {
		opacity: 1;
	}

	/* Glances are quick; the base frame stays underneath so nothing dips */
	.card-img.gaze {
		transition-duration: 0.18s;
	}

	/* The app's speech bubble: soft rectangle, tail pointing back at her */
	.bubble {
		position: absolute;
		top: 38px;
		right: calc(var(--card-w, 400px) * -0.16);
		z-index: 3;
		max-width: 236px;
		filter: drop-shadow(0 12px 24px rgba(0, 16, 48, 0.14));
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
		.hero-card {
			margin-top: 40px;
		}

		.bubble {
			top: -26px;
			right: -18px;
			max-width: 236px;
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
		.bubble {
			animation: none;
		}
	}
</style>

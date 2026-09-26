<script lang="ts">
	import { onMount } from 'svelte';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SiteNav from './SiteNav.svelte';
	import PlatformLine from './PlatformLine.svelte';
	import HeroBust from './HeroBust.svelte';
	import { m } from '$lib/paraglide/messages';

	// Two companions trade places as the headline turns over. Each has a 5x3
	// grid of prerendered head turns (see HeroBust).
	const turns = (key: string) =>
		Array.from({ length: 15 }, (_, i) => `/landing-page/bust/${key}-${Math.floor(i / 5)}-${i % 5}.webp`);
	const characters = [
		{ alt: m.hero_alt_tsuki(), frames: turns('tsuki') },
		{ alt: m.hero_alt_avatar_c(), frames: turns('avatar-c') }
	];

	// One beat per headline word, alternating who is standing there
	const beats = [
		{ word: m.hero_word_body(), who: 0 },
		{ word: m.hero_word_voice(), who: 1 },
		{ word: m.hero_word_memory(), who: 0 },
		{ word: m.hero_word_home(), who: 1 }
	];

	let active = $state(0);
	let leaving = $state(-1);
	let started = $state(false);

	// The longest word sizes the headline so the rotation never reflows it
	const ghost = beats.reduce((a, b) => (b.word.length > a.length ? b.word : a), '');

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const id = setInterval(() => {
			started = true;
			leaving = active;
			active = (active + 1) % beats.length;
		}, 3800);
		return () => clearInterval(id);
	});
</script>

<section class="hero" aria-labelledby="hero-title">
	<SiteNav variant="hero" />

	<div class="hero-content">
		<div class="hero-wrap">
			<div class="hero-copy">
				<div class="hero-head">
				<h1 id="hero-title" class="hero-title">
					<span class="sr-only">{m.hero_title_full()}</span>
					<span aria-hidden="true">
						<span class="title-line">{m.hero_title_line()}</span>
						<span class="title-cycle">
							<span class="title-ghost">{ghost}</span>
							{#each beats as beat, i}
								<span
									class="title-word"
									class:is-on={i === active}
									class:is-off={i === leaving}
									class:is-still={!started}
								>
									{#each beat.word.split('') as ch, j}<span class="letter" style="--i: {j}"
											>{ch === ' ' ? ' ' : ch}</span
										>{/each}
								</span>
							{/each}
						</span>
					</span>
				</h1>
				<p class="hero-lede">{m.hero_lede()}</p>
				</div>

				<div class="hero-cta">
					<a href="/download" class="btn btn-hero">
						<DownloadIcon size={18} strokeWidth={2.25} />
						{m.hero_download()}
					</a>
					<PlatformLine />
				</div>
			</div>

			<div class="hero-figure">
				<HeroBust {characters} active={beats[active].who} />
			</div>

			<a href="/download" class="btn btn-hero hero-cta-mobile">
				<DownloadIcon size={18} strokeWidth={2.25} />
				{m.hero_download()}
			</a>
		</div>
	</div>
</section>

<style>
	.hero {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 54px;
		width: 100%;
		min-height: 100vh;
		min-height: 100dvh;
		padding: 64px clamp(24px, 5.9vw, 85px);
	}

	.hero-content {
		z-index: 3;
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-grow: 1;
		width: 100%;
		margin-bottom: 22px;
		color: #fff;
	}

	/* --wrap is the copy's column; it grows with the copy's zoom on big
	   monitors so the figure beside it stays clear of the headline */
	.hero-wrap {
		--wrap: 1130px;
		display: flex;
		justify-content: space-between;
		gap: clamp(32px, 4vw, 56px);
		width: 100%;
		max-width: var(--wrap);
		margin: auto 0;
	}

	/* The copy holds the left side, in front of the figure */
	.hero-copy {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 8px;
		min-width: 0;
		min-height: min(620px, calc(100svh - 240px));
	}

	/* Head and shoulders, standing in the room: anchored to the bottom of the
	   hero and sized by its height, so the face lands at the same spot on any
	   laptop screen. */
	/* Large and centered, cut by the fold. Everything is a percentage of the
	   hero's height so her eyes sit 42% down on any screen (they are 40% down
	   the frame). A little right of center keeps the headline off her face. */
	.hero-figure {
		--h: min(108%, 1600px);
		position: absolute;
		inset: 0;
		z-index: 1;
		overflow: hidden;
		pointer-events: none;
		-webkit-mask-image: linear-gradient(to bottom, #000 80%, transparent 100%);
		mask-image: linear-gradient(to bottom, #000 80%, transparent 100%);
	}

	.hero-figure :global(.bust) {
		position: absolute;
		top: calc(42% - 0.4 * var(--h));
		left: 57%;
		height: var(--h);
		translate: -50% 0;
	}

	/* Headline and the one plain sentence that says what Utsuwa is */
	.hero-head {
		display: flex;
		flex-direction: column;
		justify-content: center;
		flex-grow: 1;
	}

	.hero-title {
		display: flex;
		align-items: center;
		margin: 0;
		color: #fff;
		font-size: clamp(56px, 6.4vw, 96px);
		font-weight: 700;
		line-height: 0.86;
		letter-spacing: -0.066em;
		text-shadow: 0 2px 40px rgba(0, 48, 110, 0.12);
	}

	.title-line,
	.title-cycle {
		display: block;
	}

	.title-cycle {
		position: relative;
	}

	.title-ghost {
		visibility: hidden;
	}

	.title-word {
		position: absolute;
		top: 0;
		left: 0;
		white-space: nowrap;
	}

	/* Letters resolve out of a blur, the site's own motion, instead of dropping in */
	.letter {
		display: inline-block;
		opacity: 0;
		filter: blur(14px);
		transform: translateY(0.12em);
	}

	.title-word.is-still.is-on .letter {
		opacity: 1;
		filter: none;
		transform: none;
	}

	.title-word.is-on:not(.is-still) .letter {
		animation: letterIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) calc(var(--i) * 34ms + 140ms) both;
	}

	.title-word.is-off .letter {
		animation: letterOut 0.42s ease calc(var(--i) * 14ms) both;
	}

	@keyframes letterIn {
		from {
			opacity: 0;
			filter: blur(14px);
			transform: translateY(0.12em);
		}
		to {
			opacity: 1;
			filter: none;
			transform: none;
		}
	}

	@keyframes letterOut {
		from {
			opacity: 1;
			filter: none;
		}
		to {
			opacity: 0;
			filter: blur(12px);
			transform: translateY(-0.08em);
		}
	}

	.hero-lede {
		max-width: 440px;
		margin: 30px 0 0;
		color: rgba(255, 255, 255, 0.88);
		font-size: 19px;
		font-weight: 500;
		line-height: 1.45;
		letter-spacing: -0.02em;
		text-shadow: 0 1px 20px rgba(40, 16, 8, 0.25);
		text-wrap: pretty;
	}

	.hero-cta {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.hero-cta-mobile {
		display: none;
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

	/* Big monitors: scale the composition up instead of leaving a small island */
	/* Narrow desktops: step her further right so the headline clears her face */
	@media (max-width: 1180px) {
		.hero-figure :global(.bust) {
			left: 62%;
		}
	}

	@media (max-width: 1060px) {
		.hero-figure :global(.bust) {
			left: 66%;
		}
	}

	/* Landscape phones: side by side, with type small enough to fit the height */
	@media (max-width: 956px) and (max-height: 520px) and (orientation: landscape) {
		.hero {
			gap: 16px;
			padding-top: 20px;
			padding-bottom: 20px;
		}

		.hero-title {
			font-size: 44px;
		}

		.hero-lede {
			max-width: 340px;
			margin-top: 14px;
			font-size: 15px;
		}

		/* A touch smaller and lower, so her bows stay under the nav */
		.hero-figure :global(.bust) {
			--h: 96%;
			top: calc(46% - 0.4 * var(--h));
			left: 68%;
		}
	}

	@media (min-width: 1800px) and (min-height: 1000px) {
		.hero-wrap {
			--wrap: 1300px;
		}

		.hero-copy {
			zoom: 1.15;
		}
	}

	@media (min-width: 2200px) and (min-height: 1250px) {
		.hero-wrap {
			--wrap: 1582px;
		}

		.hero-copy {
			zoom: 1.4;
		}
	}

	/* Stack on portrait tablets and phones. Landscape phones keep the side
	   by side layout: stacked, their whole first screen was headline. */
	@media (max-width: 956px) and (orientation: portrait), (max-width: 600px) {
		.hero {
			min-height: auto;
		}

		.hero-wrap {
			flex-direction: column;
			align-items: center;
			flex-grow: 1;
		}

		.hero-copy {
			min-height: 0;
			align-items: center;
		}

		.hero-head {
			align-items: center;
		}

		/* Stacked: the figure gets its own band under the copy, bleeding to
		   the screen edges. A higher eye line than desktop, so her hair starts
		   right under the copy instead of leaving a gap of empty wall. */
		.hero-figure {
			position: relative;
			inset: auto;
			width: 100vw;
			/* Grows on tablets, but never pushes the download button off a short screen */
			height: clamp(min(100vw, 260px), 100svh - 440px, min(100vw, 640px));
			margin-top: 12px;
		}

		.hero-figure :global(.bust) {
			--h: 118%;
			top: calc(32% - 0.4 * var(--h));
			left: 50%;
		}

		.hero-title {
			justify-content: center;
			font-size: clamp(44px, 9vw, 72px);
			line-height: 0.95;
			letter-spacing: -0.05em;
			text-align: center;
		}

		.title-word {
			left: 50%;
			translate: -50% 0;
		}

		.hero-lede {
			max-width: min(460px, 100%);
			margin-top: 16px;
			font-size: clamp(16px, 2.2vw, 18px);
			text-align: center;
		}

		.hero-cta {
			display: none;
		}

		.hero-cta-mobile {
			display: inline-flex;
			position: relative;
			margin-top: -40px;
			z-index: 4;
		}
	}

	@media (max-width: 768px) {
		.hero {
			gap: 34px;
			padding: 20px 18px 40px;
		}
	}
</style>

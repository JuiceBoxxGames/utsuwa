<script lang="ts">
	import { onMount } from 'svelte';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SiteNav from './SiteNav.svelte';
	import PlatformLine from './PlatformLine.svelte';
	import HeroCard from './HeroCard.svelte';
	import { m } from '$lib/paraglide/messages';

	// One beat per phrase: the headline word, the companion in the glass card,
	// what she says, and a status line under her message that backs it up.
	const beats = [
		{
			key: 'body',
			word: m.hero_word_body(),
			img: '/landing-page/hero-body.webp',
			alt: m.hero_alt_body(),
			bubble: m.hero_bubble_body(),
			meta: m.hero_meta_body()
		},
		{
			key: 'voice',
			word: m.hero_word_voice(),
			img: '/landing-page/hero-voice.webp',
			alt: m.hero_alt_voice(),
			bubble: m.hero_bubble_voice(),
			meta: m.hero_meta_voice()
		},
		{
			key: 'memory',
			word: m.hero_word_memory(),
			img: '/landing-page/hero-memory.webp',
			alt: m.hero_alt_memory(),
			bubble: m.hero_bubble_memory(),
			meta: m.hero_meta_memory()
		},
		{
			key: 'home',
			word: m.hero_word_home(),
			img: '/landing-page/hero-home.webp',
			alt: m.hero_alt_home(),
			bubble: m.hero_bubble_home(),
			meta: m.hero_meta_home()
		}
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

			<HeroCard
				images={beats.map((b) => ({
					src: b.img,
					alt: b.alt,
					gaze: Array.from({ length: 9 }, (_, i) => `/landing-page/gaze/${b.key}-${i}.webp`)
				}))}
				{active}
				bubble={beats[active].bubble}
				meta={beats[active].meta}
			/>

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

	/* The card scales with the window, by width and by height, so the whole
	   composition (and the download button) fits on short laptop screens */
	.hero-wrap {
		--card-w: clamp(290px, min(29vw, calc((100svh - 250px) * 0.658)), 400px);
		display: flex;
		justify-content: space-between;
		gap: clamp(32px, 4vw, 56px);
		width: 100%;
		max-width: 1130px;
		margin: auto 0;
	}

	.hero-copy {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 8px;
		min-width: 0;
		min-height: calc(var(--card-w) * 1.52);
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
		font-size: clamp(64px, 8.2vw, 110px);
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
	@media (min-width: 1800px) and (min-height: 1000px) {
		.hero-wrap {
			zoom: 1.15;
		}
	}

	@media (min-width: 2200px) and (min-height: 1250px) {
		.hero-wrap {
			zoom: 1.4;
		}
	}

	@media (max-width: 956px) {
		.hero {
			min-height: auto;
		}

		.hero-wrap {
			--card-w: clamp(280px, 44vw, 380px);
			flex-direction: column;
			align-items: center;
			flex-grow: 1;
		}

		.hero-copy {
			min-height: 0;
			align-items: center;
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

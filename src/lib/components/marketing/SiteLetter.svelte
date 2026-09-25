<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	// Scroll-reveal action. Fires once when an element enters the viewport,
	// staggered by an optional delay. Bails out to "always visible" when the
	// user prefers reduced motion or IntersectionObserver isn't around.
	function reveal(node: HTMLElement, delay = 0) {
		if (typeof IntersectionObserver === 'undefined') {
			node.classList.add('revealed');
			return;
		}
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			node.classList.add('revealed');
			return;
		}
		node.style.setProperty('--reveal-delay', `${delay}ms`);
		const obs = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						node.classList.add('revealed');
						obs.unobserve(node);
					}
				}
			},
			{ threshold: 0.18, rootMargin: '0px 0px -8% 0px' }
		);
		obs.observe(node);
		return { destroy: () => obs.disconnect() };
	}

	// The centered "letter" block: the vessel mark, a small lede, one huge line
	// that resolves word by word, a short paragraph, and a pill. "sky" sits on
	// the hero sky, "light" on the white page.
	let {
		tone = 'light',
		lede = m.letter_lede(),
		title = m.letter_title(),
		body = m.letter_body(),
		href = '/blog/starting-the-project',
		label = m.letter_link(),
		external = false
	}: {
		tone?: 'sky' | 'light';
		lede?: string;
		title?: string;
		body?: string;
		href?: string;
		label?: string;
		external?: boolean;
	} = $props();

	let markOpen = $state(false);
</script>

<section class="letter letter--{tone}" aria-label={title}>
	<!-- 器 comes apart into what it is made of: four containers and a dog keeping watch -->
	<button
		type="button"
		class="mark"
		class:open={markOpen}
		aria-expanded={markOpen}
		aria-describedby="mark-note-{tone}"
		onclick={() => (markOpen = !markOpen)}
		onmouseleave={() => (markOpen = false)}
		onblur={() => (markOpen = false)}
	>
		<span class="mark-glyph" aria-hidden="true">器</span>
		<span class="mark-parts" aria-hidden="true">
			<span class="part p1">口</span><span class="part p2">口</span><span class="part dog">犬</span><span
				class="part p3">口</span
			><span class="part p4">口</span>
		</span>
		<span class="sr-only">{m.mark_label()}</span>
	</button>
	<span id="mark-note-{tone}" class="mark-note" role="tooltip">
		{m.mark_note()}
	</span>
	<p class="letter-copy">
		{lede}
		<span class="letter-big" use:reveal
			>{#each title.split(' ') as word, i}<span class="w" style="--wd: {i * 70}ms">{word}</span
				>{' '}{/each}</span
		>
		<span class="letter-rest">{body}</span>
	</p>
	<a
		{href}
		class="letter-link"
		target={external ? '_blank' : undefined}
		rel={external ? 'noopener noreferrer' : undefined}>{label}</a
	>
</section>

<style>
	.letter {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		padding: 50px 24px 174px;
		text-align: center;
	}

	.letter--sky {
		color: #fff;
		text-shadow: 0 1px 24px rgba(0, 40, 100, 0.16);
	}

	/* Fade the sky into the page below */
	.letter--sky::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		z-index: 1;
		width: 100%;
		height: 300px;
		pointer-events: none;
		background: linear-gradient(
			180deg,
			rgba(255, 255, 255, 0) 0,
			rgba(255, 255, 255, 0.02) 10%,
			rgba(255, 255, 255, 0.05) 20%,
			rgba(255, 255, 255, 0.1) 30%,
			rgba(255, 255, 255, 0.18) 40%,
			rgba(255, 255, 255, 0.3) 52%,
			#fff
		);
	}

	.letter--light {
		padding: 80px 24px 40px;
		color: var(--text-primary);
	}

	.letter > * {
		position: relative;
		z-index: 2;
	}

	/* 器, "vessel": the mark the name comes from. Hover, focus, or tap it and
	   it comes apart into four 口 and a 犬 */
	.mark {
		position: relative;
		width: 64px;
		height: 64px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: none;
		color: inherit;
		font: inherit;
		cursor: help;
	}

	.mark:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 4px;
	}

	.mark-glyph,
	.part {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		line-height: 1;
		transition:
			opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1),
			transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.mark-glyph {
		font-size: 40px;
		font-weight: 300;
		opacity: 0.7;
	}

	.part {
		font-size: 18px;
		opacity: 0;
	}

	.dog {
		font-size: 22px;
	}

	.mark:hover .mark-glyph,
	.mark:focus-visible .mark-glyph,
	.mark.open .mark-glyph {
		opacity: 0;
		transform: scale(0.85);
	}

	.mark:hover .part,
	.mark:focus-visible .part,
	.mark.open .part {
		opacity: 0.85;
	}

	.mark:hover .p1,
	.mark:focus-visible .p1,
	.mark.open .p1 {
		transform: translate(-22px, -20px);
	}

	.mark:hover .p2,
	.mark:focus-visible .p2,
	.mark.open .p2 {
		transform: translate(22px, -20px);
	}

	.mark:hover .p3,
	.mark:focus-visible .p3,
	.mark.open .p3 {
		transform: translate(-22px, 20px);
	}

	.mark:hover .p4,
	.mark:focus-visible .p4,
	.mark.open .p4 {
		transform: translate(22px, 20px);
	}

	.letter .mark-note {
		position: absolute;
		top: 0;
		left: 50%;
		z-index: 3;
		width: max-content;
		max-width: 300px;
		padding: 10px 14px;
		border-radius: 14px;
		font-size: 13px;
		font-weight: 500;
		line-height: 1.4;
		letter-spacing: -0.01em;
		text-shadow: none;
		opacity: 0;
		pointer-events: none;
		transform: translate(-50%, 6px);
		transition:
			opacity 0.3s ease,
			transform 0.3s ease;
	}

	.letter--sky .mark-note {
		background: #fff;
		color: #1c2b33;
	}

	.letter--light .mark-note {
		background: var(--text-primary);
		color: #fff;
	}

	.mark:hover + .mark-note,
	.mark:focus-visible + .mark-note,
	.mark.open + .mark-note {
		opacity: 1;
		transform: translate(-50%, -8px);
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

	/* Words resolve out of a blur, left to right, once the line is in view */
	.letter-big .w {
		display: inline-block;
		opacity: 0;
		filter: blur(10px);
		transform: translateY(6px);
	}

	.letter-big:global(.revealed) .w {
		animation: wordIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) var(--wd, 0ms) forwards;
	}

	@keyframes wordIn {
		to {
			opacity: 1;
			filter: none;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.letter-big .w {
			opacity: 1;
			filter: none;
			transform: none;
			animation: none;
		}
	}

	.letter-copy {
		max-width: 640px;
		margin: 20px 0 42px;
		font-size: 24px;
		font-weight: 500;
		line-height: 28px;
		letter-spacing: -0.03em;
	}

	.letter-big {
		display: block;
		margin: 28px 0;
		font-size: 54px;
		font-weight: 700;
		line-height: 54px;
		letter-spacing: -0.065em;
	}

	.letter-rest {
		display: block;
		opacity: 0.9;
	}

	.letter--light .letter-rest {
		opacity: 0.7;
	}

	.letter-link {
		display: inline-block;
		padding: 24px 36px;
		border-radius: 100px;
		font-size: 16px;
		line-height: 20px;
		text-decoration: none;
		filter: drop-shadow(0 0 34px rgba(0, 0, 0, 0.1));
		transition: background 0.5s ease;
	}

	.letter--sky .letter-link {
		background: rgba(255, 255, 255, 0.8);
		color: #1c2b33;
		text-shadow: none;
	}

	.letter--sky .letter-link:hover {
		background: #fff;
	}

	.letter--light .letter-link {
		background: var(--text-primary);
		color: #fff;
	}

	.letter--light .letter-link:hover {
		background: color-mix(in srgb, var(--text-primary), #000 25%);
	}

	@media (max-width: 768px) {
		.letter--sky {
			padding: 30px 36px 120px;
		}

		.letter-copy {
			font-size: 16px;
			line-height: 19px;
		}

		.letter-big {
			margin: 18px 0;
			font-size: 30px;
			line-height: 30px;
			letter-spacing: -0.05em;
		}
	}
</style>

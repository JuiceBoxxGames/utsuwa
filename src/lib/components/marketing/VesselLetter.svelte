<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	// The vessel letter: the 器 mark (it comes apart into four 口 and a 犬 on
	// hover, focus, or tap), a lede, one large line, a paragraph, and a pill.
	let markOpen = $state(false);
</script>

<section class="letter site-container" aria-labelledby="letter-title">
	<div class="mark-wrap">
		<button
			type="button"
			class="mark"
			class:open={markOpen}
			aria-expanded={markOpen}
			aria-describedby="mark-note"
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
		<span id="mark-note" class="mark-note" role="tooltip">{m.mark_note()}</span>
	</div>
	<p class="site-eyebrow">{m.letter_lede()}</p>
	<h2 id="letter-title" class="site-h2">{m.letter_title()}</h2>
	<p class="site-lede">{m.letter_body()}</p>
	<a href="/blog/starting-the-project" class="btn btn-secondary btn-pill">{m.letter_link()}</a>
</section>

<style>
	.letter {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		text-align: center;
	}

	.letter .site-h2 {
		max-width: 18ch;
	}

	.letter .site-lede {
		max-width: 52ch;
		margin-bottom: 8px;
	}

	.mark-wrap {
		position: relative;
	}

	.mark {
		position: relative;
		width: 64px;
		height: 64px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--text-primary);
		font: inherit;
		cursor: help;
	}

	.mark-glyph,
	.part {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		line-height: 1;
		transition:
			opacity 0.45s var(--ease-brand),
			transform 0.45s var(--ease-brand);
	}

	.mark-glyph {
		font-size: 40px;
		font-weight: 300;
	}

	.part {
		font-size: 18px;
		opacity: 0;
	}

	.dog {
		font-size: 22px;
	}

	.mark:is(:hover, :focus-visible, .open) .mark-glyph {
		opacity: 0;
		transform: scale(0.85);
	}

	.mark:is(:hover, :focus-visible, .open) .part {
		opacity: 1;
	}

	.mark:is(:hover, :focus-visible, .open) .p1 {
		transform: translate(-22px, -20px);
	}

	.mark:is(:hover, :focus-visible, .open) .p2 {
		transform: translate(22px, -20px);
	}

	.mark:is(:hover, :focus-visible, .open) .p3 {
		transform: translate(-22px, 20px);
	}

	.mark:is(:hover, :focus-visible, .open) .p4 {
		transform: translate(22px, 20px);
	}

	.mark-note {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		z-index: 3;
		width: max-content;
		max-width: min(300px, 80vw);
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 13px;
		line-height: 1.4;
		opacity: 0;
		pointer-events: none;
		transform: translate(-50%, 6px);
		transition:
			opacity 0.3s ease,
			transform 0.3s ease;
	}

	.mark:is(:hover, :focus-visible, .open) + .mark-note {
		opacity: 1;
		transform: translate(-50%, 0);
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { marketingImage } from '$lib/utils/marketing-images';
	import { formatDate } from '$lib/utils/format-date';
	import type { BlogPostMeta } from '$lib/utils/blog-posts';
	import { m } from '$lib/paraglide/messages';

	let { posts }: { posts: BlogPostMeta[] } = $props();

	// Deep tones mixed from the stat/tier palette so white copy stays readable.
	const tones = [
		'color-mix(in oklab, var(--tier-eternal-bond) 45%, #10141c)',
		'color-mix(in oklab, var(--accent) 42%, #0b1620)',
		'color-mix(in oklab, var(--stat-affection) 40%, #1a1016)',
		'color-mix(in oklab, var(--tier-close-friend) 40%, #0c1614)'
	];
	const faces = ['/landing-page/hero-memory.webp', '/landing-page/hero-voice.webp', '/landing-page/hero-body.webp'];
	const quips = [m.stories_quip_1(), m.stories_quip_2(), m.stories_quip_3(), m.stories_quip_4()];

	let track: HTMLDivElement;
	let active = $state(0);

	function go(i: number) {
		const slide = track.children[i] as HTMLElement | undefined;
		if (!slide) return;
		track.scrollTo({ left: slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2, behavior: 'smooth' });
	}

	onMount(() => {
		let frame = 0;
		const update = () => {
			frame = 0;
			const mid = track.scrollLeft + track.clientWidth / 2;
			let best = 0;
			let bestDist = Infinity;
			[...track.children].forEach((el, i) => {
				const s = el as HTMLElement;
				const d = Math.abs(s.offsetLeft + s.clientWidth / 2 - mid);
				if (d < bestDist) {
					bestDist = d;
					best = i;
				}
			});
			active = best;
		};
		const queue = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		track.addEventListener('scroll', queue, { passive: true });
		update();
		return () => {
			track.removeEventListener('scroll', queue);
			cancelAnimationFrame(frame);
		};
	});
</script>

<section class="stories" aria-labelledby="stories-title">
	<h2 id="stories-title" class="stories-title">{m.stories_title()}</h2>

	<div class="stories-track" bind:this={track}>
		{#each posts as post, i (post.slug)}
			<article
				class="story"
				class:is-active={i === active}
				class:is-near={Math.abs(i - active) === 1}
				style="--tone: {tones[i % tones.length]}"
			>
				<div class="story-copy">
					<div>
						<time class="story-date" datetime={post.date}>{formatDate(post.date)}</time>
						<h3 class="story-heading">{post.title}</h3>
						<p class="story-text">{post.description}</p>
					</div>
					<a class="story-link" href="/blog/{post.slug}" tabindex={i === active ? 0 : -1}>{m.stories_read()}</a>
				</div>

				<div class="story-media">
					<div class="story-photo">
						<img
							{...marketingImage(post.image, '(max-width: 960px) 80vw, 480px', true)}
							alt=""
							loading="lazy"
						/>
					</div>
					<div class="story-comment" aria-hidden="true">
						<span class="comment-face"><img src={faces[i % faces.length]} alt="" loading="lazy" /></span>
						<span class="comment-bubble">{quips[i % quips.length]}</span>
					</div>
				</div>

				{#if i !== active}
					<button class="story-hit" type="button" aria-label={m.stories_show({ title: post.title })} onclick={() => go(i)}></button>
				{/if}
			</article>
		{/each}
	</div>

	<div class="stories-dots" role="tablist" aria-label={m.stories_posts()}>
		{#each posts as post, i (post.slug)}
			<button
				type="button"
				role="tab"
				class:is-active={i === active}
				aria-selected={i === active}
				aria-label={post.title}
				onclick={() => go(i)}
			></button>
		{/each}
	</div>
</section>

<style>
	.stories {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 42px;
		width: 100%;
		margin: 100px 0;
	}

	.stories-title {
		max-width: 632px;
		margin: 12px 24px 0;
		color: var(--text-primary);
		font-size: 48px;
		font-weight: 600;
		line-height: 50px;
		letter-spacing: -0.045em;
		text-align: center;
		text-wrap: balance;
	}

	.stories-track {
		display: flex;
		gap: 32px;
		width: 100%;
		padding: 0 calc(50vw - min(506px, 50vw - 80px));
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
		overscroll-behavior-x: contain;
	}

	.stories-track::-webkit-scrollbar {
		display: none;
	}

	.story {
		position: relative;
		display: flex;
		align-items: center;
		gap: 60px;
		flex: 0 0 min(1012px, 100vw - 160px);
		min-height: 480px;
		padding: 50px 46px 50px 50px;
		border-radius: 60px;
		background: var(--tone);
		color: #fff;
		scroll-snap-align: center;
		opacity: 0.45;
		transition: opacity 0.35s ease;
	}

	.story.is-near {
		opacity: 0.7;
	}

	.story.is-active {
		opacity: 1;
	}

	.story-hit {
		position: absolute;
		inset: 0;
		z-index: 4;
		border: none;
		border-radius: inherit;
		background: none;
		cursor: pointer;
	}

	.story-copy {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 24px;
		align-self: stretch;
		max-width: 373px;
		flex-grow: 1;
	}

	.story-date {
		display: block;
		color: rgba(255, 255, 255, 0.55);
		font-size: 14px;
		font-weight: 500;
		letter-spacing: -0.02em;
	}

	.story-heading {
		margin: 10px 0 0;
		font-size: 30px;
		font-weight: 600;
		line-height: 1.08;
		letter-spacing: -0.045em;
		text-wrap: balance;
	}

	.story-text {
		margin: 14px 0 0;
		color: rgba(255, 255, 255, 0.86);
		font-size: 16px;
		line-height: 20px;
		letter-spacing: -0.02em;
	}

	.story-link {
		align-self: flex-start;
		padding: 14px 22px;
		border-radius: 100px;
		background: rgba(255, 255, 255, 0.14);
		color: #fff;
		font-size: 15px;
		text-decoration: none;
		transition: background 0.3s ease;
	}

	.story-link:hover {
		background: rgba(255, 255, 255, 0.26);
	}

	.story-media {
		position: relative;
		flex: 1 1;
		align-self: stretch;
		display: grid;
		place-items: center;
	}

	.story-photo {
		width: 100%;
		max-width: 470px;
		aspect-ratio: 3 / 2;
		overflow: hidden;
		border: 6px solid rgba(255, 255, 255, 0.95);
		border-radius: 36px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
		transform: rotate(3deg);
	}

	.story-photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	/* The companion's comment, in the app's speech bubble */
	.story-comment {
		position: absolute;
		top: 18px;
		left: 4%;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 12px;
		filter: drop-shadow(0 12px 28px rgba(0, 0, 0, 0.18));
	}

	.comment-face {
		flex-shrink: 0;
		width: 46px;
		height: 46px;
		overflow: hidden;
		border: 3px solid #fff;
		border-radius: 50%;
		background: var(--gradient-aurora-cool);
	}

	.comment-face img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 50% 10%;
		transform: scale(2.2);
		transform-origin: 50% 12%;
	}

	.comment-bubble {
		position: relative;
		padding: 11px 16px;
		border-radius: 16px;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-size: 14px;
		white-space: nowrap;
	}

	.comment-bubble::before {
		content: '';
		position: absolute;
		top: 50%;
		left: -9px;
		border-top: 7px solid transparent;
		border-bottom: 7px solid transparent;
		border-right: 10px solid var(--bg-secondary);
		transform: translateY(-50%);
	}

	.stories-dots {
		display: flex;
		gap: 12px;
	}

	.stories-dots button {
		width: 12px;
		height: 12px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: color-mix(in srgb, var(--text-primary) 30%, transparent);
		cursor: pointer;
		transition:
			transform 0.2s ease,
			background 0.2s ease;
	}

	.stories-dots button.is-active {
		background: color-mix(in srgb, var(--text-primary) 70%, transparent);
		transform: scale(1.33);
	}

	@media (max-width: 960px) {
		.stories {
			gap: 0;
			margin: 80px 0;
		}

		.stories-title {
			font-size: 40px;
			line-height: 44px;
		}

		.stories-track {
			padding: 60px calc(50vw - min(210px, 50vw - 20px)) 56px;
			gap: 16px;
		}

		.story {
			flex-basis: min(420px, 100vw - 40px);
			flex-direction: column-reverse;
			justify-content: flex-end;
			gap: 28px;
			min-height: 0;
			padding: 28px 24px 32px;
			border-radius: 40px;
		}

		.story-copy {
			max-width: none;
		}

		.story-heading {
			font-size: 24px;
		}

		.story-comment {
			top: -34px;
			left: 0;
		}
	}
</style>

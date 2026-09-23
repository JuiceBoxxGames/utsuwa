<script lang="ts">
	import { marketingImage } from '$lib/utils/marketing-images';
	import '$lib/styles/prose.css';
	import { formatDate } from '$lib/utils/format-date';
	import { SITE_URL } from '$lib/config/site';
	import { addCodeCopyButtons } from '$lib/utils/add-code-copy-buttons';
	import { browser } from '$app/environment';
	import type { PageData } from './$types';
	import PostCard from '$lib/components/marketing/PostCard.svelte';

	let { data }: { data: PageData } = $props();

	let articleEl = $state<HTMLElement | null>(null);
	let toc = $state<Array<{ id: string; text: string; level: number }>>([]);
	let activeId = $state('');

	function scrollToHeading(e: MouseEvent, id: string) {
		e.preventDefault();
		const el = document.getElementById(id);
		if (!el) return;
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		history.replaceState(null, '', `#${id}`);
		activeId = id;
	}

	// Build the "On this page" list from the post's headings and scroll-spy them.
	$effect(() => {
		void data.content;
		if (!browser || !articleEl) return;

		let observer: IntersectionObserver | null = null;
		const raf = requestAnimationFrame(() => {
			addCodeCopyButtons('.blog-post');

			const headings = Array.from(articleEl!.querySelectorAll<HTMLElement>('h2[id], h3[id]'));
			toc = headings.map((h) => ({
				id: h.id,
				text: h.textContent ?? '',
				level: h.tagName === 'H3' ? 3 : 2
			}));
			activeId = headings[0]?.id ?? '';

			if (!headings.length) return;
			observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) activeId = (entry.target as HTMLElement).id;
					}
				},
				{ rootMargin: '0px 0px -75% 0px', threshold: 0 }
			);
			headings.forEach((h) => observer!.observe(h));
		});

		return () => {
			cancelAnimationFrame(raf);
			observer?.disconnect();
		};
	});
</script>

<svelte:head>
	<title>{data.metadata?.title || 'Blog'} - Utsuwa</title>
	{#if data.metadata?.description}
		<meta name="description" content={data.metadata.description} />
	{/if}
	<meta property="og:type" content="article" />
	<meta property="og:title" content={data.metadata?.title || 'Blog'} />
	{#if data.metadata?.description}
		<meta property="og:description" content={data.metadata.description} />
	{/if}
	<meta property="og:image" content={data.metadata?.image ? `${SITE_URL}${data.metadata.image}` : `${SITE_URL}/brand-assets/thumbnail.jpg`} />
	<meta property="og:url" content={`${SITE_URL}/blog/${data.slug}`} />
	<meta property="og:site_name" content="Utsuwa" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={data.metadata?.title || 'Blog'} />
	{#if data.metadata?.description}
		<meta name="twitter:description" content={data.metadata.description} />
	{/if}
	<meta name="twitter:image" content={data.metadata?.image ? `${SITE_URL}${data.metadata.image}` : `${SITE_URL}/brand-assets/thumbnail.jpg`} />
	<link rel="canonical" href={`${SITE_URL}/blog/${data.slug}`} />
	{@html `<script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'BlogPosting',
		headline: data.metadata?.title,
		description: data.metadata?.description,
		image: data.metadata?.image ? `${SITE_URL}${data.metadata.image}` : `${SITE_URL}/brand-assets/thumbnail.jpg`,
		datePublished: data.metadata?.date,
		url: `${SITE_URL}/blog/${data.slug}`,
		author: {
			'@type': 'Organization',
			name: 'Utsuwa',
			url: SITE_URL
		},
		publisher: {
			'@type': 'Organization',
			name: 'Utsuwa',
			url: SITE_URL
		}
	})}</script>`}
	{@html '<style>html { scroll-padding-top: 6rem; }</style>'}
</svelte:head>

<div class="post-page">
	<header class="post-head">
		<p class="post-meta">
			{#if data.metadata?.date}
				<time datetime={String(data.metadata.date)}>{formatDate(data.metadata.date)}</time>
			{/if}
			{#if data.metadata?.tag}
				<span>{data.metadata.tag}</span>
			{/if}
			<span>Charles J. (CJ) Dyas</span>
		</p>

		{#if data.metadata?.title}
			<h1 class="post-title">{data.metadata.title}</h1>
		{/if}

		{#if data.metadata?.description}
			<p class="post-lead">{data.metadata.description}</p>
		{/if}
	</header>

	{#if data.metadata?.image}
		<div class="post-banner">
			<img
				{...marketingImage(data.metadata.image, '(max-width: 1000px) calc(100vw - 36px), 960px')}
				fetchpriority="high"
				alt=""
			/>
		</div>
	{/if}

	<div class="post-layout" class:has-toc={toc.length > 0}>
		{#if toc.length}
			<aside class="toc" aria-label="Table of contents">
				<p class="toc-title">On this page</p>
				<ul class="toc-list">
					{#each toc as heading}
						<li class:sub={heading.level === 3}>
							<a
								href={`#${heading.id}`}
								class:active={activeId === heading.id}
								onclick={(e) => scrollToHeading(e, heading.id)}
							>
								{heading.text}
							</a>
						</li>
					{/each}
				</ul>
			</aside>
		{/if}

		<article class="blog-post prose" bind:this={articleEl}>
			<data.content />
		</article>
	</div>
</div>

{#if data.more.length}
	<section class="more" aria-labelledby="more-title">
		<h2 id="more-title" class="more-title">Keep reading</h2>
		<div class="more-grid">
			{#each data.more as post (post.slug)}
				<PostCard {post} />
			{/each}
		</div>
	</section>
{/if}

<style>
	/* Manifesto-style reading column: date, one big title, then the story */
	.post-page {
		color: var(--text-primary);
		animation: rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.post-head {
		max-width: 760px;
		margin: 0 auto;
		padding: 72px 0 44px;
		text-align: center;
	}

	.post-meta {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		margin: 0 0 22px;
		color: color-mix(in srgb, var(--text-primary) 45%, transparent);
		font-size: 16px;
		font-weight: 500;
		letter-spacing: -0.02em;
	}

	.post-meta > * + *::before {
		content: '\00b7';
		margin-right: 8px;
	}

	.post-title {
		margin: 0;
		font-size: 64px;
		font-weight: 700;
		line-height: 0.98;
		letter-spacing: -0.06em;
		text-wrap: balance;
	}

	.post-lead {
		max-width: 620px;
		margin: 24px auto 0;
		color: color-mix(in srgb, var(--text-primary) 80%, transparent);
		font-size: 22px;
		font-weight: 500;
		line-height: 28px;
		letter-spacing: -0.03em;
	}

	.post-banner {
		max-width: 960px;
		margin: 0 auto 64px;
		overflow: hidden;
		border-radius: 48px;
		background: var(--gradient-aurora-cool);
	}

	.post-banner img {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
	}

	/* Contents rail sits in the left margin; the story stays centered */
	.post-layout {
		position: relative;
	}

	.blog-post {
		max-width: 680px;
		margin: 0 auto;
		min-width: 0;
	}

	.post-page .blog-post {
		color: color-mix(in srgb, var(--text-primary) 92%, transparent);
		font-size: 19px;
		line-height: 1.62;
		letter-spacing: -0.012em;
	}

	.post-page .blog-post :global(h1:first-child) {
		display: none;
	}

	.post-page .blog-post :global(p) {
		margin: 0 0 1.1em;
		color: inherit;
	}

	.post-page .blog-post :global(h2) {
		margin: 2.2em 0 0.55em;
		font-size: 34px;
		font-weight: 700;
		line-height: 1.08;
		letter-spacing: -0.05em;
		text-shadow: none;
	}

	.post-page .blog-post :global(h3) {
		margin: 1.8em 0 0.5em;
		font-size: 24px;
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.035em;
	}

	.post-page .blog-post :global(a) {
		color: var(--accent);
		font-weight: 500;
	}

	.post-page .blog-post :global(img) {
		max-width: 100%;
		height: auto;
		border-radius: 28px;
	}

	.post-page .blog-post :global(pre) {
		margin: 1.6em 0;
		padding: 22px 26px;
		border: none;
		border-radius: 24px;
		background: var(--bg-secondary);
		box-shadow: none;
		font-size: 15px;
	}

	.post-page .blog-post :global(:not(pre) > code) {
		border: none;
		border-radius: 8px;
		background: var(--bg-secondary);
		box-shadow: none;
	}

	.post-page .blog-post :global(blockquote) {
		margin: 1.6em 0;
		padding: 4px 0 4px 22px;
		border-left: 3px solid var(--stat-affection);
		color: color-mix(in srgb, var(--text-primary) 75%, transparent);
	}

	.post-page .blog-post :global(ul),
	.post-page .blog-post :global(ol) {
		padding-left: 1.3em;
	}

	.post-page .blog-post :global(li) {
		margin: 0.35em 0;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(18px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.toc {
		position: absolute;
		top: 0;
		left: 0;
		width: 200px;
		height: 100%;
	}

	.toc-title {
		margin: 0 0 10px;
		padding-left: 12px;
		color: color-mix(in srgb, var(--text-primary) 45%, transparent);
		font-size: 14px;
		font-weight: 500;
	}

	.toc-list {
		position: sticky;
		top: 96px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.toc-list a {
		display: block;
		padding: 7px 12px;
		border-radius: 100px;
		color: color-mix(in srgb, var(--text-primary) 55%, transparent);
		font-size: 14px;
		line-height: 1.3;
		letter-spacing: -0.02em;
		text-decoration: none;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}

	.toc-list li.sub a {
		padding-left: 24px;
		font-size: 13px;
	}

	.toc-list a:hover {
		color: var(--text-primary);
	}

	.toc-list a.active {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	.more {
		max-width: 1180px;
		margin: 120px auto 0;
	}

	.more-title {
		margin: 0 0 28px;
		font-size: 40px;
		font-weight: 700;
		letter-spacing: -0.05em;
		color: var(--text-primary);
	}

	.more-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 20px;
	}

	@media (max-width: 1240px) {
		.toc {
			display: none;
		}
	}

	@media (max-width: 960px) {
		.more-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 640px) {
		.post-head {
			padding: 40px 0 32px;
		}

		.post-title {
			font-size: 40px;
			letter-spacing: -0.05em;
		}

		.post-lead {
			font-size: 18px;
			line-height: 24px;
		}

		.post-banner {
			margin-bottom: 40px;
			border-radius: 32px;
		}

		.post-page .blog-post {
			font-size: 17px;
		}

		.post-page .blog-post :global(h2) {
			font-size: 28px;
		}

		.more-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.post-page {
			animation: none;
		}
	}
</style>

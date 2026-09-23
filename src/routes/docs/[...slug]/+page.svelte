<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import DocsPrevNext from '$lib/components/docs/DocsPrevNext.svelte';
	import { DOCS_URL, SITE_URL } from '$lib/config/site';
	import { docsNav } from '$lib/config/docs-nav';
	import { localPath } from '$lib/config/links';
	import { addCodeCopyButtons } from '$lib/utils/add-code-copy-buttons';
	import { browser } from '$app/environment';
	import '$lib/styles/prose.css';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let copied = $state(false);
	let articleEl = $state<HTMLElement | null>(null);
	let toc = $state<Array<{ id: string; text: string; level: number }>>([]);
	let activeId = $state('');

	// Which nav section does this page live under? (for the breadcrumb)
	const section = $derived(docsNav.find((s) => s.items.some((i) => i.slug === data.slug)));

	async function copyPage() {
		const article = document.querySelector('.docs-content') as HTMLElement | null;
		if (!article) return;
		await navigator.clipboard.writeText(article.innerText);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function scrollToHeading(e: MouseEvent, id: string) {
		e.preventDefault();
		const el = document.getElementById(id);
		if (!el) return;
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		history.replaceState(null, '', `#${id}`);
		activeId = id;
	}

	// Rebuild the on-page table of contents whenever the doc changes.
	$effect(() => {
		void data.content;
		if (!browser || !articleEl) return;

		let observer: IntersectionObserver | null = null;
		const raf = requestAnimationFrame(() => {
			addCodeCopyButtons('.docs-content');

			const headings = Array.from(
				articleEl!.querySelectorAll<HTMLElement>('h2[id], h3[id]')
			);
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
	<title>{data.metadata?.title || 'Docs'} - Utsuwa</title>
	{#if data.metadata?.description}
		<meta name="description" content={data.metadata.description} />
	{/if}
	<meta property="og:type" content="article" />
	<meta property="og:title" content={data.metadata?.title || 'Docs'} />
	{#if data.metadata?.description}
		<meta property="og:description" content={data.metadata.description} />
	{/if}
	<meta property="og:url" content={`${DOCS_URL}/${data.slug}`} />
	<meta property="og:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
	<meta name="twitter:title" content={data.metadata?.title || 'Docs'} />
	{#if data.metadata?.description}
		<meta name="twitter:description" content={data.metadata.description} />
	{/if}
	<link rel="canonical" href={`${DOCS_URL}/${data.slug}`} />
	{@html `<script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'TechArticle',
		headline: data.metadata?.title,
		description: data.metadata?.description,
		url: `${DOCS_URL}/${data.slug}`,
		publisher: {
			'@type': 'Organization',
			name: 'Utsuwa',
			url: SITE_URL
		}
	})}</script>`}
	{@html '<style>html { scroll-padding-top: 6rem; }</style>'}
</svelte:head>

<div class="doc-wrap">
	<div class="doc-main">
		<nav class="breadcrumb" aria-label="Breadcrumb">
			<a href={localPath('docs')}>Docs</a>
			{#if section}
				<Icon name="chevron-right" size={12} />
				<span class="crumb-section">{section.title}</span>
			{/if}
			<Icon name="chevron-right" size={12} />
			<span class="crumb-current">{data.metadata?.title || 'Page'}</span>
		</nav>

		<article class="docs-content prose" bind:this={articleEl}>
			<div class="page-toolbar">
				<button type="button" class="btn btn-secondary" onclick={copyPage} title="Copy page content">
					<Icon name={copied ? 'check' : 'copy'} size={14} />
					<span>{copied ? 'Copied' : 'Copy page'}</span>
				</button>
			</div>
			<data.content />
			<DocsPrevNext slug={data.slug} />
		</article>
	</div>

	{#if toc.length}
		<aside class="toc" aria-label="Table of contents">
			<p class="toc-title">Table of contents</p>
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
</div>

<style>
	.doc-wrap {
		display: flex;
		gap: 2.5rem;
		max-width: 70rem;
		margin: 0 auto;
		padding: 1.75rem 3rem 2rem;
		align-items: flex-start;
	}

	.doc-main {
		flex: 1;
		min-width: 0;
		max-width: 48rem;
	}

	.docs-content {
		max-width: none;
		margin: 0;
		padding: 0;
	}

	.docs-content :global(h2),
	.docs-content :global(h3) {
		scroll-margin-top: 1.25rem;
	}

	/* Breadcrumb */
	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--text-secondary);
		margin-bottom: 1.25rem;
	}

	.breadcrumb a {
		color: var(--text-secondary);
		text-decoration: none;
		transition: color 0.15s ease;
	}

	.breadcrumb a:hover {
		color: var(--text-primary);
	}

	.crumb-current {
		color: var(--text-primary);
		font-weight: 600;
	}

	.breadcrumb :global(svg) {
		opacity: 0.5;
	}

	.page-toolbar {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.5rem;
	}

	/* On-page table of contents */
	.toc {
		position: sticky;
		top: 1.5rem;
		width: 14rem;
		flex-shrink: 0;
		align-self: start;
		max-height: calc(100vh - 6rem);
		overflow-y: auto;
	}

	.toc-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-secondary);
		margin: 0 0 0.75rem;
		padding-left: 0.75rem;
	}

	.toc-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.toc-list a {
		display: block;
		padding: 0.4rem 0.75rem;
		border-radius: var(--radius-md);
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--text-secondary);
		text-decoration: none;
		transition: color 0.15s ease, background 0.15s ease;
	}

	.toc-list li.sub a {
		padding-left: 1.5rem;
		font-size: 0.78rem;
	}

	.toc-list a:hover {
		color: var(--text-primary);
	}

	.toc-list a.active {
		background: var(--bg-tertiary);
		color: var(--text-primary);
		font-weight: 500;
	}

	@media (max-width: 1100px) {
		.toc {
			display: none;
		}

		.doc-wrap {
			max-width: 52rem;
		}
	}

	@media (max-width: 768px) {
		.doc-wrap {
			padding: 1.5rem 1rem;
		}
	}
</style>

<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import DocsSearch from '$lib/components/docs/DocsSearch.svelte';
	import DocsGetStartedCards from '$lib/components/docs/DocsGetStartedCards.svelte';
	import { DOCS_URL, SITE_URL } from '$lib/config/site';
	import { localPath } from '$lib/config/links';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Documentation - Utsuwa</title>
	<meta
		name="description"
		content="Guides, setup, and architecture docs for Utsuwa, the open-source AI companion with 3D VRM avatars, voice, and semantic memory."
	/>
	<link rel="canonical" href={DOCS_URL} />
	<meta property="og:title" content="Utsuwa Documentation" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={DOCS_URL} />
	<meta property="og:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
</svelte:head>

<div class="docs-home" data-pagefind-ignore>
	<header class="home-hero">
		<p class="eyebrow">Documentation</p>
		<h1 class="home-title">Everything you need to run your vessel.</h1>
		<p class="home-lead">
			Guides, setup walkthroughs, and a look under the hood. Search the docs or jump straight to a
			section below.
		</p>
		<div class="home-search">
			<DocsSearch id="docs-home-search" />
		</div>
	</header>

	<section class="home-section">
		<h2 class="section-heading">Get started</h2>
		<DocsGetStartedCards />
	</section>

	<section class="home-section">
		<h2 class="section-heading">Browse the docs</h2>
		<div class="section-grid">
			{#each data.sections as section}
				<div class="section-panel">
					<div class="panel-head">
						<div class="panel-icon">
							<Icon name={section.icon} size={18} />
						</div>
						<h3 class="panel-title">{section.title}</h3>
					</div>
					<ul class="panel-list">
						{#each section.items as item}
							<li>
								<a href={localPath('docs', `/${item.slug}`)} class="panel-link">
									<span class="link-title">
										{item.title}
										<Icon name="arrow-right" size={13} />
									</span>
									{#if item.description}
										<span class="link-desc">{item.description}</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.docs-home {
		max-width: 60rem;
		margin: 0 auto;
		padding: 3rem 2.5rem 4rem;
	}

	/* Hero */
	.home-hero {
		position: relative;
		text-align: center;
		margin-bottom: 3.5rem;
		padding-top: 1rem;
	}

	.eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--docs-accent);
		margin: 0 0 0.85rem;
	}

	.home-title {
		font-family: var(--font-sans);
		font-size: clamp(2rem, 4vw, 3rem);
		font-weight: 600;
		line-height: 1.05;
		letter-spacing: -0.02em;
		text-wrap: balance;
		margin: 0 0 1rem;
		color: var(--docs-text);
	}

	.home-lead {
		font-size: 1.05rem;
		line-height: 1.6;
		color: var(--docs-text-muted);
		max-width: 34rem;
		margin: 0 auto 1.75rem;
		text-wrap: pretty;
	}

	.home-search {
		position: relative;
		max-width: 30rem;
		margin: 0 auto;
	}

	/* Sections */
	.home-section {
		margin-top: 3rem;
	}

	.section-heading {
		font-family: var(--font-sans);
		font-size: 1.35rem;
		font-weight: 600;
		color: var(--docs-text);
		margin: 0 0 1.25rem;
	}

	.section-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.section-panel {
		border: none;
		border-radius: var(--radius-xl);
		padding: 1.5rem;
		background: var(--bg-tertiary);
		transition:
			transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
			box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1);
		box-shadow: var(--shadow-sm);
	}

	.section-panel:hover {
		transform: translateY(-3px);
		box-shadow: var(--shadow-lg);
	}

	.panel-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.panel-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
		background: var(--accent-subtle);
		color: var(--accent);
		flex-shrink: 0;
	}

	.panel-title {
		font-family: var(--font-sans);
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--docs-text);
		margin: 0;
	}

	.panel-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.panel-link {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.6rem 0.7rem;
		border-radius: 0.6rem;
		text-decoration: none;
		transition: background 0.18s ease;
	}

	.panel-link:hover {
		background: var(--accent-subtle);
	}

	.link-title {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--docs-text);
	}

	.link-title :global(svg) {
		opacity: 0;
		transform: translateX(-4px);
		transition: opacity 0.18s ease, transform 0.18s ease;
		color: var(--docs-accent);
	}

	.panel-link:hover .link-title {
		color: var(--docs-accent);
	}

	.panel-link:hover .link-title :global(svg) {
		opacity: 1;
		transform: translateX(0);
	}

	.link-desc {
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--docs-text-muted);
	}

	@media (max-width: 768px) {
		.docs-home {
			padding: 2rem 1rem 3rem;
		}

		.section-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

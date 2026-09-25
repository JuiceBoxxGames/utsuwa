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
							<Icon name={section.icon} size={16} />
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
		padding: 48px 40px 64px;
	}

	.home-hero {
		text-align: center;
		margin-bottom: 40px;
	}

	.eyebrow {
		display: inline-flex;
		align-items: center;
		margin: 0 0 8px;
		text-transform: none;
		letter-spacing: normal;
		color: var(--text-secondary);
		font-size: 13px;
		font-weight: 500;
		line-height: 20px;
	}

	.home-title {
		margin: 0 0 8px;
		color: var(--text-primary);
		font-size: 28px;
		font-weight: 600;
		line-height: 36px;
		letter-spacing: -0.02em;
		text-wrap: balance;
	}

	.home-lead {
		max-width: 34rem;
		margin: 0 auto 24px;
		color: var(--text-secondary);
		font-size: 15px;
		line-height: 1.6;
		text-wrap: pretty;
	}

	.home-search {
		max-width: 30rem;
		margin: 0 auto;
		text-align: left;
	}

	.home-section {
		margin-top: 28px;
	}

	/* Matches the settings group headings. */
	.section-heading {
		margin: 0 0 8px;
		padding: 0 16px;
		color: var(--text-secondary);
		font-size: 14px;
		font-weight: 500;
		line-height: 20px;
		letter-spacing: normal;
	}

	.section-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	.section-panel {
		padding: 16px;
		border-radius: var(--radius-lg);
		background: var(--bg-primary);
	}

	.panel-head {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 8px;
	}

	.panel-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: var(--control-radius);
		background: var(--control-bg);
		color: var(--text-primary);
	}

	.panel-title {
		margin: 0;
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 600;
		line-height: 24px;
		letter-spacing: normal;
	}

	.panel-list {
		list-style: none;
		margin: 0 -8px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.panel-link {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		border-radius: var(--control-radius);
		text-decoration: none;
		transition: background 150ms;
	}

	.panel-link:hover {
		background: var(--control-hover);
	}

	.link-title {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 500;
		line-height: 20px;
	}

	.link-title :global(svg) {
		color: var(--text-secondary);
		opacity: 0;
		transition: opacity 150ms;
	}

	.panel-link:is(:hover, :focus-visible) .link-title :global(svg) {
		opacity: 1;
	}

	.link-desc {
		color: var(--text-secondary);
		font-size: 13px;
		line-height: 18px;
	}

	@media (max-width: 768px) {
		.docs-home {
			padding: 32px 16px 48px;
		}

		.section-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

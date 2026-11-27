<script lang="ts">
	import type { PageData } from './$types';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import { SITE_URL, GITHUB_REPO, GITHUB_RELEASES } from '$lib/config/site';
	import PostCard from '$lib/components/marketing/PostCard.svelte';
	import VesselLetter from '$lib/components/marketing/VesselLetter.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Blog | Utsuwa: Development Updates and AI Companion News</title>
	<meta
		name="description"
		content="Development updates, release notes, and behind-the-scenes notes from building Utsuwa, the open-source AI companion with 3D VRM avatars."
	/>
	<link rel="canonical" href={`${SITE_URL}/blog`} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Blog | Utsuwa" />
	<meta
		property="og:description"
		content="Development updates, release notes, and behind-the-scenes notes from building Utsuwa."
	/>
	<meta property="og:url" content={`${SITE_URL}/blog`} />
	<meta property="og:site_name" content="Utsuwa" />
	<meta property="og:image" content={`${SITE_URL}/brand-assets/og-ink.jpg`} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={`${SITE_URL}/brand-assets/og-ink.jpg`} />
</svelte:head>

<div class="blog-index">
	<header class="blog-hero">
		<p class="site-eyebrow">Blog</p>
		<h1 class="site-h1">Building Utsuwa in the open.</h1>
		<p class="site-lede">Development updates, release notes, and behind-the-scenes notes from the project.</p>
		<div class="site-actions">
			<a class="btn btn-secondary btn-pill" href={GITHUB_REPO} target="_blank" rel="noopener noreferrer"
				>Source code <ArrowUpRightIcon size={15} strokeWidth={2} /></a
			>
			<a class="btn btn-secondary btn-pill" href={GITHUB_RELEASES} target="_blank" rel="noopener noreferrer"
				>Release notes <ArrowUpRightIcon size={15} strokeWidth={2} /></a
			>
		</div>
	</header>

	<section class="blog-posts" aria-labelledby="posts-title">
		<h2 id="posts-title" class="site-h2">Latest posts</h2>
		<div class="post-grid">
			{#each data.posts as post, i (post.slug)}
				<PostCard {post} eager={i < 3} />
			{/each}
		</div>
	</section>

	<div class="blog-letter">
		<VesselLetter />
	</div>
</div>

<style>
	.blog-index {
		max-width: var(--site-max);
		margin: 0 auto;
		padding-bottom: var(--site-section);
	}

	.blog-hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		padding: clamp(56px, 9vw, 120px) 0 clamp(56px, 8vw, 104px);
		text-align: center;
	}

	.blog-hero .site-h1 {
		max-width: 16ch;
	}

	.blog-hero .site-lede {
		max-width: 46ch;
	}

	.blog-hero .site-actions {
		justify-content: center;
		margin-top: 8px;
	}

	.blog-posts .site-h2 {
		margin-bottom: 32px;
	}

	.blog-letter {
		padding-top: var(--site-section);
	}

	.post-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 24px;
	}

	@media (max-width: 960px) {
		.post-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 640px) {
		.post-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

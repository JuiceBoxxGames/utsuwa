<script lang="ts">
	import type { PageData } from './$types';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import { SITE_URL, GITHUB_REPO, GITHUB_RELEASES } from '$lib/config/site';
	import PostCard from '$lib/components/marketing/PostCard.svelte';
	import SiteLetter from '$lib/components/marketing/SiteLetter.svelte';

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
	<meta property="og:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
</svelte:head>

<div class="blog-index">
	<header class="blog-hero">
		<p class="blog-eyebrow">Blog</p>
		<h1 class="blog-title">Building Utsuwa in the open.</h1>
		<p class="blog-lead">Development updates, release notes, and behind-the-scenes notes from the project.</p>
		<dl class="blog-meta">
			<div>
				<dt>Source code</dt>
				<dd>
					<a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer"
						>GitHub <ArrowUpRightIcon size={15} strokeWidth={2} /></a
					>
				</dd>
			</div>
			<div>
				<dt>Release notes</dt>
				<dd>
					<a href={GITHUB_RELEASES} target="_blank" rel="noopener noreferrer"
						>Releases <ArrowUpRightIcon size={15} strokeWidth={2} /></a
					>
				</dd>
			</div>
		</dl>
	</header>

	<section class="blog-posts" aria-labelledby="posts-title">
		<h2 id="posts-title" class="blog-section-title">Latest posts</h2>
		<div class="post-grid">
			{#each data.posts as post, i (post.slug)}
				<PostCard {post} eager={i < 3} />
			{/each}
		</div>
	</section>

	<SiteLetter />
</div>

<style>
	.blog-index {
		max-width: 1180px;
		margin: 0 auto;
		color: var(--text-primary);
	}

	/* Press-page style header: small label, one huge centered line */
	.blog-hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 72px 0 110px;
		text-align: center;
		animation: rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.blog-eyebrow {
		margin: 0 0 18px;
		color: color-mix(in srgb, var(--text-primary) 60%, transparent);
		font-size: 16px;
		letter-spacing: -0.03em;
	}

	.blog-title {
		max-width: 900px;
		margin: 0;
		font-size: 88px;
		font-weight: 700;
		line-height: 0.95;
		letter-spacing: -0.065em;
		text-wrap: balance;
	}

	.blog-lead {
		max-width: 440px;
		margin: 28px 0 0;
		font-size: 16px;
		font-weight: 500;
		line-height: 20px;
		letter-spacing: -0.03em;
	}

	.blog-meta {
		display: flex;
		gap: 40px;
		margin: 34px 0 0;
	}

	.blog-meta dt {
		color: color-mix(in srgb, var(--text-primary) 55%, transparent);
		font-size: 14px;
	}

	.blog-meta dd {
		margin: 2px 0 0;
	}

	.blog-meta a {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 500;
		text-decoration: none;
	}

	.blog-meta a:hover {
		opacity: 0.6;
	}

	.blog-section-title {
		margin: 0 0 28px;
		font-size: 40px;
		font-weight: 700;
		letter-spacing: -0.05em;
	}

	.post-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 20px;
	}

	.blog-posts {
		animation: rise 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
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

	@media (max-width: 960px) {
		.blog-title {
			font-size: 64px;
		}

		.post-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 640px) {
		.blog-hero {
			padding: 48px 0 72px;
		}

		.blog-title {
			font-size: 44px;
			letter-spacing: -0.05em;
		}

		.blog-section-title {
			font-size: 32px;
		}

		.post-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.blog-hero,
		.blog-posts {
			animation: none;
		}
	}
</style>

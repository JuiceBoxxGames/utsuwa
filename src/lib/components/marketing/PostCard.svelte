<script lang="ts">
	import { marketingImage } from '$lib/utils/marketing-images';
	import { formatDate } from '$lib/utils/format-date';
	import type { BlogPostMeta } from '$lib/utils/blog-posts';

	let { post, eager = false }: { post: BlogPostMeta; eager?: boolean } = $props();
</script>

<a href="/blog/{post.slug}" class="post-card">
	<div class="post-card-media">
		<img
			{...marketingImage(post.image, '(max-width: 768px) calc(100vw - 72px), 360px', true)}
			alt=""
			loading={eager ? 'eager' : 'lazy'}
		/>
	</div>
	<div class="post-card-copy">
		<time class="post-card-date" datetime={post.date}>{formatDate(post.date)}</time>
		<h3 class="post-card-title">{post.title}</h3>
		<p class="post-card-text">{post.description}</p>
	</div>
</a>

<style>
	.post-card {
		display: flex;
		flex-direction: column;
		gap: 18px;
		height: 100%;
		padding: 14px 14px 26px;
		border-radius: 40px;
		background: var(--bg-secondary);
		color: var(--text-primary);
		text-decoration: none;
		transition:
			transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
			background 0.3s ease;
	}

	.post-card:hover {
		background: var(--bg-tertiary);
		transform: translateY(-4px);
	}

	.post-card-media {
		aspect-ratio: 4 / 3;
		overflow: hidden;
		border-radius: 28px;
		background: var(--gradient-aurora-cool);
	}

	.post-card-media img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.post-card:hover .post-card-media img {
		transform: scale(1.04);
	}

	.post-card-copy {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0 12px;
	}

	.post-card-date {
		color: var(--text-secondary);
		font-size: 14px;
		font-weight: 500;
		letter-spacing: -0.02em;
	}

	.post-card-title {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		line-height: 1.12;
		letter-spacing: -0.04em;
		text-wrap: balance;
	}

	.post-card-text {
		display: -webkit-box;
		margin: 0;
		overflow: hidden;
		color: color-mix(in srgb, var(--text-primary) 70%, transparent);
		font-size: 15px;
		line-height: 1.35;
		letter-spacing: -0.02em;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	@media (prefers-reduced-motion: reduce) {
		.post-card,
		.post-card-media img {
			transition: none;
		}

		.post-card:hover,
		.post-card:hover .post-card-media img {
			transform: none;
		}
	}
</style>

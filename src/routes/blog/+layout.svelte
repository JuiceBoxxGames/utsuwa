<script lang="ts">
	import '$lib/styles/site.css';
	import SiteNav from '$lib/components/marketing/SiteNav.svelte';
	import SiteFooter from '$lib/components/marketing/SiteFooter.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="docs blog-site grain">
	<SiteNav />

	<main class="blog-main" data-pagefind-body>
		{@render children()}
	</main>

	<SiteFooter />
</div>

<style>
	.blog-site {
		min-height: 100vh;
		background: var(--bg-page);
		color: var(--text-primary);
		font-family: var(--font-sans);
	}

	/* Pages own their vertical rhythm; the shell only sets the side gutters. */
	.blog-main {
		max-width: 80rem;
		margin: 0 auto;
		padding: 0 35px;
	}

	@media (max-width: 768px) {
		.blog-main {
			padding: 0 18px;
		}
	}
</style>

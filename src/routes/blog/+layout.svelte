<script lang="ts">
	import '$lib/styles/marketing.css';
	import SiteNav from '$lib/components/marketing/SiteNav.svelte';
	import SiteFooter from '$lib/components/marketing/SiteFooter.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="docs-site site-shell blog-site">
	<SiteNav />

	<main class="blog-main" data-pagefind-body>
		{@render children()}
	</main>

	<SiteFooter />
</div>

<style>
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

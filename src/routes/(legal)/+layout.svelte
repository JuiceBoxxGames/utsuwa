<script lang="ts">
	import '$lib/styles/marketing.css';
	import SiteNav from '$lib/components/marketing/SiteNav.svelte';
	import SiteFooter from '$lib/components/marketing/SiteFooter.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="docs-site site-shell legal-site">
	<SiteNav />

	<main class="legal-main">
		{@render children()}
	</main>

	<SiteFooter />
</div>

<style>
	/* Top padding matches the hero rhythm on the landing, download and blog
	   pages so every marketing page starts at the same height. */
	.legal-main {
		max-width: 46rem;
		margin: 0 auto;
		padding: clamp(3rem, 8vw, 5rem) 1.5rem clamp(4rem, 8vw, 6rem);
	}

	@media (max-width: 768px) {
		.legal-main {
			padding: 2.5rem 1rem 3rem;
		}
	}
</style>

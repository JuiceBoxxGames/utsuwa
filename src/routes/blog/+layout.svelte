<script lang="ts">
	import { lightVars } from '$lib/config/docs-theme';
	import SiteNav from '$lib/components/marketing/SiteNav.svelte';
	import SiteFooter from '$lib/components/marketing/SiteFooter.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	// Marketing pages are light only, so the docs aliases are fixed here.
	const docsVars = Object.entries(lightVars).map(([k, v]) => `${k}: ${v}`).join('; ');
</script>

<div class="docs blog-site grain" style={docsVars}>
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
		color: var(--docs-text);
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

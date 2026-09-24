<script lang="ts">
	import { page } from '$app/state';
	import { sectionUrl } from '$lib/config/links';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	// "hero" folds the header into a sky hero (logo, links, glass pill). Every
	// other marketing page gets the sticky header with a soft fade.
	let { variant = 'page' }: { variant?: 'hero' | 'page' } = $props();

	const back = $derived(page.url.pathname.startsWith('/blog/') ? '/blog' : '/');
	// Only the landing page is translated, so the switch only shows there
	const translated = $derived(['/', '/ja'].includes(page.url.pathname));
	const locale = getLocale();
</script>

{#if variant === 'hero'}
	<header class="hero-header">
		<a href="/" class="brand" aria-label={m.nav_home()}>
			<img src="/brand-assets/logo.svg" alt="Utsuwa" class="brand-logo" />
		</a>

		<nav class="hero-links" aria-label={m.nav_main()}>
			<a href="/#features">{m.nav_features()}</a>
			<a href={sectionUrl('docs')}>{m.nav_docs()}</a>
			<a href="/blog">{m.nav_blog()}</a>
			<a href="/download">{m.nav_download()}</a>
		</nav>

		<div class="hero-actions">
			{#if translated}
				<nav class="lang-switch" aria-label={m.language()}>
					<a href="/" hreflang="en" lang="en" aria-current={locale === 'en' ? 'true' : undefined} data-sveltekit-reload
						>EN</a
					>
					<a href="/ja" hreflang="ja" lang="ja" aria-current={locale === 'ja' ? 'true' : undefined} data-sveltekit-reload
						>日本語</a
					>
				</nav>
			{/if}
			<a href={sectionUrl('app')} class="glass-pill">{m.nav_try()}</a>
		</div>
	</header>
{:else}
	<header class="page-header">
		<div class="page-header-inner">
			<div class="page-left">
				<a href={back} class="light-pill back-pill">{m.nav_back()}</a>
				<a href="/" class="brand" aria-label={m.nav_home()}>
					<img src="/brand-assets/logo.svg" alt="Utsuwa" class="brand-logo brand-logo--ink" />
				</a>
			</div>
			<nav class="page-links" aria-label={m.nav_main()}>
				<a href={sectionUrl('docs')} class="light-pill">{m.nav_docs()}</a>
				<a href="/blog" class="light-pill">{m.nav_blog()}</a>
				<a href="/download" class="light-pill">{m.nav_download()}</a>
				<a href={sectionUrl('app')} class="accent-pill">{m.nav_try()}</a>
			</nav>
		</div>
	</header>
{/if}

<style>
	/* Home: sits in the hero's flow, over the sky. Three columns keep the link
	   capsule centered however wide the right side gets. */
	.hero-header {
		position: relative;
		z-index: 2;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: start;
		width: 100%;
		max-width: 1270px;
	}

	.hero-actions {
		display: flex;
		grid-column: 3;
		align-items: center;
		justify-self: end;
		gap: 10px;
	}

	/* Language switch: the same glass as the link capsule, current one lit */
	.lang-switch {
		display: flex;
		gap: 2px;
		padding: 5px;
		border: 1px solid rgba(255, 255, 255, 0.22);
		border-radius: 100px;
		background: rgba(255, 255, 255, 0.12);
		-webkit-backdrop-filter: blur(12px);
		backdrop-filter: blur(12px);
	}

	.lang-switch a {
		padding: 11px 14px;
		border-radius: 100px;
		white-space: nowrap;
		color: rgba(255, 255, 255, 0.72);
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.02em;
		text-decoration: none;
		text-shadow: 0 1px 8px rgba(0, 40, 100, 0.2);
		transition:
			background 0.25s ease,
			color 0.25s ease;
	}

	.lang-switch a:hover {
		background: rgba(255, 255, 255, 0.14);
		color: #fff;
	}

	.lang-switch a[aria-current] {
		background: rgba(255, 255, 255, 0.24);
		color: #fff;
	}

	.brand {
		display: flex;
		align-items: center;
		justify-self: start;
		min-width: 118px;
		height: 3.375rem;
		text-decoration: none;
	}

	.brand-logo {
		height: 1.375rem;
		width: auto;
		filter: brightness(0) invert(1) drop-shadow(0 1px 10px rgba(0, 40, 100, 0.2));
	}

	.brand-logo--ink {
		filter: brightness(0);
		opacity: 0.9;
	}

	/* Glass capsule of section links, centered between logo and CTA */
	.hero-links {
		display: flex;
		grid-column: 2;
		align-items: center;
		gap: 2px;
		margin-top: 4px;
		padding: 5px;
		border: 1px solid rgba(255, 255, 255, 0.22);
		border-radius: 100px;
		background: rgba(255, 255, 255, 0.12);
		-webkit-backdrop-filter: blur(12px);
		backdrop-filter: blur(12px);
	}

	.hero-links a {
		padding: 10px 14px;
		white-space: nowrap;
		border-radius: 100px;
		color: #fff;
		font-size: 15px;
		letter-spacing: -0.02em;
		text-decoration: none;
		text-shadow: 0 1px 8px rgba(0, 40, 100, 0.2);
		transition: background 0.25s ease;
	}

	.hero-links a:hover {
		background: rgba(255, 255, 255, 0.18);
	}

	.glass-pill {
		display: inline-block;
		padding: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 100px;
		background: rgba(255, 255, 255, 0.16);
		box-shadow: inset 0 -4px 24px 0 var(--glass-glow, rgba(222, 249, 255, 0.7));
		color: #fff;
		text-shadow: 0 1px 8px rgba(0, 40, 100, 0.25);
		font-size: 1rem;
		line-height: 1.25rem;
		letter-spacing: -0.02em;
		text-decoration: none;
		white-space: nowrap;
		-webkit-backdrop-filter: blur(6px);
		backdrop-filter: blur(6px);
		transition: background 0.5s ease;
	}

	.glass-pill:hover {
		background: rgba(255, 255, 255, 0.32);
	}

	/* Big monitors: scale the composition up instead of leaving a small island */
	@media (min-width: 1800px) and (min-height: 1000px) {
		.hero-header {
			zoom: 1.15;
		}
	}

	@media (min-width: 2200px) and (min-height: 1250px) {
		.hero-header {
			zoom: 1.4;
		}
	}

	/* Tablets and small laptops: the section links live in the footer */
	@media (max-width: 1099px) {
		.hero-links {
			display: none;
		}
	}

	@media (max-width: 768px) {
		.hero-header {
			display: flex;
			align-items: center;
			justify-content: center;
		}

		/* With the switch showing, logo left and switch right */
		.hero-header:has(.lang-switch) {
			justify-content: space-between;
		}

		.brand {
			min-width: 0;
		}

		.hero-links,
		.glass-pill {
			display: none;
		}

		/* Phones keep just the logo and a compact switch */
		.lang-switch {
			padding: 3px;
		}

		.lang-switch a {
			padding: 6px 10px;
			font-size: 13px;
			line-height: 18px;
		}
	}

	/* Everywhere else: sticky, with the page color fading in behind it */
	.page-header {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		justify-content: center;
		width: 100%;
		padding: 0.625rem 2rem;
	}

	.page-header::after {
		content: '';
		position: absolute;
		top: -24px;
		left: 0;
		z-index: -1;
		width: 100%;
		height: 200px;
		pointer-events: none;
		opacity: 0.85;
		background: linear-gradient(
			180deg,
			var(--bg-page) 0,
			color-mix(in srgb, var(--bg-page) 96%, transparent) 12%,
			color-mix(in srgb, var(--bg-page) 82%, transparent) 28%,
			color-mix(in srgb, var(--bg-page) 55%, transparent) 45%,
			color-mix(in srgb, var(--bg-page) 28%, transparent) 63%,
			color-mix(in srgb, var(--bg-page) 10%, transparent) 82%,
			transparent
		);
	}

	.page-header-inner {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		max-width: 1268px;
	}

	.page-left,
	.page-links {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.page-left {
		gap: 1.25rem;
	}

	.page-left .brand {
		min-width: 0;
	}

	.light-pill,
	.accent-pill {
		display: inline-block;
		padding: 1rem 1.25rem;
		border-radius: 110px;
		font-size: 1rem;
		line-height: 1.25rem;
		letter-spacing: -0.02em;
		text-decoration: none;
		transition: background 0.3s ease;
	}

	.light-pill {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	.light-pill:hover {
		background: var(--bg-tertiary);
	}

	.accent-pill {
		background: var(--accent);
		box-shadow: inset 0 -4px 24px 0 rgba(222, 249, 255, 0.55);
		color: #fff;
	}

	.accent-pill:hover {
		background: var(--accent-hover);
	}

	@media (max-width: 768px) {
		.page-header {
			padding: 0.625rem 1.125rem;
		}

		.page-links .light-pill {
			display: none;
		}
	}
</style>

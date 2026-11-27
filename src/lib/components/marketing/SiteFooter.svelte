<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/ui/Icon.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import { sectionUrl } from '$lib/config/links';
	import { GITHUB_REPO, GITHUB_RELEASES } from '$lib/config/site';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	// The footer only renders on main-site pages, so its links stay relative
	// (absolute apex URLs would bounce through the apex-to-www redirect).
	// Only the landing page is translated, so the language switch only shows there
	const translated = $derived(['/', '/ja'].includes(page.url.pathname));
	const locale = getLocale();
</script>

<footer class="site-footer">
	<div class="footer-top">
		<a href="/" class="footer-logo" aria-label={m.nav_home()}>
			<img src="/brand-assets/logo.svg" alt="" />
		</a>
		<div class="footer-cols">
			<div class="footer-col">
				<p>{m.footer_product()}</p>
				<a href={sectionUrl('app')}>{m.nav_try()}</a>
				<a href="/download">{m.nav_download()}</a>
				<a href="/#features">{m.nav_features()}</a>
			</div>
			<div class="footer-col">
				<p>{m.footer_resources()}</p>
				<a href={sectionUrl('docs')}>{m.nav_docs()}</a>
				<a href="/blog">{m.nav_blog()}</a>
				<a href={GITHUB_RELEASES} target="_blank" rel="noopener noreferrer">{m.footer_releases()}</a>
			</div>
			<div class="footer-col">
				<p>{m.footer_legal()}</p>
				<a href="/privacy">{m.footer_privacy()}</a>
				<a href="/terms">{m.footer_terms()}</a>
				<a href={`${GITHUB_REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">{m.footer_license()}</a>
			</div>
		</div>
	</div>

	<div class="footer-bottom">
		<p class="footer-copyright">{m.footer_copyright()}</p>
		<div class="footer-controls">
			{#if translated}
				<nav class="footer-language" aria-label={m.language()}>
					<a href="/" hreflang="en" lang="en" aria-current={locale === 'en' ? 'true' : undefined} data-sveltekit-reload>English</a>
					<a href="/ja" hreflang="ja" lang="ja" aria-current={locale === 'ja' ? 'true' : undefined} data-sveltekit-reload>日本語</a>
				</nav>
			{/if}
			<ThemeToggle />
			<a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" aria-label="GitHub" title="GitHub">
				<Icon name="github" size={14} />
			</a>
		</div>
	</div>
</footer>

<style>
	.site-footer {
		max-width: 1200px;
		margin: 0 auto;
		padding: clamp(56px, 8vw, 96px) 24px 32px;
		color: var(--text-primary);
	}

	.footer-top {
		display: flex;
		justify-content: space-between;
		gap: 48px;
		padding-bottom: 48px;
	}

	.footer-logo {
		display: inline-block;
		padding: 8px 0;
	}

	.footer-logo img {
		display: block;
		height: 24px;
		width: auto;
	}

	/* The logo art is white; darken it on light backgrounds. */
	:global(html:not(.dark)) .footer-logo img {
		filter: brightness(0);
	}

	.footer-cols {
		display: grid;
		grid-template-columns: repeat(3, minmax(140px, 1fr));
		gap: 32px;
	}

	.footer-col {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.footer-col p {
		margin: 0 0 8px;
		color: var(--text-secondary);
		font-size: 13px;
		font-weight: 500;
	}

	.footer-col a,
	.footer-language a {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		color: var(--text-primary);
		font-size: 14px;
		text-decoration: none;
	}

	.footer-col a:hover,
	.footer-language a:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.footer-bottom {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding-top: 24px;
		border-top: 1px solid var(--bg-secondary);
	}

	.footer-copyright {
		margin: 0;
		color: var(--text-secondary);
		font-size: 13px;
	}

	.footer-controls {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.footer-language {
		display: flex;
		gap: 12px;
		margin-right: 8px;
	}

	.footer-controls :global(.btn-sm) {
		min-width: 40px;
		min-height: 40px;
		justify-content: center;
	}

	.footer-language a[aria-current='true'] {
		color: var(--text-secondary);
	}

	@media (max-width: 720px) {
		.footer-col a,
		.footer-language a {
			min-height: 40px;
		}

		.site-footer {
			padding: 56px 16px 24px;
		}

		.footer-top {
			flex-direction: column;
		}

		.footer-cols {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.footer-bottom {
			flex-direction: column-reverse;
			align-items: flex-start;
		}
	}
</style>

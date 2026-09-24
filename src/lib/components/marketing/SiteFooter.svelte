<script lang="ts">
	import { sectionUrl } from '$lib/config/links';
	import { GITHUB_REPO, GITHUB_RELEASES } from '$lib/config/site';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	// Only the landing page is translated so far, so both switch links land there
	const locale = getLocale();
</script>

<footer class="site-footer">
	<div class="footer-social">
		<ul class="footer-icons">
			<li>
				<a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
					<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"
						><path
							d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
						/></svg
					>
				</a>
			</li>
		</ul>
		<nav class="footer-language" aria-label={m.language()}>
			<a href="/" hreflang="en" lang="en" aria-current={locale === 'en' ? 'true' : undefined} data-sveltekit-reload>English</a>
			<a href="/ja" hreflang="ja" lang="ja" aria-current={locale === 'ja' ? 'true' : undefined} data-sveltekit-reload>日本語</a>
		</nav>
		<p class="footer-copyright">{m.footer_copyright()}</p>
	</div>

	<div class="footer-links">
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
</footer>

<style>
	.site-footer {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		width: 100%;
		max-width: 1412px;
		margin: 100px auto 0;
		padding: 0 72px 40px;
		color: var(--text-primary);
	}

	.footer-social {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 30px;
	}

	.footer-icons {
		display: flex;
		align-items: center;
		gap: 16px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Padding grows the tap area; the negative margin keeps the icon in place */
	.footer-icons a {
		display: grid;
		place-items: center;
		margin: -11px;
		padding: 11px;
		color: var(--text-primary);
		transition: opacity 0.2s ease;
	}

	.footer-icons a:hover {
		opacity: 0.6;
	}

	.footer-language {
		display: flex;
		gap: 14px;
		margin-top: -14px;
	}

	.footer-language a {
		margin: -12px -4px;
		padding: 12px 4px;
		color: color-mix(in srgb, var(--text-primary) 55%, transparent);
		font-size: 14px;
		text-decoration: none;
	}

	.footer-language a[aria-current] {
		color: var(--text-primary);
		font-weight: 600;
	}

	.footer-copyright {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1rem;
		letter-spacing: -0.03em;
		opacity: 0.35;
	}

	.footer-links {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 46px;
	}

	.footer-col {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 179px;
	}

	.footer-col p {
		margin: 0;
		font-weight: 600;
		letter-spacing: -0.03em;
	}

	.footer-col a {
		font-size: 1rem;
		line-height: 1.25rem;
		letter-spacing: -0.03em;
		color: var(--text-primary);
		text-decoration: none;
		transition: opacity 0.2s ease;
	}

	.footer-col a:hover {
		opacity: 0.6;
	}

	@media (max-width: 768px) {
		.site-footer {
			flex-direction: column;
			align-items: flex-start;
			margin-top: 80px;
			padding: 0 38px 32px;
		}

		.footer-social {
			gap: 32px;
			margin-top: 32px;
		}

		.footer-links {
			order: -1;
			grid-template-columns: 1fr;
			row-gap: 32px;
		}
	}
</style>

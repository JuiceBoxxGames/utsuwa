<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { page } from '$app/state';
	import { localPath, sectionUrl, mainUrl, isSection } from '$lib/config/links';
	import { m } from '$lib/paraglide/messages';

	// One header for the marketing site and the docs. The docs pass a sidebar
	// toggle; on phones their logo moves into the drawer, so it hides here.
	// Marketing pages link to themselves with relative paths (absolute apex URLs
	// would bounce through the apex-to-www redirect) and to the docs subdomain.

	interface Props {
		onToggleSidebar?: () => void;
		sidebarOpen?: boolean;
	}

	let { onToggleSidebar, sidebarOpen = false }: Props = $props();

	const currentPath = $derived(page.url.pathname);

	// A hairline appears once the page scrolls under the header
	let scrolled = $state(false);
	$effect(() => {
		const onScroll = () => (scrolled = window.scrollY > 4);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});
	const inDocs = $derived(!!onToggleSidebar);
	const href = $derived({
		home: inDocs ? localPath('docs') : '/',
		docs: inDocs ? localPath('docs') : sectionUrl('docs'),
		blog: inDocs ? mainUrl('/blog') : '/blog',
		download: inDocs ? mainUrl('/download') : '/download'
	});
</script>

<header class="site-header" class:marketing={!inDocs} class:scrolled>
	<div class="header-inner">
	<div class="header-left">
		{#if onToggleSidebar}
			<button
				type="button"
				id="docs-menu-toggle"
				class="btn btn-ghost btn-icon hamburger"
				onclick={onToggleSidebar}
				aria-controls="docs-sidebar"
				aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
				aria-expanded={sidebarOpen}
			>
				<Icon name={sidebarOpen ? 'xmark' : 'bars'} size={18} />
			</button>
		{/if}
		<a href={href.home} class="logo" class:desktop-logo={inDocs} aria-label={m.nav_home()}>
			<img src="/brand-assets/logo.svg" alt="Utsuwa" class="logo-img" />
		</a>
	</div>
	<div class="header-right">
		<nav class="header-nav" aria-label="Site">
			<a href={href.docs} class="nav-link" class:active={isSection('docs')} aria-current={isSection('docs') ? 'page' : undefined}>{m.nav_docs()}</a>
			<a href={href.blog} class="nav-link" class:active={currentPath.startsWith('/blog')}>{m.nav_blog()}</a>
		</nav>
		<a href={href.download} aria-label={m.nav_download()} class="btn btn-secondary btn-sm">
			<Icon name="download" size={14} />
			<span class="download-label">{m.nav_download()}</span>
		</a>
		<a href={sectionUrl('app')} class="btn btn-primary btn-sm">{m.nav_try()}</a>
	</div>
	</div>
</header>

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 56px;
		padding: 0 16px 0 20px;
		background: var(--site-header-bg, var(--t3-sidebar));
		transition: box-shadow 0.2s ease;
	}

	.header-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		height: 100%;
	}

	/* Marketing: align with the page's content column, roomier controls */
	.site-header.marketing {
		height: 64px;
		padding: 0;
	}

	.site-header.marketing.scrolled {
		box-shadow: 0 1px 0 var(--bg-secondary);
	}

	.marketing .header-inner {
		max-width: var(--site-max, 1200px);
		margin: 0 auto;
		padding: 0 var(--site-gutter, 24px);
	}

	/* The logo art is 24px tall; padding gives it a full-size target */
	.marketing .logo {
		padding: 8px 0;
	}

	.marketing .nav-link {
		min-height: 36px;
		padding: 0 14px;
		border-radius: 999px;
	}

	.marketing .header-right :global(.btn) {
		min-height: 36px;
		padding: 0 14px;
		border-radius: 999px;
		font-size: 14px;
	}

	.nav-link,
	.header-right :global(.btn) {
		white-space: nowrap;
	}

	.header-left,
	.header-right,
	.header-nav {
		display: flex;
		align-items: center;
	}

	.header-right {
		gap: 8px;
	}

	.header-nav {
		gap: 2px;
		margin-right: 4px;
	}

	.logo {
		display: flex;
		align-items: center;
		border-radius: var(--control-radius);
	}

	.logo-img {
		height: 24px;
		width: auto;
	}

	/* The logo art is white; darken it on light backgrounds. */
	:global(html:not(.dark)) .logo-img {
		filter: brightness(0);
	}

	.nav-link {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		padding: 6px 10px;
		border-radius: var(--control-radius);
		color: var(--text-secondary);
		font-size: 14px;
		font-weight: 500;
		line-height: 20px;
		text-decoration: none;
		transition: color 150ms, background 150ms;
	}

	.nav-link:hover {
		color: var(--text-primary);
		background: var(--t3-sidebar-row-hover);
	}

	.nav-link.active {
		color: var(--text-primary);
	}

	.hamburger {
		display: none;
	}

	@media (max-width: 768px) {
		.site-header {
			padding: 0 12px 0 8px;
		}

		.site-header .hamburger {
			display: inline-flex;
			width: 44px;
			height: 44px;
		}

		.desktop-logo {
			display: none;
		}

		.header-right {
			gap: 4px;
		}

		.header-nav {
			margin-right: 0;
		}

		.nav-link,
		.header-right :global(.btn) {
			min-height: 44px;
		}
	}

	@media (max-width: 360px) {
		.download-label {
			display: none;
		}
	}

	@media (max-width: 560px) {
		.marketing .header-nav {
			display: none;
		}

		.marketing .download-label {
			display: none;
		}

		.marketing .header-right :global(.btn) {
			min-height: 40px;
		}

		.marketing .header-right :global(.btn-secondary) {
			width: 40px;
			padding: 0;
			justify-content: center;
		}
	}
</style>

<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { page } from '$app/state';
		import { localPath, sectionUrl, mainUrl, isSection } from '$lib/config/links';

	interface Props {
		onToggleSidebar?: () => void;
		sidebarOpen?: boolean;
	}

	let { onToggleSidebar, sidebarOpen = false }: Props = $props();

	const currentPath = $derived(page.url.pathname);
</script>

<header class="docs-header">
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
		<a href={localPath('docs')} class="logo desktop-logo">
			<img src="/brand-assets/logo.svg" alt="Utsuwa" class="logo-img" />
		</a>
	</div>
	<div class="header-right">
		<nav class="header-nav" aria-label="Site">
			<a href={localPath('docs')} class="nav-link" class:active={isSection('docs')} aria-current={isSection('docs') ? 'page' : undefined}>Docs</a>
			<a href={mainUrl('/blog')} class="nav-link" class:active={currentPath.startsWith('/blog')}>Blog</a>
		</nav>
		<a href={mainUrl('/download')} aria-label="Download Utsuwa" class="btn btn-secondary btn-sm">
			<Icon name="download" size={14} />
			<span class="download-label">Download</span>
		</a>
		<a href={sectionUrl('app')} class="btn btn-primary btn-sm">Try Live</a>
	</div>
</header>

<style>
	.docs-header {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 56px;
		padding: 0 16px 0 20px;
		background: var(--t3-sidebar);
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
		.docs-header {
			padding: 0 12px 0 8px;
		}

		.docs-header .hamburger {
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
</style>

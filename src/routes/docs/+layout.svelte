<script lang="ts">
	import DocsHeader from '$lib/components/docs/DocsHeader.svelte';
	import DocsSidebar from '$lib/components/docs/DocsSidebar.svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';

	let { children } = $props();

	let sidebarOpen = $state(false);
	let sidebarComponent = $state<DocsSidebar | null>(null);

	// Close sidebar on navigation
	$effect(() => {
		void page.url.pathname;
		sidebarOpen = false;
	});

	// Keyboard shortcut: Cmd/Ctrl+K to focus search in sidebar
	$effect(() => {
		if (!browser) return;

		function handleKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				const isMobile = window.innerWidth <= 768;
				if (isMobile) {
					sidebarOpen = true;
				}
				setTimeout(() => sidebarComponent?.focusSearch(), 50);
			}
		}

		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});
</script>

<!-- .docs-site opts these pages into the app theme (app-theme.css). Blog and
     legal pages use a plain .docs wrapper and keep the site styles. -->
<div class="docs-site">
	<DocsHeader onToggleSidebar={() => (sidebarOpen = !sidebarOpen)} {sidebarOpen} />
	<div class="docs-body">
		{#if sidebarOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="sidebar-overlay" onclick={() => (sidebarOpen = false)} onkeydown={(e) => e.key === 'Escape' && (sidebarOpen = false)}></div>
		{/if}
		<DocsSidebar bind:this={sidebarComponent} mobileOpen={sidebarOpen} />
		<div class="docs-main" data-pagefind-body>
			{@render children()}
		</div>
	</div>
</div>

<style>
	/* Same shell as app settings: sidebar fill for the chrome, canvas for content. */
	.docs-site {
		min-height: 100vh;
		background: var(--t3-sidebar);
		color: var(--text-primary);
		font-family: var(--font-sans);
	}

	.docs-body {
		display: flex;
		height: calc(100vh - 56px);
		overflow: hidden;
	}

	.docs-main {
		flex: 1;
		min-width: 0;
		margin: 0 8px 8px 0;
		border-radius: var(--radius-lg);
		background: var(--bg-page);
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--scrollbar-thumb) transparent;
	}

	.sidebar-overlay {
		display: none;
	}

	@media (max-width: 768px) {
		.docs-body {
			height: auto;
			overflow: visible;
		}

		.docs-main {
			margin: 0;
			border-radius: 0;
			min-height: calc(100vh - 56px);
		}

		.sidebar-overlay {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 19;
			background: color-mix(in srgb, var(--bg-page) 60%, transparent);
		}
	}
</style>

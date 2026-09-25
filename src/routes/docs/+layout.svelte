<script lang="ts">
	import { tick } from 'svelte';
	import DocsHeader from '$lib/components/docs/DocsHeader.svelte';
	import DocsSidebar from '$lib/components/docs/DocsSidebar.svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';

	let { children } = $props();

	let sidebarOpen = $state(false);
	let narrow = $state(false);
	let sidebarComponent = $state<DocsSidebar | null>(null);
	let searchOnOpen = false;

	// The sidebar only becomes a drawer below the mobile breakpoint
	const drawerOpen = $derived(sidebarOpen && narrow);

	// Close sidebar on navigation
	$effect(() => {
		void page.url.pathname;
		sidebarOpen = false;
	});

	$effect(() => {
		if (!browser) return;
		const mq = window.matchMedia('(max-width: 768px)');
		const sync = () => {
			narrow = mq.matches;
			if (!narrow) sidebarOpen = false;
		};
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	function closeDrawer() {
		sidebarOpen = false;
		document.getElementById('docs-menu-toggle')?.focus();
	}

	$effect(() => {
		if (!drawerOpen) return;
		// Focus the drawer itself so phones do not pop the keyboard; Cmd+K goes to search
		tick().then(() => {
			if (searchOnOpen) sidebarComponent?.focusSearch();
			else sidebarComponent?.focusDrawer();
			searchOnOpen = false;
		});
		const onKeydown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
			e.preventDefault();
			closeDrawer();
		};
		document.addEventListener('keydown', onKeydown);
		return () => document.removeEventListener('keydown', onKeydown);
	});

	// Keyboard shortcut: Cmd/Ctrl+K to focus search in sidebar
	$effect(() => {
		if (!browser) return;

		function handleKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				if (narrow && !sidebarOpen) {
					searchOnOpen = true;
					sidebarOpen = true;
				} else sidebarComponent?.focusSearch();
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
		{#if drawerOpen}
			<!-- Pointer convenience only; keyboard users close with Escape or the toggle -->
			<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
			<div class="sidebar-overlay" aria-hidden="true" onclick={closeDrawer}></div>
		{/if}
		<DocsSidebar bind:this={sidebarComponent} mobileOpen={sidebarOpen} />
		<main class="docs-main" data-pagefind-body inert={drawerOpen}>
			{@render children()}
		</main>
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

<script lang="ts">
	import { onMount } from 'svelte';
	import DocsSidebarSection from './DocsSidebarSection.svelte';
	import DocsSearch from './DocsSearch.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { docsNav } from '$lib/config/docs-nav';
	import { cycleColorMode, getColorMode, type ColorMode } from '$lib/utils/color-mode';
	import { GITHUB_REPO } from '$lib/config/site';

	interface Props {
		mobileOpen?: boolean;
	}

	let { mobileOpen = false }: Props = $props();

	let searchComponent = $state<DocsSearch | null>(null);
	let colorMode = $state<ColorMode>('system');

	onMount(() => {
		colorMode = getColorMode();
	});

	let asideEl = $state<HTMLElement | null>(null);

	export function focusDrawer() {
		asideEl?.focus();
	}

	export function focusSearch() {
		searchComponent?.focus();
	}

	const iconName = $derived(colorMode === 'light' ? 'sun' : colorMode === 'dark' ? 'moon' : 'monitor');
	const label = $derived(colorMode === 'light' ? 'Light' : colorMode === 'dark' ? 'Dark' : 'System');
</script>

<aside id="docs-sidebar" class="sidebar" class:mobile-open={mobileOpen} aria-label="Documentation menu" tabindex="-1" bind:this={asideEl}>
	<div class="sidebar-top">
		<div class="sidebar-search">
			<DocsSearch bind:this={searchComponent} id="sidebar-search" />
		</div>
		<nav class="sidebar-nav" aria-label="Documentation">
			{#each docsNav as section}
				<DocsSidebarSection {section} />
			{/each}
		</nav>
	</div>
	<div class="sidebar-footer">
		<button
			type="button"
			class="btn btn-ghost btn-sm"
			onclick={() => (colorMode = cycleColorMode())}
			aria-label={`Theme: ${label}`}
			title={`Theme: ${label}`}
		>
			<Icon name={iconName} size={14} />
			<span>{label}</span>
		</button>
		<a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" aria-label="GitHub" title="GitHub">
			<Icon name="github" size={14} />
		</a>
	</div>
</aside>

<style>
	.sidebar {
		width: 240px;
		min-width: 240px;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--t3-sidebar);
	}

	.sidebar:focus {
		outline: none;
	}

	.sidebar-top {
		flex: 1;
		overflow-y: auto;
		padding: 8px 8px 16px;
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
	}

	.sidebar-top:hover {
		scrollbar-color: var(--scrollbar-thumb) transparent;
	}

	.sidebar-search {
		margin-bottom: 16px;
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.sidebar-footer {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px;
	}

	@media (max-width: 768px) {
		.sidebar {
			display: none;
			position: fixed;
			top: 56px;
			left: 0;
			bottom: 0;
			z-index: 20;
			height: calc(100dvh - 56px);
			box-shadow: var(--shadow-lg);
		}

		.sidebar.mobile-open {
			display: flex;
		}

		.sidebar-footer :global(.btn) {
			min-height: 44px;
			min-width: 44px;
		}
	}
</style>

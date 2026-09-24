<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import './settings-page.css';
	import '$lib/components/settings/settings-controls.css';
	import { page } from '$app/stores';
	import { Icon } from '$lib/components/ui';
	import { localPath } from '$lib/config/links';
	import { mcpStore } from '$lib/stores/mcp.svelte';

	let { children } = $props();
	let query = $state('');
	let searchInput: HTMLInputElement;
	const navItems = $derived([
		{ href: localPath('app', '/settings/persona'), label: 'Character', icon: 'persona', keywords: 'avatar personality name companion mode' },
		{ href: localPath('app', '/settings/display'), label: 'Display', icon: 'monitor', keywords: 'appearance theme light dark chat typing screen awake layout' },
		{ href: localPath('app', '/settings/llm'), label: 'LLM Model', icon: 'brain', keywords: 'ai provider api model language context' },
		{ href: localPath('app', '/settings/tts'), label: 'TTS', icon: 'volume', keywords: 'speech voice audio omnivoice elevenlabs fish audio' },
		{ href: localPath('app', '/settings/stt'), label: 'STT', icon: 'mic', keywords: 'microphone transcription speech recognition timeout whisper' },
		...(mcpStore.capability === 'none' ? [] : [{ href: localPath('app', '/settings/mcp'), label: 'MCP', icon: 'modules', keywords: 'servers tools integrations' }]),
		{ href: localPath('app', '/settings/memory'), label: 'Memory', icon: 'brain', keywords: 'facts relationship memories graph' },
		{ href: localPath('app', '/settings/data'), label: 'Data', icon: 'database', keywords: 'export import backup save' },
		{ href: localPath('app', '/settings/developer'), label: 'Developer', icon: 'code', keywords: 'debug logs reset diagnostics' }
	]);
	const filteredItems = $derived(navItems.filter(item => `${item.label} ${item.keywords}`.toLowerCase().includes(query.trim().toLowerCase())));
	const currentPage = $derived(navItems.find(item => item.href === $page.url.pathname)?.label ?? 'Settings');

	onMount(() => {
		if (mcpStore.capability === 'unknown') void mcpStore.detectCapability();
	});
	function handleKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target as HTMLElement;
		if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]')) return;
		if (event.key === '/') { event.preventDefault(); searchInput?.focus(); }
		if (event.key === 'Escape') { event.preventDefault(); void goto(localPath('app')); }
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="settings-layout">
	<aside class="sidebar">
		<a class="sidebar-brand" href={localPath('app')} aria-label="Utsuwa home">
			<Icon name="chevron-left" size={16} />
			<span>Utsuwa</span>
		</a>
		<div class="settings-search">
			<Icon name="search" size={16} />
			<input bind:this={searchInput} bind:value={query} placeholder="Search settings" aria-label="Search settings"
				onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); query = ''; searchInput.blur(); } }} />
			<kbd>/</kbd>
		</div>
		<nav class="nav" aria-label="Settings">
			{#each filteredItems as item}
				<a href={item.href} aria-label={item.label} title={item.label}
					aria-current={$page.url.pathname === item.href ? 'page' : undefined}
					class="nav-item" class:active={$page.url.pathname === item.href}>
					<Icon name={item.icon} size={16} /><span class="nav-label">{item.label}</span>
				</a>
			{:else}
				<p class="search-empty" role="status">No matching settings</p>
			{/each}
		</nav>
		<div class="sidebar-footer">
			<a href={localPath('app')} class="back-button" aria-label="Back"><Icon name="chevron-left" size={16} /><span>Back to companion</span><kbd>esc</kbd></a>
		</div>
	</aside>
	<main class="content">
		<header class="settings-topbar" aria-label="Settings breadcrumb">
			<span>Settings</span><span class="separator">/</span><span class="current-page">{currentPage}</span>
		</header>
		<div class="settings-content">{@render children()}</div>
	</main>
</div>

<style>
	.settings-layout { display: flex; height: 100%; min-height: 0; overflow: hidden; background: var(--bg-page); }
	.sidebar { width: 232px; flex-shrink: 0; display: flex; flex-direction: column; padding: 0 8px 8px; background: var(--t3-sidebar); border-right: 1px solid var(--t3-sidebar-border); }
	.sidebar-brand { height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 12px; color: var(--t3-sidebar-foreground); font-weight: 600; text-decoration: none; font-size: 14px; }
	.settings-search { display: flex; align-items: center; gap: 8px; margin: 8px 0; padding: 0 10px; min-height: 32px; border-radius: var(--control-radius); color: var(--t3-sidebar-muted-foreground); }
	.settings-search input { min-width: 0; width: 100%; border: 0; background: transparent; font: inherit; color: var(--text-primary); font-size: 14px; outline: none; }
	.settings-search:focus-within { background: var(--control-bg); box-shadow: 0 0 0 2px var(--accent-muted); }
	.settings-search input::placeholder { color: var(--t3-sidebar-muted-foreground); }
	kbd { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); }
	.nav { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
	.nav-item { display: flex; align-items: center; gap: 10px; min-height: 34px; padding: 7px 10px; border-radius: var(--control-radius); color: var(--t3-sidebar-muted-foreground); text-decoration: none; font-size: 14px; font-weight: 400; transition: background 150ms, color 150ms; }
	.nav-item:hover { background: var(--t3-sidebar-row-hover); color: var(--t3-sidebar-foreground); }
	.nav-item.active { background: var(--t3-sidebar-row-selected); color: var(--t3-sidebar-foreground); font-weight: 500; }
	.nav-label { flex: 1; }
	.sidebar-footer { margin-top: auto; padding-top: 16px; }
	.back-button { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 6px 10px; border-radius: var(--control-radius); color: var(--t3-sidebar-muted-foreground); font-size: 13px; text-decoration: none; }
	.back-button:hover { background: var(--t3-sidebar-row-hover); color: var(--text-primary); }
	.back-button kbd { margin-left: auto; }
	.search-empty { font-size: 13px; color: var(--text-secondary); padding: 8px 10px; }
	.content { flex: 1; min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; background: var(--bg-page); }
	.settings-topbar { min-height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 24px; color: var(--text-secondary); font-size: 14px; flex-shrink: 0; }
	.separator { opacity: 0.5; }
	.current-page { color: var(--text-primary); font-weight: 500; }
	.settings-content { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; padding: 24px 32px 32px; }
	@media (max-width: 1023px) and (min-width: 768px) { .sidebar { width: 200px; } .settings-content { padding: 20px; } }
	@media (max-width: 767px) {
		.settings-layout { flex-direction: column; }
		.sidebar { width: 100%; padding: 0 8px 6px; border-right: 0; border-bottom: 1px solid var(--t3-sidebar-border); }
		.sidebar-brand { height: 44px; width: max-content; }
		.settings-search { position: absolute; top: 6px; right: 12px; width: min(210px, 58vw); margin: 0; }
		.nav { flex-direction: row; overflow-x: auto; scrollbar-width: none; }
		.nav-item { flex-shrink: 0; white-space: nowrap; min-height: 44px; }
		.sidebar-footer { display: none; }
		.settings-topbar { min-height: 44px; padding: 0 16px; font-size: 13px; }
		.settings-content { padding: 8px 16px calc(16px + env(safe-area-inset-bottom, 0px)); }
		.settings-search input { font-size: 16px; }
	}
</style>

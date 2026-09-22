<script lang="ts">
	import '@fontsource-variable/inter';
	import '../app.css';
	import { onMount } from 'svelte';
	import { applyColorMode, getColorMode } from '$lib/utils/color-mode';
	import { isTauri } from '$lib/services/platform';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { modulesStore } from '$lib/stores/modules.svelte';
	import { moduleRegistry } from '$lib/services/modules';
	import { migrateLegacyElevenLabsVoice } from '$lib/services/tts/legacy-voice-migration';
	import { isDesktopBuild } from '$lib/services/platform/platform';
	import { SITE_URL } from '$lib/config/site';

	let { children } = $props();

	// Marketing/content routes that should never live inside the desktop app.
	const isWebOnly = (path: string) =>
		path === '/' ||
		path.startsWith('/docs') ||
		path.startsWith('/blog') ||
		path.startsWith('/download');

	// The desktop build must only ever show the app. The window now boots at
	// "/app" (tauri.conf.json), but this also bounces any web-only route to the
	// app as a safety net, using the build-time flag so it can't race.
	const redirecting = $derived(browser && isDesktopBuild() && isWebOnly(page.url.pathname));

	if (browser) {
		for (const mod of moduleRegistry) {
			modulesStore.registerModule(mod);
		}
		migrateLegacyElevenLabsVoice();

		// React to system theme changes in real-time when using "system" mode
		const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');
		themeQuery.addEventListener('change', () => {
			const colorMode = localStorage.getItem('colorMode') || 'system';
			if (colorMode === 'system') {
				document.documentElement.classList.toggle('dark', themeQuery.matches);
			}
		});

		// In the desktop app, marketing/docs/blog links open in the system
		// browser instead of navigating the webview.
		document.addEventListener('click', (e) => {
			if (!isDesktopBuild()) return;
			const anchor = (e.target as Element).closest('a');
			if (!anchor) return;
			const href = anchor.getAttribute('href');
			if (href && isWebOnly(href)) {
				e.preventDefault();
				e.stopPropagation();
				import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
					openUrl(`${SITE_URL}${href}`);
				});
			}
		}, true);
	}

	onMount(() => {
		const syncTheme = (event: StorageEvent) => { if (event.key === 'colorMode' || event.key === null) applyColorMode(getColorMode()); };
		window.addEventListener('storage', syncTheme);
		let disposed = false;
		let unlisten: (() => void) | undefined;
		if (isTauri()) void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
			const current = getCurrentWindow();
			if (current.label !== 'main') return;
			const stop = await current.listen('utsuwa-open-character-settings', () => { void goto('/app/settings/persona?view=state'); });
			if (disposed) stop(); else unlisten = stop;
		}).catch(error => console.error('Could not listen for overlay navigation', error));
		return () => { disposed = true; unlisten?.(); window.removeEventListener('storage', syncTheme); };
	});

	// Bounce the desktop app off the landing route into the app itself.
	$effect(() => {
		if (redirecting) goto('/app', { replaceState: true });
	});
</script>

<svelte:head>
	<title>Utsuwa</title>
	<meta name="description" content="Open-source AI companion with 3D VRM avatars, voice chat, semantic memory, and multi-provider LLM support. Self-hosted and privacy-first." />
</svelte:head>

{#if !redirecting}
	{@render children()}
{/if}

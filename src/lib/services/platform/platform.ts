import { browser } from '$app/environment';

/**
 * Check if running in a Tauri desktop environment
 */
export function isTauri(): boolean {
	// Tauri 2.x uses __TAURI_INTERNALS__, Tauri 1.x uses __TAURI__
	return browser && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

/**
 * True only in the Tauri desktop build, decided at build time (see
 * vite.config.ts). Prefer this over isTauri() for routing/marketing-gating
 * decisions: isTauri() reads the Tauri globals, which inject after first paint
 * on macOS WKWebView and race the initial render. This never races.
 */
export function isDesktopBuild(): boolean {
	return typeof __IS_DESKTOP__ !== 'undefined' && __IS_DESKTOP__;
}

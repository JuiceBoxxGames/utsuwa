import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';

export type ColorMode = 'system' | 'light' | 'dark';

const ORDER: ColorMode[] = ['system', 'light', 'dark'];

export function getColorMode(): ColorMode {
	if (!browser) return 'system';
	const saved = localStorage.getItem(STORAGE_INVENTORY.localStorage.colorMode) as ColorMode | null;
	return saved && ORDER.includes(saved) ? saved : 'system';
}

export function applyColorMode(mode: ColorMode) {
	if (!browser) return;

	const shouldBeDark =
		mode === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : mode === 'dark';

	document.documentElement.classList.toggle('dark', shouldBeDark);
}

export function setColorMode(mode: ColorMode) {
	if (!browser) return;
	localStorage.setItem(STORAGE_INVENTORY.localStorage.colorMode, mode);
	applyColorMode(mode);
}

/** system → light → dark → system. Returns the new mode. */
export function cycleColorMode(): ColorMode {
	const next = ORDER[(ORDER.indexOf(getColorMode()) + 1) % ORDER.length];
	setColorMode(next);
	return next;
}

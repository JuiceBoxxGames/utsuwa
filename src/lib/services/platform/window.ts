import { isTauri } from './platform';

/**
 * Start dragging the window (Tauri only, no-op on web)
 * Call this on mousedown to enable window dragging
 */
export async function startDragging(): Promise<void> {
	if (!isTauri()) return;

	const { getCurrentWindow } = await import('@tauri-apps/api/window');
	const window = getCurrentWindow();
	await window.startDragging();
}

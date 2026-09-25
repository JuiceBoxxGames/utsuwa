import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';

export interface OverlayPosition {
	x: number;
	y: number;
}

function createOverlayStore() {
	// Overlay UI state
	let isActive = $state(false);
	let chatExpanded = $state(false);
	let position = $state<OverlayPosition>({ x: 100, y: 100 });

	// Load persisted position on init
	if (browser) {
		const saved = localStorage.getItem(STORAGE_INVENTORY.localStorage.overlayPosition);
		if (saved) {
			try {
				position = JSON.parse(saved);
			} catch {
				// Use default
			}
		}
	}

	function setActive(active: boolean) {
		isActive = active;
		if (!active) {
			chatExpanded = false;
		}
	}

	function toggleActive() {
		setActive(!isActive);
	}

	function setChatExpanded(expanded: boolean) {
		chatExpanded = expanded;
	}

	function toggleChat() {
		chatExpanded = !chatExpanded;
	}

	function setPosition(newPosition: OverlayPosition) {
		position = newPosition;
		if (browser) {
			localStorage.setItem(STORAGE_INVENTORY.localStorage.overlayPosition, JSON.stringify(position));
		}
	}

	function activate() {
		isActive = true;
	}

	function deactivate() {
		isActive = false;
		chatExpanded = false;
	}

	return {
		get isActive() {
			return isActive;
		},
		get chatExpanded() {
			return chatExpanded;
		},
		get position() {
			return position;
		},
		setActive,
		toggleActive,
		setChatExpanded,
		toggleChat,
		setPosition,
		activate,
		deactivate
	};
}

export const overlayStore = createOverlayStore();

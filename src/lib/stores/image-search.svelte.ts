import type { ImageShowEvent } from '$lib/services/image-search/events';
import {
	applyImageEventToState,
	closeImageSearch,
	createImageSearchState,
	focusImageSearch,
	type ImageSearchState,
	type ImageSearchStatus,
	type ImageSearchStoreError
} from './image-search-store-logic.ts';

export type { ImageSearchStatus, ImageSearchStoreError };

// The pure reducer owns state transitions; this module only exposes them as
// Svelte runes so the popup and the companion prompt see one source of truth.
let state = $state<ImageSearchState>(createImageSearchState());

export function closeModal() {
	state = closeImageSearch();
}

export function setFocus(index: number) {
	state = focusImageSearch(state, index);
}

/** Apply a core event; stale results never overwrite a newer request. */
export function applyImageEvent(event: ImageShowEvent) {
	state = applyImageEventToState(state, event);
}

export const imageSearchStore = {
	get results() {
		return state.results;
	},
	get isOpen() {
		return state.isOpen;
	},
	/** The panel stays on screen while the next page loads if pictures are already shown. */
	get isVisible() {
		return state.isOpen && (state.status !== 'loading' || state.results.length > 0);
	},
	get status() {
		return state.status;
	},
	get error() {
		return state.error;
	},
	get notice() {
		return state.notice;
	},
	get currentQuery() {
		return state.query;
	},
	get currentPage() {
		return state.page;
	},
	get focusedIndex() {
		return state.focusedIndex;
	},
	get currentDescription() {
		return state.description;
	},
	get tool() {
		return state.tool;
	},
	closeModal,
	setFocus,
	applyImageEvent
};

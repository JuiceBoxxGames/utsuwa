import type { ImageSearchResult } from '$lib/utils/image-search';
import type { ImageShowEvent } from '$lib/services/image-search/events';
import {
	applyImageEventToState,
	closeImageSearch,
	createImageSearchState,
	describeImageSearch,
	errorImageSearch,
	focusImageSearch,
	loadingImageSearch,
	openImageSearch,
	readyImageSearch,
	type ImageSearchState,
	type ImageSearchStatus,
	type ImageSearchStoreError
} from './image-search-store-logic.ts';

export type { ImageSearchStatus, ImageSearchStoreError };

// The pure reducer owns state transitions; this module only exposes them as
// Svelte runes so the popup and the companion prompt see one source of truth.
let state = $state<ImageSearchState>(createImageSearchState());

export function openModal(newResults: ImageSearchResult[], query: string) {
	state = openImageSearch(newResults, query);
}

export function closeModal() {
	state = closeImageSearch();
}

export function setLoading(query: string, page = 1, requestId?: string) {
	state = loadingImageSearch(query, page, requestId);
}

export function setResults(
	newResults: ImageSearchResult[],
	query: string,
	page = 1,
	requestId?: string
) {
	state = readyImageSearch(newResults, query, page, requestId);
}

export function setError(
	code: ImageSearchStoreError['code'],
	message: string,
	query = '',
	requestId?: string
) {
	state = errorImageSearch(code, message, query, requestId);
}

export function setDescription(description: string | null) {
	state = describeImageSearch(state, description);
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
	get status() {
		return state.status;
	},
	get error() {
		return state.error;
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
	openModal,
	closeModal,
	setLoading,
	setResults,
	setError,
	setDescription,
	setFocus,
	applyImageEvent
};

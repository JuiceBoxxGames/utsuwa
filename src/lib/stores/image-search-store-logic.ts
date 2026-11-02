import type { ImageSearchResult } from '$lib/utils/image-search';
import type { ImageSearchErrorCode, ImageShowEvent } from '$lib/services/image-search/events';

export type ImageSearchStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ImageSearchStoreError {
	code: ImageSearchErrorCode;
	message: string;
}

export interface ImageSearchState {
	results: ImageSearchResult[];
	isOpen: boolean;
	status: ImageSearchStatus;
	error: ImageSearchStoreError | null;
	query: string;
	page: number;
	activeRequestId: string | null;
	focusedIndex: number;
	description: string | null;
}

export function createImageSearchState(): ImageSearchState {
	return {
		results: [],
		isOpen: false,
		status: 'idle',
		error: null,
		query: '',
		page: 1,
		activeRequestId: null,
		focusedIndex: 0,
		description: null
	};
}

export function openImageSearch(results: ImageSearchResult[], query: string): ImageSearchState {
	return {
		...createImageSearchState(),
		results,
		isOpen: true,
		status: 'ready',
		query,
		page: 1
	};
}

export function closeImageSearch(): ImageSearchState {
	return createImageSearchState();
}

export function loadingImageSearch(query: string, page: number, requestId?: string): ImageSearchState {
	return {
		...createImageSearchState(),
		isOpen: true,
		status: 'loading',
		query,
		page,
		activeRequestId: requestId ?? null
	};
}

export function readyImageSearch(
	results: ImageSearchResult[],
	query: string,
	page: number,
	requestId?: string
): ImageSearchState {
	return {
		...createImageSearchState(),
		results,
		isOpen: true,
		status: results.length ? 'ready' : 'error',
		error: results.length ? null : { code: 'empty_results', message: 'No pictures found' },
		query,
		page,
		activeRequestId: requestId ?? null
	};
}

export function errorImageSearch(
	code: ImageSearchErrorCode,
	message: string,
	query: string,
	requestId?: string
): ImageSearchState {
	return {
		...createImageSearchState(),
		isOpen: true,
		status: 'error',
		error: { code, message },
		query,
		activeRequestId: requestId ?? null
	};
}

export function focusImageSearch(state: ImageSearchState, index: number): ImageSearchState {
	if (index < 0 || index >= state.results.length || index === state.focusedIndex) return state;
	return { ...state, focusedIndex: index, description: null };
}

export function describeImageSearch(state: ImageSearchState, description: string | null): ImageSearchState {
	return { ...state, description };
}

/**
 * Reduce a core event into view state. A result/error event is accepted only
 * for the request that opened the current loading state; closing invalidates
 * the active request, so a late result cannot reopen the popup.
 */
export function applyImageEventToState(state: ImageSearchState, event: ImageShowEvent): ImageSearchState {
	if (event.type === 'close') return closeImageSearch();
	if (event.type === 'loading') return loadingImageSearch(event.query, event.page, event.requestId);
	if (!state.activeRequestId || event.requestId !== state.activeRequestId) return state;
	if (event.type === 'error' && event.code === 'cancelled') return closeImageSearch();
	if (event.type === 'results') {
		return readyImageSearch(event.results, event.query, event.page, event.requestId);
	}
	return errorImageSearch(event.code, event.message, event.query, event.requestId);
}

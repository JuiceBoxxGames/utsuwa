import type { ImageSearchResult } from '$lib/utils/image-search';
import type {
	ImageSearchErrorCode,
	ImageSearchToolInfo,
	ImageShowEvent
} from '$lib/services/image-search/events';

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
	tool: ImageSearchToolInfo | null;
	/** Non-blocking hint shown next to the pictures (for example a tool limit). */
	notice: string | null;
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
		tool: null,
		notice: null
	};
}

export function closeImageSearch(): ImageSearchState {
	return createImageSearchState();
}

/**
 * Start a search. The pictures already on screen stay visible while the next
 * page loads — a "more" request must not blank the panel — but a different
 * subject starts from a clean state so old pictures never masquerade as new
 * results.
 */
export function loadingImageSearch(
	state: ImageSearchState,
	query: string,
	page: number,
	requestId?: string
): ImageSearchState {
	const keep = state.isOpen && state.query === query && state.results.length > 0;
	if (!keep) {
		return {
			...createImageSearchState(),
			isOpen: true,
			status: 'loading',
			query,
			page,
			activeRequestId: requestId ?? null
		};
	}
	return {
		...state,
		status: 'loading',
		page,
		activeRequestId: requestId ?? null,
		error: null,
		notice: null
	};
}

export function readyImageSearch(
	results: ImageSearchResult[],
	query: string,
	page: number,
	requestId?: string,
	tool: ImageSearchToolInfo | null = null
): ImageSearchState {
	return {
		...createImageSearchState(),
		results,
		isOpen: true,
		status: results.length ? 'ready' : 'error',
		error: results.length ? null : { code: 'empty_results', message: 'No pictures found' },
		query,
		page,
		activeRequestId: requestId ?? null,
		tool
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
	return { ...state, focusedIndex: index };
}

/**
 * Reduce a core event into view state. A result/error event is accepted only
 * for the request that opened the current loading state; closing invalidates
 * the active request, so a late result cannot reopen the popup.
 */
export function applyImageEventToState(state: ImageSearchState, event: ImageShowEvent): ImageSearchState {
	if (event.type === 'close') return closeImageSearch();
	if (event.type === 'loading') return loadingImageSearch(state, event.query, event.page, event.requestId);
	if (event.type === 'notice') {
		// A notice explains a limit next to the pictures. It never opens the
		// panel; it only resolves the request it belongs to (a paging request
		// that produced no new page), so the panel leaves "loading" instead of
		// waiting for a result event that will never come.
		if (!state.isOpen || event.requestId !== state.activeRequestId) return state;
		return { ...state, status: 'ready', notice: event.message };
	}
	if (!state.activeRequestId || event.requestId !== state.activeRequestId) return state;
	if (event.type === 'error' && event.code === 'cancelled') return closeImageSearch();
	if (event.type === 'results') {
		return readyImageSearch(event.results, event.query, event.page, event.requestId, event.tool);
	}
	return errorImageSearch(event.code, event.message, event.query, event.requestId);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	applyImageEventToState,
	closeImageSearch,
	createImageSearchState,
	focusImageSearch,
	loadingImageSearch,
	readyImageSearch,
	type ImageSearchState
} from './image-search-store-logic.ts';

const picture = { title: 'A', url: 'https://x/a.jpg', thumbnail: 'https://x/a-thumb.jpg', source: 'x' };

test('applies loading and results for the active request', () => {
	let state = createImageSearchState();
	state = applyImageEventToState(state, {
		id: '1', at: 1, type: 'loading', requestId: 'r1', query: 'cats', page: 1
	});
	assert.equal(state.status, 'loading');
	state = applyImageEventToState(state, {
		id: '2', at: 2, type: 'results', requestId: 'r1', query: 'cats', page: 1,
		results: [picture], tool: { serverId: 's', serverName: 'S', toolName: 't' }
	});
	assert.equal(state.status, 'ready');
	assert.equal(state.isOpen, true);
	assert.equal(state.results.length, 1);
	assert.equal(state.tool?.serverName, 'S');
});

test('closing clears the provider label with the rest of the state', () => {
	let state = applyImageEventToState(loadingImageSearch(createImageSearchState(), 'cats', 1, 'r1'), {
		id: '2', at: 2, type: 'results', requestId: 'r1', query: 'cats', page: 1,
		results: [picture], tool: { serverId: 's', serverName: 'S', toolName: 't' }
	});
	state = closeImageSearch();
	assert.equal(state.tool, null);
});

test('drops late results after close and results from an older request', () => {
	let state = loadingImageSearch(createImageSearchState(), 'cats', 1, 'r1');
	state = applyImageEventToState(state, { id: 'close', at: 2, type: 'close' });
	state = applyImageEventToState(state, {
		id: 'late', at: 3, type: 'results', requestId: 'r1', query: 'cats', page: 1,
		results: [picture], tool: { serverId: 's', serverName: 'S', toolName: 't' }
	});
	assert.equal(state.isOpen, false);
	assert.equal(state.status, 'idle');

	let newer = loadingImageSearch(createImageSearchState(), 'cats', 2, 'r2');
	newer = applyImageEventToState(newer, {
		id: 'old', at: 4, type: 'results', requestId: 'r1', query: 'cats', page: 1,
		results: [picture], tool: { serverId: 's', serverName: 'S', toolName: 't' }
	});
	assert.equal(newer.status, 'loading');
	assert.equal(newer.page, 2);
});

test('a notice explains a limit without touching the shown pictures', () => {
	let state: ImageSearchState = applyImageEventToState(loadingImageSearch(createImageSearchState(), 'cats', 1, 'r1'), {
		id: '2', at: 2, type: 'results', requestId: 'r1', query: 'cats', page: 1,
		results: [picture], tool: { serverId: 's', serverName: 'S', toolName: 't' }
	});
	state = applyImageEventToState(state, {
		id: '3', at: 3, type: 'notice', query: 'cats', code: 'no_paging',
		message: 'This picture tool cannot load more results. Try a different subject.'
	});
	assert.equal(state.status, 'ready');
	assert.equal(state.isOpen, true);
	assert.equal(state.results.length, 1);
	assert.equal(state.notice, 'This picture tool cannot load more results. Try a different subject.');
});

test('a notice never opens the panel and is dropped while loading or closed', () => {
	const idle = createImageSearchState();
	assert.equal(
		applyImageEventToState(idle, { id: 'n1', at: 1, type: 'notice', query: 'cats', code: 'no_paging', message: 'limit' }),
		idle
	);
	const loading = loadingImageSearch(createImageSearchState(), 'cats', 2, 'r1');
	assert.equal(
		applyImageEventToState(loading, { id: 'n2', at: 2, type: 'notice', query: 'cats', code: 'no_paging', message: 'limit' }),
		loading
	);
	const closed = applyImageEventToState(loading, { id: 'close', at: 3, type: 'close' });
	assert.equal(
		applyImageEventToState(closed, { id: 'n3', at: 4, type: 'notice', query: 'cats', code: 'no_paging', message: 'limit' }),
		closed
	);
});

test('new results clear an old notice', () => {
	let state: ImageSearchState = {
		...readyImageSearch([picture], 'cats', 1, 'r1'),
		notice: 'old limit'
	};
	state = applyImageEventToState(state, {
		id: 'n', at: 1, type: 'notice', query: 'cats', code: 'no_paging', message: 'limit'
	});
	assert.equal(state.notice, 'limit');
	state = applyImageEventToState(state, {
		id: '2', at: 2, type: 'loading', requestId: 'r2', query: 'dogs', page: 1
	});
	state = applyImageEventToState(state, {
		id: '3', at: 3, type: 'results', requestId: 'r2', query: 'dogs', page: 1,
		results: [{ ...picture, url: 'https://x/dog.jpg' }], tool: { serverId: 's', serverName: 'S', toolName: 't' }
	});
	assert.equal(state.notice, null);
});

test('closing clears the active request and focusing clears the old description', () => {
	const closed = closeImageSearch();
	assert.equal(closed.activeRequestId, null);
	assert.equal(closed.results.length, 0);
	const focused = focusImageSearch({ ...loadingImageSearch(createImageSearchState(), 'cats', 1, 'r'), results: [picture, { ...picture, url: 'https://x/b.jpg' }], description: 'old' }, 1);
	assert.equal(focused.focusedIndex, 1);
	assert.equal(focused.description, null);
});

test('focusImageSearch ignores negative and out-of-range indices', () => {
	const state = {
		...loadingImageSearch(createImageSearchState(), 'cats', 1, 'r1'),
		results: [picture]
	};
	assert.equal(focusImageSearch(state, -1), state);
	assert.equal(focusImageSearch(state, 1), state);
});

test('readyImageSearch without results reports an empty-results error', () => {
	const state = readyImageSearch([], 'cats', 1, 'r1');
	assert.equal(state.status, 'error');
	assert.equal(state.isOpen, true);
	assert.deepEqual(state.error, { code: 'empty_results', message: 'No pictures found' });
});


test('a cancelled confirmation returns to idle instead of an error panel', () => {
	const state = applyImageEventToState(loadingImageSearch(createImageSearchState(), 'cats', 1, 'r'), {
		id: 'cancel', at: 2, type: 'error', requestId: 'r', query: 'cats', code: 'cancelled', message: 'Picture search cancelled'
	});
	assert.equal(state.status, 'idle');
	assert.equal(state.isOpen, false);
});


test('a stale cancelled event does not close a newer search', () => {
	const state = applyImageEventToState(loadingImageSearch(createImageSearchState(), 'cats', 2, 'r2'), {
		id: 'stale-cancel', at: 3, type: 'error', requestId: 'r1', query: 'cats', code: 'cancelled', message: 'Picture search cancelled'
	});
	assert.equal(state.status, 'loading');
	assert.equal(state.isOpen, true);
	assert.equal(state.activeRequestId, 'r2');
});

test('loading the next page keeps the shown pictures on screen', () => {
	const ready = { ...readyImageSearch([picture], 'cats', 1, 'r1'), notice: 'old limit' };
	const state = applyImageEventToState(ready, {
		id: '2', at: 2, type: 'loading', requestId: 'r2', query: 'cats', page: 2
	});
	assert.equal(state.status, 'loading');
	assert.equal(state.results.length, 1);
	assert.equal(state.page, 2);
	assert.equal(state.activeRequestId, 'r2');
	assert.equal(state.notice, null);
});

test('loading a different subject starts with an empty gallery', () => {
	const ready = readyImageSearch([picture], 'cats', 1, 'r1');
	const state = applyImageEventToState(ready, {
		id: '2', at: 2, type: 'loading', requestId: 'r2', query: 'dogs', page: 1
	});
	assert.equal(state.status, 'loading');
	assert.equal(state.results.length, 0);
	assert.equal(state.query, 'dogs');
});

test('loading while the panel is closed does not resurrect old pictures', () => {
	const state = loadingImageSearch(closeImageSearch(), 'cats', 1, 'r1');
	assert.equal(state.results.length, 0);
	assert.equal(state.isOpen, true);
	assert.equal(state.status, 'loading');
});

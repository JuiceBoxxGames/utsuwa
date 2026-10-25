import test from 'node:test';
import assert from 'node:assert/strict';
import {
	applyImageEventToState,
	closeImageSearch,
	createImageSearchState,
	focusImageSearch,
	loadingImageSearch,
	readyImageSearch
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
});

test('drops late results after close and results from an older request', () => {
	let state = loadingImageSearch('cats', 1, 'r1');
	state = applyImageEventToState(state, { id: 'close', at: 2, type: 'close' });
	state = applyImageEventToState(state, {
		id: 'late', at: 3, type: 'results', requestId: 'r1', query: 'cats', page: 1,
		results: [picture], tool: { serverId: 's', serverName: 'S', toolName: 't' }
	});
	assert.equal(state.isOpen, false);
	assert.equal(state.status, 'idle');

	let newer = loadingImageSearch('cats', 2, 'r2');
	newer = applyImageEventToState(newer, {
		id: 'old', at: 4, type: 'results', requestId: 'r1', query: 'cats', page: 1,
		results: [picture], tool: { serverId: 's', serverName: 'S', toolName: 't' }
	});
	assert.equal(newer.status, 'loading');
	assert.equal(newer.page, 2);
});

test('closing clears the active request and focusing clears the old description', () => {
	const closed = closeImageSearch();
	assert.equal(closed.activeRequestId, null);
	assert.equal(closed.results.length, 0);
	const focused = focusImageSearch({ ...loadingImageSearch('cats', 1, 'r'), results: [picture, { ...picture, url: 'https://x/b.jpg' }], description: 'old' }, 1);
	assert.equal(focused.focusedIndex, 1);
	assert.equal(focused.description, null);
});

test('focusImageSearch ignores negative and out-of-range indices', () => {
	const state = {
		...loadingImageSearch('cats', 1, 'r1'),
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
	const state = applyImageEventToState(loadingImageSearch('cats', 1, 'r'), {
		id: 'cancel', at: 2, type: 'error', requestId: 'r', query: 'cats', code: 'cancelled', message: 'Picture search cancelled'
	});
	assert.equal(state.status, 'idle');
	assert.equal(state.isOpen, false);
});


test('a stale cancelled event does not close a newer search', () => {
	const state = applyImageEventToState(loadingImageSearch('cats', 2, 'r2'), {
		id: 'stale-cancel', at: 3, type: 'error', requestId: 'r1', query: 'cats', code: 'cancelled', message: 'Picture search cancelled'
	});
	assert.equal(state.status, 'loading');
	assert.equal(state.isOpen, true);
	assert.equal(state.activeRequestId, 'r2');
});

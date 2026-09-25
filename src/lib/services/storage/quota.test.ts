import test from 'node:test';
import assert from 'node:assert/strict';

import { isQuotaError } from './quota.ts';

test('recognizes both quota error spellings', () => {
	assert.equal(isQuotaError(new DOMException('full', 'QuotaExceededError')), true);
	assert.equal(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }), true);
});

test('finds a quota error wrapped by Dexie or a cause chain', () => {
	assert.equal(isQuotaError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } }), true);
	assert.equal(isQuotaError(new Error('save failed', { cause: new DOMException('x', 'QuotaExceededError') })), true);
});

test('ignores everything else', () => {
	for (const e of [null, undefined, 'QuotaExceededError', 42, new Error('nope'), { name: 'AbortError' }]) {
		assert.equal(isQuotaError(e), false, String(e));
	}
});

test('does not loop on a self-referencing cause', () => {
	const e: { name: string; cause?: unknown } = { name: 'Error' };
	e.cause = e;
	assert.equal(isQuotaError(e), false);
});

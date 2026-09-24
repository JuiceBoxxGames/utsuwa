import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAction } from './action-gate.ts';

const enabled = [
	{ id: 'vrma_02', url: '/animations/VRMA_02.vrma' },
	{ id: 'anim-1-abc', url: 'blob:wave' }
];
const fresh = { enabled, lastFired: new Map<string, number>(), lastAnyFired: -Infinity };

test('unknown or disabled ids never fire', () => {
	assert.equal(resolveAction('vrma_05', 100_000, fresh), null);
	assert.equal(resolveAction('', 100_000, fresh), null);
});

test('an enabled id fires with its url', () => {
	assert.deepEqual(resolveAction('vrma_02', 100_000, fresh), { url: '/animations/VRMA_02.vrma' });
	assert.deepEqual(resolveAction('anim-1-abc', 100_000, fresh), { url: 'blob:wave' });
});

test('the same id inside its cooldown is dropped', () => {
	const opts = { enabled, lastFired: new Map([['vrma_02', 100_000]]), lastAnyFired: 100_000 };
	assert.equal(resolveAction('vrma_02', 100_000 + 19_999, opts), null);
});

test('a different id inside the global cooldown is dropped', () => {
	const opts = { enabled, lastFired: new Map([['vrma_02', 100_000]]), lastAnyFired: 100_000 };
	assert.equal(resolveAction('anim-1-abc', 100_000 + 7_999, opts), null);
	assert.deepEqual(resolveAction('anim-1-abc', 100_000 + 8_000, opts), { url: 'blob:wave' });
});

test('fires again once both cooldowns pass', () => {
	const opts = { enabled, lastFired: new Map([['vrma_02', 100_000]]), lastAnyFired: 100_000 };
	assert.deepEqual(resolveAction('vrma_02', 100_000 + 20_000, opts), { url: '/animations/VRMA_02.vrma' });
});

test('cooldowns are configurable', () => {
	const opts = {
		enabled,
		lastFired: new Map([['vrma_02', 0]]),
		lastAnyFired: 0,
		perActionCooldownMs: 1000,
		globalCooldownMs: 500
	};
	assert.equal(resolveAction('vrma_02', 999, opts), null);
	assert.deepEqual(resolveAction('vrma_02', 1000, opts), { url: '/animations/VRMA_02.vrma' });
});

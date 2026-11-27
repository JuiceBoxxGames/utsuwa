import test from 'node:test';
import assert from 'node:assert/strict';
import { stepAt } from './step-loop.ts';

test('stepAt walks through the steps by their durations', () => {
	const durations = [1000, 500, 2000];
	assert.equal(stepAt(0, durations), 0);
	assert.equal(stepAt(999, durations), 0);
	assert.equal(stepAt(1000, durations), 1);
	assert.equal(stepAt(1499, durations), 1);
	assert.equal(stepAt(1500, durations), 2);
	assert.equal(stepAt(3499, durations), 2);
});

test('stepAt loops after the last step', () => {
	const durations = [1000, 500, 2000];
	assert.equal(stepAt(3500, durations), 0);
	assert.equal(stepAt(3500 + 1200, durations), 1);
	assert.equal(stepAt(35000 * 3 + 10, durations), 0);
});

test('stepAt holds a single step and tolerates bad input', () => {
	assert.equal(stepAt(12345, [800]), 0);
	assert.equal(stepAt(-50, [100, 100]), 0);
	assert.equal(stepAt(500, []), 0);
});

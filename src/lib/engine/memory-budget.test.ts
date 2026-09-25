import test from 'node:test';
import assert from 'node:assert/strict';

import { getMemoryBudget } from './memory-budget.ts';

test('getMemoryBudget boundary values', () => {
	assert.deepEqual(getMemoryBudget(4095), { workingMemoryTurns: 6, relevantFacts: 3 });
	assert.deepEqual(getMemoryBudget(4096), { workingMemoryTurns: 6, relevantFacts: 3 });
	assert.deepEqual(getMemoryBudget(4097), { workingMemoryTurns: 10, relevantFacts: 5 });
	assert.deepEqual(getMemoryBudget(8192), { workingMemoryTurns: 10, relevantFacts: 5 });
	assert.deepEqual(getMemoryBudget(8193), { workingMemoryTurns: 20, relevantFacts: 10 });
});

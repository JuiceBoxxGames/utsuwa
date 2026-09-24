import test from 'node:test';
import assert from 'node:assert/strict';
import { coverCrop, sanitizeSceneBackground } from './scene-backgrounds.ts';

test('coverCrop returns the full source when aspects match', () => {
	assert.deepEqual(coverCrop(1600, 900, 800, 450), { sx: 0, sy: 0, sw: 1600, sh: 900 });
});

test('coverCrop trims the sides evenly for a wider source', () => {
	// 2:1 source into a 1:1 destination keeps the middle square
	assert.deepEqual(coverCrop(2000, 1000, 500, 500), { sx: 500, sy: 0, sw: 1000, sh: 1000 });
});

test('coverCrop trims top and bottom evenly for a taller source', () => {
	assert.deepEqual(coverCrop(1000, 2000, 500, 500), { sx: 0, sy: 500, sw: 1000, sh: 1000 });
});

test('coverCrop falls back to the full source for zero or negative sizes', () => {
	const full = { sx: 0, sy: 0, sw: 1600, sh: 900 };
	assert.deepEqual(coverCrop(1600, 900, 0, 450), full);
	assert.deepEqual(coverCrop(1600, 900, 800, -1), full);
	assert.deepEqual(coverCrop(0, 900, 800, 450), { sx: 0, sy: 0, sw: 0, sh: 900 });
});

test('sanitizeSceneBackground keeps image references with an id', () => {
	assert.deepEqual(sanitizeSceneBackground({ type: 'image', value: 'custom-1' }), {
		type: 'image',
		value: 'custom-1'
	});
	assert.deepEqual(sanitizeSceneBackground({ type: 'image', value: '' }), { type: 'default' });
	assert.deepEqual(sanitizeSceneBackground({ type: 'image' }), { type: 'default' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { coverScale, timeOfDay } from './window-light.ts';

test('each hour of the day maps to one light', () => {
	const expected = [
		...Array(5).fill('night'), // 0-4
		...Array(6).fill('morning'), // 5-10
		...Array(6).fill('day'), // 11-16
		...Array(4).fill('evening'), // 17-20
		...Array(3).fill('night') // 21-23
	];
	for (let hour = 0; hour < 24; hour++) {
		assert.equal(timeOfDay(hour), expected[hour], `hour ${hour}`);
	}
});

test('cover scale matches background-size: cover on a 2000x2200 image', () => {
	// Exactly the image's shape: nothing cropped
	assert.deepEqual(coverScale(1000, 1100), [1, 1]);
	// Wide zone: width fits, the image's bottom is cropped
	const [wx, wy] = coverScale(1440, 900);
	assert.equal(wx, 1);
	assert.ok(Math.abs(wy - (900 / 2200) / (1440 / 2000)) < 1e-9);
	// Tall, narrow zone: height fits, the sides are cropped
	const [tx, ty] = coverScale(390, 2000);
	assert.equal(ty, 1);
	assert.ok(Math.abs(tx - (390 / 2000) / (2000 / 2200)) < 1e-9);
});

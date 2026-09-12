import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { applyChatFraming } from './chat-framing.ts';

for (const [width, height, frameWidth, frameHeight] of [
	[1280, 800, 840, 800],
	[1920, 1080, 1480, 1080],
	[390, 844, 390, 422],
	[390, 420, 390, 210],
	[390, 420, 390, 126]
]) {
	for (const left of [false, true]) {
		test(`full scene preserves framing at ${width}x${height}, left=${left}`, () => {
			const cropped = new PerspectiveCamera(35, frameWidth / frameHeight, 0.1, 1000);
			const full = new PerspectiveCamera(35, width / height, 0.1, 1000);
			applyChatFraming(full, { width, height }, { width: frameWidth, height: frameHeight, left });
			for (const point of [new Vector3(0, 0, -3), new Vector3(0.2, 0.5, -2)]) {
				const before = point.clone().project(cropped);
				const after = point.clone().project(full);
				const expectedX = ((before.x + 1) * frameWidth) / 2 + (left ? width - frameWidth : 0);
				const expectedY = ((1 - before.y) * frameHeight) / 2;
				assert.ok(Math.abs(((after.x + 1) * width) / 2 - expectedX) < 0.001);
				assert.ok(Math.abs(((1 - after.y) * height) / 2 - expectedY) < 0.001);
			}
			applyChatFraming(full, { width, height });
			assert.equal(full.view?.enabled, false);
			assert.equal(full.aspect, width / height);
		});
	}
}

import test from 'node:test';
import assert from 'node:assert/strict';

import { checkAnimationFile, parseAnimationBlob, MAX_ANIMATION_BYTES } from './animations.ts';
import { clearVrmAnimationCache, loadVrmAnimation } from '../vrm-animations.ts';

const file = (name: string, size = 1000, type = '') => ({ name, size, type });

test('accepts .vrma in any case, or a file the browser could not type', () => {
	assert.doesNotThrow(() => checkAnimationFile(file('wave.vrma')));
	assert.doesNotThrow(() => checkAnimationFile(file('WAVE.VRMA', 10, 'application/octet-stream')));
	assert.doesNotThrow(() => checkAnimationFile(file('document:1234')));
});

test('rejects other files and oversized ones with readable errors', () => {
	assert.throws(() => checkAnimationFile(file('model.vrm', 10, 'model/vrm')), /\.vrma/);
	assert.throws(() => checkAnimationFile(file('photo.png', 10, 'image/png')), /\.vrma/);
	assert.throws(() => checkAnimationFile(file('big.vrma', MAX_ANIMATION_BYTES + 1)), /25 MB/);
	assert.throws(() => checkAnimationFile(file('empty.vrma', 0)), /empty/);
});

test('a parsed clip returns its url and measured duration', async () => {
	clearVrmAnimationCache();
	const result = await parseAnimationBlob(new Blob(['x']), async () => ({ duration: 4.23 }) as never);
	assert.equal(result.durationSec, 4.2);
	assert.match(result.url, /^blob:/);
	// The parse stays cached under the entry's url so Play is instant
	assert.deepEqual(await loadVrmAnimation(result.url, async () => ({ duration: 0 }) as never), { duration: 4.23 });
	URL.revokeObjectURL(result.url);
});

test('an unparseable file is rejected', async () => {
	await assert.rejects(
		parseAnimationBlob(new Blob(['junk']), async () => {
			throw new Error('bad glb');
		}),
		/couldn't be read/
	);
});

test('a clip over a minute is rejected and evicted', async () => {
	clearVrmAnimationCache();
	let url = '';
	await assert.rejects(
		parseAnimationBlob(new Blob(['x']), async (u) => {
			url = u;
			return { duration: 61 } as never;
		}),
		/60 seconds/
	);
	let refetched = false;
	await loadVrmAnimation(url, async () => {
		refetched = true;
		return {} as never;
	});
	assert.ok(refetched, 'rejected clip must not stay cached');
});

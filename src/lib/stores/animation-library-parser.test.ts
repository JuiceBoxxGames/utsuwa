import test from 'node:test';
import assert from 'node:assert/strict';

import {
	BUILTIN_ANIMATIONS,
	BUILTIN_IDLES,
	parseAnimationMetadata,
	applyBuiltinOverrides,
	resolveIdlePool,
	type AnimationEntry
} from './animation-library-parser.ts';

const quiet = <T>(fn: () => T): T => {
	const warn = console.warn;
	console.warn = () => {};
	try {
		return fn();
	} finally {
		console.warn = warn;
	}
};

test('built-ins keep the vrma ids and ship described and enabled', () => {
	assert.deepEqual(
		BUILTIN_ANIMATIONS.map((a) => a.id),
		['vrma_01', 'vrma_02', 'vrma_03', 'vrma_04', 'vrma_05', 'vrma_06', 'vrma_07']
	);
	assert.equal(BUILTIN_ANIMATIONS[1].name, 'Greeting');
	assert.equal(BUILTIN_ANIMATIONS[1].url, '/animations/VRMA_02.vrma');
	for (const a of BUILTIN_ANIMATIONS) {
		assert.ok(a.description.length > 0);
		assert.equal(a.llmEnabled, true);
		assert.equal(a.kind, 'emote');
	}
});

test('five built-in idles, never offered to the model', () => {
	assert.deepEqual(
		BUILTIN_IDLES.map((a) => [a.id, a.name, a.url]),
		[
			['idle_1', 'Idle 1', '/animations/idle.vrma'],
			['idle_2', 'Idle 2', '/animations/idle_2.vrma'],
			['idle_3', 'Idle 3', '/animations/idle_3.vrma'],
			['idle_4', 'Idle 4', '/animations/idle_4.vrma'],
			['idle_5', 'Idle 5', '/animations/idle_5.vrma']
		]
	);
	for (const a of BUILTIN_IDLES) {
		assert.equal(a.kind, 'idle');
		assert.equal(a.llmEnabled, false);
		assert.equal(a.description, 'Built-in idle loop');
	}
});

test('missing key and junk give empty metadata', () => {
	for (const raw of [null, '', 'not-json', '42', 'null', '[]', '{"overrides":7,"custom":"x"}']) {
		const meta = quiet(() => parseAnimationMetadata(raw));
		assert.deepEqual(meta, { overrides: {}, custom: [], base: { idlePool: [], thinkingId: null } }, `input ${raw}`);
	}
});

test('built-in overrides only keep description and llmEnabled', () => {
	const meta = parseAnimationMetadata(
		JSON.stringify({
			overrides: {
				vrma_02: { description: 'Bow deeply', llmEnabled: false, name: 'Hacked', url: '/evil.vrma' },
				vrma_03: { llmEnabled: 'yes', description: 5 }
			}
		})
	);
	assert.deepEqual(meta.overrides, { vrma_02: { description: 'Bow deeply', llmEnabled: false }, vrma_03: {} });
});

test('overrides for unknown ids are dropped', () => {
	const meta = parseAnimationMetadata(JSON.stringify({ overrides: { vrma_99: { llmEnabled: false } } }));
	assert.deepEqual(meta.overrides, {});
});

test('custom entries need a valid id and a name', () => {
	const meta = parseAnimationMetadata(
		JSON.stringify({
			custom: [
				{ id: 'anim-1-abc', name: 'Wave', description: 'Wave hello', llmEnabled: true, createdAt: 5, durationSec: 4.2 },
				{ id: 'anim-2-def', name: 'Nod' },
				{ name: 'No id' },
				{ id: 'anim-3', name: '' },
				{ id: 'has spaces', name: 'Bad id' },
				{ id: 'vrma_02', name: 'Shadows a built-in' },
				{ id: 'anim-1-abc', name: 'Duplicate' },
				'junk',
				null
			]
		})
	);
	assert.deepEqual(meta.custom, [
		{ id: 'anim-1-abc', name: 'Wave', description: 'Wave hello', llmEnabled: true, createdAt: 5, durationSec: 4.2 },
		{ id: 'anim-2-def', name: 'Nod', description: '', llmEnabled: false }
	]);
});

test('overlong names and descriptions are cut', () => {
	const meta = parseAnimationMetadata(
		JSON.stringify({ custom: [{ id: 'anim-1', name: 'n'.repeat(500), description: 'd'.repeat(2000) }] })
	);
	assert.equal(meta.custom[0].name.length, 60);
	assert.equal(meta.custom[0].description.length, 300);
});

test('applyBuiltinOverrides merges over the defaults without touching them', () => {
	const merged = applyBuiltinOverrides({ vrma_02: { description: 'Bow deeply', llmEnabled: false } });
	assert.equal(merged[1].description, 'Bow deeply');
	assert.equal(merged[1].llmEnabled, false);
	assert.equal(merged[1].name, 'Greeting');
	assert.equal(merged[0].llmEnabled, true);
	assert.equal(BUILTIN_ANIMATIONS[1].description, 'Greet with a polite bowing motion');
});

test('base config keeps string ids, even unknown ones', () => {
	const meta = parseAnimationMetadata(
		JSON.stringify({ base: { idlePool: ['idle_3', 5, null, 'anim-gone', 'idle_3'], thinkingId: 'vrma_02' } })
	);
	assert.deepEqual(meta.base, { idlePool: ['idle_3', 'anim-gone'], thinkingId: 'vrma_02' });
});

test('junk base config gives the empty default', () => {
	for (const base of [null, 7, 'x', [], { idlePool: 'idle_1', thinkingId: 3 }]) {
		const meta = parseAnimationMetadata(JSON.stringify({ base }));
		assert.deepEqual(meta.base, { idlePool: [], thinkingId: null }, `base ${JSON.stringify(base)}`);
	}
});

test('custom ids cannot shadow a built-in idle', () => {
	const meta = parseAnimationMetadata(JSON.stringify({ custom: [{ id: 'idle_1', name: 'Fake' }] }));
	assert.deepEqual(meta.custom, []);
});

const fallback = ['/a.vrma', '/b.vrma'];
const candidates: AnimationEntry[] = [
	{ id: 'idle_1', name: 'Idle 1', url: '/idle1.vrma', description: '', llmEnabled: false, kind: 'idle' },
	{ id: 'idle_2', name: 'Idle 2', url: '/idle2.vrma', description: '', llmEnabled: false, kind: 'idle' },
	{ id: 'anim-1', name: 'Mine', url: 'blob:x', description: '', llmEnabled: false, kind: 'custom' }
];

test('resolveIdlePool: empty pool falls back', () => {
	assert.deepEqual(resolveIdlePool({ idlePool: [], thinkingId: null }, candidates, fallback), fallback);
});

test('resolveIdlePool: existing ids in pool order, unknown ids ignored', () => {
	const base = { idlePool: ['anim-1', 'gone', 'idle_2'], thinkingId: null };
	assert.deepEqual(resolveIdlePool(base, candidates, fallback), ['blob:x', '/idle2.vrma']);
});

test('resolveIdlePool: only unknown ids falls back', () => {
	assert.deepEqual(resolveIdlePool({ idlePool: ['gone', 'vrma_02'], thinkingId: null }, candidates, fallback), fallback);
});

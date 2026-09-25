import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	composeExpressionWeights,
	createFaceState,
	findHappyExpression,
	type ComposeInput,
	type FaceState
} from './expression-compose.ts';

const SILENT = { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 };

function input(state: FaceState, overrides: Partial<ComposeInput> = {}): ComposeInput {
	return {
		delta: 1 / 60,
		state,
		moodTarget: null,
		emotePlaying: false,
		held: null,
		emote: null,
		reaction: null,
		photoActive: false,
		speaking: false,
		visemes: SILENT,
		random: () => 0.5,
		...overrides
	};
}

// No blink during these runs: next blink is far away
const quiet = (): FaceState => ({ ...createFaceState(() => 0.5), blink: { timer: 0, next: 1e9, active: false, progress: 0 } });

function run(state: FaceState, seconds: number, overrides: Partial<ComposeInput> = {}) {
	let out = composeExpressionWeights(input(state, { ...overrides, delta: 0.1 }));
	for (let t = 0.1; t < seconds - 1e-9; t += 0.1) {
		out = composeExpressionWeights(input(out.state, { ...overrides, delta: 0.1 }));
	}
	return out;
}

test('first blink lands 2 to 6 seconds out', () => {
	assert.equal(createFaceState(() => 0).blink.next, 2);
	assert.equal(createFaceState(() => 0.999).blink.next > 5.99, true);
});

test('mood face eases toward its target and holds there', () => {
	const target = { name: 'happy', weight: 0.6 };
	const first = composeExpressionWeights(input(quiet(), { moodTarget: target, delta: 0.1 }));
	assert.ok(Math.abs((first.face.get('happy') ?? 0) - 0.09) < 1e-9);
	const later = run(first.state, 10, { moodTarget: target });
	assert.ok(Math.abs((later.face.get('happy') ?? 0) - 0.6) < 1e-3);
});

test('switching moods fades the old face fully out before the new one starts', () => {
	const settled = run(quiet(), 10, { moodTarget: { name: 'happy', weight: 0.6 } });
	const next = composeExpressionWeights(input(settled.state, { moodTarget: { name: 'sad', weight: 0.6 }, delta: 0.1 }));
	assert.equal(next.face.has('sad'), false);
	assert.ok((next.face.get('happy') ?? 0) < 0.6);
	const done = run(next.state, 10, { moodTarget: { name: 'sad', weight: 0.6 } });
	assert.ok((done.face.get('sad') ?? 0) > 0.5);
});

test('emotes suspend the mood face and the blink', () => {
	const settled = run(quiet(), 10, { moodTarget: { name: 'happy', weight: 0.6 } });
	const emoting = composeExpressionWeights(
		input(settled.state, { moodTarget: { name: 'happy', weight: 0.6 }, emotePlaying: true, delta: 0.1 })
	);
	assert.ok((emoting.face.get('happy') ?? 1) < 0.6);
	const blinkDue = { ...quiet(), blink: { timer: 10, next: 2, active: false, progress: 0 } };
	const noBlink = composeExpressionWeights(input(blinkDue, { emotePlaying: true }));
	assert.equal(noBlink.face.has('blink'), false);
	assert.equal(noBlink.state.blink.timer, 10);
});

test('held and emote expressions own their name over the mood face', () => {
	const target = { name: 'happy', weight: 0.6 };
	assert.equal(composeExpressionWeights(input(quiet(), { moodTarget: target, held: 'happy' })).face.has('happy'), false);
	assert.equal(composeExpressionWeights(input(quiet(), { moodTarget: target, emote: 'happy' })).face.has('happy'), false);
});

test('a tap reaction on the mood expression rides on top instead of dipping it', () => {
	const settled = run(quiet(), 10, { moodTarget: { name: 'happy', weight: 0.6 } });
	const out = composeExpressionWeights(
		input(settled.state, { moodTarget: { name: 'happy', weight: 0.6 }, reaction: { name: 'happy', value: 0.9 } })
	);
	assert.equal(out.face.get('happy'), 0.9);
});

test('flash attacks over 0.25s, holds 2.5s, and releases over 0.8s', () => {
	const state = { ...quiet(), flash: { name: 'surprised', weight: 0.6, t: 0, holdUntil: null } };
	const attack = run(state, 0.1);
	assert.ok(Math.abs((attack.face.get('surprised') ?? 0) - 0.6 * (0.1 / 0.25)) < 1e-9);
	const held = run(state, 2.4);
	assert.equal(held.face.get('surprised'), 0.6);
	assert.equal(held.state.flash?.holdUntil, null);
	const releasing = run(state, 2.9);
	assert.ok(releasing.state.flash?.holdUntil !== null);
	assert.ok((releasing.face.get('surprised') ?? 1) < 0.6);
	assert.equal(run(state, 3.5).state.flash, null);
	const last = { ...quiet(), flash: { name: 'surprised', weight: 0.6, t: 3.29, holdUntil: 2.5 } };
	const done = composeExpressionWeights(input(last, { delta: 0.1 }));
	assert.equal(done.state.flash, null);
	assert.equal(done.face.get('surprised'), 0);
});

test('flash keeps holding while she speaks, up to 8s', () => {
	const state = { ...quiet(), flash: { name: 'surprised', weight: 0.6, t: 0, holdUntil: null } };
	assert.equal(run(state, 6, { speaking: true }).face.get('surprised'), 0.6);
	const capped = run(state, 8.1, { speaking: true });
	assert.ok(capped.state.flash?.holdUntil !== null);
});

test('flash never dips the resting face on the same expression', () => {
	const settled = run(quiet(), 10, { moodTarget: { name: 'happy', weight: 0.6 } });
	const flashed = { ...settled.state, flash: { name: 'happy', weight: 0.3, t: 0, holdUntil: null } };
	const out = composeExpressionWeights(input(flashed, { moodTarget: { name: 'happy', weight: 0.6 } }));
	assert.ok((out.face.get('happy') ?? 0) >= 0.599);
	const ending = { ...settled.state, flash: { name: 'happy', weight: 0.3, t: 5, holdUntil: 3 } };
	const end = composeExpressionWeights(input(ending, { moodTarget: { name: 'happy', weight: 0.6 } }));
	assert.equal(end.state.flash, null);
	assert.ok((end.face.get('happy') ?? 0) >= 0.599);
});

test('photo mode drops a flash, leaving a held expression alone', () => {
	const state = { ...quiet(), flash: { name: 'surprised', weight: 0.6, t: 1, holdUntil: null } };
	const cleared = composeExpressionWeights(input(state, { photoActive: true }));
	assert.equal(cleared.state.flash, null);
	assert.equal(cleared.face.get('surprised'), 0);
	const held = composeExpressionWeights(input(state, { photoActive: true, held: 'surprised' }));
	assert.equal(held.face.has('surprised'), false);
});

test('blink closes fast, opens slow, then schedules the next one', () => {
	const due = { ...quiet(), blink: { timer: 1.99, next: 2, active: false, progress: 0 } };
	const closing = composeExpressionWeights(input(due, { delta: 0.025 }));
	assert.equal(closing.state.blink.active, true);
	for (const name of ['blink', 'Blink', 'eyeBlinkLeft', 'eyeBlinkRight']) {
		assert.ok(Math.abs((closing.face.get(name) ?? 0) - 0.2 / 0.3) < 1e-9);
	}
	let state = closing.state;
	let out = closing;
	for (let i = 0; i < 10 && state.blink.active; i++) {
		out = composeExpressionWeights(input(state, { delta: 0.025, random: () => 0.25 }));
		state = out.state;
	}
	assert.equal(state.blink.active, false);
	assert.equal(state.blink.timer, 0);
	assert.equal(state.blink.next, 3);
	assert.equal(out.face.get('blink'), 0);
});

test('visemes map onto VRM 1.0, VRM 0.x, and ARKit mouth names', () => {
	const out = composeExpressionWeights(input(quiet(), { visemes: { aa: 1, ee: 0.2, ih: 0.3, oh: 0.4, ou: 0.5 } }));
	assert.deepEqual(Object.fromEntries(out.mouth), {
		aa: 1,
		ee: 0.2,
		ih: 0.3,
		oh: 0.4,
		ou: 0.5,
		a: 1,
		i: 0.3,
		u: 0.5,
		e: 0.2,
		o: 0.4,
		jawOpen: 0.7
	});
});

test('input state is left untouched', () => {
	const state = { ...quiet(), flash: { name: 'surprised', weight: 0.6, t: 0, holdUntil: null } };
	const snapshot = structuredClone(state);
	composeExpressionWeights(input(state, { moodTarget: { name: 'happy', weight: 0.6 }, delta: 0.1 }));
	assert.deepEqual(state, snapshot);
});

test('emote face picks the first happy-like expression by keyword priority', () => {
	assert.equal(findHappyExpression(['Fun', 'Joy', 'aa']), 'Joy');
	assert.equal(findHappyExpression(['smile_wide', 'relaxed']), 'smile_wide');
	assert.equal(findHappyExpression(['sad', 'angry']), null);
});

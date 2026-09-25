import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AvatarAnimator, type AnimatorHooks } from './avatar-animator.ts';

function clip(name: string, duration = 1) {
	return new THREE.AnimationClip(name, duration, [
		new THREE.NumberKeyframeTrack('.position[x]', [0, duration], [0, 1])
	]);
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

const flush = () => new Promise((r) => setImmediate(r));

// Idle cycling reschedules forever; stop every animator so the run can exit
const live: AvatarAnimator[] = [];
afterEach(() => live.splice(0).forEach((a) => a.dispose()));

function setup(overrides: Partial<AnimatorHooks> = {}) {
	const flags = { talking: false, thinking: false, photo: false, idleReady: 0 };
	const idles = ['idle-a', 'idle-b'];
	let next = 0;
	const hooks: AnimatorHooks = {
		loadClip: async (url) => clip(url),
		loadPose: async (id) => ({ clip: clip(`pose-${id}`), hold: 0.5 }),
		pickIdleUrl: () => idles[next++ % idles.length],
		isTalking: () => flags.talking,
		isThinking: () => flags.thinking,
		isPhotoActive: () => flags.photo,
		onIdleReady: () => flags.idleReady++,
		...overrides
	};
	const animator = new AvatarAnimator(new THREE.Object3D(), hooks);
	live.push(animator);
	return { animator, flags };
}

const weight = (action: THREE.AnimationAction | null) => action?.getEffectiveWeight() ?? 0;
const near = (actual: number, expected: number) =>
	assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} is not ${expected}`);

test('start plays a looping idle and reports it ready', async () => {
	const { animator, flags } = setup();
	animator.start(null);
	await flush();
	assert.equal(animator.idle?.getClip().name, 'idle-a');
	assert.equal(animator.idle?.loop, THREE.LoopRepeat);
	animator.update(0);
	near(weight(animator.idle), 1);
	assert.equal(flags.idleReady, 1);
});

test('a model that loads during photo mode holds its idle stance', async () => {
	const { animator, flags } = setup();
	flags.photo = true;
	animator.start(null);
	await flush();
	assert.equal(animator.idle?.paused, true);
});

test('idle cycles after one to two loops with a 1.2s crossfade', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const { animator } = setup();
	animator.start(null);
	await flush();
	const first = animator.idle;
	t.mock.timers.tick(999);
	await flush();
	assert.equal(animator.idle, first);
	t.mock.timers.tick(1001);
	await flush();
	const second = animator.idle;
	assert.equal(second?.getClip().name, 'idle-b');
	animator.update(0.6);
	assert.ok(Math.abs(weight(first) - 0.5) < 0.01);
	assert.ok(Math.abs(weight(second) - 0.5) < 0.01);
	animator.update(0.7);
	near(weight(first), 0);
	near(weight(second), 1);
});

test('idle cycling waits while she talks and resumes after', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const { animator, flags } = setup();
	animator.start(null);
	await flush();
	const first = animator.idle;
	flags.talking = true;
	t.mock.timers.tick(2000);
	await flush();
	assert.equal(animator.idle, first);
	flags.talking = false;
	t.mock.timers.tick(2000);
	await flush();
	assert.notEqual(animator.idle, first);
});

test('a load that finishes after dispose never applies', async () => {
	const pending = deferred<THREE.AnimationClip>();
	const { animator, flags } = setup({ loadClip: () => pending.promise });
	animator.start(null);
	animator.dispose();
	pending.resolve(clip('late'));
	await flush();
	assert.equal(animator.idle, null);
	assert.equal(flags.idleReady, 0);
});

test('talking crossfades against the idle over 0.3s', async () => {
	const { animator } = setup();
	animator.start('talk');
	await flush();
	animator.update(0);
	animator.setTalking(true);
	animator.update(0.3);
	near(weight(animator.idle), 0);
	assert.equal(animator.talking?.getClip().name, 'talk');
	near(weight(animator.talking), 1);
	animator.setTalking(false);
	animator.update(0.3);
	near(weight(animator.talking), 0);
	near(weight(animator.idle), 1);
});

test('thinking that ends before its clip loads never starts', async () => {
	const pending = deferred<THREE.AnimationClip>();
	const { animator, flags } = setup();
	animator.start(null);
	await flush();
	animator.hooks.loadClip = () => pending.promise;
	flags.thinking = true;
	animator.startThinking('think');
	flags.thinking = false;
	animator.stopThinking(true);
	pending.resolve(clip('think'));
	await flush();
	assert.equal(animator.thinking, null);
});

test('emote plays once at 1.5x, then returns to idle and reports it', async () => {
	const { animator } = setup();
	animator.start(null);
	await flush();
	animator.update(0);
	let finished = 0;
	animator.playEmote(clip('wave', 1), () => finished++);
	assert.equal(animator.emotePlaying, true);
	const emote = animator.emote;
	assert.equal(emote?.timeScale, 1.5);
	animator.update(0.2);
	near(weight(animator.idle), 0);
	near(weight(emote), 1);
	animator.update(0.3);
	assert.equal(finished, 0);
	animator.update(0.2);
	assert.equal(finished, 1);
	assert.equal(animator.emotePlaying, false);
	assert.equal(animator.emote, null);
	animator.update(0.3);
	near(weight(animator.idle), 1);
	// The clamped last frame must let go, or the idle blends against it
	// and the arms hang halfway between the two poses
	near(weight(emote), 0);
});

test('no emote requested restarts a stopped idle', async () => {
	const { animator } = setup();
	animator.start(null);
	await flush();
	animator.idle?.stop();
	animator.clearEmote();
	assert.equal(animator.idle?.isRunning(), true);
});

test('only the latest pose selection lands', async () => {
	const loads = new Map<string, ReturnType<typeof deferred<{ clip: THREE.AnimationClip; hold: number }>>>();
	const { animator, flags } = setup({
		loadPose: (id) => {
			const d = deferred<{ clip: THREE.AnimationClip; hold: number }>();
			loads.set(id, d);
			return d.promise;
		}
	});
	animator.start(null);
	await flush();
	flags.photo = true;
	animator.enterPhoto();
	animator.selectPose('a');
	animator.selectPose('b');
	loads.get('b')?.resolve({ clip: clip('pose-b', 2), hold: 0.5 });
	await flush();
	loads.get('a')?.resolve({ clip: clip('pose-a'), hold: 0.5 });
	await flush();
	assert.equal(animator.pose?.getClip().name, 'pose-b');
	assert.equal(animator.pose?.paused, true);
	assert.equal(animator.pose?.time, 1);
});

test('leaving photo mode fades the pose out and cycles to a fresh idle', async () => {
	const { animator, flags } = setup();
	animator.start(null);
	await flush();
	const first = animator.idle;
	flags.photo = true;
	animator.enterPhoto();
	animator.selectPose('a');
	await flush();
	assert.ok(animator.pose);
	flags.photo = false;
	animator.exitPhoto(true);
	assert.equal(animator.pose, null);
	assert.equal(first?.paused, false);
	await flush();
	assert.notEqual(animator.idle, first);
});

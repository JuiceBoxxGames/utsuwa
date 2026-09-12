import test from 'node:test';
import assert from 'node:assert/strict';
import { createScreenWakeLock, type WakeStatus, type ScreenLock } from './screen-wake-lock.ts';

class Lock extends EventTarget implements ScreenLock {
	released = false;
	async release() {
		this.released = true;
		this.dispatchEvent(new Event('release'));
	}
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('locks only when enabled and visible, releases on hide, reacquires on return', async () => {
	const locks: Lock[] = [];
	const states: WakeStatus[] = [];
	const controller = createScreenWakeLock(
		async () => {
			const l = new Lock();
			locks.push(l);
			return l;
		},
		(s) => states.push(s)
	);
	assert.equal(locks.length, 0);
	controller.setEnabled(true);
	controller.setEnabled(true);
	await flush();
	assert.equal(locks.length, 1);
	assert.equal(states.at(-1), 'active');
	controller.setVisible(false);
	await flush();
	assert.equal(locks[0].released, true);
	assert.equal(states.at(-1), 'inactive');
	controller.setVisible(true);
	await flush();
	assert.equal(locks.length, 2);
	assert.equal(states.at(-1), 'active');
	controller.dispose();
	await flush();
	assert.equal(locks[1].released, true);
});

test('late acquisition after disabling or disposal is released', async () => {
	for (const action of ['disable', 'dispose', 'hide']) {
		let resolve!: (lock: ScreenLock) => void;
		const controller = createScreenWakeLock(
			() => new Promise((r) => (resolve = r)),
			() => {}
		);
		controller.setEnabled(true);
		if (action === 'disable') controller.setEnabled(false);
		else if (action === 'hide') controller.setVisible(false);
		else controller.dispose();
		const lock = new Lock();
		resolve(lock);
		await flush();
		assert.equal(lock.released, true);
	}
});

test('out-of-order requests never replace the current lock', async () => {
	const pending: ((lock: ScreenLock) => void)[] = [];
	const controller = createScreenWakeLock(
		() => new Promise((r) => pending.push(r)),
		() => {}
	);
	controller.setEnabled(true);
	controller.setEnabled(false);
	controller.setEnabled(true);
	const current = new Lock(),
		stale = new Lock();
	pending[1](current);
	await flush();
	pending[0](stale);
	await flush();
	assert.equal(stale.released, true);
	assert.equal(current.released, false);
	controller.dispose();
	await flush();
	assert.equal(current.released, true);
});

test('denials and platform releases are inactive without automatic retry loops', async () => {
	let calls = 0;
	const states: WakeStatus[] = [];
	const controller = createScreenWakeLock(
		async () => {
			calls++;
			throw new Error('Denied');
		},
		(s) => states.push(s)
	);
	controller.setEnabled(true);
	await flush();
	assert.equal(states.at(-1), 'inactive');
	assert.equal(calls, 1);
	controller.retry();
	await flush();
	assert.equal(calls, 2);
	controller.dispose();
	const lock = new Lock();
	const other = createScreenWakeLock(
		async () => lock,
		(s) => states.push(s)
	);
	other.setEnabled(true);
	await flush();
	await lock.release();
	assert.equal(states.at(-1), 'inactive');
	other.dispose();
});

test('unsupported environments do not request locks', () => {
	const states: WakeStatus[] = [];
	const controller = createScreenWakeLock(undefined, (s) => states.push(s));
	controller.setEnabled(true);
	assert.equal(states.at(-1), 'unsupported');
	controller.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Two windows share IndexedDB but not RAM: a turn recorded in one must reach
// the other's working memory and transcript through the broadcast channel.
test('recorded turns reach other windows and remote turns land in working memory', async () => {
	const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
	const stub = `
		export const saveSession = async () => 7;
		export const saveConversationTurn = async () => 1;
		export const updateSession = async () => {};
		export const getConversationTurns = async () => [];
		export const getSessions = async () => [];
	`;
	const server = await createServer({
		root, configFile: false, server: { middlewareMode: true }, appType: 'custom',
		cacheDir: '/tmp/utsuwa-memory-session-test-cache',
		resolve: { alias: [
			{ find: '$lib/services/storage/memory', replacement: '\0memory-test:storage' },
			{ find: '$lib', replacement: `${root}/src/lib` }
		] },
		optimizeDeps: { noDiscovery: true, entries: [] },
		plugins: [{
			name: 'memory-test-stubs',
			resolveId: (id) => (id.startsWith('\0memory-test:') ? id : null),
			load: (id) => (id === '\0memory-test:storage' ? stub : null)
		}]
	});
	try {
		const mod = await server.ssrLoadModule('/src/lib/engine/memory-session.ts');
		const peer = new BroadcastChannel('utsuwa-memory');
		try {
			const received: unknown[] = [];
			peer.onmessage = (e) => received.push(e.data);
			const seen: unknown[] = [];
			const stop = mod.onRemoteTurn((turn: unknown) => seen.push(turn));

			// Channel delivery is async and slow on a busy CI runner, so wait for it instead of sleeping
			const until = async (done: () => boolean, what: string) => {
				const deadline = Date.now() + 2000;
				while (!done()) {
					if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
					await new Promise((r) => setTimeout(r, 5));
				}
			};
			const remote = (role: string, content: string) =>
				peer.postMessage({ role, content, createdAt: new Date().toISOString() });

			await mod.recordTurn({ role: 'user', content: 'hello from the app' });
			await until(() => received.length > 0, 'the broadcast to other windows');
			assert.equal(received.length, 1);
			assert.deepEqual(
				(({ role, content }) => ({ role, content }))(received[0] as { role: string; content: string }),
				{ role: 'user', content: 'hello from the app' }
			);

			remote('assistant', 'hello from the overlay');
			await until(() => mod.getRecentTurns().length === 2, 'the remote turn');
			const turns = mod.getRecentTurns();
			assert.equal(turns[1].role, 'assistant');
			assert.equal(turns[1].content, 'hello from the overlay');
			assert.ok(turns[1].createdAt instanceof Date);
			assert.equal(seen.length, 1);

			// Garbage on the channel is ignored. Messages arrive in order, so once the
			// valid turn behind it lands, the garbage has already been handled.
			peer.postMessage({ nope: true });
			peer.postMessage('storage-cleared');
			remote('user', 'after the garbage');
			await until(() => mod.getRecentTurns().length >= 3, 'the turn after the garbage');
			assert.equal(mod.getRecentTurns().length, 3);
			assert.equal(mod.getRecentTurns()[2].content, 'after the garbage');
			assert.equal(seen.length, 2);

			stop();
			remote('user', 'after unsubscribe');
			await until(() => mod.getRecentTurns().length >= 4, 'the turn after unsubscribing');
			assert.equal(seen.length, 2, 'unsubscribed listener stays quiet');
			assert.equal(mod.getRecentTurns().length, 4, 'working memory still follows the other window');
		} finally {
			peer.close();
			mod.closeMemoryChannel?.();
		}
	} finally {
		await server.close();
	}
});

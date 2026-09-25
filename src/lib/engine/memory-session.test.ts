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

			await mod.recordTurn({ role: 'user', content: 'hello from the app' });
			await new Promise((r) => setTimeout(r, 20));
			assert.equal(received.length, 1);
			assert.deepEqual(
				(({ role, content }) => ({ role, content }))(received[0] as { role: string; content: string }),
				{ role: 'user', content: 'hello from the app' }
			);

			peer.postMessage({ role: 'assistant', content: 'hello from the overlay', createdAt: new Date().toISOString() });
			await new Promise((r) => setTimeout(r, 20));
			const turns = mod.getRecentTurns();
			assert.equal(turns.length, 2);
			assert.equal(turns[1].role, 'assistant');
			assert.equal(turns[1].content, 'hello from the overlay');
			assert.ok(turns[1].createdAt instanceof Date);
			assert.equal(seen.length, 1);

			// Garbage on the channel is ignored
			peer.postMessage({ nope: true });
			peer.postMessage('storage-cleared');
			await new Promise((r) => setTimeout(r, 20));
			assert.equal(mod.getRecentTurns().length, 2);
			assert.equal(seen.length, 1);

			stop();
			peer.postMessage({ role: 'user', content: 'after unsubscribe', createdAt: new Date().toISOString() });
			await new Promise((r) => setTimeout(r, 20));
			assert.equal(seen.length, 1, 'unsubscribed listener stays quiet');
			assert.equal(mod.getRecentTurns().length, 3, 'working memory still follows the other window');
		} finally {
			peer.close();
			mod.closeMemoryChannel?.();
		}
	} finally {
		await server.close();
	}
});

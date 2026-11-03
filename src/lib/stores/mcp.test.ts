import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The store uses runes, so it is compiled through the Svelte plugin.
test('mcp store tool confirmations', async (t) => {
	const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
	const stubs: Record<string, string> = {
		'$app/environment': 'export const browser = false;',
		'$lib/services/mcp/capability': 'export const getMcpCapability = async () => null; export const listTools = async () => [];'
	};
	const server = await createServer({
		root, configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error',
		resolve: { alias: [{ find: '$lib', replacement: `${root}/src/lib` }] },
		optimizeDeps: { noDiscovery: true, entries: [] },
		plugins: [
			{
				name: 'mcp-test-stubs',
				enforce: 'pre',
				resolveId(id) {
					if (id in stubs) return '\0mcp-test:' + id;
				},
				load(id) {
					if (id.startsWith('\0mcp-test:')) return stubs[id.slice('\0mcp-test:'.length)];
				}
			},
			svelte({ configFile: false })
		]
	});
	try {
		const { mcpStore } = await server.ssrLoadModule('/src/lib/stores/mcp.svelte.ts');
		const request = { serverName: 'Home Assistant', toolName: 'turn_on', args: {} };

		await t.test('an aborted turn declines and drops its pending prompt', { timeout: 2000 }, async () => {
			const turn = new AbortController();
			const answer = mcpStore.confirmToolCall(request, turn.signal);
			const other = mcpStore.confirmToolCall({ ...request, toolName: 'turn_off' });
			assert.equal(mcpStore.pendingConfirmation?.toolName, 'turn_on');
			turn.abort();
			assert.equal(await answer, false);
			// Run clicked later answers the next prompt, not the dead one
			assert.equal(mcpStore.pendingConfirmation?.toolName, 'turn_off');
			mcpStore.answerConfirmation(true);
			assert.equal(await other, true);
			assert.equal(mcpStore.pendingConfirmation, null);
		});

		await t.test('an already aborted turn never shows a prompt', async () => {
			const turn = new AbortController();
			turn.abort();
			assert.equal(await mcpStore.confirmToolCall(request, turn.signal), false);
			assert.equal(mcpStore.pendingConfirmation, null);
		});

		await t.test('an answered prompt ignores a later abort', async () => {
			const turn = new AbortController();
			const answer = mcpStore.confirmToolCall(request, turn.signal);
			mcpStore.answerConfirmation(true);
			turn.abort();
			assert.equal(await answer, true);
		});
	} finally {
		await server.close();
	}
});

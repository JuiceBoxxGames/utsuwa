import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchModelsDirect } from './client-models.ts';

// #309: without the opt-in header Anthropic fails the CORS preflight, so the
// desktop webview never got a model list
test('anthropic model fetch opts into direct browser access', async (t) => {
	let headers: Record<string, string> = {};
	t.mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
		headers = init?.headers as Record<string, string>;
		return Response.json({ data: [{ id: 'claude-sonnet-4-5-20250929' }] });
	});

	const { models, error } = await fetchModelsDirect('anthropic', 'sk-ant-test');

	assert.equal(error, undefined);
	assert.equal(models.length, 1);
	assert.equal(headers['x-api-key'], 'sk-ant-test');
	assert.equal(headers['anthropic-dangerous-direct-browser-access'], 'true');
});

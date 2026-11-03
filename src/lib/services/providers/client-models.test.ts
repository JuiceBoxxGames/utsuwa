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

test('custom endpoint with a version path lists models under that path', async (t) => {
	const seen: string[] = [];
	t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
		seen.push(String(url));
		return Response.json({ data: [{ id: 'glm-4.6' }] });
	});

	const { models, error } = await fetchModelsDirect('openai-compatible', 'k', 'https://api.z.ai/api/paas/v4');

	assert.equal(error, undefined);
	assert.deepEqual(seen, ['https://api.z.ai/api/paas/v4/models']);
	assert.equal(models[0].id, 'glm-4.6');
});

test('Ollama behind its documented /v1 base still lists from /api/tags', async (t) => {
	const seen: string[] = [];
	t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
		seen.push(String(url));
		const path = new URL(String(url)).pathname;
		if (path === '/api/tags') return Response.json({ models: [{ name: 'llama3' }] });
		if (path === '/api/show') return Response.json({ capabilities: [] });
		return new Response('404 page not found', { status: 404 });
	});

	const { models, error } = await fetchModelsDirect('openai-compatible', undefined, 'http://localhost:11434/v1/');

	assert.equal(error, undefined);
	assert.equal(models[0].id, 'llama3');
	assert.equal(seen[0], 'http://localhost:11434/api/tags');
});

test('model list errors name the HTTP status and every request can time out', async (t) => {
	let signal: AbortSignal | undefined;
	t.mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
		signal = init?.signal ?? undefined;
		// HTTP/2 responses carry no reason phrase
		return new Response('nope', { status: 401, statusText: '' });
	});

	const { error } = await fetchModelsDirect('openai', 'sk-test');

	assert.equal(error, 'Failed to fetch models: HTTP 401');
	assert.ok(signal instanceof AbortSignal);
});

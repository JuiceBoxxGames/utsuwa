import test from 'node:test';
import assert from 'node:assert/strict';
import { providerFetch, withAbortErrors } from './provider-fetch.ts';

// Mimics @tauri-apps/plugin-http: aborts reject with a plain Error and error
// the body stream with a bare string instead of an AbortError.
function pluginLikeFetch(chunks: string[]): typeof fetch {
	return (async (_input: RequestInfo | URL, init?: RequestInit) => {
		const signal = init?.signal;
		if (signal?.aborted) throw new Error('Request cancelled');
		const encoder = new TextEncoder();
		let i = 0;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				signal?.addEventListener('abort', () => controller.error('Request cancelled'));
			},
			async pull(controller) {
				await new Promise((r) => setTimeout(r, 5));
				if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
				else controller.close();
			}
		});
		return new Response(body, { status: 201, headers: { 'content-type': 'text/event-stream' } });
	}) as typeof fetch;
}

test('off desktop it uses whatever globalThis.fetch is at call time', async () => {
	const original = globalThis.fetch;
	let seen: string | undefined;
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		seen = String(input);
		return new Response('ok');
	}) as typeof fetch;
	try {
		const res = await providerFetch('https://api.example.com/v1/models');
		assert.equal(await res.text(), 'ok');
		assert.equal(seen, 'https://api.example.com/v1/models');
	} finally {
		globalThis.fetch = original;
	}
});

test('streams the body through untouched when nothing aborts', async () => {
	const f = withAbortErrors(pluginLikeFetch(['a', 'b', 'c']));
	const res = await f('https://x', { signal: new AbortController().signal });
	assert.equal(res.status, 201);
	assert.equal(res.headers.get('content-type'), 'text/event-stream');
	assert.equal(await res.text(), 'abc');
});

test('an abort before the response rejects with the signal reason', async () => {
	const controller = new AbortController();
	controller.abort();
	const f = withAbortErrors(pluginLikeFetch([]));
	await assert.rejects(f('https://x', { signal: controller.signal }), { name: 'AbortError' });
});

test('an abort mid-body rejects reads with the signal reason', async () => {
	const controller = new AbortController();
	const f = withAbortErrors(pluginLikeFetch(['a', 'b', 'c', 'd']));
	const res = await f('https://x', { signal: controller.signal });
	const reader = res.body!.getReader();
	await reader.read();
	controller.abort(new Error('Stopped'));
	await assert.rejects(reader.read(), { message: 'Stopped' });
});

test('other failures pass through unchanged', async () => {
	const f = withAbortErrors((async () => {
		throw new Error('error sending request');
	}) as typeof fetch);
	await assert.rejects(f('https://x', { signal: new AbortController().signal }), {
		message: 'error sending request'
	});
});

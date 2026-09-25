import test from 'node:test';
import assert from 'node:assert/strict';

import {
	LOCAL_TTS_PROXY_DISABLED_MESSAGE,
	capBytes,
	validateLocalTtsProxyRequest
} from './local-proxy.ts';

const body = { model: 'kokoro', input: 'Hello', voice: 'af_bella', speed: 1, response_format: 'mp3' };
const request = (overrides: Record<string, unknown> = {}) => ({
	provider: 'local-tts',
	baseUrl: 'http://127.0.0.1:8880/v1/',
	body,
	...overrides
});

function rejected(result: ReturnType<typeof validateLocalTtsProxyRequest>) {
	assert.equal(result.ok, false);
	return result as Extract<typeof result, { ok: false }>;
}

function accepted(result: ReturnType<typeof validateLocalTtsProxyRequest>) {
	assert.equal(result.ok, true, result.ok ? '' : result.message);
	return result as Extract<typeof result, { ok: true }>;
}

test('disabled flag gives 403 with the enable instructions', () => {
	const result = rejected(validateLocalTtsProxyRequest(request(), false));
	assert.equal(result.status, 403);
	assert.equal(result.message, LOCAL_TTS_PROXY_DISABLED_MESSAGE);
	assert.match(result.message, /ALLOW_LOCAL_PROVIDER_HOSTS=true/);
});

test('rejects anything but the two local TTS providers', () => {
	for (const provider of ['openai-tts', 'elevenlabs', 'ollama', '', undefined, 42]) {
		assert.equal(rejected(validateLocalTtsProxyRequest(request({ provider }), true)).status, 400);
	}
	accepted(validateLocalTtsProxyRequest(request({ provider: 'omnivoice' }), true));
});

test('rejects malformed payloads', () => {
	for (const json of [null, 'x', [], 42]) {
		assert.equal(rejected(validateLocalTtsProxyRequest(json, true)).status, 400);
	}
	assert.equal(rejected(validateLocalTtsProxyRequest(request({ baseUrl: 42 }), true)).status, 400);
	assert.equal(rejected(validateLocalTtsProxyRequest(request({ body: null }), true)).status, 400);
	assert.equal(rejected(validateLocalTtsProxyRequest(request({ body: ['x'] }), true)).status, 400);
});

test('missing or non-string input is a 400', () => {
	const { input: _input, ...noInput } = body;
	assert.equal(rejected(validateLocalTtsProxyRequest(request({ body: noInput }), true)).status, 400);
	assert.equal(
		rejected(validateLocalTtsProxyRequest(request({ body: { ...body, input: 5 } }), true)).status,
		400
	);
});

test('input over 4000 characters is a 400', () => {
	accepted(validateLocalTtsProxyRequest(request({ body: { ...body, input: 'a'.repeat(4000) } }), true));
	const result = rejected(
		validateLocalTtsProxyRequest(request({ body: { ...body, input: 'a'.repeat(4001) } }), true)
	);
	assert.equal(result.status, 400);
	assert.match(result.message, /4000/);
});

test('a private base passes with the flag on and targets audio/speech', () => {
	const result = accepted(validateLocalTtsProxyRequest(request(), true));
	assert.equal(result.url, 'http://127.0.0.1:8880/v1/audio/speech');
	assert.deepEqual(result.body, body);
});

test('a public https base passes with the flag on', () => {
	const result = accepted(
		validateLocalTtsProxyRequest(request({ baseUrl: 'https://tts.example.com/v1' }), true)
	);
	assert.equal(result.url, 'https://tts.example.com/v1/audio/speech');
});

test('base URLs are normalized by getTTSBaseUrl', () => {
	const cases: Array<[string, string]> = [
		['http://192.168.1.5:8880', 'http://192.168.1.5:8880/v1/audio/speech'],
		['http://192.168.1.5:8880/v1', 'http://192.168.1.5:8880/v1/audio/speech'],
		['http://192.168.1.5:8880/tts/', 'http://192.168.1.5:8880/tts/v1/audio/speech'],
		// empty falls back to the provider default
		['', 'http://localhost:8880/v1/audio/speech']
	];
	for (const [baseUrl, url] of cases) {
		assert.equal(accepted(validateLocalTtsProxyRequest(request({ baseUrl }), true)).url, url);
	}
});

test('non-http schemes and garbage URLs are rejected', () => {
	for (const baseUrl of ['file:///etc/passwd', 'ftp://127.0.0.1/v1', 'javascript:alert(1)', 'not a url']) {
		assert.equal(rejected(validateLocalTtsProxyRequest(request({ baseUrl }), true)).status, 400);
	}
});

test('credentials, queries, and fragments cannot steer the final URL', () => {
	for (const baseUrl of [
		'http://user:pass@127.0.0.1:8880/v1',
		'http://127.0.0.1:8880/v1?next=/admin',
		'http://127.0.0.1:8880/v1#/admin'
	]) {
		assert.equal(rejected(validateLocalTtsProxyRequest(request({ baseUrl }), true)).status, 400);
	}
});

test('forwards only Content-Type and Authorization', () => {
	const withAuth = accepted(validateLocalTtsProxyRequest(request(), true, 'Bearer abc'));
	assert.deepEqual(withAuth.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer abc' });
	const without = accepted(validateLocalTtsProxyRequest(request(), true, null));
	assert.deepEqual(without.headers, { 'Content-Type': 'application/json' });
});

async function drain(stream: ReadableStream<Uint8Array>): Promise<number> {
	let total = 0;
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) return total;
		total += value.byteLength;
	}
}

function chunks(...sizes: number[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const size of sizes) controller.enqueue(new Uint8Array(size));
			controller.close();
		}
	});
}

test('capBytes passes bodies at or under the cap through untouched', async () => {
	assert.equal(await drain(chunks(4, 6).pipeThrough(capBytes(10))), 10);
});

test('capBytes errors the stream once the cap is exceeded', async () => {
	await assert.rejects(drain(chunks(4, 6, 1).pipeThrough(capBytes(10))), /exceeded/);
});

test('the flag still refuses link-local, metadata, and unspecified hosts', () => {
	for (const baseUrl of ['http://169.254.169.254/', 'http://[fe80::1]:8880/', 'http://metadata.google.internal/', 'http://0.0.0.0:8880/', 'http://[::ffff:a9fe:a9fe]/']) {
		assert.equal(rejected(validateLocalTtsProxyRequest(request({ baseUrl }), true)).status, 400, baseUrl);
	}
});

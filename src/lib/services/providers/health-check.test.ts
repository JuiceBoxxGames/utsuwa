import test from 'node:test';
import assert from 'node:assert/strict';
import {
	checkTTSProviderHealth,
	getTTSProviderHealth,
	subscribeTTSProviderHealth
} from './health-check.ts';

test('OmniVoice health check returns healthy when /health responds ok', async () => {
	const requests: string[] = [];
	globalThis.fetch = (input: string | URL | Request) => {
		requests.push(String(input));
		return Promise.resolve({ ok: true, status: 200 } as Response);
	};

	const status = await checkTTSProviderHealth('omnivoice', 'http://localhost:8880/v1/');

	assert.equal(status, 'healthy');
	assert.equal(requests.length, 1);
	assert.equal(requests[0], 'http://localhost:8880/health');
});

test('Local TTS health check returns healthy when /v1/audio/voices responds ok', async () => {
	const requests: string[] = [];
	globalThis.fetch = (input: string | URL | Request) => {
		requests.push(String(input));
		return Promise.resolve({ ok: true, status: 200 } as Response);
	};

	const status = await checkTTSProviderHealth('local-tts', 'http://localhost:8880/v1/');

	assert.equal(status, 'healthy');
	assert.equal(requests.length, 1);
	assert.equal(requests[0], 'http://localhost:8880/v1/audio/voices');
});

test('Health check returns unhealthy on connection error', async () => {
	globalThis.fetch = () => Promise.reject(new Error('Failed to fetch'));

	const status = await checkTTSProviderHealth('omnivoice', 'http://localhost:8880/v1/');

	assert.equal(status, 'unhealthy');
});

test('Health check returns unhealthy on non-ok response', async () => {
	globalThis.fetch = () => Promise.resolve({ ok: false, status: 503 } as Response);

	const status = await checkTTSProviderHealth('omnivoice', 'http://localhost:8880/v1/');

	assert.equal(status, 'unhealthy');
});

test('Non-local TTS providers return unknown without fetching', async () => {
	let fetchCalled = false;
	globalThis.fetch = () => {
		fetchCalled = true;
		return Promise.resolve({ ok: true, status: 200 } as Response);
	};

	const status = await checkTTSProviderHealth('elevenlabs');

	assert.equal(status, 'unknown');
	assert.equal(fetchCalled, false);
});

test('Health status is readable after check and notifies subscribers', async () => {
	globalThis.fetch = () => Promise.resolve({ ok: true, status: 200 } as Response);

	let notified = false;
	const unsubscribe = subscribeTTSProviderHealth(() => {
		notified = true;
	});

	await checkTTSProviderHealth('omnivoice', 'http://localhost:8880/v1/');

	assert.equal(getTTSProviderHealth('omnivoice', 'http://localhost:8880/v1/'), 'healthy');
	assert.equal(notified, true);

	unsubscribe();
});


test('Local TTS without a voice list (404) still counts as reachable', async () => {
	globalThis.fetch = () => Promise.resolve({ ok: false, status: 404 } as Response);

	const status = await checkTTSProviderHealth('local-tts', 'http://127.0.0.1:8080/v1');

	assert.equal(status, 'healthy');
});

test('Local TTS returning a server error is unhealthy', async () => {
	globalThis.fetch = () => Promise.resolve({ ok: false, status: 503 } as Response);

	const status = await checkTTSProviderHealth('local-tts', 'http://127.0.0.1:8080/v1');

	assert.equal(status, 'unhealthy');
});

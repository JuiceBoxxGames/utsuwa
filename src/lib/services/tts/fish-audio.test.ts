import test from 'node:test';
import assert from 'node:assert/strict';

class MockAudioContext {
	state = 'running';
	destination = {};
	createBufferSource() {
		return {
			buffer: null,
			playbackRate: { value: 1 },
			connect() {
				return this;
			},
			start() {}
		} as unknown as AudioBufferSourceNode;
	}
	createAnalyser() {
		return {
			fftSize: 0,
			connect() {
				return this;
			}
		} as unknown as AnalyserNode;
	}
	async decodeAudioData() {
		return { duration: 1 } as AudioBuffer;
	}
	resume() {
		return Promise.resolve();
	}
}

// @ts-expect-error globalThis.AudioContext is not available in Node test environment
globalThis.AudioContext = MockAudioContext;

import { FishAudioTTS } from './fish-audio.ts';
import { getTTSProvider } from '../providers/registry.ts';

function mockFetch(response: () => Response) {
	const calls: { url: string; init: RequestInit }[] = [];
	globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return response();
	}) as typeof fetch;
	return calls;
}

const audio = () => new Response(new ArrayBuffer(8));
const headersOf = (init: RequestInit) => init.headers as Record<string, string>;
const bodyOf = (init: RequestInit) => JSON.parse(init.body as string) as Record<string, unknown>;

test('fetchAudioBuffer posts the Fish Audio request through the web proxy', async () => {
	const calls = mockFetch(audio);
	const tts = new FishAudioTTS({
		provider: 'fish-audio',
		apiKey: 'test-key',
		voiceId: 'voice-a',
		model: 's1',
		speed: 1.2
	});

	await tts.fetchAudioBuffer('Hello there.');

	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, '/api/tts/fish-audio');
	assert.equal(calls[0].init.method, 'POST');
	assert.deepEqual(headersOf(calls[0].init), {
		Authorization: 'Bearer test-key',
		'Content-Type': 'application/json',
		model: 's1'
	});
	assert.deepEqual(bodyOf(calls[0].init), {
		text: 'Hello there.',
		reference_id: 'voice-a',
		format: 'mp3',
		prosody: { speed: 1.2 }
	});
});

test('segment voice and speed override the session defaults', async () => {
	const calls = mockFetch(audio);
	const tts = new FishAudioTTS({ provider: 'fish-audio', apiKey: 'k', voiceId: 'voice-a' });

	await tts.fetchAudioBuffer('Hola.', { voiceId: 'voice-b', speed: 0.8 });

	const body = bodyOf(calls[0].init);
	assert.equal(body.reference_id, 'voice-b');
	assert.deepEqual(body.prosody, { speed: 0.8 });
});

test('a pasted fish.audio voice link is sent as its voice id', async () => {
	const calls = mockFetch(audio);
	const tts = new FishAudioTTS({
		provider: 'fish-audio',
		apiKey: 'k',
		voiceId: 'https://fish.audio/m/933563129e564b19a115bedd57b7406a/'
	});

	await tts.fetchAudioBuffer('Hi.');

	assert.equal(bodyOf(calls[0].init).reference_id, '933563129e564b19a115bedd57b7406a');
});

test('an empty voice or model falls back to the defaults the settings show', async () => {
	const calls = mockFetch(audio);
	const meta = getTTSProvider('fish-audio');

	await new FishAudioTTS({ provider: 'fish-audio', apiKey: 'k' }).fetchAudioBuffer('Hi.');

	assert.equal(bodyOf(calls[0].init).reference_id, meta?.voices?.[0].id);
	assert.equal(headersOf(calls[0].init).model, meta?.models?.[0].id);
});

test('speed is applied by Fish Audio, not again at playback', async () => {
	const calls = mockFetch(audio);
	const tts = new FishAudioTTS({ provider: 'fish-audio', apiKey: 'k', speed: 1.5 });

	const { source } = await tts.speak('Hi.');

	assert.deepEqual(bodyOf(calls[0].init).prosody, { speed: 1.5 });
	assert.notEqual(tts.capabilities.clientSideSpeed, true);
	assert.equal(source.playbackRate.value, 1);
});

test('failures keep the Fish Audio explanation', async () => {
	mockFetch(
		() => new Response(JSON.stringify({ status: 402, message: 'Insufficient balance' }), { status: 402 })
	);
	const tts = new FishAudioTTS({ provider: 'fish-audio', apiKey: 'k' });

	await assert.rejects(tts.fetchAudioBuffer('Hi.'), {
		message: 'Fish Audio error 402: Insufficient balance'
	});
});

import test from 'node:test';
import assert from 'node:assert/strict';

class MockAudioBufferSourceNode {
	buffer: AudioBuffer | null = null;
	onended: (() => void) | null = null;
	playbackRate = { value: 1 };
	start() {
		setImmediate(() => this.onended?.());
	}
	stop() {}
	connect() {
		return this;
	}
	disconnect() {}
}

class MockAnalyserNode {
	fftSize = 256;
	connect() {
		return this;
	}
	disconnect() {}
	getByteFrequencyData() {}
}

class MockAudioContext {
	state = 'running';
	currentTime = 0;
	destination = {};
	createBufferSource() {
		return new MockAudioBufferSourceNode() as unknown as AudioBufferSourceNode;
	}
	createAnalyser() {
		return new MockAnalyserNode() as unknown as AnalyserNode;
	}
	createBuffer(numChannels: number, length: number, sampleRate: number) {
		return {
			duration: length / sampleRate,
			getChannelData: () => new Float32Array(length),
			numberOfChannels: numChannels,
			sampleRate,
			length
		} as unknown as AudioBuffer;
	}
	async decodeAudioData() {
		return this.createBuffer(1, 480, 48000);
	}
	resume() {
		return Promise.resolve();
	}
}

// @ts-expect-error globalThis.AudioContext is not available in Node test environment
globalThis.AudioContext = MockAudioContext;

import { getTTSProvider, getSharedAudioContext, unlockAudioContext } from './index.ts';
import { OpenAITTS } from './openai-tts.ts';
import { ElevenLabsTTS } from './elevenlabs.ts';
import { FishAudioTTS } from './fish-audio.ts';

function mockFetchResponse() {
	return Promise.resolve({
		ok: true,
		status: 200,
		arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
	} as Response);
}

globalThis.fetch = () => mockFetchResponse();

test('factory serves omnivoice from the OpenAI client with multilingual enabled', () => {
	const provider = getTTSProvider({ provider: 'omnivoice' });
	assert.ok(provider instanceof OpenAITTS);
	assert.equal(provider.capabilities?.multilingual, true);
});

test('factory returns OpenAITTS for openai-tts and local-tts providers', () => {
	const openai = getTTSProvider({ provider: 'openai-tts' });
	const local = getTTSProvider({ provider: 'local-tts' });
	assert.ok(openai instanceof OpenAITTS);
	assert.ok(local instanceof OpenAITTS);
	// Neither takes a language hint, unlike omnivoice.
	assert.equal(openai.capabilities?.multilingual, false);
	assert.equal(local.capabilities?.multilingual, false);
});

test('factory returns ElevenLabsTTS for elevenlabs provider', () => {
	assert.ok(getTTSProvider({ provider: 'elevenlabs' }) instanceof ElevenLabsTTS);
});

test('factory returns FishAudioTTS for fish-audio provider', () => {
	assert.ok(getTTSProvider({ provider: 'fish-audio' }) instanceof FishAudioTTS);
});

test('factory reuses OmniVoice provider when only unrelated fields differ', () => {
	const first = getTTSProvider({
		provider: 'omnivoice',
		voiceId: 'alloy',
		language: 'de',
		speed: 1.0
	});
	const second = getTTSProvider({
		provider: 'omnivoice',
		voiceId: 'alloy',
		language: 'de',
		speed: 1.0
	});
	assert.equal(first, second);
});

test('factory creates new OmniVoice provider when language changes', () => {
	const first = getTTSProvider({
		provider: 'omnivoice',
		voiceId: 'alloy',
		language: 'de',
		speed: 1.0
	});
	const second = getTTSProvider({
		provider: 'omnivoice',
		voiceId: 'alloy',
		language: 'es',
		speed: 1.0
	});
	assert.notEqual(first, second);
});

test('unlockAudioContext resumes a suspended shared context', () => {
	const ctx = getSharedAudioContext() as unknown as MockAudioContext;
	let resumed = 0;
	ctx.state = 'suspended';
	ctx.resume = () => {
		resumed++;
		ctx.state = 'running';
		return Promise.resolve();
	};
	unlockAudioContext();
	assert.equal(resumed, 1);
	// Already running: no second resume
	unlockAudioContext();
	assert.equal(resumed, 1);
});

test('unlockAudioContext is a no-op without AudioContext (SSR)', () => {
	const saved = globalThis.AudioContext;
	// @ts-expect-error simulating SSR
	delete globalThis.AudioContext;
	assert.doesNotThrow(() => unlockAudioContext());
	globalThis.AudioContext = saved;
});

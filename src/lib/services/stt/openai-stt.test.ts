import test from 'node:test';
import assert from 'node:assert/strict';

import {
	buildTranscriptionRequest,
	encodeWav,
	resolveSttTimeoutMs,
	sttTimeoutMessage,
	DEFAULT_STT_TIMEOUT_MS,
	type OpenAiSttConfig
} from './openai-stt.ts';

function formToObject(form: FormData): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of form.entries()) out[k] = v;
	return out;
}

const audio = new Blob(['fake-audio'], { type: 'audio/webm' });

test('posts to {base}/audio/transcriptions with the model and file', () => {
	const config: OpenAiSttConfig = {
		baseUrl: 'https://api.groq.com/openai/v1',
		model: 'whisper-large-v3-turbo',
		apiKey: 'gsk_test',
		label: 'Groq'
	};
	const req = buildTranscriptionRequest(config, audio, 'recording.webm');
	assert.equal(req.url, 'https://api.groq.com/openai/v1/audio/transcriptions');
	const fields = formToObject(req.body);
	assert.equal(fields.model, 'whisper-large-v3-turbo');
	assert.ok(fields.file, 'file part present');
	assert.equal(req.headers.Authorization, 'Bearer gsk_test');
});

test('trailing slashes on the base URL are trimmed', () => {
	const req = buildTranscriptionRequest(
		{ baseUrl: 'http://localhost:8000/v1///', model: 'whisper-1', label: 'the local STT server' },
		audio,
		'recording.m4a'
	);
	assert.equal(req.url, 'http://localhost:8000/v1/audio/transcriptions');
});

test('no Authorization header is sent when there is no API key (local servers)', () => {
	const req = buildTranscriptionRequest(
		{ baseUrl: 'http://localhost:8000/v1', model: 'Systran/faster-whisper-large-v3', label: 'the local STT server' },
		audio,
		'recording.m4a'
	);
	assert.equal(req.headers.Authorization, undefined);
	assert.equal(Object.keys(req.headers).length, 0);
	assert.equal(formToObject(req.body).model, 'Systran/faster-whisper-large-v3');
});

test('resolveSttTimeoutMs falls back to the default for missing or junk values', () => {
	assert.equal(DEFAULT_STT_TIMEOUT_MS, 30_000);
	assert.equal(resolveSttTimeoutMs(undefined), 30_000);
	assert.equal(resolveSttTimeoutMs(Number.NaN), 30_000);
	assert.equal(resolveSttTimeoutMs(Number.POSITIVE_INFINITY), 30_000);
	assert.equal(resolveSttTimeoutMs(0), 30_000);
	assert.equal(resolveSttTimeoutMs(-10), 30_000);
});

test('resolveSttTimeoutMs converts seconds to ms and clamps to 5..600 s', () => {
	assert.equal(resolveSttTimeoutMs(120), 120_000);
	assert.equal(resolveSttTimeoutMs(1), 5_000);
	assert.equal(resolveSttTimeoutMs(5000), 600_000);
});

test('sttTimeoutMessage names the provider and the timeout in seconds', () => {
	const msg = sttTimeoutMessage('the local STT server', 90_000);
	assert.match(msg, /^The local STT server/);
	assert.match(msg, /90 seconds/);
	assert.match(msg, /Settings > STT/);
});

test('encodeWav writes a 16-bit mono PCM header for the given rate', async () => {
	const blob = encodeWav([new Float32Array([0, 0.5]), new Float32Array([-0.5])], 48_000);
	assert.equal(blob.type, 'audio/wav');
	const view = new DataView(await blob.arrayBuffer());
	const ascii = (at: number) => String.fromCharCode(...new Uint8Array(view.buffer, at, 4));
	assert.equal(view.byteLength, 44 + 3 * 2);
	assert.equal(ascii(0), 'RIFF');
	assert.equal(view.getUint32(4, true), 36 + 3 * 2);
	assert.equal(ascii(8), 'WAVE');
	assert.equal(ascii(12), 'fmt ');
	assert.equal(view.getUint16(20, true), 1, 'PCM');
	assert.equal(view.getUint16(22, true), 1, 'mono');
	assert.equal(view.getUint32(24, true), 48_000);
	assert.equal(view.getUint32(28, true), 96_000, 'byte rate');
	assert.equal(view.getUint16(32, true), 2, 'block align');
	assert.equal(view.getUint16(34, true), 16, 'bits per sample');
	assert.equal(ascii(36), 'data');
	assert.equal(view.getUint32(40, true), 3 * 2);
});

test('encodeWav concatenates chunks and clamps samples to the 16-bit range', async () => {
	const blob = encodeWav([new Float32Array([1, -1]), new Float32Array([2, -2, 0])], 16_000);
	const view = new DataView(await blob.arrayBuffer());
	const samples = [0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true));
	assert.deepEqual(samples, [32767, -32768, 32767, -32768, 0]);
});

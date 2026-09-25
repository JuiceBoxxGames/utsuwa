import test from 'node:test';
import assert from 'node:assert/strict';
import {
	checkHealth,
	cloneVoice,
	deleteClone,
	initializeProfile,
	listClones,
	previewBody,
	resetProfile,
	synthesize
} from './omnivoice-client.ts';

const conn = { baseUrl: 'http://localhost:8881/v1/', apiKey: 'secret' };
const anon = { baseUrl: 'http://localhost:8881/v1/' };

function mockFetch(response: () => Response | Promise<Response>) {
	const calls: { url: string; init: RequestInit }[] = [];
	globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return response();
	}) as typeof fetch;
	return calls;
}

const json = (body: unknown, status = 200) => () => Response.json(body, { status });

test('listClones sends auth and returns the clone list', async () => {
	const calls = mockFetch(json({ clones: [{ id: 'clone:a', name: 'A' }] }));
	assert.deepEqual(await listClones(conn), [{ id: 'clone:a', name: 'A' }]);
	assert.equal(calls[0].url, 'http://localhost:8881/v1/voices');
	assert.equal(calls[0].init.method, undefined);
	assert.deepEqual(calls[0].init.headers, { Authorization: 'Bearer secret' });
});

test('listClones treats a missing list as empty and a failed response as unknown', async () => {
	mockFetch(json({}));
	assert.deepEqual(await listClones(anon), []);
	mockFetch(json({}, 500));
	assert.equal(await listClones(anon), null);
});

test('listClones lets network errors through', async () => {
	mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
	await assert.rejects(listClones(anon), /Failed to fetch/);
});

test('initializeProfile posts the voice design as JSON', async () => {
	const calls = mockFetch(json({}));
	await initializeProfile(anon, { voice: 'ash', instructions: 'male', language: 'en' });
	assert.equal(calls[0].url, 'http://localhost:8881/v1/voices/initialize');
	assert.equal(calls[0].init.method, 'POST');
	assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json' });
	assert.equal(calls[0].init.body, '{"voice":"ash","instructions":"male","language":"en"}');
});

test('failures surface the proxy detail, then the fallback, then the status', async () => {
	mockFetch(json({ detail: 'model loading' }, 503));
	await assert.rejects(initializeProfile(anon, { voice: 'a', instructions: 'b', language: 'en' }), {
		message: 'model loading'
	});
	mockFetch(json({}, 500));
	await assert.rejects(initializeProfile(anon, { voice: 'a', instructions: 'b', language: 'en' }), {
		message: 'Profile init failed (HTTP 500)'
	});
	mockFetch(() => new Response('not json', { status: 502 }));
	await assert.rejects(resetProfile(anon, { voice: 'a', language: 'en' }), { message: 'HTTP 502' });
	mockFetch(json({}, 500));
	await assert.rejects(resetProfile(anon, { voice: 'a', language: 'en' }), {
		message: 'Profile reset failed (HTTP 500)'
	});
});

test('resetProfile omits instructions for cloned voices', async () => {
	const calls = mockFetch(json({}));
	await resetProfile(conn, { voice: 'mine', language: 'de' });
	assert.equal(calls[0].url, 'http://localhost:8881/v1/voices/profile/reset');
	assert.equal(calls[0].init.body, '{"voice":"mine","language":"de"}');
	assert.deepEqual(calls[0].init.headers, {
		'Content-Type': 'application/json',
		Authorization: 'Bearer secret'
	});
	await resetProfile(conn, { voice: 'ash', language: 'en', instructions: 'male' });
	assert.equal(calls[1].init.body, '{"voice":"ash","language":"en","instructions":"male"}');
});

test('cloneVoice uploads the reference as multipart form data', async () => {
	const calls = mockFetch(json({}));
	const audio = new File([new Uint8Array(4)], 'ref.wav', { type: 'audio/wav' });
	await cloneVoice(conn, { voiceId: 'mine', refAudio: audio, refText: 'Hello' });
	assert.equal(calls[0].url, 'http://localhost:8881/v1/voices/clone');
	assert.equal(calls[0].init.method, 'POST');
	assert.deepEqual(calls[0].init.headers, { Authorization: 'Bearer secret' });
	const form = calls[0].init.body as FormData;
	assert.deepEqual([...form.keys()], ['voice_id', 'ref_audio', 'ref_text']);
	assert.equal(form.get('voice_id'), 'mine');
	assert.equal((form.get('ref_audio') as File).name, 'ref.wav');
	assert.equal(form.get('ref_text'), 'Hello');

	mockFetch(json({ detail: 'audio too short' }, 422));
	await assert.rejects(cloneVoice(anon, { voiceId: 'x', refAudio: audio, refText: 'y' }), {
		message: 'audio too short'
	});
	mockFetch(json({}, 500));
	await assert.rejects(cloneVoice(anon, { voiceId: 'x', refAudio: audio, refText: 'y' }), {
		message: 'HTTP 500'
	});
});

test('deleteClone sends DELETE and ignores the response status', async () => {
	const calls = mockFetch(json({}, 404));
	await deleteClone(conn, 'mine');
	assert.equal(calls[0].url, 'http://localhost:8881/v1/voices/clone/mine');
	assert.equal(calls[0].init.method, 'DELETE');
	assert.deepEqual(calls[0].init.headers, { Authorization: 'Bearer secret' });
});

test('synthesize returns the audio bytes or throws the status', async () => {
	const calls = mockFetch(() => new Response(new Uint8Array([1, 2, 3])));
	const body = previewBody({ input: 'Hi', language: 'en', voice: 'ash', speed: 1, numStep: 32, positionTemperature: 1, classTemperature: 0.2 });
	const bytes = await synthesize(anon, body);
	assert.equal(bytes.byteLength, 3);
	assert.equal(calls[0].url, 'http://localhost:8881/v1/audio/speech');
	assert.equal(calls[0].init.method, 'POST');
	assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json' });
	assert.equal(calls[0].init.body, JSON.stringify(body));
	mockFetch(json({ detail: 'ignored' }, 500));
	await assert.rejects(synthesize(anon, body), { message: 'HTTP 500' });
});

test('previewBody keeps the proxy key order and drops empty voice and instructions', () => {
	const params = { speed: 1.1, numStep: 16, positionTemperature: 0.5, classTemperature: 0 };
	assert.equal(
		JSON.stringify(previewBody({ input: 'Hi', language: 'en', voice: 'ash', instructions: 'male', ...params })),
		'{"model":"omnivoice","input":"Hi","response_format":"wav","language":"en","voice":"ash","instructions":"male","speed":1.1,"num_step":16,"position_temperature":0.5,"class_temperature":0}'
	);
	assert.equal(
		JSON.stringify(previewBody({ input: 'Hi', language: 'ja', voice: '', instructions: undefined, ...params })),
		'{"model":"omnivoice","input":"Hi","response_format":"wav","language":"ja","speed":1.1,"num_step":16,"position_temperature":0.5,"class_temperature":0}'
	);
});

test('checkHealth maps the health endpoint to a proxy status', async () => {
	const calls = mockFetch(json({ status: 'ok' }));
	assert.equal(await checkHealth('http://localhost:8881/v1/'), 'connected');
	assert.equal(calls[0].url, 'http://localhost:8881/health');
	assert.ok(calls[0].init.signal instanceof AbortSignal);
	assert.equal(calls[0].init.headers, undefined);
	mockFetch(json({}, 503));
	assert.equal(await checkHealth('http://box:9000/'), 'connecting');
	mockFetch(json({}, 500));
	assert.equal(await checkHealth('http://box:9000/'), 'disconnected');
	mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
	assert.equal(await checkHealth('http://box:9000/'), 'disconnected');
});

test('checkHealth strips the /v1/ suffix and trailing slashes', async () => {
	const calls = mockFetch(json({}));
	await checkHealth('http://box:9000//');
	assert.equal(calls[0].url, 'http://box:9000/health');
});

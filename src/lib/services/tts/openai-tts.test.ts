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

import { OpenAITTS, sanitizeOmniVoiceInput } from './openai-tts.ts';

function parseBody(init?: RequestInit): Record<string, unknown> {
	if (!init?.body) return {};
	try {
		return JSON.parse(init.body as string) as Record<string, unknown>;
	} catch {
		return {};
	}
}

function mockFetchResponse() {
	return Promise.resolve({
		ok: true,
		status: 200,
		arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
	} as Response);
}

test('OpenAI TTS request body remains unchanged (regression)', async () => {
	const requests: { url: string; body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (url: string, init: RequestInit) => {
		requests.push({ url, body: parseBody(init) });
		return mockFetchResponse();
	};

	const tts = new OpenAITTS({
		provider: 'openai-tts',
		apiKey: 'test-key',
		voiceId: 'nova',
		model: 'tts-1-hd',
		speed: 1.15
	});

	await tts.fetchAudioBuffer('Hello world.');

	assert.equal(requests.length, 1);
	assert.equal(requests[0].url, 'https://api.openai.com/v1/audio/speech');
	assert.equal(requests[0].body.model, 'tts-1-hd');
	assert.equal(requests[0].body.input, 'Hello world.');
	assert.equal(requests[0].body.voice, 'nova');
	assert.equal(requests[0].body.speed, 1.15);
	assert.equal(requests[0].body.response_format, 'mp3');
	// Key must be absent, not merely undefined: OmniVoice shares this client.
	assert.equal('language' in requests[0].body, false);
});

test('Local TTS request body remains unchanged and uses mp3 format (regression)', async () => {
	const requests: { body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (_url: string, init: RequestInit) => {
		requests.push({ body: parseBody(init) });
		return mockFetchResponse();
	};

	const tts = new OpenAITTS({
		provider: 'local-tts',
		baseUrl: 'http://localhost:8880/v1',
		voiceId: 'af_bella',
		model: 'kokoro',
		speed: 1.0
	});

	await tts.fetchAudioBuffer('Hello world.');

	assert.equal(requests[0].body.model, 'kokoro');
	assert.equal(requests[0].body.voice, 'af_bella');
	assert.equal(requests[0].body.response_format, 'mp3');
	assert.equal(requests[0].body.speed, 1.0);
	assert.equal('language' in requests[0].body, false);
});

test('Local TTS keeps its own connection hint and HTTP error message', async () => {
	globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));

	const tts = new OpenAITTS({ provider: 'local-tts', baseUrl: 'http://localhost:8880/v1' });
	await assert.rejects(() => tts.fetchAudioBuffer('Hi.'), /local TTS server/i);

	globalThis.fetch = () =>
		Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);

	await assert.rejects(
		() => tts.fetchAudioBuffer('Hi.'),
		/Local TTS server returned 404 at http:\/\/localhost:8880\/v1\//
	);
});

test('Hosted OpenAI TTS rethrows network errors and uses the OpenAI error label', async () => {
	const networkError = new TypeError('Failed to fetch');
	globalThis.fetch = () => Promise.reject(networkError);

	const tts = new OpenAITTS({ provider: 'openai-tts', apiKey: 'k' });
	// Hosted OpenAI must rethrow the original error, not a local-server hint.
	await assert.rejects(() => tts.fetchAudioBuffer('Hi.'), (err) => err === networkError);

	globalThis.fetch = () =>
		Promise.resolve({
			ok: false,
			status: 401,
			json: () => Promise.resolve({ error: { message: 'bad key' } })
		} as Response);

	await assert.rejects(() => tts.fetchAudioBuffer('Hi.'), /OpenAI TTS/);
});

test('sends Authorization only when an API key is present', async () => {
	const seen: (Record<string, string> | undefined)[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (_url: string, init: RequestInit) => {
		seen.push(init.headers as Record<string, string>);
		return mockFetchResponse();
	};

	await new OpenAITTS({ provider: 'openai-tts', apiKey: 'secret' }).fetchAudioBuffer('a');
	await new OpenAITTS({ provider: 'local-tts' }).fetchAudioBuffer('b');

	assert.equal(seen[0]?.Authorization, 'Bearer secret');
	assert.equal('Authorization' in (seen[1] ?? {}), false);
});

// --- OmniVoice, served by this same client since the fold in #141 ---

test('fetchAudioBuffer sends WAV request with base fields and no API key', async () => {
	const requests: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (url: string, init: RequestInit) => {
		requests.push({ url, body: parseBody(init), headers: init.headers as Record<string, string> });
		return mockFetchResponse();
	};

	const tts = new OpenAITTS({
		provider: 'omnivoice',
		voiceId: 'alloy',
		language: 'de',
		speed: 1.2
	});

	await tts.fetchAudioBuffer('Hallo Welt.');

	assert.equal(requests.length, 1);
	assert.equal(requests[0].url, 'http://localhost:8881/v1/audio/speech');
	assert.equal(requests[0].body.model, 'omnivoice');
	assert.equal(requests[0].body.input, 'Hallo Welt.');
	assert.equal(requests[0].body.voice, 'alloy');
	assert.equal(requests[0].body.language, 'de');
	assert.equal(requests[0].body.speed, 1.2);
	assert.equal(requests[0].body.response_format, 'wav');
	assert.equal('Authorization' in requests[0].headers, false);
});

test('fetchAudioBuffer overrides language and speed from stream options', async () => {
	const requests: { body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (_url: string, init: RequestInit) => {
		requests.push({ body: parseBody(init) });
		return mockFetchResponse();
	};

	const tts = new OpenAITTS({
		provider: 'omnivoice',
		voiceId: 'alloy',
		language: 'en',
		speed: 1.0
	});

	await tts.fetchAudioBuffer('Hello.', { language: 'es', speed: 0.9 });

	assert.equal(requests[0].body.language, 'es');
	assert.equal(requests[0].body.speed, 0.9);
});

test('fetchAudioBuffer adds guidance_scale and disables postprocessing for foreign segments', async () => {
	const requests: { body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (_url: string, init: RequestInit) => {
		requests.push({ body: parseBody(init) });
		return mockFetchResponse();
	};

	const tts = new OpenAITTS({
		provider: 'omnivoice',
		voiceId: 'alloy',
		language: 'de',
		speed: 1.0
	});

	// Foreign segment: guidance_scale=6, postprocess_output=false
	await tts.fetchAudioBuffer('ir', { language: 'es' });
	assert.equal(requests[0].body.guidance_scale, 6.0);
	assert.equal(requests[0].body.postprocess_output, false);

	// Primary segment: neither field present
	await tts.fetchAudioBuffer('Hallo.');
	assert.equal('guidance_scale' in requests[1].body, false);
	assert.equal('postprocess_output' in requests[1].body, false);
});

test('fetchAudioBuffer honours per-segment guidanceScale and postprocessOutput overrides', async () => {
	const requests: { body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (_url: string, init: RequestInit) => {
		requests.push({ body: parseBody(init) });
		return mockFetchResponse();
	};

	const tts = new OpenAITTS({
		provider: 'omnivoice',
		voiceId: 'alloy',
		language: 'de',
		speed: 1.0
	});

	await tts.fetchAudioBuffer('ir', {
		language: 'es',
		guidanceScale: 4.0,
		postprocessOutput: true
	});

	assert.equal(requests[0].body.guidance_scale, 4.0);
	assert.equal(requests[0].body.postprocess_output, true);
});

test('speak returns a source and analyser', async () => {
	globalThis.fetch = () => mockFetchResponse();

	const tts = new OpenAITTS({
		provider: 'omnivoice'
	});

	const result = await tts.speak('Hello world.');
	assert.ok(result.source);
	assert.ok(result.analyser);
});

test('connection error surfaces a local OmniVoice hint', async () => {
	globalThis.fetch = () => Promise.reject(new Error('Failed to fetch'));

	const tts = new OpenAITTS({
		provider: 'omnivoice',
		baseUrl: 'http://localhost:8880/v1'
	});

	await assert.rejects(tts.fetchAudioBuffer('Hello.'), /OmniVoice proxy/);
});

test('HTTP error surfaces providerErrorMessage-style detail', async () => {
	globalThis.fetch = () =>
		Promise.resolve({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: { message: 'bad request' } })
		} as Response);

	const tts = new OpenAITTS({
		provider: 'omnivoice'
	});

	await assert.rejects(tts.fetchAudioBuffer('Hello.'), /OmniVoice error 400: bad request/);
});

test('OmniVoice keeps its own hint when a plain local server would not', async () => {
	// omnivoice is in LOCAL_TTS_PROVIDERS, so a bare isLocal check would wrongly
	// hand it the local-tts messages. Guard the two apart explicitly.
	globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
	await assert.rejects(
		() => new OpenAITTS({ provider: 'omnivoice' }).fetchAudioBuffer('x'),
		/OmniVoice proxy/
	);
	await assert.rejects(
		() => new OpenAITTS({ provider: 'local-tts' }).fetchAudioBuffer('x'),
		/local TTS server/i
	);

	globalThis.fetch = () =>
		Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({}) } as Response);
	await assert.rejects(
		() => new OpenAITTS({ provider: 'omnivoice' }).fetchAudioBuffer('x'),
		/OmniVoice error 400/
	);
	await assert.rejects(
		() => new OpenAITTS({ provider: 'local-tts' }).fetchAudioBuffer('x'),
		/Local TTS server returned 400/
	);
});

test('fetchAudioBuffer includes OmniVoice advanced parameters when set', async () => {
	const requests: { body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (_url: string, init: RequestInit) => {
		requests.push({ body: parseBody(init) });
		return mockFetchResponse();
	};

	const tts = new OpenAITTS({
		provider: 'omnivoice',
		voiceId: 'alloy',
		instructions: 'female, young adult, moderate pitch, american accent',
		numStep: 16,
		positionTemperature: 0.8,
		classTemperature: 0.4
	});

	await tts.fetchAudioBuffer('Hello.');

	assert.equal(requests[0].body.instructions, 'female, young adult, moderate pitch, american accent');
	assert.equal(requests[0].body.num_step, 16);
	assert.equal(requests[0].body.position_temperature, 0.8);
	assert.equal(requests[0].body.class_temperature, 0.4);
});

test('fetchAudioBuffer omits instructions for cloned OmniVoice voices', async () => {
	const requests: { body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (_url: string, init: RequestInit) => {
		requests.push({ body: parseBody(init) });
		return mockFetchResponse();
	};

	const tts = new OpenAITTS({
		provider: 'omnivoice',
		voiceId: 'clone:my_voice',
		instructions: 'female, young adult, moderate pitch, american accent'
	});

	await tts.fetchAudioBuffer('Hello.');

	assert.equal('instructions' in requests[0].body, false);
});

test('fetchAudioBuffer treats near-empty WAV responses as silence instead of throwing', async () => {
	// OmniVoice returns header-plus-a-few-samples WAVs for very short inputs;
	// decodeAudioData can reject those. The client must not surface a decode
	// error for them.
	let decodeCalled = 0;
	const tts = new OpenAITTS({ provider: 'omnivoice' });
	const ctx = tts.getAudioContext() as unknown as MockAudioContext;
	ctx.decodeAudioData = async () => {
		decodeCalled++;
		return ctx.createBuffer(1, 48000, 48000);
	};

	globalThis.fetch = () =>
		Promise.resolve({
			ok: true,
			status: 200,
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(80))
		} as Response);

	const buffer = await tts.fetchAudioBuffer('es');
	assert.ok(buffer);
	assert.equal(decodeCalled, 0);

	// A normal-size response still goes through decodeAudioData.
	globalThis.fetch = () =>
		Promise.resolve({
			ok: true,
			status: 200,
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(95120))
		} as Response);
	await tts.fetchAudioBuffer('Hallo Welt.');
	assert.equal(decodeCalled, 1);
});

// ── OmniVoice input sanitizing (quote marks, short words) ─────────────

test('sanitizeOmniVoiceInput strips double quotes OmniVoice would render as silence', () => {
	// Measured against the live proxy: inputs like "es" (with quotes) always
	// return an empty WAV, while the bare word synthesises fine.
	assert.equal(sanitizeOmniVoiceInput('"es"'), 'es');
	assert.equal(sanitizeOmniVoiceInput('„es"'), 'es');
	assert.equal(sanitizeOmniVoiceInput('Das Wort "ir" bedeutet gehen.'), 'Das Wort ir bedeutet gehen.');
});

test('sanitizeOmniVoiceInput keeps apostrophes inside words', () => {
	// Elisions (l'osso, rock 'n' roll) must keep their apostrophes; only
	// quoting marks around a word are dropped.
	assert.equal(sanitizeOmniVoiceInput("l'osso significa Knochen."), "l'osso significa Knochen.");
	assert.equal(sanitizeOmniVoiceInput("'ir'"), 'ir');
});

test('sanitizeOmniVoiceInput leaves single-word inputs in the primary language alone', () => {
	// Primary-language words are measured stable; no enrichment needed.
	assert.equal(sanitizeOmniVoiceInput('ir'), 'ir');
	assert.equal(sanitizeOmniVoiceInput('decir'), 'decir');
	assert.equal(sanitizeOmniVoiceInput('go'), 'go');
	assert.equal(sanitizeOmniVoiceInput('行く'), '行く');
});

test('sanitizeOmniVoiceInput leaves multi-word inputs untouched', () => {
	assert.equal(sanitizeOmniVoiceInput('por favor'), 'por favor');
	assert.equal(sanitizeOmniVoiceInput('Das war gehen.'), 'Das war gehen.');
});

test('sanitizeOmniVoiceInput handles punctuation edge cases', () => {
	// Primary-language inputs keep their original punctuation.
	assert.equal(sanitizeOmniVoiceInput('go!'), 'go!');
	assert.equal(sanitizeOmniVoiceInput('café?'), 'café?');
	assert.equal(sanitizeOmniVoiceInput('ir,'), 'ir,');
	assert.equal(sanitizeOmniVoiceInput('ir:'), 'ir:');
	// No speakable character: returned as-is (the caller skips the request).
	assert.equal(sanitizeOmniVoiceInput('.'), '.');
	assert.equal(sanitizeOmniVoiceInput('!!!'), '!!!');
	assert.equal(sanitizeOmniVoiceInput(''), '');
});

test('sanitizeOmniVoiceInput capitalises short foreign inputs and adds a period', () => {
	// Measured against the live proxy: short foreign inputs like "ir" or
	// "por favor" returned empty audio without a speech boundary. Capitalising
	// and adding a closing period ("Ir.", "Por favor.") synthesised reliably
	// and sounds natural instead of repeating the word.
	assert.equal(sanitizeOmniVoiceInput('ir', 'es', 'de'), 'Ir.');
	assert.equal(sanitizeOmniVoiceInput('por favor', 'es', 'de'), 'Por favor.');
	assert.equal(sanitizeOmniVoiceInput('yes', 'en', 'de'), 'Yes.');
	assert.equal(sanitizeOmniVoiceInput('ja', 'de', 'es'), 'Ja.');
	// Regional tags resolve to the primary subtag.
	assert.equal(sanitizeOmniVoiceInput('oui', 'fr-FR', 'de'), 'Oui.');
	// Non-Latin scripts: no capitalisation concept, but the period is added.
	assert.equal(sanitizeOmniVoiceInput('行く', 'ja', 'de'), '行く.');
});

test('sanitizeOmniVoiceInput leaves primary-language fragments alone', () => {
	// Primary-language fragments are measured stable; no enrichment needed.
	assert.equal(sanitizeOmniVoiceInput('danke schön', 'de', 'de'), 'danke schön');
	assert.equal(sanitizeOmniVoiceInput('Das war', 'de', 'de'), 'Das war');
	assert.equal(sanitizeOmniVoiceInput('es', 'de', 'de'), 'es');
});

test('sanitizeOmniVoiceInput capitalises short foreign inputs in any language', () => {
	// Languages without carrier phrase (e.g. Polish) get same treatment:
	// capitalise + closing period.
	assert.equal(sanitizeOmniVoiceInput('cześć', 'pl', 'de'), 'Cześć.');
	assert.equal(sanitizeOmniVoiceInput('dzień dobry', 'pl', 'de'), 'Dzień dobry.');
});

test('sanitizeOmniVoiceInput keeps inverted punctuation pairs intact', () => {
	// ¿…? / ¡…! pairs must not end up with a trailing period: breaking
	// the pair confuses the synthesiser ("¿qué tal?" → "¿qué tal.").
	assert.equal(sanitizeOmniVoiceInput('¿qué tal?', 'es', 'de'), '¿Qué tal?');
	assert.equal(sanitizeOmniVoiceInput('¡hola!', 'es', 'de'), '¡Hola!');
	// Unclosed pairs get their matching closing mark restored.
	assert.equal(sanitizeOmniVoiceInput('¿qué tal', 'es', 'de'), '¿Qué tal?');
	assert.equal(sanitizeOmniVoiceInput('¡hola', 'es', 'de'), '¡Hola!');
	// German primary-language fragments keep the period enrichment.
	assert.equal(sanitizeOmniVoiceInput('hallo', 'de', 'es'), 'Hallo.');
});

test('sanitizeOmniVoiceInput never enriches non-verbal markers', () => {
	// [laughter] is rendered by OmniVoice as audio; enriching it to
	// "laughter, laughter." would read the marker word aloud instead.
	assert.equal(sanitizeOmniVoiceInput('[laughter]'), '[laughter]');
	assert.equal(sanitizeOmniVoiceInput('[laughter]', 'es', 'de'), '[laughter]');
	assert.equal(sanitizeOmniVoiceInput('[sigh] [laughter]', 'es', 'de'), '[sigh] [laughter]');
});

test('OmniVoice request body contains the sanitised input, OpenAI stays untouched', async () => {
	const requests: { body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (_url: string, init: RequestInit) => {
		requests.push({ body: parseBody(init) });
		return mockFetchResponse();
	};

	const omni = new OpenAITTS({ provider: 'omnivoice', voiceId: 'alloy', language: 'es' });
	await omni.fetchAudioBuffer('"ir"');
	assert.equal(requests[0].body.input, 'ir');

	const openai = new OpenAITTS({ provider: 'openai-tts', apiKey: 'k', voiceId: 'nova' });
	await openai.fetchAudioBuffer('"Hello."');
	assert.equal(requests[1].body.input, '"Hello."');
});

test('fetchAudioBuffer skips the HTTP request when nothing speakable remains', async () => {
	// A bare "." (or an empty segment) has no speakable content; sending it
	// only produces noise. No request must leave the client.
	let fetchCalls = 0;
	globalThis.fetch = () => {
		fetchCalls++;
		return mockFetchResponse();
	};

	const tts = new OpenAITTS({ provider: 'omnivoice' });
	const buffer = await tts.fetchAudioBuffer('.');
	assert.ok(buffer);
	assert.equal(fetchCalls, 0);

	await tts.fetchAudioBuffer('Hallo.');
	assert.equal(fetchCalls, 1);
});

// --- server proxy fallback for local engines that block the browser ---

function proxyAfterBlockedDirect(proxy: () => Response) {
	const calls: { url: string; init: RequestInit }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (url: string, init: RequestInit) => {
		calls.push({ url, init });
		if (url !== '/api/tts/local') return Promise.reject(new TypeError('Failed to fetch'));
		return Promise.resolve(proxy());
	};
	return calls;
}

test('a blocked local request retries once through /api/tts/local', async () => {
	const calls = proxyAfterBlockedDirect(() => new Response(new Uint8Array(256), { status: 200 }));
	const tts = new OpenAITTS({
		provider: 'local-tts',
		baseUrl: 'http://127.0.0.1:8899',
		voiceId: 'af_bella',
		apiKey: 'tok'
	});

	const ctx = tts.getAudioContext() as unknown as MockAudioContext;
	ctx.decodeAudioData = async () => ctx.createBuffer(1, 7200, 24000);

	const buffer = await tts.fetchAudioBuffer('Hello.');

	assert.equal(buffer.duration, 0.3);
	assert.deepEqual(
		calls.map((c) => c.url),
		['http://127.0.0.1:8899/v1/audio/speech', '/api/tts/local']
	);
	const sent = parseBody(calls[1].init);
	assert.equal(sent.provider, 'local-tts');
	assert.equal(sent.baseUrl, 'http://127.0.0.1:8899/v1/');
	assert.deepEqual(sent.body, parseBody(calls[0].init));
	assert.equal((calls[1].init.headers as Record<string, string>).Authorization, 'Bearer tok');
});

test('a disabled proxy or a static build shows the existing connection hint', async () => {
	for (const status of [403, 404]) {
		proxyAfterBlockedDirect(() => Response.json({ message: 'disabled' }, { status }));
		await assert.rejects(
			() => new OpenAITTS({ provider: 'local-tts' }).fetchAudioBuffer('Hi.'),
			/Could not reach a local TTS server/
		);
		await assert.rejects(
			() => new OpenAITTS({ provider: 'omnivoice' }).fetchAudioBuffer('Hi.'),
			/OmniVoice proxy/
		);
	}
});

test('proxy validation and upstream failures surface the proxy message', async () => {
	for (const status of [400, 502]) {
		proxyAfterBlockedDirect(() => Response.json({ message: `proxy said ${status}` }, { status }));
		await assert.rejects(
			() => new OpenAITTS({ provider: 'local-tts' }).fetchAudioBuffer('Hi.'),
			new RegExp(`proxy said ${status}`)
		);
	}
});

test('no proxy retry for aborted requests, HTTP errors, or cloud providers', async () => {
	const controller = new AbortController();
	controller.abort();
	let calls = proxyAfterBlockedDirect(() => new Response(new Uint8Array(256)));
	await assert.rejects(() =>
		new OpenAITTS({ provider: 'local-tts' }).fetchAudioBuffer('Hi.', { signal: controller.signal })
	);
	assert.equal(calls.length, 1);

	calls = proxyAfterBlockedDirect(() => new Response(new Uint8Array(256)));
	await assert.rejects(() => new OpenAITTS({ provider: 'openai-tts', apiKey: 'k' }).fetchAudioBuffer('Hi.'));
	assert.equal(calls.length, 1);

	let count = 0;
	globalThis.fetch = () => {
		count++;
		return Promise.resolve(new Response('nope', { status: 500 }));
	};
	await assert.rejects(() => new OpenAITTS({ provider: 'local-tts' }).fetchAudioBuffer('Hi.'));
	assert.equal(count, 1);
});

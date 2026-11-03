import test from 'node:test';
import assert from 'node:assert/strict';
import { initLanguageDetector } from './tts/language-detector.ts';

// Mock the browser AudioContext before importing the orchestrator.
class MockAudioBufferSourceNode {
	buffer: AudioBuffer | null = null;
	onended: (() => void) | null = null;
	start() {
		// Simulate immediate playback completion on the next tick.
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
	async decodeAudioData(buffer: ArrayBuffer) {
		// 1 second of audio so the near-empty-buffer guard never skips it.
		return this.createBuffer(1, 48000, 48000);
	}
	resume() {
		return Promise.resolve();
	}
}

// @ts-expect-error globalThis.AudioContext is not available in Node test environment
globalThis.AudioContext = MockAudioContext;

import { VoiceOrchestrator, resolveSegmentVoice, type SpeechSegment } from './voice-orchestrator.ts';
import type { TTSOptions } from './tts/index.ts';

const baseOptions: TTSOptions = { provider: 'openai-tts', apiKey: 'test-key' };

function mockFetchResponse() {
	return Promise.resolve({
		ok: true,
		status: 200,
		// Realistic WAV size so the near-empty-buffer guard never kicks in.
		arrayBuffer: () => Promise.resolve(new ArrayBuffer(95120))
	} as Response);
}

function parseBody(init?: RequestInit): Record<string, unknown> {
	if (!init?.body) return {};
	try {
		return JSON.parse(init.body as string) as Record<string, unknown>;
	} catch {
		return {};
	}
}

test('speakSegments plays all segments and fires onSegmentStart for each', async () => {
	const fetchCalls: { url: string; body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (url: string, init: RequestInit) => {
		fetchCalls.push({ url, body: parseBody(init) });
		return mockFetchResponse();
	};

	const orchestrator = new VoiceOrchestrator();
	const starts: string[] = [];
	const segments: SpeechSegment[] = [
		{ text: 'First sentence.' },
		{ text: 'Second sentence.' }
	];

	let complete = false;
	await orchestrator.speakSegments(segments, baseOptions, {
		onSegmentStart: (seg) => starts.push(seg.text),
		onComplete: () => {
			complete = true;
		}
	});

	assert.equal(fetchCalls.length, 2);
	assert.equal(fetchCalls[0].body.input, 'First sentence.');
	assert.equal(fetchCalls[1].body.input, 'Second sentence.');
	assert.deepEqual(starts, ['First sentence.', 'Second sentence.']);
	assert.equal(complete, true);
});

test('skips empty or punctuation-only segments', async () => {
	globalThis.fetch = () => mockFetchResponse();

	const orchestrator = new VoiceOrchestrator();
	const starts: string[] = [];
	const segments: SpeechSegment[] = [
		{ text: 'Hello.' },
		{ text: '   ' },
		{ text: '!!!' },
		{ text: 'Goodbye.' }
	];

	await orchestrator.speakSegments(segments, baseOptions, {
		onSegmentStart: (seg) => starts.push(seg.text)
	});

	assert.deepEqual(starts, ['Hello.', 'Goodbye.']);
});

test('caps parallel synthesis when the provider declares no limit', async () => {
	let inFlight = 0;
	let maxInFlight = 0;
	globalThis.fetch = async () => {
		inFlight++;
		maxInFlight = Math.max(maxInFlight, inFlight);
		await new Promise((resolve) => setTimeout(resolve, 20));
		inFlight--;
		return {
			ok: true,
			status: 200,
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
		} as Response;
	};

	const orchestrator = new VoiceOrchestrator();
	const segments: SpeechSegment[] = Array.from({ length: 6 }, (_, i) => ({
		text: `Sentence number ${i + 1}.`
	}));

	await orchestrator.speakSegments(segments, baseOptions, {});

	// Cloud providers enforce per-plan concurrency caps (ElevenLabs Free allows 2),
	// so an uncapped fan-out turns an ordinary reply into a 429 storm.
	assert.ok(
		maxInFlight <= 2,
		`expected at most 2 parallel synthesis requests, saw ${maxInFlight}`
	);
});

test('speakSegments rejects when a segment fails so the store can surface it', async () => {
	let call = 0;
	globalThis.fetch = () => {
		call++;
		if (call === 2) {
			return Promise.resolve({
				ok: false,
				status: 429,
				json: () => Promise.reject(new Error('no body'))
			} as unknown as Response);
		}
		return mockFetchResponse();
	};

	const orchestrator = new VoiceOrchestrator();
	const starts: string[] = [];
	const segments: SpeechSegment[] = [{ text: 'One.' }, { text: 'Two.' }, { text: 'Three.' }];

	await assert.rejects(
		orchestrator.speakSegments(segments, baseOptions, {
			onSegmentStart: (seg) => starts.push(seg.text)
		}),
		/429/
	);
	// The surviving segments still play; the failure is reported, not swallowed.
	assert.deepEqual(starts, ['One.', 'Three.']);
});

test('interrupt stops playback and onComplete fires', async () => {
	globalThis.fetch = () => mockFetchResponse();

	const orchestrator = new VoiceOrchestrator();
	let complete = false;

	await orchestrator.beginSession(baseOptions, {
		onComplete: () => {
			complete = true;
		}
	});
	orchestrator.pushSegment({ text: 'A long sentence that gets interrupted.' });
	orchestrator.interrupt();

	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(complete, true);
	assert.equal(orchestrator.getIsPlaying(), false);
});

test('a session started after interrupt is never played by the old runner', async () => {
	globalThis.fetch = () => mockFetchResponse();
	const orchestrator = new VoiceOrchestrator();
	const seenBy: string[] = [];

	await orchestrator.beginSession(baseOptions, { onSegmentStart: (s) => seenBy.push(`A:${s.text}`) });
	orchestrator.pushSegment({ text: 'Old reply.' });
	orchestrator.interrupt();
	await orchestrator.beginSession(baseOptions, { onSegmentStart: (s) => seenBy.push(`B:${s.text}`) });
	for (const text of ['New one.', 'New two.', 'New three.', 'New four.']) {
		orchestrator.pushSegment({ text });
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	await orchestrator.endSession();

	assert.deepEqual(
		seenBy.filter((entry) => entry.includes('New')),
		['B:New one.', 'B:New two.', 'B:New three.', 'B:New four.']
	);
});

test('the old runner does not resolve the next session early', async () => {
	globalThis.fetch = () => mockFetchResponse();
	const orchestrator = new VoiceOrchestrator();
	let started = false;

	await orchestrator.beginSession(baseOptions);
	orchestrator.interrupt();
	await orchestrator.beginSession(baseOptions, { onSegmentStart: () => (started = true) });
	await new Promise((resolve) => setTimeout(resolve, 5));
	orchestrator.pushSegment({ text: 'Hello there.' });
	await orchestrator.endSession();

	assert.equal(started, true, 'endSession resolved before the segment played');
});

test('interrupt during endSession settles it and stops playback', async () => {
	globalThis.fetch = () => mockFetchResponse();
	const orchestrator = new VoiceOrchestrator();
	const started: string[] = [];

	await orchestrator.beginSession(baseOptions, { onSegmentStart: (s) => started.push(s.text) });
	orchestrator.pushSegment({ text: 'First.' });
	orchestrator.pushSegment({ text: 'Second.' });
	orchestrator.pushSegment({ text: 'Third.' });
	const done = orchestrator.endSession();
	orchestrator.interrupt();
	await done;
	await new Promise((resolve) => setTimeout(resolve, 20));

	assert.ok(started.length < 3, `kept playing after interrupt: ${JSON.stringify(started)}`);
	assert.equal(orchestrator.getIsPlaying(), false);
});

// --- alt-voice language selection ------------------------------------------
// The companion pipeline must not invent a session language. When it is unset
// the orchestrator infers the primary language from the first segment; pinning
// it to 'en' inverts alt-voice selection for every non-English companion.

async function altVoiceTags(
	sessionLanguage: string | undefined,
	enableAlt = true,
	altLanguage?: string
): Promise<(string | undefined)[]> {
	globalThis.fetch = () => mockFetchResponse();

	const orchestrator = new VoiceOrchestrator();
	const tags: (string | undefined)[] = [];

	await orchestrator.speakSegments(
		[
			{ text: 'これはテストです。', language: 'ja' },
			{ text: 'This is a test.', language: 'en' }
		],
		{
			...baseOptions,
			altVoiceId: 'alt-voice',
			language: sessionLanguage,
			enableAltLanguage: enableAlt,
			altLanguage
		},
		{ onSegmentStart: (seg) => tags.push(seg.voiceId) }
	);

	return tags;
}

test('infers primary language from the first segment when none is configured', async () => {
	// Japanese leads, so Japanese is primary and only the English line switches.
	assert.deepEqual(await altVoiceTags(undefined), [undefined, 'alt']);
});

test('an explicitly configured primary language overrides inference', async () => {
	// This is why the caller must send undefined rather than a default of 'en':
	// pinning 'en' flips which line is treated as foreign.
	assert.deepEqual(await altVoiceTags('en'), ['alt', undefined]);
	assert.deepEqual(await altVoiceTags('ja'), [undefined, 'alt']);
});

test('does not switch voices while the alternative voice is disabled', async () => {
	// The switch must only happen when the user explicitly enabled it, even if
	// the segments carry different languages.
	assert.deepEqual(await altVoiceTags(undefined, false), [undefined, undefined]);
	assert.deepEqual(await altVoiceTags('en', false), [undefined, undefined]);
});

test('only the configured alternative language switches voices', async () => {
	// altLanguage restricts the switch: segments in that language get the alt
	// voice, every other language keeps the primary voice.
	assert.deepEqual(await altVoiceTags('ja', true, 'en'), [undefined, 'alt']);
	assert.deepEqual(await altVoiceTags('ja', true, 'es'), [undefined, undefined]);
});

test('regional language tags match the configured alternative language', async () => {
	// Models sometimes send BCP-47 regional tags ("es-ES") although the user
	// configured the bare code ("es"). The switch compares primary subtags.
	const tags = await (async () => {
		globalThis.fetch = () => mockFetchResponse();
		const orchestrator = new VoiceOrchestrator();
		const collected: (string | undefined)[] = [];
		await orchestrator.speakSegments(
			[
				{ text: 'Das Wort bedeutet gehen.', language: 'de' },
				{ text: 'el verbo ir', language: 'es-ES' }
			],
			{
				...baseOptions,
				altVoiceId: 'alt-voice',
				language: 'de',
				enableAltLanguage: true,
				altLanguage: 'es'
			},
			{ onSegmentStart: (seg) => collected.push(seg.voiceId) }
		);
		return collected;
	})();
	assert.deepEqual(tags, [undefined, 'alt']);
});

test('an alternative language equal to the primary language falls back to auto-switching', async () => {
	// An explicit alt === primary is a misconfiguration the UI prevents; the
	// orchestrator treats it as unset, so only segments differing from the
	// primary language switch (never the primary-language segments themselves).
	// Isolate the ELD subset first: it is module-global and shared within this
	// file — a stale subset excluding 'en' would force "This is a test." to a
	// wrong reliable result and flip it to the alt voice (flaky across order).
	await initLanguageDetector(['en', 'ja', 'de', 'es']);
	assert.deepEqual(await altVoiceTags('en', true, 'en'), ['alt', undefined]);
});

test('applies alternative-voice synthesis parameters to alt segments only', async () => {
	const requests: { body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (_url: string, init: RequestInit) => {
		requests.push({ body: parseBody(init) });
		return mockFetchResponse();
	};

	const orchestrator = new VoiceOrchestrator();
	await orchestrator.speakSegments(
		[
			{ text: 'Das ist deutsch.', language: 'de' },
			{ text: 'Esto es español.', language: 'es' }
		],
		{
			provider: 'omnivoice',
			voiceId: 'alloy',
			altVoiceId: 'onyx',
			enableAltLanguage: true,
			altLanguage: 'es',
			language: 'de',
			speed: 1.2,
			instructions: 'female voice',
			altInstructions: 'male voice',
			numStep: 32,
			altNumStep: 16,
			positionTemperature: 1.0,
			altPositionTemperature: 0.7,
			classTemperature: 0.4,
			altClassTemperature: 0.6
		},
		{}
	);

	assert.equal(requests.length, 2);
	const de = requests[0].body;
	const es = requests[1].body;

	// Primary segment: primary voice and primary synthesis parameters.
	assert.equal(de.voice, 'alloy');
	assert.equal(de.instructions, 'female voice');
	assert.equal(de.num_step, 32);
	assert.equal(de.position_temperature, 1.0);
	assert.equal(de.class_temperature, 0.4);

	// Alternative segment: alternative voice and alternative parameters.
	assert.equal(es.voice, 'onyx');
	assert.equal(es.instructions, 'male voice');
	assert.equal(es.num_step, 16);
	assert.equal(es.position_temperature, 0.7);
	assert.equal(es.class_temperature, 0.6);
});

test('alt segments fall back to primary synthesis parameters when alt values are unset', async () => {
	const requests: { body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (_url: string, init: RequestInit) => {
		requests.push({ body: parseBody(init) });
		return mockFetchResponse();
	};

	const orchestrator = new VoiceOrchestrator();
	await orchestrator.speakSegments(
		[
			{ text: 'Das ist deutsch.', language: 'de' },
			{ text: 'Esto es español.', language: 'es' }
		],
		{
			provider: 'omnivoice',
			voiceId: 'alloy',
			altVoiceId: 'onyx',
			enableAltLanguage: true,
			altLanguage: 'es',
			language: 'de',
			speed: 1.3,
			numStep: 24
		},
		{}
	);

	assert.equal(requests.length, 2);
	// Both segments use the primary speed/num_step: unset alt values must
	// never produce an undefined override.
	assert.equal(requests[0].body.speed, 1.3);
	assert.equal(requests[0].body.num_step, 24);
	assert.equal(requests[1].body.speed, 1.3);
	assert.equal(requests[1].body.num_step, 24);
});

test('beginSession/pushSegment splits and voices mixed language before first chunk plays', async () => {
	const requests: { body: Record<string, unknown> }[] = [];
	// @ts-expect-error global fetch mock
	globalThis.fetch = (_url: string, init: RequestInit) => {
		requests.push({ body: parseBody(init) });
		return mockFetchResponse();
	};

	const orchestrator = new VoiceOrchestrator();
	await orchestrator.beginSession(
		{
			provider: 'omnivoice',
			voiceId: 'alloy',
			altVoiceId: 'onyx',
			enableAltLanguage: true,
			altLanguage: 'es',
			language: 'de',
			speed: 1.2,
			altSpeed: 1.2
		},
		{}
	);

	// Push a single segment that mixes German and Spanish. The detector must
	// run before validation so the Spanish chunks are not left with the
	// default language tag.
	orchestrator.pushSegment({
		text: 'la maceta das ist der Blumentopf. el árbol das ist der Baum. mi vida?',
		language: 'de'
	});
	await orchestrator.endSession();

	const inputs = requests.map((r) => (typeof r.body.input === 'string' ? r.body.input.toLowerCase() : ''));
	const voices = requests.map((r) => r.body.voice);
	const langs = requests.map((r) => r.body.language);

	assert.ok(inputs.some((i) => i.includes('la maceta')));
	assert.ok(inputs.some((i) => i.includes('el árbol')));
	assert.ok(inputs.some((i) => i.includes('mi vida')));

	const esIndex = inputs.findIndex(
		(i) => i.includes('la maceta') || i.includes('el árbol') || i.includes('mi vida')
	);
	assert.notEqual(esIndex, -1);
	assert.equal(voices[esIndex], 'onyx');
	assert.equal(langs[esIndex], 'es');
});

test('resolveSegmentVoice treats an alt language equal to the primary as unset', () => {
	// Misconfiguration guard: altLanguage === language must never tag primary
	// segments as alternative, otherwise the whole conversation switches.
	const res = resolveSegmentVoice(
		{ text: 'Hallo Welt.', language: 'de' },
		{
			provider: 'omnivoice',
			voiceId: 'alloy',
			altVoiceId: 'onyx',
			enableAltLanguage: true,
			language: 'de',
			altLanguage: 'de'
		},
		undefined
	);
	assert.equal(res.voiceId, undefined);
});

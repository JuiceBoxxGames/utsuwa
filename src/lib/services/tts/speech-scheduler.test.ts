import test from 'node:test';
import assert from 'node:assert/strict';

import { SpeechScheduler } from './speech-scheduler.ts';
import type { CompiledSegment } from './speech-compiler.ts';
import type { TTSOptions } from './index.ts';
import type { SpeechSegment, OrchestratorCallbacks, VoiceOrchestrator } from '../voice-orchestrator.ts';

const baseOptions: TTSOptions = { provider: 'omnivoice', voiceId: 'alloy' };

function makeMockOrchestrator() {
	let capturedSegments: SpeechSegment[] = [];
	let intercepted = false;
	let sessionEnded = false;
	let beginSessionCalls = 0;

	function beginSession(_options: TTSOptions, callbacks?: { onSegmentStart?: (s: SpeechSegment) => void; onComplete?: () => void }) {
		beginSessionCalls++;
		capturedSegments = [];
		callbacksRef = callbacks;
	}

	let callbacksRef: { onSegmentStart?: (s: SpeechSegment) => void; onComplete?: () => void } | undefined;

	function pushSegment(segment: SpeechSegment) {
		capturedSegments.push(segment);
		callbacksRef?.onSegmentStart?.(segment);
	}

	async function endSession() {
		sessionEnded = true;
		callbacksRef?.onComplete?.();
		return Promise.resolve();
	}

	function interrupt() {
		intercepted = true;
	}

	return {
		beginSession,
		pushSegment,
		endSession,
		interrupt,
		getSegments: () => capturedSegments,
		wasIntercepted: () => intercepted,
		wasSessionEnded: () => sessionEnded,
		getBeginSessionCalls: () => beginSessionCalls
	};
}

test('beginPlan translates speak segments to orchestrator pushSegment', async () => {
	const mock = makeMockOrchestrator();
	const s = new SpeechScheduler(mock as any);
	const segments: CompiledSegment[] = [
		{ type: 'speak', text: 'Hello', language: 'en' },
		{ type: 'speak', text: 'world', language: 'en' }
	];
	await s.beginPlan(segments, baseOptions);

	const captured = mock.getSegments();
	assert.equal(captured.length, 2);
	assert.equal(captured[0].text, 'Hello');
	assert.equal(captured[0].language, 'en');
	assert.equal(mock.wasSessionEnded(), true);
	assert.equal(mock.getBeginSessionCalls(), 1);
});

test('beginPlan handles gesture and pause segments', async () => {
	const mock = makeMockOrchestrator();
	const s = new SpeechScheduler(mock as any);
	const segments: CompiledSegment[] = [
		{ type: 'gesture', gestureType: 'smile', language: '' },
		{ type: 'speak', text: 'Hello', language: 'en' },
		{ type: 'pause', durationMs: 50, language: '' },
		{ type: 'speak', text: 'world', language: 'en' }
	];
	await s.beginPlan(segments, baseOptions);

	const captured = mock.getSegments();
	assert.equal(captured.length, 2);
	assert.equal(captured[0].text, 'Hello');
	assert.equal(captured[1].text, 'world');

	const stores = s.getStores();
	assert.equal(stores.gesture.type, 'smile');
});

test('queued speech forwards the audio analyser for lip sync with every provider', async () => {
	for (const provider of ['openai-tts', 'elevenlabs', 'fish-audio', 'local-tts', 'omnivoice'] as const) {
		const analyser = {} as AnalyserNode;
		let received: AnalyserNode | null = null;
		let callbacks: OrchestratorCallbacks | undefined;
		const mock = {
			beginSession: (_options: TTSOptions, cb?: OrchestratorCallbacks) => { callbacks = cb; },
			pushSegment: () => { callbacks?.onAnalyserUpdate?.(analyser); },
			endSession: async () => { callbacks?.onComplete?.(); }
		};
		const scheduler = new SpeechScheduler(mock as unknown as VoiceOrchestrator);
		await scheduler.beginPlan(
			[{ type: 'speak', text: 'Hello there.', language: 'en' }],
			{ provider },
			(value) => { received = value; }
		);
		assert.equal(received, analyser, provider);
		assert.equal(scheduler.getStores().subtitle.visible, false);
	}
});

test('interrupt calls orchestrator.interrupt', () => {
	const mock = makeMockOrchestrator();
	const s = new SpeechScheduler(mock as any);
	s.interrupt();
	assert.ok(mock.wasIntercepted());
});

test('getStores returns gesture and subtitle stores', () => {
	const mock = makeMockOrchestrator();
	const s = new SpeechScheduler(mock as any);
	const stores = s.getStores();
	assert.ok('gesture' in stores);
	assert.ok('subtitle' in stores);
	assert.equal(stores.gesture.active, false);
});

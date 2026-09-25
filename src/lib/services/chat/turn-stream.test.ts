import test from 'node:test';
import assert from 'node:assert/strict';
import { TurnStream } from './turn-stream.ts';

const fence = '\n```json\n{"new_memory":"x"}\n```\nrepeat';

function sinks(withSpeech = true) {
	const shown: string[] = [];
	const spoken: string[] = [];
	return {
		shown, spoken,
		sinks: { show: (text: string) => shown.push(text), speak: withSpeech ? (chunk: string) => spoken.push(chunk) : undefined }
	};
}

test('plain providers show the raw text assembled across rounds', () => {
	const { shown, spoken, sinks: s } = sinks();
	const stream = new TurnStream(false, s);
	stream.startRound();
	stream.delta('Let me check.');
	stream.endRound('Let me check.' + fence, false);
	stream.startRound();
	stream.delta('It is warm.');
	stream.endRound('It is warm.' + fence, true);
	assert.deepEqual(shown, ['Let me check.', 'Let me check.\nIt is warm.']);
	assert.deepEqual(spoken, []);
	assert.equal(stream.content, 'Let me check.\nIt is warm.' + fence);
});

test('OmniVoice shows cleaned text, caps the display at the state fence and speaks each part once', () => {
	const { shown, spoken, sinks: s } = sinks();
	const stream = new TurnStream(true, s);
	stream.startRound();
	const full = '<thinking>plan</thinking>Hello there.' + fence;
	stream.delta('<thinking>plan</thinking>Hello');
	stream.delta('<thinking>plan</thinking>Hello there.');
	stream.delta(full);
	stream.delta(full);
	assert.equal(shown.at(-1), 'Hello there.');
	assert.equal(spoken.join(''), 'Hello there.\n');
});

test('an incomplete speak() call waits before it reaches the display', () => {
	const { shown, sinks: s } = sinks();
	const stream = new TurnStream(true, s);
	stream.startRound();
	stream.delta('speak({"text":"Hi');
	assert.equal(shown.at(-1), '');
	stream.delta('speak({"text":"Hi","lang":"en"})');
	assert.equal(shown.at(-1), 'Hi');
});

test('native tool calls are shown, spoken and saved before the state fence', () => {
	const { shown, spoken, sinks: s } = sinks();
	const stream = new TurnStream(true, s);
	stream.startRound();
	stream.delta(fence.trimStart());
	stream.toolCall('speak({"text":"Hola.","lang":"es"})');
	stream.endRound(fence.trimStart(), true);
	assert.equal(shown.at(-1), 'Hola.');
	assert.deepEqual(spoken, ['speak({"text":"Hola.","lang":"es"})']);
	assert.equal(stream.content, '\nspeak({"text":"Hola.","lang":"es"})\n' + fence.trimStart());
});

test('without a streaming session nothing is spoken', () => {
	const { shown, spoken, sinks: s } = sinks(false);
	const stream = new TurnStream(true, s);
	stream.startRound();
	stream.delta('Hello.');
	stream.toolCall('speak({"text":"Hi.","lang":"en"})');
	assert.deepEqual(spoken, []);
	assert.equal(shown.at(-1), 'Hello.Hi.');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { splitIntoSentences, stripForSpeech, splitIntoSegments } from './sentences.ts';

// --- splitIntoSentences ---

test('splits text at sentence-ending punctuation', () => {
	const text = 'Hello world. How are you? I am fine.';
	const result = splitIntoSentences(text);
	assert.deepEqual(result, ['Hello world.', 'How are you?', 'I am fine.']);
});

test('returns the whole text as one sentence when no boundary exists', () => {
	const text = 'Just one long sentence without terminator';
	const result = splitIntoSentences(text);
	assert.deepEqual(result, [text]);
});

test('returns empty array for whitespace-only input', () => {
	assert.deepEqual(splitIntoSentences('   '), []);
	assert.deepEqual(splitIntoSentences(''), []);
});

// --- stripForSpeech ---

test('strips fenced JSON blocks', () => {
	const text = 'Hello. ```json\n{"mood_change":{}}\n``` Goodbye.';
	const { cleaned } = stripForSpeech(text);
	assert.equal(cleaned, 'Hello. Goodbye.');
});

test('strips inline JSON state-update blocks', () => {
	const text = 'Hello. {"mood_change":{"emotion":"happy"}} Goodbye.';
	const { cleaned } = stripForSpeech(text);
	assert.equal(cleaned, 'Hello. Goodbye.');
});

test('strips state blocks with single-quoted keys (JS-style models)', () => {
	const text = "Hello. {'mood_change':{'emotion':'happy'}} Goodbye.";
	const { cleaned } = stripForSpeech(text);
	assert.equal(cleaned, 'Hello. Goodbye.');
});

test('strips fenced state blocks with a bare fence', () => {
	const text = 'Hello. ```\n{"mood_change":{}}\n``` Goodbye.';
	const { cleaned } = stripForSpeech(text);
	assert.equal(cleaned, 'Hello. Goodbye.');
});

test('strips dangling fences and leftover fence tokens at end of stream', () => {
	// No closing fence (stream cut): the fence token must vanish and the
	// state object must be stripped so no literal "json" is spoken.
	const text = 'Hello. ```json {"mood_change":{"emotion":"happy"}}';
	const { cleaned } = stripForSpeech(text);
	assert.equal(cleaned, 'Hello.');
});

test('strips inline code fences anywhere in the text', () => {
	const text = '```json {"energy_delta":1}``` and ``` more```';
	const { cleaned } = stripForSpeech(text);
	assert.equal(cleaned, 'and more');
});

test('removes markdown asterisks and arrows', () => {
	const text = 'This is *bold* and → there.';
	const { cleaned } = stripForSpeech(text);
	assert.equal(cleaned, 'This is bold and there.');
});

// --- splitIntoSegments ---

test('creates segments with default language', () => {
	const text = 'First sentence. Second sentence.';
	const segments = splitIntoSegments(text, 'de');
	assert.equal(segments.length, 2);
	assert.equal(segments[0].text, 'First sentence.');
	assert.equal(segments[0].language, 'de');
	assert.equal(segments[1].text, 'Second sentence.');
	assert.equal(segments[1].language, 'de');
});

test('returns empty array for empty text', () => {
	assert.deepEqual(splitIntoSegments('', 'en'), []);
});

// --- regressions caught while reviewing the multilingual TTS work ---

test('does not split inside decimals, URLs, or version numbers', () => {
	assert.deepEqual(splitIntoSentences('Pi is 3.14 exactly.'), ['Pi is 3.14 exactly.']);
	assert.deepEqual(splitIntoSentences('Visit example.com today.'), ['Visit example.com today.']);
	assert.deepEqual(splitIntoSentences('We shipped v0.13.1 yesterday.'), ['We shipped v0.13.1 yesterday.']);
});

test('splits after CJK sentence marks even without a following space', () => {
	assert.deepEqual(splitIntoSentences('こんにちは。元気ですか？'), ['こんにちは。', '元気ですか？']);
});

test('strips state blocks whose double-quoted strings contain apostrophes', () => {
	const text = `Sure thing! {"affection_delta": 1, "new_memory": "user's dog is named Rex"} That's all.`;
	const { cleaned, removed } = stripForSpeech(text);
	assert.equal(cleaned, "Sure thing! That's all.");
	assert.equal(removed.length, 1);
});

test('strips fenced JSON blocks even when they are not state updates', () => {
	const text = 'Here is the config: ```json\n{"port": 8080, "host": "localhost"}\n``` done.';
	const { cleaned } = stripForSpeech(text);
	assert.equal(cleaned, 'Here is the config: done.');
});

test('keeps domains and abbreviations whole but still spaces run-on sentences', () => {
	assert.equal(stripForSpeech('Visit utsuwa.ai or example.com now').cleaned, 'Visit utsuwa.ai or example.com now');
	assert.equal(stripForSpeech('Fruit, e.g. apples').cleaned, 'Fruit, e.g. apples');
	assert.equal(stripForSpeech('Hello.How are you?Fine,thanks').cleaned, 'Hello. How are you? Fine, thanks');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdvancedParams, buildMessages, withNativeContent } from './turn-context.ts';
import { DEFAULT_CONSCIOUSNESS_SETTINGS } from '../modules/settings.ts';

const image = { id: 'i1', mimeType: 'image/png', base64: 'AAAA', blob: new Blob() };

test('buildMessages drops empty turns and keeps prior turns as text', () => {
	const history = [
		{ role: 'user', content: 'Hi' },
		{ role: 'assistant', content: '' },
		{ role: 'assistant', content: 'Hello' },
		{ role: 'user', content: 'Look' }
	];
	assert.deepEqual(buildMessages(history, []), [
		{ role: 'user', content: 'Hi' },
		{ role: 'assistant', content: 'Hello' },
		{ role: 'user', content: 'Look' }
	]);
});

test('buildMessages attaches the images to the current turn only', () => {
	const messages = buildMessages([{ role: 'user', content: 'Earlier' }, { role: 'user', content: 'Look', images: [{}] }], [image]);
	assert.deepEqual(messages, [
		{ role: 'user', content: 'Earlier' },
		{ role: 'user', content: [{ type: 'text', text: 'Look' }, { type: 'image', mimeType: 'image/png', data: 'AAAA' }] }
	]);
});

test('buildMessages keeps an image-only turn and skips its empty text part', () => {
	assert.deepEqual(buildMessages([{ role: 'user', content: '', images: [{}] }], [image]), [
		{ role: 'user', content: [{ type: 'image', mimeType: 'image/png', data: 'AAAA' }] }
	]);
});

test('withNativeContent inserts native dialogue before the state fence', () => {
	const fence = '```json\n{}\n```';
	assert.equal(withNativeContent(`Text ${fence}`, 'speak()\n'), `Text \nspeak()\n${fence}`);
	assert.equal(withNativeContent('Text', 'speak()\n'), 'Text\nspeak()\n');
	assert.equal(withNativeContent('Text', ''), 'Text');
});

test('buildAdvancedParams only sends sampling fields to custom endpoints', () => {
	const settings = { ...DEFAULT_CONSCIOUSNESS_SETTINGS, temperature: 0.4, topP: 0.9, maxTokens: 512, presencePenalty: 0.1, frequencyPenalty: 0.2 };
	assert.deepEqual(buildAdvancedParams(false, settings), {});
	assert.deepEqual(buildAdvancedParams(undefined, settings), {});
	assert.deepEqual(buildAdvancedParams(true, settings), {
		temperature: 0.4, topP: 0.9, maxTokens: 512, presencePenalty: 0.1, frequencyPenalty: 0.2
	});
	assert.equal(buildAdvancedParams(true, { ...settings, maxTokens: 0 }).maxTokens, undefined);
});

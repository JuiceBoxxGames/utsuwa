import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdvancedParams, buildMessages, describeImagesRequest, withNativeContent } from './turn-context.ts';
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

test('a described turn sends the description as text and no image bytes', () => {
	const messages = buildMessages(
		[{ role: 'user', content: 'Earlier' }, { role: 'user', content: 'Look at him', images: [{}] }],
		[image],
		'A scruffy terrier asleep on a red couch.'
	);
	assert.deepEqual(messages, [
		{ role: 'user', content: 'Earlier' },
		{ role: 'user', content: 'Look at him\n\n[They showed you an image. What it shows: A scruffy terrier asleep on a red couch.]' }
	]);
});

test('a described image-only turn still sends text, and counts several images', () => {
	assert.deepEqual(buildMessages([{ role: 'user', content: '', images: [{}, {}] }], [image, image], '1. A cat. 2. A dog.'), [
		{ role: 'user', content: '[They showed you 2 images. What they show: 1. A cat. 2. A dog.]' }
	]);
});

test('a reasoning vision model keeps its thinking out of the description', () => {
	assert.deepEqual(buildMessages([{ role: 'user', content: 'Hi', images: [{}] }], [image], '<think>hmm, a cat?</think>\nA grey cat.'), [
		{ role: 'user', content: 'Hi\n\n[They showed you an image. What it shows: A grey cat.]' }
	]);
});

test('the vision request carries every image and the message for context', () => {
	const { system, content } = describeImagesRequest('Is he cute?', [image, image]);
	assert.match(system, /describe/i);
	assert.deepEqual(content, [
		{ type: 'text', text: 'Their message, for context: Is he cute?' },
		{ type: 'image', mimeType: 'image/png', data: 'AAAA' },
		{ type: 'image', mimeType: 'image/png', data: 'AAAA' }
	]);
	assert.deepEqual(describeImagesRequest('  ', [image]).content[0], { type: 'text', text: 'Describe the image.' });
	assert.deepEqual(describeImagesRequest('', [image, image]).content[0], { type: 'text', text: 'Describe the images.' });
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

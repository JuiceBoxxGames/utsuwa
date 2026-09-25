import test from 'node:test';
import assert from 'node:assert/strict';

import {
	hasImages,
	toOpenAIContent,
	toAnthropicContent,
	type MessageContent
} from './content.ts';

const mixed: MessageContent = [
	{ type: 'text', text: 'look at this' },
	{ type: 'image', mimeType: 'image/png', data: 'AAAA' }
];

test('hasImages detects image parts', () => {
	assert.equal(hasImages('just text'), false);
	assert.equal(hasImages([{ type: 'text', text: 'x' }]), false);
	assert.equal(hasImages(mixed), true);
});

test('toOpenAIContent builds image_url data URLs', () => {
	assert.equal(toOpenAIContent('hello'), 'hello');
	assert.deepEqual(toOpenAIContent(mixed), [
		{ type: 'text', text: 'look at this' },
		{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }
	]);
});

test('toAnthropicContent builds base64 source blocks', () => {
	assert.equal(toAnthropicContent('hello'), 'hello');
	assert.deepEqual(toAnthropicContent(mixed), [
		{ type: 'text', text: 'look at this' },
		{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }
	]);
});

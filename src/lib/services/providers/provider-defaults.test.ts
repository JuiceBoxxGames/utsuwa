import test from 'node:test';
import assert from 'node:assert/strict';

import { CHAT_MODEL_FILTERS } from './provider-defaults.ts';

const keeps = (provider: string, id: string) => CHAT_MODEL_FILTERS[provider].test(id);

test('DeepSeek keeps every current chat model, not just the retired names', () => {
	assert.equal(keeps('deepseek', 'deepseek-flash'), true);
	assert.equal(keeps('deepseek', 'deepseek-v4-pro'), true);
	assert.equal(keeps('deepseek', 'deepseek-chat'), true);
	assert.equal(keeps('deepseek', 'deepseek-reasoner'), true);
});

test('cloud filters still drop non-chat models', () => {
	assert.equal(keeps('openai', 'gpt-4o'), true);
	assert.equal(keeps('openai', 'text-embedding-3-small'), false);
	assert.equal(keeps('openai', 'whisper-1'), false);
	assert.equal(keeps('google', 'gemini-2.5-flash'), true);
	assert.equal(keeps('google', 'embedding-001'), false);
});

test('OpenAI keeps bare reasoning ids and drops non-chat gpt- models', () => {
	for (const id of ['gpt-5', 'gpt-4.1', 'o1', 'o3', 'o3-mini', 'o4-mini', 'chatgpt-4o-latest']) {
		assert.equal(keeps('openai', id), true, id);
	}
	for (const id of [
		'gpt-image-1',
		'gpt-4o-mini-tts',
		'gpt-4o-transcribe',
		'gpt-realtime',
		'gpt-audio',
		'gpt-4o-search-preview',
		'chatgpt-image-latest'
	]) {
		assert.equal(keeps('openai', id), false, id);
	}
});

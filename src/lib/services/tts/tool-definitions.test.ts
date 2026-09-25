import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpeechTools, parseToolCall } from './tool-definitions.ts';

test('parseToolCall parses valid speak call', () => {
	const result = parseToolCall({ name: 'speak', arguments: { text: 'Hello', lang: 'de' } });
	assert.ok(result);
	assert.equal(result?.name, 'speak');
	assert.equal(result?.arguments.text, 'Hello');
	assert.equal(result?.arguments.lang, 'de');
});

test('parseToolCall omits invalid lang', () => {
	const result = parseToolCall({ name: 'speak', arguments: { text: 'Hello', lang: 'x' } });
	assert.ok(result);
	assert.equal(result?.arguments.lang, undefined);
});

test('parseToolCall clamps pause ms', () => {
	const result = parseToolCall({ name: 'pause', arguments: { ms: 50 } });
	assert.equal(result?.arguments.ms, 100);
	const result2 = parseToolCall({ name: 'pause', arguments: { ms: 8000 } });
	assert.equal(result2?.arguments.ms, 5000);
});

test('parseToolCall discards unknown gesture types', () => {
	assert.equal(parseToolCall({ name: 'gesture', arguments: { type: 'cry' } }), null);
});

test('parseToolCall returns null for unknown tools', () => {
	assert.equal(parseToolCall({ name: 'unknown', arguments: {} }), null);
});

test('parseToolCall accepts valid gesture types', () => {
	const result = parseToolCall({ name: 'gesture', arguments: { type: 'smile' } });
	assert.ok(result);
	assert.equal(result?.arguments.type, 'smile');
});
test('parseToolCall normalizes gesture type to lowercase', () => {
	const result = parseToolCall({ name: 'gesture', arguments: { type: 'Smile' } });
	assert.ok(result);
	assert.equal(result?.arguments.type, 'smile');
});

test('parseToolCall normalizes speak lang to lowercase', () => {
	const result = parseToolCall({ name: 'speak', arguments: { text: 'Hello', lang: 'DE' } });
	assert.ok(result);
	assert.equal(result?.arguments.lang, 'de');
});

test('parseToolCall accepts long language tags like zh-Hans', () => {
	const result = parseToolCall({
		name: 'speak',
		arguments: { text: '你好', lang: 'zh-Hans' }
	});
	assert.ok(result);
	assert.equal(result?.arguments.lang, 'zh-hans');
});

const toolSpeech = { activeProvider: 'omnivoice', activeLanguage: 'en', altLanguage: 'es', enableAltLanguage: true, enableToolCalling: true };

test('buildSpeechTools offers speak, pause and gesture with the configured languages', () => {
	const tools = buildSpeechTools('openai', true, toolSpeech);
	assert.deepEqual(tools?.map((t) => t.function.name), ['speak_segment', 'pause_segment', 'gesture_segment']);
	const speak = tools?.[0].function.parameters as { properties: { language: { enum: string[] } }; required: string[] };
	assert.deepEqual(speak.properties.language.enum, ['en', 'es']);
	assert.deepEqual(speak.required, ['text', 'language']);
	assert.deepEqual(buildSpeechTools('openai', true, { ...toolSpeech, altLanguage: '' })?.[0].function.parameters,
		{ ...tools?.[0].function.parameters, properties: { ...speak.properties, language: { ...speak.properties.language, enum: ['en'] } } });
});

test('buildSpeechTools is undefined whenever speech tools are off', () => {
	assert.equal(buildSpeechTools('anthropic', true, toolSpeech), undefined);
	assert.equal(buildSpeechTools('openai', false, toolSpeech), undefined);
	assert.equal(buildSpeechTools('openai', true, { ...toolSpeech, activeProvider: 'openai-tts' }), undefined);
	assert.equal(buildSpeechTools('openai', true, { ...toolSpeech, enableAltLanguage: false }), undefined);
	assert.equal(buildSpeechTools('openai', true, { ...toolSpeech, enableToolCalling: false }), undefined);
});

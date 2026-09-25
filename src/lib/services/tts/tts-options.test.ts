import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpeechToolLanguages, buildTTSOptions } from './tts-options.ts';
import { DEFAULT_SPEECH_SETTINGS, type SpeechSettings } from '../modules/settings.ts';

const speech: SpeechSettings = {
	...DEFAULT_SPEECH_SETTINGS,
	activeProvider: 'omnivoice',
	activeVoiceId: 'v1',
	activeModel: 'm1',
	activeLanguage: 'en',
	altLanguage: 'ja',
	altVoiceId: 'v2',
	enableAltLanguage: true,
	instructions: 'warm',
	altInstructions: 'bright',
	speed: 1.1,
	altSpeed: 0.9
};

test('buildTTSOptions maps the shared fields and prefers saved values', () => {
	const options = buildTTSOptions({ ...speech, activeProvider: 'openai-tts' }, 'openai-tts',
		{ apiKey: 'k', baseUrl: 'https://tts.example/v1', modelId: 'config-model' },
		{ defaultBaseUrl: 'https://default.example' });
	assert.deepEqual(options, {
		provider: 'openai-tts',
		apiKey: 'k',
		voiceId: 'v1',
		model: 'm1',
		baseUrl: 'https://tts.example/v1',
		speed: 1.1,
		language: 'en',
		altLanguage: 'ja',
		altVoiceId: 'v2',
		enableAltLanguage: true,
		altSpeed: 0.9
	});
});

test('buildTTSOptions falls back to the config model, default base URL and unset voice', () => {
	const options = buildTTSOptions({ ...speech, activeVoiceId: '', activeModel: '', activeLanguage: '', altLanguage: '', altVoiceId: '' },
		'openai-tts', { modelId: 'config-model' }, { defaultBaseUrl: 'https://default.example' });
	assert.equal(options.voiceId, undefined);
	assert.equal(options.model, 'config-model');
	assert.equal(options.baseUrl, 'https://default.example');
	assert.equal(options.language, undefined);
	assert.equal(options.altLanguage, undefined);
	assert.equal(options.altVoiceId, undefined);
	assert.equal(options.apiKey, undefined);
	assert.equal(buildTTSOptions(speech, 'openai-tts', {}, undefined).baseUrl, undefined);
});

test('buildTTSOptions leaves the OmniVoice fields off other providers', () => {
	const options = buildTTSOptions(speech, 'elevenlabs', {}, undefined);
	for (const key of ['instructions', 'altInstructions', 'numStep', 'altNumStep', 'positionTemperature',
		'classTemperature', 'altPositionTemperature', 'altClassTemperature']) {
		assert.equal(key in options, false, key);
	}
});

test('buildTTSOptions adds the OmniVoice synthesis fields', () => {
	const options = buildTTSOptions({ ...speech, altInstructions: '' }, 'omnivoice', {}, undefined);
	assert.equal(options.instructions, 'warm');
	assert.equal(options.altInstructions, undefined);
	assert.equal(options.numStep, 32);
	assert.equal(options.altNumStep, 32);
	assert.equal(options.positionTemperature, 1);
	assert.equal(options.classTemperature, 0.2);
	assert.equal(options.altPositionTemperature, 1);
	assert.equal(options.altClassTemperature, 0.2);
	assert.equal(options.voiceId, 'v1');
});

test('buildSpeechToolLanguages lowercases and dedupes primary and alt', () => {
	assert.deepEqual(buildSpeechToolLanguages({ activeLanguage: 'EN', altLanguage: 'zh-Hans' }), ['en', 'zh-hans']);
	assert.deepEqual(buildSpeechToolLanguages({ activeLanguage: 'ja', altLanguage: 'JA' }), ['ja']);
});

test('buildSpeechToolLanguages defaults the primary to en and drops an empty alt', () => {
	assert.deepEqual(buildSpeechToolLanguages({ activeLanguage: '', altLanguage: '' }), ['en']);
	assert.deepEqual(buildSpeechToolLanguages({ activeLanguage: 'de', altLanguage: '' }), ['de']);
});

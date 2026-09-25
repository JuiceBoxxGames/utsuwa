import test from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULT_CONSCIOUSNESS_SETTINGS,
	DEFAULT_SPEECH_SETTINGS,
	withModuleDefaults
} from './settings.ts';

// What initDefaultState wrote on a fresh install before the typed settings,
// so the persisted JSON for new users stays byte-for-byte the same.
test('defaults match the keys fresh installs already store', () => {
	assert.deepEqual(DEFAULT_CONSCIOUSNESS_SETTINGS, {
		activeProvider: '',
		temperature: 0.7,
		topP: 1,
		presencePenalty: 0,
		frequencyPenalty: 0
	});
	assert.deepEqual(DEFAULT_SPEECH_SETTINGS, {
		activeProvider: '',
		activeLanguage: 'en',
		enableAltLanguage: false,
		enableToolCalling: true,
		altLanguage: '',
		altVoiceId: '',
		altInstructions: '',
		altSpeed: 1,
		altNumStep: 32,
		altPositionTemperature: 1,
		altClassTemperature: 0.2,
		speed: 1,
		numStep: 32,
		positionTemperature: 1,
		classTemperature: 0.2
	});
});

test('a saved subset is filled in from the defaults', () => {
	const merged = withModuleDefaults('speech', { activeProvider: 'omnivoice', speed: 1.4 });
	assert.deepEqual(merged, { ...DEFAULT_SPEECH_SETTINGS, activeProvider: 'omnivoice', speed: 1.4 });
});

test('unknown saved keys survive the merge', () => {
	const merged = withModuleDefaults('consciousness', { legacyFlag: 'keep me', activeModel: 'gpt-4o' });
	assert.equal(merged.legacyFlag, 'keep me');
	assert.equal(merged.activeModel, 'gpt-4o');
	assert.equal(merged.temperature, 0.7);
});

test('saved falsy values win over the defaults', () => {
	const llm = withModuleDefaults('consciousness', { temperature: 0, topP: 0, activeProvider: '' });
	assert.equal(llm.temperature, 0);
	assert.equal(llm.topP, 0);
	const speech = withModuleDefaults('speech', { enableToolCalling: false, activeLanguage: '', numStep: 0 });
	assert.equal(speech.enableToolCalling, false);
	assert.equal(speech.activeLanguage, '');
	assert.equal(speech.numStep, 0);
});

test('nothing saved gives a copy of the defaults', () => {
	const merged = withModuleDefaults('speech', undefined);
	assert.deepEqual(merged, DEFAULT_SPEECH_SETTINGS);
	assert.notEqual(merged, DEFAULT_SPEECH_SETTINGS);
});

test('modules without typed defaults pass through untouched', () => {
	assert.deepEqual(withModuleDefaults('something-else', { a: 1 }), { a: 1 });
	assert.deepEqual(withModuleDefaults('something-else', undefined), {});
});

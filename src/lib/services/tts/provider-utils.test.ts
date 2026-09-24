import test from 'node:test';
import assert from 'node:assert/strict';

import {
	defaultVoiceForProvider,
	legacyVoiceToAdopt,
	providerErrorMessage,
	shouldProxyLocalTts
} from './provider-utils.ts';

// --- defaultVoiceForProvider ---

test('returns the first declared voice for a provider', () => {
	const provider = { voices: [{ id: '21m00Tcm4TlvDq8ikWAM' }, { id: 'EXAVITQu4vr4xnSDxMaL' }] };
	assert.equal(defaultVoiceForProvider(provider), '21m00Tcm4TlvDq8ikWAM');
});

test('returns empty for providers without declared voices, so the provider default applies', () => {
	assert.equal(defaultVoiceForProvider({}), '');
	assert.equal(defaultVoiceForProvider({ voices: [] }), '');
	assert.equal(defaultVoiceForProvider(undefined), '');
	assert.equal(defaultVoiceForProvider(null), '');
});

// --- providerErrorMessage ---

test('extracts the ElevenLabs detail shape', () => {
	const body = {
		detail: { type: 'not_found', code: 'voice_not_found', message: "A voice with voice_id 'af_bella' was not found.", status: 'voice_not_found' }
	};
	assert.equal(
		providerErrorMessage('ElevenLabs', 404, body),
		"ElevenLabs error 404: A voice with voice_id 'af_bella' was not found."
	);
});

test('extracts the OpenAI error shape', () => {
	const body = { error: { message: 'Invalid voice: bella-af', type: 'invalid_request_error' } };
	assert.equal(providerErrorMessage('OpenAI TTS', 400, body), 'OpenAI TTS error 400: Invalid voice: bella-af');
});

test('falls back to a generic message field, a string body, or status only', () => {
	assert.equal(providerErrorMessage('TTS', 500, { message: 'boom' }), 'TTS error 500: boom');
	assert.equal(providerErrorMessage('TTS', 502, 'Bad gateway'), 'TTS error 502: Bad gateway');
	assert.equal(providerErrorMessage('TTS', 429), 'TTS error 429');
	assert.equal(providerErrorMessage('TTS', 401, {}), 'TTS error 401');
});

test('long details are truncated so toasts stay readable', () => {
	const message = providerErrorMessage('TTS', 400, { message: 'x'.repeat(500) });
	assert.ok(message.length <= 'TTS error 400: '.length + 160);
});

// --- legacy ElevenLabs custom voice migration ---

const elevenlabs = { voices: [{ id: '21m00Tcm4TlvDq8ikWAM' }, { id: 'EXAVITQu4vr4xnSDxMaL' }] };

test('adopts the legacy custom voice when the active voice is still the provider default', () => {
	assert.equal(legacyVoiceToAdopt('elevenlabs', '21m00Tcm4TlvDq8ikWAM', 'tnVKC6NjwhdRxoQIfKue', elevenlabs), 'tnVKC6NjwhdRxoQIfKue');
});

test('adopts the legacy custom voice when no active voice is set', () => {
	assert.equal(legacyVoiceToAdopt('elevenlabs', '', 'tnVKC6NjwhdRxoQIfKue', elevenlabs), 'tnVKC6NjwhdRxoQIfKue');
	assert.equal(legacyVoiceToAdopt('elevenlabs', undefined, 'tnVKC6NjwhdRxoQIfKue', elevenlabs), 'tnVKC6NjwhdRxoQIfKue');
});

test('leaves a voice the user picked on purpose alone', () => {
	assert.equal(legacyVoiceToAdopt('elevenlabs', 'EXAVITQu4vr4xnSDxMaL', 'tnVKC6NjwhdRxoQIfKue', elevenlabs), null);
	assert.equal(legacyVoiceToAdopt('elevenlabs', 'someOtherCustomId', 'tnVKC6NjwhdRxoQIfKue', elevenlabs), null);
});

test('never carries an ElevenLabs voice onto another provider', () => {
	assert.equal(legacyVoiceToAdopt('openai', '', 'tnVKC6NjwhdRxoQIfKue', elevenlabs), null);
	assert.equal(legacyVoiceToAdopt(undefined, '', 'tnVKC6NjwhdRxoQIfKue', elevenlabs), null);
});

test('nothing to adopt when the legacy slot is empty or whitespace', () => {
	assert.equal(legacyVoiceToAdopt('elevenlabs', '', '', elevenlabs), null);
	assert.equal(legacyVoiceToAdopt('elevenlabs', '', '   ', elevenlabs), null);
	assert.equal(legacyVoiceToAdopt('elevenlabs', '', undefined, elevenlabs), null);
});

// --- shouldProxyLocalTts ---

test('proxies a local web request that failed at the network layer', () => {
	assert.equal(shouldProxyLocalTts({ isLocal: true, isTauri: false, directFailedAtNetwork: true }), true);
});

test('never proxies cloud providers, desktop builds, or aborted requests', () => {
	assert.equal(shouldProxyLocalTts({ isLocal: false, isTauri: false, directFailedAtNetwork: true }), false);
	assert.equal(shouldProxyLocalTts({ isLocal: true, isTauri: true, directFailedAtNetwork: true }), false);
	assert.equal(shouldProxyLocalTts({ isLocal: true, isTauri: false, directFailedAtNetwork: false }), false);
});

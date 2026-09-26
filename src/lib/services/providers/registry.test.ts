import test from 'node:test';
import assert from 'node:assert/strict';

import { LLM_PROVIDERS, TTS_PROVIDERS, getTTSProvider, providerSupportsVision, visionDependsOnModel } from './registry.ts';

test('local LLM providers rely on discovered installed models', () => {
	const localProviders = LLM_PROVIDERS.filter((provider) => provider.isLocal);

	assert.ok(localProviders.length > 0);
	for (const provider of localProviders) {
		assert.deepEqual(provider.models ?? [], [], `${provider.name} should not expose static model choices`);
	}
});

test('local TTS provider is keyless, local, and ships fallback voices', () => {
	const localTTS = getTTSProvider('local-tts');

	assert.ok(localTTS, 'local-tts should be registered');
	assert.equal(localTTS?.isLocal, true);
	assert.equal(localTTS?.requiresApiKey, false);
	assert.ok((localTTS?.voices?.length ?? 0) > 0, 'local-tts should seed voices for offline use');
});

test('OmniVoice provider is registered as keyless local proxy with preset voices', () => {
	const omnivoice = getTTSProvider('omnivoice');

	assert.ok(omnivoice, 'omnivoice should be registered');
	assert.equal(omnivoice?.isLocal, true);
	assert.equal(omnivoice?.requiresApiKey, false);
	assert.equal(omnivoice?.defaultBaseUrl, 'http://localhost:8881/v1/');
	assert.ok((omnivoice?.voices?.length ?? 0) > 0, 'omnivoice should expose preset voices');
	assert.ok(omnivoice?.voices?.some((v) => v.id === 'alloy'), 'alloy preset should exist');
});

test('every TTS provider declares whether it needs an API key', () => {
	for (const provider of TTS_PROVIDERS) {
		assert.equal(typeof provider.requiresApiKey, 'boolean', `${provider.name} must declare requiresApiKey`);
	}
});

test('vision-capable cloud providers are flagged; text-only and local are not', () => {
	assert.equal(providerSupportsVision('openai'), true);
	assert.equal(providerSupportsVision('anthropic'), true);
	assert.equal(providerSupportsVision('google'), true);
	assert.equal(providerSupportsVision('xai'), true);
	assert.equal(providerSupportsVision('deepseek'), false);
	assert.equal(providerSupportsVision('ollama'), false);
	assert.equal(providerSupportsVision('lmstudio'), false);
});

test('local and custom endpoints leave vision to the model; fixed cloud providers do not', () => {
	assert.equal(visionDependsOnModel('ollama'), true);
	assert.equal(visionDependsOnModel('lmstudio'), true);
	// #237: aggregators behind the OpenAI-compatible provider can serve Gemini etc.
	assert.equal(visionDependsOnModel('openai-compatible'), true);
	assert.equal(visionDependsOnModel('openai'), false);
	assert.equal(visionDependsOnModel('deepseek'), false);
});

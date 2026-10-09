import test from 'node:test';
import assert from 'node:assert/strict';

import { addLMStudioVision, addOllamaVision, reportedVision, resolveVision, type VisionCheck } from './vision.ts';

const canShowImages = (check: VisionCheck) => resolveVision(check).capable;

const local = (modelId: string | undefined) => ({ providerHasVision: false, modelDecides: true, modelId });
const cloud = (modelId: string) => ({ providerHasVision: true, modelDecides: false, modelId });

test('local models are guessed from the name when the server says nothing', () => {
	assert.equal(canShowImages(local('llava:13b')), true);
	assert.equal(canShowImages(local('llama3.2-vision')), true);
	assert.equal(canShowImages(local('qwen2.5-vl-7b')), true);
	assert.equal(canShowImages(local('moondream')), true);
	assert.equal(canShowImages(local('gemma3:4b')), true);
	assert.equal(canShowImages(local('google/gemini-3.8-flash')), true);
	assert.equal(canShowImages(local('openai/o4-mini')), true);
	assert.equal(canShowImages(local('openai/o3-mini')), false);
	assert.equal(canShowImages(local('google/gemma-4-e4b')), true);
	assert.equal(canShowImages(local('llama3.1:8b')), false);
	assert.equal(canShowImages(local('mistral')), false);
	// gemma3 matches the hint but the 1b variant is text-only
	assert.equal(canShowImages(local('gemma3:1b')), false);
	assert.equal(canShowImages(local(undefined)), false);
	assert.equal(canShowImages(local('')), false);
});

test('cloud vision providers allow new models unless they are known text-only', () => {
	// Names no hint list ever had: new releases work on day one
	assert.equal(canShowImages(cloud('grok-5')), true);
	assert.equal(canShowImages(cloud('gpt-6-mini')), true);
	assert.equal(canShowImages(cloud('claude-opus-5-5')), true);
	assert.equal(canShowImages(cloud('gemini-4-pro')), true);

	assert.equal(canShowImages(cloud('gpt-3.5-turbo')), false);
	assert.equal(canShowImages(cloud('gpt-4')), false);
	assert.equal(canShowImages(cloud('gpt-4-0613')), false);
	assert.equal(canShowImages(cloud('gpt-4-1106-preview')), false);
	assert.equal(canShowImages(cloud('gpt-4-turbo')), true);
	assert.equal(canShowImages(cloud('gpt-4o')), true);
	assert.equal(canShowImages(cloud('o1-mini')), false);
	assert.equal(canShowImages(cloud('o3-mini')), false);
	assert.equal(canShowImages(cloud('o3')), true);
	assert.equal(canShowImages(cloud('grok-3-mini')), false);
	assert.equal(canShowImages(cloud('grok-code-fast-1')), false);
	assert.equal(canShowImages(cloud('grok-2-1212')), false);
	assert.equal(canShowImages(cloud('grok-2-vision-1212')), true);
});

test('DeepSeek only trusts Flash, since it drops images silently instead of erroring', () => {
	assert.equal(canShowImages(cloud('deepseek-flash')), true);
	assert.equal(canShowImages(cloud('deepseek-v4-pro')), false);
	assert.equal(canShowImages(cloud('deepseek-chat')), false);
	assert.equal(canShowImages(cloud('deepseek-reasoner')), false);
});

test('a provider that is neither vision nor model-decided never shows images', () => {
	assert.equal(canShowImages({ providerHasVision: false, modelDecides: false, modelId: 'gpt-4o' }), false);
});

test('what the server reports beats the name guess', () => {
	// Gemma 4 in LM Studio (#265): no hint matches, the server says yes
	assert.deepEqual(resolveVision({ ...local('google/gemma-4-e4b'), reported: true }), {
		capable: true,
		source: 'provider'
	});
	assert.deepEqual(resolveVision({ ...local('llava:13b'), reported: false }), {
		capable: false,
		source: 'provider'
	});
	assert.deepEqual(resolveVision(local('llava:13b')), { capable: true, source: 'name' });
});

test('the user override beats everything', () => {
	assert.deepEqual(resolveVision({ ...local('mistral'), reported: false, override: true }), {
		capable: true,
		source: 'you'
	});
	assert.deepEqual(resolveVision({ ...cloud('gpt-4o'), override: false }), {
		capable: false,
		source: 'you'
	});
});

test('reportedVision reads each server shape and stays quiet otherwise', () => {
	// Ollama /api/show
	assert.equal(reportedVision({ capabilities: ['completion', 'vision'] }), true);
	assert.equal(reportedVision({ capabilities: ['completion'] }), false);
	// LM Studio /api/v1/models
	assert.equal(reportedVision({ key: 'google/gemma-4-e4b', architecture: 'gemma4', capabilities: { vision: true } }), true);
	assert.equal(reportedVision({ key: 'deepseek-r1', capabilities: { vision: false } }), false);
	// OpenRouter-style /models
	assert.equal(reportedVision({ id: 'x', architecture: { input_modalities: ['text', 'image'] } }), true);
	assert.equal(reportedVision({ id: 'x', architecture: { input_modalities: ['text'] } }), false);
	// Plain OpenAI list entries and junk say nothing
	assert.equal(reportedVision({ id: 'gpt-4o', object: 'model' }), undefined);
	assert.equal(reportedVision({ capabilities: { tools: true } }), undefined);
	assert.equal(reportedVision(null), undefined);
	assert.equal(reportedVision('vision'), undefined);
});

test('addOllamaVision asks /api/show per model and survives failures', async () => {
	const calls: unknown[] = [];
	const shows: Record<string, unknown> = {
		'companion-eyes': { capabilities: ['completion', 'vision'] },
		'smollm:135m': { capabilities: ['completion'] }
	};
	const models = await addOllamaVision(
		[{ id: 'companion-eyes' }, { id: 'smollm:135m' }, { id: 'broken' }],
		async (path, body) => {
			calls.push([path, body]);
			const id = (body as { model: string }).model;
			if (!(id in shows)) throw new Error('HTTP 500');
			return shows[id];
		}
	);
	assert.deepEqual(models, [
		{ id: 'companion-eyes', vision: true },
		{ id: 'smollm:135m', vision: false },
		{ id: 'broken', vision: undefined }
	]);
	assert.deepEqual(calls[0], ['/api/show', { model: 'companion-eyes' }]);
});

test('addLMStudioVision matches native keys and leaves models alone when the API is missing', async () => {
	const models = [{ id: 'google/gemma-4-e4b' }, { id: 'deepseek-r1' }, { id: 'unlisted' }];
	const withVision = await addLMStudioVision(models, async (path) => {
		assert.equal(path, '/api/v1/models');
		return {
			models: [
				{ key: 'google/gemma-4-e4b', capabilities: { vision: true } },
				{ key: 'deepseek-r1', capabilities: { vision: false } }
			]
		};
	});
	assert.deepEqual(withVision, [
		{ id: 'google/gemma-4-e4b', vision: true },
		{ id: 'deepseek-r1', vision: false },
		{ id: 'unlisted', vision: undefined }
	]);

	// Older LM Studio without /api/v1
	const untouched = await addLMStudioVision(models, async () => {
		throw new Error('HTTP 404');
	});
	assert.deepEqual(untouched, models);
});

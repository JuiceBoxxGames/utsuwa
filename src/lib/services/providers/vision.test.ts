import test from 'node:test';
import assert from 'node:assert/strict';

import { modelSupportsVision, canShowImages } from './vision.ts';

test('model heuristic catches vision models and rejects text-only ones', () => {
	assert.equal(modelSupportsVision('llava:13b'), true);
	assert.equal(modelSupportsVision('llama3.2-vision'), true);
	assert.equal(modelSupportsVision('qwen2.5-vl-7b'), true);
	assert.equal(modelSupportsVision('moondream'), true);
	assert.equal(modelSupportsVision('gpt-4o'), true);
	assert.equal(modelSupportsVision('gemma3:4b'), true);
	// Current Claude models are all vision-capable, incl. Haiku 4.x which the
	// hints previously missed ("claude-4" is not a substring of "claude-haiku-4-5")
	assert.equal(modelSupportsVision('claude-haiku-4-5-20251001'), true);
	assert.equal(modelSupportsVision('claude-sonnet-4-6'), true);
	assert.equal(modelSupportsVision('claude-opus-4-8'), true);
	assert.equal(modelSupportsVision('claude-3-5-haiku-latest'), true);
	// Aggregators often prefix the vendor
	assert.equal(modelSupportsVision('google/gemini-3.8-flash'), true);
	assert.equal(modelSupportsVision('llama3.1:8b'), false);
	assert.equal(modelSupportsVision('mistral'), false);
	assert.equal(modelSupportsVision('gpt-3.5-turbo'), false);
	// gemma3 matches the hint but the 1b variant is text-only
	assert.equal(modelSupportsVision('gemma3:1b'), false);
	assert.equal(modelSupportsVision(undefined), false);
	assert.equal(modelSupportsVision(''), false);
});

test('canShowImages needs a vision-capable model on a vision/local provider', () => {
	// Cloud vision provider + vision model
	assert.equal(canShowImages(true, false, 'gpt-4o'), true);
	// Cloud vision provider + text model -> prompt
	assert.equal(canShowImages(true, false, 'gpt-3.5-turbo'), false);
	// Local provider + vision model
	assert.equal(canShowImages(false, true, 'llava:13b'), true);
	// Local provider + text model -> prompt
	assert.equal(canShowImages(false, true, 'gemma3:1b'), false);
	// Non-vision, non-local provider (e.g. DeepSeek) -> never
	assert.equal(canShowImages(false, false, 'gpt-4o'), false);
});

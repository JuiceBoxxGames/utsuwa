import test from 'node:test';
import assert from 'node:assert/strict';

import { providerBodyMessage, sanitizeProviderError } from './provider-errors.ts';

test('the provider message is pulled out of the common error body shapes', () => {
	assert.equal(providerBodyMessage(401, '{"error":{"message":"Invalid API key provided"}}'), 'Invalid API key provided');
	assert.equal(providerBodyMessage(401, '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'), 'invalid x-api-key');
	// Gemini's OpenAI endpoint wraps the error in an array
	assert.equal(providerBodyMessage(429, '[{"error":{"code":429,"message":"Resource exhausted"}}]'), 'Resource exhausted');
	assert.equal(providerBodyMessage(400, '{"error":"model not found"}'), 'model not found');
	assert.equal(providerBodyMessage(503, '{"message":"Service unavailable"}'), 'Service unavailable');
	assert.equal(providerBodyMessage(500, 'not json'), 'Provider error (500)');
	assert.equal(providerBodyMessage(500, '{"error":{}}'), 'Provider error (500)');
});

test('xsai remote errors read like direct ones instead of raw JSON', () => {
	assert.equal(
		sanitizeProviderError('Remote sent 401 response: {"error":{"message":"Invalid API key provided"}}'),
		'Invalid API key provided'
	);
	assert.equal(sanitizeProviderError('Remote sent 502 response: '), 'Provider error (502)');
	assert.match(
		sanitizeProviderError('Remote sent 404 response: <!DOCTYPE html><html>', 'https://example.com/v1'),
		/example\.com.*returned a web page/
	);
	// Anything else passes through as before
	assert.equal(sanitizeProviderError('Provider request timed out'), 'Provider request timed out');
});

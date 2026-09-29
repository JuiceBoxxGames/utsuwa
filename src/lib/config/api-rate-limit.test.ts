import test from 'node:test';
import assert from 'node:assert/strict';

import { apiRateLimited, type RateLimiter } from './api-rate-limit.ts';

const request = (path: string, ip = '203.0.113.7') =>
	new Request(`https://app.utsuwa.ai${path}`, { method: 'POST', headers: { 'cf-connecting-ip': ip } });

const limiter = (allow: boolean) => {
	const keys: string[] = [];
	const binding: RateLimiter = {
		limit: async ({ key }) => {
			keys.push(key);
			return { success: allow };
		}
	};
	return { binding, keys };
};

test('API requests under the limit pass, counted per client IP', async () => {
	const { binding, keys } = limiter(true);
	assert.equal(await apiRateLimited(request('/api/chat'), binding), undefined);
	assert.deepEqual(keys, ['203.0.113.7']);
});

test('API requests over the limit get a final 429 the client will not retry', async () => {
	const { binding } = limiter(false);
	const res = await apiRateLimited(request('/api/tts/fish-audio'), binding);
	assert.equal(res?.status, 429);
	assert.equal(res?.headers.get('Retry-After'), '60');
	const body = await res?.json();
	assert.match(body.error, /too many requests/i);
	assert.notEqual(body.transient, true);
});

test('pages and assets are never counted', async () => {
	const { binding, keys } = limiter(false);
	for (const path of ['/', '/app', '/docs/api/overview', '/_app/env.js']) {
		assert.equal(await apiRateLimited(request(path), binding), undefined);
	}
	assert.deepEqual(keys, []);
});

// Self-hosted Node and local dev have no binding; a limiter outage shouldn't take chat down
test('no binding or a failing limiter lets the request through', async () => {
	assert.equal(await apiRateLimited(request('/api/chat'), undefined), undefined);
	const broken: RateLimiter = { limit: async () => { throw new Error('limiter unavailable'); } };
	assert.equal(await apiRateLimited(request('/api/chat'), broken), undefined);
});

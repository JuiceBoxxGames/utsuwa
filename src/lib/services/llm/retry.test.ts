import test from 'node:test';
import assert from 'node:assert/strict';

import {
	ProviderError,
	isTransientStatus,
	parseRetryAfter,
	providerFailure,
	retryDelay,
	withRetry
} from './retry.ts';

test('only rate limits, timeouts and server errors are transient', () => {
	for (const status of [408, 429, 500, 502, 503, 504, 529]) assert.equal(isTransientStatus(status), true, String(status));
	for (const status of [400, 401, 403, 404, 413, 422]) assert.equal(isTransientStatus(status), false, String(status));
});

test('Retry-After accepts seconds or an HTTP date', () => {
	const now = Date.parse('2026-09-25T12:00:00Z');
	assert.equal(parseRetryAfter('3', now), 3000);
	assert.equal(parseRetryAfter('0', now), 0);
	assert.equal(parseRetryAfter('1.5', now), 1500);
	assert.equal(parseRetryAfter('Fri, 25 Sep 2026 12:00:05 GMT', now), 5000);
	// A date already in the past means "now"
	assert.equal(parseRetryAfter('Fri, 25 Sep 2026 11:00:00 GMT', now), 0);
	assert.equal(parseRetryAfter(null, now), undefined);
	assert.equal(parseRetryAfter('soon', now), undefined);
	assert.equal(parseRetryAfter('-2', now), undefined);
});

test('two retries with backoff, Retry-After wins when it is short', () => {
	const busy = new ProviderError('busy', true);
	assert.equal(retryDelay(busy, 0), 2000);
	assert.equal(retryDelay(busy, 1), 4000);
	assert.equal(retryDelay(busy, 2), null);
	assert.equal(retryDelay(new ProviderError('slow down', true, 7000), 0), 7000);
	// A long wait (quota resets) fails right away instead of sitting silent
	assert.equal(retryDelay(new ProviderError('quota', true, 3_600_000), 0), null);
	assert.equal(retryDelay(new ProviderError('bad key', false), 0), null);
	assert.equal(retryDelay(new Error('plain'), 0), null);
});

test('providerFailure reads status and Retry-After off an xsai error response', () => {
	const rateLimited = Object.assign(new Error('Remote sent 429 response'), {
		response: new Response('', { status: 429, headers: { 'retry-after': '4' } })
	});
	assert.deepEqual(providerFailure(rateLimited), { transient: true, retryAfterMs: 4000 });
	const badKey = Object.assign(new Error('Remote sent 401 response'), { response: new Response('', { status: 401 }) });
	assert.deepEqual(providerFailure(badKey), { transient: false, retryAfterMs: undefined });
	// fetch itself failing is a network blip; anything else is not ours to retry
	assert.deepEqual(providerFailure(new TypeError('fetch failed')), { transient: true });
	assert.deepEqual(providerFailure(new Error('Provider answered with a redirect')), { transient: false });
});

test('withRetry retries transient failures, then gives up with the last error', async () => {
	const waits: number[] = [];
	let calls = 0;
	const result = await withRetry(
		async () => {
			if (++calls < 3) throw new ProviderError('busy', true, 0);
			return 'ok';
		},
		{ onRetry: (attempt, delayMs) => waits.push(attempt, delayMs) }
	);
	assert.equal(result, 'ok');
	assert.deepEqual(waits, [1, 0, 2, 0]);

	calls = 0;
	await assert.rejects(
		withRetry(async () => {
			calls++;
			throw new ProviderError(`busy ${calls}`, true, 0);
		}, {}),
		/busy 3/
	);
	assert.equal(calls, 3);
});

test('withRetry never retries permanent errors or once output has started', async () => {
	let calls = 0;
	await assert.rejects(
		withRetry(async () => {
			calls++;
			throw new ProviderError('bad key', false);
		}, {}),
		/bad key/
	);
	assert.equal(calls, 1);

	calls = 0;
	await assert.rejects(
		withRetry(
			async () => {
				calls++;
				throw new ProviderError('dropped mid-reply', true, 0);
			},
			{ canRetry: () => false }
		),
		/dropped mid-reply/
	);
	assert.equal(calls, 1);
});

test('stopping during the backoff wait cancels the retry', async () => {
	const controller = new AbortController();
	let calls = 0;
	const run = withRetry(
		async () => {
			calls++;
			throw new ProviderError('busy', true);
		},
		{ signal: controller.signal, onRetry: () => controller.abort(new Error('Stopped')) }
	);
	await assert.rejects(run, /Stopped/);
	assert.equal(calls, 1);
});

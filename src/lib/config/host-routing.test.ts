import test from 'node:test';
import assert from 'node:assert/strict';

import { routeByHost } from './host-routing.ts';

const route = (href: string) => {
	const result = routeByHost(new URL(href));
	if (!result) return undefined;
	return 'redirect' in result ? { redirect: result.redirect.href } : { rewrite: result.rewrite.href };
};

test('apex /docs and /app redirect to their subdomains, keeping path and query', () => {
	assert.deepEqual(route('https://utsuwa.ai/docs'), { redirect: 'https://docs.utsuwa.ai/' });
	assert.deepEqual(route('https://utsuwa.ai/docs/guides/voice?q=1'), { redirect: 'https://docs.utsuwa.ai/guides/voice?q=1' });
	assert.deepEqual(route('https://utsuwa.ai/app'), { redirect: 'https://app.utsuwa.ai/' });
	assert.deepEqual(route('https://utsuwa.ai/app/settings'), { redirect: 'https://app.utsuwa.ai/settings' });
});

test('apex paths that only share a prefix are left alone', () => {
	assert.equal(route('https://utsuwa.ai/'), undefined);
	assert.equal(route('https://utsuwa.ai/docs-archive'), undefined);
	assert.equal(route('https://utsuwa.ai/api/chat'), undefined);
	assert.equal(route('https://utsuwa.ai/blog/some-post'), undefined);
});

test('docs subdomain paths are served from /docs', () => {
	assert.deepEqual(route('https://docs.utsuwa.ai/'), { rewrite: 'https://docs.utsuwa.ai/docs' });
	assert.deepEqual(route('https://docs.utsuwa.ai/guides/voice?q=1'), { rewrite: 'https://docs.utsuwa.ai/docs/guides/voice?q=1' });
});

// /_app/env.js is served by the app itself; prefixing it kept the docs from hydrating (#207)
test('docs subdomain leaves kit, API, and already-prefixed paths alone', () => {
	assert.equal(route('https://docs.utsuwa.ai/_app/env.js'), undefined);
	assert.equal(route('https://docs.utsuwa.ai/api/chat'), undefined);
	assert.equal(route('https://docs.utsuwa.ai/docs/guides/voice'), undefined);
});

test('app subdomain paths are served from /app', () => {
	assert.deepEqual(route('https://app.utsuwa.ai/'), { rewrite: 'https://app.utsuwa.ai/app' });
	assert.deepEqual(route('https://app.utsuwa.ai/settings/llm'), { rewrite: 'https://app.utsuwa.ai/app/settings/llm' });
	assert.equal(route('https://app.utsuwa.ai/api/chat'), undefined);
	assert.equal(route('https://app.utsuwa.ai/_app/env.js'), undefined);
});

test('the apex root and preview hosts are untouched', () => {
	assert.equal(route('https://utsuwa.ai/ja'), undefined);
	assert.equal(route('https://utsuwa.someone.workers.dev/docs/guides'), undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { routeByHost } from './host-routing.ts';

const route = (href: string) => routeByHost(new URL(href))?.href;

test('docs subdomain paths are served from /docs', () => {
	assert.equal(route('https://docs.utsuwa.ai/'), 'https://docs.utsuwa.ai/docs');
	assert.equal(route('https://docs.utsuwa.ai/guides/voice?q=1'), 'https://docs.utsuwa.ai/docs/guides/voice?q=1');
});

test('app subdomain paths are served from /app', () => {
	assert.equal(route('https://app.utsuwa.ai/'), 'https://app.utsuwa.ai/app');
	assert.equal(route('https://app.utsuwa.ai/settings/llm'), 'https://app.utsuwa.ai/app/settings/llm');
});

// /_app/env.js is served by the app itself; prefixing it kept the docs from hydrating (#207)
test('subdomains leave kit, API, and already-prefixed paths alone', () => {
	assert.equal(route('https://docs.utsuwa.ai/_app/env.js'), undefined);
	assert.equal(route('https://docs.utsuwa.ai/api/chat'), undefined);
	assert.equal(route('https://docs.utsuwa.ai/docs/guides/voice'), undefined);
	assert.equal(route('https://app.utsuwa.ai/api/chat'), undefined);
});

// www serves the whole site in place, /app included: people have saves on that origin
test('www and preview hosts are untouched', () => {
	assert.equal(route('https://www.utsuwa.ai/'), undefined);
	assert.equal(route('https://www.utsuwa.ai/app'), undefined);
	assert.equal(route('https://www.utsuwa.ai/docs/guides'), undefined);
	assert.equal(route('https://utsuwa.someone.workers.dev/docs/guides'), undefined);
});

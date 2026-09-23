import test from 'node:test';
import assert from 'node:assert/strict';
import { isLightOnlyRoute } from './light-only.ts';

const marketing = ['/', '/ja', '/blog', '/blog/', '/blog/moving-to-agpl', '/download', '/privacy', '/terms'];

test('marketing pages are light only on the apex, previews, and local dev', () => {
	for (const host of ['utsuwa.ai', 'utsuwa-git-branch.vercel.app', 'localhost']) {
		for (const path of marketing) {
			assert.equal(isLightOnlyRoute(host, path), true, `${host}${path}`);
		}
	}
});

test('the app, docs, and overlay keep the saved theme', () => {
	for (const path of ['/app', '/app/settings/display', '/docs', '/docs/getting-started', '/overlay']) {
		assert.equal(isLightOnlyRoute('localhost', path), false, path);
	}
});

test('docs and app subdomains serve their own section at the root', () => {
	assert.equal(isLightOnlyRoute('app.utsuwa.ai', '/'), false);
	assert.equal(isLightOnlyRoute('docs.utsuwa.ai', '/'), false);
	assert.equal(isLightOnlyRoute('docs.utsuwa.ai', '/blog'), false);
});

test('lookalike paths are not treated as marketing pages', () => {
	assert.equal(isLightOnlyRoute('localhost', '/blogroll'), false);
	assert.equal(isLightOnlyRoute('localhost', '/downloads'), false);
	assert.equal(isLightOnlyRoute('localhost', '/japan'), false);
});

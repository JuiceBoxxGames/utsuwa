import test from 'node:test';
import assert from 'node:assert/strict';
import { isMarketingRoute } from './marketing-routes.ts';

const marketing = ['/', '/ja', '/blog', '/blog/', '/blog/moving-to-agpl', '/download', '/privacy', '/terms'];

test('marketing pages are recognized on the apex, previews, and local dev', () => {
	for (const host of ['utsuwa.ai', 'utsuwa-git-branch.vercel.app', 'localhost']) {
		for (const path of marketing) {
			assert.equal(isMarketingRoute(host, path), true, `${host}${path}`);
		}
	}
});

test('the app, docs, and overlay are not marketing pages', () => {
	for (const path of ['/app', '/app/settings/display', '/docs', '/docs/getting-started', '/overlay']) {
		assert.equal(isMarketingRoute('localhost', path), false, path);
	}
});

test('docs and app subdomains serve their own section at the root', () => {
	assert.equal(isMarketingRoute('app.utsuwa.ai', '/'), false);
	assert.equal(isMarketingRoute('docs.utsuwa.ai', '/'), false);
	assert.equal(isMarketingRoute('docs.utsuwa.ai', '/blog'), false);
});

test('lookalike paths are not treated as marketing pages', () => {
	assert.equal(isMarketingRoute('localhost', '/blogroll'), false);
	assert.equal(isMarketingRoute('localhost', '/downloads'), false);
	assert.equal(isMarketingRoute('localhost', '/japan'), false);
});

import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=';

test('the picture panel renders structured results and statuses without hotlinking', async ({ page }) => {
	await openApp(page);
	await page.evaluate(async ({ pixel }) => {
		const path = '/src/lib/stores/image-search.svelte.ts';
		const { imageSearchStore } = await import(/* @vite-ignore */ path);
		imageSearchStore.applyImageEvent({
			id: 'loading', at: Date.now(), type: 'loading', requestId: 'r1', query: 'Katzen', page: 1
		});
		imageSearchStore.applyImageEvent({
			id: 'results', at: Date.now(), type: 'results', requestId: 'r1', query: 'Katzen', page: 1,
			tool: { serverId: 's', serverName: 'Search', toolName: 'search' },
			results: [{
				title: 'A cat',
				url: 'https://example.com/cat',
				thumbnail: pixel,
				source: 'Example',
				license: 'CC0'
			}]
		});
	}, { pixel });
	const dialog = page.getByRole('dialog', { name: 'Pictures' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText('A cat');
	await expect(dialog).toContainText('Example');
	await expect(dialog).toContainText('CC0');
	const image = dialog.locator('.image-thumb img');
	await expect(image).toHaveAttribute('src', pixel);
	await expect(dialog.getByRole('button', { name: 'Open source: A cat' })).toBeVisible();
	await expect(dialog).toContainText('via Search');

	await page.evaluate(async () => {
		const path = '/src/lib/stores/image-search.svelte.ts';
		const { imageSearchStore } = await import(/* @vite-ignore */ path);
		imageSearchStore.applyImageEvent({
			id: 'loading-2', at: Date.now(), type: 'loading', requestId: 'r2', query: 'Katzen', page: 1
		});
		imageSearchStore.applyImageEvent({
			id: 'error', at: Date.now(), type: 'error', requestId: 'r2',
			query: 'Katzen', code: 'no_tool', message: 'No picture search tool configured'
		});
	});
	await expect(dialog).toContainText('No picture search tool is configured yet');
});

test('the open action says "picture" only for direct image bytes', async ({ page }) => {
	await openApp(page);
	await page.evaluate(async ({ pixel }) => {
		const path = '/src/lib/stores/image-search.svelte.ts';
		const { imageSearchStore } = await import(/* @vite-ignore */ path);
		imageSearchStore.applyImageEvent({
			id: 'loading', at: Date.now(), type: 'loading', requestId: 'r1', query: 'Katzen', page: 1
		});
		imageSearchStore.applyImageEvent({
			id: 'results', at: Date.now(), type: 'results', requestId: 'r1', query: 'Katzen', page: 1,
			tool: { serverId: 's', serverName: 'Search', toolName: 'search' },
			results: [{
				title: 'Pixel',
				url: pixel,
				thumbnail: pixel,
				source: 'MCP image'
			}]
		});
	}, { pixel });
	const dialog = page.getByRole('dialog', { name: 'Pictures' });
	await expect(dialog.getByRole('button', { name: 'Open picture: Pixel' })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Open source: Pixel' })).toHaveCount(0);
});

test('a closed loading request cannot reopen the panel with late results', async ({ page }) => {
	await openApp(page);
	await page.evaluate(async () => {
		const path = '/src/lib/stores/image-search.svelte.ts';
		const { imageSearchStore } = await import(/* @vite-ignore */ path);
		imageSearchStore.applyImageEvent({
			id: 'loading', at: Date.now(), type: 'loading', requestId: 'late', query: 'cats', page: 1
		});
		imageSearchStore.applyImageEvent({ id: 'close', at: Date.now(), type: 'close' });
		imageSearchStore.applyImageEvent({
			id: 'results', at: Date.now(), type: 'results', requestId: 'late', query: 'cats', page: 1,
			tool: { serverId: 's', serverName: 'Search', toolName: 'search' },
			results: [{ title: 'Late', url: 'https://example.com/late', thumbnail: 'data:image/png;base64,AA', source: 'x' }]
		});
	});
	await expect(page.getByRole('dialog', { name: 'Pictures' })).toHaveCount(0);
});

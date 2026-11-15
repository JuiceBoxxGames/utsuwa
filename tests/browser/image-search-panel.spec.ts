import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

const pixel =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=';

test('searching stays a status pill, then the panel holds focus and closes with Escape', async ({ page }) => {
	await openApp(page);
	await page.evaluate(async () => {
		const path = '/src/lib/stores/image-search.svelte.ts';
		const { imageSearchStore } = await import(/* @vite-ignore */ path);
		imageSearchStore.applyImageEvent({
			id: 'loading',
			at: Date.now(),
			type: 'loading',
			requestId: 'r1',
			query: 'Katzen',
			page: 1
		});
	});

	await expect(page.getByText('Searching pictures…')).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Pictures' })).toHaveCount(0);

	await page.evaluate(async ({ pixel }) => {
		const path = '/src/lib/stores/image-search.svelte.ts';
		const { imageSearchStore } = await import(/* @vite-ignore */ path);
		imageSearchStore.applyImageEvent({
			id: 'results',
			at: Date.now(),
			type: 'results',
			requestId: 'r1',
			query: 'Katzen',
			page: 1,
			tool: { serverId: 's', serverName: 'Search', toolName: 'search' },
			results: [
				{
					title: 'A cat',
					url: 'https://example.com/cat',
					thumbnail: pixel,
					source: 'Example',
					license: 'CC0'
				}
			]
		});
	}, { pixel });

	const dialog = page.getByRole('dialog', { name: 'Pictures' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toBeFocused();
	await expect(dialog).toContainText('via Search');
	await expect(dialog.getByRole('button', { name: 'Open source: A cat' })).toBeVisible();

	await page.keyboard.press('Tab');
	await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
});

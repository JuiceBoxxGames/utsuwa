import { test, expect } from '@playwright/test';
import { openApp, waitForHydration } from './helpers';

test('a real app turn with image_search opens the picture panel without leaking JSON', async ({ page }) => {
	await openApp(page, { chatDisplayMode: 'sidebar' });

	await page.evaluate(async () => {
		const settingsPath = '/src/lib/stores/settings.svelte.ts';
		const modulesPath = '/src/lib/stores/modules.svelte.ts';
		const { settingsStore } = await import(/* @vite-ignore */ settingsPath);
		const { modulesStore } = await import(/* @vite-ignore */ modulesPath);
		settingsStore.setProviderConfig('openai', { apiKey: 'browser-test-only' });
		await modulesStore.setModuleSettings('consciousness', {
			activeProvider: 'openai',
			activeModel: 'gpt-4o-mini'
		});
		await modulesStore.setModuleEnabled('consciousness', true);
		const server = { id: 'search-1', name: 'Search', transport: 'http', url: 'http://search.local/mcp', enabled: true, askBeforeRun: false };
		localStorage.setItem('utsuwa-mcp-v1', JSON.stringify([server]));
		localStorage.setItem('utsuwa-image-search-tool-v1', JSON.stringify({ serverId: 'search-1', toolName: 'searxng_image_search' }));
	});

	await page.route('**/api/mcp/tools', (route) =>
		route.fulfill({
			json: {
				tools: [{
					serverId: 'search-1',
					serverName: 'Search',
					name: 'searxng_image_search',
					description: 'Search pictures',
					inputSchema: { type: 'object', properties: { query: {}, pageno: {} } }
				}],
				errors: []
			}
		})
	);
	await page.route('**/api/mcp/call', (route) => {
		const body = route.request().postDataJSON() as { args?: { pageno?: number } };
		const pageNumber = body.args?.pageno ?? 1;
		const result = pageNumber === 2
			? { title: 'A second cat', url: 'https://example.com/cat-2', img_src: 'https://cdn.example.com/cat-2.jpg', thumbnail_src: 'https://cdn.example.com/cat-2-thumb.jpg', source: 'Example', license: 'CC0' }
			: { title: 'A cat', url: 'https://example.com/cat', img_src: 'https://cdn.example.com/cat.jpg', thumbnail_src: 'https://cdn.example.com/cat-thumb.jpg', source: 'Example', license: 'CC0' };
		return route.fulfill({
			json: {
				toolName: 'searxng_image_search',
				isError: false,
				content: JSON.stringify({ results: [result] })
			}
		});
	});
	await page.route('**/api/chat', (route) => {
		const reply = 'With pleasure!\n```json\n{"mood_change":{"emotion":"happy","intensity_delta":0},"image_search":"cats"}\n```';
		return route.fulfill({ contentType: 'text/plain', body: `0:${JSON.stringify(reply)}\n` });
	});

	await page.reload();
	await waitForHydration(page);
	await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Zeig mir Bilder von Katzen.');
	await page.getByRole('button', { name: 'Send message', exact: true }).click();

	const dialog = page.getByRole('dialog', { name: 'Pictures' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText('A cat');
	await expect(dialog).toContainText('Example');
	await expect(dialog).toContainText('CC0');
	await expect(dialog).toContainText('via Search');
	await expect(dialog.getByRole('button', { name: 'Open source: A cat' })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Open picture: A cat' })).toHaveCount(0);

	// The first chat turn also opens the "First Meeting" moment. Dismiss it so
	// its backdrop does not intercept the panel's More button.
	const firstMeeting = page.getByRole('dialog', { name: 'First Meeting' });
	await firstMeeting.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
	if (await firstMeeting.isVisible()) {
		await firstMeeting.getByRole('button', { name: 'Close' }).click();
		await expect(firstMeeting).toHaveCount(0);
	}

	await dialog.getByRole('button', { name: 'More pictures' }).click();
	await expect(dialog).toContainText('A second cat');
	await expect(dialog).not.toContainText('A cat');

	const bubble = page.locator('.message.assistant .bubble').last();
	await expect(bubble).toContainText('With pleasure!');
	await expect(bubble).not.toContainText('image_search');
});

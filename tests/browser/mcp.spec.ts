import { test, expect } from '@playwright/test';
import { waitForHydration, snap } from './helpers';

test('MCP stays hidden when the deployment disables it', async ({ page }) => {
	await page.route('**/api/mcp/tools', (route) => route.fulfill({ status: 404 }));
	await page.goto('/app/settings/mcp');
	await expect(page.getByText('MCP disabled on this server', { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'MCP', exact: true })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Memory', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add Server', exact: true })).toHaveCount(0);
});

test('MCP server settings persist and use the shared responsive controls', async ({ page }) => {
	await page.route('**/api/mcp/tools', (route) => route.fulfill({ json: { tools: [], errors: [] } }));
	await page.goto('/app/settings/mcp');
	await waitForHydration(page);
	await expect(page.getByRole('link', { name: 'MCP', exact: true })).toHaveAttribute('aria-current', 'page');
	await page.getByRole('button', { name: 'Add Server', exact: true }).click();
	await page.getByLabel('Name', { exact: true }).fill('Home Assistant');
	await page.getByLabel('URL', { exact: true }).fill('https://home.example.test/api/mcp');
	await page.getByRole('radio', { name: 'Bearer', exact: true }).check();
	await page.getByLabel('Token', { exact: true }).fill('test-token');
	await page.locator('.form-actions').getByRole('button', { name: 'Add Server', exact: true }).click();
	await page.reload();
	const enabled = page.getByRole('switch', { name: 'Enable Home Assistant', exact: true });
	await expect(enabled).toBeChecked();
	await enabled.click();
	await expect(enabled).not.toBeChecked();
	await page.getByRole('button', { name: 'Edit server', exact: true }).click();
	await expect(page.getByLabel('URL', { exact: true })).toHaveValue('https://home.example.test/api/mcp');
	await expect(page.getByLabel('Token', { exact: true })).toHaveValue('test-token');
	await page.getByLabel('Name', { exact: true }).fill('Home tools');
	await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
	await expect(page.getByRole('switch', { name: 'Enable Home tools', exact: true })).not.toBeChecked();
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('utsuwa-mcp-v1')!));
	expect(saved[0]).toMatchObject({ name: 'Home tools', enabled: false, auth: { type: 'bearer', token: 'test-token' } });
	const actions = page.locator('.server-actions');
	await expect.poll(async () => {
		const box = (await actions.boundingBox())!;
		return box.x + box.width;
	}).toBeLessThanOrEqual(page.viewportSize()!.width);
	await snap(page, 'mcp-server.png');
	await page.getByRole('button', { name: 'Remove server', exact: true }).click();
	await expect(page.getByText('No servers configured. Add one above to get started.')).toBeVisible();
});

test('switching from bearer HTTP to stdio does not require a hidden token', async ({ page }) => {
	await page.route('**/api/mcp/tools', (route) => route.fulfill({ json: { tools: [], errors: [] } }));
	await page.goto('/app/settings/mcp');
	await page.getByRole('button', { name: 'Add Server', exact: true }).click();
	await page.getByLabel('Name', { exact: true }).fill('Local tools');
	await page.getByRole('radio', { name: 'Bearer', exact: true }).check();
	await page.getByRole('radio', { name: 'stdio', exact: true }).check();
	await page.getByLabel('Command', { exact: true }).fill('npx');
	await page.getByLabel('Arguments', { exact: true }).fill('-y example-mcp');
	await page.locator('.form-actions').getByRole('button', { name: 'Add Server', exact: true }).click();
	await expect(page.getByRole('switch', { name: 'Enable Local tools', exact: true })).toBeVisible();
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('utsuwa-mcp-v1')!));
	expect(saved[0]).toMatchObject({ transport: 'stdio', command: 'npx', args: ['-y', 'example-mcp'] });
	expect(saved[0].auth).toBeUndefined();
});

test('the picture-search tool choice persists', async ({ page }) => {
	await page.route('**/api/mcp/tools', (route) =>
		route.fulfill({
			json: {
				tools: [{
					serverId: 'search-1',
					serverName: 'Search',
					name: 'searxng_image_search',
					description: 'Search pictures',
					inputSchema: { type: 'object', properties: { query: {} } }
				}, {
					serverId: 'search-1',
					serverName: 'Search',
					name: 'searxng_search_suggestions',
					description: 'Autocomplete suggestions',
					inputSchema: { type: 'object', properties: { query: {} } }
				}],
				errors: []
			}
		})
	);
	await page.goto('/app/settings/mcp');
	await page.evaluate(() => {
		localStorage.setItem('utsuwa-mcp-v1', JSON.stringify([{
			id: 'search-1', name: 'Search', transport: 'http', url: 'http://search.local/mcp', enabled: true
		}]));
	});
	await page.reload();
	await waitForHydration(page);
	const options = await page.locator('#image-search-tool option').allTextContents();
	expect(options.some((label) => label.includes('suggestions'))).toBe(false);
	await page.selectOption('#image-search-tool', 'search-1::searxng_image_search');
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('utsuwa-image-search-tool-v1')!));
	expect(saved).toEqual({ serverId: 'search-1', toolName: 'searxng_image_search' });
	await page.reload();
	await expect(page.locator('#image-search-tool')).toHaveValue('search-1::searxng_image_search');
});

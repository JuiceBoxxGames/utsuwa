import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers';

test('MCP stays hidden when the deployment disables it', async ({ page }) => {
	await page.route('**/api/mcp/tools', (route) => route.fulfill({ status: 404 }));
	await page.goto('/app/settings/mcp');
	await expect(page.getByText('MCP disabled on this server', { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'MCP', exact: true })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Memory', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add Server', exact: true })).toHaveCount(0);
});

test('MCP server settings persist and use the shared responsive controls', async ({ page }, info) => {
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
	await page.screenshot({ path: info.outputPath('mcp-server.png') });
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

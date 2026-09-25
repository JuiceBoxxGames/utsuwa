import { test, expect } from '@playwright/test';
import { openApp, waitForHydration, snap } from './helpers';

test('photo controls share switches and slider fill follows edits and resets', { tag: '@avatar' }, async ({ page }) => {
	// Leave time for scene screenshots on CI's software renderer.
	test.setTimeout(90_000);
	await openApp(page);
	await page.getByRole('button', { name: 'Open photo mode', exact: true }).click();
	const panel = page.getByRole('region', { name: 'Photo mode', exact: true });
	await expect(panel).toBeVisible();
	await panel.getByRole('tab', { name: 'Camera', exact: true }).click();
	const grid = panel.getByRole('switch', { name: 'Thirds grid', exact: true });
	await grid.check();
	await expect(grid).toBeChecked();
	const tracking = panel.getByRole('switch', { name: 'Look at camera', exact: true });
	await tracking.uncheck();
	await expect(tracking).not.toBeChecked();
	const lens = panel.getByRole('slider', { name: 'Field of view', exact: true });
	const initial = await lens.inputValue();
	const initialFill = await lens.evaluate(el => el.style.getPropertyValue('--settings-slider-progress'));
	await lens.focus();
	await lens.press('ArrowRight');
	expect(Number(await lens.inputValue())).toBe(Number(initial) + 1);
	expect(await lens.evaluate(el => el.style.getPropertyValue('--settings-slider-progress'))).not.toBe(initialFill);
	await panel.getByRole('button', { name: 'Reset framing', exact: true }).click();
	await expect(lens).toHaveValue(initial);
	expect(await lens.evaluate(el => el.style.getPropertyValue('--settings-slider-progress'))).toBe(initialFill);
	await snap(page, 'photo-camera-controls.png');
	await panel.getByRole('tab', { name: 'Scene', exact: true }).click();
	const warm = panel.getByRole('button', { name: 'Warm', exact: true });
	await warm.click();
	await expect(warm).toHaveAttribute('aria-pressed', 'true');
	const cool = panel.getByRole('button', { name: 'Cool', exact: true });
	await cool.focus();
	await cool.press('Space');
	await expect(cool).toHaveAttribute('aria-pressed', 'true');
	await expect(warm).toHaveAttribute('aria-pressed', 'false');
	await panel.getByRole('button', { name: 'Polaroid', exact: true }).click();
	await panel.getByRole('tab', { name: 'Camera', exact: true }).click();
	await panel.getByRole('tab', { name: 'Scene', exact: true }).click();
	await expect(panel.getByRole('button', { name: 'Cool', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(panel.getByRole('button', { name: 'Polaroid', exact: true })).toHaveAttribute('aria-pressed', 'true');
	const options = panel.locator('.tab-content');
	await expect.poll(() => options.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
	const swatch = panel.getByRole('group', { name: 'Background', exact: true }).getByRole('button').first();
	const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
	const size = (await swatch.boundingBox())!;
	expect(Math.round(size.width)).toBe(coarse ? 44 : 32);
	expect(Math.round(size.height)).toBe(coarse ? 44 : 32);
	await snap(page, 'photo-scene-controls.png');
	const vignette = panel.getByRole('switch', { name: 'Vignette', exact: true });
	await vignette.check();
	await expect(vignette).toBeChecked();
	await vignette.uncheck();
	await expect(vignette).not.toBeChecked();
	await panel.getByRole('button', { name: 'Snap', exact: true }).click();
	await expect(panel.getByRole('status')).toHaveText('Photo saved', { timeout: 20_000 });
	await panel.getByRole('button', { name: 'Collapse panel', exact: true }).click();
	const reopen = page.getByRole('button', { name: 'Open photo controls', exact: true });
	await expect(reopen).toBeFocused();
	await reopen.click();
	await expect(panel.getByRole('button', { name: 'Collapse panel', exact: true })).toBeFocused();
	await panel.getByRole('button', { name: 'Exit photo mode', exact: true }).click();
	await expect(panel).toHaveCount(0);
	await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
});

test('model search keeps text input and Escape returns focus to its trigger', async ({ page }) => {
	await page.route('**/api/providers/models', route => route.fulfill({ json: {
		models: [{ id: 'gpt-4o', name: 'GPT-4o' }, { id: 'gpt-4o-mini', name: 'GPT-4o mini' }]
	} }));
	await page.goto('/app/settings/llm');
	await waitForHydration(page);
	await page.getByRole('switch', { name: 'Chat (LLM)', exact: true }).check();
	await page.locator('.dropdown-trigger').click();
	await page.getByRole('menuitem', { name: 'OpenAI', exact: true }).click();
	const apiKey = page.getByLabel('API Key', { exact: true });
	await apiKey.fill('test-only-key');
	await apiKey.press('Tab');
	const trigger = page.locator('.model-dropdown-trigger');
	await expect(trigger).toContainText('GPT-4o');
	await expect(trigger).toBeEnabled();
	await trigger.click();
	const search = page.getByRole('textbox', { name: 'Search models', exact: true });
	await search.fill('mini');
	await expect(search).toHaveValue('mini');
	await expect(page.getByRole('menuitem', { name: 'GPT-4o mini', exact: true })).toBeVisible();
	await snap(page, 'model-search.png');
	await search.press('Escape');
	await expect(page.getByRole('menu')).toHaveCount(0);
	await expect(trigger).toBeFocused();
	await expect(page).toHaveURL(/settings\/llm$/);
	await trigger.click();
	await expect(search).toHaveValue('');
	await page.getByRole('menuitem', { name: 'GPT-4o mini', exact: true }).click();
	await expect(trigger).toHaveText('GPT-4o mini');
});

test('docs drawer takes focus, closes with Escape, and returns focus to its toggle', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/docs');
	await page.waitForFunction(() => document.readyState === 'complete' && '__SVELTEKIT_APP_VERSION__' in globalThis);
	const toggle = page.getByRole('button', { name: 'Open menu', exact: true });
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	const drawer = page.getByRole('complementary', { name: 'Documentation menu', exact: true });
	// A click that lands before hydration does nothing, so retry until the drawer opens
	await expect(async () => {
		if ((await page.locator('#docs-menu-toggle').getAttribute('aria-expanded')) !== 'true') {
			await page.locator('#docs-menu-toggle').click();
		}
		await expect(drawer).toBeVisible({ timeout: 500 });
	}).toPass();
	await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toHaveAttribute('aria-expanded', 'true');
	await expect.poll(() => drawer.evaluate(el => el.contains(document.activeElement))).toBe(true);
	await expect(page.locator('main.docs-main')).toHaveAttribute('inert', '');
	await snap(page, 'docs-drawer.png');
	// Tabbing moves through the drawer, starting at search
	await page.keyboard.press('Tab');
	await expect(drawer.getByRole('textbox', { name: 'Search docs', exact: true })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(drawer).toBeHidden();
	await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused();
	await expect(page.locator('main.docs-main')).not.toHaveAttribute('inert', '');
	// The scrim closes it for pointer users and still hands focus back
	await page.getByRole('button', { name: 'Open menu', exact: true }).click();
	await page.mouse.click(370, 400);
	await expect(drawer).toBeHidden();
	await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused();
});

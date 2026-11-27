import { test, expect } from '@playwright/test';

// Marketing pages share the docs and app system, so they follow the saved color mode.
test('marketing pages follow the saved dark mode before hydration', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('colorMode', 'dark'));
	for (const path of ['/', '/blog', '/download']) {
		await page.goto(path, { waitUntil: 'domcontentloaded' });
		expect(await page.evaluate(() => document.documentElement.classList.contains('dark')), path).toBe(true);
	}
});

test('the Japanese landing still renders in Japanese', async ({ page }) => {
	await page.goto('/ja');
	await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
});

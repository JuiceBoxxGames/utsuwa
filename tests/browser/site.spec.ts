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

test('the footer theme toggle switches the blog to dark', async ({ page }) => {
	await page.goto('/blog', { waitUntil: 'networkidle' });
	const footer = page.getByRole('contentinfo');
	const toggle = footer.getByRole('button', { name: /^Theme: / });
	await expect(toggle).toHaveAccessibleName('Theme: System');
	// system -> light -> dark
	await toggle.click();
	await toggle.click();
	await expect(toggle).toHaveAccessibleName('Theme: Dark');
	await expect(page.locator('html')).toHaveClass(/dark/);
	expect(await page.evaluate(() => localStorage.getItem('colorMode'))).toBe('dark');
});

test('marketing and docs share one header', async ({ page }) => {
	for (const path of ['/blog', '/docs']) {
		await page.goto(path);
		const banner = page.getByRole('banner');
		for (const name of ['Docs', 'Blog', 'Try it live']) {
			await expect(banner.getByRole('link', { name, exact: true }), `${path} ${name}`).toBeVisible();
		}
		await expect(banner.getByRole('link', { name: /Download/ }), `${path} Download`).toBeVisible();
	}
});

test('the logo shows on a phone-width marketing page', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/blog');
	await expect(page.getByRole('banner').getByRole('img', { name: 'Utsuwa' })).toBeVisible();
});

test('the docs header keeps its menu button on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/docs');
	const banner = page.getByRole('banner');
	await expect(banner.getByRole('button', { name: 'Open menu' })).toBeVisible();
	await expect(banner.getByRole('img', { name: 'Utsuwa' })).toBeHidden();
});

async function gradientsInMain(page: import('@playwright/test').Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('main *')]
			.filter((el) => getComputedStyle(el).backgroundImage.includes('gradient('))
			.map((el) => el.className || el.tagName)
	);
}

test('blog and legal pages use the shared tokens', async ({ page }) => {
	for (const path of ['/blog', '/blog/moving-to-agpl', '/privacy', '/terms']) {
		await page.goto(path);
		const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
		expect(accent, path).toBe('#18181b');
		expect(await gradientsInMain(page), path).toEqual([]);
	}
});

test('blog cards and headings follow the restrained scale', async ({ page }) => {
	await page.goto('/blog');
	const styles = await page.evaluate(() => ({
		media: getComputedStyle(document.querySelector('.post-card-media')!).backgroundColor,
		titleWeight: getComputedStyle(document.querySelector('h1')!).fontWeight
	}));
	expect(styles.media).not.toBe('rgba(0, 0, 0, 0)');
	expect(styles.titleWeight).toBe('500');
});

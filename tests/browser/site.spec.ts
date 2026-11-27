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
	// The shared header is translated too, not just the page body
	const banner = page.getByRole('banner');
	for (const name of ['ドキュメント', 'ブログ']) {
		await expect(banner.getByRole('link', { name, exact: true })).toBeVisible();
	}
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
	for (const path of ['/', '/blog', '/docs']) {
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
	for (const path of ['/', '/blog']) {
		await page.goto(path);
		await expect(page.getByRole('banner').getByRole('img', { name: 'Utsuwa' }), path).toBeVisible();
	}
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

test('download page offers each platform on the shared tokens', async ({ page }) => {
	await page.goto('/download');
	await expect(page.getByRole('link', { name: /^Download for (macOS|Windows|Linux)$/ })).toBeVisible();
	for (const name of ['macOS', 'Windows', 'Linux']) {
		await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
	}
	expect(await gradientsInMain(page)).toEqual([]);
	const weight = await page.evaluate(() => getComputedStyle(document.querySelector('h1')!).fontWeight);
	expect(weight).toBe('500');
});

test('the landing hero offers download and the browser app', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Give your AI a body, a voice, a memory, and a home.');
	const main = page.getByRole('main');
	await expect(main.getByRole('link', { name: 'Download', exact: true }).first()).toHaveAttribute('href', '/download');
	await expect(main.getByRole('link', { name: 'Try it in your browser' }).first()).toHaveAttribute('href', '/app');
	expect(await gradientsInMain(page)).toEqual([]);
});

test('the landing pillars switch with the keyboard', async ({ page }) => {
	// Phones stack the pillars without tabs, so this runs at desktop width
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/', { waitUntil: 'networkidle' });
	const tabs = page.getByRole('tablist').getByRole('tab');
	await expect(tabs).toHaveCount(3);
	await tabs.first().focus();
	await page.keyboard.press('ArrowRight');
	await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
	await expect(tabs.nth(1)).toBeFocused();
	const panelId = await tabs.nth(1).getAttribute('aria-controls');
	await expect(page.locator(`#${panelId}`)).toBeVisible();
});

test('the landing fits a phone without sideways scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/', { waitUntil: 'networkidle' });
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('pillar images never cover their copy on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/', { waitUntil: 'networkidle' });
	const overlaps = await page.evaluate(() =>
		[...document.querySelectorAll('[role="tabpanel"]')].filter((panel) => {
			const copy = panel.querySelector('.panel-copy')!.getBoundingClientRect();
			const img = panel.querySelector('img')!.getBoundingClientRect();
			return img.top < copy.bottom - 1;
		}).length
	);
	expect(overlaps).toBe(0);
});

test('Japanese headings break at phrases, not mid-word', async ({ page }) => {
	await page.goto('/ja');
	const wordBreak = await page.evaluate(() => getComputedStyle(document.querySelector('h1')!).wordBreak);
	expect(['keep-all', 'auto-phrase']).toContain(wordBreak);
});

for (const mode of ['light', 'dark'] as const) {
	test(`the hero plays the ${mode} device loop`, async ({ page }) => {
		await page.addInitScript((m) => localStorage.setItem('colorMode', m), mode);
		await page.goto('/', { waitUntil: 'networkidle' });
		const video = page.locator(`video.hero-video--${mode}`);
		await expect(video).toBeVisible();
		await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
		const other = page.locator(`video.hero-video--${mode === 'light' ? 'dark' : 'light'}`);
		await expect(other).toBeHidden();
	});
}

test('reduced motion keeps the hero on its still frame', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/', { waitUntil: 'networkidle' });
	const video = page.locator('video.hero-video--light');
	await expect(video).toBeVisible();
	await page.waitForTimeout(500);
	expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
});

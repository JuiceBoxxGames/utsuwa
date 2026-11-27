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
	// The shared chrome is translated too, not just the page body. Phones keep
	// these links in the footer only, so the header never wraps.
	const phone = (page.viewportSize()?.width ?? 1280) <= 560;
	const chrome = phone ? page.getByRole('contentinfo') : page.getByRole('banner');
	for (const name of ['ドキュメント', 'ブログ']) {
		await expect(chrome.getByRole('link', { name, exact: true })).toBeVisible();
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
		// Marketing phones drop the header nav to the footer; docs keep a menu instead
		const phone = path !== '/docs' && (page.viewportSize()?.width ?? 1280) <= 560;
		for (const name of phone ? ['Try it live'] : ['Docs', 'Blog', 'Try it live']) {
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

test('the hero loop can be paused and played again', async ({ page }) => {
	await page.goto('/', { waitUntil: 'networkidle' });
	const video = page.locator('video.hero-video--light');
	await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
	await page.getByRole('button', { name: 'Pause video' }).click();
	await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
	// Pausing sticks even when the theme flips
	await page.evaluate(() => document.documentElement.classList.add('dark'));
	await expect.poll(() => page.locator('video.hero-video--dark').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
	await page.evaluate(() => document.documentElement.classList.remove('dark'));
	await page.getByRole('button', { name: 'Play video' }).click();
	await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
});

test('the landing shows the advanced features with live vignettes', async ({ page }) => {
	await page.goto('/', { waitUntil: 'networkidle' });
	const section = page.getByRole('region', { name: 'Built deeper than it looks' });
	await section.scrollIntoViewIfNeeded();
	for (const name of ['Tools through MCP', 'Memory that recalls by meaning', 'A bond that grows', 'Fully local if you want', 'Reminders that come back', 'Desktop overlay']) {
		await expect(section.getByRole('heading', { name, exact: true })).toBeVisible();
	}
	const tool = section.locator('[data-vignette="tools"]');
	// Vignettes pause offscreen; the section is taller than a phone screen
	await tool.scrollIntoViewIfNeeded();
	const first = await tool.getAttribute('data-step');
	await expect.poll(() => tool.getAttribute('data-step'), { timeout: 6000 }).not.toBe(first);
});

test('reduced motion shows each vignette finished and still', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/', { waitUntil: 'networkidle' });
	const steps = await page.locator('[data-vignette]').evaluateAll((els) =>
		els.map((el) => ({ step: el.getAttribute('data-step'), last: el.getAttribute('data-last') }))
	);
	expect(steps.length).toBe(6);
	for (const s of steps) expect(s.step).toBe(s.last);
	// The finished state is actually drawn, not just flagged (Svelte prunes step rules it cannot see)
	const reply = page.locator('[data-vignette="tools"] .reply');
	await reply.scrollIntoViewIfNeeded();
	await expect.poll(() => reply.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
	// Each vignette lands on the moment that names its feature
	const shown = async (selector: string) => {
		const el = page.locator(selector).first();
		await el.scrollIntoViewIfNeeded();
		await expect.poll(() => el.evaluate((n) => getComputedStyle(n).opacity), { message: selector }).toBe('1');
	};
	await shown('[data-vignette="tools"] .server');
	await shown('[data-vignette="tools"] .packet.back');
	await shown('[data-vignette="memory"] .query');
	await shown('[data-vignette="memory"] .label.hot');
	await shown('[data-vignette="overlay"] .bubble');
});

test('posts that used the old window-light art show the abstract thumbnails', async ({ page }) => {
	await page.goto('/blog');
	for (const slug of ['dev-log-2026-5-29', 'dev-log-2026-7-3', 'moving-to-agpl']) {
		const src = await page.locator(`a[href="/blog/${slug}"] img`).first().getAttribute('src');
		expect(src, slug).toContain(`${slug}-abstract`);
	}
});

test('the footer theme toggle speaks Japanese on the Japanese landing', async ({ page }) => {
	await page.goto('/ja', { waitUntil: 'networkidle' });
	const toggle = page.getByRole('contentinfo').getByRole('button', { name: /^テーマ/ });
	await expect(toggle).toHaveAccessibleName('テーマ：システム');
	await toggle.click();
	await expect(toggle).toHaveAccessibleName('テーマ：ライト');
});

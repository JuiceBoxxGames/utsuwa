import { test, expect } from '@playwright/test';

// With an ink accent, link text matches body text, so the underline is what marks a link.
test('docs prose links are underlined at rest', async ({ page }) => {
	await page.goto('/docs/overview/introduction');
	// Docs pages never register the app modules waitForHydration polls for
	await page.locator('.prose a:not(.btn)').first().waitFor();
	const styles = await page.evaluate(() => {
		const link = document.querySelector<HTMLElement>('.prose a:not(.btn)');
		const para = document.querySelector<HTMLElement>('.prose p');
		if (!link || !para) return null;
		return {
			decoration: getComputedStyle(link).textDecorationLine,
			linkColor: getComputedStyle(link).color,
			textColor: getComputedStyle(para).color
		};
	});
	expect(styles).not.toBeNull();
	expect(styles!.decoration).toContain('underline');
	expect(styles!.linkColor).toBe(styles!.textColor);
});

// The checked fill is the ink accent, so the tick has to use the contrast color
test('a checked checkbox tick contrasts with its ink fill in both themes', async ({ page }) => {
	await page.goto('/docs/overview/introduction');
	await page.locator('.prose a:not(.btn)').first().waitFor();
	for (const dark of [false, true]) {
		const tick = await page.evaluate((dark) => {
			document.documentElement.classList.toggle('dark', dark);
			let box = document.querySelector<HTMLInputElement>('#tick-probe');
			if (!box) {
				box = Object.assign(document.createElement('input'), { type: 'checkbox', id: 'tick-probe', checked: true });
				document.querySelector('.docs-site')!.append(box);
			}
			const style = getComputedStyle(box);
			const contrast = getComputedStyle(document.querySelector('.docs-site')!).getPropertyValue('--accent-contrast').trim();
			return { image: decodeURIComponent(style.backgroundImage), contrast };
		}, dark);
		expect(tick.image, dark ? 'dark' : 'light').toContain(`stroke='${tick.contrast}'`);
	}
});

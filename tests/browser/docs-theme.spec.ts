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

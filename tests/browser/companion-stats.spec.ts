import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

for (const mode of ['bubble', 'sidebar']) {
	test(`${mode} shares the composer and opens read-only stats above its toolbar`, async ({
		page
	}, info) => {
		await openApp(page, { chatDisplayMode: mode });
		await page.evaluate(async () => {
			const path = '/src/lib/stores/character.svelte.ts';
			const { characterStore } = await import(/* @vite-ignore */ path);
			characterStore.setAppMode('dating_sim');
			Object.assign(characterStore.state, {
				name: 'Hana',
				energy: 72,
				affection: 650,
				trust: 48,
				intimacy: 32,
				comfort: 81,
				respect: 90,
				daysKnown: 23,
				totalInteractions: 1234,
				currentStreak: 4,
				longestStreak: 9
			});
		});
		const snapshot = () =>
			page.evaluate(async () => {
				const path = '/src/lib/stores/character.svelte.ts';
				return JSON.stringify((await import(/* @vite-ignore */ path)).characterStore.state);
			});
		const before = await snapshot();
		const input = page.getByRole('textbox', { name: 'Message', exact: true });
		const trigger = page.getByRole('button', { name: 'Companion stats', exact: true });
		await expect(input).toHaveAttribute('rows', '2');
		await expect(input).toHaveAttribute('wrap', 'soft');
		await expect(trigger).toHaveText('Hana');
		await expect(page.locator('.mood-fab')).toHaveCount(0);
		const field = (await input.boundingBox())!;
		const button = (await trigger.boundingBox())!;
		expect(button.y).toBeGreaterThanOrEqual(field.y + field.height);
		await page.screenshot({
			animations: 'disabled',
			path: info.outputPath(`${mode}-composer.png`)
		});
		await trigger.click();
		const panel = page.getByRole('dialog', { name: 'Companion stats' });
		await expect(panel).toBeVisible();
		await expect(
			panel
				.locator('.metric')
				.filter({ has: page.getByText('Energy', { exact: true }) })
				.locator('dd')
		).toHaveText('72%');
		await expect(
			panel
				.locator('.metric')
				.filter({ has: page.getByText('Affection', { exact: true }) })
				.locator('dd')
		).toHaveText('65%');
		await expect(
			panel
				.locator('.metric')
				.filter({ has: page.getByText('Trust', { exact: true }) })
				.locator('dd')
		).toHaveText('48%');
		await expect(panel.locator('.activity')).toContainText('1,234');
		await expect(panel.locator('.activity')).toContainText(/Day streak\s*4/);
		await expect(panel).toHaveAttribute('data-side', 'top');
		const box = (await panel.boundingBox())!;
		expect(box.y).toBeGreaterThanOrEqual(0);
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
		expect(box.y + box.height).toBeLessThanOrEqual(button.y);
		await page.screenshot({ animations: 'disabled', path: info.outputPath(`${mode}-stats.png`) });
		await page.keyboard.press('Escape');
		await expect(panel).not.toBeVisible();
		await expect(trigger).toBeFocused();
		await trigger.click();
		await expect(panel).toBeVisible();
		await expect(panel).toBeFocused();
		// The upward panel covers the field on narrow screens. Dismiss from the scene first.
		await page
			.locator('.stage-container canvas')
			.first()
			.click({ position: { x: 5, y: 80 } });
		await expect(panel).not.toBeVisible();
		await input.click();
		await expect(input).toBeFocused();
		expect(await snapshot()).toBe(before);
	});

	test(`${mode} stats fit above a keyboard and respect companion mode`, async ({ page }, info) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openApp(page, { chatDisplayMode: mode });
		await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
		await page.evaluate(async () => {
			document.documentElement.classList.add('dark');
			const path = '/src/lib/stores/character.svelte.ts';
			const { characterStore } = await import(/* @vite-ignore */ path);
			characterStore.setAppMode('companion');
			characterStore.updatePersona({ name: 'A character with a very long display name' });
			Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 420 });
			window.visualViewport!.dispatchEvent(new Event('resize'));
		});
		const trigger = page.getByRole('button', { name: 'Companion stats', exact: true });
		await expect
			.poll(async () => {
				const box = (await trigger.boundingBox())!;
				return box.y + box.height;
			})
			.toBeLessThanOrEqual(420);
		await trigger.click();
		const panel = page.getByRole('dialog', { name: 'Companion stats' });
		await expect(panel).toBeVisible();
		await expect(panel.getByRole('region', { name: 'Relationship stats' })).toHaveCount(0);
		await expect(panel.getByRole('region', { name: 'Character stats' })).toBeVisible();
		await expect(panel.getByRole('link', { name: 'Character settings' })).toBeVisible();
		await expect(async () => {
			const box = (await panel.boundingBox())!;
			expect(box.y).toBeGreaterThanOrEqual(0);
			expect(box.y + box.height).toBeLessThanOrEqual((await trigger.boundingBox())!.y);
		}).toPass({ timeout: 5000 });
		const details = panel.getByRole('region', { name: 'Stats details' });
		await details.focus();
		await details.press('End');
		await expect.poll(() => details.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
		await page.screenshot({
			animations: 'disabled',
			path: info.outputPath(`${mode}-short-stats.png`)
		});
		await page.evaluate(async () => {
			const path = '/src/lib/stores/photomode.svelte.ts';
			(await import(/* @vite-ignore */ path)).photomodeStore.enter();
		});
		await expect(panel).not.toBeVisible();
	});
}

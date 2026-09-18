import { test, expect, type Page } from '@playwright/test';
import { openApp, waitForHydration } from './helpers';

async function speechSettings(page: Page) {
	return page.evaluate(async () => {
		const path = '/src/lib/stores/modules.svelte.ts';
		return (await import(/* @vite-ignore */ path)).modulesStore.getModuleSettings('speech');
	});
}

async function prepareOmniVoice(page: Page) {
	await page.route('http://localhost:8881/**', (route) =>
		route.fulfill({
			json: { status: 'ok', clones: [{ id: 'clone:sample', name: 'Sample voice' }] }
		})
	);
	await openApp(page);
	await waitForHydration(page);
	await page.evaluate(async () => {
		const path = '/src/lib/stores/modules.svelte.ts';
		const { modulesStore } = await import(/* @vite-ignore */ path);
		await modulesStore.setModuleSettings('speech', {
			...modulesStore.getModuleSettings('speech'),
			activeProvider: 'omnivoice',
			activeVoiceId: 'alloy',
			activeLanguage: 'en',
			speed: 1,
			numStep: 32,
			positionTemperature: 1,
			classTemperature: 0.2,
			enableAltLanguage: true,
			altLanguage: 'ja',
			altVoiceId: 'nova',
			altSpeed: 1.2,
			altNumStep: 24
		});
		await modulesStore.setModuleEnabled('speech', true);
	});
}

for (const theme of ['light', 'dark']) {
	test(`every settings page fits the viewport in ${theme} mode`, async ({ page }, info) => {
		test.setTimeout(90_000);
		await page.route('**/api/mcp/tools', (route) => route.fulfill({ json: { tools: [], errors: [] } }));
		await prepareOmniVoice(page);
		await page.emulateMedia({ colorScheme: theme as 'light' | 'dark', reducedMotion: 'reduce' });
		for (const route of [
			'persona',
			'display',
			'llm',
			'tts',
			'stt',
			'mcp',
			'memory',
			'data',
			'developer'
		]) {
			await page.goto(`/app/settings/${route}`);
			await expect(page.locator('.nav-item[aria-current="page"]')).toHaveCount(1);
			await waitForHydration(page);
			if (route === 'tts')
				await expect(
					page.getByRole('heading', { name: 'Primary voice', exact: true })
				).toBeVisible();
			if (route === 'mcp') {
				await page.getByRole('button', { name: 'Add Server', exact: true }).click();
				await page.getByRole('radio', { name: 'Bearer', exact: true }).check();
			}
			await page.evaluate(
				(theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
				theme
			);
			await expect(page.locator('.content')).toBeVisible();
			const overflow = await page.evaluate(() => {
				const content = document.querySelector('.content')!.getBoundingClientRect();
				return Array.from(
					document.querySelectorAll(
						'.content input, .content select, .content textarea, .content button'
					)
				)
					.filter((el) => {
						const box = el.getBoundingClientRect();
						return (
							box.width > 0 &&
							box.height > 0 &&
							!el.classList.contains('sr-only') &&
							(box.x < content.x - 1 || box.right > content.right + 1)
						);
					})
					.map((el) => el.outerHTML.slice(0, 160));
			});
			expect(overflow, `${route} has clipped controls`).toEqual([]);
			const scrollOverflow = await page
				.locator('.page, .display-page, .character-screen, .dev-layout')
				.evaluateAll((elements) =>
					elements.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className)
				);
			expect(scrollOverflow, `${route} scrolls horizontally`).toEqual([]);
			await page.screenshot({ path: info.outputPath(`settings-${route}-${theme}.png`) });
			if (route === 'developer')
				await page
					.getByRole('button', { name: 'Reset Character Data', exact: true })
					.scrollIntoViewIfNeeded();
		}
	});
}

test('OmniVoice fields preserve primary and alternative voice settings through reload', async ({
	page
}, info) => {
	await prepareOmniVoice(page);
	await page.goto('/app/settings/tts');
	await expect(page.getByRole('heading', { name: 'Primary voice', exact: true })).toBeVisible();
	const before = await speechSettings(page);
	const speed = page.getByRole('slider', { name: 'Speed', exact: true });
	await speed.focus();
	await speed.press('ArrowRight');
	const steps = page.getByRole('slider', { name: 'Num Step', exact: true });
	await steps.focus();
	await steps.press('ArrowRight');
	await page.locator('#omnivoice-language').selectOption('de');
	await page.locator('#omnivoice-voice').selectOption('ash');
	const changed = await speechSettings(page);
	expect(changed.speed).toBe(1.1);
	expect(changed.numStep).toBe(33);
	expect(changed.activeLanguage).toBe('de');
	expect(changed.activeVoiceId).toBe('ash');
	for (const key of [
		'altLanguage',
		'altVoiceId',
		'altSpeed',
		'altNumStep',
		'positionTemperature',
		'classTemperature'
	])
		expect(changed[key]).toEqual(before[key]);
	await page.reload();
	await expect(speed).toHaveValue('1.1');
	await expect(page.locator('#omnivoice-alt-language')).toHaveValue('ja');
	await page.getByRole('checkbox', { name: 'Speak foreign words with a second voice' }).uncheck();
	await expect(page.locator('#omnivoice-alt-language')).toHaveCount(0);
	await page.getByRole('checkbox', { name: 'Speak foreign words with a second voice' }).check();
	await expect(page.locator('#omnivoice-alt-language')).toHaveValue('ja');
	await page.screenshot({ path: info.outputPath('omnivoice-edited.png') });
	await page.getByRole('radio', { name: 'Cloned', exact: true }).first().check();
	await page.getByRole('button', { name: 'Clone New', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	const box = (await dialog.boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Clone New', exact: true })).toBeVisible();
});

test('shared LLM and display controls keep their existing values and callbacks', async ({
	page
}) => {
	await openApp(page);
	await page.goto('/app/settings/llm');
	await waitForHydration(page);
	const toggle = page.getByRole('switch', { name: 'Chat (LLM)', exact: true });
	await toggle.click();
	await expect(toggle).toBeChecked();
	await toggle.click();
	await expect(toggle).not.toBeChecked();
	await page.goto('/app/settings/display');
	await waitForHydration(page);
	await page
		.getByRole('group', { name: 'Chat display mode' })
		.getByRole('button', { name: 'Chat window', exact: true })
		.click();
	await expect(page.getByRole('group', { name: 'Chat window layout' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Reset position' })).toHaveCount(0);
	await page
		.getByRole('group', { name: 'Chat window dock side' })
		.getByRole('button', { name: 'Left', exact: true })
		.click();
	await page.getByRole('switch', { name: 'Wait tone', exact: true }).check();
	await page.getByRole('button', { name: 'Increase typing delay' }).click();
	await page.reload();
	await expect(page.getByRole('switch', { name: 'Wait tone', exact: true })).toBeChecked();
	await expect(
		page.getByRole('spinbutton', { name: 'Typing indicator delay in seconds' })
	).toHaveValue('0.1');
	await page.getByRole('button', { name: 'Reset to defaults' }).click();
	await expect(page.getByRole('switch', { name: 'Wait tone', exact: true })).not.toBeChecked();
	await expect(
		page.getByRole('spinbutton', { name: 'Typing indicator delay in seconds' })
	).toHaveValue('0.0');
});

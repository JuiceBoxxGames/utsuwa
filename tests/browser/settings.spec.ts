import { test, expect, type Page } from '@playwright/test';
import { openApp, waitForHydration, selectOption, snap } from './helpers';

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
	test(`every settings page fits the viewport in ${theme} mode`, async ({ page }) => {
		test.setTimeout(90_000);
		await page.route('**/api/mcp/tools', (route) => route.fulfill({ json: { tools: [], errors: [] } }));
		await prepareOmniVoice(page);
		await page.emulateMedia({ colorScheme: theme as 'light' | 'dark', reducedMotion: 'reduce' });
		for (const route of [
			'persona',
			'display',
			'animations',
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
			await snap(page, `settings-${route}-${theme}.png`);
			if (route === 'developer')
				await page
					.getByRole('button', { name: 'Reset Character Data', exact: true })
					.scrollIntoViewIfNeeded();
		}
	});
}

test('OmniVoice fields preserve primary and alternative voice settings through reload', async ({
	page
}) => {
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
	await selectOption(page, page.locator('#omnivoice-language'), 'de');
	await selectOption(page, page.locator('#omnivoice-voice'), 'ash');
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
	await expect(page.locator('#omnivoice-alt-language')).toHaveAttribute('data-value', 'ja');
	await page.getByRole('checkbox', { name: 'Speak foreign words with a second voice' }).uncheck();
	await expect(page.locator('#omnivoice-alt-language')).toHaveCount(0);
	await page.getByRole('checkbox', { name: 'Speak foreign words with a second voice' }).check();
	await expect(page.locator('#omnivoice-alt-language')).toHaveAttribute('data-value', 'ja');
	await snap(page, 'omnivoice-edited.png');
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

test('settings search finds categories and Escape clears it without leaving settings', async ({ page }) => {
	await page.goto('/app/settings/display');
	await waitForHydration(page);
	await page.keyboard.press('/');
	const search = page.getByRole('textbox', { name: 'Search settings' });
	await expect(search).toBeFocused();
	await snap(page, 'settings-search-focused.png');
	await search.fill('voice');
	await expect(page.locator('.nav-item')).toHaveCount(1);
	await expect(page.getByRole('link', { name: 'TTS', exact: true })).toBeVisible();
	await search.fill('no-such-setting');
	await expect(page.locator('.search-empty')).toHaveText('No matching settings');
	await search.press('Escape');
	await expect(search).toHaveValue('');
	await expect(page).toHaveURL(/\/settings\/display$/);
	await expect(page.getByRole('link', { name: 'Display', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('appearance persists and app tokens follow the selected theme', async ({ page }) => {
	await page.goto('/app/settings/display');
	await waitForHydration(page);
	const themes = page.getByRole('group', { name: 'Color theme' });
	for (const [label, canvas, accent] of [
		['Light', '#fcfcfc', '#04b2fd'],
		['Dark', '#0a0a0a', '#04b2fd']
	]) {
		await themes.getByRole('button', { name: label, exact: true }).click();
		await page.reload();
		await waitForHydration(page);
		await expect(themes.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
		const colors = await page.evaluate(() => {
			const style = getComputedStyle(document.documentElement);
			return ['--bg-page', '--accent'].map(name => style.getPropertyValue(name).trim());
		});
		expect(colors).toEqual([canvas, accent]);
	}
	await page.emulateMedia({ colorScheme: 'light' });
	await themes.getByRole('button', { name: 'System', exact: true }).click();
	await expect(page.locator('html')).not.toHaveClass(/dark/);
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect(page.locator('html')).toHaveClass(/dark/);
});


test('dropdowns share T3 surfaces and keep keyboard selection and dismissal', async ({ page }) => {
	await prepareOmniVoice(page);
	await page.goto('/app/settings/tts');
	await waitForHydration(page);
	const language = page.locator('#omnivoice-language');
	for (const theme of ['light', 'dark']) {
		await page.emulateMedia({ colorScheme: theme as 'light' | 'dark', reducedMotion: 'reduce' });
		await language.focus();
		await language.press('ArrowDown');
		const popup = page.getByRole('listbox');
		await expect(popup).toBeVisible();
		const box = (await popup.boundingBox())!;
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
		expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
		const recipe = await popup.evaluate(el => {
			const style = getComputedStyle(el);
			return { radius: style.borderRadius, padding: style.padding };
		});
		expect(recipe.radius).toBe('8px');
		expect(recipe.padding).toBe('4px');
		// The theme follows the media change event, which lands on a later frame.
		await expect
			.poll(() => popup.evaluate(el => getComputedStyle(el).backdropFilter))
			.toContain(theme === 'dark' ? '16px' : '12px');
		await snap(page, `language-dropdown-${theme}.png`);
		await page.keyboard.press('Escape');
		await expect(popup).toHaveCount(0);
		await expect(language).toBeFocused();
		await expect(page).toHaveURL(/settings\/tts$/);
	}
	await language.press('ArrowDown');
	await page.keyboard.press('Home');
	const firstValue = await page.getByRole('option').first().getAttribute('data-value');
	await page.keyboard.press('Enter');
	await expect(language).toHaveAttribute('data-value', firstValue!);
	expect((await speechSettings(page)).activeLanguage).toBe(firstValue);
	await page.locator('.dropdown-trigger').click();
	await expect(page.getByRole('menu')).toBeVisible();
	await snap(page, 'provider-dropdown-dark.png');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('menu')).toHaveCount(0);
	await expect(page.locator('.dropdown-trigger')).toBeFocused();
});

test('Fish Audio setup offers its models and voices without a failed model fetch', async ({
	page
}) => {
	await openApp(page);
	await page.evaluate(async () => {
		const path = '/src/lib/stores/modules.svelte.ts';
		await (await import(/* @vite-ignore */ path)).modulesStore.setModuleEnabled('speech', true);
	});
	await page.goto('/app/settings/tts');
	await waitForHydration(page);
	await page.locator('.content .dropdown-trigger').click();
	await page.getByRole('menuitem', { name: 'Fish Audio', exact: true }).click();

	const key = page.getByLabel('API Key', { exact: true });
	await key.fill('browser-test-only');
	await key.press('Tab');
	// Fish Audio has no model-list endpoint, so the key blur must settle on the
	// registry models rather than an "Unknown provider" error.
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const path = '/src/lib/stores/settings.svelte.ts';
				const { settingsStore } = await import(/* @vite-ignore */ path);
				return settingsStore.getCachedModels('fish-audio')?.map((m: { id: string }) => m.id);
			})
		)
		.toEqual(['s2.1-pro', 's2.1-pro-free', 's2-pro', 's1']);
	await expect(key).not.toHaveClass(/error/);
	await expect(page.locator('.model-dropdown-trigger')).toHaveText('S2.1 Pro');
	await expect(page.getByLabel('Voice ID', { exact: true })).toHaveValue(
		'933563129e564b19a115bedd57b7406a'
	);
	await expect(page.locator('#fish-audio-voices option')).toHaveCount(9);
	expect(await speechSettings(page)).toMatchObject({
		activeProvider: 'fish-audio',
		activeModel: 's2.1-pro',
		activeVoiceId: '933563129e564b19a115bedd57b7406a'
	});
	await snap(page, 'fish-audio-settings.png');
});

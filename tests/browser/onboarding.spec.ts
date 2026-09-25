import { test, expect } from '@playwright/test';
import { openApp, waitForHydration, snap } from './helpers';

test('setup takes one small decision at a time and can finish without service keys', async ({ page }) => {
	// With VISUAL_REVIEW, four screenshots composite the blurred avatar on CI's software renderer.
	test.setTimeout(180_000);
	await openApp(page, {}, false);
	const dialog = page.getByRole('dialog', { name: 'Set up your companion' });
	await expect(dialog).toBeVisible();
	await snap(page, 'setup-welcome.png');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Get started' }).click();
	await expect(dialog.getByRole('heading', { name: 'Choose your avatar' })).toBeVisible();
	await snap(page, 'setup-avatar.png');
	await dialog.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(dialog.getByRole('heading', { name: 'Name your companion' })).toBeFocused();
	await expect(dialog.locator('textarea')).not.toBeVisible();
	await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Mika');
	await dialog.getByText('Personalize their personality', { exact: true }).click();
	await dialog.getByRole('textbox', { name: 'Core personality', exact: true }).fill('A kind, curious companion.');
	await dialog.getByRole('button', { name: 'Next', exact: true }).click();
	await dialog.getByRole('button', { name: /^Companion A friendly/ }).click();
	await dialog.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(dialog.getByRole('heading', { name: 'Connect a chat model' })).toBeVisible();
	await expect(dialog.getByRole('switch', { name: 'Spoken replies' })).toHaveCount(0);
	await expect(dialog.getByRole('switch', { name: 'Context window scaling' })).not.toBeVisible();
	await snap(page, 'setup-chat.png');
	await dialog.getByRole('button', { name: 'Set up later', exact: true }).click();
	await expect(dialog.getByRole('heading', { name: 'Want to hear them?' })).toBeVisible();
	await expect(dialog.getByLabel('Chat API key')).toHaveCount(0);
	await dialog.getByRole('switch', { name: 'Spoken replies' }).check();
	await dialog.getByRole('button', { name: 'Back', exact: true }).click();
	await dialog.getByRole('button', { name: 'Set up later', exact: true }).click();
	await expect(dialog.getByRole('switch', { name: 'Spoken replies' })).toBeChecked();
	await dialog.getByRole('switch', { name: 'Spoken replies' }).uncheck();
	await dialog.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(dialog).toContainText('Connect a chat model in Settings');
	await snap(page, 'setup-complete.png');
	await page.evaluate(async () => {
		const path = '/src/lib/stores/character.svelte.ts';
		const { characterStore } = await import(/* @vite-ignore */ path);
		const complete = characterStore.markOnboardingComplete;
		characterStore.markOnboardingComplete = async () => {
			await complete();
			await new Promise<void>(resolve => {
				(window as Window & { finishOnboardingSave?: () => void }).finishOnboardingSave = resolve;
			});
		};
	});
	await dialog.getByRole('button', { name: 'Open companion', exact: true }).click();
	await expect.poll(() => page.evaluate(() =>
		typeof (window as Window & { finishOnboardingSave?: () => void }).finishOnboardingSave
	)).toBe('function');
	await expect(dialog).toBeVisible();
	await page.evaluate(() => (window as Window & { finishOnboardingSave?: () => void }).finishOnboardingSave?.());
	await expect(dialog).toHaveCount(0);
	await page.goto('/app');
	await waitForHydration(page);
	await expect(dialog).toHaveCount(0);
	const saved = await page.evaluate(async () => {
		const path = '/src/lib/stores/character.svelte.ts';
		const modulePath = '/src/lib/stores/modules.svelte.ts';
		const { characterStore } = await import(/* @vite-ignore */ path);
		const { modulesStore } = await import(/* @vite-ignore */ modulePath);
		return { name: characterStore.state.name, personality: characterStore.state.systemPrompt, mode: characterStore.appMode, chat: modulesStore.isModuleEnabled('consciousness'), voice: modulesStore.isModuleEnabled('speech') };
	});
	expect(saved).toEqual({ name: 'Mika', personality: 'A kind, curious companion.', mode: 'companion', chat: false, voice: false });
});

test('chat setup enables only the configured service and preserves it through Back', async ({ page }) => {
	test.setTimeout(90_000);
	await page.route('**/api/providers/models', route => route.fulfill({ json: {
		models: [{ id: 'gpt-4o-mini', name: 'GPT-4o mini' }]
	} }));
	await openApp(page, {}, false);
	const dialog = page.getByRole('dialog', { name: 'Set up your companion' });
	await dialog.getByRole('button', { name: 'Get started' }).click();
	for (let step = 0; step < 3; step++) await dialog.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(dialog.getByRole('heading', { name: 'Connect a chat model' })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
	await dialog.locator('.dropdown-trigger').click();
	await page.getByRole('menuitem', { name: 'OpenAI', exact: true }).click();
	await dialog.getByLabel('Chat API key').fill('test-only-key');
	await dialog.getByLabel('Chat API key').press('Tab');
	await expect(dialog.locator('.model-dropdown-trigger')).toContainText('GPT-4o mini');
	await dialog.getByRole('button', { name: 'Next', exact: true }).click();
	await dialog.getByRole('button', { name: 'Back', exact: true }).click();
	await expect(dialog.getByLabel('Chat API key')).toHaveValue('test-only-key');
	await dialog.getByRole('button', { name: 'Next', exact: true }).click();
	await dialog.getByRole('button', { name: 'Set up later', exact: true }).click();
	await dialog.getByRole('button', { name: 'Start chatting', exact: true }).click();
	await page.reload();
	await waitForHydration(page);
	await expect(dialog).toHaveCount(0);
	const enabled = await page.evaluate(async () => {
		const path = '/src/lib/stores/modules.svelte.ts';
		const { modulesStore } = await import(/* @vite-ignore */ path);
		return { chat: modulesStore.isModuleEnabled('consciousness'), voice: modulesStore.isModuleEnabled('speech') };
	});
	expect(enabled).toEqual({ chat: true, voice: false });
});

import { test, expect, type Page } from '@playwright/test';
import { openApp, waitForHydration, snap } from './helpers';

// The saved character record, read straight from IndexedDB. Reloading before a
// write lands races the next page's read, so tests wait on this first.
function savedCharacter(page: Page) {
	return page.evaluate(
		() =>
			new Promise<Record<string, unknown> | undefined>((resolve) => {
				const open = indexedDB.open('utsuwa-db');
				open.onsuccess = () => {
					const read = open.result.transaction('characterStates').objectStore('characterStates').getAll();
					read.onsuccess = () => {
						open.result.close();
						resolve(read.result[0]);
					};
				};
			})
	);
}

test('the popover and Character settings share live stats and Profile saves edits', async ({ page }) => {
	await openApp(page);
	await page.evaluate(async () => {
		const path = '/src/lib/stores/character.svelte.ts';
		const { characterStore } = await import(/* @vite-ignore */ path);
		characterStore.setAppMode('dating_sim');
		Object.assign(characterStore.state, { energy: 72, trust: 48, affection: 650 });
	});
	await page.getByRole('button', { name: 'Companion stats', exact: true }).click();
	const popup = page.getByRole('dialog', { name: 'Companion stats' });
	const before = await popup.locator('.companion-state-summary').innerText();
	await popup.getByRole('link', { name: 'Character settings' }).click();
	await expect(page).toHaveURL(/persona\?view=state$/);
	await expect(page.getByRole('tab', { name: 'State & activity' })).toHaveAttribute('aria-selected', 'true');
	expect(await page.locator('.companion-state-summary').innerText()).toBe(before);
	await snap(page, 'character-state.png');
	await page.getByRole('tab', { name: 'Profile', exact: true }).click();
	await page.getByRole('textbox', { name: 'Character name', exact: true }).fill('Aki');
	await page.getByRole('textbox', { name: 'Core personality', exact: true }).fill('Patient, curious, and direct.');
	await page.getByRole('textbox', { name: 'Core personality', exact: true }).press('Tab');
	await expect.poll(async () => (await savedCharacter(page))?.systemPrompt).toBe('Patient, curious, and direct.');
	await expect.poll(async () => (await savedCharacter(page))?.name).toBe('Aki');
	await page.reload();
	await waitForHydration(page);
	await expect(page.getByRole('textbox', { name: 'Character name', exact: true })).toHaveValue('Aki');
	await expect(page.getByRole('textbox', { name: 'Core personality', exact: true })).toHaveValue('Patient, curious, and direct.');
	await snap(page, 'character-profile.png');
	const modes = page.getByRole('group', { name: 'App mode' });
	await modes.getByRole('button', { name: 'Companion', exact: true }).click();
	const confirm = page.getByRole('dialog', { name: 'Change companion mode?' });
	await expect(confirm).toBeVisible();
	await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(modes.getByRole('button', { name: 'Dating sim', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await modes.getByRole('button', { name: 'Companion', exact: true }).click();
	await confirm.getByRole('button', { name: 'Change mode', exact: true }).click();
	await page.getByRole('tab', { name: 'State & activity' }).click();
	await expect(page.getByRole('region', { name: 'Relationship stats' })).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Character stats' })).toBeVisible();
});

test('a custom system prompt saves, reaches the model, and resets after confirming', async ({ page }) => {
	await openApp(page);
	const prompts: string[] = [];
	await page.route('**/api/chat', async (route) => {
		prompts.push(route.request().postDataJSON().systemPrompt);
		const reply = 'Hi!\n```json\n{"mood_change":{"emotion":"happy","intensity_delta":0}}\n```';
		await route.fulfill({ contentType: 'text/plain', body: `0:${JSON.stringify(reply)}\n` });
	});
	await page.evaluate(async () => {
		const load = (path: string) => import(/* @vite-ignore */ path);
		const { characterStore } = await load('/src/lib/stores/character.svelte.ts');
		const { settingsStore } = await load('/src/lib/stores/settings.svelte.ts');
		const { modulesStore } = await load('/src/lib/stores/modules.svelte.ts');
		const { eventsApi } = await load('/src/lib/engine/events.ts');
		const { allEvents } = await load('/src/lib/data/events/index.ts');
		characterStore.setAppMode('dating_sim');
		characterStore.updatePersona({ name: 'Aki' });
		settingsStore.setProviderConfig('openai', { apiKey: 'browser-test-only' });
		await modulesStore.setModuleSettings('consciousness', { activeProvider: 'openai', activeModel: 'gpt-4o-mini' });
		await modulesStore.setModuleEnabled('consciousness', true);
		await eventsApi.recordCompletedEvent(allEvents.find((e: { id: string }) => e.id === 'first_conversation'));
	});
	await expect.poll(async () => (await savedCharacter(page))?.name).toBe('Aki');
	await page.goto('/app/settings/persona');
	await waitForHydration(page);
	await expect(page.getByRole('textbox', { name: 'Character name', exact: true })).toHaveValue('Aki');
	const field = page.getByRole('textbox', { name: 'System prompt', exact: true });
	await expect(field).toHaveAttribute('placeholder', /^You are roleplaying as \{\{char\}\}/);
	await page.getByRole('button', { name: 'Start from default', exact: true }).click();
	await expect(field).toBeFocused();
	await expect(field).toHaveValue(/^You are roleplaying as \{\{char\}\}/);
	await field.fill('You are {{char}}, a sardonic bard.');
	await field.press('Tab');
	await expect.poll(async () => (await savedCharacter(page))?.customSystemPrompt).toBe('You are {{char}}, a sardonic bard.');
	await page.reload();
	await waitForHydration(page);
	await expect(field).toHaveValue('You are {{char}}, a sardonic bard.');

	await page.goto('/app');
	await waitForHydration(page);
	await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello');
	await page.getByRole('button', { name: 'Send message', exact: true }).click();
	await expect.poll(() => prompts.length).toBe(1);
	expect(prompts[0]).toContain('<system>\nYou are Aki, a sardonic bard.');
	expect(prompts[0]).not.toContain('roleplaying as');
	expect(prompts[0]).toContain('"mood_change"');

	await page.goto('/app/settings/persona');
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Reset to default', exact: true }).click();
	const confirm = page.getByRole('dialog', { name: 'Reset system prompt?' });
	await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(field).toHaveValue('You are {{char}}, a sardonic bard.');
	await page.getByRole('button', { name: 'Reset to default', exact: true }).click();
	await confirm.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect(field).toHaveValue('');
	await expect(page.getByRole('button', { name: 'Start from default', exact: true })).toBeVisible();
	await expect.poll(async () => (await savedCharacter(page))?.customSystemPrompt).toBe('');
	await page.reload();
	await waitForHydration(page);
	await expect(field).toHaveValue('');
});

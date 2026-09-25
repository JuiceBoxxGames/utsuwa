import { test, expect } from '@playwright/test';
import { waitForHydration, snap } from './helpers';

async function facts(page: import('@playwright/test').Page) {
	return page.evaluate(async () => {
		const path = '/src/lib/services/storage/memory.ts';
		return (await import(/* @vite-ignore */ path)).getFacts();
	});
}

test('manual memory persists, is retrieved, and requires confirmation to delete', async ({
	page
}) => {
	await page.goto('/app/settings/memory?view=facts');
	await waitForHydration(page);
	await expect(page.getByRole('heading', { name: 'Memory', exact: true })).toBeVisible();
	await page
		.getByRole('textbox', { name: 'Memory', exact: true })
		.fill('I prefer tea to coffee. <script>bad()</script>');
	await page.getByRole('button', { name: 'Add memory', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Memory saved.');
	expect((await facts(page))[0].content).toContain('<script>bad()</script>');
	await page.reload();
	await expect(page.locator('.fact-content')).toHaveText(
		'I prefer tea to coffee. <script>bad()</script>'
	);
	await page.getByRole('searchbox').fill('coffee');
	await snap(page, 'memory-facts.png');
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	expect(await facts(page)).toHaveLength(1);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	expect(await facts(page)).toHaveLength(1);
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await page.getByRole('button', { name: 'Delete memory', exact: true }).click();
	await expect(page.getByText('No memories match these filters.')).toBeVisible();
	expect(await facts(page)).toHaveLength(0);
});

test('tabs show saved data and parser samples never persist state', async ({ page }) => {
	await page.goto('/app/settings/memory?view=facts');
	await waitForHydration(page);
	await expect(page.getByRole('tab', { name: 'Facts', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await page.evaluate(async () => {
		const path = '/src/lib/db/index.ts';
		const { db } = await import(/* @vite-ignore */ path);
		const id = await db.sessions.add({
			startedAt: new Date(),
			messageCount: 1,
			summary: 'We talked about tea.',
			keyTopics: ['tea']
		});
		await db.conversationTurns.add({
			sessionId: id,
			role: 'user',
			content: 'A saved turn',
			createdAt: new Date()
		});
	});
	await page.getByRole('tab', { name: 'Sessions', exact: true }).click();
	await page.getByRole('tab', { name: 'Current', exact: true }).click();
	await expect(page.getByText('A saved turn', { exact: true })).toBeVisible();
	await page.getByRole('tab', { name: 'Saved', exact: true }).click();
	await expect(page.getByText('We talked about tea.', { exact: true })).toBeVisible();
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await page.getByText('Advanced', { exact: true }).click();
	await page.getByRole('tab', { name: 'State', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Character state', exact: true })).toBeVisible();
	const before = await facts(page);
	await page.getByRole('tab', { name: 'Parser test', exact: true }).click();
	await page.getByRole('button', { name: 'Parse sample', exact: true }).click();
	await expect(page.getByLabel('Parser result')).toContainText('newMemory');
	expect(await facts(page)).toEqual(before);
});

test('latest persisted session remains inspectable after reload and fact pagination stays bounded', async ({
	page
}) => {
	await page.goto('/app/settings/memory?view=facts');
	await waitForHydration(page);
	await expect(page.getByRole('tab', { name: 'Facts', exact: true })).toBeVisible();
	await page.evaluate(async () => {
		const path = '/src/lib/db/index.ts';
		const { db } = await import(/* @vite-ignore */ path);
		const id = await db.sessions.add({
			startedAt: new Date(),
			endedAt: new Date(),
			messageCount: 1,
			summary: '',
			keyTopics: []
		});
		await db.conversationTurns.add({
			sessionId: id,
			role: 'user',
			content: 'Most recent saved conversation',
			createdAt: new Date()
		});
		await db.facts.bulkAdd(
			Array.from({ length: 26 }, (_, i) => ({
				content: `Memory ${i}`,
				category: 'user',
				importance: 50,
				confidence: 1,
				source: 'manual',
				createdAt: new Date(i),
				referenceCount: 0
			}))
		);
	});
	await page.reload();
	await expect(page.locator('.fact-content')).toHaveCount(25);
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(page.locator('.fact-content')).toHaveCount(1);
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await page.getByRole('button', { name: 'Delete memory', exact: true }).click();
	await expect(page.locator('.fact-content')).toHaveCount(25);
	await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
	await page.getByRole('tab', { name: 'Sessions', exact: true }).click();
	await page.getByRole('tab', { name: 'Current', exact: true }).click();
	await expect(page.getByText('Most recent saved conversation', { exact: true })).toBeVisible();
});

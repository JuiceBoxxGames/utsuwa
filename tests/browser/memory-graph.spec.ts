import { test, expect } from '@playwright/test';
import { openApp, waitForHydration, selectOption } from './helpers';

test('brain shortcut opens the graph and empty memories lead to Facts', async ({ page }) => {
	await openApp(page, { chatDisplayMode: 'sidebar' });
	await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep my draft');
	await page.getByRole('button', { name: 'Open memory graph' }).click();
	await expect(page).toHaveURL(/\/app\/settings\/memory\?view=graph$/);
	await expect(page.getByRole('tab', { name: 'Graph', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(page.getByRole('heading', { name: 'No connected memories yet' })).toBeVisible();
	await page.getByRole('button', { name: 'View facts', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Memory', exact: true })).toBeVisible();
	await page.getByRole('textbox', { name: 'Memory', exact: true }).fill('An unfinished memory');
	await page.goBack();
	await expect(page.getByRole('tab', { name: 'Graph', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(page.locator('.memory-inspector')).toHaveCount(0);
	await page.getByRole('tab', { name: 'Facts', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Memory', exact: true })).toHaveValue(
		'An unfinished memory'
	);
	await expect(page.locator('.memory-graph')).toHaveCount(0);
	await page.getByRole('link', { name: 'Utsuwa home', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
		'Keep my draft'
	);
});

for (const motion of ['reduce', 'no-preference'] as const) {
	test(`graph selection, category filters, expansion and fact navigation with ${motion} motion`, async ({
		page
	}, info) => {
		await page.emulateMedia({ reducedMotion: motion });
		await page.goto('/app/settings/memory');
		await waitForHydration(page);
		const ids = await page.evaluate(async () => {
			const path = '/src/lib/db/index.ts';
			const modelPath = '/src/lib/engine/embedding-version.ts';
			const { db } = await import(/* @vite-ignore */ path);
			const { EMBEDDING_MODEL_ID } = await import(/* @vite-ignore */ modelPath);
			const base = {
				importance: 65,
				confidence: 1,
				referenceCount: 3,
				source: 'manual',
				createdAt: new Date(),
				embedding: [1, ...Array(383).fill(0)],
				embeddingModel: EMBEDDING_MODEL_ID
			};
			return await db.facts.bulkAdd(
				[
					{ ...base, content: 'Tea after dinner', category: 'user' },
					{
						...base,
						content: 'Our Friday tea ritual <b>stays plain text</b>',
						category: 'relationship'
					},
					{
						...base,
						content: 'Still preparing connections',
						category: 'user',
						embedding: undefined
					}
				],
				{ allKeys: true }
			);
		});
		await page.reload();
		if (motion === 'no-preference')
			await page.evaluate(() => document.documentElement.classList.add('dark'));
		await expect(page.getByText('2 memories · 1 connection', { exact: true })).toBeVisible();
		const canvas = page.locator('.graph-container canvas');
		await expect(canvas).toBeVisible();
		expect(
			(await page.getByRole('button', { name: 'Inspect a memory', exact: true }).boundingBox())!
				.height
		).toBeGreaterThanOrEqual(info.project.name === 'mobile' ? 44 : 32);
		await canvas.scrollIntoViewIfNeeded();
		// Click a real rendered node, not the graph library's callback.
		let point: { x: number; y: number } | null = null;
		await expect
			.poll(
				async () => {
					const previous = point;
					point = await canvas.evaluate((element: HTMLCanvasElement) => {
						const context = element.getContext('2d')!;
						const pixels = context.getImageData(0, 0, element.width, element.height).data;
						let x = 0,
							y = 0,
							count = 0;
						for (let i = 0; i < pixels.length; i += 4) {
							if (
								pixels[i] > 240 &&
								pixels[i + 1] > 55 &&
								pixels[i + 1] < 90 &&
								pixels[i + 2] > 110 &&
								pixels[i + 2] < 145 &&
								pixels[i + 3] > 200
							) {
								x += (i / 4) % element.width;
								y += Math.floor(i / 4 / element.width);
								count++;
							}
						}
						return count
							? {
									x: ((x / count) * element.clientWidth) / element.width,
									y: ((y / count) * element.clientHeight) / element.height
								}
							: null;
					});
					return (
						!!point &&
						!!previous &&
						Math.abs(point.x - previous.x) < 0.5 &&
						Math.abs(point.y - previous.y) < 0.5
					);
				},
				{ timeout: 15_000 }
			)
			.toBe(true);
		await page.screenshot({
			path: info.outputPath('memory-graph-overview.png'),
			animations: 'disabled'
		});
		if (info.project.name === 'mobile') {
			await canvas.tap({ position: point! });
		} else {
			await canvas.click({ position: point! });
		}
		const detail = page.getByRole('complementary', { name: 'Memory details' });
		await expect(detail).toContainText('Our Friday tea ritual <b>stays plain text</b>');
		await expect(detail.locator('b')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Inspect a memory', exact: true })).toHaveAttribute('data-value',
			String(ids[1])
		);
		await page.getByRole('button', { name: 'Relationship', exact: true }).click();
		await expect(detail).toHaveCount(0);
		await expect(page.getByText('1 memory · 0 connections', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Relationship', exact: true }).click();
		await selectOption(page, page.getByRole('button', { name: 'Inspect a memory', exact: true }), String(ids[0]));
		await expect(detail).toContainText('Tea after dinner');
		await detail.scrollIntoViewIfNeeded();
		await page.screenshot({
			path: info.outputPath('memory-graph-details.png'),
			animations: 'disabled'
		});
		const expand = page.getByRole('button', { name: 'Expand graph', exact: true });
		await expand.click();
		const dialog = page.getByRole('dialog', { name: 'Memory graph', exact: true });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('complementary', { name: 'Memory details' })).toContainText(
			'Tea after dinner'
		);
		await expect
			.poll(async () => (await dialog.locator('canvas').boundingBox())!.width)
			.toBeGreaterThan(100);
		await page.screenshot({
			path: info.outputPath('memory-graph-expanded.png'),
			animations: 'disabled'
		});
		await dialog.getByRole('complementary', { name: 'Memory details' }).scrollIntoViewIfNeeded();
		await page.screenshot({
			path: info.outputPath('memory-graph-expanded-details.png'),
			animations: 'disabled'
		});
		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible();
		await expect(expand).toBeFocused();
		await expect(page.locator('.graph-container canvas')).toHaveCount(1);
		await page.getByRole('button', { name: 'Open in Facts', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`view=facts&fact=${ids[0]}$`));
		await expect(page.locator('.records .fact-content')).toHaveText('Tea after dinner');
		await page.reload();
		await expect(page.locator('.records .fact-content')).toHaveText('Tea after dinner');
		await page.getByRole('button', { name: 'Show all facts' }).click();
		await expect(page.locator('.records .fact-content')).toHaveCount(3);
		await page.getByRole('tab', { name: 'Graph', exact: true }).click();
		await expect(page.getByText('2 memories · 1 connection', { exact: true })).toBeVisible();
		expect(
			await page.evaluate(async () => {
				const path = '/src/lib/db/index.ts';
				return (await import(/* @vite-ignore */ path)).db.facts.count();
			})
		).toBe(3);
	});
}

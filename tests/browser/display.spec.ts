import { test, expect } from '@playwright/test';
import { openApp, waitForHydration } from './helpers';

for (const side of ['left', 'right']) {
	test(`docked ${side} reserves scene space and photo mode restores the full stage`, async ({
		page
	}, info) => {
		await openApp(page, {
			chatDisplayMode: 'both',
			chatWindowLayout: 'docked',
			sidebarPosition: side
		});
		const panel = page.getByRole('region', { name: 'Chat window' });
		const stage = page.locator('.stage-container');
		const box = (await panel.boundingBox())!;
		const scene = (await stage.boundingBox())!;
		const mobile = page.viewportSize()!.width <= 720;
		if (mobile) expect(scene.y + scene.height).toBeLessThanOrEqual(box.y + 1);
		else if (side === 'left') expect(box.x + box.width).toBeLessThanOrEqual(scene.x + 1);
		else expect(scene.x + scene.width).toBeLessThanOrEqual(box.x + 1);
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
		await page.screenshot({ path: info.outputPath(`docked-${side}.png`) });
		await page.evaluate(async () => {
			const path = '/src/lib/stores/photomode.svelte.ts';
			const { photomodeStore } = await import(/* @vite-ignore */ path);
			photomodeStore.enter();
		});
		await expect(panel).not.toBeVisible();
		expect((await stage.boundingBox())!.width).toBe(page.viewportSize()!.width);
	});
}

test('camera pan persists and reset clears only the main profile', async ({ page }) => {
	await openApp(page, { camera: { panX: 0.25 }, overlayCamera: { panX: -0.5 } });
	await page.getByRole('button', { name: 'Controls', exact: true }).click();
	await page.getByRole('button', { name: 'Camera settings', exact: true }).click();
	const pan = page.getByRole('slider', { name: /Horizontal pan/ });
	await expect(pan).toHaveValue('0.25');
	await pan.focus();
	for (let i = 0; i < 5; i++) await pan.press('ArrowRight');
	await page.reload();
	await page.waitForFunction(() => document.querySelector('.chat-window')?.hasAttribute('style'));
	await page.getByRole('button', { name: 'Controls', exact: true }).click();
	await page.getByRole('button', { name: 'Camera settings', exact: true }).click();
	await expect(pan).toHaveValue('0.5');
	await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
	await expect(pan).toHaveValue('0');
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('utsuwa-display')!));
	expect(saved.overlayCamera.panX).toBe(-0.5);
});

test('overlay keeps its own camera controls and compact chat when the main layout is docked', async ({
	page
}) => {
	await openApp(page, {
		chatDisplayMode: 'both',
		chatWindowLayout: 'docked',
		camera: { panX: 0.25 },
		overlayCamera: { panX: -0.5 }
	});
	await page.goto('/overlay');
	await waitForHydration(page);
	await page.locator('.overlay-container').hover();
	await page.getByRole('button', { name: 'Camera settings', exact: true }).click();
	const pan = page.getByRole('slider', { name: /Horizontal pan/ });
	await expect(pan).toHaveValue('-0.5');
	await pan.focus();
	await pan.press('ArrowRight');
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('utsuwa-display')!));
	expect(saved.overlayCamera.panX).toBe(-0.45);
	expect(saved.camera.panX).toBe(0.25);
	await expect(page.locator('.chat-window.pinned')).toHaveCount(0);
});

test('pan shifts the loaded avatar inside the reserved scene', async ({ page }, info) => {
	await openApp(page, { chatDisplayMode: 'both', chatWindowLayout: 'docked' });
	await expect
		.poll(
			() =>
				page.evaluate(async () => {
					const path = '/src/lib/stores/vrm.svelte.ts';
					const { vrmStore } = await import(/* @vite-ignore */ path);
					return !!vrmStore.vrm && !vrmStore.isLoading && !!vrmStore.headScreenPosition;
				}),
			{ timeout: 20_000 }
		)
		.toBe(true);
	const headX = () =>
		page.evaluate(async () => {
			const path = '/src/lib/stores/vrm.svelte.ts';
			return (await import(/* @vite-ignore */ path)).vrmStore.headScreenPosition.x;
		});
	await page.getByRole('button', { name: 'Controls', exact: true }).click();
	await page.getByRole('button', { name: 'Camera settings', exact: true }).click();
	const pan = page.getByRole('slider', { name: /Horizontal pan/ });
	await pan.focus();
	const before = await headX();
	for (let i = 0; i < 5; i++) await pan.press('ArrowRight');
	await expect(pan).toHaveValue('0.25');
	await expect.poll(headX).toBeLessThan(before - 3);
	await page.screenshot({ path: info.outputPath('docked-avatar-pan.png') });
});

for (const layout of ['floating', 'docked']) {
	test(`${layout} input stays above a reduced visual viewport`, async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openApp(page, { chatDisplayMode: 'sidebar', chatWindowLayout: layout });
		const savedGeometry = await page.evaluate(() => localStorage.getItem('utsuwa-chat-panel'));
		await page.evaluate(() => {
			Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 420 });
			window.visualViewport!.dispatchEvent(new Event('resize'));
		});
		const input = page.getByRole('textbox', { name: 'Message', exact: true });
		await expect
			.poll(async () => {
				const box = (await input.boundingBox())!;
				return box.y + box.height;
			})
			.toBeLessThanOrEqual(420);
		expect(await page.evaluate(() => localStorage.getItem('utsuwa-chat-panel'))).toBe(
			savedGeometry
		);
	});
}

import { test, expect } from '@playwright/test';
import { openApp, waitForHydration } from './helpers';

for (const side of ['left', 'right']) {
	test(`docked ${side} reserves scene space and photo mode restores the full stage`, async ({
		page
	}, info) => {
		await openApp(page, {
			chatDisplayMode: 'sidebar',
			sidebarPosition: side
		});
		const panel = page.getByRole('region', { name: 'Chat window' });
		const stage = page.locator('.character-frame');
		const canvas = page.locator('.stage-container canvas').first();
		const box = (await panel.boundingBox())!;
		const scene = (await stage.boundingBox())!;
		const mobile = page.viewportSize()!.width <= 720;
		await expect(canvas).toBeVisible();
		expect((await canvas.boundingBox())!.width).toBe(page.viewportSize()!.width);
		expect((await canvas.boundingBox())!.height).toBe(page.viewportSize()!.height);
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
	// Two avatar loads plus interactions exceed 45 seconds on CI software rendering.
	test.setTimeout(90_000);
	await openApp(page, { camera: { panX: 0.25 }, overlayCamera: { panX: -0.5 } });
	await page.getByRole('button', { name: 'Controls', exact: true }).click();
	await page.getByRole('button', { name: 'Camera settings', exact: true }).click();
	const pan = page.getByRole('slider', { name: /Horizontal pan/ });
	await expect(pan).toHaveValue('0.25');
	await pan.focus();
	for (let i = 0; i < 5; i++) await pan.press('ArrowRight');
	await page.reload();
	await waitForHydration(page);
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
		chatDisplayMode: 'sidebar',
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
	await expect(page.locator('.chat-window.docked')).toHaveCount(0);
});

test('pan shifts the loaded avatar inside the reserved scene', async ({ page }, info) => {
	await openApp(page, { chatDisplayMode: 'sidebar' });
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

for (const layout of [undefined, 'floating']) {
	test(`${layout ?? 'default'} layout docks the input above a reduced visual viewport`, async ({
		page
	}) => {
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
		await expect
			.poll(async () => (await page.locator('.chat-window .messages').boundingBox())!.height)
			.toBeGreaterThanOrEqual(60);
		const send = (await page
			.getByRole('button', { name: 'Send message', exact: true })
			.boundingBox())!;
		expect(send.y + send.height).toBeLessThanOrEqual(420);
		expect(await page.evaluate(() => localStorage.getItem('utsuwa-chat-panel'))).toBe(
			savedGeometry
		);
	});
}

test('old floating preferences cannot restore dragging or resizing', async ({ page }, info) => {
	// Two avatar loads plus interactions exceed 45 seconds on CI software rendering.
	test.setTimeout(90_000);
	await openApp(page, { chatDisplayMode: 'sidebar', chatWindowLayout: 'floating' });
	await page.evaluate(() =>
		localStorage.setItem('utsuwa-chat-panel', JSON.stringify({ x: -900, y: -900, w: 20, h: 20 }))
	);
	await page.reload();
	await waitForHydration(page);
	const panel = page.getByRole('region', { name: 'Chat window' });
	await expect(panel).toBeVisible();
	await expect(page.locator('.resize-handle')).toHaveCount(0);
	await panel.evaluate(async (element) => {
		await Promise.all(
			element.getAnimations().map((animation) => animation.finished.catch(() => {}))
		);
	});
	const before = (await panel.boundingBox())!;
	expect(before.x).toBeGreaterThanOrEqual(0);
	expect(before.y).toBeGreaterThanOrEqual(0);
	const header = await page.locator('.window-header').boundingBox();
	await page.mouse.move(header!.x + header!.width / 2, header!.y + 5);
	await page.mouse.down();
	await page.mouse.move(50, 80, { steps: 5 });
	await page.mouse.up();
	expect(await panel.boundingBox()).toEqual(before);
	expect(await page.evaluate(() => window.getSelection()?.toString().trim())).toBe('');
	await page.evaluate(() => window.getSelection()?.removeAllRanges());
	await page.evaluate(async () => {
		const path = '/src/lib/stores/chat.svelte.ts';
		const { chatStore } = await import(/* @vite-ignore */ path);
		chatStore.addMessage('user', 'Can you help me plan the afternoon?');
		chatStore.addMessage('assistant', 'Sure. What do you want to make time for?');
	});
	await expect(page.getByRole('button', { name: 'Copy message' })).toHaveCount(2);
	await page.screenshot({ path: info.outputPath('native-docked-chat.png') });
});

test('only settings switch between the persistent window and immersive bar', async ({ page }) => {
	await openApp(page, { chatDisplayMode: 'sidebar' });
	const panel = page.getByRole('region', { name: 'Chat window' });
	await expect(panel).toBeVisible();
	await expect(page.getByRole('button', { name: 'Close chat', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Chat history', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /Dock on/ })).toHaveCount(0);
	await expect(panel.locator('.window-header').getByRole('button')).toHaveCount(1);
	await page.evaluate(async () => {
		const path = '/src/lib/stores/chat.svelte.ts';
		(await import(/* @vite-ignore */ path)).chatStore.addMessage('user', 'A message to clear');
	});
	page.once('dialog', (dialog) => dialog.dismiss());
	await page.getByRole('button', { name: 'Clear chat history', exact: true }).click();
	await expect(panel.locator('.message.user')).toHaveText('A message to clear');
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Clear chat history', exact: true }).click();
	await expect(panel.locator('.message')).toHaveCount(0);
	await expect(panel).toBeVisible();
	await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep my draft');
	await page.getByRole('button', { name: 'Controls', exact: true }).click();
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await page.getByRole('link', { name: 'Display', exact: true }).click();
	const modes = page.getByRole('group', { name: 'Chat display mode' });
	await expect(modes.getByRole('button')).toHaveCount(2);
	await modes.getByRole('button', { name: 'Immersive', exact: true }).click();
	await page.getByRole('link', { name: 'Back', exact: true }).click();
	await expect(panel).not.toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
		'Keep my draft'
	);
	await page.getByRole('button', { name: 'Controls', exact: true }).click();
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await page.getByRole('link', { name: 'Display', exact: true }).click();
	await modes.getByRole('button', { name: 'Chat window', exact: true }).click();
	await page.getByRole('link', { name: 'Back', exact: true }).click();
	await expect(panel).toBeVisible();
	const input = panel.getByRole('textbox', { name: 'Message', exact: true });
	await expect(input).toHaveValue('Keep my draft');
	await input.press('End');
	await input.press('Shift+Enter');
	await input.pressSequentially('Second line');
	await expect(input).toHaveValue('Keep my draft\nSecond line');
	await expect(input).toHaveAttribute('wrap', 'soft');
});

import { test, expect } from '@playwright/test';
import { openApp, waitForHydration, snap } from './helpers';

test('app dialogs trap focus, close with Escape, and nested photos leave the board open', async ({ page, browserName }) => {
	test.setTimeout(90_000);
	await openApp(page);
	await page.getByRole('button', { name: 'App info', exact: true }).click();
	const about = page.getByRole('dialog', { name: 'About Utsuwa', exact: true });
	await expect(about).toBeVisible();
	await expect(about.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
	// Safari uses Option+Tab to include links in sequential keyboard navigation.
	const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
	for (let i = 0; i < 6; i++) {
		await page.keyboard.press(tabKey);
		await expect.poll(() => about.evaluate(el => el.contains(document.activeElement))).toBe(true);
	}
	await snap(page, 'about-dialog.png');
	await page.keyboard.press('Escape');
	await expect(about).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'App info', exact: true })).toBeFocused();

	await page.getByRole('button', { name: 'Controls', exact: true }).click();
	await page.getByRole('button', { name: 'Enter AR', exact: true }).click();
	const ar = page.getByRole('dialog', { name: 'AR mode requirements', exact: true });
	await expect(ar).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(ar).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Controls', exact: true })).toBeFocused();
	await page.getByRole('button', { name: 'Controls', exact: true }).click();
	const camera = page.getByRole('button', { name: 'Camera settings', exact: true });
	await camera.click();
	await page.getByRole('slider', { name: /^Zoom/ }).focus();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Camera settings' })).toHaveCount(0);
	await expect(camera).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: 'Controls', exact: true })).toBeFocused();

	await page.evaluate(async () => {
		const path = '/src/lib/services/storage/keepsakes.ts';
		const { keepImage } = await import(/* @vite-ignore */ path);
		const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII='), c => c.charCodeAt(0));
		await keepImage('dialog-review', new Blob([bytes], { type: 'image/png' }), { note: 'A photo to remember.' });
	});
	await page.getByRole('button', { name: 'Photoboard', exact: true }).click();
	const board = page.getByRole('dialog', { name: 'Photoboard', exact: true });
	await board.getByRole('button', { name: 'View photo', exact: true }).click();
	const photo = page.getByRole('dialog', { name: 'Photo', exact: true });
	await expect(photo).toBeVisible();
	await photo.getByRole('button', { name: 'Flip photo' }).click();
	await expect(photo).toContainText('A photo to remember.');
	await page.keyboard.press('Escape');
	await expect(photo).toHaveCount(0);
	await expect(board).toBeVisible();
	await expect(board.getByRole('button', { name: 'View photo', exact: true })).toBeFocused();
	await snap(page, 'photoboard-dialog.png');
	await page.keyboard.press('Escape');
	await expect(board).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Photoboard', exact: true })).toBeFocused();

	await page.goto('/app/settings/persona');
	await waitForHydration(page);
	const upload = page.getByRole('button', { name: 'Add Custom', exact: true });
	await upload.click();
	const dialog = page.getByRole('dialog', { name: 'Upload Custom Model' });
	await expect(dialog).toBeVisible();
	await page.keyboard.press(tabKey);
	await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
	await snap(page, 'upload-dialog.png');
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(upload).toBeFocused();
});

test('Data uses shared settings groups and previews a save before changing anything', async ({ page }) => {
	await openApp(page);
	const save = await page.evaluate(async () => {
		const path = '/src/lib/db/export.ts';
		const { exportSave } = await import(/* @vite-ignore */ path);
		return JSON.stringify(await exportSave());
	});
	await page.goto('/app/settings/data');
	await waitForHydration(page);
	await page.getByLabel('Import save file').setInputFiles({ name: 'review-save.json', mimeType: 'application/json', buffer: Buffer.from(save) });
	await expect(page.getByText('Save File Preview', { exact: true })).toBeVisible();
	const merge = page.getByRole('radio', { name: /Merge Add to existing data/ });
	await merge.check();
	await expect(merge).toBeChecked();
	await snap(page, 'data-import-preview.png');
	await page.locator('.import-actions').getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByText('Save File Preview', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Clear All Data', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Yes, Delete Everything', exact: true })).toBeVisible();
	await page.locator('.confirm-actions').getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Yes, Delete Everything', exact: true })).toHaveCount(0);
});

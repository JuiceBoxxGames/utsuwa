import { test, expect, type Page } from '@playwright/test';
import { openApp } from './helpers';

async function mockWakeLock(page: Page, denied = false) {
	await page.addInitScript((denied) => {
		let current: EventTarget & { released: boolean; release: () => Promise<void> };
		Object.defineProperty(navigator, 'wakeLock', {
			configurable: true,
			value: {
				request: async () => {
					if (denied) throw new DOMException('Denied', 'NotAllowedError');
					current = Object.assign(new EventTarget(), {
						released: false,
						async release(this: EventTarget & { released: boolean }) {
							this.released = true;
							this.dispatchEvent(new Event('release'));
						}
					});
					return current;
				}
			}
		});
		window.addEventListener('test-release-wake-lock', () => {
			void current?.release();
		});
	}, denied);
}

test('keep-awake persists, reports platform release and can retry or turn off', async ({
	page
}) => {
	await mockWakeLock(page);
	await openApp(page);
	await page.goto('/app/settings/display');
	const toggle = page.getByRole('switch', { name: 'Keep screen awake' });
	await toggle.click();
	await expect(toggle).toBeChecked();
	await expect(page.getByRole('status')).toContainText('Active.');
	await page.evaluate(() => window.dispatchEvent(new Event('test-release-wake-lock')));
	await expect(page.getByRole('status')).toContainText('Inactive.');
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByRole('status')).toContainText('Active.');
	await page.reload();
	await expect(toggle).toBeChecked();
	await expect(page.getByRole('status')).toContainText('Active.');
	await page.getByRole('link', { name: 'Back', exact: true }).click();
	await page.getByRole('button', { name: 'Screen awake. Turn off keep screen awake' }).click();
	await expect(page.getByRole('button', { name: /Turn off keep screen awake/ })).toHaveCount(0);
	expect(
		await page.evaluate(() => JSON.parse(localStorage.getItem('utsuwa-display')!).keepScreenAwake)
	).toBe(false);
});

test('a denied request stays inactive and the option remains usable', async ({ page }) => {
	await mockWakeLock(page, true);
	await openApp(page, { keepScreenAwake: true });
	await expect(
		page.getByRole('button', { name: 'Screen wake lock inactive. Turn off keep screen awake' })
	).toBeVisible();
	await page.goto('/app/settings/display');
	await expect(page.getByRole('status')).toContainText('Inactive.');
	await page.getByRole('switch', { name: 'Keep screen awake' }).click();
	await expect(page.getByRole('status')).toContainText('Off.');
});

test('display changes synchronize between windows without overwriting camera settings', async ({
	page,
	context
}) => {
	await mockWakeLock(page);
	await openApp(page, { camera: { panX: 0.25 }, overlayCamera: { panX: -0.5 } });
	const second = await context.newPage();
	await mockWakeLock(second);
	await second.goto('/app/settings/display');
	await second.getByRole('switch', { name: 'Keep screen awake' }).click();
	await expect(
		page.getByRole('button', { name: 'Screen awake. Turn off keep screen awake' })
	).toBeVisible();
	await page.getByRole('button', { name: 'Screen awake. Turn off keep screen awake' }).click();
	await expect(second.getByRole('switch', { name: 'Keep screen awake' })).not.toBeChecked();
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('utsuwa-display')!));
	expect(saved.camera.panX).toBe(0.25);
	expect(saved.overlayCamera.panX).toBe(-0.5);
	await second.close();
});

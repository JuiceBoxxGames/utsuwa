import { expect, type Page } from '@playwright/test';

// These tests run against Vite in a fresh browser context, never a user's save.
export async function openApp(page: Page, display: Record<string, unknown> = {}) {
	await page.route(/huggingface\.co|cdn-lfs|cdn\.jsdelivr\.net/, (route) => route.abort());
	await page.goto('/app/settings/display');
	await expect(page.getByRole('heading', { name: 'Display', exact: true })).toBeVisible();
	await waitForHydration(page);
	await page.evaluate(async (settings) => {
		const storePath = '/src/lib/stores/character.svelte.ts';
		const { characterStore } = await import(/* @vite-ignore */ storePath);
		await characterStore.loadState();
		characterStore.markOnboardingComplete();
		await characterStore.save(true);
		localStorage.setItem('utsuwa-display', JSON.stringify({ textRevealSpeed: 'off', ...settings }));
	}, display);
	await page.goto('/app');
	await page.waitForFunction(
		() =>
			document.querySelector('.chat-window')?.hasAttribute('style') ||
			document.querySelector('.chat-window')?.classList.contains('pinned')
	);
	await waitForHydration(page);
	await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
}

export async function setLoading(page: Page, loading: boolean) {
	await page.evaluate(async (value) => {
		const path = '/src/lib/stores/chat.svelte.ts';
		const { chatStore } = await import(/* @vite-ignore */ path);
		chatStore.setLoading(value);
	}, loading);
}

export async function waitForHydration(page: Page) {
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const path = '/src/lib/stores/modules.svelte.ts';
				return !!(await import(/* @vite-ignore */ path)).modulesStore.getModuleState('speech');
			})
		)
		.toBe(true);
}

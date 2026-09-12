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
		// Exercise the normal cached-preview state. The active avatar still loads
		// and renders; unrelated thumbnail generation is not part of these UI tests.
		const vrmPath = '/src/lib/stores/vrm.svelte.ts';
		const { vrmStore } = await import(/* @vite-ignore */ vrmPath);
		await vrmStore.whenReady();
		await Promise.all(
			vrmStore.models.map((model: { id: string }) =>
				vrmStore.setModelPreview(
					model.id,
					'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII='
				)
			)
		);
	}, display);
	await page.goto('/app');
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
	const pathname = new URL(page.url()).pathname;
	const hasAvatar = pathname === '/app' || pathname === '/overlay';
	await expect
		.poll(
			() =>
				page.evaluate(async (hasAvatar) => {
					const path = '/src/lib/stores/modules.svelte.ts';
					if (!(await import(/* @vite-ignore */ path)).modulesStore.getModuleState('speech')) {
						return false;
					}
					// Module registration precedes hydration. The layout sets its inline
					// height on mount, after child event handlers have been attached.
					const app = document.querySelector<HTMLElement>('.app');
					if (app && !app.style.height) return false;
					if (hasAvatar) {
						// Software renderers compile the avatar during its first frame.
						// Finish startup before timing clicks, focus, or navigation.
						const vrmPath = '/src/lib/stores/vrm.svelte.ts';
						const { vrmStore } = await import(/* @vite-ignore */ vrmPath);
						return !!vrmStore.vrm && !vrmStore.isLoading && !!vrmStore.headScreenPosition;
					}
					return !!app;
				}, hasAvatar),
			{ timeout: hasAvatar ? 20_000 : 15_000 }
		)
		.toBe(true);
}

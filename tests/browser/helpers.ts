import { expect, test, type Page, type Locator, type PageScreenshotOptions } from '@playwright/test';

// Review-only captures; nothing compares them. Set VISUAL_REVIEW=1 to write them.
export async function snap(page: Page, name: string, options: PageScreenshotOptions = {}) {
	if (!process.env.VISUAL_REVIEW) return;
	await page.screenshot({ ...options, path: test.info().outputPath(name) });
}

// These tests run against Vite in a fresh browser context, never a user's save.
export async function openApp(page: Page, display: Record<string, unknown> = {}, completeOnboarding = true) {
	await page.route(/huggingface\.co|cdn-lfs|cdn\.jsdelivr\.net/, (route) => route.abort());
	await page.goto('/app/settings/display');
	await expect(page.getByRole('heading', { name: 'Display', exact: true })).toBeVisible();
	await waitForHydration(page);
	await page.evaluate(async ({ settings, completeOnboarding }) => {
		const storePath = '/src/lib/stores/character.svelte.ts';
		const { characterStore } = await import(/* @vite-ignore */ storePath);
		await characterStore.loadState();
		if (completeOnboarding) await characterStore.markOnboardingComplete();
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
	}, { settings: display, completeOnboarding });
	await page.goto('/app');
	// Setup is usable while the background avatar is still rendering.
	await waitForHydration(page, completeOnboarding);
	if (completeOnboarding) await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
	else await expect(page.getByRole('dialog', { name: 'Set up your companion' })).toBeVisible();
}

export async function setLoading(page: Page, loading: boolean) {
	await page.evaluate(async (value) => {
		const path = '/src/lib/stores/chat.svelte.ts';
		const { chatStore } = await import(/* @vite-ignore */ path);
		chatStore.setLoading(value);
	}, loading);
}

export async function waitForHydration(page: Page, waitForAvatar = true) {
	const pathname = new URL(page.url()).pathname;
	const hasAvatar = waitForAvatar && (pathname === '/app' || pathname === '/overlay');
	await page.waitForFunction(
		() => document.readyState === 'complete' && '__SVELTEKIT_APP_VERSION__' in globalThis,
		undefined,
		{ timeout: 20_000 }
	);
	await expect
		.poll(
			() =>
				page.evaluate(async (hasAvatar) => {
					// Kit reads its app version from a global the Vite client defines. Importing a
					// store before that client runs poisons $app/environment for the whole page.
					if (!('__SVELTEKIT_APP_VERSION__' in globalThis)) return false;
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
			// The no-avatar path still waits behind avatar and embedding startup on CI.
			{ timeout: 20_000 }
		)
		.toBe(true);
}

export async function selectOption(page: Page, trigger: Locator, value: string) {
	await trigger.click();
	await page.locator(`[role="option"][data-value=${JSON.stringify(value)}]`).click();
}

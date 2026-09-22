import { test, expect } from '@playwright/test';
import { openApp, setLoading } from './helpers';

for (const mode of ['bubble', 'sidebar']) {
	test(`${mode}: input keeps focus during a turn and does not steal it back`, async ({ page }, info) => {
		await openApp(page, { chatDisplayMode: mode });
		const input = page.getByRole('textbox', { name: 'Message', exact: true });
		await input.focus();
		await page.screenshot({ path: info.outputPath(`${mode}-composer-focused.png`) });
		await setLoading(page, true);
		await expect(input).toHaveAttribute('readonly', '');
		await expect(input).toBeFocused();
		await setLoading(page, false);
		await expect(input).not.toHaveAttribute('readonly', '');
		await expect(input).toBeFocused();
		await setLoading(page, true);
		await page.getByRole('button', { name: 'App info', exact: true }).focus();
		await setLoading(page, false);
		await expect(input).not.toBeFocused();
	});
}

test('IME confirmation does not send; touch users have a send button', async ({ page }) => {
	await openApp(page);
	const input = page.getByRole('textbox', { name: 'Message', exact: true });
	await input.fill('こんにちは');
	await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
	await expect(input).toHaveValue('こんにちは');
	await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled();
});

test('user messages remain selectable and long text fits the window', async ({
	page,
	context,
	browserName
}) => {
	await openApp(page, { chatDisplayMode: 'sidebar' });
	await page.evaluate(async () => {
		const path = '/src/lib/stores/chat.svelte.ts';
		const { chatStore } = await import(/* @vite-ignore */ path);
		chatStore.addMessage('user', 'A'.repeat(250));
	});
	const bubble = page.locator('.message.user .bubble');
	await expect(bubble).toBeVisible();
	const result = await bubble.evaluate((el) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);
		return {
			text: selection.toString(),
			select:
				getComputedStyle(el).getPropertyValue('user-select') ||
				getComputedStyle(el).getPropertyValue('-webkit-user-select'),
			overflows: el.scrollWidth > el.clientWidth
		};
	});
	expect(result.text.trim()).toBe('A'.repeat(250));
	expect(result.select).toBe('text');
	expect(result.overflows).toBe(false);
	if (browserName === 'chromium') {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.keyboard.press('ControlOrMeta+c');
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('A'.repeat(250));
	}
});

test('sending through the real chat flow keeps focus before and after a streamed reply', async ({
	page
}) => {
	await openApp(page, { chatDisplayMode: 'sidebar' });
	let finishReply!: () => void;
	const replyReady = new Promise<void>((resolve) => {
		finishReply = resolve;
	});
	await page.route('**/api/chat', async (route) => {
		await replyReady;
		const reply =
			'Hello again!\n```json\n{"mood_change":{"emotion":"happy","intensity_delta":0}}\n```';
		await route.fulfill({ contentType: 'text/plain', body: `0:${JSON.stringify(reply)}\n` });
	});
	await page.evaluate(async () => {
		const modulesPath = '/src/lib/stores/modules.svelte.ts';
		const settingsPath = '/src/lib/stores/settings.svelte.ts';
		const { modulesStore } = await import(/* @vite-ignore */ modulesPath);
		const { settingsStore } = await import(/* @vite-ignore */ settingsPath);
		settingsStore.setProviderConfig('openai', { apiKey: 'browser-test-only' });
		await modulesStore.setModuleSettings('consciousness', {
			activeProvider: 'openai',
			activeModel: 'gpt-4o-mini'
		});
		await modulesStore.setModuleEnabled('consciousness', true);
	});
	const input = page.getByRole('textbox', { name: 'Message', exact: true });
	await input.fill('Hello there');
	await page.getByRole('button', { name: 'Send message', exact: true }).click();
	try {
		await expect(input).toHaveAttribute('readonly', '');
		await expect(input).toBeFocused();
	} finally {
		finishReply();
	}
	await expect(page.locator('.message.assistant .bubble')).toContainText('Hello again!');
	await expect(input).not.toHaveAttribute('readonly', '');
	await expect(input).toBeFocused();
	await page.keyboard.type('My next message');
	await expect(input).toHaveValue('My next message');
});

test('copy actions copy each message and show failure without changing the conversation', async ({
	page,
	context,
	browserName
}, info) => {
	await openApp(page, { chatDisplayMode: 'sidebar' });
	await page.evaluate(async () => {
		const path = '/src/lib/stores/chat.svelte.ts';
		const { chatStore } = await import(/* @vite-ignore */ path);
		chatStore.addMessage('user', 'Please keep **this text**.');
		chatStore.addMessage('assistant', 'Here is your reply.');
	});
	await expect(page.locator('.message.assistant .bubble')).toHaveText('Here is your reply.');
	for (const theme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: theme });
		if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
		else await expect(page.locator('html')).not.toHaveClass(/dark/);
		await page.screenshot({ path: info.outputPath(`chat-bubbles-${theme}.png`) });
	}
	if (browserName === 'chromium')
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	else
		await page.evaluate(() =>
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: {
					writeText: async (text: string) => {
						(window as any).copiedText = text;
					}
				}
			})
		);
	const copy = page.locator('.message.user').getByRole('button', { name: 'Copy message' });
	await copy.click();
	await expect(copy).toHaveAttribute('title', 'Copied');
	await expect(copy).toHaveText('');
	expect(
		await page.evaluate(() =>
			navigator.clipboard.readText ? navigator.clipboard.readText() : (window as any).copiedText
		)
	).toBe('Please keep **this text**.');
	await page.evaluate(() =>
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async () => {
					throw new DOMException('Denied', 'NotAllowedError');
				}
			}
		})
	);
	const reply = page.locator('.message.assistant');
	await reply.getByRole('button', { name: 'Copy message' }).click();
	await expect(reply.getByRole('status')).toContainText('Could not copy');
	await expect(reply.locator('.bubble')).toHaveText('Here is your reply.');
	await expect(reply.getByRole('button', { name: 'Copy message' })).toBeEnabled();
});

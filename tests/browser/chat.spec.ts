import { test, expect } from '@playwright/test';
import { openApp, setLoading, snap } from './helpers';

for (const mode of ['bubble', 'sidebar']) {
	test(`${mode}: input keeps focus during a turn and does not steal it back`, async ({ page }) => {
		await openApp(page, { chatDisplayMode: mode });
		const input = page.getByRole('textbox', { name: 'Message', exact: true });
		await input.focus();
		await snap(page, `${mode}-composer-focused.png`);
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

test('sending through the real chat flow keeps focus before and after a streamed reply', { tag: '@avatar' }, async ({
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
		// The first-meeting scene is a modal that rightly takes focus; this test is about the composer
		const eventsPath = '/src/lib/engine/events.ts';
		const dataPath = '/src/lib/data/events/index.ts';
		const { eventsApi } = await import(/* @vite-ignore */ eventsPath);
		const { allEvents } = await import(/* @vite-ignore */ dataPath);
		await eventsApi.recordCompletedEvent(allEvents.find((e: { id: string }) => e.id === 'first_conversation'));
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
}) => {
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
		await snap(page, `chat-bubbles-${theme}.png`);
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

// Silent 16-bit mono WAV; enough for the real decode, playback and lip-sync path.
function silentWav(seconds: number, rate = 24000) {
	const bytes = Math.round(seconds * rate) * 2;
	const wav = Buffer.alloc(44 + bytes);
	wav.write('RIFF', 0);
	wav.writeUInt32LE(36 + bytes, 4);
	wav.write('WAVEfmt ', 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(rate, 24);
	wav.writeUInt32LE(rate * 2, 28);
	wav.writeUInt16LE(2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write('data', 36);
	wav.writeUInt32LE(bytes, 40);
	return wav;
}

test('replies are spoken with Fish Audio through the web proxy', { tag: '@avatar' }, async ({ page }) => {
	await page.addInitScript(() => {
		const played: number[] = [];
		(window as Window & { playedAudio?: number[] }).playedAudio = played;
		const start = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (...args) {
			if (this.buffer) played.push(this.buffer.duration);
			return start.apply(this, args);
		};
	});
	await openApp(page, { chatDisplayMode: 'sidebar' });
	const requests: { headers: Record<string, string>; body: unknown }[] = [];
	await page.route('**/api/tts/fish-audio', async (route) => {
		requests.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
		await route.fulfill({ contentType: 'audio/wav', body: silentWav(0.5) });
	});
	await page.route('**/api/chat', (route) => {
		const reply =
			'Hello there.\n```json\n{"mood_change":{"emotion":"happy","intensity_delta":0}}\n```';
		return route.fulfill({ contentType: 'text/plain', body: `0:${JSON.stringify(reply)}\n` });
	});
	await page.evaluate(async () => {
		const modulesPath = '/src/lib/stores/modules.svelte.ts';
		const settingsPath = '/src/lib/stores/settings.svelte.ts';
		const { modulesStore } = await import(/* @vite-ignore */ modulesPath);
		const { settingsStore } = await import(/* @vite-ignore */ settingsPath);
		settingsStore.setProviderConfig('openai', { apiKey: 'browser-test-only' });
		settingsStore.setProviderConfig('fish-audio', { apiKey: 'browser-test-only' });
		await modulesStore.setModuleSettings('consciousness', {
			activeProvider: 'openai',
			activeModel: 'gpt-4o-mini'
		});
		await modulesStore.setModuleSettings('speech', {
			...modulesStore.getModuleSettings('speech'),
			activeProvider: 'fish-audio',
			activeModel: 's2.1-pro-free',
			activeVoiceId: 'https://fish.audio/m/4f14b263c4ee418b9193de6ab1123015/'
		});
		await modulesStore.setModuleEnabled('consciousness', true);
		await modulesStore.setModuleEnabled('speech', true);
	});

	await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Hi');
	await page.getByRole('button', { name: 'Send message', exact: true }).click();

	const played = () =>
		page.evaluate(() => (window as Window & { playedAudio?: number[] }).playedAudio ?? []);
	await expect.poll(async () => (await played()).length).toBe(1);
	// Decoding resamples to the device rate (44.1 kHz on Linux CI), which can shift the length by a sample.
	expect((await played())[0]).toBeCloseTo(0.5, 3);
	expect(requests).toHaveLength(1);
	expect(requests[0].headers.authorization).toBe('Bearer browser-test-only');
	expect(requests[0].headers.model).toBe('s2.1-pro-free');
	expect(requests[0].body).toEqual({
		text: 'Hello there.',
		reference_id: '4f14b263c4ee418b9193de6ab1123015',
		format: 'mp3',
		prosody: { speed: 1 }
	});
});

test('chat errors are dismissable alerts, return the message, and a stopped reply leaves no empty bubble', async ({ page }) => {
	await openApp(page, { chatDisplayMode: 'sidebar' });
	let fail = true;
	await page.route('**/api/chat', async (route) => {
		if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Upstream exploded"}' });
		await new Promise(() => {});
	});
	await page.evaluate(async () => {
		const modulesPath = '/src/lib/stores/modules.svelte.ts';
		const settingsPath = '/src/lib/stores/settings.svelte.ts';
		const { modulesStore } = await import(/* @vite-ignore */ modulesPath);
		const { settingsStore } = await import(/* @vite-ignore */ settingsPath);
		settingsStore.setProviderConfig('openai', { apiKey: 'browser-test-only' });
		await modulesStore.setModuleSettings('consciousness', { activeProvider: 'openai', activeModel: 'gpt-4o-mini' });
		await modulesStore.setModuleEnabled('consciousness', true);
	});
	const input = page.getByRole('textbox', { name: 'Message', exact: true });
	await input.fill('Hello there');
	await page.getByRole('button', { name: 'Send message', exact: true }).click();
	const alert = page.getByRole('alert');
	await expect(alert).toBeVisible();
	await expect(page.locator('.message.assistant')).toHaveCount(0);
	// The failed message goes back to the composer instead of staying as a bubble
	await expect(input).toHaveValue('Hello there');
	await expect(page.locator('.message.user')).toHaveCount(0);
	await alert.getByRole('button', { name: 'Dismiss', exact: true }).press('Enter');
	await expect(alert).toHaveCount(0);

	fail = false;
	await input.fill('Are you there?');
	await page.getByRole('button', { name: 'Send message', exact: true }).click();
	await page.getByRole('button', { name: 'Stop reply', exact: true }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Stopped' })).toBeVisible();
	await expect(input).not.toHaveAttribute('readonly', '');
	// Stopping is deliberate, so that message stays put
	await expect(page.locator('.message.user')).toHaveCount(1);
	await expect(page.locator('.message.assistant')).toHaveCount(0);
});

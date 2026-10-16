import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

test.use({
	permissions: ['microphone'],
	launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }
});

// Records ~1 s from the fake mic through the real service and returns what reached the STT endpoint
async function recordOnce(page: Page, encoderWorks: boolean) {
	let upload: { filename: string; head: string; size: number } | null = null;
	await page.route('http://stt.test/v1/audio/transcriptions', async (route) => {
		const body = route.request().postDataBuffer() ?? Buffer.alloc(0);
		const filename = /filename="([^"]+)"/.exec(body.toString('latin1'))?.[1] ?? '';
		const start = body.indexOf('\r\n\r\n') + 4;
		upload = { filename, head: body.subarray(start, start + 4).toString('latin1'), size: body.length };
		await route.fulfill({ json: { text: 'hello from the mic' } });
	});

	const result = await page.evaluate(async (encoderWorks) => {
		// The Linux AppImage's WebKitGTK reports no supported type at all (#277)
		if (!encoderWorks) MediaRecorder.isTypeSupported = () => false;
		const path = '/src/lib/services/stt/openai-stt.ts';
		const { openAiSttService } = await import(/* @vite-ignore */ path);
		openAiSttService.configure({ baseUrl: 'http://stt.test/v1', model: 'whisper-1', label: 'Test STT' });
		return new Promise<{ text?: string; error?: string }>((resolve) => {
			openAiSttService
				.startListening({
					onResult: (text: string) => resolve({ text }),
					onError: (error: string) => resolve({ error }),
					onEnd: () => {}
				})
				.then((started: boolean) => {
					if (started) setTimeout(() => openAiSttService.stopListening(), 1000);
				});
		});
	}, encoderWorks);

	return { result, upload: upload as { filename: string; head: string; size: number } | null };
}

test('voice input falls back to WAV when MediaRecorder cannot encode', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'fake mic flags are Chromium-only');
	await openApp(page);
	const { result, upload } = await recordOnce(page, false);
	expect(result).toEqual({ text: 'hello from the mic' });
	expect(upload?.filename).toBe('recording.wav');
	expect(upload?.head).toBe('RIFF');
	// ~1 s of 16-bit mono audio, so tens of KB rather than an empty file
	expect(upload?.size).toBeGreaterThan(20_000);
});

test('voice input keeps MediaRecorder where it can encode', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'fake mic flags are Chromium-only');
	await openApp(page);
	const { result, upload } = await recordOnce(page, true);
	expect(result).toEqual({ text: 'hello from the mic' });
	// Chromium picks mp4 or webm depending on version; either way, not the WAV fallback
	expect(upload?.filename).toMatch(/^recording\.(m4a|webm|ogg)$/);
	expect(upload?.head).not.toBe('RIFF');
});

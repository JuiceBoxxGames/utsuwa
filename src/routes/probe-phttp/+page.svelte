<script lang="ts">
	// Throwaway desktop probe for the provider-fetch change. Never merged.
	import { onMount } from 'svelte';
	import { isTauri } from '@tauri-apps/api/core';
	import { streamChat, completeJson, type ChatRequest } from '$lib/services/llm/transport';
	import { fetchModelsDirect } from '$lib/services/providers/client-models';
	import { providerFetch } from '$lib/services/platform/provider-fetch';
	import { buildTranscriptionRequest, encodeWav } from '$lib/services/stt/openai-stt';
	import { OpenAITTS } from '$lib/services/tts/openai-tts';
	import { ElevenLabsTTS } from '$lib/services/tts/elevenlabs';
	import { FishAudioTTS } from '$lib/services/tts/fish-audio';
	import * as omni from '$lib/services/tts/omnivoice-client';
	import type { LLMProvider } from '$lib/types';

	const LISTEN = 'http://127.0.0.1:5987';
	const MOCK = 'http://127.0.0.1:8787/v1';
	let lines = $state<string[]>([]);

	async function report(r: Record<string, unknown>) {
		lines.push(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.ok ? JSON.stringify(r.detail ?? '') : r.error}`);
		await fetch(LISTEN + '/result', { method: 'POST', mode: 'no-cors', body: JSON.stringify(r) }).catch(() => {});
	}
	const errText = (e: unknown) =>
		e instanceof Error ? `${e.name}: ${e.message}` : typeof e === 'object' ? JSON.stringify(e) : String(e);
	async function check(name: string, fn: () => Promise<unknown>) {
		const t0 = performance.now();
		try {
			const detail = await fn();
			await report({ name, ok: true, detail, ms: Math.round(performance.now() - t0) });
		} catch (e) {
			await report({ name, ok: false, error: errText(e), ms: Math.round(performance.now() - t0) });
		}
	}
	function assert(cond: unknown, msg: string): asserts cond {
		if (!cond) throw new Error(msg);
	}
	const speakTool = {
		type: 'function',
		function: {
			name: 'speak_segment',
			description: 'Say one short line out loud.',
			parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
		}
	};

	async function run(req: ChatRequest, abortAfter?: number) {
		const stamps: number[] = [];
		const tools: { name: string; args: Record<string, unknown> }[] = [];
		let reasoning = '';
		let text = '';
		const ctrl = new AbortController();
		const t0 = performance.now();
		let error: unknown;
		try {
			text = await streamChat(
				{ ...req, signal: ctrl.signal, onReasoning: (r) => (reasoning = r) },
				(full) => {
					stamps.push(Math.round(performance.now() - t0));
					text = full;
					if (abortAfter && stamps.length === abortAfter) ctrl.abort();
				},
				(name, args) => tools.push({ name, args })
			);
		} catch (e) {
			error = e;
		}
		return { stamps, tools, reasoning, text, error, ms: Math.round(performance.now() - t0) };
	}

	async function streamCase(req: ChatRequest) {
		const r = await run(req);
		if (r.error) throw r.error;
		return { updates: r.stamps.length, firstMs: r.stamps[0] ?? 0, lastMs: r.stamps.at(-1) ?? 0, text: r.text.slice(0, 80), reasoning: r.reasoning.slice(0, 40), tools: r.tools };
	}

	async function abortCase(req: ChatRequest, after: number) {
		const r = await run(req, after);
		if (!r.error) throw new Error(`abort did not reject; got ${r.stamps.length} updates`);
		return { name: (r.error as Error)?.name, error: errText(r.error), updates: r.stamps.length, ms: r.ms };
	}

	async function audioSeconds(buf: AudioBuffer | ArrayBuffer) {
		if (buf instanceof ArrayBuffer) buf = await new AudioContext().decodeAudioData(buf);
		assert(buf.duration > 0, 'empty audio');
		return { seconds: +buf.duration.toFixed(2) };
	}

	function sineWav(): Blob {
		const rate = 16000;
		const pcm = new Float32Array(rate);
		for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i / 8) * 0.3;
		return encodeWav([pcm], rate);
	}

	async function mockSuite() {
		await check('control: plain fetch to a no-CORS server is blocked', async () => {
			try {
				await fetch(MOCK + '/models');
			} catch (e) {
				return { blocked: errText(e) };
			}
			throw new Error('plain fetch succeeded, so the mock does not reproduce the CORS failure');
		});
		await check('Origin header the provider receives', async () => (await (await providerFetch(MOCK + '/_origin')).json()));
		await check('models: custom endpoint with no CORS', async () => {
			const r = await fetchModelsDirect('openai-compatible', undefined, MOCK);
			assert(!r.error && r.models.length === 2, r.error || `got ${r.models.length} models`);
			return r.models.map((m) => m.id);
		});
		await check('models: LM Studio-style local server with no CORS', async () => {
			const r = await fetchModelsDirect('lmstudio', undefined, 'http://127.0.0.1:8787/v1');
			assert(!r.error && r.models.length === 2, r.error || `got ${r.models.length} models`);
			return r.models.map((m) => m.id);
		});
		await check('response header with raw UTF-8 bytes (plugin-http 2.8.3 fix)', async () => {
			const res = await providerFetch(MOCK + '/models');
			return { status: res.status, header: res.headers.get('x-note') };
		});
		const base: ChatRequest = {
			provider: 'openai-compatible', custom: true, model: 'slow', baseURL: MOCK,
			messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'test', tools: [speakTool]
		};
		await check('chat: streams incrementally, with reasoning and a split tool call', async () => {
			const r = await streamCase(base);
			assert(r.updates >= 5, `only ${r.updates} text updates, stream was buffered`);
			assert(r.lastMs - r.firstMs > 700, `updates arrived within ${r.lastMs - r.firstMs} ms, stream was buffered`);
			assert(r.text.includes('Hello world from the mock'), `text was "${r.text}"`);
			assert(r.reasoning === 'think more', `reasoning was "${r.reasoning}"`);
			assert(r.tools.length === 1 && r.tools[0].args.text === 'hey', `tools ${JSON.stringify(r.tools)}`);
			return r;
		});
		await check('chat: Stop mid-stream rejects with AbortError and closes the connection', async () => {
			const r = await abortCase({ ...base, model: 'abort' }, 2);
			assert(r.name === 'AbortError', `rejected with ${r.error}`);
			await new Promise((res) => setTimeout(res, 1500));
			const stats = await (await providerFetch(MOCK + '/_stats')).json();
			assert(stats.aborts >= 1, 'server never saw the connection close');
			return { ...r, serverSawCloseAfterMs: stats.lastAbortAfterMs };
		});
		await check('chat: in-stream provider error surfaces its message', async () => {
			try {
				await streamCase({ ...base, model: 'err' });
			} catch (e) {
				assert(errText(e).includes('overloaded'), errText(e));
				return errText(e);
			}
			throw new Error('no error raised');
		});
		await check('chat: 401 without CORS headers shows the real error, not "Failed to fetch"', async () => {
			try {
				await streamCase({ ...base, model: 'unauth' });
			} catch (e) {
				assert(errText(e).includes('Invalid API key: mock'), errText(e));
				return errText(e);
			}
			throw new Error('no error raised');
		});
		await check('completeJson (memory/state extraction path)', async () => {
			const r = await completeJson({ provider: 'openai-compatible', custom: true, model: 'json', baseURL: MOCK, system: 's', user: 'u', maxTokens: 50 });
			assert(r === '{"ok":true}', `got ${r}`);
			return r;
		});
		await check('TTS: local OpenAI-compatible speech', async () =>
			audioSeconds(await new OpenAITTS({ provider: 'local-tts', baseUrl: MOCK, voiceId: 'x' }).fetchAudioBuffer!('hi'))
		);
		await check('TTS: ElevenLabs request path (mocked host)', async () =>
			audioSeconds(await new ElevenLabsTTS({ provider: 'elevenlabs', apiKey: 'k', baseUrl: 'http://127.0.0.1:8787/el/' }).fetchAudioBuffer!('hi'))
		);
		await check('STT: multipart upload', async () => {
			const audio = sineWav();
			const { url, headers, body } = buildTranscriptionRequest({ baseUrl: MOCK, model: 'whisper-1', label: 'mock' }, audio, 'recording.wav');
			const res = await providerFetch(url, { method: 'POST', headers, body });
			const json = await res.json();
			assert(json.text.includes('file=recording.wav'), json.text);
			assert(Number(/bytes=(\d+)/.exec(json.text)?.[1]) > audio.size, `upload smaller than the file: ${json.text}, file ${audio.size}`);
			return json.text;
		});
		await check('OmniVoice: health, list, clone upload, synthesize, delete', async () => {
			const conn = { baseUrl: 'http://127.0.0.1:8787/v1/' };
			const health = await omni.checkHealth(conn.baseUrl);
			assert(health === 'connected', `health ${health}`);
			const clones = await omni.listClones(conn);
			assert(Array.isArray(clones), 'list failed');
			await omni.cloneVoice(conn, { voiceId: 'v1', refAudio: new File([sineWav()], 'ref.wav', { type: 'audio/wav' }), refText: 'hello' });
			const synth = await audioSeconds(await omni.synthesize(conn, { input: 'hi' }));
			await omni.deleteClone(conn, 'v1');
			return { health, clones: clones.length, ...synth };
		});
		await check('TLS + real error body from a public host (no key)', async () => {
			const r = await fetchModelsDirect('openai', 'sk-invalid-probe');
			assert(r.error && /HTTP 401/.test(r.error), `error was "${r.error}"`);
			return r.error;
		});
		await check('Anthropic bad key shows the real error (was "Failed to fetch")', async () => {
			const req: ChatRequest = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'sk-ant-invalid-probe', messages: [{ role: 'user', content: 'hi' }], systemPrompt: 's' };
			try {
				await streamCase(req);
			} catch (e) {
				assert(!/failed to fetch|load failed/i.test(errText(e)), errText(e));
				return errText(e);
			}
			throw new Error('no error raised');
		});
	}

	type Cloud = { id: string; provider: LLMProvider; key: string; baseURL?: string; custom?: boolean; prefer: RegExp };
	const CLOUDS: Omit<Cloud, 'key'>[] = [
		{ id: 'openai', provider: 'openai', prefer: /^gpt-4\.1-nano|^gpt-4o-mini|^gpt-5-nano/ },
		{ id: 'anthropic', provider: 'anthropic', prefer: /haiku/ },
		{ id: 'google', provider: 'google', prefer: /flash-lite|flash/ },
		{ id: 'deepseek', provider: 'deepseek', prefer: /chat|flash/ },
		{ id: 'xai', provider: 'xai', prefer: /mini|fast/ },
		{ id: 'together', provider: 'openai-compatible', custom: true, baseURL: 'https://api.together.xyz/v1', prefer: /Llama-3\.3-70B-Instruct-Turbo$|Llama-3\.1-8B-Instruct-Turbo$/ },
		{ id: 'openrouter', provider: 'openai-compatible', custom: true, baseURL: 'https://openrouter.ai/api/v1', prefer: /^openai\/gpt-4o-mini$|^google\/gemini-2\.\d-flash/ }
	];

	async function llmSuite(c: Cloud | (Omit<Cloud, 'key'> & { key?: string })) {
		let model = '';
		await check(`${c.id}: model list`, async () => {
			const r = await fetchModelsDirect(c.provider, c.key, c.baseURL);
			assert(!r.error && r.models.length > 0, r.error || 'no models');
			model = (r.models.find((m) => c.prefer.test(m.id)) ?? r.models[0]).id;
			return { count: r.models.length, picked: model };
		});
		if (!model) return;
		const req: ChatRequest = {
			provider: c.provider, model, apiKey: c.key, baseURL: c.baseURL, custom: c.custom,
			isLocal: c.provider === 'ollama' || c.provider === 'lmstudio',
			messages: [{ role: 'user', content: 'Count from 1 to 20, separated by spaces. Nothing else.' }],
			systemPrompt: 'You are a test harness. Follow instructions exactly.', maxTokens: 200
		};
		await check(`${c.id}: chat streams (${model})`, async () => {
			const r = await streamCase(req);
			assert(r.updates >= 3, `only ${r.updates} updates`);
			assert(/\b10\b/.test(r.text), `text "${r.text}"`);
			return r;
		});
		await check(`${c.id}: Stop mid-stream`, async () => {
			const r = await abortCase({ ...req, messages: [{ role: 'user', content: 'Write 300 words about the sea.' }], maxTokens: 800 }, 3);
			assert(r.name === 'AbortError', `rejected with ${r.error}`);
			return r;
		});
		if (c.provider !== 'anthropic') {
			await check(`${c.id}: native tool call`, async () => {
				const r = await streamCase({
					...req, tools: [speakTool],
					messages: [{ role: 'user', content: 'Call speak_segment with the text "pong". Do not answer in plain text.' }]
				});
				assert(r.tools.length > 0, `no tool call; text "${r.text}"`);
				return r.tools;
			});
		}
	}

	async function realSuite(keys: Record<string, string>) {
		for (const c of CLOUDS) if (keys[c.id]) await llmSuite({ ...c, key: keys[c.id] });
		if (keys.local_ollama) await llmSuite({ id: 'ollama', provider: 'ollama', prefer: new RegExp(keys.local_ollama) } as Omit<Cloud, 'key'>);
		if (keys.local_lmstudio) await llmSuite({ id: 'lmstudio', provider: 'lmstudio', prefer: new RegExp(keys.local_lmstudio) });
		if (keys.openai) {
			await check('openai: TTS', async () => audioSeconds(await new OpenAITTS({ provider: 'openai-tts', apiKey: keys.openai, voiceId: 'alloy', model: 'gpt-4o-mini-tts' }).fetchAudioBuffer!('Testing one two three.')));
		}
		if (keys.elevenlabs) {
			await check('elevenlabs: TTS', async () => audioSeconds(await new ElevenLabsTTS({ provider: 'elevenlabs', apiKey: keys.elevenlabs }).fetchAudioBuffer!('Testing one two three.')));
			await check('elevenlabs: voice list', async () => {
				const r = await fetchModelsDirect('elevenlabs', keys.elevenlabs);
				assert(!r.error, r.error ?? '');
				return { count: r.models.length };
			});
		}
		if (keys.fish) {
			await check('fish: TTS', async () => audioSeconds(await new FishAudioTTS({ provider: 'fish-audio', apiKey: keys.fish }).fetchAudioBuffer!('Testing one two three.')));
		}
		const hello = await fetch(LISTEN + '/hello.wav').then((r) => (r.ok ? r.blob() : null)).catch(() => null);
		for (const [id, baseUrl, model] of [['openai', 'https://api.openai.com/v1', 'whisper-1'], ['groq', 'https://api.groq.com/openai/v1', 'whisper-large-v3-turbo']] as const) {
			if (!keys[id] || !hello) continue;
			await check(`${id}: STT transcribes a real recording`, async () => {
				const { url, headers, body } = buildTranscriptionRequest({ baseUrl, model, apiKey: keys[id], label: id }, hello, 'recording.wav');
				const res = await providerFetch(url, { method: 'POST', headers, body });
				const json = await res.json();
				assert(res.ok && /hello/i.test(json.text ?? ''), `${res.status} ${JSON.stringify(json).slice(0, 200)}`);
				return json.text;
			});
		}
	}

	async function toolStats(n: number) {
		const r = await fetchModelsDirect('ollama');
		const model = r.models[0]?.id ?? '';
		const tally = { pass: 0, empty: 0, textOnly: 0, error: 0, samples: [] as string[] };
		for (let i = 0; i < n; i++) {
			const out = await run({
				provider: 'ollama', isLocal: true, model, tools: [speakTool], maxTokens: 200,
				systemPrompt: 'You are a test harness. Follow instructions exactly.',
				messages: [{ role: 'user', content: 'Call speak_segment with the text "pong". Do not answer in plain text.' }]
			});
			if (out.error) { tally.error++; tally.samples.push(errText(out.error)); }
			else if (out.tools.length) tally.pass++;
			else if (out.text.trim()) { tally.textOnly++; tally.samples.push(out.text.slice(0, 60)); }
			else tally.empty++;
		}
		await report({ name: `ollama tool stats x${n} (${model})`, ok: true, detail: tally });
	}

	onMount(async () => {
		const n = Number(new URLSearchParams(location.search).get('tools'));
		if (n) {
			await toolStats(n);
			await fetch(LISTEN + '/done', { method: 'POST', mode: 'no-cors' }).catch(() => {});
			return;
		}
		await report({ name: 'env', ok: true, detail: { tauri: isTauri(), origin: location.origin, ua: navigator.userAgent } });
		const cfg = await fetch(LISTEN + '/config').then((r) => r.json()).catch(() => ({ keys: {} }));
		await mockSuite();
		await realSuite(cfg.keys ?? {});
		await fetch(LISTEN + '/done', { method: 'POST', mode: 'no-cors' }).catch(() => {});
	});
</script>

<h1>provider-fetch probe</h1>
<pre>{lines.join('\n')}</pre>

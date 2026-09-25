import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// The modules read browser stores and the Tauri globals, so load them through
// Vite with those two swapped for plain objects (same approach as companion-chat.test).
test('llm transport and active model', async (t) => {
	const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '');
	const fx = {
		tauri: false,
		enabled: true,
		consciousness: {} as Record<string, unknown>,
		configs: {} as Record<string, { apiKey?: string; baseUrl?: string }>,
		modulesStore: {
			isModuleEnabled: () => fx.enabled,
			getModuleSettings: () => fx.consciousness
		},
		settingsStore: { getProviderConfig: (id: string) => fx.configs[id] ?? {} }
	};
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.__llmTest = fx;
	const stubs: Record<string, string> = {
		'stores/modules.svelte': 'export const modulesStore = globalThis.__llmTest.modulesStore;',
		'stores/settings.svelte': 'export const settingsStore = globalThis.__llmTest.settingsStore;',
		'services/platform': 'export const isTauri = () => globalThis.__llmTest.tauri;'
	};
	const lib = `${root}/src/lib/`;
	const server = await createServer({
		root, configFile: false, server: { middlewareMode: true }, appType: 'custom',
		resolve: { alias: [{ find: '$lib', replacement: `${root}/src/lib` }] },
		optimizeDeps: { noDiscovery: true, entries: [] },
		plugins: [{
			name: 'llm-test-stubs',
			enforce: 'pre',
			resolveId(id) {
				if (id.startsWith('\0llm-test:')) return id;
				const key = id.startsWith(lib) ? id.slice(lib.length).replace(/\.ts$/, '') : '';
				if (key in stubs) return '\0llm-test:' + key;
			},
			load(id) { if (id.startsWith('\0llm-test:')) return stubs[id.slice('\0llm-test:'.length)]; }
		}]
	});
	try {
		const { chooseTransport, providerEndpoint, completeJson, streamChat } =
			await server.ssrLoadModule('/src/lib/services/llm/transport.ts');
		const { resolveActiveLLM, missingLLMMessage } = await server.ssrLoadModule('/src/lib/services/llm/active-llm.ts');

		await t.test('chooseTransport: server only for cloud providers on web', () => {
			assert.equal(chooseTransport({ isLocal: false }, false), 'server');
			assert.equal(chooseTransport(undefined, false), 'server');
			assert.equal(chooseTransport({ isLocal: true }, false), 'direct');
			assert.equal(chooseTransport({ isLocal: false }, true), 'direct');
			assert.equal(chooseTransport({ isLocal: true }, true), 'direct');
		});

		await t.test('resolveActiveLLM', async (t) => {
			await t.test('no provider', () => {
				fx.consciousness = {};
				assert.equal(resolveActiveLLM(), null);
				assert.equal(missingLLMMessage(), 'Please configure a provider in Settings > LLM Model');
			});
			await t.test('chat disabled', () => {
				fx.enabled = false;
				fx.consciousness = { activeProvider: 'ollama' };
				assert.equal(resolveActiveLLM(), null);
				fx.enabled = true;
			});
			await t.test('cloud provider without its required key', () => {
				fx.consciousness = { activeProvider: 'openai', activeModel: 'gpt-x' };
				fx.configs = { openai: { apiKey: '' } };
				assert.equal(resolveActiveLLM(), null);
				assert.equal(missingLLMMessage(), 'Please configure API key for OpenAI in Settings > LLM Model');
			});
			await t.test('cloud provider with a key gets the default base URL', () => {
				fx.configs = { openai: { apiKey: 'sk-1' } };
				const llm = resolveActiveLLM();
				assert.equal(llm.baseURL, 'https://api.openai.com/v1/');
				assert.equal(llm.apiKey, 'sk-1');
				assert.equal(llm.model, 'gpt-x');
				assert.equal(llm.meta.name, 'OpenAI');
			});
			await t.test('local provider needs no key', () => {
				fx.consciousness = { activeProvider: 'ollama', activeModel: 'llama3' };
				fx.configs = {};
				const { meta, ...llm } = resolveActiveLLM();
				assert.equal(meta.id, 'ollama');
				assert.deepEqual(llm, {
					provider: 'ollama', model: 'llama3', apiKey: undefined,
					baseURL: 'http://localhost:11434', isLocal: true, custom: false
				});
			});
			await t.test('custom endpoint keeps its own base URL and an unset model', () => {
				fx.consciousness = { activeProvider: 'openai-compatible' };
				fx.configs = { 'openai-compatible': { baseUrl: 'https://gw.example/api' } };
				const { meta, ...llm } = resolveActiveLLM();
				assert.equal(meta.custom, true);
				assert.deepEqual(llm, {
					provider: 'openai-compatible', model: '', apiKey: undefined,
					baseURL: 'https://gw.example/api', isLocal: false, custom: true
				});
			});
		});

		await t.test('providerEndpoint', async (t) => {
			await t.test('anthropic uses /messages and its own auth headers', () => {
				const ep = providerEndpoint('anthropic', 'ak');
				assert.equal(ep.url, 'https://api.anthropic.com/v1/messages');
				assert.deepEqual(ep.headers, {
					'Content-Type': 'application/json',
					'x-api-key': 'ak',
					'anthropic-version': '2023-06-01',
					'anthropic-dangerous-direct-browser-access': 'true'
				});
			});
			await t.test('openai-compatible normalizes /v1 and sends no bearer without a key', () => {
				const ep = providerEndpoint('openai-compatible', undefined, 'https://gw.example/');
				assert.equal(ep.url, 'https://gw.example/v1/chat/completions');
				assert.equal(ep.base, 'https://gw.example/v1');
				assert.deepEqual(ep.headers, { 'Content-Type': 'application/json' });
				assert.equal(
					providerEndpoint('openai-compatible', 'k', 'https://gw.example/v1').headers.Authorization,
					'Bearer k'
				);
			});
			await t.test('local providers default and gain /v1', () => {
				assert.equal(providerEndpoint('ollama').url, 'http://localhost:11434/v1/chat/completions');
				assert.equal(providerEndpoint('lmstudio', undefined, 'http://box:1234').url, 'http://box:1234/v1/chat/completions');
			});
			await t.test('cloud providers need a key', () => {
				assert.throws(() => providerEndpoint('openai'), /API key required/);
			});
		});

		await t.test('completeJson on web reads the server stream to the end', async (t) => {
			fx.tauri = false;
			let sent: Record<string, unknown> = {};
			t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
				assert.equal(url, '/api/chat');
				sent = JSON.parse(String(init.body));
				const wire = new TextEncoder().encode(`0:${JSON.stringify('{"mood":')}\n0:${JSON.stringify('"happy"}')}\n`);
				return new Response(new ReadableStream({ start(c) {
					for (let i = 0; i < wire.length; i += 5) c.enqueue(wire.slice(i, i + 5));
					c.close();
				} }));
			});
			const raw = await completeJson({
				provider: 'openai', model: 'gpt-x', apiKey: 'sk-1', isLocal: false,
				system: 'Return JSON.', user: 'Hi', maxTokens: 400
			});
			assert.equal(raw, '{"mood":"happy"}');
			assert.deepEqual(sent, {
				messages: [{ role: 'user', content: 'Hi' }],
				provider: 'openai', model: 'gpt-x', apiKey: 'sk-1',
				systemPrompt: 'Return JSON.', maxTokens: 400
			});
		});

		await t.test('completeJson returns null on a server error line', async (t) => {
			fx.tauri = false;
			t.mock.method(globalThis, 'fetch', async () => new Response(`e:${JSON.stringify({ error: 'nope' })}\n`));
			assert.equal(await completeJson({ provider: 'openai', model: 'm', apiKey: 'k', system: 's', user: 'u', maxTokens: 10 }), null);
		});

		await t.test('completeJson goes direct on desktop with forced JSON', async (t) => {
			fx.tauri = true;
			t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
				assert.equal(url, 'https://api.openai.com/v1/chat/completions');
				const body = JSON.parse(String(init.body));
				assert.deepEqual(body.response_format, { type: 'json_object' });
				assert.equal(body.max_tokens, 400);
				return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] }));
			});
			assert.equal(
				await completeJson({ provider: 'openai', model: 'm', apiKey: 'k', system: 's', user: 'u', maxTokens: 400 }),
				'{"ok":1}'
			);
			fx.tauri = false;
		});

		await t.test('streamChat reports the growing text and returns it on both transports', async (t) => {
			for (const tauri of [false, true]) {
				fx.tauri = tauri;
				t.mock.method(globalThis, 'fetch', async () => new Response(tauri
					? ['Hel', 'lo'].map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('')
					: `0:"Hel"\n0:"lo"\n`));
				const seen: string[] = [];
				const full = await streamChat(
					{ provider: 'openai', model: 'm', apiKey: 'k', messages: [], systemPrompt: '' },
					(text: string) => seen.push(text)
				);
				assert.equal(full, 'Hello');
				assert.deepEqual(seen, ['Hel', 'Hello']);
			}
			fx.tauri = false;
		});
	} finally {
		await server.close();
		delete globals.__llmTest;
	}
});

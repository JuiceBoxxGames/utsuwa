import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createDefaultCharacterState } from '../../types/character.ts';
import { parseResponse } from '../../ai/response-parser.ts';
import { StreamingSpeechBuffer } from '../tts/streaming-speech-buffer.ts';
import type { SpeechSegment } from '../voice-orchestrator.ts';

// Run the actual companion and transport modules. Only browser stores and
// persistence are replaced; the prompt, parsers, buffer and hosted xsai stream
// stay real so this test covers their event ordering together.
test('companion chat preserves native speech across direct and hosted state blocks', async (t) => {
	const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '');
	const speech = { activeProvider: 'omnivoice', activeLanguage: 'en', altLanguage: 'es', enableAltLanguage: true, enableToolCalling: true };
	let direct = true;
	let llmProvider = 'openai-compatible';
	let buffer: StreamingSpeechBuffer | undefined;
	let spoken: SpeechSegment[] = [];
	const turns: ReturnType<typeof parseResponse>[] = [];
	let latest = '';
	let speechEnabled = true;
	let speechStarted = false;
	const messages: { role: string; content: string }[] = [];
	const chatStore = {
		messages, isLoading: false, error: null as string | null,
		addMessage: (role: string, content: string) => messages.push({ role, content }),
		updateLastMessage: (content: string) => { messages[messages.length - 1].content = content; },
		setLoading: (value: boolean) => { chatStore.isLoading = value; },
		setError: (value: string | null) => { chatStore.error = value; }
	};
	const fixtures = {
		chatStore,
		characterStore: { state: createDefaultCharacterState(), isReady: false },
		personaStore: { activeCard: { id: 'test', name: 'Utsuwa', systemPrompt: 'Friendly', extensions: {} } },
		settingsStore: { getProviderConfig: () => ({ apiKey: 'test-key', baseUrl: 'https://provider.invalid/v1/' }) },
		modulesStore: {
			isModuleEnabled: () => true,
			getModuleState: () => ({ enabled: speechEnabled }),
			getModuleSettings: (id: string) => id === 'speech' ? speech : { activeProvider: llmProvider, activeModel: 'test-model' }
		},
		vrmStore: { startTalking: () => {} },
		reminderStore: { upcoming: [] },
		ttsStore: {
			beginStreaming: async () => {
				speechStarted = true;
				buffer = new StreamingSpeechBuffer({ defaultLanguage: 'en', onSegment: (s) => spoken.push(s) });
				return true;
			},
			feedStreaming: (chunk: string) => buffer?.feed(chunk),
			endStreaming: async () => { buffer?.flush(); },
			cancelStreaming: () => buffer?.reset()
		},
		mcpStore: {
			ensureTools: async () => {},
			hasActiveTools: false,
			tools: [],
			servers: []
		},
		publicEnv: {} as Record<string, string>,
		privateEnv: {} as Record<string, string>,
		isTauri: () => direct,
		processCompanionTurn: async ({ companionResponse }: { companionResponse: string }) => {
			const parsed = parseResponse(companionResponse);
			turns.push(parsed);
			return { dialogue: parsed.dialogue, newMemory: parsed.stateUpdates?.newMemory, triggeredEvent: null };
		}
	};
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.__utsuwaChatIntegration = fixtures;
	const replacements: Record<string, string> = {
		'$env/dynamic/private': 'export const env = globalThis.__utsuwaChatIntegration.privateEnv;',
		'$env/dynamic/public': 'export const env = globalThis.__utsuwaChatIntegration.publicEnv;',
		'src/lib/engine/memory': `export const retrieveRelevantContext = async () => ({ recentTurns: [], relevantFacts: [], triggeredMemories: [], recentSessions: [] });
			export const getWorkingMemory = () => ({}); export const ensureSession = async () => null;`,
		'src/lib/services/storage/keepsakes': 'export const keepImage = async () => {};',
		'src/lib/services/platform': 'export const isTauri = () => globalThis.__utsuwaChatIntegration.isTauri();',
		'src/lib/services/chat/companion-turn': 'export const processCompanionTurn = (...args) => globalThis.__utsuwaChatIntegration.processCompanionTurn(...args);'
	};
	for (const [path, name] of Object.entries({
		chat: 'chatStore', character: 'characterStore', persona: 'personaStore', settings: 'settingsStore',
		modules: 'modulesStore', vrm: 'vrmStore', reminders: 'reminderStore', tts: 'ttsStore', mcp: 'mcpStore'
	})) replacements[`src/lib/stores/${path}.svelte`] = `export const ${name} = globalThis.__utsuwaChatIntegration.${name};`;
	const server = await createServer({
		root, configFile: false, server: { middlewareMode: true }, appType: 'custom',
		resolve: { alias: [
			...Object.keys(replacements).map((key) => ({
				find: key.replace('src/lib/', '$lib/'), replacement: '\0companion-test:' + key
			})),
			{ find: '$lib', replacement: `${root}/src/lib` }
		] },
		optimizeDeps: { noDiscovery: true, entries: [] },
		plugins: [{
			name: 'companion-test-stores',
			resolveId(id) {
				if (id.startsWith('\0companion-test:')) return id;
				const key = id.startsWith(`${root}/`) ? id.slice(root.length + 1).replace(/\.ts$/, '') : id;
				if (key in replacements) return '\0companion-test:' + key;
			},
			load(id) { if (id.startsWith('\0companion-test:')) return replacements[id.slice('\0companion-test:'.length)]; }
		}]
	});
	try {
		const { sendCompanionMessage } = await server.ssrLoadModule('/src/lib/services/chat/companion-chat.ts');
		const { POST } = await server.ssrLoadModule('/src/routes/api/chat/+server.ts');
		const state = '\n```json\n{"mood_change":{"emotion":"happy","intensity_delta":2},"new_memory":"They are learning Spanish"}\n```\nDuplicate text must stay hidden.';
		const hooks = { setTyping: () => {}, setLatestResponse: (text: string) => { latest = text; }, setActiveEvent: () => {} };
		for (const transport of ['direct', 'hosted']) {
			for (const stateFirst of [true, false]) {
				await t.test(`${transport}, state ${stateFirst ? 'before' : 'after'} native calls`, async (t) => {
					direct = transport === 'direct';
					messages.length = 0; spoken = []; turns.length = 0;
					const textEvents = [...state].map((content) => ({ choices: [{ delta: { content } }] }));
					const toolEvents = ['Let me know how your interview goes.', 'Hola, buenos días.'].flatMap((text, index) => {
						const args = JSON.stringify({ text, language: index ? 'es' : 'en' });
						return [
							{ choices: [{ delta: { tool_calls: [{ index, id: `call_${index}`, type: 'function', function: { name: 'speak_segment', arguments: args.slice(0, 10) } }] } }] },
							{ choices: [{ delta: { tool_calls: [{ index, function: { arguments: args.slice(10) } }] } }] }
						];
					});
					const events = stateFirst ? [...textEvents, ...toolEvents] : [...toolEvents, ...textEvents];
					const wire = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
					t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
						if (url === '/api/chat') return POST({ request: new Request('http://localhost/api/chat', init) });
						assert.equal(String(url), 'https://provider.invalid/v1/chat/completions');
						return new Response(new ReadableStream({ start(controller) {
							// Split both SSE lines and UTF-8 characters across network chunks.
							const bytes = new TextEncoder().encode(wire);
							for (let i = 0; i < bytes.length; i += 11) controller.enqueue(bytes.slice(i, i + 11));
							controller.close();
						} }), { headers: { 'Content-Type': 'text/event-stream' } });
					});
					await sendCompanionMessage('Hello', [], hooks);
					assert.equal(chatStore.error, null);
					assert.deepEqual(spoken.map((s) => [s.text, s.language]), [
						['Let me know how your interview goes.', 'en'], ['Hola, buenos días.', 'es']
					]);
					assert.equal(latest, 'Let me know how your interview goes. Hola, buenos días.');
					assert.equal(messages.at(-1)?.content, latest);
					assert.equal(turns.at(-1)?.stateUpdates?.newMemory, 'They are learning Spanish');
					assert.equal(turns.at(-1)?.stateUpdates?.moodChange?.emotion, 'happy');
				});
			}
		}
		await t.test('Anthropic receives inline instructions and speech-off requests receive no tools', async (t) => {
			direct = true; llmProvider = 'anthropic';
			for (const enabled of [true, false]) {
				speechEnabled = enabled; speechStarted = false; messages.length = 0; spoken = [];
				t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
					const body = JSON.parse(String(init.body));
					assert.equal(body.tools, undefined);
					assert.equal(body.system.includes('inline speak() commands'), enabled);
					assert.equal(body.system.includes('native tool calls'), false);
					return new Response(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: 'speak({"text":"Hello there.","lang":"en"})' + state } })}\n\n`);
				});
				await sendCompanionMessage('Hello', [], hooks);
				assert.equal(chatStore.error, null);
				assert.equal(latest, 'Hello there.');
				assert.equal(speechStarted, enabled);
			}
		});
		await t.test('MCP tool loop executes the tool, feeds the result back and then speaks', async (t) => {
			direct = false; llmProvider = 'openai-compatible';
			speechEnabled = true; messages.length = 0; spoken = []; turns.length = 0;
			const mcp = fixtures.mcpStore as {
				hasActiveTools: boolean;
				tools: unknown[];
				servers: unknown[];
			};
			mcp.hasActiveTools = true;
			mcp.tools = [{
				serverId: 'ha', serverName: 'Home Assistant', name: 'get_state',
				description: 'Read an entity state', inputSchema: { type: 'object' }
			}];
			mcp.servers = [{ id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp', enabled: true }];

			let providerRound = 0;
			const toolCallWire = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_state', arguments: '{}' } }] } }] })}\n\n` + 'data: [DONE]\n\n';
			const speechWire = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_2', type: 'function', function: { name: 'speak_segment', arguments: JSON.stringify({ text: 'It is 21 degrees.', language: 'en' }) } }] } }] })}\n\n` + 'data: [DONE]\n\n';

			t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
				if (url === '/api/chat') {
					if (providerRound === 1) {
						const body = JSON.parse(String(init.body));
						const toolMessage = body.messages.find((m: { role: string }) => m.role === 'tool');
						assert.ok(toolMessage, 'the tool result is fed back into the second round');
						assert.equal(toolMessage.content, '21 degrees');
						assert.equal(body.messages.some((m: { role: string; tool_calls?: unknown }) => m.role === 'assistant' && m.tool_calls), true);
					}
					return POST({ request: new Request('http://localhost/api/chat', init) });
				}
				if (url === '/api/mcp/call') {
					const body = JSON.parse(String(init.body));
					assert.equal(body.toolName, 'get_state');
					return new Response(JSON.stringify({ toolName: 'get_state', content: '21 degrees', isError: false }), {
						headers: { 'Content-Type': 'application/json' }
					});
				}
				const wire = providerRound === 0 ? toolCallWire : speechWire;
				providerRound++;
				return new Response(new ReadableStream({ start(controller) {
					controller.enqueue(new TextEncoder().encode(wire));
					controller.close();
				} }), { headers: { 'Content-Type': 'text/event-stream' } });
			});

			await sendCompanionMessage('How warm is it?', [], hooks);
			assert.equal(chatStore.error, null);
			assert.equal(providerRound, 2, 'the model runs again after the tool result');
			assert.deepEqual(spoken.map((s) => [s.text, s.language]), [['It is 21 degrees.', 'en']]);
			assert.equal(latest, 'It is 21 degrees.');
			mcp.hasActiveTools = false; mcp.tools = []; mcp.servers = [];
		});
		await t.test('a failing MCP tool call is fed back as an error result', async (t) => {
			direct = false; llmProvider = 'openai-compatible';
			speechEnabled = true; messages.length = 0; spoken = []; turns.length = 0;
			const mcp = fixtures.mcpStore as {
				hasActiveTools: boolean;
				tools: unknown[];
				servers: unknown[];
			};
			mcp.hasActiveTools = true;
			mcp.tools = [{
				serverId: 'ha', serverName: 'Home Assistant', name: 'get_state',
				description: 'Read an entity state', inputSchema: { type: 'object' }
			}];
			mcp.servers = [{ id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp', enabled: true }];

			let providerRound = 0;
			const toolCallWire = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_state', arguments: '{}' } }] } }] })}\n\n` + 'data: [DONE]\n\n';
			const speechWire = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_2', type: 'function', function: { name: 'speak_segment', arguments: JSON.stringify({ text: 'The sensor is offline.', language: 'en' }) } }] } }] })}\n\n` + 'data: [DONE]\n\n';

			t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
				if (url === '/api/chat') {
					if (providerRound === 1) {
						const body = JSON.parse(String(init.body));
						const toolMessage = body.messages.find((m: { role: string }) => m.role === 'tool');
						assert.ok(toolMessage, 'the failed tool result is still fed back');
						assert.match(toolMessage.content, /Error: network down/);
					}
					return POST({ request: new Request('http://localhost/api/chat', init) });
				}
				if (url === '/api/mcp/call') throw new Error('network down');
				const wire = providerRound === 0 ? toolCallWire : speechWire;
				providerRound++;
				return new Response(new ReadableStream({ start(controller) {
					controller.enqueue(new TextEncoder().encode(wire));
					controller.close();
				} }), { headers: { 'Content-Type': 'text/event-stream' } });
			});

			await sendCompanionMessage('How warm is it?', [], hooks);
			assert.equal(chatStore.error, null, 'the turn survives a failing tool call');
			assert.equal(providerRound, 2, 'the model runs again after the failed tool result');
			assert.deepEqual(spoken.map((s) => [s.text, s.language]), [['The sensor is offline.', 'en']]);
			mcp.hasActiveTools = false; mcp.tools = []; mcp.servers = [];
		});
		await t.test('the MCP loop stops at the round budget and strips intermediate state fences', async (t) => {
			direct = false; llmProvider = 'openai-compatible';
			speechEnabled = false; messages.length = 0; spoken = []; turns.length = 0;
			const mcp = fixtures.mcpStore as {
				hasActiveTools: boolean;
				tools: unknown[];
				servers: unknown[];
			};
			mcp.hasActiveTools = true;
			mcp.tools = [{
				serverId: 'ha', serverName: 'Home Assistant', name: 'get_state',
				description: 'Read an entity state', inputSchema: { type: 'object' }
			}];
			mcp.servers = [{ id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp', enabled: true }];

			let providerRound = 0;
			let toolCalls = 0;
			t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
				if (url === '/api/chat') {
					if (providerRound === 4) {
						const body = JSON.parse(String(init.body));
						const note = body.messages.find(
							(m: { role: string; content?: string }) =>
								m.role === 'user' && String(m.content).includes('tool budget reached')
						);
						assert.ok(note, 'the final round tells the model the budget is spent');
					}
					return POST({ request: new Request('http://localhost/api/chat', init) });
				}
				if (url === '/api/mcp/call') {
					toolCalls++;
					return new Response(JSON.stringify({ toolName: 'get_state', content: 'ok', isError: false }), {
						headers: { 'Content-Type': 'application/json' }
					});
				}
				const n = providerRound++;
				const fence = '\n```json\n{"new_memory":"round ' + n + '"}\n```\nrepeat ' + n;
				const events = [
					{ choices: [{ delta: { content: 'Round ' + n + '.' + fence } }] },
					{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_' + n, type: 'function', function: { name: 'get_state', arguments: '{}' } }] } }] }
				];
				const wire = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
				return new Response(new TextEncoder().encode(wire), { headers: { 'Content-Type': 'text/event-stream' } });
			});

			await sendCompanionMessage('Status?', [], hooks);
			assert.equal(chatStore.error, null);
			assert.equal(providerRound, 5, 'the loop stops after MCP_MAX_ROUNDS rounds');
			assert.equal(toolCalls, 4, 'the final round executes no further tools');
			assert.equal(turns.at(-1)?.stateUpdates?.newMemory, 'round 4', 'only the final round state block is parsed');
			mcp.hasActiveTools = false; mcp.tools = []; mcp.servers = [];
		});
		await t.test('text and an MCP tool call in the same round are both preserved', async (t) => {
			direct = false; llmProvider = 'openai-compatible';
			speechEnabled = true; messages.length = 0; spoken = []; turns.length = 0;
			const mcp = fixtures.mcpStore as {
				hasActiveTools: boolean;
				tools: unknown[];
				servers: unknown[];
			};
			mcp.hasActiveTools = true;
			mcp.tools = [{
				serverId: 'ha', serverName: 'Home Assistant', name: 'get_state',
				description: 'Read an entity state', inputSchema: { type: 'object' }
			}];
			mcp.servers = [{ id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp', enabled: true }];

			let providerRound = 0;
			const mixedWire = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Let me check the sensor. ' } }] })}\n\n` +
				`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_state', arguments: '{}' } }] } }] })}\n\n` + 'data: [DONE]\n\n';
			const speechWire = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_2', type: 'function', function: { name: 'speak_segment', arguments: JSON.stringify({ text: 'It is 21 degrees.', language: 'en' }) } }] } }] })}\n\n` + 'data: [DONE]\n\n';

			t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
				if (url === '/api/chat') return POST({ request: new Request('http://localhost/api/chat', init) });
				if (url === '/api/mcp/call') {
					const body = JSON.parse(String(init.body));
					assert.equal(body.toolName, 'get_state');
					return new Response(JSON.stringify({ toolName: 'get_state', content: '21 degrees', isError: false }), {
						headers: { 'Content-Type': 'application/json' }
					});
				}
				const wire = providerRound === 0 ? mixedWire : speechWire;
				providerRound++;
				return new Response(new TextEncoder().encode(wire), { headers: { 'Content-Type': 'text/event-stream' } });
			});

			await sendCompanionMessage('How warm is it?', [], hooks);
			assert.equal(chatStore.error, null);
			assert.equal(providerRound, 2, 'the model runs again after the tool result');
			const dialogue = turns.at(-1)?.dialogue ?? '';
			assert.match(dialogue, /Let me check the sensor\./);
			assert.match(dialogue, /It is 21 degrees\./);
			mcp.hasActiveTools = false; mcp.tools = []; mcp.servers = [];
		});
		await t.test('Anthropic never receives MCP tool definitions', async (t) => {
			direct = true; llmProvider = 'anthropic';
			speechEnabled = false; messages.length = 0; spoken = []; turns.length = 0;
			const mcp = fixtures.mcpStore as {
				hasActiveTools: boolean;
				tools: unknown[];
				servers: unknown[];
			};
			mcp.hasActiveTools = true;
			mcp.tools = [{
				serverId: 'ha', serverName: 'Home Assistant', name: 'get_state',
				description: 'Read an entity state', inputSchema: { type: 'object' }
			}];
			mcp.servers = [{ id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp', enabled: true }];

			t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
				const body = JSON.parse(String(init.body));
				assert.equal(body.tools, undefined, 'MCP tools are not sent on the Anthropic path');
				return new Response(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: 'Hello there.' } })}\n\n`);
			});

			await sendCompanionMessage('Hello', [], hooks);
			assert.equal(chatStore.error, null);
			mcp.hasActiveTools = false; mcp.tools = []; mcp.servers = [];
		});
		await t.test('a confirmation-listed tool is never executed and reported back', async (t) => {
			direct = false; llmProvider = 'openai-compatible';
			speechEnabled = true; messages.length = 0; spoken = []; turns.length = 0;
			const mcp = fixtures.mcpStore as {
				hasActiveTools: boolean;
				tools: unknown[];
				servers: unknown[];
			};
			mcp.hasActiveTools = true;
			mcp.tools = [{
				serverId: 'ha', serverName: 'Home Assistant', name: 'get_state',
				description: 'Read an entity state', inputSchema: { type: 'object' }
			}];
			mcp.servers = [{ id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp', enabled: true }];
			fixtures.publicEnv.PUBLIC_MCP_CONFIRM_TOOLS = 'get_state';

			let providerRound = 0;
			let mcpCalls = 0;
			const toolCallWire = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_state', arguments: '{}' } }] } }] })}\n\n` + 'data: [DONE]\n\n';
			const speechWire = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_2', type: 'function', function: { name: 'speak_segment', arguments: JSON.stringify({ text: 'It needs your confirmation.', language: 'en' }) } }] } }] })}\n\n` + 'data: [DONE]\n\n';

			t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
				if (url === '/api/chat') {
					if (providerRound === 1) {
						const body = JSON.parse(String(init.body));
						const toolMessage = body.messages.find((m: { role: string }) => m.role === 'tool');
						assert.ok(toolMessage, 'the blocked call still gets a tool result');
						assert.match(toolMessage.content, /requires manual user confirmation/);
					}
					return POST({ request: new Request('http://localhost/api/chat', init) });
				}
				if (url === '/api/mcp/call') {
					mcpCalls++;
					return new Response(JSON.stringify({ toolName: 'get_state', content: 'should not run', isError: false }), {
						headers: { 'Content-Type': 'application/json' }
					});
				}
				const wire = providerRound === 0 ? toolCallWire : speechWire;
				providerRound++;
				return new Response(new ReadableStream({ start(controller) {
					controller.enqueue(new TextEncoder().encode(wire));
					controller.close();
				} }), { headers: { 'Content-Type': 'text/event-stream' } });
			});

			await sendCompanionMessage('Check the sensor', [], hooks);
			assert.equal(chatStore.error, null);
			assert.equal(mcpCalls, 0, 'the blocked tool never reaches the MCP call route');
			assert.equal(providerRound, 2, 'the model still answers after the blocked call');
			assert.deepEqual(spoken.map((s) => [s.text, s.language]), [['It needs your confirmation.', 'en']]);
			delete fixtures.publicEnv.PUBLIC_MCP_CONFIRM_TOOLS;
			mcp.hasActiveTools = false; mcp.tools = []; mcp.servers = [];
		});
		await t.test('the MCP call route rejects confirmation-listed tools', async () => {
			fixtures.publicEnv.PUBLIC_MCP_CONFIRM_TOOLS = 'get_state';
			fixtures.privateEnv.MCP_ENABLED = 'server';
			const { POST: callPOST } = await server.ssrLoadModule('/src/routes/api/mcp/call/+server.ts');
			const response = await callPOST({
				request: new Request('http://localhost/api/mcp/call', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						server: { id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp', enabled: true },
						toolName: 'get_state',
						args: {}
					})
				})
			});
			assert.equal(response.status, 403);
			const body = (await response.json()) as { error?: string };
			assert.match(body.error ?? '', /requires manual user confirmation/);
			delete fixtures.publicEnv.PUBLIC_MCP_CONFIRM_TOOLS;
			delete fixtures.privateEnv.MCP_ENABLED;
		});
		await t.test('the MCP call route rejects stdio commands outside the allowlist', async () => {
			fixtures.privateEnv.MCP_ENABLED = 'server';
			fixtures.privateEnv.MCP_STDIO_ALLOWED_COMMANDS = 'npx';
			const { POST: callPOST } = await server.ssrLoadModule('/src/routes/api/mcp/call/+server.ts');
			const response = await callPOST({
				request: new Request('http://localhost/api/mcp/call', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						server: { id: 'evil', name: 'Evil', transport: 'stdio', command: 'rm', args: ['-rf', '/'], enabled: true },
						toolName: 'do_it',
						args: {}
					})
				})
			});
			assert.equal(response.status, 403);
			const body = (await response.json()) as { error?: string };
			assert.match(body.error ?? '', /MCP_STDIO_ALLOWED_COMMANDS/);
			delete fixtures.privateEnv.MCP_ENABLED;
			delete fixtures.privateEnv.MCP_STDIO_ALLOWED_COMMANDS;
		});
		await t.test('an unknown tool call is answered with an error result', async (t) => {
			direct = true; llmProvider = 'openai-compatible';
			speechEnabled = false; messages.length = 0; spoken = []; turns.length = 0;
			const mcp = fixtures.mcpStore as {
				hasActiveTools: boolean;
				tools: unknown[];
				servers: unknown[];
			};
			mcp.hasActiveTools = true;
			mcp.tools = [{
				serverId: 'ha', serverName: 'Home Assistant', name: 'get_state',
				description: 'Read an entity state', inputSchema: { type: 'object' }
			}];
			mcp.servers = [{ id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp', enabled: true }];

			let providerRound = 0;
			const round0 = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [
				{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_state', arguments: '{}' } },
				{ index: 1, id: 'call_2', type: 'function', function: { name: 'make_coffee', arguments: '{}' } }
			] } }] })}\n\n` + 'data: [DONE]\n\n';
			const round1 = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Done.' } }] })}\n\n` + 'data: [DONE]\n\n';

			t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
				if (url === '/api/mcp/call') {
					return new Response(JSON.stringify({ toolName: 'get_state', content: 'ok', isError: false }), {
						headers: { 'Content-Type': 'application/json' }
					});
				}
				if (providerRound === 1) {
					const body = JSON.parse(String(init.body));
					const toolMessages = body.messages.filter((m: { role: string }) => m.role === 'tool');
					const unknown = toolMessages.find((m: { content: string }) =>
						String(m.content).includes('unknown tool')
					);
					assert.ok(unknown, 'the hallucinated tool gets an error result');
					assert.match(String(unknown.content), /make_coffee/);
				}
				const wire = providerRound === 0 ? round0 : round1;
				providerRound++;
				return new Response(new TextEncoder().encode(wire), { headers: { 'Content-Type': 'text/event-stream' } });
			});

			await sendCompanionMessage('Check it', [], hooks);
			assert.equal(chatStore.error, null);
			assert.equal(providerRound, 2, 'the model runs again after the mixed tool round');
			mcp.hasActiveTools = false; mcp.tools = []; mcp.servers = [];
		});
		await t.test('the MCP call route disables stdio without an allowlist', async () => {
			fixtures.privateEnv.MCP_ENABLED = 'server';
			const { POST: callPOST } = await server.ssrLoadModule('/src/routes/api/mcp/call/+server.ts');
			const response = await callPOST({
				request: new Request('http://localhost/api/mcp/call', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						server: { id: 'brave', name: 'Brave', transport: 'stdio', command: 'npx', args: [], enabled: true },
						toolName: 'search',
						args: {}
					})
				})
			});
			assert.equal(response.status, 403);
			const body = (await response.json()) as { error?: string };
			assert.match(body.error ?? '', /stdio is disabled/);
			delete fixtures.privateEnv.MCP_ENABLED;
		});
		await t.test('the tools route reports fail-closed stdio as a per-server error', async () => {
			fixtures.privateEnv.MCP_ENABLED = 'server';
			const { POST: toolsPOST } = await server.ssrLoadModule('/src/routes/api/mcp/tools/+server.ts');
			const response = await toolsPOST({
				request: new Request('http://localhost/api/mcp/tools', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						servers: [{ id: 'brave', name: 'Brave', transport: 'stdio', command: 'npx', args: [], enabled: true }]
					})
				})
			});
			assert.equal(response.status, 200);
			const body = (await response.json()) as {
				tools: unknown[];
				errors: Array<{ message: string }>;
			};
			assert.equal(body.tools.length, 0);
			assert.match(body.errors[0]?.message ?? '', /stdio is disabled/);
			delete fixtures.privateEnv.MCP_ENABLED;
		});
		await t.test('a server disabled mid-turn is not executed', async (t) => {
			direct = false; llmProvider = 'openai-compatible';
			speechEnabled = false; messages.length = 0; spoken = []; turns.length = 0;
			const mcp = fixtures.mcpStore as {
				hasActiveTools: boolean;
				tools: unknown[];
				servers: unknown[];
			};
			mcp.hasActiveTools = true;
			mcp.tools = [{
				serverId: 'ha', serverName: 'Home Assistant', name: 'get_state',
				description: 'Read an entity state', inputSchema: { type: 'object' }
			}];
			mcp.servers = [{ id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp', enabled: true }];

			let providerRound = 0;
			let mcpCalls = 0;
			const toolCallWire = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_state', arguments: '{}' } }] } }] })}\n\n` + 'data: [DONE]\n\n';
			const answerWire = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Done.' } }] })}\n\n` + 'data: [DONE]\n\n';

			t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
				if (url === '/api/chat') {
					if (providerRound === 1) {
						const body = JSON.parse(String(init.body));
						const toolMessage = body.messages.find((m: { role: string }) => m.role === 'tool');
						assert.match(toolMessage.content, /no enabled MCP server/);
					}
					return POST({ request: new Request('http://localhost/api/chat', init) });
				}
				if (url === '/api/mcp/call') {
					mcpCalls++;
					return new Response(JSON.stringify({ toolName: 'get_state', content: 'should not run', isError: false }), {
						headers: { 'Content-Type': 'application/json' }
					});
				}
				if (providerRound === 0) {
					// Disable the server after the tool snapshot was taken.
					mcp.servers = [{ id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp', enabled: false }];
				}
				const wire = providerRound === 0 ? toolCallWire : answerWire;
				providerRound++;
				return new Response(new TextEncoder().encode(wire), { headers: { 'Content-Type': 'text/event-stream' } });
			});

			await sendCompanionMessage('Check it', [], hooks);
			assert.equal(chatStore.error, null);
			assert.equal(mcpCalls, 0, 'a disabled server is never contacted');
			mcp.hasActiveTools = false; mcp.tools = []; mcp.servers = [];
		});
		await t.test('tool errors are prefixed for the model', async (t) => {
			direct = false; llmProvider = 'openai-compatible';
			speechEnabled = false; messages.length = 0; spoken = []; turns.length = 0;
			const mcp = fixtures.mcpStore as {
				hasActiveTools: boolean;
				tools: unknown[];
				servers: unknown[];
			};
			mcp.hasActiveTools = true;
			mcp.tools = [{
				serverId: 'ha', serverName: 'Home Assistant', name: 'get_state',
				description: 'Read an entity state', inputSchema: { type: 'object' }
			}];
			mcp.servers = [{ id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp', enabled: true }];

			let providerRound = 0;
			const toolCallWire = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_state', arguments: '{}' } }] } }] })}\n\n` + 'data: [DONE]\n\n';
			const answerWire = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Done.' } }] })}\n\n` + 'data: [DONE]\n\n';

			t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
				if (url === '/api/chat') {
					if (providerRound === 1) {
						const body = JSON.parse(String(init.body));
						const toolMessage = body.messages.find((m: { role: string }) => m.role === 'tool');
						assert.equal(toolMessage.content, 'Error: sensor offline');
					}
					return POST({ request: new Request('http://localhost/api/chat', init) });
				}
				if (url === '/api/mcp/call') {
					return new Response(JSON.stringify({ toolName: 'get_state', content: 'sensor offline', isError: true }), {
						headers: { 'Content-Type': 'application/json' }
					});
				}
				const wire = providerRound === 0 ? toolCallWire : answerWire;
				providerRound++;
				return new Response(new TextEncoder().encode(wire), { headers: { 'Content-Type': 'text/event-stream' } });
			});

			await sendCompanionMessage('Check it', [], hooks);
			assert.equal(chatStore.error, null);
			mcp.hasActiveTools = false; mcp.tools = []; mcp.servers = [];
		});
		await t.test('injectResultsAsUser adds a user-side copy of the tool result', async (t) => {
			direct = false; llmProvider = 'openai-compatible';
			speechEnabled = false; messages.length = 0; spoken = []; turns.length = 0;
			const mcp = fixtures.mcpStore as {
				hasActiveTools: boolean;
				tools: unknown[];
				servers: unknown[];
			};
			mcp.hasActiveTools = true;
			mcp.tools = [{
				serverId: 'ha', serverName: 'Home Assistant', name: 'get_state',
				description: 'Read an entity state', inputSchema: { type: 'object' }
			}];
			mcp.servers = [{
				id: 'ha', name: 'Home Assistant', transport: 'http', url: 'http://ha.local/api/mcp',
				enabled: true, injectResultsAsUser: true
			}];

			let providerRound = 0;
			const toolCallWire = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_state', arguments: '{}' } }] } }] })}\n\n` + 'data: [DONE]\n\n';
			const answerWire = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Done.' } }] })}\n\n` + 'data: [DONE]\n\n';

			t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
				if (url === '/api/chat') {
					if (providerRound === 1) {
						const body = JSON.parse(String(init.body));
						const injected = body.messages.some(
							(m: { role: string; content?: string }) =>
								m.role === 'user' && String(m.content).includes('21 degrees')
						);
						assert.ok(injected, 'the tool result is repeated as a user-side note');
					}
					return POST({ request: new Request('http://localhost/api/chat', init) });
				}
				if (url === '/api/mcp/call') {
					return new Response(JSON.stringify({ toolName: 'get_state', content: '21 degrees', isError: false }), {
						headers: { 'Content-Type': 'application/json' }
					});
				}
				const wire = providerRound === 0 ? toolCallWire : answerWire;
				providerRound++;
				return new Response(new TextEncoder().encode(wire), { headers: { 'Content-Type': 'text/event-stream' } });
			});

			await sendCompanionMessage('How warm is it?', [], hooks);
			assert.equal(chatStore.error, null);
			mcp.hasActiveTools = false; mcp.tools = []; mcp.servers = [];
		});
	} finally {
		buffer?.reset();
		await server.close();
		delete globals.__utsuwaChatIntegration;
	}
});

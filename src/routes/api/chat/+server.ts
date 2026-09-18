import { streamText } from '@xsai/stream-text';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import type { LLMProvider } from '$lib/types';
import { ensureOpenAIPath, getChatBaseUrl } from '$lib/services/providers/local-endpoints';
import { assertSafeProviderUrl } from '$lib/services/providers/url-guard';
import { sanitizeProviderError } from '$lib/services/providers/provider-errors';
import { DEFAULT_CHAT_BASE_URLS } from '$lib/services/providers/provider-defaults';

// Providers that don't require API keys
const LOCAL_PROVIDERS: LLMProvider[] = ['ollama', 'lmstudio'];

export const POST: RequestHandler = async ({ request }) => {
	const { messages, provider, model, apiKey, baseURL, systemPrompt, temperature, maxTokens, topP, presencePenalty, frequencyPenalty, tools } = await request.json();

	if (!Array.isArray(messages)) {
		return new Response(JSON.stringify({ error: 'messages must be an array' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const typedProvider = provider as LLMProvider;

	// Local providers and OpenAI-compatible endpoints don't require API keys.
	const isLocalProvider = LOCAL_PROVIDERS.includes(typedProvider);
	const isKeylessProvider = isLocalProvider || typedProvider === 'openai-compatible';
	if (!apiKey && !isKeylessProvider) {
		return new Response(JSON.stringify({ error: 'API key required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Model is required - no more static fallbacks
	if (!model) {
		return new Response(JSON.stringify({ error: 'Model is required. Please select a model from the list.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		// Configure based on provider
		let providerBaseURL = baseURL;
		const headers: Record<string, string> = {};

		// Handle special provider configurations
		if (typedProvider === 'anthropic') {
			providerBaseURL = providerBaseURL || DEFAULT_CHAT_BASE_URLS.anthropic;
			headers['anthropic-dangerous-direct-browser-access'] = 'true';
		} else if (isLocalProvider) {
			providerBaseURL = getChatBaseUrl(typedProvider, providerBaseURL);
		} else if (typedProvider === 'openai-compatible') {
			// Same /v1 normalization as model discovery, so a base URL that
			// populates the dropdown can't then 404 on chat.
			providerBaseURL = providerBaseURL ? ensureOpenAIPath(providerBaseURL) : providerBaseURL;
		} else {
			// Use default base URL for provider
			providerBaseURL = providerBaseURL || DEFAULT_CHAT_BASE_URLS[typedProvider];
		}

		// Block SSRF: the base URL is client-supplied and fetched server-side.
		try {
			assertSafeProviderUrl(providerBaseURL, env.ALLOW_LOCAL_PROVIDER_HOSTS === 'true');
		} catch (e) {
			return new Response(
				JSON.stringify({ error: e instanceof Error ? e.message : 'Invalid provider URL' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Add system message (use provided systemPrompt or default)
		const defaultSystemPrompt =
			'You are a friendly AI assistant displayed as a VRM avatar named Utsuwa. Keep responses conversational and relatively concise.';
		const messagesWithSystem = [
			{
				role: 'system' as const,
				content: systemPrompt || defaultSystemPrompt
			},
			...messages
		];

		let result;
		try {
			// @xsai/stream-text requires an `execute` function on every tool
			// (called via `tool.execute`, NOT `tool.function.execute`). We do NOT
			// want the tool executed here — the speak_segment tool call is just
			// streamed to the client as speech instructions. Provide a no-op that
			// returns the parsed args so xsai doesn't crash with "tool.execute is
			// not a function".
			const toolsWithExecute = Array.isArray(tools) && tools.length > 0
				? tools.map((t) => ({
						...t,
						function: t.function as Record<string, unknown>,
						execute: async (args: unknown) => ({ result: args })
					}))
				: undefined;

			result = streamText({
				// Keyless custom endpoints must not receive a fabricated bearer;
				// strict gateways reject 'Bearer not-needed'. xsai omits the
				// Authorization header entirely when apiKey is undefined.
				apiKey: apiKey || (typedProvider === 'openai-compatible' ? undefined : 'not-needed'),
				baseURL: providerBaseURL,
				model,
				messages: messagesWithSystem,
				headers,
				...(typedProvider === 'openai-compatible' && {
					...(temperature !== undefined && { temperature }),
					...(maxTokens !== undefined && { max_tokens: maxTokens }),
					...(topP !== undefined && { top_p: topP }),
					...(presencePenalty !== undefined && { presence_penalty: presencePenalty }),
					...(frequencyPenalty !== undefined && { frequency_penalty: frequencyPenalty })
				}),
				// Tool definitions are OpenAI-shaped; Anthropic keeps the speak() text fallback
				...(typedProvider !== 'anthropic' && toolsWithExecute !== undefined && { tools: toolsWithExecute })
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to connect to provider';
			return new Response(JSON.stringify({ error: sanitizeProviderError(msg, providerBaseURL) }), {
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Suppress ALL background promise/stream rejections so they don't crash Node.
		// xsai rejects every promise and errors every stream when the provider request fails.
		const silentCatch = () => {};
		result.messages?.catch?.(silentCatch);
		result.steps?.catch?.(silentCatch);
		result.totalUsage?.catch?.(silentCatch);
		result.usage?.catch?.(silentCatch);
		// Consume errored ReadableStreams so they don't become unhandled
		// fullStream is consumed by the SSE reader below – do NOT consume it here.
		result.reasoningTextStream?.getReader().read().catch(silentCatch);

		const { fullStream } = result;

		// Create a readable stream for SSE
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				let reader;
				try {
					reader = fullStream.getReader();
				} catch (err) {
					const msg = err instanceof Error ? err.message : 'Failed to start stream';
					controller.enqueue(
						encoder.encode(`e:${JSON.stringify({ error: sanitizeProviderError(msg, providerBaseURL) })}\n`)
					);
					controller.close();
					return;
				}

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						if (value.type === 'text-delta') {
							// Forward text as-is. The client parses the JSON state block out of
							// the full reply, so nothing may be dropped here.
							const data = `0:${JSON.stringify(value.text)}\n`;
							controller.enqueue(encoder.encode(data));
						} else if (value.type === 'tool-call') {
							// Keep native calls separate from text so the client can
							// process speech even after the textual state fence. The
							// client classifies each call: speech tools become
							// speak() pseudo-calls, MCP tools feed the client-side
							// tool loop. Malformed calls are dropped — a bad call
							// must not kill the stream.
							try {
								const args =
									typeof value.args === 'string' ? JSON.parse(value.args) : value.args;
								controller.enqueue(
									encoder.encode(
										`t:${JSON.stringify({ id: value.toolCallId, name: value.toolName, args })}\n`
									)
								);
							} catch {
								// Malformed tool-call args: drop the call, keep streaming.
							}
						}
					}
					controller.close();
				} catch (error) {
					console.error('Stream error:', error);
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					controller.enqueue(
						encoder.encode(
							`e:${JSON.stringify({ error: sanitizeProviderError(errorMessage, providerBaseURL) })}\n`
						)
					);
					controller.close();
				} finally {
					reader.releaseLock();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive'
			}
		});
	} catch (error) {
		console.error('Chat API error:', error);
		const msg = error instanceof Error ? error.message : 'Unknown error';
		return new Response(JSON.stringify({ error: sanitizeProviderError(msg, baseURL) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

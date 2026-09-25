// One place that decides how a request reaches the model: straight to the
// provider (desktop, and local servers the hosted site can't proxy to) or through
// the /api/chat server route (cloud providers on web, which mostly lack CORS).
import type { LLMProvider } from '$lib/types';
import { isTauri } from '$lib/services/platform';
import {
	ensureOpenAIPath,
	getChatBaseUrl,
	getLocalProviderConnectionHint,
	isLocalLLMProvider
} from '$lib/services/providers/local-endpoints';
import { DEFAULT_CHAT_BASE_URLS } from '$lib/services/providers/provider-defaults';
import {
	htmlEndpointError,
	looksLikeHtml,
	sanitizeProviderError
} from '$lib/services/providers/provider-errors';
import { type MessageContent, toOpenAIContent, toAnthropicContent } from '$lib/services/chat/content';
import { emitToolCalls, type ToolCallBuffer } from '$lib/services/chat/tool-call-buffers';
import { ProviderError, isTransientStatus, parseRetryAfter, withRetry } from './retry';

/** The model a request goes to. */
export interface LLMTarget {
	provider: LLMProvider;
	model: string;
	apiKey?: string;
	baseURL?: string;
	isLocal?: boolean;
	/** A user-configured OpenAI-compatible endpoint. */
	custom?: boolean;
}

interface ChatToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: MessageContent;
	/** Assistant messages in the MCP tool loop carry their tool calls. */
	tool_calls?: ChatToolCall[];
	/** Tool-role result messages reference the call they answer. */
	tool_call_id?: string;
}

export interface ChatRequest extends LLMTarget {
	messages: ChatMessage[];
	systemPrompt: string;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	presencePenalty?: number;
	frequencyPenalty?: number;
	/** Native tool definitions for providers that support function calling. */
	tools?: Record<string, unknown>[];
	signal?: AbortSignal;
	/** Called before each automatic retry of a temporary failure. */
	onRetry?: (attempt: number, delayMs: number) => void;
}

export interface JsonRequest extends LLMTarget {
	system: string;
	user: string;
	maxTokens: number;
	signal?: AbortSignal;
}

type OnToolCall = (name: string, args: Record<string, unknown>, id?: string) => void;

export type Transport = 'direct' | 'server';

export function chooseTransport(meta: { isLocal?: boolean } | undefined, tauri: boolean): Transport {
	return tauri || meta?.isLocal ? 'direct' : 'server';
}

/** URL and headers for a direct provider call. Throws when the call can't be made. */
export function providerEndpoint(provider: LLMProvider, apiKey?: string, baseURL?: string) {
	const isLocal = isLocalLLMProvider(provider);
	// Custom OpenAI-compatible endpoints may or may not need a key, so don't force one.
	if (!apiKey && !isLocal && provider !== 'openai-compatible') {
		throw new Error('API key required');
	}

	// Custom endpoints get the same /v1 normalization as model discovery, so a
	// base URL that populates the dropdown can't then 404 on chat.
	const base = isLocal
		? getChatBaseUrl(provider, baseURL)
		: provider === 'openai-compatible' && baseURL
			? ensureOpenAIPath(baseURL)
			: baseURL || DEFAULT_CHAT_BASE_URLS[provider];
	if (!base) {
		throw new Error(`Unknown provider: ${provider}`);
	}

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (provider === 'anthropic') {
		headers['x-api-key'] = apiKey || '';
		headers['anthropic-version'] = '2023-06-01';
		headers['anthropic-dangerous-direct-browser-access'] = 'true';
	} else if (apiKey) {
		headers['Authorization'] = `Bearer ${apiKey}`;
	}

	const path = provider === 'anthropic' ? 'messages' : 'chat/completions';
	return { base, url: `${base.replace(/\/+$/, '')}/${path}`, headers, isLocal };
}

/**
 * Stream a chat reply. onText gets the whole reply so far on every chunk; the
 * promise resolves with the full text and rejects with a user-facing message.
 * Temporary failures are retried, but only before any output has arrived.
 */
export async function streamChat(
	request: ChatRequest,
	onText: (fullText: string) => void,
	onToolCall?: OnToolCall
): Promise<string> {
	let started = false;
	const text = (fullText: string) => {
		started = true;
		onText(fullText);
	};
	const toolCall: OnToolCall | undefined = onToolCall && ((...args) => {
		started = true;
		onToolCall(...args);
	});
	return await withRetry(() => streamOnce(request, text, toolCall), {
		signal: request.signal,
		canRetry: () => !started,
		onRetry: request.onRetry
	});
}

async function streamOnce(
	request: ChatRequest,
	onText: (fullText: string) => void,
	onToolCall?: OnToolCall
): Promise<string> {
	if (chooseTransport(request, isTauri()) === 'direct') {
		return await streamDirect(request, onText, onToolCall);
	}
	const { messages, provider, model, apiKey, baseURL, custom, systemPrompt, tools, signal } = request;
	return await streamServer(
		{
			messages: messages.map((m) => ({
				role: m.role,
				content: toOpenAIContent(m.content),
				...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
				...(m.tool_call_id && { tool_call_id: m.tool_call_id })
			})),
			provider,
			model,
			apiKey: apiKey || (custom ? undefined : 'not-needed'),
			baseURL,
			systemPrompt,
			tools,
			temperature: request.temperature,
			topP: request.topP,
			maxTokens: request.maxTokens,
			presencePenalty: request.presencePenalty,
			frequencyPenalty: request.frequencyPenalty
		},
		onText,
		onToolCall,
		signal
	);
}

/**
 * One-shot JSON call. Returns the raw text the model produced, or null on any
 * failure. Direct calls use response_format json_object for OpenAI-compatible
 * providers (incl. Ollama and LM Studio); the server route streams, so its reply
 * is read to the end.
 */
export async function completeJson(request: JsonRequest): Promise<string | null> {
	const { system, user, maxTokens, signal, ...llm } = request;
	try {
		if (chooseTransport(request, isTauri()) === 'direct') return await requestJsonDirect(request);
		return await streamChat(
			{ ...llm, messages: [{ role: 'user', content: user }], systemPrompt: system, maxTokens, signal },
			() => {}
		);
	} catch {
		return null;
	}
}

function getCurrentSiteOrigin(): string | undefined {
	return typeof window !== 'undefined' ? window.location.origin : undefined;
}

async function streamDirect(
	options: ChatRequest,
	onText: (fullText: string) => void,
	onToolCall?: OnToolCall
): Promise<string> {
	const { messages, provider, model, apiKey, baseURL, systemPrompt } = options;
	const { base: providerBaseURL, url, headers, isLocal } = providerEndpoint(provider, apiKey, baseURL);

	const messagesWithSystem: ChatMessage[] = [
		{ role: 'system', content: systemPrompt },
		...messages
	];

	// Anthropic uses a different request format, and each provider wants images
	// wrapped its own way (image_url data URLs vs base64 source blocks).
	const body =
		provider === 'anthropic'
			? JSON.stringify({
					model,
					max_tokens: 4096,
					system: systemPrompt,
					messages: messages
						.filter((m) => m.role !== 'system')
						.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
					stream: true
				})
			: JSON.stringify({
					model,
					messages: messagesWithSystem.map((m) => ({
						role: m.role,
						content: toOpenAIContent(m.content),
						...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
						...(m.tool_call_id && { tool_call_id: m.tool_call_id })
					})),
					stream: true,
					...(options.temperature !== undefined && { temperature: options.temperature }),
					...(options.maxTokens !== undefined && { max_tokens: options.maxTokens }),
					...(options.topP !== undefined && { top_p: options.topP }),
					...(options.presencePenalty !== undefined && { presence_penalty: options.presencePenalty }),
					...(options.frequencyPenalty !== undefined && { frequency_penalty: options.frequencyPenalty }),
					...(options.tools !== undefined && options.tools.length > 0 && { tools: options.tools })
				});

	let response: Response;
	try {
		response = await fetch(url, { method: 'POST', headers, body, signal: options.signal });
	} catch (err) {
		if (options.signal?.aborted) throw err;
		const rawMessage = err instanceof Error ? err.message : 'Failed to connect to provider';
		// A local server that isn't running won't be up in 2s; say how to fix it
		if (isLocal) throw new Error(getLocalProviderConnectionHint(provider, providerBaseURL, getCurrentSiteOrigin()));
		throw new ProviderError(rawMessage, true);
	}

	if (!response.ok) {
		const bodyText = await response.text().catch(() => '');
		let msg = `Provider error (${response.status})`;
		if (looksLikeHtml(bodyText)) {
			msg = htmlEndpointError(providerBaseURL);
		} else {
			try {
				msg = JSON.parse(bodyText)?.error?.message || msg;
			} catch {
				// Not JSON, keep the status-based message
			}
		}
		msg = sanitizeProviderError(msg, providerBaseURL);
		throw new ProviderError(
			isLocal && response.status === 404 ? `${msg}. Pull or select an installed model.` : msg,
			isTransientStatus(response.status),
			parseRetryAfter(response.headers.get('retry-after'))
		);
	}

	// A 200 with an HTML content-type means the URL points at a website, not an API
	const contentType = response.headers.get('content-type') || '';
	if (contentType.includes('text/html')) {
		throw new Error(htmlEndpointError(providerBaseURL));
	}

	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error('No response body');
	}

	const decoder = new TextDecoder();
	let buffer = '';
	let fullText = '';
	const onChunk = (text: string) => {
		fullText += text;
		onText(fullText);
	};

	// Collect tool-call deltas across chunks (OpenAI-compatible only).
	// Each delta contains one index/fragment; we aggregate by index and
	// fire the callback when the function name + arguments are complete.
	const toolCallBuffers: Map<number, ToolCallBuffer> = new Map();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() || '';

		for (const line of lines) {
			processStreamLine(line, onChunk, onToolCall, toolCallBuffers);
		}
	}

	// Flush the decoder and any final line that arrived without a trailing newline
	buffer += decoder.decode();
	processStreamLine(buffer, onChunk, onToolCall, toolCallBuffers);

	// Fire onToolCall for each collected tool call after the stream ends
	emitToolCalls(toolCallBuffers, onToolCall);
	return fullText;
}

function processStreamLine(
	line: string,
	onChunk: (text: string) => void,
	onToolCall?: OnToolCall,
	toolCallBuffers?: Map<number, ToolCallBuffer>
): void {
	const trimmed = line.trim();
	if (!trimmed || trimmed === 'data: [DONE]') return;
	if (!trimmed.startsWith('data: ')) return;

	try {
		const json = JSON.parse(trimmed.slice(6));

		// OpenAI-compatible format
		if (json.choices?.[0]?.delta?.content) {
			onChunk(json.choices[0].delta.content);
		}
		// OpenAI-compatible tool calls
		if (json.choices?.[0]?.delta?.tool_calls && onToolCall && toolCallBuffers) {
			for (const tc of json.choices[0].delta.tool_calls) {
				const index = tc.index ?? 0;
				if (!toolCallBuffers.has(index)) {
					toolCallBuffers.set(index, { id: '', name: '', args: '' });
				}
				const buf = toolCallBuffers.get(index)!;
				// The id arrives with the first delta of a call.
				if (tc.id && !buf.id) buf.id = tc.id;
				if (tc.function?.name) buf.name += tc.function.name;
				if (tc.function?.arguments) buf.args += tc.function.arguments;
				// Fire when the stop reason signals completion (stream end)
			}
		}
		// Anthropic format
		else if (json.type === 'content_block_delta' && json.delta?.text) {
			onChunk(json.delta.text);
		}
	} catch {
		// Skip malformed JSON lines
	}
}

// Non-streaming, forced-JSON call straight to the provider.
async function requestJsonDirect(request: JsonRequest): Promise<string | null> {
	const { provider, model, apiKey, baseURL, system, user, maxTokens, signal } = request;
	const { url, headers } = providerEndpoint(provider, apiKey, baseURL);
	const body =
		provider === 'anthropic'
			? JSON.stringify({
					model,
					max_tokens: maxTokens,
					system,
					messages: [{ role: 'user', content: user }]
				})
			: JSON.stringify({
					model,
					messages: [
						{ role: 'system', content: system },
						{ role: 'user', content: user }
					],
					response_format: { type: 'json_object' },
					stream: false,
					max_tokens: maxTokens
				});

	const response = await fetch(url, { method: 'POST', headers, body, signal });
	if (!response.ok) return null;
	const json = await response.json();
	if (provider === 'anthropic') {
		return json?.content?.[0]?.text ?? null;
	}
	return json?.choices?.[0]?.message?.content ?? null;
}

// Buffer partial lines from the server's text, tool-call and error events.
// Always release the reader lock, including when an error event arrives.
async function streamServer(
	body: unknown,
	onText: (fullText: string) => void,
	onToolCall?: OnToolCall,
	signal?: AbortSignal
): Promise<string> {
	let response: Response;
	try {
		response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal
		});
	} catch (err) {
		if (signal?.aborted) throw err;
		throw new ProviderError(err instanceof Error ? err.message : 'Failed to reach the server', true);
	}

	// The route says whether the provider failure was temporary; a bare gateway
	// error page (no JSON) falls back to the status.
	if (!response.ok) {
		const errBody = await response.json().catch(() => null);
		throw new ProviderError(
			errBody?.error || 'Failed to get response',
			errBody?.transient ?? isTransientStatus(response.status),
			errBody?.retryAfterMs
		);
	}

	const reader = response.body?.getReader();
	if (!reader) throw new Error('No response body');

	const decoder = new TextDecoder();
	let fullContent = '';
	const processLine = (line: string) => {
		if (line.startsWith('0:')) {
			fullContent += JSON.parse(line.slice(2));
			onText(fullContent);
		} else if (line.startsWith('t:')) {
			const { id, name, args } = JSON.parse(line.slice(2)) as {
				id?: string;
				name: string;
				args: Record<string, unknown>;
			};
			onToolCall?.(name, args, id);
		} else if (line.startsWith('e:')) {
			const { error, transient, retryAfterMs } = JSON.parse(line.slice(2));
			throw new ProviderError(error, transient === true, retryAfterMs);
		}
	};

	try {
		let buffer = '';
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';
			for (const line of lines) processLine(line);
		}
		buffer += decoder.decode();
		if (buffer) processLine(buffer);
	} finally {
		reader.releaseLock();
	}

	return fullContent;
}

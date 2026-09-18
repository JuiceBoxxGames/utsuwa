import type { LLMProvider } from '$lib/types';
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
import { type MessageContent, toOpenAIContent, toAnthropicContent } from './content';
import { emitToolCalls, type ToolCallBuffer } from './tool-call-buffers';

interface ChatToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: MessageContent;
	/** Assistant messages in the MCP tool loop carry their tool calls. */
	tool_calls?: ChatToolCall[];
	/** Tool-role result messages reference the call they answer. */
	tool_call_id?: string;
}

interface ChatOptions {
	messages: ChatMessage[];
	provider: LLMProvider;
	model: string;
	apiKey?: string;
	baseURL?: string;
	systemPrompt: string;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	presencePenalty?: number;
	frequencyPenalty?: number;
	/** Native tool definitions for providers that support function calling. */
	tools?: Record<string, unknown>[];
}

function getCurrentSiteOrigin(): string | undefined {
	return typeof window !== 'undefined' ? window.location.origin : undefined;
}

/**
 * Stream chat completions directly from provider APIs.
 * Used for local providers and Tauri builds where SvelteKit server routes aren't available.
 */
export async function streamChatDirect(
	options: ChatOptions,
	onChunk: (text: string) => void,
	onError: (error: string) => void,
	onDone: () => void,
	onToolCall?: (name: string, args: Record<string, unknown>, id: string) => void
): Promise<void> {
	const { messages, provider, model, apiKey, baseURL, systemPrompt } = options;

	const isLocal = isLocalLLMProvider(provider);
	// Custom OpenAI-compatible endpoints may or may not need a key, so don't force one.
	if (!apiKey && !isLocal && provider !== 'openai-compatible') {
		onError('API key required');
		return;
	}

	// Custom endpoints get the same /v1 normalization as model discovery, so a
	// base URL that populates the dropdown can't then 404 on chat.
	const providerBaseURL = isLocal
		? getChatBaseUrl(provider, baseURL)
		: provider === 'openai-compatible' && baseURL
			? ensureOpenAIPath(baseURL)
			: baseURL || DEFAULT_CHAT_BASE_URLS[provider];
	if (!providerBaseURL) {
		onError(`Unknown provider: ${provider}`);
		return;
	}

	const messagesWithSystem: ChatMessage[] = [
		{ role: 'system', content: systemPrompt },
		...messages
	];

	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (provider === 'anthropic') {
		headers['x-api-key'] = apiKey || '';
		headers['anthropic-version'] = '2023-06-01';
		headers['anthropic-dangerous-direct-browser-access'] = 'true';
	} else if (apiKey) {
		headers['Authorization'] = `Bearer ${apiKey}`;
	}

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

	const url = provider === 'anthropic'
		? `${providerBaseURL.replace(/\/+$/, '')}/messages`
		: `${providerBaseURL.replace(/\/+$/, '')}/chat/completions`;

	try {
		const response = await fetch(url, { method: 'POST', headers, body });

		if (!response.ok) {
			const bodyText = await response.text().catch(() => '');
			let msg = `Provider error (${response.status})`;
			if (looksLikeHtml(bodyText)) {
				msg = htmlEndpointError(providerBaseURL);
			} else {
				try {
					msg = JSON.parse(bodyText)?.error?.message || msg;
				} catch {
					// Not JSON — keep the status-based message
				}
			}
			msg = sanitizeProviderError(msg, providerBaseURL);
			onError(isLocal && response.status === 404 ? `${msg}. Pull or select an installed model.` : msg);
			return;
		}

		// A 200 with an HTML content-type means the URL points at a website, not an API
		const contentType = response.headers.get('content-type') || '';
		if (contentType.includes('text/html')) {
			onError(htmlEndpointError(providerBaseURL));
			return;
		}

		const reader = response.body?.getReader();
		if (!reader) {
			onError('No response body');
			return;
		}

		const decoder = new TextDecoder();
		let buffer = '';

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

		onDone();
	} catch (err) {
		const rawMessage = err instanceof Error ? err.message : 'Failed to connect to provider';
		const msg = isLocal
			? getLocalProviderConnectionHint(provider, providerBaseURL, getCurrentSiteOrigin())
			: rawMessage;
		onError(msg);
	}
}

function processStreamLine(
	line: string,
	onChunk: (text: string) => void,
	onToolCall?: (name: string, args: Record<string, unknown>, id: string) => void,
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

interface ExtractOptions {
	provider: LLMProvider;
	model: string;
	apiKey?: string;
	baseURL?: string;
	system: string;
	userMessage: string;
	reply: string;
}

/**
 * Non-streaming, forced-JSON call used as the decoupled state/memory extractor.
 * Returns the raw JSON string the model produced (or null on any failure).
 * Uses response_format json_object for OpenAI-compatible providers (incl. Ollama
 * and LM Studio), which constrains the output to valid JSON.
 */
export async function extractStateUpdates(options: ExtractOptions): Promise<string | null> {
	const { provider, model, apiKey, baseURL, system, userMessage, reply } = options;
	const isLocal = isLocalLLMProvider(provider);
	if (!apiKey && !isLocal && provider !== 'openai-compatible') return null;

	const base = isLocal
		? getChatBaseUrl(provider, baseURL)
		: provider === 'openai-compatible' && baseURL
			? ensureOpenAIPath(baseURL)
			: baseURL || DEFAULT_CHAT_BASE_URLS[provider];
	if (!base) return null;

	const trimmedBase = base.replace(/\/+$/, '');
	const userContent = `User: ${userMessage}\nCompanion: ${reply}\n\nReturn the JSON.`;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };

	let url: string;
	let body: string;
	if (provider === 'anthropic') {
		headers['x-api-key'] = apiKey || '';
		headers['anthropic-version'] = '2023-06-01';
		headers['anthropic-dangerous-direct-browser-access'] = 'true';
		url = `${trimmedBase}/messages`;
		body = JSON.stringify({
			model,
			max_tokens: 400,
			system,
			messages: [{ role: 'user', content: userContent }]
		});
	} else {
		if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
		url = `${trimmedBase}/chat/completions`;
		body = JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: userContent }
			],
			response_format: { type: 'json_object' },
			stream: false,
			max_tokens: 400
		});
	}

	try {
		const response = await fetch(url, { method: 'POST', headers, body });
		if (!response.ok) return null;
		const json = await response.json();
		if (provider === 'anthropic') {
			return json?.content?.[0]?.text ?? null;
		}
		return json?.choices?.[0]?.message?.content ?? null;
	} catch {
		return null;
	}
}

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import type { LLMProvider } from '$lib/types';
import {
	ensureOpenAIPath,
	getModelsBaseUrl,
	isLocalLLMProvider,
	looksLikeOllama
} from '$lib/services/providers/local-endpoints';
import { assertSafeProviderTarget, createGuardedFetch } from '$lib/services/providers/url-guard.server';
import { sanitizeProviderError } from '$lib/services/providers/provider-errors';
import { DEFAULT_MODELS_BASE_URLS } from '$lib/services/providers/provider-defaults';

interface ModelInfo {
	id: string;
	name: string;
}

interface FetchModelsResponse {
	models: ModelInfo[];
	error?: string;
}

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

type GetJson = <T>(path: string, headers?: Record<string, string>) => Promise<T>;

// Paths are resolved against the base (never string-appended), and upstream
// text never reaches the error message: only the status or a fixed phrase.
function createGetJson(base: string, fetchImpl: typeof fetch, signal: AbortSignal): GetJson {
	const root = new URL(base.endsWith('/') ? base : `${base}/`);
	return async <T>(path: string, headers: Record<string, string> = {}) => {
		const response = await fetchImpl(new URL(path, root), { headers, signal });
		if (!response.ok) {
			await response.body?.cancel();
			throw new Error(`Failed to fetch models: HTTP ${response.status}`);
		}
		const text = await readCapped(response, MAX_BODY_BYTES);
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new Error('Provider returned a response that is not JSON');
		}
	};
}

async function readCapped(response: Response, max: number): Promise<string> {
	if (!response.body) return '';
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let text = '';
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > max) {
			await reader.cancel();
			throw new Error('Provider model list is too large');
		}
		text += decoder.decode(value, { stream: true });
	}
	return text + decoder.decode();
}


// Model filter patterns - only keep chat-compatible models
// Note: Google IDs have 'models/' prefix stripped before filtering
const MODEL_FILTERS: Record<string, RegExp> = {
	openai: /^(gpt-|o1-|o3-|chatgpt-4o-)/,
	anthropic: /^claude-/,
	deepseek: /^deepseek-(chat|reasoner)/,
	xai: /^grok-/,
	google: /^gemini-/
};

function filterModels(providerId: string, models: ModelInfo[]): ModelInfo[] {
	const filter = MODEL_FILTERS[providerId];
	if (!filter) return models; // No filter = keep all (Ollama, LM Studio, openai-compatible)
	return models.filter((m) => filter.test(m.id));
}

function normalizeModelName(id: string, providerId: string): string {
	let name = id;

	// Remove 'models/' prefix from Google
	if (providerId === 'google' && name.startsWith('models/')) {
		name = name.replace('models/', '');
	}

	// Strip date suffixes from Anthropic models (e.g., -20251101)
	if (providerId === 'anthropic') {
		name = name.replace(/-\d{8}$/, '');
		// Convert version like "opus-4-5" to "opus-4.5" (match version after model tier)
		name = name.replace(/(opus|sonnet|haiku)-(\d+)-(\d+)$/, '$1-$2.$3');
	}

	// Capitalize and format common patterns
	name = name
		.replace(/-/g, ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase())
		.replace(/Gpt/g, 'GPT')
		.replace(/O1/g, 'o1')
		.replace(/O3/g, 'o3');

	return name;
}

type ModelList<T> = { data?: T[] };

async function fetchOpenAIModels(get: GetJson, apiKey?: string): Promise<ModelInfo[]> {
	const headers: Record<string, string> = {};
	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
	const data = await get<ModelList<{ id: string }>>('models', headers);
	return (data.data || []).map((m) => ({
		id: m.id,
		name: normalizeModelName(m.id, 'openai')
	}));
}

async function fetchAnthropicModels(get: GetJson, apiKey: string): Promise<ModelInfo[]> {
	const data = await get<Required<ModelList<{ id: string }>>>('models', {
		'x-api-key': apiKey,
		'anthropic-version': '2023-06-01'
	});
	return data.data.map((m) => ({
		id: m.id,
		name: normalizeModelName(m.id, 'anthropic')
	}));
}

async function fetchOllamaModels(get: GetJson): Promise<ModelInfo[]> {
	const data = await get<{ models?: Array<{ name: string }> }>('api/tags');
	return (data.models || []).map((m) => ({
		id: m.name,
		name: m.name
	}));
}

async function fetchLMStudioModels(get: GetJson): Promise<ModelInfo[]> {
	const data = await get<Required<ModelList<{ id: string }>>>('models');
	return data.data.map((m) => ({
		id: m.id,
		name: m.id
	}));
}

// DeepSeek and xAI share the OpenAI list shape with a required key.
async function fetchBearerModels(get: GetJson, apiKey: string, providerId: string): Promise<ModelInfo[]> {
	const data = await get<Required<ModelList<{ id: string }>>>('models', {
		Authorization: `Bearer ${apiKey}`
	});
	return data.data.map((m) => ({
		id: m.id,
		name: normalizeModelName(m.id, providerId)
	}));
}

async function fetchGoogleModels(get: GetJson, apiKey: string): Promise<ModelInfo[]> {
	const data = await get<{ models?: Array<{ name: string; displayName?: string }> }>('models', {
		'x-goog-api-key': apiKey
	});
	return (data.models || []).map((m) => ({
		id: m.name.replace('models/', ''),
		name: m.displayName || normalizeModelName(m.name, 'google')
	}));
}

// TTS Provider fetch functions

async function fetchElevenLabsModels(get: GetJson, apiKey: string): Promise<ModelInfo[]> {
	const models = await get<Array<{ model_id: string; name: string; can_do_text_to_speech?: boolean }>>(
		'models',
		{ 'xi-api-key': apiKey }
	);
	// Filter to TTS-capable models only
	return models
		.filter((m) => m.can_do_text_to_speech)
		.map((m) => ({
			id: m.model_id,
			name: m.name
		}));
}

async function fetchOpenAITTSModels(get: GetJson, apiKey: string): Promise<ModelInfo[]> {
	const data = await get<Required<ModelList<{ id: string }>>>('models', {
		Authorization: `Bearer ${apiKey}`
	});
	// Filter to TTS models only (contain "tts" in name)
	return data.data
		.filter((m) => m.id.includes('tts'))
		.map((m) => ({
			id: m.id,
			name: normalizeModelName(m.id, 'openai-tts')
		}));
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { providerId, apiKey, baseUrl } = await request.json();

		if (!providerId) {
			return Response.json({ models: [], error: 'Provider ID required' } as FetchModelsResponse, {
				status: 400
			});
		}

		const effectiveBaseUrl =
			baseUrl || DEFAULT_MODELS_BASE_URLS[providerId as LLMProvider] || '';

		// Remove trailing slash for consistency
		const cleanBaseUrl =
			providerId === 'ollama' || providerId === 'lmstudio'
				? getModelsBaseUrl(providerId, effectiveBaseUrl)
				: effectiveBaseUrl.replace(/\/+$/, '');

		// Block SSRF: the base URL is client-supplied and fetched server-side.
		const allowPrivate = env.ALLOW_LOCAL_PROVIDER_HOSTS === 'true';
		try {
			await assertSafeProviderTarget(cleanBaseUrl, allowPrivate);
		} catch (e) {
			return Response.json(
				{
					models: [],
					error: e instanceof Error ? e.message : 'Invalid provider URL'
				} as FetchModelsResponse,
				{ status: 400 }
			);
		}

		const guardedFetch = createGuardedFetch(allowPrivate, TIMEOUT_MS);
		const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]);
		const at = (base: string) => createGetJson(base, guardedFetch, signal);
		const get = at(cleanBaseUrl);

		let models: ModelInfo[] = [];

		switch (providerId) {
			case 'openai':
				if (!apiKey) throw new Error('API key required for OpenAI');
				models = await fetchOpenAIModels(get, apiKey);
				break;
			case 'openai-compatible': {
				// OpenAI-compatible endpoints may or may not require an API key.
				if (looksLikeOllama(cleanBaseUrl)) {
					models = await fetchOllamaModels(get);
				} else {
					models = await fetchOpenAIModels(at(ensureOpenAIPath(cleanBaseUrl)), apiKey);
				}
				break;
			}
			case 'anthropic':
				if (!apiKey) throw new Error('API key required for Anthropic');
				models = await fetchAnthropicModels(get, apiKey);
				break;
			case 'ollama':
				models = await fetchOllamaModels(get);
				break;
			case 'lmstudio':
				models = await fetchLMStudioModels(get);
				break;
			case 'deepseek':
				if (!apiKey) throw new Error('API key required for DeepSeek');
				models = await fetchBearerModels(get, apiKey, 'deepseek');
				break;
			case 'xai':
				if (!apiKey) throw new Error('API key required for xAI');
				models = await fetchBearerModels(get, apiKey, 'xai');
				break;
			case 'google':
				if (!apiKey) throw new Error('API key required for Google');
				models = await fetchGoogleModels(get, apiKey);
				break;
			// TTS providers
			case 'elevenlabs':
				if (!apiKey) throw new Error('API key required for ElevenLabs');
				models = await fetchElevenLabsModels(get, apiKey);
				break;
			case 'openai-tts':
				if (!apiKey) throw new Error('API key required for OpenAI TTS');
				models = await fetchOpenAITTSModels(get, apiKey);
				break;
			default:
				return Response.json(
					{ models: [], error: `Unknown provider: ${providerId}` } as FetchModelsResponse,
					{ status: 400 }
				);
		}

		// Filter to chat-compatible models
		const filteredModels = filterModels(providerId, models);

		return Response.json({ models: filteredModels } as FetchModelsResponse);
	} catch (error) {
		console.error('Error fetching models:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return Response.json({ models: [], error: sanitizeProviderError(message) } as FetchModelsResponse, {
			status: 500
		});
	}
};

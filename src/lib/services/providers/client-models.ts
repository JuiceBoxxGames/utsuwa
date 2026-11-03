import type { LLMProvider } from '$lib/types';
import {
	ensureCustomOpenAIPath,
	getLocalProviderConnectionHint,
	getModelsBaseUrl,
	isLocalLLMProvider,
	looksLikeOllama
} from './local-endpoints.ts';
import { CHAT_MODEL_FILTERS, DEFAULT_MODELS_BASE_URLS } from './provider-defaults.ts';
import { addLMStudioVision, addOllamaVision, reportedVision, type FetchJson } from './vision.ts';

interface ModelInfo {
	id: string;
	name: string;
	vision?: boolean;
}

const TIMEOUT_MS = 10_000;

function jsonAt(base: string, signal: AbortSignal): FetchJson {
	return async (path, body) => {
		const res = await fetch(
			new URL(path, base),
			body === undefined ? { signal } : { method: 'POST', body: JSON.stringify(body), signal }
		);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	};
}

function getCurrentSiteOrigin(): string | undefined {
	return typeof window !== 'undefined' ? window.location.origin : undefined;
}

function normalizeModelName(id: string, providerId: string): string {
	let name = id;
	if (providerId === 'google' && name.startsWith('models/')) {
		name = name.replace('models/', '');
	}
	if (providerId === 'anthropic') {
		name = name.replace(/-\d{8}$/, '');
		name = name.replace(/(opus|sonnet|haiku)-(\d+)-(\d+)$/, '$1-$2.$3');
	}
	name = name
		.replace(/-/g, ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase())
		.replace(/Gpt/g, 'GPT')
		.replace(/O1/g, 'o1')
		.replace(/O3/g, 'o3');
	return name;
}

/**
 * Fetch models directly from provider APIs.
 * Used in Tauri builds where SvelteKit server routes aren't available.
 */
export async function fetchModelsDirect(
	providerId: string,
	apiKey?: string,
	baseUrl?: string
): Promise<{ models: ModelInfo[]; error?: string }> {
	const cleanBaseUrl =
		providerId === 'ollama' || providerId === 'lmstudio'
			? getModelsBaseUrl(providerId, baseUrl)
			: (baseUrl || DEFAULT_MODELS_BASE_URLS[providerId] || '').replace(/\/+$/, '');
	const signal = AbortSignal.timeout(TIMEOUT_MS);

	try {
		let models: ModelInfo[] = [];

		switch (providerId) {
			case 'openai':
			case 'deepseek':
			case 'xai': {
				if (!apiKey) throw new Error('API key required');
				const res = await fetch(`${cleanBaseUrl}/models`, {
					headers: { Authorization: `Bearer ${apiKey}` },
					signal
				});
				if (!res.ok) throw new Error(`Failed to fetch models: HTTP ${res.status}`);
				const data = await res.json();
				models = data.data.map((m: { id: string }) => ({
					id: m.id,
					name: normalizeModelName(m.id, providerId)
				}));
				break;
			}
			case 'openai-compatible': {
				// OpenAI-compatible endpoints (OpenRouter, Together, vLLM, ...) may or
				// may not require an API key. Keep all returned models as-is.
				const headers: Record<string, string> = {};
				if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

				// Ollama exposes an OpenAI-compatible chat endpoint but its model list
				// lives at /api/tags rather than /v1/models.
				if (looksLikeOllama(cleanBaseUrl)) {
					// Its documented OpenAI base ends in /v1; the native API sits beside it
					const ollamaBase = getModelsBaseUrl('ollama', cleanBaseUrl);
					const res = await fetch(`${ollamaBase}/api/tags`, { headers, signal });
					if (!res.ok) throw new Error(`Failed to fetch models: HTTP ${res.status}`);
					const data = await res.json();
					models = (data.models || []).map((m: { name: string }) => ({
						id: m.name,
						name: m.name
					}));
					models = await addOllamaVision(models, jsonAt(ollamaBase, signal));
				} else {
					const normalizedUrl = ensureCustomOpenAIPath(cleanBaseUrl);
					const res = await fetch(`${normalizedUrl}/models`, { headers, signal });
					if (!res.ok) throw new Error(`Failed to fetch models: HTTP ${res.status}`);
					const data = await res.json();
					models = (data.data || []).map((m: { id: string }) => ({
						id: m.id,
						name: m.id,
						vision: reportedVision(m)
					}));
				}
				break;
			}
			case 'anthropic': {
				if (!apiKey) throw new Error('API key required');
				const res = await fetch(`${cleanBaseUrl}/models`, {
					headers: {
						'x-api-key': apiKey,
						'anthropic-version': '2023-06-01',
						'anthropic-dangerous-direct-browser-access': 'true'
					},
					signal
				});
				if (!res.ok) throw new Error(`Failed to fetch models: HTTP ${res.status}`);
				const data = await res.json();
				models = data.data.map((m: { id: string }) => ({
					id: m.id,
					name: normalizeModelName(m.id, 'anthropic')
				}));
				break;
			}
			case 'ollama': {
				const res = await fetch(`${cleanBaseUrl}/api/tags`, { signal });
				if (!res.ok) throw new Error(`Failed to fetch models: HTTP ${res.status}`);
				const data = await res.json();
				models = (data.models || []).map((m: { name: string }) => ({
					id: m.name,
					name: m.name
				}));
				models = await addOllamaVision(models, jsonAt(cleanBaseUrl, signal));
				break;
			}
			case 'lmstudio': {
				const res = await fetch(`${cleanBaseUrl}/models`, { signal });
				if (!res.ok) throw new Error(`Failed to fetch models: HTTP ${res.status}`);
				const data = await res.json();
				models = data.data.map((m: { id: string }) => ({ id: m.id, name: m.id }));
				models = await addLMStudioVision(models, jsonAt(cleanBaseUrl, signal));
				break;
			}
			case 'google': {
				if (!apiKey) throw new Error('API key required');
				const res = await fetch(`${cleanBaseUrl}/models`, {
					headers: { 'x-goog-api-key': apiKey },
					signal
				});
				if (!res.ok) throw new Error(`Failed to fetch models: HTTP ${res.status}`);
				const data = await res.json();
				models = (data.models || []).map(
					(m: { name: string; displayName?: string }) => ({
						id: m.name.replace('models/', ''),
						name: m.displayName || normalizeModelName(m.name, 'google')
					})
				);
				break;
			}
			case 'elevenlabs': {
				if (!apiKey) throw new Error('API key required');
				const res = await fetch(`${cleanBaseUrl}/models`, {
					headers: { 'xi-api-key': apiKey },
					signal
				});
				if (!res.ok) throw new Error(`Failed to fetch models: HTTP ${res.status}`);
				const data = await res.json();
				models = data
					.filter((m: { can_do_text_to_speech?: boolean }) => m.can_do_text_to_speech)
					.map((m: { model_id: string; name: string }) => ({
						id: m.model_id,
						name: m.name
					}));
				break;
			}
			case 'openai-tts': {
				if (!apiKey) throw new Error('API key required');
				const res = await fetch(`${cleanBaseUrl}/models`, {
					headers: { Authorization: `Bearer ${apiKey}` },
					signal
				});
				if (!res.ok) throw new Error(`Failed to fetch models: HTTP ${res.status}`);
				const data = await res.json();
				models = data.data
					.filter((m: { id: string }) => m.id.includes('tts'))
					.map((m: { id: string }) => ({
						id: m.id,
						name: normalizeModelName(m.id, 'openai-tts')
					}));
				break;
			}
			default:
				return { models: [], error: `Unknown provider: ${providerId}` };
		}

		const filter = CHAT_MODEL_FILTERS[providerId];
		const filtered = filter ? models.filter((m) => filter.test(m.id)) : models;
		return { models: filtered };
	} catch (error) {
		const message =
			isLocalLLMProvider(providerId)
				? getLocalProviderConnectionHint(providerId, cleanBaseUrl, getCurrentSiteOrigin())
				: error instanceof Error && error.name === 'TimeoutError'
					? 'Request timed out'
					: error instanceof Error ? error.message : 'Unknown error';
		return { models: [], error: message };
	}
}

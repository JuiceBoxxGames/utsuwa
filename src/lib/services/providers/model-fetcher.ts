import { isTauri } from '$lib/services/platform';
import { fetchModelsDirect } from './client-models';
import { isLocalLLMProvider } from './local-endpoints';
import { getTTSProvider } from './registry';

export interface ModelInfo {
	id: string;
	name: string;
}

export interface FetchModelsResult {
	models: ModelInfo[];
	error?: string;
	fromCache?: boolean;
}

const FETCH_TIMEOUT_MS = 10000;

// Collapse concurrent identical requests into one. Reactive effects and repeated
// mounts (e.g. the settings and onboarding model pickers) can fire the same
// fetch several times in a tick; without this each one hit the provider.
const inFlight = new Map<string, Promise<FetchModelsResult>>();

export function fetchProviderModels(
	providerId: string,
	apiKey: string,
	baseUrl?: string
): Promise<FetchModelsResult> {
	const key = `${providerId}|${baseUrl ?? ''}|${apiKey}`;
	const existing = inFlight.get(key);
	if (existing) return existing;

	const request = fetchProviderModelsUncached(providerId, apiKey, baseUrl).finally(() =>
		inFlight.delete(key)
	);
	inFlight.set(key, request);
	return request;
}

async function fetchProviderModelsUncached(
	providerId: string,
	apiKey: string,
	baseUrl?: string
): Promise<FetchModelsResult> {
	// Fish Audio has no model-list endpoint; the registry list is the full set.
	if (providerId === 'fish-audio') {
		return { models: getTTSProvider(providerId)?.models ?? [] };
	}

	// Local providers must be fetched from the user's device, not the deployed server.
	// Tauri production builds also don't have server routes.
	if (isTauri() || isLocalLLMProvider(providerId)) {
		return fetchModelsDirect(providerId, apiKey, baseUrl);
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const response = await fetch('/api/providers/models', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ providerId, apiKey, baseUrl }),
			signal: controller.signal
		});

		const data = await response.json();

		if (data.error) {
			return { models: [], error: data.error };
		}

		return { models: data.models };
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			return { models: [], error: 'Request timed out' };
		}
		const message = error instanceof Error ? error.message : 'Failed to fetch models';
		return { models: [], error: message };
	} finally {
		clearTimeout(timeout);
	}
}

import { DEFAULT_LOCAL_BASE_URLS as DEFAULT_BASE_URLS } from './provider-defaults.ts';

const LOCAL_LLM_PROVIDERS = new Set(['ollama', 'lmstudio']);
const LOCAL_TTS_PROVIDERS = new Set(['local-tts', 'omnivoice']);
const LOCAL_STT_PROVIDERS = new Set(['local-stt']);

function trimTrailingSlashes(url: string): string {
	return url.replace(/\/+$/, '');
}

function stripOpenAIPath(url: string): string {
	return trimTrailingSlashes(url).replace(/\/v1$/, '');
}

export function ensureOpenAIPath(url: string): string {
	const cleanUrl = trimTrailingSlashes(url);
	return cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
}

// Custom OpenAI-compatible endpoints often carry their own version path
// (/api/paas/v4, /v1beta/openai, /inference), so only a bare host gets /v1.
export function ensureCustomOpenAIPath(url: string): string {
	const cleanUrl = trimTrailingSlashes(url);
	try {
		if (new URL(cleanUrl).pathname !== '/') return cleanUrl;
	} catch {
		return cleanUrl;
	}
	return `${cleanUrl}/v1`;
}

// A default local Ollama reached through the OpenAI-compatible provider: its
// model list lives at /api/tags instead of /v1/models. Shared so the web and
// desktop discovery paths can't drift.
export function looksLikeOllama(baseUrl: string): boolean {
	try {
		const url = new URL(baseUrl);
		return (
			(url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
			url.port === '11434'
		);
	} catch {
		return false;
	}
}

export function isLocalLLMProvider(providerId: string): boolean {
	return LOCAL_LLM_PROVIDERS.has(providerId);
}

export function isLocalTTSProvider(providerId: string): boolean {
	return LOCAL_TTS_PROVIDERS.has(providerId);
}

export function isLocalSTTProvider(providerId: string): boolean {
	return LOCAL_STT_PROVIDERS.has(providerId);
}

// OpenAI-compatible STT clients POST to "{base}/audio/transcriptions", so the
// base must end with "/v1". Local Whisper servers (Speaches, faster-whisper-
// server, whisper.cpp) mount there; users routinely paste the bare host.
export function getSTTBaseUrl(providerId: string, baseUrl?: string): string {
	const cleanUrl = trimTrailingSlashes(baseUrl || DEFAULT_BASE_URLS[providerId] || '');
	return isLocalSTTProvider(providerId) ? ensureOpenAIPath(cleanUrl) : cleanUrl;
}

export function getLocalSTTConnectionHint(baseUrl?: string, siteOrigin?: string): string {
	const sttBaseUrl = getSTTBaseUrl('local-stt', baseUrl);
	const originHint = siteOrigin
		? ` If the server blocks this site (${siteOrigin}), enable CORS for that origin.`
		: '';
	return `Could not reach a local STT server at ${sttBaseUrl}. Make sure it is running and exposes the OpenAI /v1/audio/transcriptions endpoint (e.g. Speaches, faster-whisper-server, or whisper.cpp).${originHint}`;
}

// OpenAI-compatible TTS clients append "audio/speech" to the base URL, so the
// base must end with "/v1/". Local servers (Kokoro-FastAPI, openedai-speech)
// mount there, and users routinely paste the bare host or drop the slash.
export function getTTSBaseUrl(providerId: string, baseUrl?: string): string {
	const cleanUrl = trimTrailingSlashes(baseUrl || DEFAULT_BASE_URLS[providerId] || '');

	if (isLocalTTSProvider(providerId)) {
		return `${ensureOpenAIPath(cleanUrl)}/`;
	}

	return `${cleanUrl}/`;
}

export function getLocalTTSConnectionHint(baseUrl?: string, siteOrigin?: string): string {
	const ttsBaseUrl = getTTSBaseUrl('local-tts', baseUrl);
	const originHint = siteOrigin
		? ` If the server blocks this site (${siteOrigin}), enable CORS for that origin.`
		: '';
	return `Could not reach a local TTS server at ${ttsBaseUrl}. Make sure it is running and exposes the OpenAI /v1/audio/speech endpoint (e.g. Kokoro-FastAPI or openedai-speech).${originHint}`;
}

export function getOmniVoiceConnectionHint(baseUrl?: string, siteOrigin?: string): string {
	const ttsBaseUrl = getTTSBaseUrl('omnivoice', baseUrl);
	const originHint = siteOrigin
		? ` If the server blocks this site (${siteOrigin}), enable CORS for that origin.`
		: '';
	return `Could not reach the OmniVoice proxy at ${ttsBaseUrl}audio/speech. Make sure it is running (see tools/omnivoice/README.md).${originHint}`;
}

export function getModelsBaseUrl(providerId: string, baseUrl?: string): string {
	const cleanUrl = trimTrailingSlashes(baseUrl || DEFAULT_BASE_URLS[providerId] || '');

	if (providerId === 'ollama') {
		return stripOpenAIPath(cleanUrl);
	}

	if (providerId === 'lmstudio') {
		return ensureOpenAIPath(cleanUrl);
	}

	return cleanUrl;
}

export function getChatBaseUrl(providerId: string, baseUrl?: string): string {
	const cleanUrl = trimTrailingSlashes(baseUrl || DEFAULT_BASE_URLS[providerId] || '');

	if (providerId === 'ollama' || providerId === 'lmstudio') {
		return ensureOpenAIPath(cleanUrl);
	}

	return cleanUrl;
}

export function getLocalProviderConnectionHint(
	providerId: string,
	baseUrl?: string,
	siteOrigin?: string
): string {
	const chatBaseUrl = getChatBaseUrl(providerId, baseUrl);

	if (providerId === 'ollama') {
		const originHint = siteOrigin
			? ` and allow this origin: OLLAMA_ORIGINS="${siteOrigin}" ollama serve`
			: '';
		return `Could not reach Ollama at ${chatBaseUrl}. Make sure it's running with "ollama serve"${originHint}.`;
	}

	if (providerId === 'lmstudio') {
		return `Could not reach LM Studio at ${chatBaseUrl}. Open it, load a model, and click Start Server.`;
	}

	return `Could not reach the local provider at ${chatBaseUrl}. Make sure the server is running and reachable from this device.`;
}

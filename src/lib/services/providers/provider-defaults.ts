// Single source of truth for provider default base URLs. Previously these were
// duplicated across the chat client, the chat server route, the models client,
// the models server route, the local-endpoint helpers, and the registry — and a
// drift between any two recreated the old Ollama base-URL bug class.
//
// Chat and model-listing endpoints legitimately differ for some providers:
// Google uses an OpenAI-compatible path for chat (/v1beta/openai/) but its native
// path for listing models (/v1beta), and local servers need per-provider
// normalization (see local-endpoints.ts). So both sets are expressed here rather
// than collapsed into one.

// Base URL used for chat/streaming. Cloud providers only — local providers route
// through getChatBaseUrl(), which normalizes DEFAULT_LOCAL_BASE_URLS.
export const DEFAULT_CHAT_BASE_URLS: Record<string, string> = {
	openai: 'https://api.openai.com/v1/',
	anthropic: 'https://api.anthropic.com/v1/',
	google: 'https://generativelanguage.googleapis.com/v1beta/openai/',
	deepseek: 'https://api.deepseek.com/',
	xai: 'https://api.x.ai/v1/',
	ollama: 'http://localhost:11434',
	lmstudio: 'http://localhost:1234/v1/'
};

// Base URL used for listing models. Includes the TTS providers that expose a
// model list. Local providers route through getModelsBaseUrl().
export const DEFAULT_MODELS_BASE_URLS: Record<string, string> = {
	openai: 'https://api.openai.com/v1',
	anthropic: 'https://api.anthropic.com/v1',
	google: 'https://generativelanguage.googleapis.com/v1beta',
	deepseek: 'https://api.deepseek.com',
	xai: 'https://api.x.ai/v1',
	ollama: 'http://localhost:11434',
	lmstudio: 'http://localhost:1234/v1',
	elevenlabs: 'https://api.elevenlabs.io/v1',
	'openai-tts': 'https://api.openai.com/v1'
};

// Fish Audio's TTS route serves no CORS preflight, so browsers can't call it
// directly: web posts to our /api/tts/fish-audio proxy, desktop calls this URL
// through the Tauri HTTP plugin.
export const FISH_AUDIO_TTS_URL = 'https://api.fish.audio/v1/tts';

// Base URLs for self-hosted/local providers, before per-provider normalization.
export const DEFAULT_LOCAL_BASE_URLS: Record<string, string> = {
	ollama: 'http://localhost:11434',
	lmstudio: 'http://localhost:1234/v1',
	'local-tts': 'http://localhost:8880/v1',
	'local-stt': 'http://localhost:8000/v1',
	// Distinct port from local-tts so a running Kokoro server isn't mistaken for OmniVoice.
	omnivoice: 'http://localhost:8881/v1'
};

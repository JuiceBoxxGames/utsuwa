// Module types
export * from './module';

// LLM Provider IDs
export type LLMProvider =
	// Cloud
	| 'openai'
	| 'anthropic'
	| 'google'
	| 'deepseek'
	| 'xai'
	// Local
	| 'ollama'
	| 'lmstudio'
	// User-configured OpenAI-compatible endpoint
	| 'openai-compatible';

// TTS Provider IDs
export type TTSProvider = 'elevenlabs' | 'openai-tts' | 'fish-audio' | 'local-tts' | 'omnivoice';

// Provider configuration (stored in settings)
export interface ProviderConfig {
	apiKey?: string;
	baseUrl?: string;
	modelId?: string;
	voiceId?: string;
	speed?: number;
	pitch?: number;
	volume?: number;
	cachedModels?: Array<{ id: string; name: string; vision?: boolean }>;
	modelsFetchedAt?: number;
	// User's answer to "can this model see images?", keyed by model id
	visionOverrides?: Record<string, boolean>;
	// Request timeout in ms; used by STT
	timeoutMs?: number;
}

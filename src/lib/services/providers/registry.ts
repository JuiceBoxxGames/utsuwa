// Provider Registry - All LLM and TTS providers
import { DEFAULT_CHAT_BASE_URLS } from './provider-defaults.ts';

export interface ProviderMetadata {
	id: string;
	name: string;
	description: string;
	category: 'llm' | 'tts' | 'stt';
	icon: string;
	iconColor?: string;
	requiresApiKey: boolean;
	defaultBaseUrl?: string;
	isLocal?: boolean;
	// A user-configured OpenAI-compatible endpoint (base URL + optional key +
	// hand-entered model), rather than a fixed provider. The settings UI shows a
	// base-URL field and a manual model input for these.
	custom?: boolean;
	// Whether this provider's models are broadly vision-capable. Coarse, cloud
	// only. Local and custom providers leave this unset and rely on a per-model
	// heuristic, since vision depends on whatever model sits behind them.
	supportsVision?: boolean;
	models?: Array<{ id: string; name: string }>;
	voices?: Array<{ id: string; name: string }>;
}

// ============================================
// LLM PROVIDERS (8 total)
// ============================================

export const LLM_PROVIDERS: ProviderMetadata[] = [
	// Cloud providers - models fetched dynamically from API after user enters key
	{
		id: 'openai',
		name: 'OpenAI',
		description: 'GPT-4, o1, and more',
		category: 'llm',
		icon: '🤖',
		requiresApiKey: true,
		supportsVision: true,
		defaultBaseUrl: DEFAULT_CHAT_BASE_URLS.openai,
	},
	{
		id: 'anthropic',
		name: 'Anthropic',
		description: 'Claude models',
		category: 'llm',
		icon: '🧠',
		requiresApiKey: true,
		supportsVision: true,
		defaultBaseUrl: DEFAULT_CHAT_BASE_URLS.anthropic
	},
	{
		id: 'google',
		name: 'Google Gemini',
		description: 'Gemini models',
		category: 'llm',
		icon: '✨',
		iconColor: '#4285F4',
		requiresApiKey: true,
		supportsVision: true,
		defaultBaseUrl: DEFAULT_CHAT_BASE_URLS.google
	},
	{
		id: 'deepseek',
		name: 'DeepSeek',
		description: 'DeepSeek models',
		category: 'llm',
		icon: '🔍',
		requiresApiKey: true,
		defaultBaseUrl: DEFAULT_CHAT_BASE_URLS.deepseek,
	},
	{
		id: 'xai',
		name: 'xAI (Grok)',
		description: 'Grok models',
		category: 'llm',
		icon: '𝕏',
		requiresApiKey: true,
		supportsVision: true,
		defaultBaseUrl: DEFAULT_CHAT_BASE_URLS.xai,
	},
	// Local LLMs discover installed models from the user's running local server.
	{
		id: 'ollama',
		name: 'Ollama',
		description: 'Run LLMs locally on your machine',
		category: 'llm',
		icon: '🦙',
		requiresApiKey: false,
		isLocal: true,
		defaultBaseUrl: DEFAULT_CHAT_BASE_URLS.ollama,
		models: [],
	},
	{
		id: 'lmstudio',
		name: 'LM Studio',
		description: 'Local LLM with GUI interface',
		category: 'llm',
		icon: '🖥️',
		requiresApiKey: false,
		isLocal: true,
		defaultBaseUrl: DEFAULT_CHAT_BASE_URLS.lmstudio,
		models: [],
	},
	{
		id: 'openai-compatible',
		name: 'OpenAI-Compatible',
		description: 'Any OpenAI-compatible endpoint (OpenRouter, Together, Mistral, vLLM, LiteLLM, ...)',
		category: 'llm',
		icon: '🔌',
		requiresApiKey: false,
		custom: true,
		models: []
	}
];

// ============================================
// TTS PROVIDERS (5 total)
// ============================================

export const TTS_PROVIDERS: ProviderMetadata[] = [
	// Cloud TTS - models fetched dynamically from API after user enters key
	{
		id: 'elevenlabs',
		name: 'ElevenLabs',
		description: 'High-quality AI voices',
		category: 'tts',
		icon: '🎙️',
		requiresApiKey: true,
		defaultBaseUrl: 'https://api.elevenlabs.io/v1/',
		// models fetched from API
		voices: [
			{ id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
			{ id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
			{ id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
			{ id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi' },
			{ id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
			{ id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte' }
		]
	},
	{
		id: 'openai-tts',
		name: 'OpenAI TTS',
		description: 'OpenAI text-to-speech voices',
		category: 'tts',
		icon: '🔊',
		requiresApiKey: true,
		defaultBaseUrl: 'https://api.openai.com/v1/',
		models: [
			{ id: 'tts-1', name: 'TTS-1 (Standard)' },
			{ id: 'tts-1-hd', name: 'TTS-1 HD (High Fidelity)' },
			{ id: 'gpt-4o-mini-tts', name: 'GPT-4o Mini TTS' }
		],
		voices: [
			{ id: 'alloy', name: 'Alloy' },
			{ id: 'ash', name: 'Ash' },
			{ id: 'coral', name: 'Coral' },
			{ id: 'echo', name: 'Echo' },
			{ id: 'fable', name: 'Fable' },
			{ id: 'onyx', name: 'Onyx' },
			{ id: 'nova', name: 'Nova' },
			{ id: 'sage', name: 'Sage' },
			{ id: 'shimmer', name: 'Shimmer' },
			{ id: 'ballad', name: 'Ballad' },
			{ id: 'verse', name: 'Verse' },
			{ id: 'marin', name: 'Marin' },
			{ id: 'cedar', name: 'Cedar' }
		]
	},
	{
		id: 'fish-audio',
		name: 'Fish Audio',
		description: 'Expressive voices and a large community voice library',
		category: 'tts',
		icon: 'fish-audio',
		requiresApiKey: true,
		// Fish Audio has no model-list endpoint, so this is the full set.
		// S2.1 Pro Free works on any key without credits.
		models: [
			{ id: 's2.1-pro', name: 'S2.1 Pro' },
			{ id: 's2.1-pro-free', name: 'S2.1 Pro Free' },
			{ id: 's2-pro', name: 'S2 Pro' },
			{ id: 's1', name: 'S1' }
		],
		// Voices from Fish Audio's official library. Any voice id, or its
		// fish.audio link, works in the voice field too.
		voices: [
			{ id: '933563129e564b19a115bedd57b7406a', name: 'Sarah' },
			{ id: '4f14b263c4ee418b9193de6ab1123015', name: 'Sadie' },
			{ id: '7f3375b90d3e4494bbb1a3cbbf56c607', name: 'Mila' },
			{ id: 'b347db033a6549378b48d00acb0d06cd', name: 'Selene' },
			{ id: '0db6e93af420470b9d9b9a886dbaa954', name: 'Kai' },
			{ id: '8451cb6e7e204684973f172cc616ec20', name: 'Jonah' },
			{ id: 'bf322df2096a46f18c579d0baa36f41d', name: 'Adrian' },
			{ id: '5da7f24e9e274f91b2b677669c818ce9', name: 'Shiori (Japanese)' },
			{ id: '297a6fd278df47c3b9da9bfdf55ac89a', name: 'Satoru (Japanese)' }
		]
	},
	// Local TTS - OpenAI-compatible server running on the user's machine
	// (Kokoro-FastAPI, openedai-speech, etc). Voices/model are server-specific,
	// so these are sensible Kokoro defaults plus a free-text override in the UI.
	{
		id: 'local-tts',
		name: 'Local TTS',
		description: 'Run a voice model locally (Kokoro, openedai-speech)',
		category: 'tts',
		icon: '🏠',
		requiresApiKey: false,
		isLocal: true,
		defaultBaseUrl: 'http://localhost:8880/v1/',
		models: [
			{ id: 'kokoro', name: 'Kokoro' },
			{ id: 'tts-1', name: 'tts-1 (compatibility alias)' }
		],
		voices: [
			{ id: 'af_bella', name: 'Bella (US, female)' },
			{ id: 'af_sky', name: 'Sky (US, female)' },
			{ id: 'af_sarah', name: 'Sarah (US, female)' },
			{ id: 'am_adam', name: 'Adam (US, male)' },
			{ id: 'am_michael', name: 'Michael (US, male)' },
			{ id: 'bf_emma', name: 'Emma (UK, female)' },
			{ id: 'bm_george', name: 'George (UK, male)' }
		]
	},
	// OmniVoice - local OmniVoice proxy running on the user's machine.
	{
		id: 'omnivoice',
		name: 'OmniVoice',
		description: 'Local OmniVoice TTS',
		category: 'tts',
		icon: '🔊',
		requiresApiKey: false,
		isLocal: true,
		defaultBaseUrl: 'http://localhost:8881/v1/',
		models: [{ id: 'omnivoice', name: 'OmniVoice' }],
		voices: [
			{ id: 'alloy', name: 'Alloy' },
			{ id: 'ash', name: 'Ash' },
			{ id: 'ballad', name: 'Ballad' },
			{ id: 'cedar', name: 'Cedar' },
			{ id: 'coral', name: 'Coral' },
			{ id: 'echo', name: 'Echo' },
			{ id: 'fable', name: 'Fable' },
			{ id: 'marin', name: 'Marin' },
			{ id: 'nova', name: 'Nova' },
			{ id: 'onyx', name: 'Onyx' },
			{ id: 'sage', name: 'Sage' },
			{ id: 'shimmer', name: 'Shimmer' },
			{ id: 'verse', name: 'Verse' }
		]
	},
];

// ============================================
// STT PROVIDERS
// ============================================

export const STT_PROVIDERS: ProviderMetadata[] = [
	{
		id: 'groq-stt',
		name: 'Groq',
		description: 'Fast speech-to-text via Whisper',
		category: 'stt',
		icon: '🎤',
		requiresApiKey: true,
		defaultBaseUrl: 'https://api.groq.com/openai/v1/'
	},
	{
		id: 'openai-stt',
		name: 'OpenAI',
		description: 'Cloud speech-to-text via Whisper / gpt-4o-transcribe',
		category: 'stt',
		icon: '🎤',
		requiresApiKey: true,
		defaultBaseUrl: 'https://api.openai.com/v1/',
		models: [
			{ id: 'whisper-1', name: 'whisper-1' },
			{ id: 'gpt-4o-transcribe', name: 'gpt-4o-transcribe' },
			{ id: 'gpt-4o-mini-transcribe', name: 'gpt-4o-mini-transcribe' }
		]
	},
	{
		id: 'local-stt',
		name: 'Local STT',
		description: 'Run Whisper locally (Speaches, faster-whisper-server, whisper.cpp)',
		category: 'stt',
		icon: '🏠',
		requiresApiKey: false,
		isLocal: true,
		defaultBaseUrl: 'http://localhost:8000/v1/',
		models: [
			{ id: 'Systran/faster-whisper-large-v3', name: 'faster-whisper large-v3' },
			{ id: 'Systran/faster-whisper-medium', name: 'faster-whisper medium' },
			{ id: 'whisper-1', name: 'whisper-1 (OpenAI-named)' }
		]
	}
];

// Helper functions
export function getLLMProvider(id: string): ProviderMetadata | undefined {
	return LLM_PROVIDERS.find((p) => p.id === id);
}

export function getTTSProvider(id: string): ProviderMetadata | undefined {
	return TTS_PROVIDERS.find((p) => p.id === id);
}

export function getSTTProvider(id: string): ProviderMetadata | undefined {
	return STT_PROVIDERS.find((p) => p.id === id);
}

/** Whether an LLM provider's models are broadly vision-capable (cloud providers). */
export function providerSupportsVision(id: string): boolean {
	return getLLMProvider(id)?.supportsVision === true;
}

/** Local and custom endpoints can serve anything, so the model id decides vision. */
export function visionDependsOnModel(id: string): boolean {
	const p = getLLMProvider(id);
	return p?.isLocal === true || p?.custom === true;
}

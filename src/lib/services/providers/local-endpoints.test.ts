import test from 'node:test';
import assert from 'node:assert/strict';

import {
	getChatBaseUrl,
	getModelsBaseUrl,
	isLocalLLMProvider,
	getLocalProviderConnectionHint,
	isLocalTTSProvider,
	getTTSBaseUrl,
	getLocalTTSConnectionHint,
	isLocalSTTProvider,
	getSTTBaseUrl,
	getLocalSTTConnectionHint,
	ensureOpenAIPath, ensureCustomOpenAIPath, looksLikeOllama
} from './local-endpoints.ts';

test('identifies local STT providers', () => {
	assert.equal(isLocalSTTProvider('local-stt'), true);
	assert.equal(isLocalSTTProvider('groq-stt'), false);
});

test('local STT base URL is normalized to end in /v1', () => {
	assert.equal(getSTTBaseUrl('local-stt', 'http://localhost:8000'), 'http://localhost:8000/v1');
	assert.equal(getSTTBaseUrl('local-stt', 'http://localhost:8000/'), 'http://localhost:8000/v1');
	assert.equal(getSTTBaseUrl('local-stt', 'http://localhost:8000/v1'), 'http://localhost:8000/v1');
	// Falls back to the default when no base URL is given
	assert.equal(getSTTBaseUrl('local-stt'), 'http://localhost:8000/v1');
});

test('cloud STT base URL is only trimmed, not path-normalized', () => {
	assert.equal(
		getSTTBaseUrl('groq-stt', 'https://api.groq.com/openai/v1/'),
		'https://api.groq.com/openai/v1'
	);
});

test('local STT connection hint names the endpoint and origin', () => {
	const hint = getLocalSTTConnectionHint('http://localhost:8000/v1', 'https://utsuwa.ai');
	assert.match(hint, /audio\/transcriptions/);
	assert.match(hint, /utsuwa\.ai/);
});

test('identifies local LLM providers', () => {
	assert.equal(isLocalLLMProvider('ollama'), true);
	assert.equal(isLocalLLMProvider('lmstudio'), true);
	assert.equal(isLocalLLMProvider('openai'), false);
});

test('normalizes Ollama root URL to OpenAI-compatible chat URL', () => {
	assert.equal(getChatBaseUrl('ollama', 'http://localhost:11434'), 'http://localhost:11434/v1');
	assert.equal(getChatBaseUrl('ollama', 'http://localhost:11434/'), 'http://localhost:11434/v1');
	assert.equal(getChatBaseUrl('ollama', 'http://localhost:11434/v1'), 'http://localhost:11434/v1');
});

test('normalizes Ollama model-list URL to the Ollama API root', () => {
	assert.equal(getModelsBaseUrl('ollama', 'http://localhost:11434/v1'), 'http://localhost:11434');
	assert.equal(getModelsBaseUrl('ollama'), 'http://localhost:11434');
});

test('normalizes LM Studio root URL to OpenAI-compatible v1 URL', () => {
	assert.equal(getChatBaseUrl('lmstudio', 'http://localhost:1234'), 'http://localhost:1234/v1');
	assert.equal(getModelsBaseUrl('lmstudio', 'http://localhost:1234'), 'http://localhost:1234/v1');
	assert.equal(getChatBaseUrl('lmstudio', 'http://localhost:1234/v1'), 'http://localhost:1234/v1');
});

test('provides local provider troubleshooting hints', () => {
	assert.match(getLocalProviderConnectionHint('ollama', 'http://localhost:11434'), /ollama serve/);
	assert.match(
		getLocalProviderConnectionHint(
			'ollama',
			'http://localhost:11434',
			'https://utsuwa-git-fix-ollama-local-provider.vercel.app'
		),
		/OLLAMA_ORIGINS="https:\/\/utsuwa-git-fix-ollama-local-provider\.vercel\.app"/
	);
	assert.match(getLocalProviderConnectionHint('lmstudio', 'http://localhost:1234/v1'), /Start Server/);
});

test('identifies local TTS providers', () => {
	assert.equal(isLocalTTSProvider('local-tts'), true);
	assert.equal(isLocalTTSProvider('openai-tts'), false);
	assert.equal(isLocalTTSProvider('elevenlabs'), false);
});

test('normalizes local TTS base URL to a trailing-slash /v1 path', () => {
	// OpenAI-compatible clients append "audio/speech", so the base must end in /v1/
	assert.equal(getTTSBaseUrl('local-tts', 'http://localhost:8880'), 'http://localhost:8880/v1/');
	assert.equal(getTTSBaseUrl('local-tts', 'http://localhost:8880/'), 'http://localhost:8880/v1/');
	assert.equal(getTTSBaseUrl('local-tts', 'http://localhost:8880/v1'), 'http://localhost:8880/v1/');
	assert.equal(getTTSBaseUrl('local-tts', 'http://localhost:8880/v1/'), 'http://localhost:8880/v1/');
	assert.equal(getTTSBaseUrl('local-tts'), 'http://localhost:8880/v1/');
});

test('provides local TTS troubleshooting hint with CORS guidance', () => {
	const hint = getLocalTTSConnectionHint('http://localhost:8880');
	assert.match(hint, /audio\/speech/);
	assert.match(hint, /CORS/);
	assert.match(
		getLocalTTSConnectionHint('http://localhost:8880', 'https://utsuwa.app'),
		/https:\/\/utsuwa\.app/
	);
});

// --- OmniVoice ---

import { getOmniVoiceConnectionHint } from './local-endpoints.ts';

test('identifies OmniVoice as a local TTS provider', () => {
	assert.equal(isLocalTTSProvider('omnivoice'), true);
	assert.equal(isLocalTTSProvider('openai-tts'), false);
});

test('normalizes OmniVoice base URL to a trailing-slash /v1 path', () => {
	assert.equal(getTTSBaseUrl('omnivoice', 'http://localhost:8880'), 'http://localhost:8880/v1/');
	assert.equal(getTTSBaseUrl('omnivoice', 'http://localhost:8880/'), 'http://localhost:8880/v1/');
	assert.equal(getTTSBaseUrl('omnivoice', 'http://localhost:8880/v1'), 'http://localhost:8880/v1/');
	assert.equal(getTTSBaseUrl('omnivoice', 'http://localhost:8880/v1/'), 'http://localhost:8880/v1/');
	assert.equal(getTTSBaseUrl('omnivoice'), 'http://localhost:8881/v1/');
});

test('provides OmniVoice troubleshooting hint with CORS guidance', () => {
	const hint = getOmniVoiceConnectionHint('http://localhost:8880');
	assert.match(hint, /OmniVoice proxy/);
	assert.match(hint, /audio\/speech/);
	assert.match(hint, /CORS/);
});

// --- ensureOpenAIPath (shared by model discovery and custom-endpoint chat) ---

test('ensureOpenAIPath appends /v1 to bare base URLs', () => {
	assert.equal(ensureOpenAIPath('https://api.together.xyz'), 'https://api.together.xyz/v1');
	assert.equal(ensureOpenAIPath('https://api.together.xyz/'), 'https://api.together.xyz/v1');
});

test('ensureOpenAIPath leaves /v1 URLs unchanged', () => {
	assert.equal(ensureOpenAIPath('https://api.openai.com/v1'), 'https://api.openai.com/v1');
	assert.equal(ensureOpenAIPath('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
});

// Custom endpoints often carry their own version path; only a bare host gets /v1
test('ensureCustomOpenAIPath keeps a versioned path and fills in a bare host', () => {
	assert.equal(ensureCustomOpenAIPath('https://api.z.ai/api/paas/v4'), 'https://api.z.ai/api/paas/v4');
	assert.equal(ensureCustomOpenAIPath('https://ark.cn-beijing.volces.com/api/v3/'), 'https://ark.cn-beijing.volces.com/api/v3');
	assert.equal(ensureCustomOpenAIPath('https://models.github.ai/inference'), 'https://models.github.ai/inference');
	assert.equal(
		ensureCustomOpenAIPath('https://generativelanguage.googleapis.com/v1beta/openai/'),
		'https://generativelanguage.googleapis.com/v1beta/openai'
	);
	assert.equal(ensureCustomOpenAIPath('https://openrouter.ai/api/v1/'), 'https://openrouter.ai/api/v1');
	assert.equal(ensureCustomOpenAIPath('https://api.together.xyz'), 'https://api.together.xyz/v1');
	assert.equal(ensureCustomOpenAIPath('http://192.168.1.5:8000/'), 'http://192.168.1.5:8000/v1');
});

// --- looksLikeOllama ---

test('looksLikeOllama matches default local Ollama only', () => {
	assert.equal(looksLikeOllama('http://localhost:11434'), true);
	assert.equal(looksLikeOllama('http://127.0.0.1:11434'), true);
	assert.equal(looksLikeOllama('http://localhost:11434/v1'), true);
	assert.equal(looksLikeOllama('http://localhost:1234'), false);
	assert.equal(looksLikeOllama('https://api.openai.com/v1'), false);
	assert.equal(looksLikeOllama('not a url'), false);
});

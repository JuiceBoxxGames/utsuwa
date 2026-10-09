// Can she actually see what you show her? Three answers, strongest first:
// the user's own say, what the provider's model list reports (LM Studio,
// Ollama, OpenRouter-style lists), then a guess from the model id. Kept
// import-free so it stays unit-testable on its own.

/** Substrings that strongly imply a local or custom model can accept images. Lowercased. */
const VISION_MODEL_HINTS = [
	'vision',
	'-vl',
	'vl-',
	'llava',
	'bakllava',
	'moondream',
	'minicpm-v',
	'qwen2-vl',
	'qwen2.5-vl',
	'gemma3',
	'gemma-3',
	'gemma4',
	'gemma-4',
	'pixtral',
	'internvl',
	'gpt-4o',
	'gpt-4.1',
	'gpt-4-turbo',
	'gpt-5',
	'o3',
	'o4',
	'claude',
	'gemini',
	'grok-4',
	'llama4',
	'llama-4',
	'mistral-small-3',
	'phi-4-multimodal',
	'deepseek-flash'
];

// Text-only models that a hint or a vision provider would otherwise let through.
const TEXT_ONLY_MODELS = [
	/gemma-?3:?-?(1b|270m)/,
	/gpt-3\.5/,
	/(^|\/)gpt-4(-32k)?(-\d{4})?(-preview)?$/,
	/(^|\/)o1-(mini|preview)/,
	/(^|\/)o3-mini/,
	/(^|\/)grok-3/,
	/(^|\/)grok-2(-\d{4})?$/,
	/grok-code/,
	// DeepSeek drops images it can't read instead of erroring, so only Flash is trusted
	/(^|\/)deepseek-(?!flash)/
];

export type VisionSource = 'you' | 'provider' | 'name';

export interface VisionCheck {
	/** Cloud provider whose models broadly see images */
	providerHasVision: boolean;
	/** Local or custom endpoint, where the model alone decides */
	modelDecides: boolean;
	modelId?: string | null;
	/** What the provider's model list said, if anything */
	reported?: boolean;
	/** The user's own answer from settings */
	override?: boolean;
}

function guessFromName({ providerHasVision, modelDecides, modelId }: VisionCheck): boolean {
	if (!modelId || (!providerHasVision && !modelDecides)) return false;
	const m = modelId.toLowerCase();
	if (TEXT_ONLY_MODELS.some((re) => re.test(m))) return false;
	return providerHasVision || VISION_MODEL_HINTS.some((hint) => m.includes(hint));
}

export function resolveVision(check: VisionCheck): { capable: boolean; source: VisionSource } {
	if (check.override !== undefined) return { capable: check.override, source: 'you' };
	if (check.reported !== undefined) return { capable: check.reported, source: 'provider' };
	return { capable: guessFromName(check), source: 'name' };
}

/**
 * Pull a vision answer out of one model entry, in whichever shape the server
 * uses: Ollama /api/show (`capabilities: [..., 'vision']`), LM Studio
 * /api/v1/models (`capabilities.vision`), or OpenRouter-style lists
 * (`architecture.input_modalities`). Anything else stays undefined.
 */
export function reportedVision(entry: unknown): boolean | undefined {
	if (!entry || typeof entry !== 'object') return undefined;
	const { capabilities, architecture } = entry as { capabilities?: unknown; architecture?: unknown };
	if (Array.isArray(capabilities)) return capabilities.includes('vision');
	if (capabilities && typeof capabilities === 'object' && 'vision' in capabilities) {
		const { vision } = capabilities as { vision: unknown };
		if (typeof vision === 'boolean') return vision;
	}
	if (architecture && typeof architecture === 'object' && 'input_modalities' in architecture) {
		const { input_modalities } = architecture as { input_modalities: unknown };
		if (Array.isArray(input_modalities)) return input_modalities.includes('image');
	}
	return undefined;
}

/** GET when there's no body, POST JSON when there is. Rejects on HTTP errors. */
export type FetchJson = (path: string, body?: unknown) => Promise<unknown>;

/** Ollama's /api/tags has no capabilities, so ask /api/show per model. Best effort. */
export function addOllamaVision<T extends { id: string }>(models: T[], fetchJson: FetchJson) {
	return Promise.all(
		models.map(async (m) => ({
			...m,
			vision: reportedVision(await fetchJson('/api/show', { model: m.id }).catch(() => null))
		}))
	);
}

/** LM Studio's native API knows which models take images; its OpenAI one doesn't. Best effort. */
export async function addLMStudioVision<T extends { id: string }>(models: T[], fetchJson: FetchJson) {
	const native = await fetchJson('/api/v1/models').catch(() => null);
	const list = (native as { models?: unknown } | null)?.models;
	if (!Array.isArray(list)) return models;
	const byKey = new Map(list.map((n: { key?: unknown }) => [n?.key, reportedVision(n)]));
	return models.map((m) => ({ ...m, vision: byKey.get(m.id) }));
}

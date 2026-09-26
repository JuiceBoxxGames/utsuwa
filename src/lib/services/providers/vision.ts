// Can she actually see what you show her? Vision support is two-layered:
// cloud providers carry a coarse `supportsVision` flag (see providerSupportsVision
// in registry.ts), while local and custom OpenAI-compatible providers depend on
// the model behind them, so we sniff the model id here. Kept import-free so it stays
// unit-testable on its own.

/** Substrings that strongly imply a model can accept images. Lowercased. */
const VISION_MODEL_HINTS = [
	'vision',
	'-vl',
	'vl-',
	'llava',
	'bakllava',
	'moondream',
	'minicpm-v',
	'llama3.2-vision',
	'llama-3.2-vision',
	'qwen2-vl',
	'qwen2.5-vl',
	'gemma3',
	'pixtral',
	'internvl',
	'gpt-4o',
	'gpt-4.1',
	'gpt-4-turbo',
	'gpt-4-vision',
	'gpt-5',
	'o3',
	'o4',
	'claude-3',
	'claude-4',
	'claude-opus',
	'claude-sonnet',
	'claude-haiku',
	'gemini',
	'grok-2-vision',
	'grok-4',
	'llama4',
	'llama-4',
	'mistral-small-3',
	'phi-3.5-vision',
	'phi-4-multimodal'
];

// Names that match a hint but are actually text-only (e.g. small Gemma 3 has
// no vision; only the 4b+ variants do).
const TEXT_ONLY_MODELS = ['gemma3:1b', 'gemma-3-1b', 'gemma3:270m'];

export function modelSupportsVision(modelId: string | undefined | null): boolean {
	if (!modelId) return false;
	const m = modelId.toLowerCase();
	if (TEXT_ONLY_MODELS.some((t) => m.includes(t))) return false;
	return VISION_MODEL_HINTS.some((hint) => m.includes(hint));
}

/**
 * The gate the UI uses to decide whether "showing her something" is possible
 * right now. The provider must at least potentially do vision (a flagged cloud
 * provider, or a local/custom one), AND the selected model must look vision-capable.
 * So a text-only model on any provider returns false, prompting the user.
 */
export function canShowImages(
	providerHasVision: boolean,
	modelDecides: boolean,
	modelId?: string | null
): boolean {
	if (!providerHasVision && !modelDecides) return false;
	return modelSupportsVision(modelId);
}

import { browser } from '$app/environment';
import type { Fact } from '$lib/types/memory';
import { EMBEDDING_MODEL_ID } from '$lib/engine/embedding-version';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';

// Model config (single source of truth in engine/embedding-version.ts)
const MODEL_NAME = EMBEDDING_MODEL_ID;

// State
let pipeline: FeatureExtractionPipeline | null = null;
let isLoading = false;
let isReady = false;
let loadError: string | null = null;

// Listeners for state changes
type StateListener = (state: EmbeddingState) => void;
const listeners: Set<StateListener> = new Set();

export interface EmbeddingState {
	isLoading: boolean;
	isReady: boolean;
	error: string | null;
}

function notifyListeners() {
	const state: EmbeddingState = { isLoading, isReady, error: loadError };
	listeners.forEach((fn) => fn(state));
}

export function subscribeToEmbeddingState(fn: StateListener): () => void {
	listeners.add(fn);
	fn({ isLoading, isReady, error: loadError });
	return () => listeners.delete(fn);
}

export async function initEmbeddingModel(): Promise<boolean> {
	if (!browser) return false;
	if (isReady) return true;
	if (isLoading) {
		// Wait for existing load to complete
		return new Promise((resolve) => {
			const unsub = subscribeToEmbeddingState((state) => {
				if (!state.isLoading) {
					unsub();
					resolve(state.isReady);
				}
			});
		});
	}

	isLoading = true;
	loadError = null;
	notifyListeners();

	try {
		// Dynamic import to avoid SSR issues
		const { pipeline: createPipeline, env } = await import('@huggingface/transformers');
		// The generic pipeline() return type is a union too big for tsc to resolve
		const createFeatureExtractor = createPipeline as (
			task: 'feature-extraction',
			model: string,
			options: { dtype: 'q8' }
		) => Promise<FeatureExtractionPipeline>;

		// Ensure models load from Hugging Face CDN, not local path
		env.allowLocalModels = false;
		// transformers points ORT at jsdelivr, which makes it import() its JS glue from
		// there: a remote script the desktop CSP blocks. Unset, ORT uses the glue it
		// bundles and the .wasm Vite emits next to it. The dev server has no emitted
		// asset, so point it at the package files it already serves.
		if (env.backends.onnx.wasm) {
			env.backends.onnx.wasm.wasmPaths = import.meta.env.DEV
				? '/node_modules/@huggingface/transformers/dist/'
				: undefined;
		}

		// q8 is the quantized ONNX file @xenova/transformers loaded by default, so
		// vectors already in the database stay comparable.
		pipeline = await createFeatureExtractor('feature-extraction', MODEL_NAME, { dtype: 'q8' });

		isReady = true;
		isLoading = false;
		notifyListeners();
		return true;
	} catch (err) {
		loadError = err instanceof Error ? err.message : 'Failed to load embedding model';
		isLoading = false;
		isReady = false;
		notifyListeners();
		return false;
	}
}

export async function embedText(text: string): Promise<number[] | null> {
	if (!isReady || !pipeline) {
		return null;
	}

	try {
		const output = await pipeline(text, {
			pooling: 'mean',
			normalize: true
		});

		// Convert tensor to array
		const embedding = Array.from(output.data as Float32Array);

		return embedding;
	} catch {
		return null;
	}
}

// Single implementation lives in the pure engine module (unit-tested there);
// re-exported here for existing consumers.
export { cosineSimilarity } from '$lib/engine/fact-dedup';
import { cosineSimilarity } from '$lib/engine/fact-dedup';

export interface SimilarFact {
	fact: Fact;
	similarity: number;
	score: number; // blended score (similarity + importance)
}

export function findSimilarFacts(
	queryEmbedding: number[],
	facts: Fact[],
	limit: number = 10,
	options: {
		similarityWeight?: number; // 0-1, weight for semantic similarity
		importanceWeight?: number; // 0-1, weight for importance score
		minSimilarity?: number; // minimum similarity threshold
	} = {}
): SimilarFact[] {
	const { similarityWeight = 0.7, importanceWeight = 0.3, minSimilarity = 0.3 } = options;

	const results: SimilarFact[] = [];

	for (const fact of facts) {
		if (!fact.embedding || fact.embedding.length === 0) {
			continue;
		}

		const similarity = cosineSimilarity(queryEmbedding, fact.embedding);

		if (similarity < minSimilarity) {
			continue;
		}

		// Blend similarity with importance (normalized to 0-1)
		const normalizedImportance = fact.importance / 100;
		const score = similarity * similarityWeight + normalizedImportance * importanceWeight;

		results.push({ fact, similarity, score });
	}

	// Sort by blended score descending
	results.sort((a, b) => b.score - a.score);

	return results.slice(0, limit);
}

export function isEmbeddingReady(): boolean {
	return isReady;
}

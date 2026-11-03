// Pure creation-time dedup for memory facts, dependency-free so it can be
// unit-tested. The storage layer scopes candidates to the same category before
// calling in; this module just decides whether an equivalent fact already
// exists. Two paths: exact match on normalized content (cheap, always runs)
// and cosine similarity between embeddings for near-paraphrases.

// Above this cosine similarity, two facts are considered the same memory.
export const FACT_DUPLICATE_SIMILARITY = 0.9;

// Normalize content for duplicate detection: trim, lowercase, collapse whitespace.
export function normalizeFactContent(content: string): string {
	return content.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		return 0;
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	if (normA === 0 || normB === 0) return 0;

	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface FactCandidate {
	content: string;
	embedding?: number[] | null;
}

// Find an existing fact the candidate duplicates, or null. Exact normalized
// content wins first; otherwise the most similar embedding at or above the
// threshold. Existing facts without embeddings can only match by content.
export function findDuplicateFact<T extends { content: string; embedding?: number[] }>(
	candidate: FactCandidate,
	existing: T[],
	threshold: number = FACT_DUPLICATE_SIMILARITY
): T | null {
	const normalized = normalizeFactContent(candidate.content);
	for (const fact of existing) {
		if (normalizeFactContent(fact.content) === normalized) {
			return fact;
		}
	}

	if (!candidate.embedding || candidate.embedding.length === 0) {
		return null;
	}

	let best: T | null = null;
	let bestSimilarity = 0;
	for (const fact of existing) {
		if (!fact.embedding || fact.embedding.length === 0) continue;
		const similarity = cosineSimilarity(candidate.embedding, fact.embedding);
		if (similarity >= threshold && similarity > bestSimilarity) {
			best = fact;
			bestSimilarity = similarity;
		}
	}

	return best;
}

interface MergeableFact {
	content: string;
	importance: number;
	referenceCount: number;
	source?: string;
}

interface IncomingFact {
	content: string;
	importance?: number;
	confidence?: number;
	source?: string;
}

// The patch to apply to an existing fact when a new one duplicates it. An exact
// match just counts as another mention. A semantic match is usually the same
// fact restated or updated ("is 25" -> "is 26", a hand-typed correction), so
// the newer wording replaces the old text along with its vector. Heuristic
// regex fragments only count as a mention: they're cruder than what they match
// and land right after the model's own memory for the same turn.
export const HEURISTIC_FACT_SOURCE = 'heuristic';

export function duplicateFactUpdate(
	existing: MergeableFact,
	incoming: IncomingFact,
	embedding: number[] | undefined,
	embeddingModel: string,
	now: Date
) {
	const bump = {
		referenceCount: existing.referenceCount + 1,
		importance: Math.min(100, Math.max(existing.importance, incoming.importance ?? 50)),
		lastAccessed: now
	};
	if (
		incoming.source === HEURISTIC_FACT_SOURCE ||
		normalizeFactContent(existing.content) === normalizeFactContent(incoming.content)
	) {
		return bump;
	}
	return {
		...bump,
		content: incoming.content,
		confidence: incoming.confidence ?? 0.8,
		source: incoming.source ?? existing.source,
		embedding,
		embeddingModel: embedding ? embeddingModel : undefined
	};
}

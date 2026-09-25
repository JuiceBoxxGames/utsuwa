import { db, type DBFact, type DBSessionSummary, type DBConversationTurn } from '$lib/db';
import type { Fact, SessionSummary, ConversationTurn, MemorySearchOptions, NewFact } from '$lib/types/memory';
import { embedText, isEmbeddingReady } from '$lib/services/embeddings';
import { findDuplicateFact } from '$lib/engine/fact-dedup';
import { EMBEDDING_MODEL_ID, hasCurrentEmbedding, needsReembedding } from '$lib/engine/embedding-version';
import { chatHintStore } from '$lib/stores/chat-hint.svelte';

// Callers treat memory writes as best effort, so a full disk would otherwise
// only ever reach the console.
function hintOnQuota<T>(write: Promise<T>): Promise<T> {
	return write.catch((e) => {
		chatHintStore.reportStorageError(e);
		throw e;
	});
}

// Facts

export async function getFacts(options: MemorySearchOptions = {}): Promise<Fact[]> {
	const facts = await db.facts.toArray();

	let filtered = facts;

	// Filter by category
	if (options.category) {
		filtered = filtered.filter((f) => f.category === options.category);
	}

	// Filter by minimum importance
	if (options.minImportance !== undefined) {
		filtered = filtered.filter((f) => f.importance >= options.minImportance!);
	}

	// Filter by keywords (case-insensitive content search)
	if (options.keywords && options.keywords.length > 0) {
		const lowerKeywords = options.keywords.map((k) => k.toLowerCase());
		filtered = filtered.filter((f) =>
			lowerKeywords.some((kw) => f.content.toLowerCase().includes(kw))
		);
	}

	// Sort by importance (descending), then by referenceCount, then by recency
	filtered.sort((a, b) => {
		if (b.importance !== a.importance) return b.importance - a.importance;
		if (b.referenceCount !== a.referenceCount) return b.referenceCount - a.referenceCount;
		return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
	});

	// Apply limit
	if (options.limit) {
		filtered = filtered.slice(0, options.limit);
	}

	return filtered.map(deserializeFact);
}

export async function saveFact(fact: NewFact): Promise<number> {
	const now = new Date();

	// Generate the embedding up front (when the model is ready) so it can serve
	// both duplicate detection and the eventual insert.
	let embedding: number[] | undefined;
	if (isEmbeddingReady()) {
		const result = await embedText(fact.content);
		if (result) {
			embedding = result;
		}
	}

	// Dedup: the runtime pipeline can persist the same observation every turn
	// ("I'm tired", "I love you"), which grows the table unbounded and dilutes
	// retrieval. Exact normalized matches are caught always; with embeddings
	// available, near-paraphrases of the same memory are merged too. On a match,
	// bump the existing fact's reference count and importance instead of adding
	// a near-duplicate row. Stale-model embeddings are hidden from the semantic
	// comparison (different space, meaningless cosine); those facts can still
	// match by content.
	const candidates = (await db.facts.where('category').equals(fact.category).toArray()).map(
		(f) => (hasCurrentEmbedding(f) ? f : { ...f, embedding: undefined })
	);
	const existing = findDuplicateFact({ content: fact.content, embedding }, candidates);
	if (existing?.id !== undefined) {
		await hintOnQuota(
			db.facts.update(existing.id, {
				referenceCount: existing.referenceCount + 1,
				importance: Math.min(100, Math.max(existing.importance, fact.importance ?? 50)),
				lastAccessed: now
			})
		);
		return existing.id;
	}

	const dbFact: Omit<DBFact, 'id'> = {
		content: fact.content,
		category: fact.category,
		importance: fact.importance ?? 50,
		confidence: fact.confidence ?? 0.8,
		source: fact.source,
		referenceCount: 0,
		createdAt: now,
		embedding,
		embeddingModel: embedding ? EMBEDDING_MODEL_ID : undefined
	};

	const id = await hintOnQuota(db.facts.add(dbFact));
	return id as number;
}

export async function incrementFactReference(factId: number): Promise<void> {
	const fact = await db.facts.get(factId);
	if (fact) {
		await db.facts.update(factId, {
			referenceCount: fact.referenceCount + 1,
			lastAccessed: new Date()
		});
	}
}

export async function deleteFact(factId: number): Promise<void> {
	await db.facts.delete(factId);
}

export async function deleteAllFacts(): Promise<void> {
	await db.facts.clear();
}

export async function updateFactEmbedding(factId: number, embedding: number[]): Promise<void> {
	await db.facts.update(factId, { embedding, embeddingModel: EMBEDDING_MODEL_ID });
}

// Facts the backfill should (re-)embed: no vector at all, or a vector from an
// older embedding model that can't be compared against current ones.
export async function getFactsWithoutEmbeddings(): Promise<Fact[]> {
	const facts = await db.facts.toArray();
	return facts.filter((f) => needsReembedding(f)).map(deserializeFact);
}

export async function getAllFactsWithEmbeddings(): Promise<Fact[]> {
	const facts = await db.facts.toArray();
	return facts.map(deserializeFact);
}

// Candidate pool for per-message semantic search. Bounded via the importance
// index so cosine scoring stays O(cap) instead of scanning every fact on every
// message — retrieval quality is unchanged for normal use, but a companion with
// thousands of memories no longer pays a linearly growing cost per turn.
const MAX_SEMANTIC_CANDIDATES = 500;

export async function getFactsForSemanticSearch(
	limit: number = MAX_SEMANTIC_CANDIDATES
): Promise<Fact[]> {
	const facts = await db.facts.orderBy('importance').reverse().limit(limit).toArray();
	// Only current-model embeddings: stale vectors live in a different space
	// and would score garbage similarities until the backfill re-embeds them.
	return facts.filter((f) => hasCurrentEmbedding(f)).map(deserializeFact);
}

// Sessions

export async function getSessions(limit?: number): Promise<SessionSummary[]> {
	let sessions = await db.sessions.toArray();

	// Sort by startedAt descending (most recent first)
	sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

	if (limit) {
		sessions = sessions.slice(0, limit);
	}

	return sessions.map(deserializeSession);
}

export async function saveSession(session: Omit<SessionSummary, 'id'>): Promise<number> {
	const dbSession: Omit<DBSessionSummary, 'id'> = {
		...session,
		startedAt: new Date(session.startedAt),
		endedAt: session.endedAt ? new Date(session.endedAt) : undefined
	};

	const id = await db.sessions.add(dbSession);
	return id as number;
}

export async function updateSession(
	sessionId: number,
	updates: Partial<SessionSummary>
): Promise<void> {
	const serialized: Partial<DBSessionSummary> = { ...updates };
	if (updates.startedAt) serialized.startedAt = new Date(updates.startedAt);
	if (updates.endedAt) serialized.endedAt = new Date(updates.endedAt);

	await db.sessions.update(sessionId, serialized);
}

export async function deleteAllSessions(): Promise<void> {
	await db.sessions.clear();
}

// Conversation Turns

export async function getConversationTurns(
	options: { sessionId?: number; limit?: number } = {}
): Promise<ConversationTurn[]> {
	let turns: DBConversationTurn[];

	if (options.sessionId !== undefined) {
		turns = await db.conversationTurns.where('sessionId').equals(options.sessionId).toArray();
	} else {
		turns = await db.conversationTurns.toArray();
	}

	// Sort by createdAt ascending (chronological order)
	turns.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

	if (options.limit) {
		// Take the most recent N turns
		turns = turns.slice(-options.limit);
	}

	return turns.map(deserializeTurn);
}

export async function saveConversationTurn(
	turn: Omit<ConversationTurn, 'id'>
): Promise<number> {
	const dbTurn: Omit<DBConversationTurn, 'id'> = {
		...turn,
		createdAt: new Date(turn.createdAt)
	};

	const id = await hintOnQuota(db.conversationTurns.add(dbTurn));
	return id as number;
}

export async function deleteAllTurns(): Promise<void> {
	await db.conversationTurns.clear();
}

export async function deleteTurnsForSession(sessionId: number): Promise<void> {
	await db.conversationTurns.where('sessionId').equals(sessionId).delete();
}

// Serialization helpers

function deserializeFact(fact: DBFact): Fact {
	return {
		...fact,
		createdAt: new Date(fact.createdAt),
		lastAccessed: fact.lastAccessed ? new Date(fact.lastAccessed) : undefined
	};
}

function deserializeSession(session: DBSessionSummary): SessionSummary {
	return {
		...session,
		startedAt: new Date(session.startedAt),
		endedAt: session.endedAt ? new Date(session.endedAt) : undefined
	};
}

function deserializeTurn(turn: DBConversationTurn): ConversationTurn {
	return {
		...turn,
		createdAt: new Date(turn.createdAt)
	};
}

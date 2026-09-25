// Working memory and session bookkeeping: the in-RAM turn window, the
// per-run session record, and hydration from IndexedDB on load.
import type { ConversationTurn, WorkingMemory } from '$lib/types/memory';
import { MAX_WORKING_MEMORY_TURNS } from '$lib/types/memory';
import * as memoryStorage from '$lib/services/storage/memory';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import { summarizeTurns } from './session-summary';

// Working memory store (single instance for the session)
let workingMemory: WorkingMemory = {
	turns: [],
	sessionStartedAt: new Date(),
	messageCount: 0
};

// Expose read-only access to the current working memory state
export function getWorkingMemory(): WorkingMemory {
	return workingMemory;
}

// Add a turn to working memory
function addTurnToWorkingMemory(turn: Omit<ConversationTurn, 'id'>): void {
	workingMemory.turns.push({
		...turn,
		createdAt: turn.createdAt ?? new Date()
	} as ConversationTurn);

	// Trim to max size
	if (workingMemory.turns.length > MAX_WORKING_MEMORY_TURNS) {
		workingMemory.turns = workingMemory.turns.slice(-MAX_WORKING_MEMORY_TURNS);
	}

	workingMemory.messageCount++;
}

// The app and the overlay are separate windows with separate RAM, so a turn
// recorded in one is broadcast and appended in the other; otherwise the two
// windows hold different conversations until the next reload.
export interface RemoteTurn {
	role: ConversationTurn['role'];
	content: string;
	createdAt: string;
}

let channel: BroadcastChannel | null = null;
const remoteListeners = new Set<(turn: RemoteTurn) => void>();

function isRemoteTurn(data: unknown): data is RemoteTurn {
	if (!data || typeof data !== 'object') return false;
	const t = data as Partial<RemoteTurn>;
	return (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && typeof t.createdAt === 'string';
}

function openChannel(): BroadcastChannel | null {
	if (channel || typeof BroadcastChannel === 'undefined') return channel;
	channel = new BroadcastChannel(STORAGE_INVENTORY.broadcast.memory);
	// Node keeps the loop alive for an open channel; browsers have no unref
	(channel as { unref?: () => void }).unref?.();
	channel.onmessage = (event) => {
		if (!isRemoteTurn(event.data)) return;
		addTurnToWorkingMemory({ role: event.data.role, content: event.data.content, createdAt: new Date(event.data.createdAt) });
		for (const fn of remoteListeners) fn(event.data);
	};
	return channel;
}

/** Hear turns recorded in other windows. Working memory follows them either way. */
export function onRemoteTurn(fn: (turn: RemoteTurn) => void): () => void {
	openChannel();
	remoteListeners.add(fn);
	return () => {
		remoteListeners.delete(fn);
	};
}

export function closeMemoryChannel(): void {
	channel?.close();
	channel = null;
}

// How many turns have been persisted under the current session.
let currentSessionTurnCount = 0;

// Open a session for this run on first use, so persisted turns can be grouped
// and "last time you talked" style context has something to read.
export async function ensureSession(): Promise<number | undefined> {
	if (workingMemory.currentSessionId !== undefined) return workingMemory.currentSessionId;
	try {
		const startedAt = new Date();
		const id = await memoryStorage.saveSession({
			summary: '',
			keyTopics: [],
			messageCount: 0,
			emotionalArc: '',
			startedAt
		});
		workingMemory.currentSessionId = id;
		workingMemory.sessionStartedAt = startedAt;
		currentSessionTurnCount = 0;
		return id;
	} catch (e) {
		console.debug('[Memory] Failed to create session:', e);
		return undefined;
	}
}

// Record a conversation turn: mirror it into working memory AND persist it to
// IndexedDB so history survives reloads and exports aren't empty. Persistence
// failures are non-fatal: the in-RAM copy still drives the current session.
export async function recordTurn(
	turn: Omit<ConversationTurn, 'id' | 'createdAt' | 'sessionId'>
): Promise<void> {
	const sessionId = await ensureSession();
	const full: Omit<ConversationTurn, 'id'> = { ...turn, sessionId, createdAt: new Date() };

	addTurnToWorkingMemory(full);
	openChannel()?.postMessage({ role: full.role, content: full.content, createdAt: full.createdAt.toISOString() } satisfies RemoteTurn);

	try {
		await memoryStorage.saveConversationTurn(full);
		if (sessionId !== undefined) {
			currentSessionTurnCount++;
			await memoryStorage.updateSession(sessionId, {
				messageCount: currentSessionTurnCount,
				endedAt: full.createdAt
			});
		}
	} catch (e) {
		console.debug('[Memory] Failed to persist conversation turn:', e);
	}
}

// Get recent turns from working memory
export function getRecentTurns(limit: number = 10): ConversationTurn[] {
	return workingMemory.turns.slice(-limit);
}

// Hydrate working memory from IndexedDB (call on page load)
export async function hydrateWorkingMemory(): Promise<void> {
	if (workingMemory.turns.length > 0) return;

	const recentTurns = await memoryStorage.getConversationTurns({ limit: 20 });
	workingMemory.turns = recentTurns;
	workingMemory.messageCount = recentTurns.length;

	// Backfill summaries for past sessions that ended without one, so the
	// "last time you talked" prompt context actually has something to read.
	await finalizeStaleSessions();
}

// Generate summaries for any past session that has turns but no summary yet
// (skipping the current run's session, which is still active). Runs on load so
// summaries exist before the first message of a returning session builds its prompt.
async function finalizeStaleSessions(): Promise<void> {
	try {
		const sessions = await memoryStorage.getSessions();
		for (const session of sessions) {
			if (session.id === undefined) continue;
			if (session.id === workingMemory.currentSessionId) continue;
			if (session.summary && session.summary.length > 0) continue;

			const turns = await memoryStorage.getConversationTurns({ sessionId: session.id });
			if (turns.length === 0) continue;

			const { summary, keyTopics, emotionalArc } = summarizeTurns(turns);
			if (summary) {
				await memoryStorage.updateSession(session.id, { summary, keyTopics, emotionalArc });
			}
		}
	} catch (e) {
		console.debug('[Memory] Failed to finalize stale sessions:', e);
	}
}

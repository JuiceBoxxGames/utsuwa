import { db } from '$lib/db';
import { saveToDownloads } from '$lib/utils/save-to-downloads';
import { characterStore, STORAGE_CLEARING, STORAGE_CLEARED } from '$lib/stores/character.svelte';
import localforage from 'localforage';
import {
	partitionNewRecords,
	factKey,
	turnKey,
	eventKey,
	importSessions,
	remapSessionIds
} from './import-dedup';
import { listClearTargets, STORAGE_INVENTORY } from './storage-inventory';
import { clampCharacterStats } from '$lib/engine/state-updates';
import type {
	CharacterState,
	MoodState,
	RelationshipStage,
	PersonalityProfile
} from '$lib/types/character';
import type { Fact, SessionSummary, ConversationTurn } from '$lib/types/memory';
import type { CompletedEventRecord } from '$lib/types/events';

export const SAVE_FILE_VERSION = '2.0';

// V2 SaveFile - single companion architecture
export interface SaveFile {
	version: string;
	exportedAt: string;
	appVersion: string;
	data: {
		character: CharacterState; // Single unified character (persona + stats)
		facts: Fact[];
		sessions: SessionSummary[];
		conversationTurns: ConversationTurn[];
		completedEvents: CompletedEventRecord[];
	};
}

// Legacy V1 SaveFile for import compatibility
export interface LegacySaveFile {
	version: string;
	exportedAt: string;
	appVersion?: string;
	data: {
		characterStates?: Array<Record<string, unknown>>;
		companion?: Array<Record<string, unknown>>;
		facts: Array<Record<string, unknown>>;
		sessions: Array<Record<string, unknown>>;
		conversationTurns: Array<Record<string, unknown>>;
		completedEvents: Array<Record<string, unknown>>;
		personas?: Array<Record<string, unknown>>;
	};
}

export interface SaveFilePreview {
	version: string;
	exportedAt: Date;
	appVersion: string;
	counts: {
		facts: number;
		sessions: number;
		conversationTurns: number;
		completedEvents: number;
	};
	characterName: string;
}

export async function exportSave(): Promise<SaveFile> {
	const [characterStates, facts, sessions, conversationTurns, completedEvents] = await Promise.all(
		[
			db.characterStates.toArray(),
			db.facts.toArray(),
			db.sessions.toArray(),
			db.conversationTurns.toArray(),
			db.completedEvents.toArray()
		]
	);

	// Get the single character state (or use current store state). Runes are
	// not available in a plain .ts module, so unwrap the store proxy the same
	// way the file itself is serialised.
	const characterState = characterStates[0] || JSON.parse(JSON.stringify(characterStore.state));

	// Remove IndexedDB auto-increment ids and derived data (embeddings) from export.
	// Session ids stay: turns reference them, and import remaps both together.
	const { id: _charId, ...cleanCharacter } = characterState as CharacterState & { id?: number };
	const cleanFacts = facts.map(({ id: _id, embedding: _embedding, ...rest }) => rest) as Fact[];
	const cleanSessions = sessions as SessionSummary[];
	const cleanTurns = conversationTurns.map(({ id: _id, ...rest }) => rest) as ConversationTurn[];
	const cleanEvents = completedEvents.map(
		({ id: _id, ...rest }) => rest
	) as CompletedEventRecord[];

	return {
		version: SAVE_FILE_VERSION,
		exportedAt: new Date().toISOString(),
		appVersion: import.meta.env.VITE_APP_VERSION,
		data: {
			character: cleanCharacter as CharacterState,
			facts: cleanFacts,
			sessions: cleanSessions,
			conversationTurns: cleanTurns,
			completedEvents: cleanEvents
		}
	};
}

export async function importSave(
	saveFile: SaveFile | LegacySaveFile,
	mode: 'merge' | 'replace'
): Promise<{ imported: number; skipped: number }> {
	let imported = 0;
	let skipped = 0;

	const isV2 = saveFile.version.startsWith('2.');

	// Insert a collection with merge-mode dedup. In merge mode existing records
	// are keyed first so re-importing the same save is a no-op; replace mode starts
	// from empty (tables cleared) but still dedupes within the incoming file.
	async function importCollection<T>(
		table: {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			add: (r: T) => Promise<any>;
			toArray: () => Promise<T[]>;
		},
		records: T[],
		keyOf: (r: T) => string
	): Promise<void> {
		const existingKeys =
			mode === 'merge' ? new Set((await table.toArray()).map(keyOf)) : new Set<string>();
		const { toAdd, skipped: dupes } = partitionNewRecords(records, keyOf, existingKeys);
		for (const record of toAdd) {
			await table.add(record);
		}
		imported += toAdd.length;
		skipped += dupes;
	}

	// Sessions land on fresh auto-increment ids (clear() doesn't reset the
	// counter, and merge mode can't reuse ids anyway), so turns are remapped to
	// the new ids instead of trying to preserve the old ones.
	async function importSessionsAndTurns(
		sessions: SessionSummary[],
		turns: ConversationTurn[]
	): Promise<void> {
		const existing = mode === 'merge' ? await db.sessions.toArray() : [];
		const result = await importSessions(sessions, existing, (s) => db.sessions.add(s) as Promise<number>);
		imported += result.added;
		skipped += result.skipped;
		await importCollection(db.conversationTurns, remapSessionIds(turns, result.idMap), turnKey);
	}

	// Wrap the whole import in one transaction so a mid-import failure rolls back
	// instead of leaving cleared tables with partially-written data.
	await db.transaction(
		'rw',
		[db.characterStates, db.facts, db.sessions, db.conversationTurns, db.completedEvents],
		async () => {
			if (mode === 'replace') {
				// Clear all existing data
				await Promise.all([
					db.characterStates.clear(),
					db.facts.clear(),
					db.sessions.clear(),
					db.conversationTurns.clear(),
					db.completedEvents.clear()
				]);
			}

			if (isV2) {
				// V2 format - single character
				const v2File = saveFile as SaveFile;

				const { id: _id, ...character } = clampCharacterStats(v2File.data.character);
				if (mode === 'replace') {
					await db.characterStates.add(character);
					imported++;
				} else {
					// Merge mode - skip character if one exists
					const existing = await db.characterStates.toCollection().first();
					if (!existing) {
						await db.characterStates.add(character);
						imported++;
					} else {
						skipped++;
					}
				}

				await importCollection(db.facts, v2File.data.facts, factKey);
				await importSessionsAndTurns(v2File.data.sessions, v2File.data.conversationTurns);
				await importCollection(db.completedEvents, v2File.data.completedEvents, eventKey);
			} else {
				// V1 format - migrate to single character
				const v1File = saveFile as LegacySaveFile;

				// Take the first character state and first persona, merge them
				const firstCharState = v1File.data.characterStates?.[0];
				const firstPersona = v1File.data.personas?.[0];

				if (firstCharState || firstPersona) {
					const existing = await db.characterStates.toCollection().first();
					if (!existing || mode === 'replace') {
						// Build merged character state
						const mergedState = {
					// Persona fields from persona or defaults
					name: (firstPersona?.name as string) || 'Utsuwa',
					systemPrompt:
						(firstPersona?.systemPrompt as string) ||
						'You are a friendly AI assistant named Utsuwa.',
					extensions: (firstPersona?.extensions as Record<string, unknown>) || {},
					// Character fields from state or defaults
					mood: (firstCharState?.mood as MoodState) || {
						primary: 'neutral' as const,
						intensity: 50,
						causes: []
					},
					energy: (firstCharState?.energy as number) ?? 100,
					affection: (firstCharState?.affection as number) ?? 0,
					trust: (firstCharState?.trust as number) ?? 0,
					intimacy: (firstCharState?.intimacy as number) ?? 0,
					comfort: (firstCharState?.comfort as number) ?? 0,
					respect: (firstCharState?.respect as number) ?? 0,
					appMode: 'dating_sim' as const,
					relationshipStage: (firstCharState?.relationshipStage as RelationshipStage) || 'stranger',
					personality: (firstCharState?.personality as PersonalityProfile) || {
						openness: 0,
						warmth: 20,
						assertiveness: -10,
						playfulness: 10,
						sensitivity: 20,
						likesTeasing: 0,
						prefersDirectness: -10,
						romanticStyle: 'slow_burn' as const
					},
					lastInteraction: (firstCharState?.lastInteraction as Date | null) || null,
					firstMet: (firstCharState?.firstMet as Date) || new Date(),
					daysKnown: (firstCharState?.daysKnown as number) ?? 0,
					totalInteractions: (firstCharState?.totalInteractions as number) ?? 0,
					currentStreak: (firstCharState?.currentStreak as number) ?? 0,
					longestStreak: (firstCharState?.longestStreak as number) ?? 0,
					streakLastDate: (firstCharState?.streakLastDate as string | null) || null,
					completedEvents: (firstCharState?.completedEvents as string[]) || [],
					createdAt: (firstCharState?.createdAt as Date) || new Date(),
					updatedAt: new Date()
				};
				await db.characterStates.add(clampCharacterStats(mergedState as CharacterState));
				imported++;
			} else {
				skipped++;
			}
		}

				// Import facts/sessions/turns/events (cast from legacy format)
				await importCollection(db.facts, v1File.data.facts as unknown as Fact[], factKey);
				await importSessionsAndTurns(
					v1File.data.sessions as unknown as SessionSummary[],
					v1File.data.conversationTurns as unknown as ConversationTurn[]
				);
				await importCollection(
					db.completedEvents,
					v1File.data.completedEvents as unknown as CompletedEventRecord[],
					eventKey
				);
			}
		}
	);

	// Reload character store to pick up imported data
	await characterStore.loadState();

	return { imported, skipped };
}

export function validateSaveFile(json: unknown): SaveFile | LegacySaveFile | null {
	if (!json || typeof json !== 'object') return null;

	const obj = json as Record<string, unknown>;

	// Check required fields
	if (typeof obj.version !== 'string') return null;
	if (typeof obj.exportedAt !== 'string') return null;
	if (!obj.data || typeof obj.data !== 'object') return null;

	const data = obj.data as Record<string, unknown>;

	// V2 format check
	if (obj.version.toString().startsWith('2.')) {
		if (!data.character) return null;
		if (!Array.isArray(data.facts)) return null;
		if (!Array.isArray(data.sessions)) return null;
		if (!Array.isArray(data.conversationTurns)) return null;
		if (!Array.isArray(data.completedEvents)) return null;
		return json as SaveFile;
	}

	// V1 format check
	const v1RequiredArrays = ['facts', 'sessions', 'conversationTurns', 'completedEvents'];
	for (const key of v1RequiredArrays) {
		if (!Array.isArray(data[key])) return null;
	}

	return json as LegacySaveFile;
}

export function getSaveFilePreview(saveFile: SaveFile | LegacySaveFile): SaveFilePreview {
	const isV2 = saveFile.version.startsWith('2.');

	let characterName = 'Utsuwa';
	if (isV2) {
		const v2 = saveFile as SaveFile;
		characterName = v2.data.character?.name || 'Utsuwa';
	} else {
		const v1 = saveFile as LegacySaveFile;
		characterName = (v1.data.personas?.[0]?.name as string) || 'Utsuwa';
	}

	return {
		version: saveFile.version,
		exportedAt: new Date(saveFile.exportedAt),
		appVersion: saveFile.appVersion || 'unknown',
		counts: {
			facts: saveFile.data.facts?.length ?? 0,
			sessions: saveFile.data.sessions?.length ?? 0,
			conversationTurns: saveFile.data.conversationTurns?.length ?? 0,
			completedEvents: saveFile.data.completedEvents?.length ?? 0
		},
		characterName
	};
}

export async function downloadSaveFile(
	saveFile: SaveFile
): Promise<{ filename: string; savedToDownloads: boolean }> {
	const json = JSON.stringify(saveFile, null, 2);
	const blob = new Blob([json], { type: 'application/json' });

	// Date plus time so two exports on the same day never overwrite each other
	// on desktop, where the file is written directly instead of auto-renamed.
	const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
	const filename = `utsuwa-save-${stamp}.json`;
	const savedToDownloads = await saveToDownloads(filename, blob);
	return { filename, savedToDownloads };
}

export async function clearAllData(): Promise<void> {
	// Other windows (the desktop overlay, extra tabs) stop saving first so they
	// can't write their in-memory state back over the wipe, then reload after it.
	const channel =
		typeof BroadcastChannel !== 'undefined'
			? new BroadcastChannel(STORAGE_INVENTORY.broadcast.character)
			: null;
	characterStore.haltSaves();
	channel?.postMessage(STORAGE_CLEARING);

	const targets = listClearTargets(Object.keys(localStorage));
	await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())));
	await Promise.all(targets.localforage.map((store) => localforage.createInstance(store).clear()));
	for (const key of targets.localStorage) localStorage.removeItem(key);

	channel?.postMessage(STORAGE_CLEARED);
	channel?.close();
	window.location.reload();
}

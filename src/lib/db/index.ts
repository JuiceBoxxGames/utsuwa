import Dexie, { type EntityTable } from 'dexie';
import { STORAGE_INVENTORY } from './storage-inventory';
import type { CharacterState } from '$lib/types/character';
import type { Fact, SessionSummary, ConversationTurn, Reminder } from '$lib/types/memory';
import type { CompletedEventRecord } from '$lib/types/events';

// Database types with IndexedDB-friendly id handling
export interface DBCharacterState extends Omit<CharacterState, 'id'> {
	id?: number;
}

export interface DBFact extends Omit<Fact, 'id'> {
	id?: number;
}

export interface DBSessionSummary extends Omit<SessionSummary, 'id'> {
	id?: number;
}

export interface DBConversationTurn extends Omit<ConversationTurn, 'id'> {
	id?: number;
}

export interface DBCompletedEvent extends Omit<CompletedEventRecord, 'id'> {
	id?: number;
}

export interface DBReminder extends Omit<Reminder, 'id'> {
	id?: number;
}

// Legacy persona storage keys (for migration)
const LEGACY_PERSONA_CARDS_KEY = STORAGE_INVENTORY.localStorage.legacyPersonaCards;
const LEGACY_PERSONA_ACTIVE_KEY = STORAGE_INVENTORY.localStorage.legacyPersonaActiveId;

class UtsuwaDatabase extends Dexie {
	characterStates!: EntityTable<DBCharacterState, 'id'>;
	facts!: EntityTable<DBFact, 'id'>;
	sessions!: EntityTable<DBSessionSummary, 'id'>;
	conversationTurns!: EntityTable<DBConversationTurn, 'id'>;
	completedEvents!: EntityTable<DBCompletedEvent, 'id'>;
	reminders!: EntityTable<DBReminder, 'id'>;

	constructor() {
		super(STORAGE_INVENTORY.indexedDb);

		// Version 1: Original multi-persona schema (legacy)
		this.version(1).stores({
			characterStates: '++id, &personaId, updatedAt',
			companion: '++id, &personaId',
			facts: '++id, personaId, category, importance, createdAt',
			sessions: '++id, personaId, startedAt',
			conversationTurns: '++id, personaId, sessionId, createdAt',
			completedEvents: '++id, personaId, eventId, completedAt'
		});

		// Version 2: Single companion - remove personaId indexes, remove companion table
		this.version(2)
			.stores({
				characterStates: '++id, updatedAt',
				companion: null, // Delete the companion table
				facts: '++id, category, importance, createdAt',
				sessions: '++id, startedAt',
				conversationTurns: '++id, sessionId, createdAt',
				completedEvents: '++id, eventId, completedAt'
			})
			.upgrade(async (tx) => {
				// Migration: merge persona from localStorage with first characterState
				const characterStates = tx.table('characterStates');

				// Get the first character state (or the one for 'default' persona)
				const existingStates = await characterStates.toArray();
				const defaultState =
					existingStates.find((s: Record<string, unknown>) => s.personaId === 'default') ||
					existingStates[0];

				// Read persona from localStorage
				let personaName = 'Utsuwa';
				let personaPrompt =
					'You are a friendly AI assistant named Utsuwa. You communicate through a VRM avatar and can express emotions through facial expressions and gestures. Be helpful, conversational, and engaging.';
				let personaExtensions = {};

				if (typeof window !== 'undefined') {
					try {
						const savedCards = localStorage.getItem(LEGACY_PERSONA_CARDS_KEY);
						const savedActiveId = localStorage.getItem(LEGACY_PERSONA_ACTIVE_KEY);
						if (savedCards) {
							const cards = JSON.parse(savedCards);
							// Get active or default persona
							const activeCard = cards[savedActiveId || 'default'] || cards['default'];
							if (activeCard) {
								personaName = activeCard.name || personaName;
								personaPrompt = activeCard.systemPrompt || personaPrompt;
								personaExtensions = activeCard.extensions || {};
							}
						}
						// Clean up legacy localStorage
						localStorage.removeItem(LEGACY_PERSONA_CARDS_KEY);
						localStorage.removeItem(LEGACY_PERSONA_ACTIVE_KEY);
					} catch {
						// Ignore localStorage errors during migration
					}
				}

				// Clear all character states
				await characterStates.clear();

				// Create unified state with persona fields
				if (defaultState) {
					const { personaId: _personaId, ...rest } = defaultState as Record<string, unknown>;
					await characterStates.add({
						...rest,
						name: personaName,
						systemPrompt: personaPrompt,
						extensions: personaExtensions,
						updatedAt: new Date()
					} as DBCharacterState);
				}
			});

		// Version 3: Add embedding field to facts for semantic search
		// No migration needed - embedding field is optional and will be backfilled lazily
		this.version(3).stores({
			characterStates: '++id, updatedAt',
			facts: '++id, category, importance, createdAt',
			sessions: '++id, startedAt',
			conversationTurns: '++id, sessionId, createdAt',
			completedEvents: '++id, eventId, completedAt'
		});

		// Version 4: Add reminders table for scheduled tasks/timers
		this.version(4).stores({
			characterStates: '++id, updatedAt',
			facts: '++id, category, importance, createdAt',
			sessions: '++id, startedAt',
			conversationTurns: '++id, sessionId, createdAt',
			completedEvents: '++id, eventId, completedAt',
			reminders: '++id, sessionId, triggerAt, executed'
		});

		// Version 5: Add compound index on reminders for efficient due/upcoming queries
		this.version(5).stores({
			characterStates: '++id, updatedAt',
			facts: '++id, category, importance, createdAt',
			sessions: '++id, startedAt',
			conversationTurns: '++id, sessionId, createdAt',
			completedEvents: '++id, eventId, completedAt',
			reminders: '++id, sessionId, triggerAt, executed, [executed+triggerAt]'
		});

		// Version 6: Add dismissed flag so recentFired notifications survive a reload.
		this.version(6).stores({
			characterStates: '++id, updatedAt',
			facts: '++id, category, importance, createdAt',
			sessions: '++id, startedAt',
			conversationTurns: '++id, sessionId, createdAt',
			completedEvents: '++id, eventId, completedAt',
			reminders: '++id, sessionId, triggerAt, executed, dismissed, [executed+triggerAt]'
		});
	}
}

export const db = new UtsuwaDatabase();

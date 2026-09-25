import type { CharacterState, StateUpdates, Emotion, MoodState, RelationshipStage } from '$lib/types/character';
import { resolveStageTransition } from './stages.ts';

// Clamp a value between min and max
function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function clampNumber(value: unknown, min: number, max: number, fallback = min): number {
	return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function clampCount(value: unknown): number {
	return Math.floor(clampNumber(value, 0, Number.MAX_SAFE_INTEGER));
}

// Save files are user-editable JSON; pull every stat back into the range the
// engine assumes before it lands in IndexedDB.
export function clampCharacterStats<T extends CharacterState>(state: T): T {
	const personality: Record<string, unknown> = { ...state.personality };
	for (const [key, value] of Object.entries(personality)) {
		if (key !== 'romanticStyle') personality[key] = clampNumber(value, -100, 100, 0);
	}
	return {
		...state,
		energy: clampNumber(state.energy, 0, 100, 100),
		affection: clampNumber(state.affection, 0, 1000),
		trust: clampNumber(state.trust, 0, 100),
		intimacy: clampNumber(state.intimacy, 0, 100),
		comfort: clampNumber(state.comfort, 0, 100),
		respect: clampNumber(state.respect, 0, 100),
		mood: { ...state.mood, intensity: clampNumber(state.mood?.intensity, 0, 100, 50) },
		personality: personality as unknown as CharacterState['personality'],
		daysKnown: clampCount(state.daysKnown),
		totalInteractions: clampCount(state.totalInteractions),
		currentStreak: clampCount(state.currentStreak),
		longestStreak: clampCount(state.longestStreak)
	};
}

// Check and apply stage transition if needed. Promotion is immediate; demotion
// is damped by the hysteresis band in resolveStageTransition and flagged as
// `strained` so callers can acknowledge it in dialogue instead of letting the
// relationship downgrade silently.
export function checkAndApplyStageTransition(
	state: CharacterState,
	completedEvents: string[]
): {
	newState: CharacterState;
	transitioned: boolean;
	strained: boolean;
	fromStage?: RelationshipStage;
	toStage?: RelationshipStage;
} {
	const resolution = resolveStageTransition(state, completedEvents);

	if (resolution.changed) {
		return {
			newState: {
				...state,
				relationshipStage: resolution.stage,
				updatedAt: new Date()
			},
			transitioned: true,
			strained: resolution.direction === 'demotion',
			fromStage: state.relationshipStage,
			toStage: resolution.stage
		};
	}

	return { newState: state, transitioned: false, strained: false };
}

// Apply time-based decay (call on session start)
export function applyTimeDecay(state: CharacterState, hoursSinceLastInteraction: number): StateUpdates {
	const updates: StateUpdates = {};

	// Energy recovery (full after 6+ hours)
	if (state.energy < 100) {
		if (hoursSinceLastInteraction >= 6) {
			updates.energyDelta = 100 - state.energy;
		} else {
			// Partial recovery - use Math.ceil to ensure at least 1 energy recovered
			const recoveryRate = Math.min(1, hoursSinceLastInteraction / 6);
			const recovery = Math.ceil((100 - state.energy) * recoveryRate);
			updates.energyDelta = Math.max(1, recovery); // Always recover at least 1
		}
	}

	// Affection decay (only after 48 hours). A zero-value delta must not be set
	// at all: resolveTimeDecayOnLoad treats any delta as "decay happened" and
	// consumes the once-per-absence slot, so a -0 written at hour 49 would
	// swallow the real decay owed at day 5.
	if (hoursSinceLastInteraction > 48 && state.affection > 0) {
		const daysAway = Math.floor(hoursSinceLastInteraction / 24) - 2; // Start after 2 days
		const decayRate = Math.min(0.05, 0.01 * daysAway);
		const decay = Math.floor(state.affection * decayRate);
		if (decay > 0) {
			updates.affectionDelta = -Math.min(decay, 50); // Cap at 50 per session
		}
	}

	// Trust decay (only after 7 days)
	if (hoursSinceLastInteraction > 168 && state.trust > 0) {
		const weeksAway = Math.floor(hoursSinceLastInteraction / 168);
		const decay = Math.min(weeksAway * 2, 10); // Slow decay, max 10 per session
		if (decay > 0) {
			updates.trustDelta = -decay;
		}
	}

	// Mood shifts towards melancholy if away too long (3+ days)
	if (hoursSinceLastInteraction > 72) {
		const intensityDelta = Math.min(30, Math.floor(hoursSinceLastInteraction / 24) * 5);
		if (intensityDelta > 0) {
			updates.moodChange = {
				emotion: 'melancholy',
				intensityDelta,
				cause: 'missing you'
			};
		}
	}

	return updates;
}

// The subset of fields a load-time decay pass may change, plus whether anything
// changed at all (so the caller only persists when needed).
export interface TimeDecayApplication {
	next: Partial<Pick<CharacterState, 'energy' | 'affection' | 'trust' | 'mood' | 'lastDecayAt'>>;
	changed: boolean;
}

// Resolve how a page load should apply time decay. Energy recovery is
// self-limiting (caps at 100) so it runs on every load, but affection/trust/mood
// decay is applied at most once per absence: a refresh or a second window would
// otherwise re-deduct the same time away. `lastDecayAt` records that this
// absence's decay is accounted for; it re-arms when the user next interacts
// (which advances lastInteraction past lastDecayAt). `now` is passed in so this
// stays pure and testable.
export function resolveTimeDecayOnLoad(state: CharacterState, now: number): TimeDecayApplication {
	const result: TimeDecayApplication = { next: {}, changed: false };
	if (!state.lastInteraction) return result;

	const lastInteractionMs = new Date(state.lastInteraction).getTime();
	const hoursSince = (now - lastInteractionMs) / (1000 * 60 * 60);
	if (hoursSince <= 0.5) return result;

	const timeUpdates = applyTimeDecay(state, hoursSince);
	const alreadyDecayed =
		state.lastDecayAt != null && new Date(state.lastDecayAt).getTime() >= lastInteractionMs;

	const next: TimeDecayApplication['next'] = {};
	let decayApplied = false;

	if (timeUpdates.energyDelta !== undefined) {
		next.energy = clamp(state.energy + timeUpdates.energyDelta, 0, 100);
	}

	if (!alreadyDecayed) {
		if (timeUpdates.affectionDelta !== undefined) {
			next.affection = clamp(state.affection + timeUpdates.affectionDelta, 0, 1000);
			decayApplied = true;
		}
		if (timeUpdates.trustDelta !== undefined) {
			next.trust = clamp(state.trust + timeUpdates.trustDelta, 0, 100);
			decayApplied = true;
		}
		if (timeUpdates.moodChange) {
			const mood: MoodState = {
				...state.mood,
				primary: timeUpdates.moodChange.emotion,
				intensity: clamp(state.mood.intensity + (timeUpdates.moodChange.intensityDelta ?? 0), 0, 100),
				causes: timeUpdates.moodChange.cause
					? [...state.mood.causes.slice(-4), timeUpdates.moodChange.cause]
					: state.mood.causes
			};
			next.mood = mood;
			decayApplied = true;
		}
	}

	if (decayApplied) {
		next.lastDecayAt = new Date(now);
	}

	result.next = next;
	result.changed = timeUpdates.energyDelta !== undefined || decayApplied;
	return result;
}

// Calculate interaction impact based on message analysis
export interface MessageImpact {
	energyDelta: number;
	affectionDelta: number;
	trustDelta: number;
	intimacyDelta: number;
	comfortDelta: number;
	respectDelta: number;
}

export function calculateMessageImpact(
	sentiment: number, // -1 to 1
	topicDepth: 'shallow' | 'moderate' | 'deep',
	isEmotional: boolean,
	isQuestion: boolean,
	state: CharacterState
): MessageImpact {
	// Base impacts
	let energyDelta = -2;
	let affectionDelta = 1;
	let trustDelta = 0;
	let intimacyDelta = 0;
	let comfortDelta = 0;
	let respectDelta = 0;

	// Sentiment modifiers
	if (sentiment > 0.3) {
		affectionDelta += 2;
		comfortDelta += 1;
	} else if (sentiment < -0.3) {
		affectionDelta -= 1;
		comfortDelta -= 1;
	}

	// Topic depth modifiers
	switch (topicDepth) {
		case 'deep':
			energyDelta -= 2;
			affectionDelta += 2;
			intimacyDelta += 2;
			trustDelta += 1;
			break;
		case 'moderate':
			energyDelta -= 1;
			affectionDelta += 1;
			intimacyDelta += 1;
			break;
		case 'shallow':
			// Shallow conversations can increase boredom
			comfortDelta -= 1;
			break;
	}

	// Emotional content
	if (isEmotional) {
		intimacyDelta += 2;
		trustDelta += 1;
		affectionDelta += 1;
	}

	// Questions show interest
	if (isQuestion) {
		respectDelta += 1;
		trustDelta += 1;
	}

	// Non-linear affection growth
	const affectionPhase = state.affection < 300 ? 'honeymoon' : state.affection < 700 ? 'comfort' : 'deepBond';
	switch (affectionPhase) {
		case 'honeymoon':
			affectionDelta = Math.floor(affectionDelta * 1.5);
			break;
		case 'comfort':
			// Normal rate
			break;
		case 'deepBond':
			affectionDelta = Math.floor(affectionDelta * 0.7);
			break;
	}

	// Add randomness (±20%)
	const variance = 0.2;
	affectionDelta = Math.floor(affectionDelta * (1 + (Math.random() - 0.5) * 2 * variance));
	trustDelta = Math.floor(trustDelta * (1 + (Math.random() - 0.5) * 2 * variance));

	return {
		energyDelta,
		affectionDelta: Math.max(-5, Math.min(10, affectionDelta)),
		trustDelta: Math.max(-3, Math.min(5, trustDelta)),
		intimacyDelta: Math.max(-2, Math.min(5, intimacyDelta)),
		comfortDelta: Math.max(-3, Math.min(3, comfortDelta)),
		respectDelta: Math.max(-2, Math.min(3, respectDelta))
	};
}

// Merge baseline heuristics with LLM suggestions. By default the baseline
// bounds the LLM's deltas; with trustLLMDeltas (non-Latin input, where the
// keyword baseline is meaningless) the LLM's values are taken as-is — the
// response parser has already sanitized them to absolute ranges.
export function mergeUpdates(
	baseline: StateUpdates,
	llmSuggestion: Partial<StateUpdates>,
	options: { trustLLMDeltas?: boolean } = {}
): StateUpdates {
	const merged: StateUpdates = { ...baseline };
	const trustLLM = options.trustLLMDeltas === true;

	// LLM can override mood entirely
	if (llmSuggestion.moodChange) {
		merged.moodChange = llmSuggestion.moodChange;
	}

	// LLM can adjust deltas, but baseline provides bounds
	if (llmSuggestion.affectionDelta !== undefined) {
		if (trustLLM) {
			merged.affectionDelta = llmSuggestion.affectionDelta;
		} else {
			// Take LLM suggestion but cap it relative to baseline
			const baseAffection = baseline.affectionDelta ?? 0;
			const maxDelta = Math.max(Math.abs(baseAffection) * 2, 5);
			merged.affectionDelta = clamp(llmSuggestion.affectionDelta, -maxDelta, maxDelta);
		}
	}

	if (llmSuggestion.trustDelta !== undefined) {
		if (trustLLM) {
			merged.trustDelta = llmSuggestion.trustDelta;
		} else {
			const baseTrust = baseline.trustDelta ?? 0;
			const maxDelta = Math.max(Math.abs(baseTrust) * 2, 3);
			merged.trustDelta = clamp(llmSuggestion.trustDelta, -maxDelta, maxDelta);
		}
	}

	if (llmSuggestion.intimacyDelta !== undefined) {
		merged.intimacyDelta = trustLLM
			? llmSuggestion.intimacyDelta
			: clamp(llmSuggestion.intimacyDelta, -3, 5);
	}

	if (llmSuggestion.comfortDelta !== undefined) {
		merged.comfortDelta = trustLLM
			? llmSuggestion.comfortDelta
			: clamp(llmSuggestion.comfortDelta, -3, 5);
	}

	if (llmSuggestion.respectDelta !== undefined) {
		merged.respectDelta = trustLLM
			? llmSuggestion.respectDelta
			: clamp(llmSuggestion.respectDelta, -3, 5);
	}

	// Energy delta stays from baseline (app controls energy)
	// LLM suggestions for memory and events are passed through
	if (llmSuggestion.newMemory) {
		merged.newMemory = llmSuggestion.newMemory;
	}

	if (llmSuggestion.triggeredEvent) {
		merged.triggeredEvent = llmSuggestion.triggeredEvent;
	}

	if (llmSuggestion.action) {
		merged.action = llmSuggestion.action;
	}

	if (llmSuggestion.expression) {
		merged.expression = llmSuggestion.expression;
	}

	return merged;
}

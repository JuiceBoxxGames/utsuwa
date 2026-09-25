import {
	type CharacterState,
	type StateUpdates,
	type RelationshipStage,
	type PersonaExtensions,
	type AppMode,
	RELATIONSHIP_STAGE_INFO,
	MOOD_INFO
} from '$lib/types/character';
import { createDefaultCharacterState } from '$lib/engine/character-defaults';
import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import {
	getCharacterState,
	saveCharacterState,
	deleteCharacterState
} from '$lib/services/storage/character';
import { statChangesStore } from './stat-changes.svelte';
import { chatHintStore } from './chat-hint.svelte';
import { resolveTimeDecayOnLoad } from '$lib/engine/state-updates';
import { reconcileLegacyMarkers } from '$lib/engine/event-completion';
import { calculateStage, STAGE_ORDER } from '$lib/engine/stages';
import { computeStreakUpdate } from '$lib/engine/streak';

// Single character state
let state = $state<CharacterState>(createDefaultCharacterState() as CharacterState);

// Loading state
let isLoading = $state(true);
let isReady = $state(false);
let error = $state<string | null>(null);

// Debounce save timeout
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

// Cross-window sync channel (main <-> overlay). Character state lives in
// IndexedDB, so the 'storage' event settings relies on never fires for it;
// BroadcastChannel reaches every same-origin context, which covers browser
// tabs and both Tauri windows alike.
let syncChannel: BroadcastChannel | null = null;
// Prevents a sync-triggered rehydrate from broadcasting back and ping-ponging
let isSyncing = false;
// Set while Clear All Data runs in any window; nothing may write after it
let savesHalted = false;

export const STORAGE_CLEARING = 'storage-clearing';
export const STORAGE_CLEARED = 'storage-cleared';

// Create the store object
function createCharacterStore() {
	// Derived mood info
	const moodInfo = $derived.by(() => {
		const mood = state?.mood;
		if (!mood) return MOOD_INFO.neutral;
		return MOOD_INFO[mood.primary] ?? MOOD_INFO.neutral;
	});

	// Derived stage info
	const stageInfo = $derived.by(() => {
		const stage = state?.relationshipStage;
		if (!stage) return RELATIONSHIP_STAGE_INFO.stranger;
		return RELATIONSHIP_STAGE_INFO[stage] ?? RELATIONSHIP_STAGE_INFO.stranger;
	});

	// Affection as percentage (0-100)
	const affectionPercent = $derived.by(() => {
		return Math.min(100, Math.floor((state?.affection ?? 0) / 10));
	});

	// Load state from IndexedDB
	async function loadState(): Promise<void> {
		if (!browser) return;

		isLoading = true;
		error = null;

		try {
			const loaded = await getCharacterState();
			state = loaded;

			let needsSave = false;

			// Older saves reached committed before it gated on the commitment-talk
			// outcome marker; patch them so the stricter gate can't demote them.
			const reconciled = reconcileLegacyMarkers(state);
			if (reconciled) {
				state = { ...state, completedEvents: reconciled };
				needsSave = true;
			}

			// Apply time-based recovery/decay based on time since last interaction.
			// Energy recovers every load; affection/trust/mood decay applies once per
			// absence so a refresh or second window can't re-deduct it (see helper).
			const decay = resolveTimeDecayOnLoad(state, Date.now());
			if (decay.changed) {
				state = { ...state, ...decay.next };
				needsSave = true;
			}

			if (needsSave && !savesHalted) {
				// Save the patched state (use $state.snapshot to strip Proxy)
				const plainState = $state.snapshot(state);
				await saveCharacterState({ ...plainState, updatedAt: new Date() });
				notifyOtherWindows();
			}

			isReady = true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load state';
			console.error('Failed to load character state:', e);
		} finally {
			isLoading = false;
		}
	}

	// Save state to IndexedDB (debounced)
	async function save(immediate = false): Promise<void> {
		if (!browser || savesHalted) return;

		// Clear existing timeout
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}

		const doSave = async () => {
			try {
				// Use $state.snapshot() to strip Proxy for IndexedDB
				const plainState = $state.snapshot(state);
				await saveCharacterState({
					...plainState,
					updatedAt: new Date()
				});
				notifyOtherWindows();
			} catch (e) {
				if (!chatHintStore.reportStorageError(e)) console.error('Failed to save character state:', e);
			}
		};

		if (immediate) {
			await doSave();
		} else {
			// Debounce by 1 second
			saveTimeout = setTimeout(doSave, 1000);
		}
	}

	// Tell other windows we persisted, so they rehydrate instead of sitting on
	// a stale snapshot that their next save would push back over ours.
	function notifyOtherWindows(): void {
		if (isSyncing) return;
		syncChannel?.postMessage('character-state-saved');
	}

	// Rehydrate from IndexedDB after another window saves. Deliberately not
	// loadState(): decay/reconcile already ran at boot, and a sync must never
	// trigger a save of its own or two windows would echo back and forth.
	async function syncFromStorage(): Promise<void> {
		isSyncing = true;
		try {
			state = await getCharacterState();
		} catch (e) {
			console.error('Failed to sync character state:', e);
		} finally {
			isSyncing = false;
		}
	}

	// Update persona fields (name, systemPrompt, extensions)
	function updatePersona(updates: {
		name?: string;
		systemPrompt?: string;
		extensions?: PersonaExtensions;
	}): void {
		state = {
			...state,
			...(updates.name !== undefined && { name: updates.name }),
			...(updates.systemPrompt !== undefined && { systemPrompt: updates.systemPrompt }),
			...(updates.extensions !== undefined && { extensions: updates.extensions }),
			updatedAt: new Date()
		};
		save();
	}

	// Apply state updates. countInteraction is false for system events (e.g.
	// fired reminders): the model's own mood/stat deltas still apply, but the
	// turn must not count as the user interacting (totalInteractions gates stage
	// transitions and events; lastInteraction drives decay timing).
	function applyUpdates(updates: StateUpdates, options: { countInteraction?: boolean } = {}): void {
		const { countInteraction = true } = options;
		const newState = { ...state };
		const isCompanionMode = state.appMode === 'companion';

		// Apply mood change (always applies in both modes)
		if (updates.moodChange) {
			newState.mood = {
				...newState.mood,
				primary: updates.moodChange.emotion,
				intensity: Math.max(
					0,
					Math.min(100, newState.mood.intensity + (updates.moodChange.intensityDelta ?? 0))
				)
			};
			if (updates.moodChange.cause) {
				newState.mood.causes = [...newState.mood.causes.slice(-4), updates.moodChange.cause];
			}
		}

		// Apply energy (always applies in both modes)
		if (updates.energyDelta !== undefined && updates.energyDelta !== 0) {
			newState.energy = Math.max(0, Math.min(100, newState.energy + updates.energyDelta));
			statChangesStore.emit('energy', updates.energyDelta);
		}

		// Only apply relationship stats in Dating Sim Mode
		if (!isCompanionMode) {
			if (updates.affectionDelta !== undefined && updates.affectionDelta !== 0) {
				newState.affection = Math.max(0, Math.min(1000, newState.affection + updates.affectionDelta));
				statChangesStore.emit('affection', updates.affectionDelta);
			}
			if (updates.trustDelta !== undefined && updates.trustDelta !== 0) {
				newState.trust = Math.max(0, Math.min(100, newState.trust + updates.trustDelta));
				statChangesStore.emit('trust', updates.trustDelta);
			}
			if (updates.intimacyDelta !== undefined && updates.intimacyDelta !== 0) {
				newState.intimacy = Math.max(0, Math.min(100, newState.intimacy + updates.intimacyDelta));
				statChangesStore.emit('intimacy', updates.intimacyDelta);
			}
			if (updates.comfortDelta !== undefined && updates.comfortDelta !== 0) {
				newState.comfort = Math.max(0, Math.min(100, newState.comfort + updates.comfortDelta));
				statChangesStore.emit('comfort', updates.comfortDelta);
			}
			if (updates.respectDelta !== undefined && updates.respectDelta !== 0) {
				newState.respect = Math.max(0, Math.min(100, newState.respect + updates.respectDelta));
				statChangesStore.emit('respect', updates.respectDelta);
			}
		}

		// Update timestamp and interaction count. System events keep both frozen
		// so machine-generated turns can't advance progression or reset decay.
		if (countInteraction) {
			newState.lastInteraction = new Date();
			newState.totalInteractions++;
		}
		newState.updatedAt = new Date();

		// Update state with reactive assignment
		state = newState;

		// Save to IndexedDB (debounced)
		save();
	}

	// Set relationship stage
	function setRelationshipStage(stage: RelationshipStage): void {
		state = {
			...state,
			relationshipStage: stage,
			updatedAt: new Date()
		};
		save();
	}

	// Set app mode (companion vs dating_sim)
	function setAppMode(mode: AppMode): void {
		const previousMode = state.appMode;
		const previousStage = state.relationshipStage;

		if (mode === 'companion') {
			// Save current dating sim stage before switching, then lock to companion stage
			state = {
				...state,
				appMode: mode,
				savedDatingSimStage: previousStage !== 'companion' ? previousStage : state.savedDatingSimStage,
				relationshipStage: 'companion',
				updatedAt: new Date()
			};
		} else {
			// Restore to dating sim. Prefer the stage saved when Companion Mode was
			// entered so time spent there (and any decay during it) can't silently
			// downgrade a hard-won stage; still allow an upgrade if stats have since
			// grown past it.
			const calculatedStage = calculateStage(state, state.completedEvents || []);
			const saved = state.savedDatingSimStage;
			const restoredStage =
				saved && STAGE_ORDER.indexOf(saved) > STAGE_ORDER.indexOf(calculatedStage)
					? saved
					: calculatedStage;
			state = {
				...state,
				appMode: mode,
				relationshipStage: restoredStage,
				savedDatingSimStage: undefined,
				updatedAt: new Date()
			};
		}

		save();
	}

	// Mark event as completed. Also accepts synthetic choice-outcome markers
	// (a choice's nextSceneId, e.g. 'confession_accepted') that gate later stages.
	function markEventCompleted(eventId: string): void {
		if (!state.completedEvents.includes(eventId)) {
			const completedEvents = [...state.completedEvents, eventId];
			// A gating event can unlock the next relationship stage right away, but
			// completing an event never demotes: demotion is handled by the per-turn
			// hysteresis check so it can be acknowledged in dialogue, not sprung on
			// the user as a side effect of finishing a scene. Companion mode has no
			// dating-sim ladder, so leave its stage locked.
			let relationshipStage = state.relationshipStage;
			if (state.appMode !== 'companion') {
				const calculated = calculateStage(state, completedEvents);
				if (STAGE_ORDER.indexOf(calculated) > STAGE_ORDER.indexOf(relationshipStage)) {
					relationshipStage = calculated;
				}
			}
			state = {
				...state,
				completedEvents,
				relationshipStage,
				updatedAt: new Date()
			};
			save();
		}
	}

	// Check if event is completed
	function hasCompletedEvent(eventId: string): boolean {
		return state?.completedEvents.includes(eventId) ?? false;
	}

	// Update streak (call on session start). Pure logic lives in engine/streak.ts;
	// it handles DST days and clock-set-back protection.
	function updateStreak(): void {
		const next = computeStreakUpdate(
			{
				currentStreak: state.currentStreak,
				longestStreak: state.longestStreak,
				streakLastDate: state.streakLastDate
			},
			new Date()
		);

		if (
			next.currentStreak === state.currentStreak &&
			next.longestStreak === state.longestStreak &&
			next.streakLastDate === state.streakLastDate
		) {
			return;
		}

		state = {
			...state,
			...next,
			updatedAt: new Date()
		};
		save();
	}

	// Calculate days known
	function updateDaysKnown(): void {
		const firstMet = state.firstMet;
		const now = new Date();
		const daysKnown = Math.floor((now.getTime() - firstMet.getTime()) / (1000 * 60 * 60 * 24));

		if (daysKnown !== state.daysKnown) {
			state = {
				...state,
				daysKnown,
				updatedAt: new Date()
			};
			save();
		}
	}

	function haltSaves(): void {
		savesHalted = true;
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}
	}

	// Mark onboarding as complete (prevents re-showing on refresh)
	function markOnboardingComplete(): Promise<void> {
		state = {
			...state,
			lastInteraction: new Date(),
			updatedAt: new Date()
		};
		return save(true);
	}

	// Reset state (delete and recreate)
	async function resetState(): Promise<void> {
		if (!browser) return;

		try {
			await deleteCharacterState();
			state = createDefaultCharacterState() as CharacterState;
			await save(true);
		} catch (e) {
			console.error('Failed to reset character state:', e);
		}
	}

	// Initialize on browser
	if (browser) {
		// Listen before the initial load so a boot-time patch save in another
		// window is never missed.
		if (typeof BroadcastChannel !== 'undefined') {
			syncChannel = new BroadcastChannel(STORAGE_INVENTORY.broadcast.character);
			syncChannel.onmessage = async (event) => {
				if (event.data === STORAGE_CLEARING) return haltSaves();
				if (event.data === STORAGE_CLEARED) return window.location.reload();
				if (savesHalted) return;
				// Still booting: loadState is about to read fresh data anyway
				if (isLoading) return;
				// Flush a pending local save first so its changes go through the
				// storage merge instead of being dropped by the rehydrate.
				if (saveTimeout) {
					await save(true);
				}
				await syncFromStorage();
			};
		}

		loadState();

		// Flush pending saves before the page unloads to prevent data loss.
		// IndexedDB transactions started in beforeunload typically complete before teardown.
		window.addEventListener('beforeunload', () => {
			if (saveTimeout && !savesHalted) {
				clearTimeout(saveTimeout);
				saveTimeout = null;
				const plainState = $state.snapshot(state);
				saveCharacterState({ ...plainState, updatedAt: new Date() }).then(() => notifyOtherWindows());
			}
		});
	}

	return {
		// Getters
		get state() {
			return state;
		},
		get isLoading() {
			return isLoading;
		},
		get isReady() {
			return isReady;
		},
		get error() {
			return error;
		},
		get moodInfo() {
			return moodInfo;
		},
		get stageInfo() {
			return stageInfo;
		},
		get affectionPercent() {
			return affectionPercent;
		},
		get appMode() {
			return state.appMode;
		},

		// Persona accessors (convenience)
		get name() {
			return state.name;
		},
		get systemPrompt() {
			return state.systemPrompt;
		},
		get extensions() {
			return state.extensions;
		},

		// Actions
		loadState,
		save,
		updatePersona,
		applyUpdates,
		setRelationshipStage,
		setAppMode,
		markEventCompleted,
		hasCompletedEvent,
		updateStreak,
		updateDaysKnown,
		markOnboardingComplete,
		resetState,
		haltSaves
	};
}

// Export singleton store
export const characterStore = createCharacterStore();

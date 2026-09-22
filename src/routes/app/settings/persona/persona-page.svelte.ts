import { personaStore } from '$lib/stores/persona.svelte';
import { characterStore } from '$lib/stores/character.svelte';
import { vrmStore } from '$lib/stores/vrm.svelte';
import { allEvents } from '$lib/data/events';
import type { CompletedEventRecord, EventType } from '$lib/types/events';

// Achievement data with event definitions joined
export interface Achievement {
	id: string;
	name: string;
	type: EventType;
	completedAt: Date;
}

// Shared state for the persona settings page. Created once by +page.svelte and
// passed to the section components via props. Effects stay in the page.
export function createPersonaPageState() {
	// Character state - single companion system
	const isCharacterLoading = $derived.by(() => characterStore.isLoading);
	const appMode = $derived.by(() => characterStore.appMode);
	const isDatingSimMode = $derived.by(() => characterStore.appMode === 'dating_sim');

	// Completed events with full records (includes dates)
	let completedEventRecords = $state<CompletedEventRecord[]>([]);

	const achievements = $derived.by(() => {
		return completedEventRecords
			.map(record => {
				const eventDef = allEvents.find(e => e.id === record.eventId);
				if (!eventDef) return null;
				return {
					id: record.eventId,
					name: eventDef.name,
					type: eventDef.type,
					completedAt: record.completedAt
				} as Achievement;
			})
			.filter((a): a is Achievement => a !== null)
			.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
	});

	// Labels and icons for achievement types
	const achievementConfig: Record<EventType, { icon: string; label: string }> = {
		milestone: { icon: 'trophy', label: 'Milestone' },
		anniversary: { icon: 'heart', label: 'Anniversary' },
		conditional: { icon: 'award', label: 'Unlocked' },
		random: { icon: 'sparkles', label: 'Surprise' },
		scheduled: { icon: 'calendar', label: 'Event' }
	};

	function formatAchievementDate(date: Date): string {
		return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	// Persona form state
	let formName = $state('');
	let formSystemPrompt = $state('');
	let uploadModalOpen = $state(false);
	let modeConfirmOpen = $state(false);
	let pendingMode = $state<'companion' | 'dating_sim' | null>(null);

	function saveName() {
		personaStore.updateCard({ name: formName.trim() || 'Utsuwa' });
	}

	function saveSystemPrompt() {
		personaStore.updateCard({ systemPrompt: formSystemPrompt });
	}

	async function handleUpload(file: File) {
		await vrmStore.addModel(file);
		uploadModalOpen = false;
	}

	function requestModeChange(mode: 'companion' | 'dating_sim') {
		if (mode === appMode) return;
		pendingMode = mode;
		modeConfirmOpen = true;
	}

	function confirmModeChange() {
		if (pendingMode) {
			characterStore.setAppMode(pendingMode);
		}
		modeConfirmOpen = false;
		pendingMode = null;
	}

	function cancelModeChange() {
		modeConfirmOpen = false;
		pendingMode = null;
	}

	return {
		// Getters
		get isCharacterLoading() {
			return isCharacterLoading;
		},
		get appMode() {
			return appMode;
		},
		get isDatingSimMode() {
			return isDatingSimMode;
		},
		get completedEventRecords() {
			return completedEventRecords;
		},
		set completedEventRecords(value: CompletedEventRecord[]) {
			completedEventRecords = value;
		},
		get achievements() {
			return achievements;
		},
		get formName() {
			return formName;
		},
		set formName(value: string) {
			formName = value;
		},
		get formSystemPrompt() {
			return formSystemPrompt;
		},
		set formSystemPrompt(value: string) {
			formSystemPrompt = value;
		},
		get uploadModalOpen() {
			return uploadModalOpen;
		},
		set uploadModalOpen(value: boolean) {
			uploadModalOpen = value;
		},
		get modeConfirmOpen() {
			return modeConfirmOpen;
		},

		// Constants
		achievementConfig,

		// Actions
		formatAchievementDate,
		saveName,
		saveSystemPrompt,
		handleUpload,
		requestModeChange,
		confirmModeChange,
		cancelModeChange
	};
}

export type PersonaPageState = ReturnType<typeof createPersonaPageState>;

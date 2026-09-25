import { characterStore } from '$lib/stores/character.svelte';
import { eventsApi } from '$lib/engine/events';
import { completionMarkers } from '$lib/engine/event-completion';
import { canGenerateMoment, generateMoment } from '$lib/services/events/moment-generator';
import type { StateUpdates } from '$lib/types/character';
import type { EventDefinition, Scene } from '$lib/types/events';

/** The open event scene, shared by the app and the overlay. */
export function createEventSession() {
	let activeEvent = $state<EventDefinition | null>(null);
	// Generated moments: the event stays the source of truth for structure and
	// completion; generatedScene only swaps the words when the model delivers.
	let generatedScene = $state<Scene | null>(null);
	let pending = $state(false);

	function open(e: EventDefinition) {
		activeEvent = e;
		generatedScene = null;
		pending = canGenerateMoment(e);
		if (!pending) return;
		void generateMoment(e).then((scene) => {
			if (activeEvent?.id !== e.id) return;
			generatedScene = scene;
			pending = false;
		});
	}

	function complete(choiceIndex?: number, stateChanges?: Partial<StateUpdates>) {
		if (!activeEvent) return;
		const event = $state.snapshot(activeEvent);

		if (stateChanges) {
			characterStore.applyUpdates(stateChanges as StateUpdates);
		} else if (event.stateChanges) {
			characterStore.applyUpdates(event.stateChanges);
		}

		// Apply the gating markers first and synchronously: the event id plus the
		// chosen outcome marker (e.g. confession_accepted) drive stage progression
		// and are persisted via the character store. Doing this before the DB write
		// means a failed write can't silently strand a hard-won stage unlock.
		for (const marker of completionMarkers(event, choiceIndex)) {
			characterStore.markEventCompleted(marker);
		}

		// Then record the durable history entry (also carries cooldown timestamps).
		eventsApi
			.recordCompletedEvent(
				event,
				choiceIndex,
				choiceIndex !== undefined ? `Choice ${choiceIndex + 1}` : undefined
			)
			.catch((e) => console.error('Failed to record event completion:', e));

		activeEvent = null;
	}

	function close() {
		activeEvent = null;
	}

	return {
		get activeEvent() {
			return activeEvent;
		},
		get generatedScene() {
			return generatedScene;
		},
		get pending() {
			return pending;
		},
		open,
		complete,
		close
	};
}

import {
	hydrateWorkingMemory,
	backfillEmbeddings,
	getEmbeddingBackfillStatus
} from '$lib/engine/memory';
import { initEmbeddingModel } from '$lib/services/embeddings';
import { createReminderFiredHandler } from '$lib/services/chat/reminder-chat';
import type { SendCompanionMessageOptions } from '$lib/services/chat/companion-chat';
import { reminderStore } from '$lib/stores/reminders.svelte';
import { debugEventsStore } from '$lib/stores/debugEvents.svelte';
import type { EventDefinition } from '$lib/types/events';

interface CompanionSessionHooks {
	/** Sends a fired reminder back through the page's companion pipeline. */
	send: (content: string, options: SendCompanionMessageOptions) => void;
	onEvent: (event: EventDefinition) => void;
}

/**
 * Startup shared by the app and the overlay: memory, embeddings, developer
 * events and reminders. Call from onMount and return the cleanup.
 */
export function startCompanionSession({ send, onEvent }: CompanionSessionHooks): () => void {
	hydrateWorkingMemory().catch((e) => console.error('Failed to hydrate working memory:', e));

	// Facts saved before the embedding model loaded get their vectors now
	initEmbeddingModel()
		.then(async (ready) => {
			if (!ready) return;
			const status = await getEmbeddingBackfillStatus();
			if (status.withoutEmbeddings > 0) await backfillEmbeddings();
		})
		.catch((e) => console.error('Failed to initialize embedding model:', e));

	const stopDebugEvents = debugEventsStore.listen(onEvent);

	// Fired reminders go back through the companion pipeline so the model
	// decides how to react. The overlay polls too, so timers fire while the
	// main window is hidden.
	const unsubscribeReminder = reminderStore.addReminderFiredListener(
		createReminderFiredHandler(send)
	);
	reminderStore.startPolling();

	return () => {
		reminderStore.stopPolling();
		unsubscribeReminder();
		stopDebugEvents();
	};
}

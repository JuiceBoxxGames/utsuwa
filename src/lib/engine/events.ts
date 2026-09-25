import type { EventDefinition, CompletedEventRecord } from '$lib/types/events';
import * as eventsStorage from '$lib/services/storage/events';

// Events API - uses IndexedDB storage directly
export const eventsApi = {
	async getCompletedEvents(): Promise<CompletedEventRecord[]> {
		return eventsStorage.getCompletedEvents();
	},

	async recordCompletedEvent(
		event: EventDefinition,
		choiceIndex?: number,
		outcome?: string
	): Promise<CompletedEventRecord> {
		const now = new Date();
		const id = await eventsStorage.saveCompletedEvent({
			eventId: event.id,
			eventType: event.type,
			choiceIndex,
			outcome,
			stateChanges: event.stateChanges,
			completedAt: now
		});
		return {
			id,
			eventId: event.id,
			eventType: event.type,
			choiceIndex,
			outcome,
			stateChanges: event.stateChanges,
			completedAt: now
		};
	}
};

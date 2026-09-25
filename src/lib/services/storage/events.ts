import { db, type DBCompletedEvent } from '$lib/db';
import type { CompletedEventRecord } from '$lib/types/events';

export async function getCompletedEvents(
	options: { eventId?: string; limit?: number } = {}
): Promise<CompletedEventRecord[]> {
	let events: DBCompletedEvent[];

	if (options.eventId) {
		events = await db.completedEvents.where('eventId').equals(options.eventId).toArray();
	} else {
		events = await db.completedEvents.toArray();
	}

	// Sort by completedAt descending (most recent first)
	events.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

	if (options.limit) {
		events = events.slice(0, options.limit);
	}

	return events.map(deserializeEvent);
}

export async function saveCompletedEvent(
	event: Omit<CompletedEventRecord, 'id'>
): Promise<number> {
	const dbEvent: Omit<DBCompletedEvent, 'id'> = {
		...event,
		completedAt: new Date(event.completedAt)
	};

	const id = await db.completedEvents.add(dbEvent);
	return id as number;
}

function deserializeEvent(event: DBCompletedEvent): CompletedEventRecord {
	return {
		...event,
		completedAt: new Date(event.completedAt)
	};
}

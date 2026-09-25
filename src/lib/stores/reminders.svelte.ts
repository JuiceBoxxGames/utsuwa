import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import { db } from '$lib/db';
import type { Reminder } from '$lib/types/memory';
import {
	classifyReminder,
	isOldExecutedReminder,
	validateReminder,
	DEFAULT_REMINDER_TTL_MS
} from '$lib/utils/reminders';

const POLL_INTERVAL_MS = 10000;
// Grace must cover a full poll gap so a reminder never classifies as missed
// just because the timer fell on the far side of an interval.
const GRACE_MS = 15000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
// Largest safe date for compound-index range queries.
const MAX_DATE = new Date(8640000000000000);
const BROADCAST_CHANNEL_NAME = STORAGE_INVENTORY.broadcast.reminders;

let upcoming = $state<Reminder[]>([]);
let recentFired = $state<Reminder[]>([]);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastCleanupAt = 0;
const onReminderFiredCallbacks = new Set<(reminder: Reminder) => void>();
let broadcastChannel: BroadcastChannel | null = null;
function generateWindowId(): string {
	if (browser && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `window-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
const windowId = generateWindowId();

async function loadUpcoming() {
	const now = new Date();
	// sessionId is kept only as metadata; pending reminders from any session are
	// visible and fireable so timers survive a browser restart even when the
	// current in-memory session id changes.
	const items = await db.reminders
		.where('[executed+triggerAt]')
		.between([0, now], [0, MAX_DATE], false, false)
		.toArray();

	items.sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());
	upcoming = items as Reminder[];
}

async function loadRecentFired() {
	const cutoff = Date.now() - DEFAULT_REMINDER_TTL_MS;
	// Restore notifications that fired but have not been dismissed yet so the
	// alarm icon/counter survives a browser reload.
	const items = await db.reminders
		.where('executed')
		.equals(1)
		.and((r) => !r.dismissed && r.triggerAt.getTime() > cutoff)
		.toArray();

	items.sort((a, b) => b.triggerAt.getTime() - a.triggerAt.getTime());
	recentFired = items as Reminder[];
}

async function cleanupOldReminders() {
	const now = Date.now();
	const old = await db.reminders
		.where('executed')
		.equals(1)
		.and((r) => isOldExecutedReminder(r, now, DEFAULT_REMINDER_TTL_MS))
		.toArray();

	for (const reminder of old) {
		if (reminder.id !== undefined) {
			await db.reminders.delete(reminder.id);
		}
	}
}

async function checkReminders() {
	const now = Date.now();
	const nowDate = new Date(now);
	// Query all non-executed due reminders regardless of session so missed timers
	// fire correctly after a browser restart.
	const due = await db.reminders
		.where('[executed+triggerAt]')
		.between([0, new Date(0)], [0, nowDate], true, true)
		.toArray();

	for (const reminder of due) {
		if (reminder.id === undefined) continue;

		// Atomic claim: only the first caller/window gets to process this row.
		const claimed = await db.reminders
			.where('id')
			.equals(reminder.id)
			.and((r) => !r.executed)
			.modify({ executed: 1, dismissed: 0 });

		if (claimed === 0) continue;

		const fate = classifyReminder(reminder.triggerAt, now, GRACE_MS);
		if (fate !== 'fire' && fate !== 'missed') continue;

		// Avoid duplicates if a reminder somehow gets processed twice in the same
		// window before the UI re-renders.
		if (!recentFired.some((r) => r.id === reminder.id)) {
			recentFired.push(reminder as Reminder);
		}

		// Notify other windows so every open surface updates its alarm icon.
		broadcastReminderFired(reminder as Reminder);

		// Only the window that claimed the reminder reacts through the LLM. This
		// prevents both the main app and the desktop overlay from sending the same
		// reminder message twice when both are open.
		for (const callback of onReminderFiredCallbacks) {
			callback(reminder as Reminder);
		}
	}

	await loadUpcoming();

	if (now - lastCleanupAt > CLEANUP_INTERVAL_MS) {
		lastCleanupAt = now;
		cleanupOldReminders().catch((e) => console.error('[Reminders] Cleanup error:', e));
	}
}

function broadcastReminderFired(reminder: Reminder) {
	if (!broadcastChannel) return;
	try {
		broadcastChannel.postMessage({ type: 'reminder-fired', sourceId: windowId, reminder });
	} catch (e) {
		console.error('[Reminders] Broadcast error:', e);
	}
}

function handleBroadcastMessage(event: MessageEvent<unknown>) {
	const message = event.data;
	if (
		!message ||
		typeof message !== 'object' ||
		(message as Record<string, unknown>).type !== 'reminder-fired'
	) {
		return;
	}

	const sourceId = (message as Record<string, unknown>).sourceId;
	if (sourceId === windowId) return;

	const reminder = (message as Record<string, unknown>).reminder as Reminder | undefined;
	if (!reminder || reminder.id === undefined) return;

	// Update the UI on this window without invoking the LLM reaction callback.
	if (!recentFired.some((r) => r.id === reminder.id)) {
		recentFired.push(reminder);
	}
}

function handleVisibilityChange() {
	if (document.hidden) return;
	// Browsers throttle setInterval while the tab is hidden. Check immediately
	// when the user returns so reminders don't sit unhandled.
	checkReminders().catch((e) => console.error('[Reminders] Visibility check error:', e));
}

export function startPolling() {
	if (!browser || pollTimer) return;

	if (typeof BroadcastChannel !== 'undefined') {
		broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
		broadcastChannel.addEventListener('message', handleBroadcastMessage);
	}

	pollTimer = setInterval(() => {
		checkReminders().catch((e) => console.error('[Reminders] Poll error:', e));
	}, POLL_INTERVAL_MS);

	document.addEventListener('visibilitychange', handleVisibilityChange);

	// Restore any notifications from before the reload, then check for new ones.
	loadRecentFired()
		.then(() => loadUpcoming())
		.then(() => checkReminders())
		.catch((e) => console.error('[Reminders] Initial check error:', e));
}

export function stopPolling() {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	document.removeEventListener('visibilitychange', handleVisibilityChange);

	if (broadcastChannel) {
		broadcastChannel.removeEventListener('message', handleBroadcastMessage);
		broadcastChannel.close();
		broadcastChannel = null;
	}
}

export async function addReminder(
	content: string,
	triggerAt: Date,
	sessionId: number
): Promise<Reminder> {
	const validationError = validateReminder(content, triggerAt);
	if (validationError) {
		throw new Error(validationError);
	}

	const id = await db.reminders.add({
		content,
		triggerAt,
		sessionId,
		executed: 0,
		createdAt: new Date()
	});
	const reminder = await db.reminders.get(id);
	if (!reminder) throw new Error('Failed to create reminder');

	await loadUpcoming();
	return reminder as Reminder;
}

export async function deleteReminder(id: number) {
	await db.reminders.delete(id);
	await loadUpcoming();
}

export async function dismissRecentFired(id?: number) {
	if (id === undefined) return;
	recentFired = recentFired.filter((r) => r.id !== id);
	await db.reminders.where('id').equals(id).modify({ dismissed: 1 });
}

export function addReminderFiredListener(callback: (reminder: Reminder) => void): () => void {
	onReminderFiredCallbacks.add(callback);
	return () => {
		onReminderFiredCallbacks.delete(callback);
	};
}

export const reminderStore = {
	get upcoming() {
		return upcoming;
	},
	get recentFired() {
		return recentFired;
	},
	startPolling,
	stopPolling,
	addReminder,
	deleteReminder,
	dismissRecentFired,
	addReminderFiredListener
};

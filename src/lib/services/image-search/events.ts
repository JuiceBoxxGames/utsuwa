/**
 * Platform- and window-independent "show pictures" events. Core search code
 * publishes here; the app, overlay and tests subscribe. BroadcastChannel keeps
 * open app/overlay windows in sync without coupling the core to any store.
 */
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import type { ImageSearchResult } from '$lib/utils/image-search';

export type ImageSearchErrorCode =
	| 'no_tool'
	| 'tool_unavailable'
	| 'search_failed'
	| 'empty_results'
	| 'cancelled';

export interface ImageSearchToolInfo {
	serverId: string;
	serverName: string;
	toolName: string;
}

interface ImageEventBase {
	id: string;
	at: number;
}

export type ImageShowEvent =
	| (ImageEventBase & {
			type: 'loading';
			requestId: string;
			query: string;
			page: number;
	  })
	| (ImageEventBase & {
			type: 'results';
			requestId: string;
			query: string;
			page: number;
			results: ImageSearchResult[];
			tool: ImageSearchToolInfo;
	  })
	| (ImageEventBase & {
			type: 'error';
			requestId: string;
			query: string;
			code: ImageSearchErrorCode;
			message: string;
	  })
	| (ImageEventBase & { type: 'close'; requestId?: string });

export interface ImageEventMeta {
	/** True when the event was emitted in this window. */
	local: boolean;
}

type ImageEventListener = (event: ImageShowEvent, meta: ImageEventMeta) => void;

let channel: BroadcastChannel | null = null;
const listeners = new Set<ImageEventListener>();
const seen = new Set<string>();

function openChannel(): BroadcastChannel | null {
	if (channel || typeof BroadcastChannel === 'undefined') return channel;
	channel = new BroadcastChannel(STORAGE_INVENTORY.broadcast.images);
	// Node keeps the event loop alive for an open channel; browsers have no unref.
	(channel as { unref?: () => void }).unref?.();
	channel.onmessage = (message: MessageEvent<unknown>) => {
		const event = message.data as ImageShowEvent | null;
		if (!event || typeof event !== 'object' || typeof event.id !== 'string') return;
		if (seen.has(event.id)) return;
		seen.add(event.id);
		for (const listener of listeners) listener(event, { local: false });
	};
	return channel;
}

/** Hear local and cross-window picture events. */
export function onImageShowEvent(listener: ImageEventListener): () => void {
	openChannel();
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Publish one event locally and to every other same-origin window. */
export function publishImageShowEvent(event: ImageShowEvent): void {
	seen.add(event.id);
	for (const listener of listeners) listener(event, { local: true });
	openChannel()?.postMessage(event);
}

export function closeImageChannel(): void {
	channel?.close();
	channel = null;
	listeners.clear();
	seen.clear();
}

export function newImageEventId(): string {
	return typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

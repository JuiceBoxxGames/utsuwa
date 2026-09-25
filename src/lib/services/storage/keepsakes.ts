import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import localforage from 'localforage';
import { computeScaledDimensions } from '$lib/services/chat/image-scaling';
import { chatHintStore } from '$lib/stores/chat-hint.svelte';

// "Traces of life": the images you've shown her. Stored locally only. The blob
// never leaves the device; only the single vision inference does. Mirrors the
// VRM blob store in stores/vrm.svelte.ts.
const keepsakeStorage = browser
	? localforage.createInstance({ ...STORAGE_INVENTORY.localforage.keepsakes })
	: null;

export interface PreparedImage {
	id: string;
	mimeType: string;
	base64: string; // raw base64, no data: prefix
	blob: Blob;
}

// Image types the vision APIs (OpenAI, Anthropic, Google, xAI) actually accept.
// Anything else (HEIC/HEIF from iPhones, TIFF, BMP, ...) is converted to JPEG
// below when the browser can decode it, or rejected.
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function isSupportedImageType(mimeType: string | undefined | null): boolean {
	return !!mimeType && SUPPORTED_IMAGE_TYPES.includes(mimeType.toLowerCase());
}

/** Thrown when a picked image is a format the vision models can't accept and the browser can't convert. */
export class UnsupportedImageError extends Error {
	constructor(public readonly mimeType: string) {
		super(`Unsupported image type: ${mimeType || 'unknown'}`);
		this.name = 'UnsupportedImageError';
	}
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

// Normalize a picked image for the vision APIs: downscale oversized images (so
// we don't ship huge base64 / store huge blobs), and convert decodable-but-
// unsupported formats (e.g. HEIC on Safari) to JPEG. Small, already-supported
// images pass through untouched to keep their format and transparency. A format
// the browser can't decode and providers won't accept (e.g. HEIC on Chrome)
// throws UnsupportedImageError so the UI can prompt for a different file.
async function normalizeImage(file: Blob): Promise<{ blob: Blob; mimeType: string }> {
	const mimeType = file.type || 'image/png';
	const unsupported = !isSupportedImageType(mimeType);
	try {
		const bitmap = await createImageBitmap(file);
		const { width, height } = computeScaledDimensions(bitmap.width, bitmap.height);
		const oversized = width !== bitmap.width || height !== bitmap.height;
		if (!oversized && !unsupported) {
			bitmap.close();
			return { blob: file, mimeType };
		}
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			bitmap.close();
			if (unsupported) throw new UnsupportedImageError(mimeType);
			return { blob: file, mimeType };
		}
		ctx.drawImage(bitmap, 0, 0, width, height);
		bitmap.close();
		const scaled = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', 0.85)
		);
		if (scaled) return { blob: scaled, mimeType: 'image/jpeg' };
		if (unsupported) throw new UnsupportedImageError(mimeType);
		return { blob: file, mimeType };
	} catch (e) {
		if (e instanceof UnsupportedImageError) throw e;
		// Couldn't decode at all. Reject unsupported formats clearly instead of
		// shipping bytes the provider will bounce.
		if (unsupported) throw new UnsupportedImageError(mimeType);
		return { blob: file, mimeType };
	}
}

/** Read a picked or dropped image into the shape we need to show it and maybe keep it. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
	const { blob, mimeType } = await normalizeImage(file);
	const base64 = await blobToBase64(blob);
	return {
		id: crypto.randomUUID(),
		mimeType,
		base64,
		blob
	};
}

// A "photo memory": the lightweight record of a kept image (the blob lives
// under keepsake-blob-${id}). These are what the photoboard reads.
export interface KeepsakeRecord {
	id: string;
	mimeType: string;
	createdAt: number; // epoch ms
	note?: string; // optional: what she remembered about it
	thumb?: string; // small cover-cropped data URL so the board renders without loading full blobs
	// 'shown' (default): an image the user showed her, displayed on the
	// photoboard. 'photo': a photo-mode capture, persisted but kept off the
	// "things you've shown her" wall.
	kind?: 'shown' | 'photo';
}

const INDEX_KEY = 'keepsake-index';

async function readIndex(): Promise<KeepsakeRecord[]> {
	return (await keepsakeStorage?.getItem<KeepsakeRecord[]>(INDEX_KEY)) ?? [];
}

// A tiny center-cropped square thumbnail (data URL) stored inline in the record,
// so the photoboard renders the whole wall from one index read at any scale.
async function makeThumbnail(blob: Blob, size = 220): Promise<string | undefined> {
	try {
		const bitmap = await createImageBitmap(blob);
		const scale = Math.max(size / bitmap.width, size / bitmap.height);
		const w = bitmap.width * scale;
		const h = bitmap.height * scale;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			bitmap.close();
			return undefined;
		}
		ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
		bitmap.close();
		return canvas.toDataURL('image/jpeg', 0.7);
	} catch {
		return undefined;
	}
}

/**
 * Persist a shown image as a keepsake (blob + photo-memory record with thumbnail).
 * A full disk raises the storage hint instead of failing the chat turn.
 */
export async function keepImage(
	id: string,
	blob: Blob,
	meta?: { mimeType?: string; note?: string; kind?: 'shown' | 'photo' }
): Promise<void> {
	try {
		await writeKeepsake(id, blob, meta);
	} catch (e) {
		if (!chatHintStore.reportStorageError(e)) throw e;
	}
}

async function writeKeepsake(
	id: string,
	blob: Blob,
	meta?: { mimeType?: string; note?: string; kind?: 'shown' | 'photo' }
): Promise<void> {
	await keepsakeStorage?.setItem(`keepsake-blob-${id}`, blob);
	const list = await readIndex();
	if (!list.some((k) => k.id === id)) {
		list.push({
			id,
			mimeType: meta?.mimeType || blob.type || 'image/jpeg',
			createdAt: Date.now(),
			note: meta?.note,
			thumb: await makeThumbnail(blob),
			kind: meta?.kind ?? 'shown'
		});
		await keepsakeStorage?.setItem(INDEX_KEY, list);
	}
}

/** All kept photo-memories, newest first. */
export async function listKeepsakes(): Promise<KeepsakeRecord[]> {
	const list = await readIndex();
	return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getKeepsakeBlob(id: string): Promise<Blob | null> {
	return (await keepsakeStorage?.getItem<Blob>(`keepsake-blob-${id}`)) ?? null;
}

/** Object URL for display. Caller revokes it when done. */
export async function getKeepsakeImageUrl(id: string): Promise<string | null> {
	const blob = await getKeepsakeBlob(id);
	return blob ? URL.createObjectURL(blob) : null;
}

/** She forgets it: hard-delete the blob and its record. */
export async function forgetKeepsakeImage(id: string): Promise<void> {
	await keepsakeStorage?.removeItem(`keepsake-blob-${id}`);
	const list = await readIndex();
	await keepsakeStorage?.setItem(INDEX_KEY, list.filter((k) => k.id !== id));
}

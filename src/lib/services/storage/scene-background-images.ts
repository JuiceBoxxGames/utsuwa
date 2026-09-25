import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import localforage from 'localforage';
import { computeScaledDimensions } from '$lib/services/chat/image-scaling';
import { isQuotaError, STORAGE_FULL_MESSAGE } from './quota';

// The user's own scene background. Stored locally only, like the VRM blobs in
// stores/vrm.svelte.ts.
const backgroundStorage = browser
	? localforage.createInstance({ ...STORAGE_INVENTORY.localforage.backgrounds })
	: null;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_EDGE_PX = 2560;

export interface LoadedBackgroundImage {
	id: string;
	url: string;
	bitmap: ImageBitmap;
}

// One decoded image at a time; a different id releases the previous one
let cached: { id: string; entry: Promise<LoadedBackgroundImage | null> } | null = null;

function releaseCached() {
	const old = cached;
	cached = null;
	void old?.entry.then((loaded) => {
		if (!loaded) return;
		URL.revokeObjectURL(loaded.url);
		loaded.bitmap.close();
	});
}

async function downscale(file: File): Promise<Blob> {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		throw new Error("That image couldn't be opened. Try a different file.");
	}
	try {
		const { width, height } = computeScaledDimensions(bitmap.width, bitmap.height, MAX_EDGE_PX);
		if (width === bitmap.width && height === bitmap.height) return file;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return file;
		ctx.drawImage(bitmap, 0, 0, width, height);
		// PNG and WebP keep their type so transparency survives
		const type = file.type === 'image/jpeg' ? 'image/jpeg' : file.type;
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
		return blob ?? file;
	} finally {
		bitmap.close();
	}
}

export async function saveBackgroundImage(file: File): Promise<string> {
	if (!ACCEPTED_TYPES.includes(file.type)) {
		throw new Error('Pick a JPEG, PNG, or WebP image.');
	}
	if (!backgroundStorage) throw new Error('Background images are not available here.');
	const blob = await downscale(file);
	const id = `custom-${Date.now()}`;
	// ponytail: single slot, a new upload wipes the old one. A gallery of
	// saved backgrounds is the upgrade path if people ask for it.
	await backgroundStorage.clear();
	try {
		await backgroundStorage.setItem(`bg-${id}`, blob);
	} catch (e) {
		throw isQuotaError(e) ? new Error(STORAGE_FULL_MESSAGE, { cause: e }) : e;
	}
	return id;
}

export function loadBackgroundImage(id: string): Promise<LoadedBackgroundImage | null> {
	if (cached?.id === id) return cached.entry;
	releaseCached();
	const entry = (async () => {
		try {
			const blob = await backgroundStorage?.getItem<Blob>(`bg-${id}`);
			if (!blob) return null;
			const bitmap = await createImageBitmap(blob);
			return { id, url: URL.createObjectURL(blob), bitmap };
		} catch (e) {
			console.warn('Failed to load background image:', e);
			return null;
		}
	})();
	cached = { id, entry };
	return entry;
}

export async function findStoredBackgroundImageId(): Promise<string | null> {
	const keys = (await backgroundStorage?.keys()) ?? [];
	const key = keys.find((k) => k.startsWith('bg-'));
	return key ? key.slice('bg-'.length) : null;
}

export async function removeBackgroundImage(id: string): Promise<void> {
	await backgroundStorage?.removeItem(`bg-${id}`);
	if (cached?.id === id) releaseCached();
}

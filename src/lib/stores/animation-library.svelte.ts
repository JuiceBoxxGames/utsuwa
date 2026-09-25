import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import localforage from 'localforage';
import {
	applyBuiltinOverrides,
	parseAnimationMetadata,
	resolveIdlePool,
	BUILTIN_IDLES,
	MAX_DESCRIPTION_LENGTH,
	MAX_NAME_LENGTH,
	type AnimationEntry,
	type BaseBehavior,
	type BuiltinOverride,
	type StoredCustomAnimation
} from './animation-library-parser';
import { checkAnimationFile, parseAnimationBlob } from '$lib/services/storage/animations';
import { isQuotaError, STORAGE_FULL_MESSAGE } from '$lib/services/storage/quota';
import { evictVrmAnimation } from '$lib/services/vrm-animations';

export type { AnimationEntry } from './animation-library-parser';

// Metadata in localStorage so other windows get a storage event; blobs in
// IndexedDB like the custom VRM models. Must not import the vrm store (it
// imports this one).
const STORAGE_KEY = STORAGE_INVENTORY.localStorage.animations;
const blobStorage = browser
	? localforage.createInstance({ ...STORAGE_INVENTORY.localforage.animations })
	: null;
const blobKey = (id: string) => `anim-blob-${id}`;

function createAnimationLibraryStore() {
	let overrides = $state<Record<string, BuiltinOverride>>({});
	let custom = $state<AnimationEntry[]>([]);
	const entries = $derived([...applyBuiltinOverrides(overrides), ...custom]);
	const enabledForLlm = $derived(entries.filter((e) => e.llmEnabled && e.kind !== 'idle'));
	const playable = $derived(entries.filter((e) => e.kind !== 'idle'));
	const idleCandidates = $derived(entries.filter((e) => e.kind !== 'emote'));
	let base = $state<BaseBehavior>({ idlePool: [], thinkingId: null });
	const idlePoolUrls = $derived(resolveIdlePool(base, idleCandidates, BUILTIN_IDLES.map((e) => e.url)));
	const thinkingUrl = $derived(base.thinkingId ? (entries.find((e) => e.id === base.thinkingId)?.url ?? null) : null);

	let readyResolve: () => void = () => {};
	const ready = new Promise<void>((resolve) => (readyResolve = resolve));
	// Storage events can land while a restore is still awaiting blobs
	let syncChain: Promise<void> = Promise.resolve();
	// A save before the first restore would write an empty custom list
	let restored = !browser;

	// Reuses this window's URLs for ids it already has and builds fresh ones
	// from the stored blobs for the rest. Blob URLs are per window.
	async function restoreCustom(stored: StoredCustomAnimation[]): Promise<void> {
		const current = new Map(custom.map((e) => [e.id, e]));
		const next: AnimationEntry[] = [];
		for (const meta of stored) {
			const existing = current.get(meta.id);
			if (existing) {
				next.push({ ...meta, url: existing.url, kind: 'custom' });
				current.delete(meta.id);
				continue;
			}
			const blob = await blobStorage?.getItem<Blob>(blobKey(meta.id)).catch(() => null);
			if (!blob) {
				console.debug(`[animations] dropping ${meta.id}: its file is missing`);
				continue;
			}
			next.push({ ...meta, url: URL.createObjectURL(blob), kind: 'custom' });
		}
		// Anything left was deleted elsewhere
		for (const gone of current.values()) releaseUrl(gone.url);
		custom = next;
	}

	function applyStored(raw: string | null): Promise<void> {
		syncChain = syncChain.then(async () => {
			const meta = parseAnimationMetadata(raw);
			overrides = meta.overrides;
			base = meta.base;
			await restoreCustom(meta.custom);
		});
		return syncChain;
	}

	function save() {
		if (!browser || !restored) return;
		const stored: StoredCustomAnimation[] = custom.map(({ url: _url, kind: _kind, ...rest }) => rest);
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ overrides: $state.snapshot(overrides), custom: stored, base: $state.snapshot(base) })
		);
	}

	function releaseUrl(url: string) {
		evictVrmAnimation(url);
		URL.revokeObjectURL(url);
	}

	if (browser) {
		void applyStored(localStorage.getItem(STORAGE_KEY)).finally(() => {
			restored = true;
			readyResolve();
		});
		const onStorage = (event: StorageEvent) => {
			if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null)) {
				void applyStored(event.key === null ? null : event.newValue);
			}
		};
		window.addEventListener('storage', onStorage);
		import.meta.hot?.dispose(() => window.removeEventListener('storage', onStorage));
	} else {
		readyResolve();
	}

	async function addFromFile(file: File): Promise<AnimationEntry> {
		checkAnimationFile(file);
		if (!blobStorage) throw new Error('Animations are not available here.');
		const blob = new Blob([await file.arrayBuffer()], { type: 'application/octet-stream' });
		const { url, durationSec } = await parseAnimationBlob(blob);
		const id = `anim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		try {
			await blobStorage.setItem(blobKey(id), blob);
		} catch (e) {
			releaseUrl(url);
			throw new Error(isQuotaError(e) ? STORAGE_FULL_MESSAGE : "Couldn't save that animation.", { cause: e });
		}
		const entry: AnimationEntry = {
			id,
			name: (file.name.replace(/\.vrma$/i, '').trim() || 'Animation').slice(0, MAX_NAME_LENGTH),
			url,
			description: '',
			llmEnabled: false,
			kind: 'custom',
			createdAt: Date.now(),
			durationSec
		};
		custom = [...custom, entry];
		save();
		return entry;
	}

	function update(id: string, patch: { name?: string; description?: string; llmEnabled?: boolean }) {
		const description = patch.description?.slice(0, MAX_DESCRIPTION_LENGTH);
		const index = custom.findIndex((e) => e.id === id);
		if (index !== -1) {
			const name = patch.name?.trim().slice(0, MAX_NAME_LENGTH);
			const next = { ...custom[index] };
			if (name) next.name = name;
			if (description !== undefined) next.description = description;
			if (patch.llmEnabled !== undefined) next.llmEnabled = patch.llmEnabled;
			custom[index] = next;
		} else if (entries.some((e) => e.id === id)) {
			// Built-ins only take description and the companion switch
			const next = { ...overrides[id] };
			if (description !== undefined) next.description = description;
			if (patch.llmEnabled !== undefined) next.llmEnabled = patch.llmEnabled;
			overrides = { ...overrides, [id]: next };
		} else {
			return;
		}
		save();
	}

	async function remove(id: string): Promise<void> {
		const entry = custom.find((e) => e.id === id);
		if (!entry) return;
		custom = custom.filter((e) => e.id !== id);
		save();
		releaseUrl(entry.url);
		await blobStorage?.removeItem(blobKey(id));
	}

	function setIdlePool(ids: string[]) {
		base = { ...base, idlePool: [...new Set(ids)] };
		save();
	}

	function setThinkingId(id: string | null) {
		base = { ...base, thinkingId: id };
		save();
	}

	return {
		get entries(): readonly AnimationEntry[] {
			return entries;
		},
		// One-shot emotes: built-ins plus uploads, never the idle loops
		get playable(): readonly AnimationEntry[] {
			return playable;
		},
		// Uploads count too; whether one loops well is the user's call
		get idleCandidates(): readonly AnimationEntry[] {
			return idleCandidates;
		},
		get base(): Readonly<BaseBehavior> {
			return base;
		},
		get idlePoolUrls(): readonly string[] {
			return idlePoolUrls;
		},
		get thinkingUrl(): string | null {
			return thinkingUrl;
		},
		setIdlePool,
		setThinkingId,
		get enabledForLlm(): readonly AnimationEntry[] {
			return enabledForLlm;
		},
		get: (id: string) => entries.find((e) => e.id === id),
		addFromFile,
		update,
		remove,
		ready
	};
}

export const animationLibraryStore = createAnimationLibraryStore();

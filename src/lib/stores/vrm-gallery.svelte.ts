import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import localforage from 'localforage';
import { isTauri } from '$lib/services/platform/platform';
import { createTempVrmStoreIntegration } from '$lib/utils/temp-vrm-store';
import { isQuotaError, STORAGE_FULL_MESSAGE } from '$lib/services/storage/quota';

export interface VrmModel {
	id: string;
	name: string;
	url: string;
	previewUrl?: string;
	isDefault: boolean;
	createdAt: number;
}

// Default models bundled with the app (first one is loaded by default).
// See static/models/README.md for each model's license.
const DEFAULT_MODELS: VrmModel[] = [
	{
		id: 'default-sample-b',
		name: 'Tsuki',
		url: '/models/AvatarSample_B.vrm',
		previewUrl: undefined,
		isDefault: true,
		createdAt: 0
	},
	{
		id: 'default-vita',
		name: 'Yuki',
		url: '/models/Vita.vrm',
		previewUrl: undefined,
		isDefault: true,
		createdAt: 0
	},
	{
		id: 'default-victoria',
		name: 'Momo',
		url: '/models/Victoria_Rubin.vrm',
		previewUrl: undefined,
		isDefault: true,
		createdAt: 0
	}
];

// Bumped when thumbnail generation changes so stale previews regenerate
const PREVIEW_KEY_PREFIX = 'model-preview-v2-';

// Configure localforage for VRM storage
const vrmStorage = browser
	? localforage.createInstance({ ...STORAGE_INVENTORY.localforage.vrm })
	: null;

function createVrmGalleryStore() {
	// The url to render - null until initFromStorage determines the correct model
	let modelUrl = $state<string | null>(null);
	let models = $state<VrmModel[]>([...DEFAULT_MODELS]);
	let activeModelId = $state<string | null>(DEFAULT_MODELS[0].id);

	// ── Temporary model (for Developer Tools preview) ──
	// Kept in memory only; never persisted to storage.
	const tempVrm = createTempVrmStoreIntegration();
	let tempModelActive = $state(false);
	let tempModelLoading = $state(false);
	let tempModelLoadError = $state(false);

	// Reactive bridge between the integration helper and the store's $state.
	const tempState = {
		get modelUrl() {
			return modelUrl;
		},
		set modelUrl(value: string | null) {
			modelUrl = value;
		},
		get activeModelId() {
			return activeModelId;
		},
		set activeModelId(value: string | null) {
			activeModelId = value;
		},
		// The runtime store clears its own expression list when a preview starts
		get availableExpressions(): string[] {
			return [];
		},
		set availableExpressions(_value: string[]) {},
		get tempModelActive() {
			return tempModelActive;
		},
		set tempModelActive(value: boolean) {
			tempModelActive = value;
		},
		get tempModelLoading() {
			return tempModelLoading;
		},
		set tempModelLoading(value: boolean) {
			tempModelLoading = value;
		},
		get tempModelLoadError() {
			return tempModelLoadError;
		},
		set tempModelLoadError(value: boolean) {
			tempModelLoadError = value;
		}
	};

	// Guard against saveToStorage running before init completes
	let storageReady = false;
	let saveBlockedDuringInit = false;
	// Lets consumers wait for init so they don't act on pre-restore state
	let readyResolve: (() => void) | null = null;
	const ready = new Promise<void>((resolve) => {
		readyResolve = resolve;
	});
	// Prevents re-emitting sync events when handling incoming ones
	let isSyncing = false;
	// Held so the handler can be released (HMR re-runs this module in dev;
	// without it each run would stack another duplicate listener)
	let modelChangedUnlisten: Promise<(() => void) | undefined> | null = null;

	// Initialize from storage (may override defaults with saved values)
	if (browser) {
		initFromStorage();

		// Sync model changes from other Tauri windows
		if (isTauri()) {
			modelChangedUnlisten = import('@tauri-apps/api/event').then(({ listen }) =>
				listen('vrm:model-changed', async () => {
					// Drop events that arrive while a sync is already running
					if (isSyncing) return;
					isSyncing = true;
					try {
						await syncActiveModel();
					} finally {
						isSyncing = false;
					}
				})
			);
		}

		if (import.meta.hot) {
			import.meta.hot.dispose(() => {
				modelChangedUnlisten?.then((unlisten) => unlisten?.());
				modelChangedUnlisten = null;
			});
		}
	}

	async function initFromStorage() {
		try {
			// Load saved models list
			const savedModels = await vrmStorage?.getItem<VrmModel[]>('model-list');
			if (savedModels && savedModels.length > 0) {
				const customModels = savedModels.filter((m) => !m.isDefault);

				// Load all blobs concurrently; users with several custom models were
				// paying one storage round-trip per model at boot
				const blobs = await Promise.all(
					customModels.map((model) => vrmStorage?.getItem<Blob>(`model-blob-${model.id}`))
				);
				const restored: VrmModel[] = [];
				customModels.forEach((model, i) => {
					const blob = blobs[i];
					// Regenerate blob URL from stored blob data
					if (blob) {
						restored.push({
							...model,
							url: URL.createObjectURL(blob)
						});
					}
					// If blob is missing, skip this model (unrecoverable)
				});

				models = [...DEFAULT_MODELS, ...restored];
			}

			// Restore preview thumbnails for all models (also concurrent)
			const previews = await Promise.all(
				models.map((model) => vrmStorage?.getItem<string>(`${PREVIEW_KEY_PREFIX}${model.id}`))
			);
			models = models.map((model, i) =>
				previews[i] ? { ...model, previewUrl: previews[i] } : model
			);

			// Load active model ID
			const savedActiveId = await vrmStorage?.getItem<string>('active-model-id');
			if (savedActiveId) {
				const activeModel = models.find((m) => m.id === savedActiveId);
				if (activeModel) {
					activeModelId = savedActiveId;
					modelUrl = activeModel.url;
				} else {
					activeModelId = DEFAULT_MODELS[0].id;
					modelUrl = DEFAULT_MODELS[0].url;
					await vrmStorage?.removeItem('active-model-id');
				}
			} else {
				activeModelId = DEFAULT_MODELS[0].id;
				modelUrl = DEFAULT_MODELS[0].url;
			}
		} catch (e) {
			console.error('Failed to load VRM storage:', e);
			activeModelId = DEFAULT_MODELS[0].id;
			modelUrl = DEFAULT_MODELS[0].url;
		}
		storageReady = true;
		readyResolve?.();
		// Flush any saves that were blocked during init. Skipped otherwise so a
		// fresh or just-cleared device doesn't write defaults on every boot.
		if (saveBlockedDuringInit) await saveToStorage();
	}

	async function saveToStorage() {
		if (!storageReady) saveBlockedDuringInit = true;
		if (!vrmStorage || !storageReady || !tempVrm.canSave(tempState)) return;
		try {
			// Save custom models (not defaults); strip blob URLs since they're ephemeral
			const customModels = models
				.filter((m) => !m.isDefault)
				.map(({ url, previewUrl, ...rest }) => rest);
			await vrmStorage.setItem('model-list', customModels);
			await vrmStorage.setItem('active-model-id', activeModelId);
		} catch (e) {
			console.error('Failed to save VRM storage:', e);
		}
	}

	async function setActiveModel(id: string) {
		const model = models.find((m) => m.id === id);
		if (model) {
			activeModelId = id;
			modelUrl = model.url;
			await saveToStorage();
			broadcastModelChange();
		}
	}

	async function broadcastModelChange() {
		if (!isTauri() || isSyncing) return;
		const { emit } = await import('@tauri-apps/api/event');
		emit('vrm:model-changed');
	}

	async function syncActiveModel() {
		if (!storageReady || tempModelActive) return;
		const savedActiveId = await vrmStorage?.getItem<string>('active-model-id');
		if (!savedActiveId || savedActiveId === activeModelId) return;

		// Check if model exists in our list already
		const model = models.find((m) => m.id === savedActiveId);
		if (model) {
			activeModelId = savedActiveId;
			modelUrl = model.url;
		} else {
			// New custom model added in another window: full re-init
			await initFromStorage();
		}
	}

	async function addModel(file: File, previewDataUrl?: string): Promise<void> {
		const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		const name = file.name.replace(/\.vrm$/i, '');

		// Store the file blob
		const blob = new Blob([await file.arrayBuffer()], { type: 'model/vrm' });
		try {
			await vrmStorage?.setItem(`model-blob-${id}`, blob);
		} catch (e) {
			throw isQuotaError(e) ? new Error(STORAGE_FULL_MESSAGE, { cause: e }) : e;
		}

		// Create blob URL for immediate use
		const url = URL.createObjectURL(blob);

		const newModel: VrmModel = {
			id,
			name,
			url,
			previewUrl: previewDataUrl,
			isDefault: false,
			createdAt: Date.now()
		};

		models = [...models, newModel];
		await saveToStorage();

		// Store preview if provided
		if (previewDataUrl) {
			await vrmStorage?.setItem(`${PREVIEW_KEY_PREFIX}${id}`, previewDataUrl);
		}
	}

	async function removeModel(id: string): Promise<void> {
		const model = models.find((m) => m.id === id);
		if (!model || model.isDefault) return;

		// Revoke blob URL to free memory
		if (model.url.startsWith('blob:')) {
			URL.revokeObjectURL(model.url);
		}

		// Remove from storage
		await vrmStorage?.removeItem(`model-blob-${id}`);
		await vrmStorage?.removeItem(`${PREVIEW_KEY_PREFIX}${id}`);

		// Remove from list
		models = models.filter((m) => m.id !== id);

		// If this was the active model, switch to default
		if (activeModelId === id) {
			setActiveModel(DEFAULT_MODELS[0].id);
		}

		await saveToStorage();
	}

	function getActiveModel(): VrmModel | null {
		return models.find((m) => m.id === activeModelId) || null;
	}

	async function setModelPreview(modelId: string | null, previewDataUrl: string): Promise<void> {
		if (!modelId) return;

		// Update in models array
		const modelIndex = models.findIndex((m) => m.id === modelId);
		if (modelIndex !== -1) {
			models[modelIndex] = { ...models[modelIndex], previewUrl: previewDataUrl };
			// Trigger reactivity
			models = [...models];
		}

		// Save to storage for all models (including defaults) so thumbnails persist
		await vrmStorage?.setItem(`${PREVIEW_KEY_PREFIX}${modelId}`, previewDataUrl);
	}

	return {
		get modelUrl() {
			return modelUrl;
		},
		get models() {
			return models;
		},
		get activeModelId() {
			return activeModelId;
		},
		get tempModelActive() {
			return tempModelActive;
		},
		get tempModelLoading() {
			return tempModelLoading;
		},
		get tempModelLoadError() {
			return tempModelLoadError;
		},
		setActiveModel,
		addModel,
		removeModel,
		getActiveModel,
		setModelPreview,
		// Use vrmStore.loadTempModel / restoreOriginalModel; they also reset runtime state
		loadTempModel: (file: File) => tempVrm.load(tempState, file),
		restoreOriginalModel: () => tempVrm.restore(tempState, models, DEFAULT_MODELS),
		// The runtime store reports load outcomes so a temp preview can settle
		onLoadingFinished: () => tempVrm.onLoadingFinished(tempState),
		onLoadError: () => tempVrm.onError(tempState),
		whenReady: () => ready
	};
}

export const vrmGalleryStore = createVrmGalleryStore();

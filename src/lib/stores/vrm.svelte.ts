import { browser } from '$app/environment';
import type { VRM } from '@pixiv/three-vrm';
import localforage from 'localforage';
import { isTauri } from '$lib/services/platform/platform';
import { createTempVrmStoreIntegration } from '$lib/utils/temp-vrm-store';
import type { TouchZone } from '$lib/engine/photo-reactions';
import { animationLibraryStore } from './animation-library.svelte';

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
	? localforage.createInstance({
			name: 'utsuwa-vrm',
			storeName: 'models'
		})
	: null;

function createVrmStore() {
	// Current model state - null until initFromStorage determines the correct model
	let modelUrl = $state<string | null>(null);
	let vrm = $state<VRM | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let errorTimeout: ReturnType<typeof setTimeout> | null = null;

	// Gallery state
	let models = $state<VrmModel[]>([...DEFAULT_MODELS]);
	let activeModelId = $state<string | null>(DEFAULT_MODELS[0].id);

	// Available expressions on current model (persists across navigation)
	let availableExpressions = $state<string[]>([]);

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
		get availableExpressions() {
			return availableExpressions;
		},
		set availableExpressions(value: string[]) {
			availableExpressions = value;
		},
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

	// Animation state
	let currentAnimation = $state<string | null>(null);

	// Talking animation state (triggered by text output)
	let isTalking = $state(false);
	let talkingTimeout: ReturnType<typeof setTimeout> | null = null;

	// Tap reactions: the scene raycasts a tap into a touch zone and the model
	// component applies the staged reaction. Universal, not photo-mode-only.
	let reactionRequest = $state<{ zone: TouchZone; seq: number } | null>(null);
	let reactionSeq = 0;
	function requestReaction(zone: TouchZone) {
		reactionRequest = { zone, seq: ++reactionSeq };
	}

	// Head position for 3D speech bubble positioning
	let headPosition = $state<[number, number, number]>([0, 1.6, 0]);
	// Screen-space position (x, y as percentages 0-100)
	let headScreenPosition = $state<{ x: number; y: number } | null>(null);
	// Default animations
	const idleAnimationUrl = '/animations/idle.vrma';
	const talkingAnimationUrl = '/animations/talking.vrma';

	// All idle animations for random cycling
	const idleAnimationUrls = [
		'/animations/idle.vrma',
		'/animations/idle_2.vrma',
		'/animations/idle_3.vrma',
		'/animations/idle_4.vrma',
		'/animations/idle_5.vrma'
	];

	// Guard against saveToStorage running before init completes
	let storageReady = false;
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
		// Flush any saves that were blocked during init
		await saveToStorage();
	}

	async function saveToStorage() {
		if (!vrmStorage || !storageReady || !tempVrm.canSave(tempState)) return;
		try {
			// Save custom models (not defaults) — strip blob URLs since they're ephemeral
			const customModels = models
				.filter((m) => !m.isDefault)
				.map(({ url, previewUrl, ...rest }) => rest);
			await vrmStorage.setItem('model-list', customModels);
			await vrmStorage.setItem('active-model-id', activeModelId);
		} catch (e) {
			console.error('Failed to save VRM storage:', e);
		}
	}

	function setModelUrl(url: string | null) {
		modelUrl = url;
		error = null;
	}

	function setVrm(instance: VRM | null) {
		vrm = instance;
		// Store available expressions when VRM is set
		if (instance?.expressionManager) {
			availableExpressions = instance.expressionManager.expressions.map((e) => e.expressionName);
		}
	}

	function setLoading(loading: boolean) {
		isLoading = loading;
		if (!loading) {
			// The temporary model has finished parsing (or gave up).
			tempVrm.onLoadingFinished(tempState);
		}
	}

	function clearError() {
		if (errorTimeout) {
			clearTimeout(errorTimeout);
			errorTimeout = null;
		}
		error = null;
	}

	function setError(err: string | null) {
		clearError();
		// Track temp-load failures separately from other errors so the Developer
		// page can restore the original avatar without catching unrelated errors.
		if (err) {
			tempVrm.onError(tempState);
		}
		error = err;
		isLoading = false;
		// Auto-dismiss after 5 seconds if error is set
		if (err) {
			errorTimeout = setTimeout(() => {
				error = null;
				errorTimeout = null;
			}, 5000);
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
			// New custom model added in another window — full re-init
			await initFromStorage();
		}
	}

	// These run every frame from the render loop. Skip the reactive write when the
	// value hasn't meaningfully moved, so a near-still model doesn't churn every
	// $derived bound to head position 60×/sec.
	function setHeadPosition(pos: [number, number, number]) {
		const p = headPosition;
		if (Math.abs(p[0] - pos[0]) < 0.001 && Math.abs(p[1] - pos[1]) < 0.001 && Math.abs(p[2] - pos[2]) < 0.001) {
			return;
		}
		headPosition = pos;
	}

	function setHeadScreenPosition(pos: { x: number; y: number } | null) {
		const p = headScreenPosition;
		if (pos && p && Math.abs(p.x - pos.x) < 0.05 && Math.abs(p.y - pos.y) < 0.05) {
			return;
		}
		headScreenPosition = pos;
	}

	// Takes a library id or url (custom uploads are blob: urls), or a direct path
	function setCurrentAnimation(animationIdOrPath: string | null) {
		if (animationIdOrPath === null || animationIdOrPath === 'none') {
			currentAnimation = null;
			return;
		}
		const anim = animationLibraryStore.playable.find(
			(a) => a.id === animationIdOrPath || a.url === animationIdOrPath
		);
		currentAnimation = anim?.url ?? (animationIdOrPath.startsWith('/') ? animationIdOrPath : null);
	}

	// Start talking animation based on text length
	// Estimates ~15 characters per second of speaking
	function startTalking(text: string) {
		// Clear any existing timeout
		if (talkingTimeout) {
			clearTimeout(talkingTimeout);
		}

		// Calculate duration: ~15 chars/sec, minimum 1 second
		const charsPerSecond = 15;
		const duration = Math.max(1, text.length / charsPerSecond) * 1000;

		isTalking = true;

		// Auto-stop after estimated duration
		talkingTimeout = setTimeout(() => {
			isTalking = false;
			talkingTimeout = null;
		}, duration);
	}

	// Stop talking animation immediately
	function stopTalking() {
		if (talkingTimeout) {
			clearTimeout(talkingTimeout);
			talkingTimeout = null;
		}
		isTalking = false;
	}

	function loadTempModel(file: File): void {
		tempVrm.load(tempState, file);
	}

	function restoreOriginalModel(): void {
		// Clear any earlier temp-load error so a successful restore does not
		// keep a stale "Failed to parse VRM" message on screen.
		clearError();
		tempVrm.restore(tempState, models, DEFAULT_MODELS);
		// Defensive: if neither the original nor any default could be restored,
		// surface an error instead of leaving the viewport blank silently.
		if (!tempModelActive && activeModelId === null && modelUrl === null) {
			setError('No VRM model available to restore.');
		}
	}

	async function addModel(file: File, previewDataUrl?: string): Promise<void> {
		const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		const name = file.name.replace(/\.vrm$/i, '');

		// Store the file blob
		const blob = new Blob([await file.arrayBuffer()], { type: 'model/vrm' });
		await vrmStorage?.setItem(`model-blob-${id}`, blob);

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
		get vrm() {
			return vrm;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		get models() {
			return models;
		},
		get activeModelId() {
			return activeModelId;
		},
		get availableExpressions() {
			return availableExpressions;
		},
		get currentAnimation() {
			return currentAnimation;
		},
		// One-shot emotes: the built-ins plus the user's uploads
		get availableAnimations() {
			return animationLibraryStore.playable;
		},
		get idleAnimationUrl() {
			return idleAnimationUrl;
		},
		get idleAnimationUrls() {
			return idleAnimationUrls;
		},
		get talkingAnimationUrl() {
			return talkingAnimationUrl;
		},
		get isTalking() {
			return isTalking;
		},
		get reactionRequest() {
			return reactionRequest;
		},
		requestReaction,
		get headPosition() {
			return headPosition;
		},
		get headScreenPosition() {
			return headScreenPosition;
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
		setModelUrl,
		setHeadPosition,
		setHeadScreenPosition,
		setVrm,
		setLoading,
		setError,
		setActiveModel,
		setCurrentAnimation,
		startTalking,
		stopTalking,
		addModel,
		removeModel,
		getActiveModel,
		setModelPreview,
		loadTempModel,
		restoreOriginalModel,
		whenReady: () => ready
	};
}

export const vrmStore = createVrmStore();

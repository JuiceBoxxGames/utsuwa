import type { VRM } from '@pixiv/three-vrm';
import type { TouchZone } from '$lib/engine/photo-reactions';
import { animationLibraryStore } from './animation-library.svelte';
import { vrmGalleryStore } from './vrm-gallery.svelte';
import type { Emotion } from '$lib/types/character';

// Runtime state of the loaded avatar. The saved models, selection, and
// thumbnails live in vrmGalleryStore.
function createVrmStore() {
	let vrm = $state<VRM | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Available expressions on current model (persists across navigation)
	let availableExpressions = $state<string[]>([]);

	// Animation state
	let currentAnimation = $state<string | null>(null);

	// Talking animation state (triggered by text output)
	let isTalking = $state(false);
	let talkingTimeout: ReturnType<typeof setTimeout> | null = null;

	// Request in flight and no reply text yet
	let isThinking = $state(false);
	function setThinking(value: boolean) {
		isThinking = value;
	}

	// Tap reactions: the scene raycasts a tap into a touch zone and the model
	// component applies the staged reaction. Universal, not photo-mode-only.
	let reactionRequest = $state<{ zone: TouchZone; seq: number } | null>(null);
	let reactionSeq = 0;
	function requestReaction(zone: TouchZone) {
		reactionRequest = { zone, seq: ++reactionSeq };
	}

	// Brief expression the model asked for; same request pattern as reactions
	let flashRequest = $state<{ emotion: Emotion; seq: number } | null>(null);
	let flashSeq = 0;
	function requestFlash(emotion: Emotion) {
		flashRequest = { emotion, seq: ++flashSeq };
	}

	// Head position for 3D speech bubble positioning
	let headPosition = $state<[number, number, number]>([0, 1.6, 0]);
	// Screen-space position (x, y as percentages 0-100)
	let headScreenPosition = $state<{ x: number; y: number } | null>(null);
	const talkingAnimationUrl = '/animations/talking.vrma';

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
			vrmGalleryStore.onLoadingFinished();
		}
	}

	function clearError() {
		error = null;
	}

	function setError(err: string | null) {
		clearError();
		// Track temp-load failures separately from other errors so the Developer
		// page can restore the original avatar without catching unrelated errors.
		if (err) {
			vrmGalleryStore.onLoadError();
		}
		error = err;
		isLoading = false;
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
		availableExpressions = [];
		vrmGalleryStore.loadTempModel(file);
	}

	function restoreOriginalModel(): void {
		// Clear any earlier temp-load error so a successful restore does not
		// keep a stale "Failed to parse VRM" message on screen.
		clearError();
		vrmGalleryStore.restoreOriginalModel();
		// Defensive: if neither the original nor any default could be restored,
		// surface an error instead of leaving the viewport blank silently.
		const gallery = vrmGalleryStore;
		if (!gallery.tempModelActive && gallery.activeModelId === null && gallery.modelUrl === null) {
			setError('No VRM model available to restore.');
		}
	}

	return {
		get vrm() {
			return vrm;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
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
		// The user's idle pool, or all five built-ins when it is empty
		get idleAnimationUrls() {
			return animationLibraryStore.idlePoolUrls;
		},
		get idleAnimationUrl() {
			return animationLibraryStore.idlePoolUrls[0];
		},
		get talkingAnimationUrl() {
			return talkingAnimationUrl;
		},
		get isTalking() {
			return isTalking;
		},
		get isThinking() {
			return isThinking;
		},
		setThinking,
		get reactionRequest() {
			return reactionRequest;
		},
		requestReaction,
		get flashRequest() {
			return flashRequest;
		},
		requestFlash,
		get headPosition() {
			return headPosition;
		},
		get headScreenPosition() {
			return headScreenPosition;
		},
		setHeadPosition,
		setHeadScreenPosition,
		setVrm,
		setLoading,
		setError,
		setCurrentAnimation,
		startTalking,
		stopTalking,
		loadTempModel,
		restoreOriginalModel
	};
}

export const vrmStore = createVrmStore();

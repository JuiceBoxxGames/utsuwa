import { browser } from '$app/environment';
import { clampPhysicsIntensity, PHYSICS_INTENSITY_DEFAULT } from '../engine/spring-physics.ts';
import {
	CAMERA_DEFAULTS,
	CAMERA_LIMITS,
	DEFAULT_CHAT_DISPLAY_MODE,
	DEFAULT_SIDEBAR_POSITION,
	DEFAULT_TYPING_INDICATOR_DELAY_MS,
	DEFAULT_WAIT_TONE_ENABLED,
	DEFAULT_TEXT_REVEAL_SPEED,
	DEFAULT_CHAT_BAR_ALIGNMENT,
	REVEAL_SPEED_MS,
	type CameraSettings,
	type CameraProfile,
	type ChatDisplayMode,
	type SidebarPosition,
	type TextRevealSpeed,
	type ChatBarAlignment
} from './display-types';
import { parseDisplaySettings, sanitizeCamera } from './display-parser';
import {
	resetChatDisplay as computeResetChatDisplay,
	setChatDisplayMode as computeSetChatDisplayMode,
	setSidebarPosition as computeSetSidebarPosition
} from './display-store-logic';
import {
	sanitizeSceneBackground,
	type SceneBackground
} from '../services/scene-backgrounds.ts';

const STORAGE_KEY = 'utsuwa-display';

export type { CameraSettings, CameraProfile, ChatDisplayMode, SidebarPosition, TextRevealSpeed, ChatBarAlignment };
export {
	CAMERA_DEFAULTS,
	CAMERA_LIMITS,
	DEFAULT_CHAT_DISPLAY_MODE,
	DEFAULT_SIDEBAR_POSITION,
	DEFAULT_TYPING_INDICATOR_DELAY_MS,
	DEFAULT_WAIT_TONE_ENABLED,
	DEFAULT_TEXT_REVEAL_SPEED,
	DEFAULT_CHAT_BAR_ALIGNMENT,
	REVEAL_SPEED_MS
};

function createDisplayStore() {
	// The main scene and the desktop overlay window frame very differently,
	// so each keeps its own camera profile
	let camera = $state<CameraSettings>({ ...CAMERA_DEFAULTS });
	let overlayCamera = $state<CameraSettings>({ ...CAMERA_DEFAULTS });
	// One physics intensity for both surfaces: it's a model-feel setting, not framing
	let physicsIntensity = $state(PHYSICS_INTENSITY_DEFAULT);
	// Persistent backdrop for the regular scene ('default' = the theme backdrop)
	let sceneBackground = $state<SceneBackground>({ type: 'default' });

	// Chat display mode and sidebar docking
	let chatDisplayMode = $state<ChatDisplayMode>(DEFAULT_CHAT_DISPLAY_MODE);
	let sidebarPosition = $state<SidebarPosition>(DEFAULT_SIDEBAR_POSITION);
	// Optional delay before the typing indicator appears
	let typingIndicatorDelayMs = $state(DEFAULT_TYPING_INDICATOR_DELAY_MS);
	// Optional soft audio ping while the companion is thinking
	let waitToneEnabled = $state(DEFAULT_WAIT_TONE_ENABLED);
	// Word-by-word reveal cadence for replies
	let textRevealSpeed = $state<TextRevealSpeed>(DEFAULT_TEXT_REVEAL_SPEED);
	// Where the floating bar sits along the bottom edge
	let chatBarAlignment = $state<ChatBarAlignment>(DEFAULT_CHAT_BAR_ALIGNMENT);
	let keepScreenAwake = $state(false);

	function applySavedSettings(saved: string | null) {
		const parsed = parseDisplaySettings(saved);
		camera = parsed.camera;
		overlayCamera = parsed.overlayCamera;
		physicsIntensity = parsed.physicsIntensity;
		sceneBackground = parsed.sceneBackground;
		chatDisplayMode = parsed.chatDisplayMode;
		sidebarPosition = parsed.sidebarPosition;
		typingIndicatorDelayMs = parsed.typingIndicatorDelayMs;
		waitToneEnabled = parsed.waitToneEnabled;
		textRevealSpeed = parsed.textRevealSpeed;
		chatBarAlignment = parsed.chatBarAlignment;
		keepScreenAwake = parsed.keepScreenAwake;
	}
	if (browser) {
		applySavedSettings(localStorage.getItem(STORAGE_KEY));
		// Keep open browser tabs and the desktop overlay from saving stale settings.
		window.addEventListener('storage', (event) => {
			if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null)) {
				applySavedSettings(event.key === null ? null : event.newValue);
			}
		});
	}

	function save() {
		if (browser) {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					camera: $state.snapshot(camera),
					overlayCamera: $state.snapshot(overlayCamera),
					physicsIntensity,
					sceneBackground: $state.snapshot(sceneBackground),
					chatDisplayMode,
					sidebarPosition,
					typingIndicatorDelayMs,
					waitToneEnabled,
					textRevealSpeed,
					chatBarAlignment,
					keepScreenAwake
				})
			);
		}
	}

	function setCamera(update: Partial<CameraSettings>, profile: CameraProfile = 'main') {
		const current = profile === 'overlay' ? overlayCamera : camera;
		const next = sanitizeCamera({ ...current, ...update });
		if (profile === 'overlay') {
			overlayCamera = next;
		} else {
			camera = next;
		}
		save();
	}

	function resetCamera(profile: CameraProfile = 'main') {
		if (profile === 'overlay') {
			overlayCamera = { ...CAMERA_DEFAULTS };
		} else {
			camera = { ...CAMERA_DEFAULTS };
		}
		save();
	}

	function setPhysicsIntensity(value: number) {
		physicsIntensity = clampPhysicsIntensity(value);
		save();
	}

	function setSceneBackground(bg: SceneBackground) {
		sceneBackground = sanitizeSceneBackground(bg);
		save();
	}

	function setChatDisplayMode(mode: ChatDisplayMode) {
		const next = computeSetChatDisplayMode({ chatDisplayMode, sidebarPosition }, mode);
		chatDisplayMode = next.chatDisplayMode;
		sidebarPosition = next.sidebarPosition;
		save();
	}

	function setSidebarPosition(pos: SidebarPosition) {
		const next = computeSetSidebarPosition({ chatDisplayMode, sidebarPosition }, pos);
		chatDisplayMode = next.chatDisplayMode;
		sidebarPosition = next.sidebarPosition;
		save();
	}

	function resetChatDisplay() {
		const next = computeResetChatDisplay();
		chatDisplayMode = next.chatDisplayMode;
		sidebarPosition = next.sidebarPosition;
		typingIndicatorDelayMs = DEFAULT_TYPING_INDICATOR_DELAY_MS;
		waitToneEnabled = DEFAULT_WAIT_TONE_ENABLED;
		textRevealSpeed = DEFAULT_TEXT_REVEAL_SPEED;
		chatBarAlignment = DEFAULT_CHAT_BAR_ALIGNMENT;
		save();
	}

	function setTextRevealSpeed(speed: TextRevealSpeed) {
		textRevealSpeed = speed;
		save();
	}

	function setChatBarAlignment(alignment: ChatBarAlignment) {
		chatBarAlignment = alignment;
		save();
	}

	function setTypingIndicatorDelayMs(ms: number) {
		if (Number.isNaN(ms)) return;
		typingIndicatorDelayMs = Math.max(0, Math.min(10000, ms));
		save();
	}

	function setWaitToneEnabled(enabled: boolean) {
		waitToneEnabled = enabled;
		save();
	}

	return {
		get keepScreenAwake() { return keepScreenAwake; },
		setKeepScreenAwake(value: boolean) { keepScreenAwake = value; save(); },
		get camera() {
			return camera;
		},
		get overlayCamera() {
			return overlayCamera;
		},
		get physicsIntensity() {
			return physicsIntensity;
		},
		get sceneBackground() {
			return sceneBackground;
		},
		get chatDisplayMode() {
			return chatDisplayMode;
		},
		get sidebarPosition() {
			return sidebarPosition;
		},
		get typingIndicatorDelayMs() {
			return typingIndicatorDelayMs;
		},
		get waitToneEnabled() {
			return waitToneEnabled;
		},
		get textRevealSpeed() {
			return textRevealSpeed;
		},
		get chatBarAlignment() {
			return chatBarAlignment;
		},
		setCamera,
		resetCamera,
		setPhysicsIntensity,
		setSceneBackground,
		setChatDisplayMode,
		setSidebarPosition,
		resetChatDisplay,
		setTypingIndicatorDelayMs,
		setWaitToneEnabled,
		setTextRevealSpeed,
		setChatBarAlignment
	};
}

export const displayStore = createDisplayStore();

import { clampPhysicsIntensity, PHYSICS_INTENSITY_DEFAULT } from '../engine/spring-physics.ts';
import {
	sanitizeSceneBackground,
	type SceneBackground
} from '../services/scene-backgrounds.ts';
import {
	CAMERA_DEFAULTS,
	CAMERA_LIMITS,
	DEFAULT_CHAT_DISPLAY_MODE,
	DEFAULT_SIDEBAR_POSITION,
	DEFAULT_TYPING_INDICATOR_DELAY_MS,
	DEFAULT_WAIT_TONE_ENABLED,
	DEFAULT_TEXT_REVEAL_SPEED,
	DEFAULT_CHAT_BAR_ALIGNMENT,
	type CameraSettings,
	type ChatDisplayMode,
	type SidebarPosition,
	type TextRevealSpeed,
	type ChatBarAlignment
} from './display-types.ts';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function sanitizeCamera(raw: Partial<CameraSettings> | undefined): CameraSettings {
	const value = (key: keyof CameraSettings) => {
		const v = raw?.[key];
		return typeof v === 'number' && Number.isFinite(v)
			? clamp(v, CAMERA_LIMITS[key].min, CAMERA_LIMITS[key].max)
			: CAMERA_DEFAULTS[key];
	};
	return { fov: value('fov'), zoom: value('zoom'), height: value('height'), panX: value('panX') };
}

function isChatDisplayMode(value: unknown): value is ChatDisplayMode {
	return value === 'bubble' || value === 'sidebar';
}

function isSidebarPosition(value: unknown): value is SidebarPosition {
	return value === 'left' || value === 'right';
}

function isTextRevealSpeed(value: unknown): value is TextRevealSpeed {
	return value === 'off' || value === 'slow' || value === 'normal' || value === 'fast';
}

function isChatBarAlignment(value: unknown): value is ChatBarAlignment {
	return value === 'left' || value === 'center' || value === 'right';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export interface ParsedDisplaySettings {
	camera: CameraSettings;
	overlayCamera: CameraSettings;
	physicsIntensity: number;
	sceneBackground: SceneBackground;
	chatDisplayMode: ChatDisplayMode;
	sidebarPosition: SidebarPosition;
	waitToneEnabled: boolean;
	typingIndicatorDelayMs: number;
	textRevealSpeed: TextRevealSpeed;
	chatBarAlignment: ChatBarAlignment;
	keepScreenAwake: boolean;
	moodExpressions: boolean;
}

/**
 * Parse a raw JSON value from localStorage into a validated display settings object.
 * Unknown or missing fields are replaced with sensible defaults.
 */
export function parseDisplaySettings(raw: unknown): ParsedDisplaySettings {
	let parsed: Record<string, unknown> | null = null;
	if (typeof raw === 'string') {
		try {
			const parsedValue = JSON.parse(raw);
			parsed = isPlainObject(parsedValue) ? parsedValue : null;
		} catch (e) {
			console.warn('Failed to parse display settings, falling back to defaults:', e);
			parsed = null;
		}
	} else if (isPlainObject(raw)) {
		parsed = raw;
	}

	if (!parsed) {
		return {
			camera: { ...CAMERA_DEFAULTS },
			overlayCamera: { ...CAMERA_DEFAULTS },
			physicsIntensity: PHYSICS_INTENSITY_DEFAULT,
			sceneBackground: sanitizeSceneBackground(undefined),
			chatDisplayMode: DEFAULT_CHAT_DISPLAY_MODE,
			sidebarPosition: DEFAULT_SIDEBAR_POSITION,
			waitToneEnabled: DEFAULT_WAIT_TONE_ENABLED,
			typingIndicatorDelayMs: DEFAULT_TYPING_INDICATOR_DELAY_MS,
			textRevealSpeed: DEFAULT_TEXT_REVEAL_SPEED,
			chatBarAlignment: DEFAULT_CHAT_BAR_ALIGNMENT,
			keepScreenAwake: false,
			moodExpressions: true
		};
	}

	let camera: CameraSettings;
	let overlayCamera: CameraSettings;

	if (parsed.camera && typeof parsed.camera === 'object') {
		camera = sanitizeCamera(parsed.camera as Partial<CameraSettings>);
		// If only the main camera is stored, mirror it to the overlay so both
		// surfaces start with the same look instead of silently resetting one.
		overlayCamera =
			parsed.overlayCamera && typeof parsed.overlayCamera === 'object'
				? sanitizeCamera(parsed.overlayCamera as Partial<CameraSettings>)
				: { ...camera };
	} else if (typeof parsed.cameraDistance === 'number') {
		// Legacy setting predating auto-fit: old default distance was 2.0
		const legacyCamera = sanitizeCamera({ zoom: 2.0 / parsed.cameraDistance });
		camera = legacyCamera;
		overlayCamera = { ...legacyCamera };
	} else {
		camera = { ...CAMERA_DEFAULTS };
		overlayCamera = { ...CAMERA_DEFAULTS };
	}

	let physicsIntensity = PHYSICS_INTENSITY_DEFAULT;
	if (typeof parsed.physicsIntensity === 'number') {
		physicsIntensity = clampPhysicsIntensity(parsed.physicsIntensity);
	}

	const sceneBackground = sanitizeSceneBackground(parsed.sceneBackground);

	const chatDisplayMode = parsed.chatDisplayMode === 'both' ? 'sidebar' : isChatDisplayMode(parsed.chatDisplayMode)
		? parsed.chatDisplayMode
		: DEFAULT_CHAT_DISPLAY_MODE;

	const sidebarPosition = isSidebarPosition(parsed.sidebarPosition)
		? parsed.sidebarPosition
		: DEFAULT_SIDEBAR_POSITION;

	const waitToneEnabled =
		typeof parsed.waitToneEnabled === 'boolean'
			? parsed.waitToneEnabled
			: DEFAULT_WAIT_TONE_ENABLED;

	let typingIndicatorDelayMs = DEFAULT_TYPING_INDICATOR_DELAY_MS;
	if (typeof parsed.typingIndicatorDelayMs === 'number' && !Number.isNaN(parsed.typingIndicatorDelayMs)) {
		typingIndicatorDelayMs = Math.max(0, Math.min(10000, parsed.typingIndicatorDelayMs));
	}

	const textRevealSpeed = isTextRevealSpeed(parsed.textRevealSpeed)
		? parsed.textRevealSpeed
		: DEFAULT_TEXT_REVEAL_SPEED;

	const chatBarAlignment = isChatBarAlignment(parsed.chatBarAlignment)
		? parsed.chatBarAlignment
		: DEFAULT_CHAT_BAR_ALIGNMENT;

	return { keepScreenAwake: parsed.keepScreenAwake === true, moodExpressions: parsed.moodExpressions !== false, camera, overlayCamera, physicsIntensity, sceneBackground, chatDisplayMode, sidebarPosition, waitToneEnabled, typingIndicatorDelayMs, textRevealSpeed, chatBarAlignment };
}

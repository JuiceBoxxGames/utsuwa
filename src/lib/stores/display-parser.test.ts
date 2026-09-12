import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDisplaySettings, sanitizeCamera } from './display-parser.ts';
import { PHYSICS_INTENSITY_DEFAULT } from '../engine/spring-physics.ts';
import {
	CAMERA_DEFAULTS,
	CAMERA_LIMITS,
	DEFAULT_CHAT_DISPLAY_MODE,
	DEFAULT_SIDEBAR_POSITION,
	DEFAULT_TYPING_INDICATOR_DELAY_MS,
	DEFAULT_WAIT_TONE_ENABLED,
	DEFAULT_TEXT_REVEAL_SPEED,
	DEFAULT_CHAT_BAR_ALIGNMENT
} from './display-types.ts';

test('returns defaults for null input', () => {
	const result = parseDisplaySettings(null);
	assert.deepEqual(result.camera, CAMERA_DEFAULTS);
	assert.deepEqual(result.overlayCamera, CAMERA_DEFAULTS);
	assert.equal(result.physicsIntensity, PHYSICS_INTENSITY_DEFAULT);
	assert.equal(result.chatDisplayMode, DEFAULT_CHAT_DISPLAY_MODE);
	assert.equal(result.sidebarPosition, DEFAULT_SIDEBAR_POSITION);
	assert.equal(result.waitToneEnabled, DEFAULT_WAIT_TONE_ENABLED);
	assert.equal(result.typingIndicatorDelayMs, DEFAULT_TYPING_INDICATOR_DELAY_MS);
});

test('returns defaults for invalid JSON string', () => {
	const originalWarn = console.warn;
	console.warn = () => {};
	try {
		const result = parseDisplaySettings('not-json');
		assert.equal(result.chatDisplayMode, DEFAULT_CHAT_DISPLAY_MODE);
		assert.equal(result.sidebarPosition, DEFAULT_SIDEBAR_POSITION);
	} finally {
		console.warn = originalWarn;
	}
});

test('returns defaults for JSON null', () => {
	const result = parseDisplaySettings('null');
	assert.deepEqual(result.camera, CAMERA_DEFAULTS);
	assert.deepEqual(result.overlayCamera, CAMERA_DEFAULTS);
});

test('returns defaults for JSON array', () => {
	const result = parseDisplaySettings('[1,2,3]');
	assert.deepEqual(result.camera, CAMERA_DEFAULTS);
	assert.deepEqual(result.overlayCamera, CAMERA_DEFAULTS);
});

test('parses valid settings object', () => {
	const result = parseDisplaySettings({
		camera: { fov: 45, zoom: 1.5, height: 0.1 },
		overlayCamera: { fov: 30, zoom: 0.8, height: -0.1 },
		physicsIntensity: 0.75,
		chatDisplayMode: 'sidebar',
		sidebarPosition: 'left'
	});
	assert.deepEqual(result.camera, { fov: 45, zoom: 1.5, height: 0.1, panX: 0 });
	assert.deepEqual(result.overlayCamera, { fov: 30, zoom: 0.8, height: -0.1, panX: 0 });
	assert.equal(result.physicsIntensity, 0.75);
	assert.equal(result.chatDisplayMode, 'sidebar');
	assert.equal(result.sidebarPosition, 'left');
});

test('parses valid settings from JSON string', () => {
	const raw = JSON.stringify({
		camera: { fov: 40, zoom: 1.2, height: 0 },
		chatDisplayMode: 'both',
		sidebarPosition: 'right'
	});
	const result = parseDisplaySettings(raw);
	assert.equal(result.chatDisplayMode, 'sidebar');
	assert.equal(result.sidebarPosition, 'right');
});

test('falls back to defaults for missing fields', () => {
	const result = parseDisplaySettings({});
	assert.deepEqual(result.camera, CAMERA_DEFAULTS);
	assert.deepEqual(result.overlayCamera, CAMERA_DEFAULTS);
	assert.equal(result.physicsIntensity, PHYSICS_INTENSITY_DEFAULT);
	assert.equal(result.chatDisplayMode, DEFAULT_CHAT_DISPLAY_MODE);
	assert.equal(result.sidebarPosition, DEFAULT_SIDEBAR_POSITION);
	assert.equal(result.waitToneEnabled, DEFAULT_WAIT_TONE_ENABLED);
	assert.equal(result.typingIndicatorDelayMs, DEFAULT_TYPING_INDICATOR_DELAY_MS);
});

test('ignores invalid chat display mode values', () => {
	const result = parseDisplaySettings({ chatDisplayMode: 'floating' });
	assert.equal(result.chatDisplayMode, DEFAULT_CHAT_DISPLAY_MODE);
});

test('ignores invalid sidebar position values', () => {
	const result = parseDisplaySettings({ sidebarPosition: 'top' });
	assert.equal(result.sidebarPosition, DEFAULT_SIDEBAR_POSITION);
});

test('clamps out-of-range camera values', () => {
	const result = parseDisplaySettings({
		camera: { fov: 999, zoom: 999, height: 999 }
	});
	assert.equal(result.camera.fov, 60);
	assert.equal(result.camera.zoom, 2.5);
	assert.equal(result.camera.height, 0.5);
});

test('migrates legacy cameraDistance setting', () => {
	const result = parseDisplaySettings({ cameraDistance: 2.0 });
	assert.equal(result.camera.zoom, 1);
	assert.deepEqual(result.overlayCamera, result.camera);
});

test('uses main camera for overlay camera when overlay camera is missing', () => {
	const result = parseDisplaySettings({
		camera: { fov: 45, zoom: 1.5, height: 0.1 }
	});
	assert.deepEqual(result.overlayCamera, { fov: 45, zoom: 1.5, height: 0.1, panX: 0 });
});

test('returns defaults for undefined input', () => {
	const result = parseDisplaySettings(undefined);
	assert.deepEqual(result.camera, CAMERA_DEFAULTS);
	assert.deepEqual(result.overlayCamera, CAMERA_DEFAULTS);
	assert.equal(result.physicsIntensity, PHYSICS_INTENSITY_DEFAULT);
	assert.equal(result.chatDisplayMode, DEFAULT_CHAT_DISPLAY_MODE);
	assert.equal(result.sidebarPosition, DEFAULT_SIDEBAR_POSITION);
});

test('sanitizeCamera isolates and clamps camera values independently', () => {
	const raw = { fov: 999, zoom: -10, height: 2 };
	const sanitized = sanitizeCamera(raw);
	assert.deepEqual(sanitized, {
		fov: CAMERA_LIMITS.fov.max,
		zoom: CAMERA_LIMITS.zoom.min,
		height: CAMERA_LIMITS.height.max,
		panX: 0
	});
	// Original object must not be mutated
	assert.deepEqual(raw, { fov: 999, zoom: -10, height: 2 });
});

test('sanitizeCamera fills missing values from defaults', () => {
	const sanitized = sanitizeCamera({ zoom: 2.0 });
	assert.equal(sanitized.fov, CAMERA_DEFAULTS.fov);
	assert.equal(sanitized.zoom, 2.0);
	assert.equal(sanitized.height, CAMERA_DEFAULTS.height);
});

test('defaults waitToneEnabled to false when missing', () => {
	const result = parseDisplaySettings({});
	assert.equal(result.waitToneEnabled, DEFAULT_WAIT_TONE_ENABLED);
});

test('parses waitToneEnabled when present', () => {
	const enabled = parseDisplaySettings({ waitToneEnabled: true });
	assert.equal(enabled.waitToneEnabled, true);

	const disabled = parseDisplaySettings({ waitToneEnabled: false });
	assert.equal(disabled.waitToneEnabled, false);
});

test('ignores non-boolean waitToneEnabled values', () => {
	const result = parseDisplaySettings({ waitToneEnabled: 'yes' });
	assert.equal(result.waitToneEnabled, DEFAULT_WAIT_TONE_ENABLED);
});

test('defaults typingIndicatorDelayMs to 0 when missing', () => {
	const result = parseDisplaySettings({});
	assert.equal(result.typingIndicatorDelayMs, DEFAULT_TYPING_INDICATOR_DELAY_MS);
});

test('parses and clamps typingIndicatorDelayMs', () => {
	const result = parseDisplaySettings({ typingIndicatorDelayMs: 1500 });
	assert.equal(result.typingIndicatorDelayMs, 1500);

	const negative = parseDisplaySettings({ typingIndicatorDelayMs: -500 });
	assert.equal(negative.typingIndicatorDelayMs, 0);

	const tooLarge = parseDisplaySettings({ typingIndicatorDelayMs: 999999 });
	assert.equal(tooLarge.typingIndicatorDelayMs, 10000);
});

test('ignores invalid typingIndicatorDelayMs values', () => {
	const result = parseDisplaySettings({ typingIndicatorDelayMs: 'fast' });
	assert.equal(result.typingIndicatorDelayMs, DEFAULT_TYPING_INDICATOR_DELAY_MS);
});

test('ignores NaN typingIndicatorDelayMs', () => {
	const result = parseDisplaySettings({ typingIndicatorDelayMs: NaN });
	assert.equal(result.typingIndicatorDelayMs, DEFAULT_TYPING_INDICATOR_DELAY_MS);
});

test('parses text reveal speed and bar alignment', () => {
	const result = parseDisplaySettings({ textRevealSpeed: 'fast', chatBarAlignment: 'left' });
	assert.equal(result.textRevealSpeed, 'fast');
	assert.equal(result.chatBarAlignment, 'left');
});

test('falls back to defaults for unknown reveal speed and alignment', () => {
	const result = parseDisplaySettings({ textRevealSpeed: 'warp', chatBarAlignment: 'top' });
	assert.equal(result.textRevealSpeed, DEFAULT_TEXT_REVEAL_SPEED);
	assert.equal(result.chatBarAlignment, DEFAULT_CHAT_BAR_ALIGNMENT);
});

test('falls back to defaults for non-string reveal speed and alignment', () => {
	const result = parseDisplaySettings({ textRevealSpeed: 42, chatBarAlignment: null });
	assert.equal(result.textRevealSpeed, DEFAULT_TEXT_REVEAL_SPEED);
	assert.equal(result.chatBarAlignment, DEFAULT_CHAT_BAR_ALIGNMENT);
});

test('defaults reveal speed and alignment when absent', () => {
	const result = parseDisplaySettings({ chatDisplayMode: 'bubble' });
	assert.equal(result.textRevealSpeed, DEFAULT_TEXT_REVEAL_SPEED);
	assert.equal(result.chatBarAlignment, DEFAULT_CHAT_BAR_ALIGNMENT);
});


test('pan persists independently for both camera profiles and clamps to limits', () => {
	const settings = parseDisplaySettings(JSON.stringify({
		camera: { panX: -0.3 }, overlayCamera: { panX: 0.6 }
	}));
	assert.equal(settings.camera.panX, -0.3);
	assert.equal(settings.overlayCamera.panX, 0.6);
	assert.equal(sanitizeCamera({ panX: -100 }).panX, CAMERA_LIMITS.panX.min);
	assert.equal(sanitizeCamera({ panX: 100 }).panX, CAMERA_LIMITS.panX.max);
	assert.equal(parseDisplaySettings({ cameraDistance: 2 }).camera.panX, 0);
});

test('camera settings reject malformed and non-finite persisted values', () => {
	for (const bad of [NaN, Infinity, -Infinity, '0.5', null, {}, []]) {
		const result = parseDisplaySettings({ camera: { panX: bad, zoom: bad, fov: bad, height: bad } });
		assert.deepEqual(result.camera, CAMERA_DEFAULTS);
	}
});


test('obsolete floating layout does not change the remaining display preferences', () => {
 const saved = { chatDisplayMode: 'sidebar', sidebarPosition: 'left', camera: { panX: 0.25 } };
 assert.deepEqual(parseDisplaySettings({ ...saved, chatWindowLayout: 'floating' }), parseDisplaySettings(saved));
});

test('keep-awake requires an explicit boolean opt-in', () => {
	for (const value of [undefined, null, false, 'true', 1, {}]) {
		assert.equal(parseDisplaySettings({ keepScreenAwake: value }).keepScreenAwake, false);
	}
	assert.equal(parseDisplaySettings(JSON.stringify({ keepScreenAwake: true })).keepScreenAwake, true);
});

test('retired off mode becomes immersive', () => {
	assert.equal(parseDisplaySettings({ chatDisplayMode: 'off' }).chatDisplayMode, 'bubble');
});

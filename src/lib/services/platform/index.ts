export { isTauri, isWeb, getPlatform } from './platform';

export {
	setWindowPosition,
	getWindowPosition,
	setIgnoreCursorEvents,
	setAlwaysOnTop,
	setWindowVisible,
	startDragging,
	type WindowPosition,
	type WindowSize
} from './window';

export {
	registerHotkey,
	unregisterHotkey,
	unregisterAllHotkeys,
	isHotkeysSupported,
	DEFAULT_HOTKEYS,
	type HotkeyAction,
	type HotkeyConfig
} from './hotkeys';

export {
	initializeHotkeys,
	onHotkeyEvent
} from './hotkey-handlers';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
	resetChatDisplay,
	setChatDisplayMode,
	setSidebarPosition
} from './display-store-logic.ts';
import {
	DEFAULT_CHAT_DISPLAY_MODE,
	DEFAULT_SIDEBAR_POSITION
} from './display-types.ts';

test('setChatDisplayMode updates mode and preserves sidebar position', () => {
	const current = {
		chatDisplayMode: DEFAULT_CHAT_DISPLAY_MODE,
		sidebarPosition: DEFAULT_SIDEBAR_POSITION
	};
	const next = setChatDisplayMode(current, 'sidebar');
	assert.equal(next.chatDisplayMode, 'sidebar');
	assert.equal(next.sidebarPosition, current.sidebarPosition);
	// Original snapshot must not be mutated
	assert.equal(current.chatDisplayMode, DEFAULT_CHAT_DISPLAY_MODE);
});

test('setSidebarPosition updates position and preserves chat display mode', () => {
	const current = {
		chatDisplayMode: 'sidebar' as const,
		sidebarPosition: 'right' as const
	};
	const next = setSidebarPosition(current, 'left');
	assert.equal(next.sidebarPosition, 'left');
	assert.equal(next.chatDisplayMode, current.chatDisplayMode);
	assert.equal(current.sidebarPosition, 'right');
});

test('resetChatDisplay returns default mode and position', () => {
	const next = resetChatDisplay();
	assert.equal(next.chatDisplayMode, DEFAULT_CHAT_DISPLAY_MODE);
	assert.equal(next.sidebarPosition, DEFAULT_SIDEBAR_POSITION);
});

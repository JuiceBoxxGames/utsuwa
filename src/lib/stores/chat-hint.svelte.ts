import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import { isQuotaError, STORAGE_FULL_MESSAGE } from '$lib/services/storage/quota';

const PRIVACY_ACK_KEY = STORAGE_INVENTORY.localStorage.imagePrivacyAck;

/**
 * Transient chat toasts (image hints, TTS errors) plus the one-time photo
 * privacy disclosure. Lives in a store so any input surface can raise them
 * while BottomChatBar, which is always mounted, renders them.
 */
function createChatHintStore() {
	let hint = $state<string | null>(null);
	let showPrivacy = $state(false);
	let hintTimer: ReturnType<typeof setTimeout> | null = null;

	function showHint(message: string) {
		hint = message;
		if (hintTimer) clearTimeout(hintTimer);
		hintTimer = setTimeout(() => (hint = null), 6000);
	}

	/** Raises the storage-full hint for quota errors; false for anything else. */
	function reportStorageError(e: unknown): boolean {
		if (!isQuotaError(e)) return false;
		showHint(STORAGE_FULL_MESSAGE);
		return true;
	}

	/** Shown once, the first time a photo is attached, then remembered. */
	function requestPrivacyNotice() {
		if (!browser || localStorage.getItem(PRIVACY_ACK_KEY) === '1') return;
		showPrivacy = true;
	}

	function ackPrivacy() {
		if (browser) localStorage.setItem(PRIVACY_ACK_KEY, '1');
		showPrivacy = false;
	}

	function destroy() {
		if (hintTimer) clearTimeout(hintTimer);
	}

	return {
		get hint() {
			return hint;
		},
		get showPrivacy() {
			return showPrivacy;
		},
		showHint,
		reportStorageError,
		requestPrivacyNotice,
		ackPrivacy,
		destroy
	};
}

export const chatHintStore = createChatHintStore();

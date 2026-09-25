import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import { isQuotaError, STORAGE_FULL_MESSAGE } from '$lib/services/storage/quota';

const PRIVACY_ACK_KEY = STORAGE_INVENTORY.localStorage.imagePrivacyAck;

/**
 * Transient chat hints (image hints, TTS errors) plus the one-time photo
 * privacy disclosure. Lives in a store so any input surface can raise them;
 * Toasts renders the hint and BottomChatBar the disclosure.
 */
function createChatHintStore() {
	let hint = $state<string | null>(null);
	let showPrivacy = $state(false);

	function showHint(message: string) {
		hint = message;
	}

	function clearHint() {
		hint = null;
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

	return {
		get hint() {
			return hint;
		},
		get showPrivacy() {
			return showPrivacy;
		},
		showHint,
		clearHint,
		reportStorageError,
		requestPrivacyNotice,
		ackPrivacy
	};
}

export const chatHintStore = createChatHintStore();

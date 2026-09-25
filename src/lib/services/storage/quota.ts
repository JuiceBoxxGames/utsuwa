export const STORAGE_FULL_MESSAGE =
	'Storage is full; delete some photos, models, or animations in Settings > Data';

const QUOTA_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);

// Dexie wraps the DOMException in `inner`; our own rethrows use `cause`.
export function isQuotaError(e: unknown): boolean {
	const seen = new Set<unknown>();
	while (e && typeof e === 'object' && !seen.has(e)) {
		seen.add(e);
		const err = e as { name?: unknown; inner?: unknown; cause?: unknown };
		if (typeof err.name === 'string' && QUOTA_NAMES.has(err.name)) return true;
		e = err.inner ?? err.cause;
	}
	return false;
}

// Temporary provider failures (rate limits, overloaded servers, network blips)
// get a couple of quiet retries before the user sees an error. Bad keys and bad
// requests fail straight away. Import-free so the server route can use it too.

export const RETRY_DELAYS_MS = [2000, 4000];
// Past this, Retry-After usually means a quota window; fail instead of hanging.
export const MAX_RETRY_AFTER_MS = 20_000;

/** A provider failure that knows whether trying again could help. */
export class ProviderError extends Error {
	readonly transient: boolean;
	readonly retryAfterMs?: number;

	constructor(message: string, transient: boolean, retryAfterMs?: number) {
		super(message);
		this.transient = transient;
		this.retryAfterMs = retryAfterMs;
	}
}

export function isTransientStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

/** Retry-After in ms, from either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
	// HTTP dates always name the month; V8 would otherwise parse '-2' as a year
	const at = /[a-z]/i.test(trimmed) ? Date.parse(trimmed) : NaN;
	return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** Classify an error thrown by xsai or fetch on the server. */
export function providerFailure(err: unknown): { transient: boolean; retryAfterMs?: number } {
	const response = (err as { response?: Response } | null)?.response;
	if (typeof response?.status === 'number') {
		return {
			transient: isTransientStatus(response.status),
			retryAfterMs: parseRetryAfter(response.headers?.get('retry-after'))
		};
	}
	// fetch rejects with a TypeError when the connection itself fails
	return { transient: err instanceof TypeError };
}

/** How long to wait before retry number attempt + 1, or null to give up. */
export function retryDelay(err: unknown, attempt: number): number | null {
	if (!(err instanceof ProviderError) || !err.transient || attempt >= RETRY_DELAYS_MS.length) return null;
	if (err.retryAfterMs === undefined) return RETRY_DELAYS_MS[attempt];
	return err.retryAfterMs <= MAX_RETRY_AFTER_MS ? err.retryAfterMs : null;
}

export interface RetryOptions {
	signal?: AbortSignal;
	/** False once output has reached the user; a retry would repeat it. */
	canRetry?: () => boolean;
	onRetry?: (attempt: number, delayMs: number) => void;
}

export async function withRetry<T>(run: () => Promise<T>, options: RetryOptions): Promise<T> {
	const { signal, canRetry, onRetry } = options;
	for (let attempt = 0; ; attempt++) {
		try {
			return await run();
		} catch (err) {
			const delay = signal?.aborted || canRetry?.() === false ? null : retryDelay(err, attempt);
			if (delay === null) throw err;
			onRetry?.(attempt + 1, delay);
			await sleep(delay, signal);
		}
	}
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal!.reason);
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

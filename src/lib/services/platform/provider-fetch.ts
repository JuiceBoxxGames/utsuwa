// fetch for calls straight to a provider. On desktop it goes through the Tauri
// HTTP plugin, which runs in Rust, so a provider's CORS policy can't block it.
// The web build keeps the browser's own fetch.
import { isTauri } from '@tauri-apps/api/core';

export const providerFetch: typeof fetch = async (input, init) => {
	if (!isTauri()) return fetch(input, init);
	const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
	return withAbortErrors(tauriFetch)(input, init);
};

// The plugin rejects aborts with a plain "Request cancelled" (a bare string once
// the body is streaming). Callers check for AbortError the way the browser's
// fetch reports it, so hand back the signal's reason instead.
export function withAbortErrors(fetchImpl: typeof fetch): typeof fetch {
	return async (input, init) => {
		const signal = init?.signal;
		const reason = (err: unknown) => (signal?.aborted ? signal.reason : err);

		let res: Response;
		try {
			res = await fetchImpl(input, init);
		} catch (err) {
			throw reason(err);
		}
		if (!signal || !res.body) return res;

		const reader = res.body.getReader();
		const body = new ReadableStream<Uint8Array>({
			async pull(controller) {
				try {
					const { done, value } = await reader.read();
					if (done) controller.close();
					else controller.enqueue(value);
				} catch (err) {
					controller.error(reason(err));
				}
			},
			cancel: (why) => reader.cancel(why)
		});
		return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
	};
}

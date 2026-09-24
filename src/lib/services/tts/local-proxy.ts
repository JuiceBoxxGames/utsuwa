// Request validation for /api/tts/local, kept free of $lib aliases so it runs
// under node --test. The route fetches a client-supplied base URL, so this is
// the SSRF boundary: only the two local TTS providers, only behind
// ALLOW_LOCAL_PROVIDER_HOSTS, and only ever POST {base}/audio/speech.
import { getTTSBaseUrl, isLocalTTSProvider } from '../providers/local-endpoints.ts';
import { assertSafeProviderUrl } from '../providers/url-guard.ts';

export const LOCAL_TTS_MAX_INPUT_CHARS = 4000;
export const LOCAL_TTS_MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
export const LOCAL_TTS_PROXY_DISABLED_MESSAGE =
	'Local TTS proxying is disabled on this server. Set ALLOW_LOCAL_PROVIDER_HOSTS=true to enable it.';

export type LocalTtsProxyRequest =
	| {
			ok: true;
			url: string;
			body: Record<string, unknown>;
			headers: Record<string, string>;
	  }
	| { ok: false; status: 400 | 403; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function badRequest(message: string): LocalTtsProxyRequest {
	return { ok: false, status: 400, message };
}

export function validateLocalTtsProxyRequest(
	json: unknown,
	allowLocal: boolean,
	authorization?: string | null
): LocalTtsProxyRequest {
	// Checked first so a disabled server always answers the same way and the
	// client falls back to its connection hint.
	if (!allowLocal) return { ok: false, status: 403, message: LOCAL_TTS_PROXY_DISABLED_MESSAGE };

	if (!isRecord(json)) return badRequest('Expected a JSON object');
	const { provider, baseUrl, body } = json;
	if (typeof provider !== 'string' || !isLocalTTSProvider(provider)) {
		return badRequest('Only local-tts and omnivoice can be proxied');
	}
	if (typeof baseUrl !== 'string') return badRequest('baseUrl must be a string');
	if (!isRecord(body) || typeof body.input !== 'string') {
		return badRequest('body.input must be a string');
	}
	if (body.input.length > LOCAL_TTS_MAX_INPUT_CHARS) {
		return badRequest(`body.input exceeds ${LOCAL_TTS_MAX_INPUT_CHARS} characters`);
	}

	let base: URL;
	try {
		base = assertSafeProviderUrl(getTTSBaseUrl(provider, baseUrl), true);
	} catch (e) {
		return badRequest(e instanceof Error ? e.message : 'Invalid provider URL');
	}
	// getTTSBaseUrl appends /v1/ to the raw string, so a query or fragment would
	// swallow that suffix and move the real path. Credentials have no business
	// here either.
	if (base.username || base.password || base.search || base.hash) {
		return badRequest('Local TTS base URL must not include credentials, a query, or a fragment');
	}

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (authorization) headers.Authorization = authorization;

	return { ok: true, url: new URL('audio/speech', base).href, body, headers };
}

// Headers are already sent by the time the body streams, so past the cap we
// can only error the stream: the client sees a failed read instead of audio,
// and pipeThrough cancels the upstream body.
export function capBytes(max: number): TransformStream<Uint8Array, Uint8Array> {
	let total = 0;
	return new TransformStream({
		transform(chunk, controller) {
			total += chunk.byteLength;
			if (total > max) controller.error(new Error(`Local TTS response exceeded ${max} bytes`));
			else controller.enqueue(chunk);
		}
	});
}

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import {
	LOCAL_TTS_MAX_RESPONSE_BYTES,
	capBytes,
	validateLocalTtsProxyRequest
} from '$lib/services/tts/local-proxy';
import { assertSafeProviderTarget } from '$lib/services/providers/url-guard.server';

// Fallback for local OpenAI-compatible TTS engines that reject the page's
// origin. The client only lands here after a direct browser fetch failed, and
// only when the self-hoster opted in with ALLOW_LOCAL_PROVIDER_HOSTS.
export const POST: RequestHandler = async ({ request }) => {
	let json: unknown = null;
	try {
		json = await request.json();
	} catch {
		// falls through to the 400 below
	}

	const target = validateLocalTtsProxyRequest(
		json,
		env.ALLOW_LOCAL_PROVIDER_HOSTS === 'true',
		request.headers.get('authorization')
	);
	if (!target.ok) return Response.json({ message: target.message }, { status: target.status });
	// Private hosts are fine here, but not names that resolve to link-local or metadata.
	try {
		await assertSafeProviderTarget(target.url, true);
	} catch (e) {
		return Response.json({ message: e instanceof Error ? e.message : 'Invalid provider URL' }, { status: 400 });
	}

	try {
		const upstream = await fetch(target.url, {
			method: 'POST',
			headers: target.headers,
			body: JSON.stringify(target.body),
			// A redirect could point anywhere, so it is a failure, not a hop.
			redirect: 'manual',
			signal: AbortSignal.any([request.signal, AbortSignal.timeout(60_000)])
		});
		if (upstream.type === 'opaqueredirect' || (upstream.status >= 300 && upstream.status < 400)) {
			await upstream.body?.cancel();
			return Response.json(
				{ message: `Local TTS server at ${target.url} answered with a redirect` },
				{ status: 502 }
			);
		}
		return new Response(upstream.body?.pipeThrough(capBytes(LOCAL_TTS_MAX_RESPONSE_BYTES)) ?? null, {
			status: upstream.status,
			headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'audio/mpeg' }
		});
	} catch (error) {
		const reason =
			error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'could not connect';
		return Response.json(
			{
				message: `The Utsuwa server could not reach the local TTS server at ${target.url} (${reason}). Make sure it is running and reachable from the server.`
			},
			{ status: 502 }
		);
	}
};

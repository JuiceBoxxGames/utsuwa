import type { RequestHandler } from './$types';
import { FISH_AUDIO_TTS_URL } from '$lib/services/providers/provider-defaults';

// Pass-through for Fish Audio TTS, which browsers can't call directly. The
// upstream URL is fixed, so unlike the chat and models routes there is no
// client-supplied base URL to guard.
export const POST: RequestHandler = async ({ request }) => {
	const headers = new Headers({ 'Content-Type': 'application/json' });
	for (const name of ['authorization', 'model']) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}

	try {
		const upstream = await fetch(FISH_AUDIO_TTS_URL, {
			method: 'POST',
			headers,
			body: await request.text(),
			signal: request.signal
		});
		return new Response(upstream.body, {
			status: upstream.status,
			headers: {
				'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream'
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Could not reach Fish Audio';
		return Response.json({ message }, { status: 502 });
	}
};

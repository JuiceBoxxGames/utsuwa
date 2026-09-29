// Per-IP cap on the API proxy routes, applied by the Cloudflare Worker
// (cloudflare-worker.js) through a Workers rate limit binding. Self-hosted Node
// deployments have no binding and aren't limited.
export interface RateLimiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

export async function apiRateLimited(request: Request, limiter?: RateLimiter): Promise<Response | undefined> {
	if (!limiter || !new URL(request.url).pathname.startsWith('/api/')) return undefined;
	let success = true;
	try {
		({ success } = await limiter.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' }));
	} catch {
		// fail open: a limiter outage shouldn't take chat down with it
	}
	if (success) return undefined;
	// No `transient` flag, so the client shows this once instead of retrying into the limit
	return new Response(JSON.stringify({ error: 'Too many requests. Wait a minute and try again.' }), {
		status: 429,
		headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
	});
}

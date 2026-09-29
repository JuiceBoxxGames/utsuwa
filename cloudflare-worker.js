// Cloudflare deploy entry: host routing (src/lib/config/host-routing.ts), then
// SvelteKit's worker. Build with WORKERS_CI=1 so the Cloudflare adapter runs.
import kit from './.svelte-kit/cloudflare/_worker.js';
import { routeByHost } from './src/lib/config/host-routing.ts';

export default {
	async fetch(request, env, ctx) {
		const route = routeByHost(new URL(request.url));
		if (route && 'redirect' in route) return Response.redirect(route.redirect.href, 308);
		return kit.fetch(route ? new Request(route.rewrite, request) : request, env, ctx);
	}
};

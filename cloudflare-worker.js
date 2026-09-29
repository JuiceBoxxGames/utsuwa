// Cloudflare deploy entry: subdomain routing (src/lib/config/host-routing.ts),
// then SvelteKit's worker. Build with WORKERS_CI=1 so the Cloudflare adapter runs.
import kit from './.svelte-kit/cloudflare/_worker.js';
import { routeByHost } from './src/lib/config/host-routing.ts';

export default {
	async fetch(request, env, ctx) {
		const rewrite = routeByHost(new URL(request.url));
		return kit.fetch(rewrite ? new Request(rewrite, request) : request, env, ctx);
	}
};

// Edge routing for the Cloudflare Worker (cloudflare-worker.js), the job
// vercel.json's rewrites and redirects did. It has to run before SvelteKit:
// kit's reroute can map docs.utsuwa.ai paths too, but for prerendered pages it
// refetches its own URL, and apex /docs pages are static files that would
// otherwise be served on the apex. Keep the passthroughs in step with the
// reroute hook in src/hooks.ts.
const APEX = 'utsuwa.ai';
const SECTION_ON_APEX = /^\/(docs|app)(\/.*)?$/;

export type HostRoute = { redirect: URL } | { rewrite: URL } | undefined;

export function routeByHost(url: URL): HostRoute {
	const { hostname, pathname } = url;

	if (hostname === APEX) {
		const match = SECTION_ON_APEX.exec(pathname);
		if (!match) return undefined;
		const redirect = new URL(`https://${match[1]}.${APEX}${match[2] ?? '/'}`);
		redirect.search = url.search;
		return { redirect };
	}

	if (hostname === `docs.${APEX}`) {
		if (pathname.startsWith('/docs') || pathname.startsWith('/_app/') || pathname.startsWith('/api/')) {
			return undefined;
		}
		const rewrite = new URL(url);
		rewrite.pathname = pathname === '/' ? '/docs' : `/docs${pathname}`;
		return { rewrite };
	}

	return undefined;
}

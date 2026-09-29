// Edge routing for the Cloudflare Worker (cloudflare-worker.js), the job
// vercel.json's rewrites and redirects did. It has to run before SvelteKit:
// kit's reroute can map subdomain paths too, but for prerendered pages it
// refetches its own URL, and apex /docs pages are static files that would
// otherwise be served on the apex. Keep the passthroughs in step with the
// reroute hook in src/hooks.ts.
const APEX = 'utsuwa.ai';
const SECTION_ON_APEX = /^\/(docs|app)(\/.*)?$/;
const SECTION_HOST = /^(docs|app)\.utsuwa\.ai$/;

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

	const section = SECTION_HOST.exec(hostname)?.[1];
	if (!section) return undefined;
	const prefix = `/${section}`;
	if (pathname.startsWith(prefix) || pathname.startsWith('/_app/') || pathname.startsWith('/api/')) {
		return undefined;
	}
	const rewrite = new URL(url);
	rewrite.pathname = pathname === '/' ? prefix : `${prefix}${pathname}`;
	return { rewrite };
}

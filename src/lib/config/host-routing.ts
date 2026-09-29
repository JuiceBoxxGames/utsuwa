// Edge routing for the Cloudflare Worker (cloudflare-worker.js): serve
// docs.utsuwa.ai and app.utsuwa.ai from /docs and /app. It has to run before
// SvelteKit, because kit's reroute refetches its own URL for prerendered pages.
// Keep the passthroughs in step with the reroute hook in src/hooks.ts. The apex
// never reaches the worker: a Cloudflare redirect rule sends it to www.
const SECTION_HOST = /^(docs|app)\.utsuwa\.ai$/;

export function routeByHost(url: URL): URL | undefined {
	const section = SECTION_HOST.exec(url.hostname)?.[1];
	if (!section) return undefined;
	const prefix = `/${section}`;
	const { pathname } = url;
	if (pathname.startsWith(prefix) || pathname.startsWith('/_app/') || pathname.startsWith('/api/')) {
		return undefined;
	}
	const rewrite = new URL(url);
	rewrite.pathname = pathname === '/' ? prefix : `${prefix}${pathname}`;
	return rewrite;
}

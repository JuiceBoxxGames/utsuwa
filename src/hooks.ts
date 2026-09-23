import type { Reroute } from '@sveltejs/kit';
import { deLocalizeUrl } from '$lib/paraglide/runtime';

// Subdomain → internal route prefix. On docs.utsuwa.ai a request for
// `/overview/introduction` is routed to `/docs/overview/introduction`, and
// app.utsuwa.ai/settings → /app/settings. This runs on both the server and
// during client-side navigation, so clean subdomain URLs resolve everywhere.
// "Prepend only if missing" keeps already-prefixed paths working as a safety net.
export const reroute: Reroute = ({ url }) => {
	const host = url.hostname;
	// Localized marketing URLs (/ja) resolve to their English route first.
	// Paraglide throws on an opaque ("null") origin, which tauri:// URLs can
	// have, and the desktop app has no localized pages anyway.
	const pathname = url.origin === 'null' ? url.pathname : deLocalizeUrl(url).pathname;

	if (host.startsWith('docs.')) {
		if (!pathname.startsWith('/docs') && !pathname.startsWith('/api')) {
			return pathname === '/' ? '/docs' : `/docs${pathname}`;
		}
	} else if (host.startsWith('app.')) {
		if (!pathname.startsWith('/app') && !pathname.startsWith('/api')) {
			return pathname === '/' ? '/app' : `/app${pathname}`;
		}
	}

	return pathname;
};

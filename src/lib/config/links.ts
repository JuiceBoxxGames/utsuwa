import { page } from '$app/state';

/**
 * Host-aware link builder for the subdomain split (docs.utsuwa.ai, app.utsuwa.ai).
 *
 * - On the real utsuwa.ai (apex or any subdomain): links resolve to the right
 *   subdomain via absolute URLs. Same-origin links stay client-side (SPA) nav,
 *   cross-subdomain links do a normal full navigation.
 * - In local dev (localhost) and on *.vercel.app preview deploys: everything
 *   stays path-based (/docs, /app), so there's nothing to set up to test.
 *
 * The reroute hook (src/hooks.ts) maps the clean subdomain paths back to the
 * real /docs and /app routes.
 */

type Section = 'docs' | 'app';
const APEX = 'utsuwa.ai';

function hostname(): string {
	return page.url?.hostname ?? '';
}

// Only the real production domain uses the subdomain split. localhost and
// preview deploys (e.g. *.vercel.app) fall back to path-based routing. During
// prerendering there is no real hostname, and that HTML is what production
// serves until the page hydrates, so it must default to the production layout.
function usesSubdomains(): boolean {
	const host = hostname();
	if (!host || host === 'sveltekit-prerender') return true;
	return host.endsWith(APEX);
}

function norm(path: string): string {
	if (!path) return '';
	return path.startsWith('/') ? path : `/${path}`;
}

/** Link to a page inside a section (docs or app). */
export function sectionUrl(section: Section, path = ''): string {
	const clean = norm(path);
	return usesSubdomains() ? `https://${section}.${APEX}${clean}` : `/${section}${clean}`;
}

/** Link to a page on the main marketing site (the apex domain). */
export function mainUrl(path = ''): string {
	const clean = norm(path);
	return usesSubdomains() ? `https://${APEX}${clean}` : clean || '/';
}

/**
 * The *relative* browser path for a section page on the current host — clean
 * ("/overview") when already on that section's subdomain, prefixed
 * ("/docs/overview") otherwise. Use for within-section links and for comparing
 * against `page.url.pathname` (active states), since those must match.
 */
export function localPath(section: Section, path = ''): string {
	const clean = norm(path);
	const onThisSubdomain = usesSubdomains() && hostname().startsWith(`${section}.`);
	return onThisSubdomain ? clean || '/' : `/${section}${clean}`;
}

/** Whether the current page belongs to a section (subdomain or path-prefixed). */
export function isSection(section: Section): boolean {
	return hostname().startsWith(`${section}.`) || (page.url?.pathname ?? '').startsWith(`/${section}`);
}

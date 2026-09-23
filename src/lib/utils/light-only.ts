// Marketing pages render light only; the app, docs, and overlay keep the saved
// color mode. app.html inlines the same check to avoid a dark flash on load, so
// keep the two in sync.
const LIGHT_ONLY = ['/ja', '/blog', '/download', '/privacy', '/terms'];

export function isLightOnlyRoute(hostname: string, pathname: string): boolean {
	// docs.* and app.* reroute "/" to their own section
	if (/^(docs|app)\./.test(hostname)) return false;
	if (pathname === '/') return true;
	return LIGHT_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

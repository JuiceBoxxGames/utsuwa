// The marketing site: the landing, its Japanese twin, blog, download, and legal
// pages. They go through the locale middleware and morph into each other.
const MARKETING = ['/ja', '/blog', '/download', '/privacy', '/terms'];

export function isMarketingRoute(hostname: string, pathname: string): boolean {
	// docs.* and app.* reroute "/" to their own section
	if (/^(docs|app)\./.test(hostname)) return false;
	if (pathname === '/') return true;
	return MARKETING.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

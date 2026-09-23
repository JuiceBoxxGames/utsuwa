import type { PageLoad } from './$types';
import { getSortedPosts } from '$lib/utils/blog-posts';

// Not prerendered: the subdomains (docs/app) rewrite their root to /docs and
// /app, and a static "/" would otherwise win on every host and show the
// landing page there. SSR keeps "/" host-aware via the reroute hook.
export const prerender = false;

export const load: PageLoad = async () => {
	return { posts: getSortedPosts().slice(0, 6) };
};

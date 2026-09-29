import type { PageLoad } from './$types';
import { getSortedPosts } from '$lib/utils/blog-posts';

// The worker runs first on "/" (wrangler.jsonc run_worker_first), so the
// docs and app subdomains still get their own root instead of this page.
export const prerender = true;

export const load: PageLoad = async () => {
	return { posts: getSortedPosts().slice(0, 6) };
};

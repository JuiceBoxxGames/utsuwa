import { error } from '@sveltejs/kit';
import type { PageLoad, EntryGenerator } from './$types';
import { getSortedPosts } from '$lib/utils/blog-posts';

const modules = import.meta.glob('/src/content/blog/*.md');

export const prerender = true;

export const entries: EntryGenerator = () => {
	return Object.keys(modules).map((path) => {
		const slug = path.replace('/src/content/blog/', '').replace('.md', '');
		return { slug };
	});
};

export const load: PageLoad = async ({ params }) => {
	const path = `/src/content/blog/${params.slug}.md`;

	if (!modules[path]) {
		throw error(404, `Post not found: ${params.slug}`);
	}

	const module = (await modules[path]()) as {
		default: ConstructorOfATypedSvelteComponent;
		metadata: Record<string, string>;
	};

	return {
		content: module.default,
		metadata: module.metadata,
		slug: params.slug,
		more: getSortedPosts()
			.filter((post) => post.slug !== params.slug)
			.slice(0, 3)
	};
};

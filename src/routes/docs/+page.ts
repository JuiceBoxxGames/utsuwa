import type { PageLoad } from './$types';
import { docsNav } from '$lib/config/docs-nav';

// Pull frontmatter from every doc so the index can show real descriptions.
const metadata = import.meta.glob<{ title?: string; description?: string } | undefined>(
	'/src/content/docs/**/*.md',
	{ eager: true, query: '?metadata', import: 'metadata' }
);

export const prerender = true;

export const load: PageLoad = () => {
	const meta: Record<string, { title?: string; description?: string }> = {};
	for (const [path, m] of Object.entries(metadata)) {
		meta[path.replace('/src/content/docs/', '').replace('.md', '')] = m ?? {};
	}

	const sections = docsNav.map((section) => ({
		title: section.title,
		icon: section.icon,
		items: section.items.map((item) => ({
			title: item.title,
			slug: item.slug,
			description: meta[item.slug]?.description ?? ''
		}))
	}));

	return { sections };
};

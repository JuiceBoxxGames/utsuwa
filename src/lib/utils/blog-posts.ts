// Shared blog post loading so the index page and the nav dropdown stay in sync.
const modules = import.meta.glob('/src/content/blog/*.md', { eager: true });

export interface BlogPostMeta {
	title: string;
	description: string;
	date: string;
	image: string;
	slug: string;
}

function normalizeDate(raw: unknown): string {
	if (raw instanceof Date) return raw.toISOString().split('T')[0];
	return raw == null ? '' : String(raw);
}

// All posts, newest first.
export function getSortedPosts(): BlogPostMeta[] {
	return Object.entries(modules)
		.map(([path, mod]: [string, any]) => ({
			title: mod.metadata.title as string,
			description: mod.metadata.description as string,
			date: normalizeDate(mod.metadata.date),
			image: (mod.metadata.image as string) || '/blog/blog-thumbnail.jpg',
			slug: path.replace('/src/content/blog/', '').replace('.md', '')
		}))
		.filter((post) => post.date)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

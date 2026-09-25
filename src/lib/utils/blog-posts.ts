// Shared blog post loading so the index page and the nav dropdown stay in sync.
// Only the frontmatter is pulled in, not the compiled post components.
const metadata = import.meta.glob<Record<string, unknown>>('/src/content/blog/*.md', {
	eager: true,
	query: '?metadata',
	import: 'metadata'
});

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
	return Object.entries(metadata)
		.map(([path, meta]) => ({
			title: meta.title as string,
			description: meta.description as string,
			date: normalizeDate(meta.date),
			image: (meta.image as string) || '/blog/blog-thumbnail.jpg',
			slug: path.replace('/src/content/blog/', '').replace('.md', '')
		}))
		.filter((post) => post.date)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

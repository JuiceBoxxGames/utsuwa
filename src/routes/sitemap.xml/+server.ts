import type { RequestHandler } from './$types';
import { SITE_URL } from '$lib/config/site';

const blogModules = import.meta.glob('/src/content/blog/*.md', { eager: true });
const docsModules = import.meta.glob('/src/content/docs/**/*.md', { eager: true });

export const prerender = true;

interface SitemapEntry {
	url: string;
	date?: string;
	priority: string;
}

export const GET: RequestHandler = () => {
	const blogPosts: SitemapEntry[] = Object.entries(blogModules).map(([path, mod]: [string, any]) => ({
		url: `${SITE_URL}/blog/${path.replace('/src/content/blog/', '').replace('.md', '')}`,
		date: mod.metadata?.date ? normalizeDate(mod.metadata.date) : undefined,
		priority: '0.7'
	}));

	const docPages: SitemapEntry[] = Object.keys(docsModules).map((path) => ({
		url: `${SITE_URL}/docs/${path.replace('/src/content/docs/', '').replace('.md', '')}`,
		priority: '0.6'
	}));

	const staticPages: SitemapEntry[] = [
		{ url: SITE_URL, priority: '1.0' },
		{ url: `${SITE_URL}/ja`, priority: '0.9' },
		{ url: `${SITE_URL}/download`, priority: '0.8' },
		{ url: `${SITE_URL}/docs/overview/introduction`, priority: '0.8' },
		{ url: `${SITE_URL}/blog`, priority: '0.8' },
		{ url: `${SITE_URL}/privacy`, priority: '0.3' },
		{ url: `${SITE_URL}/terms`, priority: '0.3' }
	];

	const pages = [...staticPages, ...blogPosts, ...docPages];

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
	.map(
		(page) => `  <url>
    <loc>${page.url}</loc>${page.date ? `\n    <lastmod>${page.date}</lastmod>` : ''}
    <priority>${page.priority}</priority>
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600'
		}
	});
};

function normalizeDate(raw: unknown): string {
	if (raw instanceof Date) return raw.toISOString().split('T')[0];
	return String(raw).replace(/'/g, '');
}

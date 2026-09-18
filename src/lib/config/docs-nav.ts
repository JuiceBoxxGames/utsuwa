export interface DocsNavItem {
	title: string;
	slug: string;
}

export interface DocsNavSection {
	title: string;
	icon: string;
	items: DocsNavItem[];
}

export const docsNav: DocsNavSection[] = [
	{
		title: 'Overview',
		icon: 'book',
		items: [{ title: 'Introduction', slug: 'overview/introduction' }]
	},
	{
		title: 'Guides',
		icon: 'compass',
		items: [
			{ title: 'Web Guide', slug: 'guides/web-guide' },
			{ title: 'Desktop Guide', slug: 'guides/desktop-guide' },
			{ title: 'Local LLM Setup', slug: 'guides/local-llm-setup' },
			{ title: 'Local TTS Setup', slug: 'guides/local-tts-setup' },
			{ title: 'OmniVoice Setup', slug: 'guides/omnivoice' },
			{ title: 'Local STT Setup', slug: 'guides/local-stt-setup' },
			{ title: 'MCP Servers', slug: 'guides/mcp' },
			{ title: 'Troubleshooting', slug: 'guides/troubleshooting' }
		]
	},
	{
		title: 'Technology',
		icon: 'code',
		items: [
			{ title: 'Architecture Overview', slug: 'technology/architecture' },
			{ title: 'Companion System', slug: 'technology/companion-system' },
			{ title: 'Memory Graph', slug: 'technology/memory-graph' }
		]
	},
	{
		title: 'Community',
		icon: 'users',
		items: [
			{ title: 'Resources', slug: 'community/resources' },
			{ title: 'Contributing', slug: 'community/contributing' }
		]
	}
];

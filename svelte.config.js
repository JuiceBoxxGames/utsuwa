import adapterAuto from '@sveltejs/adapter-auto';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import rehypeSlug from 'rehype-slug';
import { createHighlighter } from 'shiki/bundle/web';

const isTauri = !!process.env.TAURI_ENV_PLATFORM;

const highlighter = await createHighlighter({
	themes: ['github-light', 'github-dark'],
	langs: ['js', 'ts', 'bash', 'json', 'svelte', 'html', 'css', 'md', 'yaml']
});

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.md'],

	preprocess: [
		vitePreprocess(),
		mdsvex({
			extensions: ['.md'],
			rehypePlugins: [rehypeSlug],
			highlight: {
				highlighter: (code, lang) => {
					const html = highlighter.codeToHtml(code, {
						lang: lang || 'text',
						themes: { light: 'github-light', dark: 'github-dark' }
					});
					return `{@html \`${html.replace(/`/g, '\\`')}\`}`;
				}
			}
		})
	],

	kit: {
		adapter: isTauri
			? adapterStatic({ fallback: 'index.html' })
			: adapterAuto(),
		// Lock down the desktop webview: with fs and http capabilities, a script
		// injection would be dangerous, so forbid inline/remote script execution.
		// SvelteKit hashes its own inline scripts in 'hash' mode. Applied only to
		// the Tauri build — the web deployment has no filesystem access and its
		// CSP is managed separately. connect/img stay permissive because users
		// point the app at arbitrary provider endpoints and it pulls the on-device
		// embedding model from a CDN; the protection is locking script-src.
		csp: isTauri
			? {
					mode: 'hash',
					directives: {
						'default-src': ['self'],
						'script-src': ['self', 'wasm-unsafe-eval'],
						'style-src': ['self', 'unsafe-inline'],
						'img-src': ['self', 'data:', 'blob:', 'https:'],
						'media-src': ['self', 'data:', 'blob:'],
						'font-src': ['self', 'data:'],
						// 'ipc:' + 'http://ipc.localhost' are Tauri v2's invoke() transport.
						'connect-src': ['self', 'https:', 'http:', 'data:', 'blob:', 'ipc:', 'http://ipc.localhost'],
						'worker-src': ['self', 'blob:'],
						'object-src': ['none'],
						'base-uri': ['self']
					}
				}
			: undefined
	}
};

export default config;

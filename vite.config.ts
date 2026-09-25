import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'fs';
import { compile } from 'mdsvex';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// `foo.md?metadata` resolves to just the frontmatter, so index pages can list
// posts without bundling every compiled page. A plain `import: 'metadata'` glob
// can't do this: the page routes also import the same .md modules whole.
function mdMetadata(): Plugin {
	const query = '?metadata';
	// Resolved ids must not end in `.md`, or vite-plugin-svelte compiles them too.
	const tag = '.md-metadata';
	return {
		name: 'md-metadata',
		enforce: 'pre',
		async resolveId(source, importer) {
			if (!source.endsWith('.md' + query)) return;
			const resolved = await this.resolve(source.slice(0, -query.length), importer);
			return resolved && '\0' + resolved.id + tag;
		},
		async load(id) {
			if (!id.startsWith('\0') || !id.endsWith(tag)) return;
			const file = id.slice(1, -tag.length);
			this.addWatchFile(file);
			const out = await compile(readFileSync(file, 'utf-8'));
			return `export const metadata = ${JSON.stringify(out?.data?.fm ?? {})};`;
		}
	};
}

export default defineConfig({
	plugins: [
		mdMetadata(),
		sveltekit(),
		tailwindcss(),
		// Routing lives in project.inlang/paraglide.config.js
		paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' })
	],
	define: {
		'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
		// True only when the frontend is built by the Tauri CLI (which sets
		// TAURI_ENV_PLATFORM). Baked in at build time so routing decisions never
		// depend on the Tauri globals being injected at runtime.
		__IS_DESKTOP__: JSON.stringify(!!process.env.TAURI_ENV_PLATFORM)
	},
	build: {
		rollupOptions: {
			output: {
				// three + three-vrm in one vendor chunk whose hash survives app deploys. Threlte
				// stays out: it imports svelte, and Rollup would pull the runtime in with it.
				manualChunks(id) {
					if (/[\\/]node_modules[\\/](three|@pixiv[\\/]three-vrm[^\\/]*)[\\/]/.test(id)) {
						return 'three';
					}
				}
			}
		}
	},
	optimizeDeps: {
		// Pre-bundling moves onnxruntime-web away from its .wasm, which it finds via import.meta.url
		exclude: ['@huggingface/transformers']
	},
	ssr: {
		noExternal: ['bits-ui', '@lucide/svelte']
	}
});

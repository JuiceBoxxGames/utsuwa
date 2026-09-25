<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { localPath } from '$lib/config/links';

	interface Props {
		id?: string;
	}

	let { id = 'docs-search' }: Props = $props();

	let query = $state('');
	let results = $state<Array<{ url: string; title: string; excerpt: string }>>([]);
	let isOpen = $state(false);
	let selectedIndex = $state(0);
	let pagefind = $state<any>(null);
	let inputEl = $state<HTMLInputElement | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);

	async function loadPagefind() {
		if (pagefind) return pagefind;
		try {
			// Dynamic path to avoid Vite trying to resolve at build time
			const pagefindPath = '/pagefind/pagefind.js';
			pagefind = await import(/* @vite-ignore */ pagefindPath);
			await pagefind.init();
			return pagefind;
		} catch {
			return null;
		}
	}

	// Guards against a slow earlier search resolving after a faster later one
	let searchToken = 0;

	async function search(q: string) {
		const token = ++searchToken;

		if (!q.trim()) {
			results = [];
			return;
		}

		const pf = await loadPagefind();
		if (!pf) {
			results = [];
			return;
		}

		const searchResults = await pf.search(q);
		const items = await Promise.all(
			searchResults.results.slice(0, 8).map(async (r: any) => {
				const data = await r.data();
				return {
					url: data.url,
					title: data.meta?.title || data.url,
					excerpt: data.excerpt || ''
				};
			})
		);
		if (token !== searchToken) return;
		results = items;
		selectedIndex = 0;
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		query = target.value;
		isOpen = true;
		search(query);
	}

	function handleFocus() {
		isOpen = true;
		if (query) search(query);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!isOpen) return;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (results[selectedIndex]) {
					navigateTo(results[selectedIndex].url);
				}
				break;
			case 'Escape':
				// An empty search lets Escape fall through to the docs drawer
				if (showDropdown) e.preventDefault();
				close();
				break;
		}
	}

	function navigateTo(url: string) {
		close();
		// Strip .html extension - Pagefind indexes HTML files but SvelteKit uses clean URLs
		const cleanUrl = url.replace(/\.html$/, '');
		// Pagefind indexes the built /docs/... paths; map them to the host-aware
		// path so search results land on clean subdomain URLs.
		const docsPath = cleanUrl.replace(/^\/docs(?=\/|$)/, '');
		goto(localPath('docs', docsPath));
	}

	function close() {
		isOpen = false;
		query = '';
		results = [];
	}

	function handleClickOutside(e: MouseEvent) {
		if (containerEl && !containerEl.contains(e.target as Node)) {
			close();
		}
	}

	export function focus() {
		inputEl?.focus();
	}

	$effect(() => {
		if (browser && isOpen) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});

	const showDropdown = $derived(isOpen && query.trim().length > 0);
	const isDev = $derived(browser && window.location.hostname === 'localhost');
</script>

<div class="search-container" bind:this={containerEl}>
	<div class="settings-field settings-search search-field">
		<Icon name="search" size={16} />
		<input
			bind:this={inputEl}
			{id}
			type="text"
			placeholder="Search docs"
			aria-label="Search docs"
			value={query}
			oninput={handleInput}
			onfocus={handleFocus}
			onkeydown={handleKeydown}
			autocomplete="off"
		/>
		<kbd class="ui-badge shortcut">{browser && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} K</kbd>
	</div>

	{#if showDropdown}
		<div class="search-dropdown">
			{#if isDev && !pagefind}
				<div class="search-message">Search available in production build</div>
			{:else if results.length === 0 && query.trim()}
				<div class="search-message">No results for "{query}"</div>
			{:else}
				<ul class="search-results">
					{#each results as result, i}
						<li>
							<button
								type="button"
								class="search-result"
								class:selected={i === selectedIndex}
								onclick={() => navigateTo(result.url)}
							>
								<span class="result-title">{result.title}</span>
								{#if result.excerpt}
									<span class="result-excerpt">{@html result.excerpt}</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<style>
	.search-container {
		position: relative;
		width: 100%;
	}

	/* settings-field supplies the fill and geometry; focus shows on the whole field. */
	.search-field {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-secondary);
	}

	.search-field:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 24%, transparent);
	}

	input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: 0;
		background: none;
		outline: none;
		color: var(--text-primary);
		font: inherit;
	}

	input::placeholder {
		color: var(--text-secondary);
	}

	.shortcut {
		font-family: inherit;
	}

	.search-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		z-index: 100;
		padding: 4px;
		border-radius: var(--control-radius);
		background: var(--t3-surface-overlay);
		box-shadow: var(--popup-shadow);
	}

	.search-message {
		padding: 12px;
		text-align: center;
		font-size: 13px;
		color: var(--text-secondary);
	}

	.search-results {
		list-style: none;
		padding: 0;
		margin: 0;
		max-height: 400px;
		overflow-y: auto;
	}

	.search-result {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		padding: 6px 8px;
		border: 0;
		border-radius: var(--radius-xs);
		background: none;
		text-align: left;
		font: inherit;
		cursor: pointer;
	}

	.search-result:hover,
	.search-result.selected {
		background: var(--control-hover);
	}

	.result-title {
		font-size: 14px;
		font-weight: 500;
		color: var(--text-primary);
	}

	.result-excerpt {
		font-size: 13px;
		color: var(--text-secondary);
		line-height: 1.4;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.result-excerpt :global(mark) {
		background: var(--accent-muted);
		color: var(--text-primary);
		border-radius: 2px;
	}

	@media (max-width: 768px) {
		.search-field .shortcut {
			display: none;
		}
	}
</style>

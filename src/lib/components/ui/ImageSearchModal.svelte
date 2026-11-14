<script lang="ts">
	import { imageSearchStore } from '$lib/stores/image-search.svelte'
	import { closeImages, fetchImageAsDataUrl, openImageResult } from '$lib/services/image-search'
	import { Icon } from '$lib/components/ui'
	import { isRasterImageDataUrl } from '$lib/utils/image-mime'

	// The panel never blocks the page: it sits beside the companion instead of
	// over it, and the loading state is a small status pill rather than a modal.
	let panelEl: HTMLElement | undefined = $state()
	let previouslyFocused: HTMLElement | null = null
	const visible = $derived(imageSearchStore.isOpen && imageSearchStore.status !== 'loading')

	// Thumbnails go through the MCP file-fetch tool, never straight from the
	// source host. Without that tool the card keeps a neutral placeholder.
	let thumbUrls = $state<Record<string, string>>({})
	let thumbStatus = $state<Record<string, 'loading' | 'missing'>>({})
	const started = new Set<string>()

	$effect(() => {
		for (const result of imageSearchStore.results) {
			const url = result.thumbnail
			if (started.has(url)) continue
			started.add(url)
			if (url.startsWith('data:')) {
				if (isRasterImageDataUrl(url)) thumbUrls[url] = url
				else thumbStatus[url] = 'missing'
				continue
			}
			thumbStatus[url] = 'loading'
			void fetchImageAsDataUrl(url).then((dataUrl) => {
				if (dataUrl) {
					thumbUrls[url] = dataUrl
					delete thumbStatus[url]
				} else {
					thumbStatus[url] = 'missing'
				}
			})
		}
	})

	$effect(() => {
		if (visible) {
			previouslyFocused = document.activeElement as HTMLElement | null
			panelEl?.focus()
		} else {
			previouslyFocused?.focus()
			previouslyFocused = null
		}
	})

	function closePictures() {
		closeImages()
		imageSearchStore.closeModal()
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!visible) return
		if (e.key === 'Escape') {
			e.preventDefault()
			closePictures()
			return
		}
		if (e.key !== 'Tab' || !panelEl) return
		const focusable = [...panelEl.querySelectorAll<HTMLElement>(
			'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
		)].filter((el) => el.offsetParent !== null)
		if (!focusable.length) return
		const first = focusable[0]
		const last = focusable[focusable.length - 1]
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault()
			last.focus()
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault()
			first.focus()
		}
	}

	function openImage(url: string) {
		void openImageResult(url)
	}

	// A click on a card moves the focus; her "what is on screen" then refers to
	// that picture. The open button is separate, so selecting never navigates.
	function selectImage(index: number) {
		imageSearchStore.setFocus(index)
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if imageSearchStore.isOpen && imageSearchStore.status === 'loading'}
	<div class="search-status" role="status" aria-live="polite">
		<Icon name="refresh" size={16} />
		<span>Searching pictures…</span>
		<button class="status-cancel" onclick={closePictures} aria-label="Cancel picture search">
			<Icon name="x" size={12} />
		</button>
	</div>
{/if}

{#if visible}
	<div class="image-panel-anchor">
		<div
			class="modal-container"
			bind:this={panelEl}
			role="dialog"
			aria-labelledby="image-search-title"
			tabindex="-1"
		>
			<!-- Header -->
			<div class="modal-header">
				<div class="modal-title">
					<Icon name="image" size={18} />
					<h2 id="image-search-title">Pictures</h2>
					{#if imageSearchStore.currentQuery}
						<span class="query-label">{imageSearchStore.currentQuery}</span>
					{/if}
				</div>
				<button class="close-btn" onclick={() => closePictures()} aria-label="Close">
					<Icon name="x" size={14} />
				</button>
			</div>

			<!-- Content -->
			<div class="modal-content">
				{#if imageSearchStore.status === 'error'}
					<div class="empty-state" role="alert">
						<Icon name="alert" size={32} />
						<p>{imageSearchStore.error?.message ?? 'Search failed'}</p>
					</div>
				{:else if imageSearchStore.results.length === 0}
					<div class="empty-state">
						<Icon name="image" size={32} />
						<p>No pictures found</p>
					</div>
				{:else}
					<div class="image-grid" role="radiogroup" aria-label="Shown pictures">
						{#each imageSearchStore.results as result, i}
							<div class="image-card" class:focused={i === imageSearchStore.focusedIndex}>
								<label class="image-select">
									<input
										type="radio"
										name="image-focus"
										value={i}
										checked={i === imageSearchStore.focusedIndex}
										onchange={() => selectImage(i)}
										class="sr-only"
									/>
									<div class="image-thumb">
										{#if thumbUrls[result.thumbnail]}
											<img src={thumbUrls[result.thumbnail]} alt={result.title} loading="lazy" />
										{:else}
											<div class="thumb-placeholder" aria-label="Thumbnail not loaded">
												<Icon name={thumbStatus[result.thumbnail] === 'loading' ? 'refresh' : 'image'} size={22} />
											</div>
										{/if}
									</div>
									<div class="image-meta">
										<span class="image-title" title={result.title}>{result.title}</span>
										<span class="image-source">
											{result.source}{#if result.license} · {result.license}{/if}
										</span>
										{#if result.attribution}
											<span class="image-attribution" title={result.attribution}>{result.attribution}</span>
										{/if}
									</div>
								</label>
								<button
									class="open-btn"
									onclick={() => openImage(result.url)}
									aria-label={`Open ${result.title}`}
									title="Open in new tab"
								>
									<Icon name="external-link" size={14} />
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Non-blocking status while the search runs: no dialog, no backdrop. */
	.search-status {
		position: fixed;
		left: 50%;
		bottom: 7.5rem;
		transform: translateX(-50%);
		z-index: 1000;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		max-width: calc(100% - 2rem);
		padding: 0.5rem 0.6rem 0.5rem 0.85rem;
		border-radius: 999px;
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.search-status > :global(svg) {
		animation: spin 1s linear infinite;
	}

	.status-cancel {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-tertiary);
		cursor: pointer;
	}

	.status-cancel:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.image-panel-anchor {
		position: fixed;
		top: 1rem;
		right: 1rem;
		bottom: 8rem;
		width: min(420px, 40vw);
		z-index: 1000;
		display: flex;
		align-items: stretch;
		pointer-events: none;
	}

	.modal-container {
		pointer-events: auto;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 250, 250, 0.98) 100%);
		border: 1px solid rgba(255, 255, 255, 0.6);
		border-radius: 16px;
		box-shadow:
			0 8px 40px rgba(0, 0, 0, 0.2),
			0 2px 12px rgba(0, 0, 0, 0.1),
			inset 0 1px 0 rgba(255, 255, 255, 0.9);
		overflow: hidden;
		animation: panelIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
	}

	:global(.dark) .modal-container {
		background: linear-gradient(180deg, rgba(30, 30, 30, 0.95) 0%, rgba(20, 20, 20, 0.95) 100%);
		border-color: rgba(255, 255, 255, 0.1);
		box-shadow:
			0 8px 40px rgba(0, 0, 0, 0.5),
			0 2px 12px rgba(0, 0, 0, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
	}

	.modal-container:focus {
		outline: none;
	}

	@keyframes panelIn {
		from {
			transform: translateX(24px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	@keyframes sheetIn {
		from {
			transform: translateY(32px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	/* Narrow windows and the overlay: a bottom sheet keeps the companion visible. */
	@media (max-width: 900px) {
		.search-status {
			bottom: 6.5rem;
		}

		.image-panel-anchor {
			left: 0.5rem;
			right: 0.5rem;
			top: auto;
			bottom: 6.5rem;
			width: auto;
			max-height: min(60vh, 560px);
		}

		.modal-container {
			height: auto;
			max-height: 100%;
			border-radius: 16px 16px 0 0;
			animation: sheetIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
		}
	}

	/* ── Touch-friendly scrollbar ── */
	.modal-content::-webkit-scrollbar {
		width: 12px;
	}

	.modal-content::-webkit-scrollbar-track {
		background: transparent;
	}

	.modal-content::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 999px;
		border: 3px solid transparent;
		background-clip: padding-box;
	}

	.modal-content::-webkit-scrollbar-thumb:hover {
		background: rgba(0, 0, 0, 0.35);
	}

	:global(.dark) .modal-content::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
	}

	:global(.dark) .modal-content::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.35);
	}

	/* Firefox */
	.modal-content {
		scrollbar-width: auto;
		scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
		/* Prevent scroll propagation to background page */
		overscroll-behavior: contain;
		touch-action: pan-y;
	}

	:global(.dark) .modal-content {
		scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	:global(.dark) .modal-header {
		border-bottom-color: rgba(255, 255, 255, 0.06);
	}

	.modal-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text-primary);
	}

	.modal-title h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}

	.query-label {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		background: var(--bg-tertiary);
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%);
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 50%;
		color: var(--text-tertiary);
		cursor: pointer;
		transition: all 0.15s;
		box-shadow:
			0 2px 4px rgba(0, 0, 0, 0.08),
			inset 0 1px 0 rgba(255, 255, 255, 0.8);
	}

	:global(.dark) .close-btn {
		background: linear-gradient(180deg, #333333 0%, #262626 100%);
		border-color: rgba(255, 255, 255, 0.1);
		box-shadow:
			0 2px 4px rgba(0, 0, 0, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
	}

	.close-btn:hover {
		background: linear-gradient(180deg, #e8e8e8 0%, #d8d8d8 100%);
		color: var(--text-primary);
		transform: scale(1.05);
	}

	:global(.dark) .close-btn:hover {
		background: linear-gradient(180deg, #404040 0%, #333333 100%);
	}

	.modal-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem 1rem 1rem;
		min-height: 0;
	}

	.image-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 0.75rem;
	}

	.image-card {
		display: flex;
		flex-direction: column;
		position: relative;
		background: linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%);
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 16px;
		overflow: hidden;
		transition: all 0.15s ease-out;
		box-shadow:
			0 3px 10px rgba(0, 0, 0, 0.06),
			0 1px 3px rgba(0, 0, 0, 0.04),
			inset 0 1px 0 rgba(255, 255, 255, 0.9);
		padding: 0;
		text-align: left;
	}

	.image-select {
		display: flex;
		flex-direction: column;
		cursor: pointer;
	}

	.image-card.focused {
		border-color: var(--accent);
		box-shadow:
			0 0 0 2px var(--accent),
			0 6px 18px rgba(0, 0, 0, 0.12);
	}

	:global(.dark) .image-card.focused {
		box-shadow:
			0 0 0 2px var(--accent),
			0 6px 18px rgba(0, 0, 0, 0.45);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.open-btn {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: 1px solid rgba(0, 0, 0, 0.1);
		background: rgba(255, 255, 255, 0.9);
		color: var(--text-tertiary);
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s, color 0.15s, transform 0.15s;
	}

	.image-card:hover .open-btn,
	.open-btn:focus-visible {
		opacity: 1;
	}

	.open-btn:hover {
		color: var(--text-primary);
		transform: scale(1.08);
	}

	:global(.dark) .open-btn {
		background: rgba(0, 0, 0, 0.6);
		border-color: rgba(255, 255, 255, 0.15);
	}

	:global(.dark) .image-card {
		background: linear-gradient(180deg, #2a2a2a 0%, #1f1f1f 100%);
		border-color: rgba(255, 255, 255, 0.08);
		box-shadow:
			0 3px 10px rgba(0, 0, 0, 0.25),
			0 1px 3px rgba(0, 0, 0, 0.15),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
	}

	.image-card:hover {
		transform: translateY(-3px);
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.12),
			0 4px 8px rgba(0, 0, 0, 0.08),
			inset 0 1px 0 rgba(255, 255, 255, 0.9);
	}

	:global(.dark) .image-card:hover {
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.4),
			0 4px 8px rgba(0, 0, 0, 0.25),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
	}

	.image-thumb {
		aspect-ratio: 1;
		overflow: hidden;
		background: var(--bg-tertiary);
	}

	.image-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.2s ease-out;
	}

	.thumb-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-tertiary);
	}

	.image-card:hover .image-thumb img {
		transform: scale(1.05);
	}

	.image-meta {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.5rem 0.625rem 0.625rem;
		min-width: 0;
	}

	.image-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.image-source {
		font-size: 0.65rem;
		color: var(--text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 3rem 1rem;
		color: var(--text-tertiary);
	}

	.empty-state p {
		margin: 0;
		font-size: 0.875rem;
	}
</style>

<script lang="ts">
	import { pop, fadeFast } from '$lib/utils/motion';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { Icon } from '$lib/components/ui';
	import VrmUploader from '$lib/components/vrm/VrmUploader.svelte';
	import type { PersonaPageState } from './persona-page.svelte';

	let { page }: { page: PersonaPageState } = $props();
</script>

<!-- Model Gallery (inline) -->
<div class="model-gallery">
	<div class="gallery-header">
		<span class="settings-label">Avatar</span>
		<button class="btn btn-secondary btn-sm" onclick={() => page.uploadModalOpen = true}>
			<Icon name="upload" size={14} />
			<span>Add Custom</span>
		</button>
	</div>

	<div class="gallery-grid">
		{#each vrmStore.models as model (model.id)}
			<button
				class="model-card"
				class:active={model.id === vrmStore.activeModelId}
				aria-pressed={model.id === vrmStore.activeModelId}
				onclick={() => vrmStore.setActiveModel(model.id)}
			>
				<div class="model-preview">
					{#if model.previewUrl}
						<img src={model.previewUrl} alt={model.name} />
					{:else}
						<Icon name="user" size={24} />
					{/if}
					{#if model.id === vrmStore.activeModelId}
						<div class="active-check">
							<Icon name="check" size={12} strokeWidth={3} />
						</div>
					{/if}
				</div>
				<span class="model-name">{model.name}</span>
			</button>
		{/each}
	</div>
</div>

<!-- Upload Modal -->
{#if page.uploadModalOpen}
	<div
		class="upload-modal"
		transition:fadeFast={{ duration: 180 }}
		role="button"
		tabindex="0"
		onclick={() => page.uploadModalOpen = false}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); page.uploadModalOpen = false; } }}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="upload-content" transition:pop={{ duration: 220, y: 14 }} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="upload-header">
				<h3>Upload Custom Model</h3>
				<button class="btn btn-secondary btn-sm" aria-label="Close model upload" onclick={() => page.uploadModalOpen = false}>
					<Icon name="x" size={20} />
				</button>
			</div>
			<VrmUploader onUpload={page.handleUpload} />
		</div>
	</div>
{/if}

<style>
	/* Model Gallery */
	.model-gallery {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.gallery-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}




	.gallery-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		gap: 0.75rem;
	}

	.model-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: background 0.15s ease, box-shadow 0.15s ease;
		box-shadow: var(--shadow-xs);
	}

	.model-card:hover {
		box-shadow: var(--shadow-sm);
	}

	.model-card.active {
		background: var(--accent-muted);
	}

	.model-card.active .model-name {
		color: var(--accent);
	}

	.model-card.active .model-preview {
		background: var(--bg-primary);
		color: var(--accent);
	}

	.model-preview {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-tertiary);
	}

	.model-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.active-check {
		position: absolute;
		top: 0.375rem;
		right: 0.375rem;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent);
		color: #fff;
		border-radius: var(--radius-full);
		box-shadow: var(--shadow-sm);
	}

	.model-name {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}

	/* Upload Modal */
	.upload-modal {
		position: fixed;
		inset: 0;
		background: rgba(28, 43, 51, 0.28);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 2rem;
	}

	.upload-content {
		background: var(--bg-primary);
		border-radius: var(--radius-xl);
		max-width: 400px;
		width: 100%;
		overflow: hidden;
		box-shadow: var(--shadow-xl);
	}

	.upload-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border-light);
	}

	.upload-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
	}



	.upload-content :global(.uploader) {
		margin: 1rem;
		aspect-ratio: auto;
		min-height: 200px;
	}

	/* Mobile */
	@media (max-width: 900px) {
		.gallery-grid {
			grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
		}
	}

	@media (max-width: 480px) {
		.gallery-grid {
			grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
			gap: 0.5rem;
		}

		.model-card {
			padding: 0.5rem;
		}

		.model-name {
			font-size: 0.7rem;
		}
	}
</style>

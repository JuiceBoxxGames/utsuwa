<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { Icon } from '$lib/components/ui';
	import VrmUploader from '$lib/components/vrm/VrmUploader.svelte';
	import type { PersonaPageState } from './persona-page.svelte';

	let { page }: { page: PersonaPageState } = $props();
</script>

<Dialog.Root bind:open={page.uploadModalOpen}>
<!-- Model Gallery (inline) -->
<div class="model-gallery">
	<div class="gallery-header">
		<span class="settings-label">Avatar</span>
		<Dialog.Trigger class="btn btn-secondary btn-sm" onclick={(event) => event.currentTarget.focus()}>
			<Icon name="upload" size={14} />
			<span>Add Custom</span>
		</Dialog.Trigger>
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

<Dialog.Portal>
 <Dialog.Overlay class="ui-dialog-backdrop" />
 <Dialog.Content class="ui-dialog upload-content">
  <div class="upload-header">
   <Dialog.Title class="upload-title">Upload Custom Model</Dialog.Title>
   <Dialog.Close class="btn btn-ghost btn-icon" aria-label="Close model upload"><Icon name="x" size={16} /></Dialog.Close>
  </div>
  <Dialog.Description class="sr-only">Choose a VRM avatar file from your device.</Dialog.Description>
  <VrmUploader onUpload={page.handleUpload} />
 </Dialog.Content>
</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.upload-content) { --dialog-width: 400px; }
	:global(.upload-title) { margin: 0; font-size: 16px; font-weight: 500; color: var(--text-primary); }
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
		background: var(--control-bg);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: background 0.15s ease, box-shadow 0.15s ease;
		border: 1px solid var(--border-light);
	}

	.model-card:hover {
		background: var(--control-hover);
	}

	.model-card.active {
		background: var(--control-selected);
		border-color: transparent;
	}

	.model-card.active .model-name {
		color: var(--accent);
	}

	.model-card.active .model-preview {
		background: var(--control-bg);
		color: var(--accent);
	}

	.model-preview {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		background: var(--control-selected);
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
		color: var(--accent-contrast);
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

	.upload-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border-light);
	}

	:global(.upload-content .uploader) {
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

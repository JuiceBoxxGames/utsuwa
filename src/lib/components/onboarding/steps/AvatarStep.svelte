<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { vrmGalleryStore } from '$lib/stores/vrm-gallery.svelte';
	import VrmUploader from '$lib/components/vrm/VrmUploader.svelte';

	interface Props {
		onNext: () => void;
		onBack: () => void;
	}

	let { onNext, onBack }: Props = $props();

	let showUploader = $state(false);

	async function handleUpload(file: File) {
		await vrmGalleryStore.addModel(file);
		showUploader = false;
	}

	function selectModel(id: string) {
		vrmGalleryStore.setActiveModel(id);
	}
</script>

<div class="ob-step">
	<div class="ob-head">
		<h2 class="ob-title">Choose your avatar</h2>
		<p class="ob-subtitle">Select a VRM model or upload your own.</p>
	</div>

	<div class="gallery">
		{#each vrmGalleryStore.models as model (model.id)}
			<button
				class="model-card"
				class:active={model.id === vrmGalleryStore.activeModelId}
				onclick={() => selectModel(model.id)}
			>
				<div class="model-preview">
					{#if model.previewUrl}
						<img src={model.previewUrl} alt={model.name} />
					{:else}
						<Icon name="user" size={32} />
					{/if}
					{#if model.id === vrmGalleryStore.activeModelId}
						<div class="active-badge">
							<Icon name="check" size={14} strokeWidth={3} />
						</div>
					{/if}
				</div>
				<span class="model-name">{model.name}</span>
				{#if model.isDefault}
					<span class="default-badge">Default</span>
				{/if}
			</button>
		{/each}

		<button class="upload-card" onclick={() => showUploader = true}>
			<div class="upload-icon">
				<Icon name="upload" size={24} />
			</div>
			<span class="upload-text">Upload VRM</span>
		</button>
	</div>

	{#if showUploader}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="uploader-overlay" onclick={() => showUploader = false}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="uploader-container" onclick={(e) => e.stopPropagation()}>
				<div class="uploader-header">
					<h3>Upload VRM model</h3>
					<button class="close-btn" onclick={() => showUploader = false}>
						<Icon name="x" size={18} />
					</button>
				</div>
				<VrmUploader onUpload={handleUpload} />
			</div>
		</div>
	{/if}

	<div class="ob-actions ob-actions--split">
		<button class="btn btn-secondary" onclick={onBack}>
			<Icon name="chevron-left" size={16} />
			Back
		</button>
		<button class="btn btn-primary" onclick={onNext}>
			Next
			<Icon name="chevron-right" size={16} />
		</button>
	</div>
</div>

<style>
	.gallery {
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
		background: var(--bg-secondary);
		border: 1px solid transparent;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		cursor: pointer;
		transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
	}

	.model-card:hover {
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}

	.model-card:active {
		transform: scale(0.99);
	}

	.model-card.active {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-muted), var(--shadow-sm);
	}

	.model-preview {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		background: var(--bg-tertiary);
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

	.active-badge {
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

	.default-badge {
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: var(--text-tertiary);
		background: var(--bg-tertiary);
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
	}

	.upload-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem;
		min-height: 120px;
		background: var(--bg-secondary);
		border: 1px dashed var(--border-light);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s, color 0.15s;
	}

	.upload-card:hover {
		border-color: var(--accent);
		background: var(--accent-subtle);
	}

	.upload-icon {
		color: var(--text-tertiary);
		transition: color 0.15s;
	}

	.upload-card:hover .upload-icon {
		color: var(--accent);
	}

	.upload-text {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-tertiary);
		transition: color 0.15s;
	}

	.upload-card:hover .upload-text {
		color: var(--accent-text);
	}

	.uploader-overlay {
		position: fixed;
		inset: 0;
		background: var(--dialog-backdrop);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
	}

	.uploader-container {
		background: var(--bg-primary);
		border-radius: var(--radius-xl);
		max-width: 400px;
		width: 90%;
		overflow: hidden;
		box-shadow: var(--shadow-xl);
	}

	.uploader-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border-subtle);
	}

	.uploader-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: var(--bg-secondary);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.close-btn:hover {
		background: color-mix(in srgb, var(--bg-secondary), var(--text-primary) 8%);
		color: var(--text-primary);
	}

	.uploader-container :global(.uploader) {
		margin: 1rem;
	}
</style>

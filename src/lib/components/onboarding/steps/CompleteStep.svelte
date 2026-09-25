<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { modulesStore } from '$lib/stores/modules.svelte';
	import { vrmGalleryStore } from '$lib/stores/vrm-gallery.svelte';

	interface Props {
		characterName: string;
		onComplete: () => void;
		onBack: () => void;
	}

	let { characterName, onComplete, onBack }: Props = $props();

	const activeModel = $derived(
		vrmGalleryStore.models.find((m) => m.id === vrmGalleryStore.activeModelId)
	);
</script>

<div class="ob-step ob-step--center">
	<div class="avatar">
		{#if activeModel?.previewUrl}
			<img src={activeModel.previewUrl} alt={activeModel.name} />
		{:else}
			<div class="avatar-fallback">
				<Icon name="user" size={40} />
			</div>
		{/if}
	</div>

	<div class="ob-head">
		<h2 class="ob-title">Meet {characterName}</h2>
		<p class="ob-subtitle">{modulesStore.isModuleEnabled('consciousness') ? 'Your companion is ready for a conversation.' : 'Your companion is set up. Connect a chat model in Settings when you are ready to talk.'}</p>
	</div>

	<button class="btn btn-primary btn-lg btn-block" onclick={onComplete}>
		{modulesStore.isModuleEnabled('consciousness') ? 'Start chatting' : 'Open companion'}
		<Icon name="arrow-right" size={16} />
	</button>
	<button class="btn btn-ghost" onclick={onBack}>Back</button>
</div>

<style>
	.avatar {
		width: 104px;
		height: 104px;
		border-radius: var(--radius-xl);
		overflow: hidden;
		background: var(--bg-secondary);
		box-shadow: var(--shadow-md);
	}

	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.avatar-fallback {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-tertiary);
		background: var(--bg-secondary);
	}
</style>

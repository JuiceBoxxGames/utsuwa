<script lang="ts">
	import { pop, fadeFast } from '$lib/utils/motion';
	import { personaStore } from '$lib/stores/persona.svelte';
	import { characterStore } from '$lib/stores/character.svelte';

	import { Icon } from '$lib/components/ui';
	import { getCompletedEvents } from '$lib/services/storage/events';

	import { createPersonaPageState } from './persona-page.svelte';
	import AppModeSection from './AppModeSection.svelte';
	import AvatarGallery from './AvatarGallery.svelte';
	import CorePersonality from './CorePersonality.svelte';
	import StatsPanel from './StatsPanel.svelte';

	const page = createPersonaPageState();

	// Load completed events from database
	$effect(() => {
		if (page.isDatingSimMode) {
			getCompletedEvents().then(records => {
				page.completedEventRecords = records;
			});
		}
	});

	// Load form values from store when character is ready
	$effect(() => {
		if (characterStore.isReady) {
			page.formName = personaStore.name;
			page.formSystemPrompt = personaStore.systemPrompt;
		}
	});
</script>

<div class="character-screen">
	<!-- Header -->
	<header class="screen-header">
		<input
			type="text"
			class="name-input"
			bind:value={page.formName}
			placeholder="Character Name" aria-label="Character name"
			onblur={page.saveName}
		/>
	</header>

	<!-- Main Content -->
	<div class="main-content">
		<!-- Left Panel: Character Preview -->
		<div class="character-panel">
			<AppModeSection {page} />
			<AvatarGallery {page} />
			<CorePersonality {page} />
		</div>

		<StatsPanel {page} />
	</div>

	<!-- Mode Change Confirmation Modal -->
	{#if page.modeConfirmOpen}
		<div
			class="confirm-modal"
			transition:fadeFast={{ duration: 180 }}
			role="button"
			tabindex="0"
			onclick={page.cancelModeChange}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); page.cancelModeChange(); } }}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="confirm-content" transition:pop={{ duration: 220, y: 14 }} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
				<div class="confirm-icon">
					<Icon name="alert" size={32} />
				</div>
				<h3 class="confirm-title">Switch Mode?</h3>
				<p class="confirm-message">
					Switching modes frequently can lead to unexpected results and disrupt natural progression. Are you sure you want to continue?
				</p>
				<div class="confirm-actions">
					<button class="btn btn-secondary" onclick={page.cancelModeChange}>
						Cancel
					</button>
					<button class="btn btn-primary" onclick={page.confirmModeChange}>
						Switch Mode
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.character-screen {
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Header */
	.screen-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border-light);
		margin-bottom: 1rem;
		flex-shrink: 0;
	}

	.name-input {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text-primary);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 0.25rem 0;
		width: auto;
		min-width: 120px;
		max-width: 280px;
		transition: border-color 0.15s ease;
	}

	.name-input:hover {
		border-bottom-color: var(--border-light);
	}

	.name-input:focus {
		outline: none;
		border-bottom-color: var(--accent);
	}

	/* Main Content */
	.main-content {
		flex: 1;
		display: flex;
		gap: 1.5rem;
		min-height: 0;
		overflow: hidden;
	}

	/* Character Panel (Left) */
	.character-panel {
		flex: 1 1 55%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
	}

	.character-panel > :global(*) {
		flex-shrink: 0;
	}

	/* Confirmation Modal */
	.confirm-modal {
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

	.confirm-content {
		background: var(--bg-primary);
		border-radius: var(--radius-xl);
		max-width: 360px;
		width: 100%;
		padding: 1.5rem;
		text-align: center;
		box-shadow: var(--shadow-xl);
	}

	.confirm-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		background: var(--accent-subtle);
		border-radius: var(--radius-full);
		color: var(--accent);
		margin-bottom: 1rem;
	}

	.confirm-title {
		margin: 0 0 0.75rem;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.confirm-message {
		margin: 0 0 1.5rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.confirm-actions {
		display: flex;
		gap: 0.75rem;
	}






	/* Mobile */
	@media (max-width: 900px) {
		.name-input {
			font-size: 1.25rem;
		}

		.main-content {
			flex-direction: column;
			overflow-y: auto;
		}

		.character-panel {
			flex: none;
		}
	}
</style>

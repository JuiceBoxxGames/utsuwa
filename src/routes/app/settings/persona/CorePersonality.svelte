<script lang="ts">
	import { slideOpen } from '$lib/utils/motion';
	import { Icon } from '$lib/components/ui';
	import type { PersonaPageState } from './persona-page.svelte';

	let { page }: { page: PersonaPageState } = $props();
</script>

<!-- Core Personality (collapsible) -->
<div class="personality-section">
	<button class="personality-toggle" aria-expanded={page.personalityExpanded} onclick={() => page.personalityExpanded = !page.personalityExpanded}>
		<Icon name="sparkles" size={16} />
		<span>Core Personality</span>
		<Icon name={page.personalityExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
	</button>
	{#if page.personalityExpanded}
		<div class="personality-content" transition:slideOpen>
			<textarea
				class="settings-field" aria-label="Core personality"
				bind:value={page.formSystemPrompt}
				placeholder="Personality traits, speaking style, background..."
				rows="8"
				onblur={page.saveSystemPrompt}
			></textarea>
		</div>
	{/if}
</div>

<style>
	/* Personality Section */
	.personality-section {
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: var(--shadow-sm);
	}

	.personality-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.875rem 1rem;
		background: transparent;
		border: none;
		color: var(--text-secondary);
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.personality-toggle:hover {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	.personality-toggle span {
		flex: 1;
		text-align: left;
	}

	.personality-content {
		padding: 0 1rem 1rem;
	}



</style>

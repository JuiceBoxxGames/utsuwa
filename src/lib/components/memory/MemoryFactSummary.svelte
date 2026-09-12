<script lang="ts">
	import type { Fact } from '$lib/types/memory';
	let {
		fact
	}: {
		fact: Pick<Fact, 'content' | 'category' | 'importance'> & Partial<Pick<Fact, 'confidence'>>;
	} = $props();
	const labels = {
		user: 'About you',
		relationship: 'Relationship',
		shared_experience: 'Shared experience'
	};
</script>

<p class="fact-content">{fact.content}</p>
<p class="metadata">
	{labels[fact.category]} · Importance {fact.importance}{#if fact.confidence !== undefined}
		· Confidence {Math.round(fact.confidence * 100)}%{/if}
</p>

<style>
	.fact-content {
		margin: 0 0 0.5rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.metadata {
		margin: 0.5rem 0;
		color: var(--text-secondary);
		font-size: 0.75rem;
	}
</style>

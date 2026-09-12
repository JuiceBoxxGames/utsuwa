<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		description,
		children,
		actions
	}: {
		title: string;
		description?: string;
		children: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<section class="settings-section">
	<header>
		<div>
			<h3>{title}</h3>
			{#if description}<p>{description}</p>{/if}
		</div>
		{@render actions?.()}
	</header>
	{@render children()}
</section>

<style>
	.settings-section {
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		box-shadow: var(--shadow-sm);
		min-width: 0;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	h3 {
		margin: 0;
		color: var(--text-primary);
		font-size: 0.9375rem;
		font-weight: 600;
	}
	p {
		margin: 0.25rem 0 0;
		color: var(--text-secondary);
		font-size: 0.8125rem;
	}
	@media (max-width: 640px) {
		.settings-section {
			padding: 1rem;
		}
	}
</style>

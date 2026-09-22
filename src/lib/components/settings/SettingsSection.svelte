<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		description,
		children,
		actions,
		outlined = false
	}: {
		title: string;
		description?: string;
		children: Snippet;
		actions?: Snippet;
		outlined?: boolean;
	} = $props();
</script>

<section class="settings-section" class:outlined>
	<header>
		<div>
			<h3>{title}</h3>
			{#if description}<p>{description}</p>{/if}
		</div>
		{@render actions?.()}
	</header>
	<div class="settings-group">{@render children()}</div>
</section>

<style>
	.settings-section { flex-shrink: 0; min-width: 0; }
	header { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 12px; margin: 0 16px 12px; }
	h3 { margin: 0; color: var(--text-secondary); font-size: 14px; font-weight: 500; }
	p { margin: 4px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.45; }
	.settings-group { min-width: 0; padding: 16px; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--bg-primary); box-shadow: none; }
	.outlined header { margin-left: 0; }
	.outlined .settings-group { background: var(--bg-secondary); }
	@media (max-width: 640px) { header { margin-left: 12px; } .settings-group { padding: 12px; } }
</style>

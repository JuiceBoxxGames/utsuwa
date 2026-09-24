<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { page } from '$app/state';
	import { localPath } from '$lib/config/links';
	import type { DocsNavSection } from '$lib/config/docs-nav';

	interface Props {
		section: DocsNavSection;
	}

	let { section }: Props = $props();
</script>

<div class="section">
	<div class="section-header">
		<Icon name={section.icon} size={14} />
		<span>{section.title}</span>
	</div>
	<ul class="section-items">
		{#each section.items as item}
			{@const href = localPath('docs', `/${item.slug}`)}
			{@const isActive = page.url.pathname === href}
			<li>
				<a {href} class="section-link" class:active={isActive} aria-current={isActive ? 'page' : undefined}>
					{item.title}
				</a>
			</li>
		{/each}
	</ul>
</div>

<style>
	.section-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px;
		margin-bottom: 2px;
		color: var(--text-secondary);
		font-size: 13px;
		font-weight: 500;
		line-height: 20px;
	}

	.section-items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.section-link {
		display: flex;
		align-items: center;
		min-height: 32px;
		padding: 6px 10px 6px 32px;
		border-radius: var(--control-radius);
		color: var(--t3-sidebar-muted-foreground);
		font-size: 14px;
		line-height: 20px;
		text-decoration: none;
		transition: color 150ms, background 150ms;
	}

	.section-link:hover {
		color: var(--t3-sidebar-foreground);
		background: var(--t3-sidebar-row-hover);
	}

	.section-link.active {
		color: var(--t3-sidebar-foreground);
		background: var(--t3-sidebar-row-selected);
		font-weight: 500;
	}

	@media (max-width: 768px) {
		.section-link {
			min-height: 44px;
		}
	}
</style>

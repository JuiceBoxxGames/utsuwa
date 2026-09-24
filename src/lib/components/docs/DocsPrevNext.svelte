<script lang="ts">
	import { getPrevNext } from '$lib/utils/docs-nav';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { localPath } from '$lib/config/links';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	const { prev, next } = $derived(getPrevNext(slug));
</script>

<nav class="prev-next" aria-label="Page navigation">
	{#if prev}
		<a href={localPath('docs', `/${prev.slug}`)} class="nav-link prev">
			<Icon name="chevron-left" size={16} />
			<div class="nav-text">
				<span class="label">Previous</span>
				<span class="title">{prev.title}</span>
			</div>
		</a>
	{:else}
		<div></div>
	{/if}

	{#if next}
		<a href={localPath('docs', `/${next.slug}`)} class="nav-link next">
			<div class="nav-text">
				<span class="label">Next</span>
				<span class="title">{next.title}</span>
			</div>
			<Icon name="chevron-right" size={16} />
		</a>
	{/if}
</nav>

<style>
	.prev-next {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-top: 48px;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 64px;
		padding: 12px 16px;
		border-radius: var(--control-radius);
		background: var(--bg-primary);
		color: var(--text-secondary);
		text-decoration: none;
		transition: background 150ms;
	}

	.nav-link:hover {
		background: var(--control-hover);
	}

	.prev {
		justify-content: flex-start;
	}

	.next {
		justify-content: flex-end;
		grid-column: 2;
	}

	.nav-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.next .nav-text {
		text-align: right;
	}

	.label {
		color: var(--text-secondary);
		font-size: 13px;
		line-height: 18px;
	}

	.title {
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 500;
		line-height: 20px;
	}

	@media (max-width: 640px) {
		.prev-next {
			grid-template-columns: 1fr;
		}

		.next {
			grid-column: 1;
			justify-content: space-between;
		}

		.next .nav-text {
			text-align: left;
		}
	}
</style>

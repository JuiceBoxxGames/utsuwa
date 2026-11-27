<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import ToolsVignette from './vignettes/ToolsVignette.svelte';
	import MemoryVignette from './vignettes/MemoryVignette.svelte';
	import StagesVignette from './vignettes/StagesVignette.svelte';
	import LocalVignette from './vignettes/LocalVignette.svelte';
	import RemindVignette from './vignettes/RemindVignette.svelte';
	import OverlayVignette from './vignettes/OverlayVignette.svelte';

	const cards = [
		{ id: 'tools', title: m.adv_tools_title(), body: m.adv_tools_body(), vignette: ToolsVignette },
		{ id: 'memory', title: m.adv_memory_title(), body: m.adv_memory_body(), vignette: MemoryVignette },
		{ id: 'stages', title: m.adv_stages_title(), body: m.adv_stages_body(), vignette: StagesVignette },
		{ id: 'local', title: m.adv_local_title(), body: m.adv_local_body(), vignette: LocalVignette },
		{ id: 'remind', title: m.adv_remind_title(), body: m.adv_remind_body(), vignette: RemindVignette },
		{ id: 'overlay', title: m.adv_overlay_title(), body: m.adv_overlay_body(), vignette: OverlayVignette }
	];
</script>

<section class="advanced site-container" aria-labelledby="advanced-title">
	<div class="head">
		<p class="site-eyebrow">{m.adv_eyebrow()}</p>
		<h2 id="advanced-title" class="site-h2">{m.adv_title()}</h2>
	</div>
	<div class="bento">
		{#each cards as card (card.id)}
			<article class="card card--{card.id} site-panel">
				<div class="stage"><card.vignette /></div>
				<div class="copy">
					<h3>{card.title}</h3>
					<p>{card.body}</p>
				</div>
			</article>
		{/each}
	</div>
</section>

<style>
	.advanced {
		padding-top: var(--site-section);
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 14px;
		max-width: 720px;
		margin-bottom: 40px;
	}

	.bento {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 16px;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 16px 16px 24px;
		border-radius: 24px;
		grid-column: span 2;
	}

	.card--tools {
		grid-column: span 4;
	}

	.card--overlay {
		grid-column: span 6;
		flex-direction: row;
		align-items: center;
	}

	.stage {
		height: 240px;
	}

	.card--overlay .stage {
		flex: 1.6;
		height: 300px;
	}

	.copy {
		padding: 0 8px;
	}

	.card--overlay .copy {
		flex: 1;
		padding: 0 24px;
	}

	h3 {
		margin: 0 0 6px;
		font-size: 18px;
		font-weight: 500;
		letter-spacing: -0.01em;
	}

	p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 15px;
		line-height: 1.5;
	}

	@media (max-width: 960px) {
		.bento {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.card,
		.card--tools {
			grid-column: span 1;
		}

		.card--tools,
		.card--overlay {
			grid-column: span 2;
		}
	}

	@media (max-width: 640px) {
		.bento {
			grid-template-columns: 1fr;
		}

		.card,
		.card--tools,
		.card--overlay {
			grid-column: span 1;
			flex-direction: column;
			align-items: stretch;
		}

		.card--overlay .stage {
			flex: none;
			height: 240px;
		}

		.card--overlay .copy {
			padding: 0 8px;
		}
	}
</style>

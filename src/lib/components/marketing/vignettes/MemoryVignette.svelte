<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import { m } from '$lib/paraglide/messages';
	import { stepLoop } from './step-loop';

	// 0 graph forms, 1 settled, 2 a question, 3 recalled by meaning
	// Declared in markup so Svelte keeps the [data-step] rules; stepLoop drives it
	let step = $state('0');
	const durations = [1300, 800, 1200, 2700];
	const nodes = [
		{ id: 'sister', x: 22, y: 30, label: () => m.adv_memory_sister() },
		{ id: 'cat', x: 76, y: 28, label: () => m.adv_memory_cat() },
		{ id: 'trip', x: 18, y: 74, label: () => m.adv_memory_trip() },
		{ id: 'runs', x: 80, y: 72, label: () => m.adv_memory_runs() },
		{ id: 'ramen', x: 50, y: 88, label: () => m.adv_memory_ramen() }
	];
</script>

<div class="vg memory" data-vignette="memory" data-step={step} data-last={durations.length - 1} use:stepLoop={durations} aria-hidden="true">
	<svg class="edges" viewBox="0 0 100 100" preserveAspectRatio="none">
		{#each nodes as n, i (n.id)}
			<line x1="50" y1="54" x2={n.x} y2={n.y} class:hot={n.id === 'cat'} style="--d: {i * 90}ms" pathLength="1" />
		{/each}
	</svg>
	<span class="node you" style="left: 50%; top: 54%">{m.adv_memory_you()}</span>
	{#each nodes as n, i (n.id)}
		<span class="node vg-chip" class:hot={n.id === 'cat'} style="left: {n.x}%; top: {n.y}%; --d: {i * 90}ms">{n.label()}</span>
	{/each}
	<span class="query vg-chip vg-in"><SearchIcon size={12} />{m.adv_memory_query()}</span>
</div>

<style>
	.edges {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	line {
		stroke: var(--control-selected);
		stroke-width: 0.6;
		vector-effect: non-scaling-stroke;
		stroke-dasharray: 1;
		stroke-dashoffset: 0;
		transition:
			stroke 0.3s ease,
			opacity 0.3s ease;
	}

	.node {
		position: absolute;
		transform: translate(-50%, -50%);
		transition:
			opacity 0.3s ease,
			background 0.3s ease,
			color 0.3s ease,
			box-shadow 0.3s ease;
		font-size: 12px;
	}

	.you {
		padding: 6px 12px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
	}

	.query {
		position: absolute;
		left: 50%;
		top: 10px;
		translate: -50% 0;
		background: var(--bg-primary);
		font-size: 12px;
	}

	/* The graph draws itself each time the loop comes back to step 0 */
	.memory[data-step='0'] line {
		animation: draw 0.7s var(--ease-brand) var(--d) both;
	}
	.memory[data-step='0'] .node.vg-chip {
		animation: pop 0.4s var(--ease-brand) var(--d) both;
	}
	@keyframes draw {
		from {
			stroke-dashoffset: 1;
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.85);
		}
	}
	.memory:is([data-step='2'], [data-step='3']) .query {
		opacity: 1;
		transform: none;
	}
	.memory[data-step='3'] .node:not(.hot):not(.you) {
		opacity: 0.45;
	}
	.memory[data-step='3'] .node.hot {
		background: var(--accent);
		color: var(--accent-contrast);
		box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 14%, transparent);
	}
	.memory[data-step='3'] line.hot {
		stroke: var(--text-primary);
		stroke-width: 1.2;
	}
	.memory[data-step='3'] line:not(.hot) {
		opacity: 0.4;
	}
</style>

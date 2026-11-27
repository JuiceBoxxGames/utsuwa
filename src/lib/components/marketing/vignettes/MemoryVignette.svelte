<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import { m } from '$lib/paraglide/messages';
	import { stepLoop } from './step-loop';

	// 0 the web weaves itself, 1 it settles, 2 a question lights a path through it, 3 the memory it meant
	// Declared in markup so Svelte keeps the [data-step] rules; stepLoop drives it
	let step = $state('0');
	const durations = [1500, 500, 1000, 2600];

	type N = { id: string; x: number; y: number; label?: () => string };
	const nodes: N[] = [
		{ id: 'you', x: 50, y: 56, label: () => m.adv_memory_you() },
		{ id: 'sister', x: 22, y: 30, label: () => m.adv_memory_sister() },
		{ id: 'mom', x: 12, y: 62, label: () => m.adv_memory_mom() },
		{ id: 'cat', x: 82, y: 28, label: () => m.adv_memory_cat() },
		{ id: 'trip', x: 86, y: 70, label: () => m.adv_memory_trip() },
		{ id: 'ramen', x: 62, y: 90, label: () => m.adv_memory_ramen() },
		{ id: 'runs', x: 28, y: 88, label: () => m.adv_memory_runs() },
		{ id: 'jp', x: 52, y: 12, label: () => m.adv_memory_japanese() },
		// smaller memories that fill out the web
		{ id: 'a', x: 36, y: 46 }, { id: 'b', x: 66, y: 40 }, { id: 'c', x: 70, y: 64 }, { id: 'd', x: 42, y: 72 },
		{ id: 'e', x: 18, y: 46 }, { id: 'f', x: 94, y: 48 }, { id: 'g', x: 36, y: 22 }, { id: 'h', x: 78, y: 86 },
		{ id: 'i', x: 8, y: 84 }, { id: 'j', x: 92, y: 12 }, { id: 'k', x: 58, y: 30 }, { id: 'l', x: 50, y: 76 }
	];
	// Squeeze the web into the top three quarters so the question has room below it
	for (const n of nodes) n.y = 6 + n.y * 0.72;
	const at = Object.fromEntries(nodes.map((n) => [n.id, n]));
	const links: [string, string][] = [
		['you', 'a'], ['you', 'b'], ['you', 'c'], ['you', 'd'], ['you', 'k'], ['you', 'l'],
		['a', 'sister'], ['a', 'e'], ['e', 'mom'], ['g', 'sister'], ['g', 'jp'], ['k', 'jp'], ['k', 'b'],
		['b', 'cat'], ['b', 'f'], ['f', 'cat'], ['f', 'trip'], ['c', 'trip'], ['c', 'h'], ['h', 'ramen'],
		['l', 'ramen'], ['d', 'runs'], ['d', 'l'], ['runs', 'i'], ['mom', 'i'], ['jp', 'j'], ['cat', 'j'],
		['trip', 'h'], ['sister', 'mom'], ['a', 'g'], ['e', 'runs']
	];
	// the path the question travels: you -> a related memory -> the cat
	const hot = new Set(['you-b', 'b-cat']);
</script>

<div class="vg memory" data-vignette="memory" data-step={step} data-last={durations.length - 1} use:stepLoop={durations} aria-hidden="true">
	<svg class="web" viewBox="0 0 100 100" preserveAspectRatio="none">
		{#each links as [a, b], i (a + b)}
			<line
				x1={at[a].x}
				y1={at[a].y}
				x2={at[b].x}
				y2={at[b].y}
				pathLength="1"
				class:hot={hot.has(`${a}-${b}`)}
				style="--d: {i * 35}ms"
			/>
		{/each}
	</svg>
	{#each nodes as n, i (n.id)}
		{#if n.label}
			<span
				class="label vg-chip"
				class:you={n.id === 'you'}
				class:hot={n.id === 'cat'}
				style="left: {n.x}%; top: {n.y}%; --d: {i * 60}ms">{n.label()}</span
			>
		{:else}
			<span class="dot" class:hot={n.id === 'b'} style="left: {n.x}%; top: {n.y}%; --d: {i * 45}ms"></span>
		{/if}
	{/each}
	<span class="query vg-chip"><SearchIcon size={12} />{m.adv_memory_query()}</span>
</div>

<style>
	.web {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	line {
		stroke: var(--control-selected);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
		stroke-dasharray: 1;
		stroke-dashoffset: 0;
		transition:
			stroke 0.3s ease,
			opacity 0.3s ease;
	}

	.label,
	.dot {
		position: absolute;
		transform: translate(-50%, -50%);
		transition:
			opacity 0.3s ease,
			background 0.3s ease,
			color 0.3s ease,
			box-shadow 0.3s ease;
	}

	.label {
		padding: 3px 8px;
		font-size: 11px;
		background: var(--bg-primary);
	}

	.label.you {
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--bg-page);
		box-shadow: inset 0 0 0 1.5px var(--text-secondary);
	}

	.query {
		position: absolute;
		left: 50%;
		bottom: 10px;
		translate: -50% 0;
		background: var(--bg-primary);
		box-shadow: 0 2px 10px rgb(0 0 0 / 0.08);
		font-size: 12px;
		opacity: 0;
		transform: translateY(6px);
		transition:
			opacity 0.3s ease,
			transform 0.3s var(--ease-brand);
	}

	/* 0: the web weaves itself in */
	.memory[data-step='0'] line {
		animation: draw 0.6s var(--ease-brand) var(--d) both;
	}
	.memory[data-step='0'] :is(.label:not(.you), .dot) {
		animation: pop 0.35s var(--ease-brand) var(--d) both;
	}
	@keyframes draw {
		from {
			stroke-dashoffset: 1;
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.6);
		}
	}

	/* 2: the question runs along a path */
	.memory:is([data-step='2'], [data-step='3']) .query {
		opacity: 1;
		transform: none;
	}
	.memory:is([data-step='2'], [data-step='3']) line.hot {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.memory[data-step='2'] line.hot {
		animation: draw 0.7s var(--ease-brand) both;
	}
	.memory:is([data-step='2'], [data-step='3']) .dot.hot {
		background: var(--accent);
		box-shadow: none;
	}

	/* 3: the memory it meant; everything else steps back */
	.memory[data-step='3'] line:not(.hot),
	.memory[data-step='3'] .dot:not(.hot) {
		opacity: 0.35;
	}
	.memory[data-step='3'] .label:not(.hot):not(.you) {
		opacity: 0.4;
	}
	.memory[data-step='3'] .label.hot {
		background: var(--accent);
		color: var(--accent-contrast);
		box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 14%, transparent);
	}
</style>

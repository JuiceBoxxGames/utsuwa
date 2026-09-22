<script lang="ts">
	import Select from '$lib/components/ui/Select.svelte';
	import { onMount, untrack } from 'svelte';
	import type ForceGraph from 'force-graph';
	import type { LinkObject } from 'force-graph';
	import type { FactCategory } from '$lib/types/memory';
	import { Button, Icon } from '$lib/components/ui';
	import MemoryFactSummary from './MemoryFactSummary.svelte';
	import {
		getFactsWithEmbeddings,
		buildGraph,
		filterGraph,
		getConnectedNodes,
		categoryColors,
		type GraphData,
		type GraphNode
	} from '$lib/services/memory-graph';

	let {
		selectedId = $bindable(null),
		categories = $bindable<FactCategory[]>(['user', 'relationship', 'shared_experience']),
		onInspect,
		onOpenFacts,
		expanded = false
	}: {
		selectedId?: number | null;
		categories?: FactCategory[];
		onInspect: (id: number) => void;
		onOpenFacts: () => void;
		expanded?: boolean;
	} = $props();
	let container: HTMLDivElement;
	let graph = $state.raw<ForceGraph<GraphNode, LinkObject<GraphNode>> | null>(null);
	let fullData = $state<GraphData>({ nodes: [], links: [] });
	let loading = $state(true);
	let error = $state('');
	let dark = $state(false);
	let reducedMotion = $state(false);
	const categoryOptions: { value: FactCategory; label: string }[] = [
		{ value: 'user', label: 'About you' },
		{ value: 'relationship', label: 'Relationship' },
		{ value: 'shared_experience', label: 'Shared' }
	];
	const data = $derived(
		filterGraph(fullData, { categories: new Set(categories), minSimilarity: 0.5 })
	);
	const selected = $derived(data.nodes.find((node) => node.id === selectedId));
	let destroyed = false;
	let fitAfterLayout = true;

	function fit() {
		const bounds = graph?.getGraphBbox();
		if (!bounds || ![...bounds.x, ...bounds.y].every(Number.isFinite)) return false;
		graph?.zoomToFit(reducedMotion ? 0 : 300, 40);
		return true;
	}
	function toggleCategory(category: FactCategory) {
		categories = categories.includes(category)
			? categories.filter((value) => value !== category)
			: [...categories, category];
	}
	function selectAt(event: MouseEvent) {
		if (!graph) return;
		const canvas = container.querySelector('canvas');
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const touch = event instanceof PointerEvent && event.pointerType === 'touch';
		const radius = Math.max(graph.nodeRelSize() * graph.zoom(), touch ? 22 : 4);
		let nearest: number | null = null;
		let distance = radius;
		// A quick tap can precede force-graph's hover update. Resolve the click
		// from current coordinates; its click callbacks still exclude drags.
		for (const node of graph.graphData().nodes) {
			if (node.x === undefined || node.y === undefined) continue;
			const position = graph.graph2ScreenCoords(node.x, node.y);
			const delta = Math.hypot(
				event.clientX - rect.left - position.x,
				event.clientY - rect.top - position.y
			);
			if (delta <= distance) {
				nearest = node.id;
				distance = delta;
			}
		}
		selectedId = selectedId === nearest ? null : nearest;
	}

	$effect(() => {
		const current = graph;
		const next = data;
		if (current)
			untrack(() => {
				// force-graph mutates coordinates and link endpoints. Keep its copy separate.
				current.graphData({
					nodes: next.nodes.map((node) => ({ ...node })),
					links: next.links.map((link) => ({ ...link }))
				});
			});
	});
	$effect(() => {
		const current = graph;
		const active = selected;
		const connected = active ? getConnectedNodes(data, active.id) : null;
		const isDark = dark;
		const reduce = reducedMotion;
		if (!current) return;
		const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
		const touches = (link: LinkObject<GraphNode>) =>
			[link.source, link.target].some(
				(node) => (typeof node === 'object' ? node.id : node) === active?.id
			);
		current
			.nodeColor((node) =>
				!active || node.id === active.id || connected?.has(node.id)
					? categoryColors[node.category]
					: isDark
						? '#333'
						: '#ddd'
			)
			.linkColor((link) =>
				active && touches(link)
					? accent
					: isDark
						? `rgba(255,255,255,${active ? 0.05 : 0.2})`
						: `rgba(0,0,0,${active ? 0.05 : 0.15})`
			)
			.linkWidth((link) => (active ? (touches(link) ? 2 : 0.5) : 1))
			.linkDirectionalParticles(reduce ? 0 : 2)
			.linkDirectionalParticleColor(() => accent)
			.cooldownTicks(reduce ? 0 : 160);
	});

	async function load() {
		loading = true;
		error = '';
		try {
			const facts = await getFactsWithEmbeddings();
			if (destroyed) return;
			fullData = buildGraph(facts, 0.5);
			if (facts.length && !graph) {
				const ForceGraph = (await import('force-graph')).default;
				if (destroyed) return;
				graph = new ForceGraph<GraphNode, LinkObject<GraphNode>>(container)
					.width(container.clientWidth)
					.height(container.clientHeight)
					.backgroundColor('transparent')
					.nodeRelSize(3)
					.nodeVal(1)
					.nodeId('id')
					.linkSource('source')
					.linkTarget('target')
					.linkDirectionalParticleSpeed(0.005)
					.linkDirectionalParticleWidth(1.5)
					.d3AlphaDecay(0.02)
					.d3VelocityDecay(0.3)
					.warmupTicks(reducedMotion ? 80 : 0)
					.onEngineStop(() => {
						// Fit after the layout settles, including its reduced-motion warmup.
						if (fitAfterLayout && fit()) fitAfterLayout = false;
					})
					.onNodeClick((_node, event) => selectAt(event))
					.onLinkClick((_link, event) => selectAt(event))
					.onBackgroundClick(selectAt);
				const canvas = container.querySelector('canvas');
				canvas?.setAttribute(
					'aria-label',
					'Memory connections. Use Inspect a memory to select a node with the keyboard.'
				);
				canvas?.setAttribute('role', 'img');
			}
		} catch {
			if (!destroyed)
				error =
					'Could not load the memory graph. Your saved memories are still available in Facts.';
		} finally {
			if (!destroyed) loading = false;
		}
	}

	onMount(() => {
		const media = matchMedia('(prefers-reduced-motion: reduce)');
		const motion = () => (reducedMotion = media.matches);
		const theme = () => (dark = document.documentElement.classList.contains('dark'));
		motion();
		theme();
		media.addEventListener('change', motion);
		const themes = new MutationObserver(theme);
		themes.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		const resize = new ResizeObserver(() => {
			if (graph && container.clientWidth && container.clientHeight) {
				graph.width(container.clientWidth).height(container.clientHeight);
			}
		});
		resize.observe(container);
		const visibility = () => (document.hidden ? graph?.pauseAnimation() : graph?.resumeAnimation());
		document.addEventListener('visibilitychange', visibility);
		void load();
		return () => {
			destroyed = true;
			resize.disconnect();
			themes.disconnect();
			media.removeEventListener('change', motion);
			document.removeEventListener('visibilitychange', visibility);
			graph?._destructor();
		};
	});
</script>

<div class="memory-graph" class:expanded>
	<div class="controls">
		<div class="category-toggles" role="group" aria-label="Graph categories">
			{#each categoryOptions as category}<Button
					variant={categories.includes(category.value) ? 'secondary' : 'ghost'}
					size="sm"
					aria-pressed={categories.includes(category.value)}
					onclick={() => toggleCategory(category.value)}
					><span class="category-dot" style:background={categoryColors[category.value]}
					></span>{category.label}</Button
				>{/each}
		</div>
		<Button
			variant="ghost"
			size="sm"
			onclick={() => {
				selectedId = null;
				fit();
			}}
			disabled={loading || !data.nodes.length}><Icon name="refresh" size={14} />Reset view</Button
		>
	</div>
	<label class="memory-picker"
		>Inspect a memory
		<Select label="Inspect a memory" value={selected ? String(selected.id) : ''} onchange={(value) => selectedId = value ? Number(value) : null} disabled={!data.nodes.length} options={[{ value: '', label: 'Select a memory' }, ...data.nodes.map(node => ({ value: String(node.id), label: node.content.length > 90 ? `${node.content.slice(0, 90)}…` : node.content }))]} />
	</label>
	<div class="graph-layout" class:has-selection={!!selected}>
		<div class="graph-container" bind:this={container}>
			{#if loading}<div class="graph-message" role="status">Loading graph...</div>
			{:else if error}<div class="graph-message" role="alert">
					<p>{error}</p>
					<Button variant="secondary" onclick={load}>Retry graph</Button>
				</div>
			{:else if !fullData.nodes.length}<div class="graph-message">
					<Icon name="brain" size={28} />
					<h3>No connected memories yet</h3>
					<p>
						The graph shows memories once their connections are ready. You can still read and manage
						all saved memories in Facts.
					</p>
					<Button variant="secondary" onclick={onOpenFacts}>View facts</Button>
				</div>
			{:else if !data.nodes.length}<div class="graph-message">
					<p>No memories match these categories.</p>
					<Button
						variant="secondary"
						onclick={() => (categories = ['user', 'relationship', 'shared_experience'])}
						>Show all categories</Button
					>
				</div>{/if}
		</div>
		{#if selected}<aside class="selected-detail" aria-label="Memory details">
				<div class="detail-heading">
					<h3>Memory details</h3>
					<Button
						variant="ghost"
						size="sm"
						aria-label="Close memory details"
						onclick={() => (selectedId = null)}><Icon name="x" size={14} /></Button
					>
				</div>
				<MemoryFactSummary fact={selected} />
				<dl>
					<dt>Referenced</dt>
					<dd>{selected.referenceCount} times</dd>
					<dt>Created</dt>
					<dd>{new Date(selected.createdAt).toLocaleString()}</dd>
				</dl>
				<Button variant="secondary" size="sm" onclick={() => onInspect(selected!.id)}
					>Open in Facts<Icon name="arrow-right" size={14} /></Button
				>
			</aside>{/if}
	</div>
	<p class="graph-stats">
		{data.nodes.length}
		{data.nodes.length === 1 ? 'memory' : 'memories'} · {data.links.length}
		{data.links.length === 1 ? 'connection' : 'connections'}
	</p>
</div>

<style>
	.memory-graph {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: 0;
	}
	.controls,
	.category-toggles {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.controls {
		justify-content: space-between;
	}
	.category-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.memory-picker {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: var(--text-secondary);
	}
	.graph-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
	}
	.graph-layout.has-selection {
		grid-template-columns: minmax(0, 1fr) 280px;
	}
	.graph-container {
		position: relative;
		height: clamp(300px, 55dvh, 620px);
		min-width: 0;
		overflow: hidden;
		background: var(--bg-primary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
	}
	.graph-container :global(canvas) {
		display: block;
		/* Canvas dimensions must match the graph's hit coordinates immediately. */
		transition: none;
	}
	.graph-message {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1.5rem;
		color: var(--text-secondary);
		text-align: center;
	}
	.graph-message p {
		max-width: 380px;
		margin: 0;
		font-size: 0.875rem;
	}
	h3 {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.selected-detail {
		padding: 1rem;
		min-width: 0;
		align-self: start;
		background: var(--bg-primary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		font-size: 0.875rem;
	}
	.detail-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	dl {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.5rem 0.75rem;
		font-size: 0.75rem;
		margin: 1rem 0;
	}
	dt {
		color: var(--text-secondary);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.graph-stats {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.75rem;
	}
	.expanded .graph-container {
		height: max(320px, calc(100dvh - 245px));
	}
	@media (max-width: 1100px) {
		.graph-layout.has-selection {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (pointer: coarse) {
		.controls :global(button),
		.selected-detail :global(button) {
			min-height: 44px;
		}
	}
</style>

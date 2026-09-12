<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Icon } from '$lib/components/ui';
	import type { FactCategory } from '$lib/types/memory';
	import MemoryGraph from './MemoryGraph.svelte';
	let {
		open = $bindable(false),
		selectedId = $bindable(null),
		categories = $bindable<FactCategory[]>(['user', 'relationship', 'shared_experience']),
		onInspect,
		onOpenFacts
	}: {
		open?: boolean;
		selectedId?: number | null;
		categories?: FactCategory[];
		onInspect: (id: number) => void;
		onOpenFacts: () => void;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Content class="expanded-memory-graph">
			<header>
				<div>
					<Dialog.Title class="expanded-memory-title">Memory graph</Dialog.Title>
					<Dialog.Description class="expanded-memory-description"
						>Select a memory to inspect it, or drag and zoom to explore connections.</Dialog.Description
					>
				</div>
				<Dialog.Close class="icon-btn" aria-label="Collapse graph"
					><Icon name="x" size={20} /></Dialog.Close
				>
			</header>
			<div class="graph-content">
				<MemoryGraph bind:selectedId bind:categories {onInspect} {onOpenFacts} expanded />
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.expanded-memory-graph) {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
			max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
		background: var(--bg-page);
		outline: none;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	:global(.expanded-memory-title) {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}
	:global(.expanded-memory-description) {
		margin: 0.25rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-secondary);
	}
	:global(.expanded-memory-graph .icon-btn) {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border: 0;
		background: var(--bg-secondary);
		color: var(--text-primary);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	:global(.expanded-memory-graph .icon-btn:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.graph-content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
</style>

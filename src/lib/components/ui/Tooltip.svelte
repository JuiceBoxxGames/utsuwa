<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface Props {
		content: string;
		children: Snippet;
		side?: 'top' | 'right' | 'bottom' | 'left';
		sideOffset?: number;
		delayDuration?: number;
	}

	let {
		content,
		children,
		side = 'top',
		sideOffset = 8,
		delayDuration = 300
	}: Props = $props();
</script>

<TooltipPrimitive.Provider {delayDuration}>
	<TooltipPrimitive.Root>
		<TooltipPrimitive.Trigger class="ui-tooltip-trigger" aria-label={content}>
			{@render children()}
		</TooltipPrimitive.Trigger>

		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content class="ui-tooltip-content" {side} {sideOffset}>
				{content}
				<TooltipPrimitive.Arrow class="fill-foreground" />
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	</TooltipPrimitive.Root>
</TooltipPrimitive.Provider>

<style>
	:global(.ui-tooltip-trigger) { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; min-height: 32px; border-radius: var(--radius-sm); }
	:global(.ui-tooltip-trigger:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
	:global(.ui-tooltip-content) {
		z-index: 50;
		max-width: min(20rem, calc(100vw - 2rem));
		padding: 0.4rem 0.7rem;
		background: var(--text-primary);
		color: var(--bg-primary);
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.4;
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		animation: tooltip-in 0.16s var(--ease-brand);
	}

	:global(.ui-tooltip-content[data-state='closed']) {
		animation: tooltip-out 0.1s var(--ease-brand) forwards;
	}

	@keyframes tooltip-in {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	@keyframes tooltip-out {
		to {
			opacity: 0;
			transform: scale(0.96);
		}
	}

	@media (prefers-reduced-motion: reduce) { :global(.ui-tooltip-content), :global(.ui-tooltip-content[data-state='closed']) { animation: none; } }
</style>

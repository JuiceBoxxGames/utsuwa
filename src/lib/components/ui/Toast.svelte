<script lang="ts">
	import Icon from './Icon.svelte';
	import { pop } from '$lib/utils/motion';

	interface Props {
		message: string | null;
		/** Errors interrupt as alerts; everything else is a polite status. */
		variant?: 'status' | 'error';
		duration?: number;
		onDismiss: () => void;
	}

	let { message, variant = 'status', duration = 6000, onDismiss }: Props = $props();

	let hovered = $state(false);
	let focused = $state(false);

	// Hover or focus holds the toast; leaving restarts the full timer.
	$effect(() => {
		if (!message) {
			hovered = focused = false;
			return;
		}
		if (hovered || focused) return;
		const timer = setTimeout(onDismiss, duration);
		return () => clearTimeout(timer);
	});
</script>

{#if message}
	<div
		class="toast"
		class:error={variant === 'error'}
		role={variant === 'error' ? 'alert' : 'status'}
		aria-live={variant === 'error' ? 'assertive' : 'polite'}
		transition:pop
		onpointerenter={() => (hovered = true)}
		onpointerleave={() => (hovered = false)}
		onfocusin={() => (focused = true)}
		onfocusout={() => (focused = false)}
	>
		<Icon name={variant === 'error' ? 'alert' : 'info'} size={16} />
		<span class="toast-text">{message}</span>
		<button type="button" class="btn btn-ghost btn-icon toast-dismiss" aria-label="Dismiss" onclick={onDismiss}>
			<Icon name="x" size={14} />
		</button>
	</div>
{/if}

<style>
	.toast {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		max-width: 100%;
		padding: 0.25rem 0.25rem 0.25rem 0.875rem;
		border-radius: var(--radius-lg);
		background: var(--t3-surface-overlay);
		color: var(--text-primary);
		font-size: 14px;
		line-height: 20px;
		box-shadow: var(--popup-shadow);
		pointer-events: auto;
	}

	.toast.error {
		background: var(--t3-error-surface);
		color: var(--t3-error-foreground);
	}

	.toast :global(svg) {
		flex-shrink: 0;
	}

	.toast-text {
		flex: 1;
		padding: 0.375rem 0;
		overflow-wrap: anywhere;
	}

	.toast-dismiss {
		color: inherit;
	}
</style>

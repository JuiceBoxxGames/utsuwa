<script lang="ts">
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { displayStore, REVEAL_SPEED_MS } from '$lib/stores/display.svelte';
	import { ShimmerLabel, StreamingText } from '$lib/components/ui';
	import { phaseLabel, type ThinkingPhase } from '$lib/services/chat/chat-phase';
	import { pop, fadeFast } from '$lib/utils/motion';

	interface Props {
		message: string;
		isTyping?: boolean;
		phase?: ThinkingPhase;
		onHide?: () => void;
		/** Docked dialog mode: the window moves around in overlay mode, so the
		 *  bubble anchors above the bottom controls instead of chasing the head */
		docked?: boolean;
	}

	let { message, isTyping = false, phase = 'thinking', onHide, docked = false }: Props = $props();

	const revealSpeedMs = $derived(REVEAL_SPEED_MS[displayStore.textRevealSpeed]);

	// Get screen position from VRM store for 3D tracking
	const screenPos = $derived(vrmStore.headScreenPosition);

	// Calculate bubble position (offset to the right of head)
	// Typing indicator appears closer to model, message bubble has more offset
	const bubbleStyle = $derived(() => {
		if (docked) return '';
		if (!screenPos) {
			// Fallback to fixed position if no tracking available
			return isTyping ? 'top: 25%; right: 25%;' : 'top: 22%; right: 15%;';
		}

		if (isTyping) {
			// Typing indicator: closer to the head
			const x = Math.min(Math.max(screenPos.x - 2, 5), 75);
			const y = Math.min(Math.max(screenPos.y - 6, 5), 60);
			return `top: ${y}%; left: ${x}%;`;
		} else {
			// Message: current position with more offset
			const x = Math.min(Math.max(screenPos.x + 3, 5), 80);
			const y = Math.min(Math.max(screenPos.y - 8, 5), 65);
			return `top: ${y}%; left: ${x}%;`;
		}
	});

	let visible = $state(true);

	// Reset visibility when new message/typing starts
	$effect(() => {
		if (message || isTyping) {
			visible = true;
		}
	});

	function handleClick() {
		visible = false;
		onHide?.();
	}
</script>

{#if visible && (message || isTyping)}
	<div
		class="speech-bubble-container"
		class:docked
		transition:pop={{ duration: 220, y: 6, base: docked ? 'translateX(-50%)' : '' }}
		role="status"
		aria-live="polite"
		style={bubbleStyle()}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="speech-bubble" onclick={handleClick}>
			<!-- Keyed so consecutive replies fade in instead of hard-swapping text -->
			{#key isTyping ? '::typing' : message}
				<div class="speech-bubble-content" in:fadeFast={{ duration: 180 }}>
					{#if isTyping}
						<div class="thinking-row">
							<ShimmerLabel label={phaseLabel(phase)} />
						</div>
					{:else}
						<p class="message"><StreamingText text={message} speedMs={revealSpeedMs} /></p>
					{/if}
				</div>
			{/key}
			<div class="bubble-tail" class:bubble-tail-down={docked}></div>
		</div>
	</div>
{/if}

<style>
	.speech-bubble-container {
		position: fixed;
		z-index: 50;
		pointer-events: none;
		/* Position set dynamically via style attribute */
		transition: top 0.1s ease-out, left 0.1s ease-out;
	}

	.speech-bubble {
		position: relative;
		max-width: 280px;
		min-width: 60px;
		max-height: 120px;
		overflow: hidden;
		background: var(--bg-secondary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
		pointer-events: auto;
		cursor: pointer;
		transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
	}

	.speech-bubble:hover {
		transform: scale(1.02) translateY(-1px);
		box-shadow: var(--shadow-lg);
	}

	.speech-bubble-content {
		max-height: 120px;
		overflow-y: auto;
		padding: 0.75rem 1rem;
	}

	/* The global scrollbar rule styles the thumb; inset the track from the corners. */
	.speech-bubble-content::-webkit-scrollbar-track {
		margin: 4px 0;
	}

	.bubble-tail {
		position: absolute;
		left: -8px;
		top: 50%;
		transform: translateY(-50%);
		width: 0;
		height: 0;
		border-top: 8px solid transparent;
		border-bottom: 8px solid transparent;
		border-right: 10px solid var(--bg-secondary);
	}

	/* Docked dialog: centered above the overlay's bottom controls, tail down */
	.speech-bubble-container.docked {
		left: 50%;
		right: auto;
		top: auto;
		bottom: 108px;
		transform: translateX(-50%);
		transition: none;
		width: max-content;
		max-width: min(86%, 340px);
	}

	.docked .speech-bubble {
		max-width: 100%;
		max-height: 150px;
	}

	.docked .speech-bubble-content {
		max-height: 150px;
	}

	.bubble-tail-down {
		left: 50%;
		top: auto;
		bottom: -8px;
		transform: translateX(-50%);
		border-top: 10px solid var(--bg-secondary);
		border-left: 8px solid transparent;
		border-right: 8px solid transparent;
		border-bottom: none;
	}

	.message {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.5;
		word-wrap: break-word;
		color: var(--text-primary);
	}

	.thinking-row {
		display: flex;
		align-items: center;
		padding: 0.125rem 0;
	}

	@media (max-width: 640px) {
		.speech-bubble {
			max-width: 220px;
		}
	}
</style>

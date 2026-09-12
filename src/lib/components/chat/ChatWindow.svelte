<script lang="ts">
	import { browser } from '$app/environment';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { displayStore, REVEAL_SPEED_MS } from '$lib/stores/display.svelte';
	import { Icon, ShimmerLabel } from '$lib/components/ui';
	import { renderMarkdown } from './render-markdown';
	import { wrapWordsInHtml } from './reveal-markup';
	import { phaseLabel, type ThinkingPhase } from '$lib/services/chat/chat-phase';
	import { type PreparedImage } from '$lib/services/storage/keepsakes';
	import { chatDraftStore } from '$lib/stores/chat-draft.svelte';
	import ChatInput from './ChatInput.svelte';
	import CopyButton from '$lib/components/ui/CopyButton.svelte';

	interface Props {
		open: boolean;
		isTyping?: boolean;
		phase?: ThinkingPhase;
		onSend: (content: string, images?: PreparedImage[]) => void;
		disabled?: boolean;
		visionCapable?: boolean;
	}

	let {
		open,
		isTyping = false,
		phase = 'thinking',
		onSend,
		disabled = false,
		visionCapable = true
	}: Props = $props();

	let messagesEl: HTMLDivElement | null = $state(null);
	let scrollRaf: number | null = null;

	// Auto-scroll whenever messages change or typing state changes.
	// requestAnimationFrame collapses rapid streaming chunks into one smooth scroll.
	$effect(() => {
		const _msgs = chatStore.messages.length;
		const _typing = isTyping;
		if (open && messagesEl) {
			if (scrollRaf) cancelAnimationFrame(scrollRaf);
			scrollRaf = requestAnimationFrame(() => {
				scrollRaf = null;
				messagesEl!.scrollTop = messagesEl!.scrollHeight;
			});
		}
		return () => {
			if (scrollRaf) {
				cancelAnimationFrame(scrollRaf);
				scrollRaf = null;
			}
		};
	});

	// The last assistant message id, highlighted while typing and revealed word
	// by word when it lands. Keyed each blocks keep the DOM stable, so the
	// reveal animation plays once and never replays on open/close.
	const lastAssistantId = $derived(
		[...chatStore.messages].reverse().find((m) => m.role === 'assistant')?.id ?? null
	);

	// System messages are kept for LLM context but not shown in the visible history
	const visibleMessages = $derived(chatStore.messages.filter((m) => m.role !== 'system'));

	const revealCadenceMs = $derived(REVEAL_SPEED_MS[displayStore.textRevealSpeed]);

	function handleClearHistory() {
		if (!browser) return;
		if (confirm('Delete all messages in this chat?')) {
			chatStore.clearMessages();
		}
	}
</script>

<div
	class="chat-window docked"
	inert={!open}
	aria-hidden={!open}
	aria-label="Chat window"
	role="region"
	class:open
	class:pin-left={displayStore.sidebarPosition === 'left'}
>
	<div class="window-header">
		<button
			class="clear-btn"
			onclick={handleClearHistory}
			aria-label="Clear chat history"
			title="Clear chat history"
			disabled={visibleMessages.length === 0}
		>
			<Icon name="trash" size={14} />
		</button>
	</div>

	<div class="messages" bind:this={messagesEl}>
		{#if visibleMessages.length === 0 && !isTyping}
			<p class="empty-hint">No messages yet.</p>
		{:else}
			{#each visibleMessages as msg (msg.id)}
				{@const isLastAssistant = msg.id === lastAssistantId}
				<!-- While she's typing, the shimmer bubble below stands in for the
				     streaming message; rendering partial content would restart the
				     reveal animation on every delta -->
				{#if !(isLastAssistant && isTyping)}
					<div
						class="message"
						class:user={msg.role === 'user'}
						class:assistant={msg.role === 'assistant'}
					>
						<div class="bubble">
							{#if isLastAssistant && revealCadenceMs > 0 && msg.content}
								<p style="--reveal-cadence: {revealCadenceMs}ms">
									{@html wrapWordsInHtml(renderMarkdown(msg.content)).html}
								</p>
							{:else}
								<p>{@html renderMarkdown(msg.content)}</p>
							{/if}
						</div>
						{#if msg.content}<CopyButton text={msg.content} label="Copy message" />{/if}
					</div>
				{/if}
			{/each}
			{#if isTyping}
				<div class="message assistant">
					<div class="bubble thinking">
						<ShimmerLabel label={phaseLabel(phase)} />
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<div class="input-dock">
		<ChatInput {onSend} {disabled} {visionCapable} />
	</div>

	{#if open && chatDraftStore.dropActive}
		<div class="drop-overlay">
			<Icon name="camera" size={22} />
			<span>Drop a photo to show her</span>
		</div>
	{/if}
</div>

<style>
	.chat-window {
		position: absolute;
		display: flex;
		flex-direction: column;
		background: color-mix(in srgb, var(--bg-primary), transparent 6%);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-lg);
		z-index: 45;
		pointer-events: none;
		opacity: 0;
		transform: translateY(6px) scale(0.985);
		transition:
			opacity 0.22s ease,
			transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
		overflow: hidden;
		min-width: 0;
		min-height: 0;
	}

	.chat-window.open {
		opacity: 1;
		transform: translateY(0) scale(1);
		pointer-events: auto;
	}

	.window-header {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 0.625rem;
		flex-shrink: 0;
		user-select: none;
		-webkit-user-select: none;
	}

	.clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: none;
		border-radius: var(--radius-full);
		color: var(--text-tertiary);
		cursor: pointer;
	}
	.clear-btn:hover:not(:disabled) {
		color: var(--text-primary);
		background: var(--bg-tertiary);
	}
	.clear-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.clear-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.clear-btn:hover:disabled {
		background: transparent;
		color: var(--text-tertiary);
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.message {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
	}

	.message.user {
		align-items: flex-end;
	}

	.message.assistant {
		justify-content: flex-start;
	}

	.bubble {
		max-width: 85%;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-lg);
		font-size: 0.8125rem;
		line-height: 1.5;
		overflow-wrap: anywhere;
		user-select: text;
		-webkit-user-select: text;
	}

	.user .bubble {
		background: var(--accent);
		color: white;
		border-bottom-right-radius: var(--radius-sm);
	}

	.user .bubble :global(::selection) {
		background: var(--text-primary);
		color: var(--bg-primary);
	}

	.assistant .bubble {
		background: var(--bg-secondary);
		color: var(--text-primary);
		border: 1px solid var(--border-subtle);
		border-bottom-left-radius: var(--radius-sm);
	}

	.bubble.thinking {
		padding: 0.55rem 0.85rem;
	}

	.bubble p {
		margin: 0;
	}

	.bubble :global(strong) {
		font-weight: 600;
	}

	.bubble :global(em) {
		font-style: italic;
	}

	.bubble :global(code) {
		font-family: var(--font-mono);
		font-size: 0.875em;
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--text-primary), transparent 92%);
	}

	/* Word-by-word reveal for the latest reply */
	.bubble :global(.reveal-word) {
		opacity: 0;
		animation: word-in 0.24s ease-out forwards;
		animation-delay: calc(var(--word-index) * var(--reveal-cadence, 60ms));
	}

	@keyframes word-in {
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bubble :global(.reveal-word) {
			animation: none;
			opacity: 1;
		}
	}

	.empty-hint {
		text-align: center;
		font-size: 0.8125rem;
		color: var(--text-tertiary);
		margin-top: 2rem;
	}

	.input-dock {
		flex-shrink: 0;
		padding: 0.75rem;
	}

	/* Drag-to-show target while the window owns the input */
	.drop-overlay {
		position: absolute;
		inset: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.55rem;
		border-radius: calc(var(--radius-xl) - 4px);
		background: var(--accent-subtle);
		border: 2px dashed var(--accent);
		color: var(--accent);
		font-size: 0.95rem;
		font-weight: 600;
		z-index: 4;
		pointer-events: none;
	}

	.drop-overlay :global(svg) {
		animation: dropIcon 0.9s ease-in-out infinite;
	}

	@keyframes dropIcon {
		0%,
		100% {
			transform: translateY(0) rotate(0deg);
		}
		50% {
			transform: translateY(-4px) rotate(-6deg);
		}
	}

	.chat-window.docked {
		position: absolute;
		top: 68px;
		right: 0;
		bottom: 0;
		width: var(--chat-dock-width);
		min-width: 0;
		min-height: 0;
		border-radius: var(--radius-xl) 0 0 0;
		box-shadow: none;
		background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
	}
	.chat-window.docked.pin-left {
		left: 0;
		right: auto;
		border-radius: 0 var(--radius-xl) 0 0;
	}
	.messages {
		min-height: 0;
		overscroll-behavior: contain;
	}
	@media (max-width: 720px) {
		.chat-window.docked,
		.chat-window.docked.pin-left {
			top: auto;
			left: 0;
			right: 0;
			width: 100%;
			height: var(--chat-dock-height);
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
			padding-bottom: env(safe-area-inset-bottom, 0px);
		}
	}
	@media (pointer: coarse) {
		.clear-btn {
			width: 44px;
			height: 44px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chat-window {
			transition: none;
		}
	}
</style>

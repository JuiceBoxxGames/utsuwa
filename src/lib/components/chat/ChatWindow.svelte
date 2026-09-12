<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { displayStore, REVEAL_SPEED_MS } from '$lib/stores/display.svelte';
	import { characterStore } from '$lib/stores/character.svelte';
	import { Icon, ShimmerLabel } from '$lib/components/ui';
	import { renderMarkdown } from './render-markdown';
	import { wrapWordsInHtml } from './reveal-markup';
	import { phaseLabel, type ThinkingPhase } from '$lib/services/chat/chat-phase';
	import { type PreparedImage } from '$lib/services/storage/keepsakes';
	import { chatDraftStore } from '$lib/stores/chat-draft.svelte';
	import ChatInput from './ChatInput.svelte';

	interface Props {
		open: boolean;
		onClose?: () => void;
		isTyping?: boolean;
		phase?: ThinkingPhase;
		onSend: (content: string, images?: PreparedImage[]) => void;
		disabled?: boolean;
		visionCapable?: boolean;
	}

	let {
		open,
		onClose,
		isTyping = false,
		phase = 'thinking',
		onSend,
		disabled = false,
		visionCapable = true
	}: Props = $props();

	const moodInfo = $derived(characterStore.moodInfo);

	let messagesEl: HTMLDivElement | null = $state(null);
	let scrollRaf: number | null = null;

	// --- Floating geometry -----------------------------------------------------
	// The panel floats: drag it by the header, resize it from any edge. Its
	// rect persists so it comes back where you left it. Until the user drags,
	// it anchors to the docked side from settings.
	const GEOMETRY_KEY = 'utsuwa-chat-panel';
	const DEFAULT_WIDTH = 460;
	const DEFAULT_HEIGHT_VH = 0.72;
	const MIN_WIDTH = 260;
	const MIN_HEIGHT = 220;
	const MARGIN = 12;
	const TOP_OFFSET = 68; // below the top button row

	interface PanelRect {
		x: number;
		y: number;
		w: number;
		h: number;
	}

	function defaultRect(): PanelRect {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		// Mobile: dock low in the viewport so her face stays visible above the
		// chat, hugging the snap side with a slim margin
		if (vw <= 640) {
			const w = Math.max(MIN_WIDTH, Math.round(vw * 0.7));
			const h = Math.round(vh * 0.42);
			const x = displayStore.sidebarPosition === 'left' ? MARGIN : vw - w - MARGIN;
			return { x, y: vh - h - MARGIN * 2, w, h };
		}
		const w = DEFAULT_WIDTH;
		const h = Math.round(vh * DEFAULT_HEIGHT_VH);
		const x = displayStore.sidebarPosition === 'left' ? MARGIN : vw - w - MARGIN;
		return { x, y: TOP_OFFSET, w, h };
	}

	function clampRect(r: PanelRect): PanelRect {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const w = Math.min(Math.max(r.w, MIN_WIDTH), vw - MARGIN * 2);
		const h = Math.min(Math.max(r.h, MIN_HEIGHT), vh - MARGIN * 2);
		return {
			x: Math.min(Math.max(r.x, MARGIN - w + 80), vw - 80),
			y: Math.min(Math.max(r.y, 0), vh - 48),
			w,
			h
		};
	}

	let rect = $state<PanelRect | null>(null);

	$effect(() => {
		if (!browser || rect) return;
		try {
			const saved = localStorage.getItem(GEOMETRY_KEY);
			rect = saved ? clampRect(JSON.parse(saved)) : defaultRect();
		} catch {
			rect = defaultRect();
		}
	});

	// Reopening after a viewport change must never leave the panel stranded.
	// untrack keeps rect out of the dependency list; reacting to our own
	// rect write would loop the effect forever.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			if (rect) rect = clampRect(rect);
		});
	});

	// Settings can rescue a lost window: clear the saved rect, start fresh
	$effect(() => {
		const token = displayStore.chatWindowResetToken;
		if (token > 0 && browser) {
			localStorage.removeItem(GEOMETRY_KEY);
			rect = defaultRect();
		}
	});

	function persistRect() {
		if (browser && rect) localStorage.setItem(GEOMETRY_KEY, JSON.stringify(rect));
	}

	function handleViewportResize() {
		if (rect) {
			rect = clampRect(rect);
			persistRect();
		}
	}

	// Dragging via the header
	let dragging: { pointerId: number; offsetX: number; offsetY: number } | null = null;

	function onHeaderDown(e: PointerEvent) {
		// Buttons in the header keep their own behavior
		if ((e.target as HTMLElement).closest('button') || !rect) return;
		dragging = { pointerId: e.pointerId, offsetX: e.clientX - rect.x, offsetY: e.clientY - rect.y };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onHeaderMove(e: PointerEvent) {
		if (!dragging || !rect) return;
		rect = clampRect({
			...rect,
			x: e.clientX - dragging.offsetX,
			y: e.clientY - dragging.offsetY
		});
	}

	function onHeaderUp() {
		if (!dragging) return;
		dragging = null;
		persistRect();
	}

	// --- Custom resize ---------------------------------------------------------
	// Native CSS resize only offers the bottom-right corner and fought the
	// clamping logic; these handles cover every edge and corner.
	type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
	const RESIZE_DIRS: ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

	let resizing: {
		dir: ResizeDir;
		pointerId: number;
		startX: number;
		startY: number;
		start: PanelRect;
	} | null = null;

	function onResizeDown(e: PointerEvent, dir: ResizeDir) {
		if (!rect) return;
		e.preventDefault();
		resizing = {
			dir,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			start: { ...rect }
		};
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onResizeMove(e: PointerEvent) {
		if (!resizing) return;
		const { dir, start } = resizing;
		const dx = e.clientX - resizing.startX;
		const dy = e.clientY - resizing.startY;
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		let { x, y, w, h } = start;
		if (dir.includes('e')) w = start.w + dx;
		if (dir.includes('w')) w = start.w - dx;
		if (dir.includes('s')) h = start.h + dy;
		if (dir.includes('n')) h = start.h - dy;

		w = Math.min(Math.max(w, MIN_WIDTH), vw - MARGIN * 2);
		h = Math.min(Math.max(h, MIN_HEIGHT), vh - MARGIN * 2);

		// Dragging a west or north edge moves the origin; anchor the opposite edge
		if (dir.includes('w')) x = start.x + start.w - w;
		if (dir.includes('n')) y = start.y + start.h - h;

		x = Math.min(Math.max(x, MARGIN - w + 80), vw - 80);
		y = Math.min(Math.max(y, 0), vh - 48);

		rect = { x, y, w, h };
	}

	function onResizeUp() {
		if (!resizing) return;
		resizing = null;
		persistRect();
	}

	// The dock buttons become "snap to edge" shortcuts for the floating panel
	function snapTo(side: 'left' | 'right') {
		displayStore.setSidebarPosition(side);
		if (!rect) return;
		const vw = window.innerWidth;
		rect = clampRect({ ...rect, x: side === 'left' ? MARGIN : vw - rect.w - MARGIN });
		persistRect();
	}

	// --- Messages ---------------------------------------------------------------

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

<svelte:window onresize={handleViewportResize} />

<div
	class="chat-window"
	inert={!open}
	aria-hidden={!open}
	aria-label="Chat window"
	role="region"
	class:open
	style:left={rect ? `${rect.x}px` : undefined}
	style:top={rect ? `${rect.y}px` : undefined}
	style:width={rect ? `${rect.w}px` : undefined}
	style:height={rect ? `${rect.h}px` : undefined}
>
	{#each RESIZE_DIRS as dir}
		<div
			class="resize-handle {dir}"
			onpointerdown={(e) => onResizeDown(e, dir)}
			onpointermove={onResizeMove}
			onpointerup={onResizeUp}
			onpointercancel={onResizeUp}
		></div>
	{/each}
	<div
		class="window-header"
		onpointerdown={onHeaderDown}
		onpointermove={onHeaderMove}
		onpointerup={onHeaderUp}
		onpointercancel={onHeaderUp}
	>
		<span class="mood-chip" style="color: {moodInfo.color}" title={moodInfo.description}>
			<Icon name={moodInfo.icon} size={16} />
		</span>
		<span class="window-title">Chat</span>
		<button class="dock-btn" onclick={() => snapTo('left')} aria-label="Snap to left edge" title="Snap left">
			<Icon name="chevron-left" size={16} />
		</button>
		<button class="dock-btn" onclick={() => snapTo('right')} aria-label="Snap to right edge" title="Snap right">
			<Icon name="chevron-right" size={16} />
		</button>
		<button
			class="clear-btn"
			onclick={handleClearHistory}
			aria-label="Clear chat history"
			title="Clear chat history"
			disabled={visibleMessages.length === 0}
		>
			<Icon name="trash" size={14} />
		</button>
		<button class="close-btn" onclick={onClose} aria-label="Close chat" title="Close chat">
			<Icon name="x" size={16} />
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
					<div class="message" class:user={msg.role === 'user'} class:assistant={msg.role === 'assistant'}>
						<div class="bubble">
							{#if isLastAssistant && revealCadenceMs > 0 && msg.content}
								<p style="--reveal-cadence: {revealCadenceMs}ms">
									{@html wrapWordsInHtml(renderMarkdown(msg.content)).html}
								</p>
							{:else}
								<p>{@html renderMarkdown(msg.content)}</p>
							{/if}
						</div>
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
		<ChatInput {onSend} {disabled} {visionCapable} docked />
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
		position: fixed;
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
		transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
		overflow: hidden;
		min-width: 260px;
		min-height: 220px;
	}

	.chat-window.open {
		opacity: 1;
		transform: translateY(0) scale(1);
		pointer-events: auto;
	}

	/* Invisible grab areas along every edge and corner */
	.resize-handle {
		position: absolute;
		z-index: 3;
	}

	.resize-handle.n,
	.resize-handle.s {
		left: 10px;
		right: 10px;
		height: 6px;
		cursor: ns-resize;
	}

	.resize-handle.n { top: -3px; }
	.resize-handle.s { bottom: -3px; }

	.resize-handle.e,
	.resize-handle.w {
		top: 10px;
		bottom: 10px;
		width: 6px;
		cursor: ew-resize;
	}

	.resize-handle.e { right: -3px; }
	.resize-handle.w { left: -3px; }

	.resize-handle.ne,
	.resize-handle.nw,
	.resize-handle.se,
	.resize-handle.sw {
		width: 12px;
		height: 12px;
	}

	.resize-handle.ne { top: -4px; right: -4px; cursor: nesw-resize; }
	.resize-handle.sw { bottom: -4px; left: -4px; cursor: nesw-resize; }
	.resize-handle.nw { top: -4px; left: -4px; cursor: nwse-resize; }
	.resize-handle.se { bottom: -4px; right: -4px; cursor: nwse-resize; }

	.window-header {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 0.625rem;
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
		cursor: grab;
		user-select: none;
		touch-action: none;
	}

	.window-header:active {
		cursor: grabbing;
	}

	.mood-chip {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
	}

	.window-title {
		flex: 1;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.dock-btn,
	.clear-btn,
	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: none;
		border-radius: var(--radius-md);
		color: var(--text-tertiary);
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.dock-btn:hover,
	.clear-btn:hover:not(:disabled),
	.close-btn:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
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
	}

	.message.user {
		justify-content: flex-end;
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
		padding: 0.5rem 0.625rem;
		border-top: 1px solid var(--border-subtle);
		background: var(--bg-secondary);
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
		0%, 100% { transform: translateY(0) rotate(0deg); }
		50% { transform: translateY(-4px) rotate(-6deg); }
	}
</style>

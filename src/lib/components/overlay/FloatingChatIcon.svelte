<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { overlayStore } from '$lib/stores/overlay.svelte';

	const isExpanded = $derived(overlayStore.chatExpanded);

	function handleClick() {
		overlayStore.toggleChat();
	}
</script>

<button
	class="floating-chat-icon"
	class:expanded={isExpanded}
	onclick={handleClick}
	aria-label={isExpanded ? 'Collapse chat' : 'Open chat'}
	title={isExpanded ? 'Collapse chat' : 'Open chat'}
>
	<span class="icon-inner">
		{#if isExpanded}
			<Icon name="x" size={20} />
		{:else}
			<Icon name="message-circle" size={20} />
		{/if}
	</span>
</button>

<style>
	.floating-chat-icon {
		width: 36px;
		height: 36px;
		border-radius: var(--control-radius);
		background: var(--control-bg);
		border: 1px solid transparent;
		color: var(--text-secondary);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-sm);
		transition: color 0.15s ease, background 0.15s ease,
			box-shadow 0.15s ease, transform 0.15s ease;
	}

	.floating-chat-icon:hover {
		color: var(--text-primary);
		background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 8%);
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}

	.floating-chat-icon:focus-visible {
		outline: none;
		color: var(--text-primary);
		box-shadow: 0 0 0 3px var(--accent-muted);
	}

	.floating-chat-icon:active {
		transform: translateY(0) scale(0.96);
		box-shadow: var(--shadow-sm);
	}

	.floating-chat-icon.expanded {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.floating-chat-icon.expanded:hover {
		background: var(--accent-hover);
		color: var(--accent-contrast);
	}

	.icon-inner {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	@media (pointer: coarse) { button { min-width: 44px; min-height: 44px; } }
	@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
</style>

<script lang="ts">
	import Toast from './Toast.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { chatHintStore } from '$lib/stores/chat-hint.svelte';
	import { sttStore } from '$lib/stores/stt.svelte';
	import { vrmStore } from '$lib/stores/vrm.svelte';

	let { placement = 'top' }: { placement?: 'top' | 'bottom' } = $props();
</script>

<div class="toasts {placement}">
	<Toast message={vrmStore.error} variant="error" onDismiss={() => vrmStore.setError(null)} />
	<Toast message={chatStore.error} variant="error" onDismiss={() => chatStore.setError(null)} />
	<Toast message={sttStore.error} variant="error" onDismiss={sttStore.clearError} />
	<Toast message={chatHintStore.hint} onDismiss={chatHintStore.clearHint} />
</div>

<style>
	.toasts {
		position: fixed;
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		width: max-content;
		max-width: min(600px, calc(100vw - 1.5rem));
		pointer-events: none;
	}

	.top {
		top: calc(4.5rem + env(safe-area-inset-top, 0px));
	}

	.bottom {
		bottom: 8.5rem;
		flex-direction: column-reverse;
	}
</style>

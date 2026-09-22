<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { sttStore } from '$lib/stores/stt.svelte';

	interface Props {
		onTranscript: (text: string) => void;
	}

	let { onTranscript }: Props = $props();

	const isListening = $derived(sttStore.isListening);
	const isTranscribing = $derived(sttStore.isTranscribing);

	function handleClick() {
		if (isTranscribing) return;

		if (isListening) {
			sttStore.stopListening();
		} else if (sttStore.isSupported()) {
			sttStore.startListening(onTranscript);
		} else {
			sttStore.showUnsupportedError();
		}
	}
</script>

{#if isListening}
	<div class="recording-container">
		<div class="listening-pill">
			<span class="listening-dot"></span>
			<span class="listening-text">Listening</span>
		</div>
		<button
			class="floating-mic-btn recording"
			onclick={handleClick}
			aria-label="Stop recording"
			title="Stop recording"
		>
			<span class="icon-inner">
				<Icon name="stop" size={18} />
			</span>
			<span class="pulse-ring"></span>
		</button>
	</div>
{:else if isTranscribing}
	<div class="recording-container">
		<div class="listening-pill transcribing-pill">
			<span class="listening-text">Transcribing...</span>
		</div>
		<button
			class="floating-mic-btn transcribing"
			disabled
			aria-label="Transcribing"
		>
			<span class="icon-inner">
				<Icon name="loader" size={20} />
			</span>
		</button>
	</div>
{:else}
	<button
		class="floating-mic-btn"
		onclick={handleClick}
		aria-label="Quick voice input"
		title="Quick voice input"
	>
		<span class="icon-inner">
			<Icon name="mic" size={20} />
		</span>
	</button>
{/if}

<style>
	.floating-mic-btn {
		width: 36px;
		height: 36px;
		border-radius: var(--control-radius, var(--radius-md));
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
		position: relative;
	}

	.floating-mic-btn:hover:not(:disabled) {
		color: var(--text-primary);
		background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 8%);
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}

	.floating-mic-btn:focus-visible {
		outline: none;
		color: var(--text-primary);
		box-shadow: 0 0 0 3px var(--accent-muted);
	}

	.floating-mic-btn:active:not(:disabled) {
		transform: translateY(0) scale(0.96);
		box-shadow: var(--shadow-sm);
	}

	.floating-mic-btn.recording {
		background: var(--accent);
		color: var(--accent-contrast);
		box-shadow: var(--shadow-glow);
	}

	.floating-mic-btn.recording:hover {
		background: var(--accent-hover);
		color: var(--accent-contrast);
	}

	.floating-mic-btn.transcribing {
		background: var(--bg-secondary);
		color: var(--text-tertiary);
		box-shadow: var(--shadow-sm);
		cursor: wait;
	}

	.floating-mic-btn.transcribing .icon-inner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.icon-inner {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.pulse-ring {
		position: absolute;
		inset: -4px;
		border-radius: 50%;
		border: 2px solid var(--accent);
		opacity: 0.4;
		pointer-events: none;
		animation: pulse-ring-anim 1.5s ease-out infinite;
	}

	@keyframes pulse-ring-anim {
		0% {
			transform: scale(1);
			opacity: 0.4;
		}
		100% {
			transform: scale(1.4);
			opacity: 0;
		}
	}

	.recording-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		position: relative;
	}

	.listening-pill {
		padding: 0.25rem 0.75rem;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		white-space: nowrap;
		background: var(--control-bg);
		border: 1px solid transparent;
		color: var(--text-secondary);
		box-shadow: var(--shadow-sm);
		animation: pill-appear 0.25s ease-out;
	}

	.transcribing-pill {
		color: var(--text-tertiary);
	}

	.listening-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		animation: dot-blink 1.2s ease-in-out infinite;
	}

	@keyframes dot-blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}

	@keyframes pill-appear {
		from {
			opacity: 0;
			transform: translateY(4px) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	@media (pointer: coarse) { button { min-width: 44px; min-height: 44px; } }
	@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
</style>

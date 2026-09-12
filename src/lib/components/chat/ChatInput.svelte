<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { sttStore } from '$lib/stores/stt.svelte';
	import { chatDraftStore } from '$lib/stores/chat-draft.svelte';
	import { queueFiles, showVisionHint } from './attach-files';
	import { unlockAudioContext } from '$lib/services/tts';
	import { type PreparedImage } from '$lib/services/storage/keepsakes';
	import AudioVisualizer from './AudioVisualizer.svelte';
	import { pop, fadeFast } from '$lib/utils/motion';

	interface Props {
		onSend: (content: string, images?: PreparedImage[]) => void;
		disabled?: boolean;
		visionCapable?: boolean;
		/** Overlay window: image-showing is disabled (no native file dialog / drop). */
		overlay?: boolean;
		/** Flat row inside the chat window instead of the floating pill. */
		docked?: boolean;
	}

	let {
		onSend,
		disabled = false,
		visionCapable = true,
		overlay = false,
		docked = false
	}: Props = $props();

	let textareaRef = $state<HTMLTextAreaElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	const isListening = $derived(sttStore.isListening);
	const isTranscribing = $derived(sttStore.isTranscribing);
	const audioLevel = $derived(sttStore.audioLevel);
	const displayTranscript = $derived(sttStore.displayTranscript);

	const hasContent = $derived(
		chatDraftStore.draft.trim().length > 0 ||
			displayTranscript.trim().length > 0 ||
			chatDraftStore.pending.length > 0
	);

	function openPicker() {
		if (overlay) return;
		if (!visionCapable) {
			showVisionHint();
			return;
		}
		fileInput?.click();
	}

	async function handlePicked(files: FileList | null) {
		await queueFiles(files, visionCapable);
		if (fileInput) fileInput.value = '';
	}

	// Single send path: text plus any queued images
	function doSend() {
		if (disabled) return;
		// Inside the gesture, before any await: iOS Safari refuses later
		unlockAudioContext();
		const { text, images } = chatDraftStore.takeAll();
		if (!text && images.length === 0) return;
		// Keep focus through the pending reply, including a touch on Send.
		textareaRef?.focus({ preventScroll: true });
		onSend(text, images);
		if (textareaRef) textareaRef.scrollLeft = 0;
	}

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		doSend();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
			e.preventDefault();
			doSend();
		}
	}

	function handleMicClick() {
		unlockAudioContext();
		if (!sttStore.isSupported()) {
			sttStore.showUnsupportedError();
			return;
		}
		if (isListening) {
			sttStore.stopListening();
		} else {
			sttStore.startListening((text) => {
				onSend(text);
			});
		}
	}
</script>

<div class="chat-input" class:docked>
	{#if chatDraftStore.pending.length > 0}
		<div class="pending-row" out:fadeFast={{ duration: 150 }}>
			{#each chatDraftStore.pending as p (p.image.id)}
				<div class="pending-chip" in:pop={{ duration: 200, y: 6, scale: 0.9 }} out:fadeFast={{ duration: 120 }}>
					<img src={p.url} alt="To show her" />
					<button
						type="button"
						class="remove-chip"
						aria-label="Remove image"
						onclick={() => chatDraftStore.removePending(p.image.id)}
					>
						<Icon name="x" size={12} />
					</button>
				</div>
			{/each}
		</div>
	{/if}
	<form class="chat-form" onsubmit={handleSubmit}>
		{#if !overlay}
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				multiple
				style="display:none"
				onchange={(e) => handlePicked(e.currentTarget.files)}
			/>
		{/if}
		<div
			class="input-wrapper"
			class:recording={isListening}
			class:transcribing={isTranscribing}
			
		>
			{#if isTranscribing}
				<div class="transcribing-label">Transcribing...</div>
				<button type="button" class="mic-btn recording" disabled aria-label="Transcribing">
					<Icon name="loader" size={20} />
				</button>
			{:else if isListening}
				<AudioVisualizer {audioLevel} transcript={displayTranscript} />
				<button
					type="button"
					class="mic-btn recording"
					onclick={() => sttStore.stopListening()}
					aria-label="Stop recording"
					title="Stop recording"
				>
					<Icon name="stop" size={16} />
				</button>
			{:else}
				{#if !overlay}
					<button
						type="button"
						class="mic-btn"
						class:vision-off={!visionCapable}
						onclick={openPicker}
						{disabled}
						aria-label="Attach an image"
						title={visionCapable ? 'Attach an image' : 'This model cannot see images'}
					>
						<Icon name="paperclip" size={20} />
					</button>
				{/if}
				<!-- wrap="off" keeps long messages trailing forward on one line
				     instead of stacking; pasted newlines are preserved, just not
				     shown as extra rows -->
				<textarea
					bind:this={textareaRef}
					bind:value={chatDraftStore.draft}
					onkeydown={handleKeydown}
					aria-label="Message"
					aria-busy={disabled}
					placeholder="Type a message..."
					rows="1"
					wrap="off"
					readonly={disabled}
				></textarea>
				<button
					type="button"
					class="mic-btn"
					onclick={handleMicClick}
					{disabled}
					aria-label="Voice input"
					title="Voice input"
				>
					<Icon name="mic" size={20} />
				</button>
				<button type="submit" class="mic-btn send-btn" disabled={disabled || !hasContent} aria-label="Send message" title="Send message">
					<Icon name="send" size={20} />
				</button>
			{/if}
		</div>
	</form>
</div>

<style>
	/* Fill the bar's flex row; without this the pill collapses to the
	   textarea's intrinsic width */
	.chat-input {
		flex: 1;
		min-width: 0;
	}

	.chat-form {
		flex: 1;
		min-width: 0;
	}

	.pending-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		padding: 0 0.5rem;
	}

	.pending-chip {
		position: relative;
		width: 56px;
		height: 56px;
		cursor: pointer;
		transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.pending-chip:hover {
		transform: scale(1.12) translateY(-3px) rotate(-3deg);
		z-index: 2;
	}

	.pending-chip img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-light);
		box-shadow: var(--shadow-sm);
		transition: box-shadow 0.2s ease, border-color 0.2s ease;
	}

	.pending-chip:hover img {
		border-color: var(--accent);
		box-shadow: var(--shadow-glow);
	}

	.remove-chip {
		position: absolute;
		top: -5px;
		right: -5px;
		width: 19px;
		height: 19px;
		border: 2px solid var(--bg-primary);
		border-radius: var(--radius-full);
		background: var(--color-error);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
		box-shadow: var(--shadow-sm);
		opacity: 0;
		transform: scale(0.4);
		transition: opacity 0.16s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.pending-chip:hover .remove-chip {
		opacity: 1;
		transform: scale(1);
	}

	.remove-chip:hover {
		transform: scale(1.2);
	}

	/* Gray input surface, shared by both variants. Fixed height so swapping
	   between typing, listening, and transcribing never resizes the pill */
	.input-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-radius: var(--radius-full);
		padding: 0.5rem;
		/* 44px buttons + 0.5rem padding either side: the pill's original stature */
		height: 60px;
		box-shadow: var(--shadow-md);
		transition: box-shadow 0.2s;
	}

	.input-wrapper:focus-within {
		box-shadow: 0 0 0 3px var(--accent-muted), var(--shadow-glow);
	}

	.input-wrapper.recording {
		box-shadow: 0 0 0 3px var(--accent-muted), var(--shadow-glow);
	}

	.input-wrapper.transcribing {
		box-shadow: 0 0 0 3px var(--accent-muted), var(--shadow-md);
	}

	/* Docked: flat compact row that reads as part of the chat window and
	   keeps shrinking gracefully as the window narrows */
	.docked .input-wrapper {
		border-radius: var(--radius-md);
		border: none;
		box-shadow: none;
		height: 42px;
		min-width: 0;
		gap: 0.25rem;
		padding: 0.25rem 0.35rem;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	.docked .input-wrapper:focus-within,
	.docked .input-wrapper.recording,
	.docked .input-wrapper.transcribing {
		box-shadow: inset 0 0 0 2px var(--accent);
	}

	.docked .pending-row {
		margin-bottom: 0.35rem;
		padding: 0 0.25rem;
	}

	.transcribing-label {
		flex: 1;
		padding: 0.625rem 0.5rem;
		font-size: 0.9rem;
		color: var(--text-tertiary);
		font-style: italic;
	}

	textarea {
		flex: 1;
		min-width: 0;
		padding: 0.625rem 0.5rem;
		border: none;
		background: transparent;
		color: var(--text-primary);
		font-size: 1rem;
		resize: none;
		outline: none;
		font-family: inherit;
		line-height: 1.5;
		height: calc(1.5em + 1rem);
		white-space: nowrap;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
	}

	textarea::-webkit-scrollbar {
		display: none;
	}

	.docked textarea {
		font-size: 1rem;
		padding: 0.375rem 0.4rem;
		height: calc(1.5em + 0.75rem);
	}

	textarea::placeholder {
		color: var(--text-tertiary);
	}

	textarea[readonly] {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.mic-btn {
		width: 44px;
		height: 44px;
		border: none;
		border-radius: var(--radius-full);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s, color 0.2s, box-shadow 0.2s, transform 0.15s;
		flex-shrink: 0;
		position: relative;
		background: transparent;
		color: var(--text-tertiary);
	}

	.docked .mic-btn {
		width: 34px;
		height: 34px;
	}

	.docked .pending-chip {
		width: 44px;
		height: 44px;
	}

	.mic-btn:hover:not(:disabled) {
		color: var(--text-primary);
		background: var(--bg-tertiary);
	}

	.mic-btn:active:not(:disabled) {
		transform: scale(0.94);
	}

	.mic-btn.vision-off {
		opacity: 0.45;
	}

	.mic-btn.recording {
		background: var(--accent);
		color: #fff;
		animation: recording-pulse 1.6s ease-in-out infinite;
	}

	.mic-btn.recording:hover {
		background: var(--accent-hover);
	}

	.mic-btn.recording:disabled {
		opacity: 0.7;
		cursor: wait;
		animation: none;
	}

	@keyframes recording-pulse {
		0%, 100% {
			box-shadow: 0 0 0 0 var(--accent-muted);
		}
		50% {
			box-shadow: 0 0 0 6px transparent;
		}
	}

	.send-btn { background: var(--accent); color: var(--text-on-accent, white); }
	.send-btn:hover:not(:disabled) { background: var(--accent-hover); color: var(--text-on-accent, white); }
	.send-btn:disabled { opacity: 0.4; cursor: default; }
	.mic-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.pending-chip:focus-within .remove-chip { opacity: 1; transform: scale(1); }
	@media (pointer: coarse) {
		.remove-chip { opacity: 1; transform: scale(1); }
		.docked .input-wrapper { height: 52px; }
		.docked .mic-btn { width: 44px; height: 44px; }
	}
	@media (prefers-reduced-motion: reduce) {
		.mic-btn.recording { animation: none; }
	}
</style>

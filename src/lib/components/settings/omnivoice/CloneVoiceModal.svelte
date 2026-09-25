<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { cloneVoice, type OmniVoiceConnection } from '$lib/services/tts/omnivoice-client';

	interface Props {
		connection: OmniVoiceConnection;
		onClose: () => void;
		/** Receives the new voice id, already prefixed with clone:. */
		onCloned: (voiceId: string) => void;
	}

	let { connection, onClose, onCloned }: Props = $props();

	let name = $state('');
	let refText = $state('');
	let refAudio = $state<File | null>(null);
	let loading = $state(false);
	let error = $state('');

	async function submit() {
		error = '';
		if (!name.trim() || !refAudio || !refText.trim()) {
			error = 'Please provide a voice name, reference audio, and reference text.';
			return;
		}
		loading = true;
		try {
			await cloneVoice(connection, { voiceId: name.trim(), refAudio, refText: refText.trim() });
			onCloned('clone:' + name.trim());
		} catch (err) {
			error = err instanceof Error ? err.message : 'Clone failed';
		} finally {
			loading = false;
		}
	}
</script>

<Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
<Dialog.Portal>
 <Dialog.Overlay class="ui-dialog-backdrop" />
 <Dialog.Content>
 {#snippet child({ props })}
 <div {...props} class="clone-modal ui-dialog">
		<Dialog.Title level={3}>
			{#snippet child({ props })}<h3 {...props} class="omnivoice-modal-title">Clone New Voice</h3>{/snippet}
		</Dialog.Title>

		<div class="omnivoice-modal-field">
			<label class="omnivoice-modal-label" for="clone-audio">Reference Audio (3–10s)</label>
			<div class="omnivoice-file-row">
				<label class="btn btn-sm btn-secondary" for="clone-audio">{refAudio?.name || 'Choose file...'}</label>
				<input type="file" accept="audio/*" id="clone-audio" class="omnivoice-hidden-input" onchange={(e) => (refAudio = e.currentTarget.files?.[0] ?? null)} />
				{#if refAudio?.name}
					<span class="omnivoice-file-name">{refAudio.name}</span>
				{/if}
			</div>
		</div>

		<div class="omnivoice-modal-field">
			<label class="omnivoice-modal-label" for="clone-name">Voice Name</label>
			<input type="text" id="clone-name" class="api-key-input" placeholder="e.g. my_voice" bind:value={name} />
		</div>

		<div class="omnivoice-modal-field">
			<label class="omnivoice-modal-label" for="clone-text">Reference Text</label>
			<textarea id="clone-text" class="api-key-input omnivoice-clone-textarea" placeholder="Write the sentence you have recorded in the audio file" rows="4" bind:value={refText}></textarea>
		</div>

		{#if error}
			<p class="omnivoice-modal-error">{error}</p>
		{/if}

		<div class="omnivoice-modal-actions">
			<button class="btn btn-sm btn-secondary" onclick={onClose}>Cancel</button>
			<button class="btn btn-sm btn-primary" onclick={submit} disabled={loading}>
				{loading ? 'Cloning...' : 'Clone Voice'}
			</button>
		</div>
	</div>
 {/snippet}</Dialog.Content>
</Dialog.Portal>
</Dialog.Root>

<style>
	.clone-modal {
		--dialog-width: 480px;
		padding: 1.25rem;
	}

	.omnivoice-modal-title {
		margin: 0 0 1rem;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.omnivoice-modal-field {
		margin-bottom: 0.75rem;
	}

	.omnivoice-modal-label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-tertiary);
		margin-bottom: 0.3rem;
	}

	.omnivoice-modal-error {
		color: var(--color-error);
		font-size: 0.8rem;
		margin: 0.25rem 0;
	}

	.omnivoice-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.omnivoice-clone-textarea {
		resize: vertical;
		min-height: 5em;
		width: 100%;
		font-family: inherit;
	}

	.omnivoice-file-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.omnivoice-file-name {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.omnivoice-hidden-input {
		display: none;
	}
</style>

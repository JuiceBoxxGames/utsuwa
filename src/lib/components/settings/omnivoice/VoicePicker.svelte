<script lang="ts">
	import Select from '$lib/components/ui/Select.svelte';
	import type { ClonedVoice } from '$lib/services/tts/omnivoice-client';
	import { DEFAULT_OMNIVOICE_PRESET } from '$lib/stores/ai-services-settings-logic';

	interface Props {
		id: string;
		label: string;
		voiceId: string;
		/** Cloned mode lists the clones with their management buttons; synthetic lists the presets. */
		isClone: boolean;
		presets: Array<{ id: string; name: string }>;
		clones: ClonedVoice[];
		/** Clone id whose delete request is in flight. */
		deleting: string;
		onchange: (voiceId: string) => void;
		onDelete: (cloneId: string) => void;
		onCloneNew: () => void;
	}

	let { id, label, voiceId, isClone, presets, clones, deleting, onchange, onDelete, onCloneNew }: Props =
		$props();

	const cloneId = $derived(voiceId.replace('clone:', ''));
	const cloneOptions = $derived([
		...clones.map((v) => ({ value: v.id, label: v.name })),
		...(voiceId && !clones.some((v) => v.id === voiceId)
			? [{ value: voiceId, label: `cloned ${cloneId} (loading)` }]
			: [])
	]);
</script>

<div class="omnivoice-field">
	<label class="omnivoice-label" for={id}>Voice</label>
	{#if isClone}
		<div class="omnivoice-voice-row">
			<Select {id} {label} style="flex:1;min-width:0;" value={voiceId} {onchange} placeholder="No cloned voices yet" options={cloneOptions} />
			<button class="btn btn-sm btn-secondary" onclick={onCloneNew}>Clone New</button>
			{#if voiceId}
				<button class="btn btn-sm btn-danger" onclick={() => onDelete(cloneId)} disabled={deleting === cloneId}>
					{#if deleting === cloneId}...{:else}Delete{/if}
				</button>
			{/if}
		</div>
	{:else}
		<Select {id} {label} value={voiceId || DEFAULT_OMNIVOICE_PRESET} {onchange} options={presets.map((voice) => ({ value: voice.id, label: voice.name }))} />
	{/if}
</div>

<style>
	.omnivoice-field {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.omnivoice-field:last-child {
		margin-bottom: 0;
	}

	.omnivoice-label {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.omnivoice-voice-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}

	.omnivoice-voice-row .btn {
		white-space: nowrap;
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.omnivoice-voice-row .btn { min-height: 44px; }
	}
</style>

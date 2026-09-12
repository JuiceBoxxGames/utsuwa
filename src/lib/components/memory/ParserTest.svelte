<script lang="ts">
	import { Button } from '$lib/components/ui';
	import { parseResponse, extractPotentialFacts } from '$lib/ai/response-parser';
	import { characterStore } from '$lib/stores/character.svelte';

	let message = $state('I enjoy hiking.');
	const firstSample =
		'That sounds fun!\n```json\n{"mood_change":{"emotion":"happy","intensity_delta":5},"new_memory":"The user enjoys hiking."}\n```';
	let response = $state(firstSample);
	let result = $state('');
	const samples = [
		{ label: 'Memory and mood', text: firstSample },
		{ label: 'Plain dialogue', text: 'Tell me more about your day.' },
		{ label: 'Malformed state', text: 'Hello!\n```json\n{"mood_change":\n```' }
	];
	function parse() {
		try {
			const parsed = parseResponse(response, characterStore.name);
			result = JSON.stringify(
				{ ...parsed, potentialFacts: extractPotentialFacts(parsed.dialogue, message) },
				null,
				2
			);
		} catch {
			result = 'This sample could not be parsed.';
		}
	}
</script>

<p class="hint">
	Try sample responses without changing your memories or character. Nothing here calls an AI
	provider.
</p>
<div class="samples">
	{#each samples as sample}<Button
			variant="secondary"
			size="sm"
			onclick={() => {
				response = sample.text;
				result = '';
			}}>{sample.label}</Button
		>{/each}
</div>
<label>User message<textarea bind:value={message} maxlength={2000} rows={2}></textarea></label>
<label
	>Raw model response<textarea bind:value={response} maxlength={20000} rows={7}></textarea></label
>
<Button onclick={parse}>Parse sample</Button>
{#if result}<pre aria-label="Parser result">{result}</pre>{/if}

<style>
	.hint {
		color: var(--text-secondary);
		font-size: 0.875rem;
	}
	.samples {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 1rem 0;
		font-size: 0.875rem;
	}
	textarea {
		width: 100%;
		resize: vertical;
		min-height: 64px;
		padding: 0.75rem;
		font: inherit;
		color: var(--text-primary);
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
	}
	textarea:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		padding: 1rem;
		border-radius: var(--radius-lg);
		background: var(--bg-secondary);
		font-size: 0.8125rem;
	}
</style>

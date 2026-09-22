<script lang="ts">
	import { Icon } from '$lib/components/ui';

	interface Props {
		name: string;
		systemPrompt: string;
		onNameChange: (name: string) => void;
		onSystemPromptChange: (prompt: string) => void;
		onNext: () => void;
		onBack: () => void;
	}

	let { name, systemPrompt, onNameChange, onSystemPromptChange, onNext, onBack }: Props = $props();

	const isValid = $derived(name.trim().length > 0);
</script>

<div class="ob-step">
	<div class="ob-head">
		<h2 class="ob-title">Name your companion</h2>
		<p class="ob-subtitle">Give your AI companion a name and a personality.</p>
	</div>

	<div class="ob-field">
		<label for="name" class="ob-label">Name</label>
		<input
			id="name"
			type="text"
			class="ob-input"
			value={name}
			oninput={(e) => onNameChange(e.currentTarget.value)}
			placeholder="Enter a name..."
		/>
	</div>

	<details class="ob-advanced"><summary>Personalize their personality</summary>
	<div class="ob-field">
		<label for="personality" class="ob-label">Core personality</label>
		<textarea
			id="personality"
			class="ob-textarea"
			value={systemPrompt}
			oninput={(e) => onSystemPromptChange(e.currentTarget.value)}
			placeholder="Describe their personality, speaking style, background..."
			rows="5"
		></textarea>
		<span class="ob-hint">This shapes how your companion talks and behaves.</span>
	</div>
	</details>

	<div class="ob-actions ob-actions--split">
		<button class="btn btn-secondary" onclick={onBack}>
			<Icon name="chevron-left" size={16} />
			Back
		</button>
		<button class="btn btn-primary" onclick={onNext} disabled={!isValid}>
			Next
			<Icon name="chevron-right" size={16} />
		</button>
	</div>
</div>

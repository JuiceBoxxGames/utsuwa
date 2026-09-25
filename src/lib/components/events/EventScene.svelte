<script lang="ts">
	import type { Scene, SceneChoice, EventType } from '$lib/types/events';
	import type { StateUpdates } from '$lib/types/character';
	import { Icon } from '$lib/components/ui';
	import { Dialog } from 'bits-ui';
	import { tick } from 'svelte';
	import ChoiceDialog from './ChoiceDialog.svelte';
	import { nextPhase, type ScenePhase } from './scene-flow';
	import { pop } from '$lib/utils/motion';

	interface Props {
		scene: Scene;
		/** She is still writing the scene; hold on a waiting state. */
		pending?: boolean;
		eventName: string;
		eventType?: EventType;
		companionName?: string;
		overlay?: boolean;
		onComplete: (choiceIndex?: number, stateChanges?: Partial<StateUpdates>) => void;
		onClose: () => void;
	}

	let { scene, pending = false, eventName, eventType, companionName = 'Companion', overlay = false, onComplete, onClose }: Props = $props();

	// Get icon based on event type
	const eventIcon = $derived.by(() => {
		switch (eventType) {
			case 'milestone': return 'sparkles';
			case 'anniversary': return 'calendar';
			case 'conditional': return 'heart';
			case 'scheduled': return 'clock';
			case 'random': return 'shuffle';
			default: return 'sparkles';
		}
	});

	let phase = $state<ScenePhase>('intro');
	let selectedChoice = $state<SceneChoice | null>(null);
	let selectedChoiceIndex = $state<number | null>(null);

	// Skip intro if not present (once the scene is final)
	$effect(() => {
		if (!pending && phase === 'intro' && scene && !scene.intro) {
			phase = 'dialogue';
		}
	});

	function advance() {
		if (pending) return;
		const next = nextPhase(phase, scene);
		if (next === null) return;
		if (next === 'complete') {
			completeScene();
		} else {
			phase = next;
		}
	}

	// Clicks anywhere on the card advance the narrative. Buttons (close,
	// continue, choices) handle themselves, and advance() ignores the choices phase.
	function handleContainerClick(e: MouseEvent) {
		if (e.target instanceof Element && e.target.closest('button')) return;
		advance();
	}

	// Each beat hands focus to its action: Continue, Finish, or the first choice.
	// While she is still writing, the card itself holds focus.
	let card = $state<HTMLElement | null>(null);
	$effect(() => {
		void phase;
		void pending;
		tick().then(() => (card?.querySelector<HTMLElement>('.phase-wrap button:not(:disabled)') ?? card)?.focus());
	});

	function handleChoice(index: number) {
		if (!scene?.choices) return;

		selectedChoice = scene.choices[index];
		selectedChoiceIndex = index;
		phase = 'response';
	}

	function completeScene() {
		if (selectedChoice) {
			onComplete(selectedChoiceIndex ?? undefined, selectedChoice.stateChanges);
		} else {
			onComplete();
		}
	}
</script>

<Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
<Dialog.Portal>
	{#if !overlay}<Dialog.Overlay class="ui-dialog-backdrop" />{/if}
	<Dialog.Content interactOutsideBehavior="ignore" onOpenAutoFocus={(e) => e.preventDefault()}>
	{#snippet child({ props })}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div {...props} class="scene-container ui-dialog" bind:this={card} in:pop|global={{ duration: 240, y: 18, base: 'translate(-50%, -50%)' }} onclick={handleContainerClick}>
		<div class="scene-header">
			<Dialog.Title>
				{#snippet child({ props })}
					<h2 {...props} class="event-title">
						<Icon name={eventIcon} size={18} />
						<span>{eventName}</span>
					</h2>
				{/snippet}
			</Dialog.Title>
			<button class="btn btn-ghost btn-icon" onclick={onClose} aria-label="Close">
				<Icon name="x" size={16} />
			</button>
		</div>

		<div class="scene-content">
			<!-- Each narrative phase fades in on its own beat -->
			{#key pending ? 'pending' : phase}
				<div class="phase-wrap" in:pop={{ duration: 260, y: 10 }}>
			{#if pending}
				<div class="scene-waiting" role="status" aria-label="{companionName} is writing">
					<div class="speaker-name">{companionName}</div>
					<div class="waiting-dots" aria-hidden="true"><span></span><span></span><span></span></div>
					<button class="btn btn-primary" disabled>Continue</button>
				</div>
			{:else if phase === 'intro' && scene.intro}
				<div class="scene-intro">
					<p class="intro-text">{scene.intro}</p>
					<button class="btn btn-primary" onclick={advance}>Continue</button>
				</div>
			{/if}

			<!-- Dialogue phase -->
			{#if phase === 'dialogue' && scene.dialogue}
				<div class="scene-dialogue">
					<div class="speaker-name">{companionName}</div>
					<p class="dialogue-text">"{scene.dialogue}"</p>
					{#if !scene.choices || scene.choices.length === 0}
						<button class="btn btn-primary" onclick={advance}>Continue</button>
					{/if}
				</div>
			{/if}

			<!-- Choices phase -->
			{#if phase === 'choices' && scene.choices}
				<div class="scene-choices">
					<div class="speaker-name">{companionName}</div>
					<p class="dialogue-text">"{scene.dialogue}"</p>
					<ChoiceDialog choices={scene.choices} onSelect={handleChoice} />
				</div>
			{/if}

			<!-- Response phase (after choice) -->
			{#if phase === 'response' && selectedChoice}
				<div class="scene-response">
					<div class="your-choice">
						<span class="choice-label">You said:</span>
						<p class="choice-text">"{selectedChoice.text}"</p>
					</div>
					<div class="speaker-name">{companionName}</div>
					<p class="dialogue-text">"{selectedChoice.response}"</p>
					<button class="btn btn-primary" onclick={advance}>Continue</button>
				</div>
			{/if}

			<!-- Outro phase -->
			{#if phase === 'outro' && scene.outro}
				<div class="scene-outro">
					<p class="outro-text">{scene.outro}</p>
					<button class="btn btn-primary" onclick={advance}>Finish</button>
				</div>
			{/if}

			{#if phase !== 'choices' && !pending}
				<div class="hint">Click to continue</div>
			{/if}
				</div>
			{/key}
		</div>
	</div>
	{/snippet}
	</Dialog.Content>
</Dialog.Portal>
</Dialog.Root>

<style>
	.scene-container {
		--dialog-width: 500px;
	}

	/* Header */
	.scene-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.5rem 0.5rem 1rem;
		background: var(--bg-secondary);
	}

	.event-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-weight: 600;
		font-size: 14px;
		color: var(--text-primary);
	}

	/* Content */
	.scene-content {
		padding: 1.5rem;
	}

	.intro-text,
	.outro-text {
		font-style: italic;
		color: var(--text-primary);
		text-align: center;
		line-height: 1.7;
		margin-bottom: 1.25rem;
	}

	.speaker-name {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		color: var(--text-primary);
		font-weight: 600;
		font-size: 0.8rem;
		margin-bottom: 0.5rem;
		padding: 0.25rem 0.625rem;
		background: var(--accent-muted);
		border-radius: var(--radius-full);
	}

	.dialogue-text {
		color: var(--text-primary);
		font-size: 1rem;
		line-height: 1.7;
		margin-bottom: 1.25rem;
	}

	.your-choice {
		background: var(--bg-secondary);
		border-left: 3px solid var(--accent);
		padding: 0.75rem 1rem;
		margin-bottom: 1.25rem;
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}

	.choice-label { font-size: 13px; color: var(--text-secondary); }

	.choice-text {
		color: var(--text-primary);
		margin: 0.25rem 0 0;
	}

	.waiting-dots {
		display: flex;
		gap: 0.375rem;
		padding: 0.75rem 0.25rem 1.5rem;
	}

	.waiting-dots span {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--text-tertiary);
		animation: dot-pulse 1.2s ease-in-out infinite;
	}

	.waiting-dots span:nth-child(2) { animation-delay: 0.15s; }
	.waiting-dots span:nth-child(3) { animation-delay: 0.3s; }

	@keyframes dot-pulse {
		0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
		40% { opacity: 1; transform: translateY(-3px); }
	}

	@media (prefers-reduced-motion: reduce) {
		.waiting-dots span { animation: none; opacity: 0.6; }
	}

	.hint {
		text-align: center;
		color: var(--text-secondary);
		font-size: 13px;
		margin-top: 1rem;
	}
</style>

<script lang="ts">
	import type { Scene, SceneChoice, EventType } from '$lib/types/events';
	import type { StateUpdates } from '$lib/types/character';
	import { Icon } from '$lib/components/ui';
	import ChoiceDialog from './ChoiceDialog.svelte';
	import { nextPhase, type ScenePhase } from './scene-flow';
	import { pop, fadeFast } from '$lib/utils/motion';

	interface Props {
		scene: Scene;
		/** She is still writing the scene; hold on a waiting state. */
		pending?: boolean;
		eventName?: string;
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

	// Clicks on the dialogue box advance the narrative too, not just the
	// backdrop. Buttons (close, continue, choices) handle themselves, and
	// advance() ignores the choices phase.
	function handleContainerClick(e: MouseEvent) {
		e.stopPropagation();
		if (e.target instanceof Element && e.target.closest('button')) return;
		advance();
	}

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

<div class="scene-overlay" class:overlay transition:fadeFast={{ duration: 200 }} onclick={advance} role="button" tabindex="0" onkeypress={(e) => e.key === 'Enter' && advance()}>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="scene-container" transition:pop={{ duration: 240, y: 18 }} onclick={handleContainerClick} onkeydown={(e) => e.key === 'Escape' && onClose()} role="dialog" aria-modal="true" tabindex="-1">
		<!-- Header with event title -->
		{#if eventName}
			<div class="scene-header">
				<div class="event-title">
					<Icon name={eventIcon} size={18} />
					<span>{eventName}</span>
				</div>
				<button class="btn btn-ghost btn-icon close-btn" onclick={onClose} aria-label="Close">
					<Icon name="x" size={16} />
				</button>
			</div>
		{:else}
			<button class="btn btn-ghost btn-icon close-btn floating" onclick={onClose} aria-label="Close">
				<Icon name="x" size={16} />
			</button>
		{/if}

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

			<!-- Click to continue hint -->
			{#if phase !== 'choices' && !pending}
				<div class="hint">Click anywhere to continue</div>
			{/if}
				</div>
			{/key}
		</div>
	</div>
</div>

<style>
	.scene-overlay {
		position: fixed;
		inset: 0;
		background: rgba(28, 43, 51, 0.28);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.scene-overlay.overlay {
		background: transparent;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	.scene-container {
		position: relative;
		background: var(--bg-primary);
		border-radius: var(--radius-xl);
		max-width: 500px;
		width: 90%;
		max-height: 80vh;
		overflow: hidden;
		box-shadow: var(--shadow-xl);
	}

	/* Header */
	.scene-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-secondary);
	}

	.event-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--accent);
	}

	.close-btn.floating {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
	}

	/* Content */
	.scene-content {
		padding: 1.5rem;
		overflow-y: auto;
		max-height: calc(80vh - 60px);
	}

	.intro-text,
	.outro-text {
		font-style: italic;
		color: var(--text-secondary);
		text-align: center;
		line-height: 1.7;
		margin-bottom: 1.25rem;
	}

	.speaker-name {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		color: var(--accent);
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

	.choice-label { font-size: 12px; color: var(--text-secondary); }

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
		color: var(--text-tertiary);
		font-size: 0.7rem;
		margin-top: 1rem;
	}
</style>

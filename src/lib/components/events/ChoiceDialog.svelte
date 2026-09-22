<script lang="ts">
	import type { SceneChoice } from '$lib/types/events';

	interface Props {
		choices: SceneChoice[];
		onSelect: (index: number) => void;
	}

	let { choices, onSelect }: Props = $props();
</script>

<div class="choices-container">
	{#each choices as choice, index}
		<button
			class="choice-btn btn btn-secondary"
			onclick={() => onSelect(index)}
			style="animation-delay: {index * 0.1}s"
		>
			<span class="choice-number">{index + 1}</span>
			<span class="choice-text">{choice.text}</span>
		</button>
	{/each}
</div>

<style>
	.choices-container {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.choice-btn { display: flex; text-align: left; white-space: normal; animation: slideIn 0.3s ease-out backwards; }

	@keyframes slideIn {
		from {
			transform: translateX(-10px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}



	.choice-number { background: var(--control-selected); display: grid; place-items: center; width: 24px; height: 24px; flex-shrink: 0; border: 1px solid var(--border-light); border-radius: 4px; font-size: 12px; color: var(--text-secondary); }

	.choice-text {
		flex: 1;
		line-height: 1.5;
		font-size: 14px;
	}
	@media (prefers-reduced-motion: reduce) { .choice-btn { animation: none; } }
</style>

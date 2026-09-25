<script lang="ts">
	interface Props {
		audioLevel: number;
		transcript: string;
	}

	let { audioLevel, transcript }: Props = $props();

	// Generate bar heights based on audio level with some variation
	const barCount = 5;
	let bars = $derived(
		Array.from({ length: barCount }, (_, i) => {
			const centerIndex = Math.floor(barCount / 2);
			const distanceFromCenter = Math.abs(i - centerIndex);
			const baseHeight = 0.2;
			const levelContribution = audioLevel * (1 - distanceFromCenter * 0.12);
			const randomFactor = 0.85 + Math.random() * 0.3;
			return Math.min(1, Math.max(baseHeight, levelContribution * randomFactor));
		})
	);
</script>

<div class="visualizer-container">
	<div class="bars">
		{#each bars as height, i}
			<div
				class="bar"
				style="height: {4 + height * 16}px; animation-delay: {i * 50}ms"
			></div>
		{/each}
	</div>
	<span class="transcript" class:placeholder={!transcript}>
		{transcript || 'Listening...'}
	</span>
</div>

<style>
	.visualizer-container {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
		padding: 0.625rem 0.5rem;
		min-height: 24px;
		overflow: hidden;
	}

	.bars {
		display: flex;
		align-items: center;
		gap: 3px;
		flex-shrink: 0;
	}

	.bar {
		width: 3px;
		background: var(--accent);
		border-radius: 1.5px;
		transition: height 0.08s ease-out;
		animation: pulse 0.5s ease-in-out infinite alternate;
	}

	@keyframes pulse {
		from {
			opacity: 0.7;
		}
		to {
			opacity: 1;
		}
	}

	.transcript {
		flex: 1;
		min-width: 0;
		color: var(--text-primary);
		font-size: 1rem;
		line-height: 1.5;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.transcript.placeholder {
		color: var(--text-secondary);
	}
</style>

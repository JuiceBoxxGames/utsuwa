<script lang="ts">
	import HeartIcon from '@lucide/svelte/icons/heart';
	import { m } from '$lib/paraglide/messages';
	import { stepLoop } from './step-loop';

	// Eight stages; the loop pauses on five of them, ending at Soulmate
	const stops = [
		{ at: 0, label: () => m.adv_stage_stranger() },
		{ at: 2, label: () => m.adv_stage_friend() },
		{ at: 3, label: () => m.adv_stage_close() },
		{ at: 5, label: () => m.adv_stage_dating() },
		{ at: 7, label: () => m.adv_stage_soulmate() }
	];
	// Declared in markup so Svelte keeps the [data-step] rules; stepLoop drives it
	let step = $state('0');
	const durations = [1000, 1000, 1000, 1000, 2400];
</script>

<div class="vg stages" data-vignette="stages" data-step={step} data-last={durations.length - 1} use:stepLoop={durations} aria-hidden="true">
	<div class="labels">
		{#each stops as s, i (s.at)}
			<span class="label" data-i={i}>{s.label()}</span>
		{/each}
	</div>
	<div class="track">
		<div class="fill"></div>
		{#each Array(8) as _, i (i)}
			<span class="dot" style="left: {(i / 7) * 100}%" data-i={i}></span>
		{/each}
	</div>
	<span class="heart"><HeartIcon size={16} /></span>
</div>

<style>
	.stages {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 22px;
		padding: 0 28px;
	}

	.labels {
		position: relative;
		height: 28px;
	}

	.label {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 20px;
		font-weight: 500;
		letter-spacing: -0.01em;
		opacity: 0;
		transform: translateY(6px);
		transition:
			opacity 0.3s ease,
			transform 0.3s var(--ease-brand);
	}

	.track {
		position: relative;
		height: 4px;
		margin: 0 6px;
		border-radius: 999px;
		background: var(--bg-secondary);
	}

	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--p, 0%);
		border-radius: inherit;
		background: var(--accent);
		transition: width 0.6s var(--ease-brand);
	}

	.dot {
		position: absolute;
		top: 50%;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--bg-page);
		box-shadow: inset 0 0 0 2px var(--control-selected);
		transform: translate(-50%, -50%);
		transition: box-shadow 0.3s ease;
	}

	.heart {
		align-self: center;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--bg-secondary);
		color: var(--text-secondary);
		transition:
			background 0.3s ease,
			color 0.3s ease,
			transform 0.3s var(--ease-brand);
	}

	.stages[data-step='0'] { --p: 0%; }
	.stages[data-step='1'] { --p: 28.57%; }
	.stages[data-step='2'] { --p: 42.86%; }
	.stages[data-step='3'] { --p: 71.43%; }
	.stages[data-step='4'] { --p: 100%; }

	.stages[data-step='0'] .label[data-i='0'],
	.stages[data-step='1'] .label[data-i='1'],
	.stages[data-step='2'] .label[data-i='2'],
	.stages[data-step='3'] .label[data-i='3'],
	.stages[data-step='4'] .label[data-i='4'] {
		opacity: 1;
		transform: none;
	}

	.stages:not([data-step='0']) .dot[data-i='0'],
	.stages:is([data-step='1'], [data-step='2'], [data-step='3'], [data-step='4']) :is(.dot[data-i='1'], .dot[data-i='2']),
	.stages:is([data-step='2'], [data-step='3'], [data-step='4']) .dot[data-i='3'],
	.stages:is([data-step='3'], [data-step='4']) :is(.dot[data-i='4'], .dot[data-i='5']),
	.stages[data-step='4'] :is(.dot[data-i='6'], .dot[data-i='7']) {
		box-shadow: inset 0 0 0 5px var(--accent);
	}

	.stages[data-step='4'] .heart {
		background: var(--accent);
		color: var(--accent-contrast);
		transform: scale(1.1);
	}
</style>

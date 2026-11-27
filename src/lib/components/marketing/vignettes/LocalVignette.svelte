<script lang="ts">
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import AudioLinesIcon from '@lucide/svelte/icons/audio-lines';
	import MicIcon from '@lucide/svelte/icons/mic';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import { m } from '$lib/paraglide/messages';
	import { stepLoop } from './step-loop';

	// Each part comes online on the device, one after another
	// Declared in markup so Svelte keeps the [data-step] rules; stepLoop drives it
	let step = $state('0');
	const durations = [700, 700, 700, 2600];
	const rows = [
		{ icon: CpuIcon, label: () => m.adv_local_model(), value: 'Ollama' },
		{ icon: AudioLinesIcon, label: () => m.adv_local_voice(), value: 'OmniVoice' },
		{ icon: MicIcon, label: () => m.adv_local_ears(), value: 'Whisper' }
	];
</script>

<div class="vg local" data-vignette="local" data-step={step} data-last={durations.length - 1} use:stepLoop={durations} aria-hidden="true">
	<span class="offline vg-chip"><WifiOffIcon size={12} />{m.adv_local_offline()}</span>
	<ul>
		{#each rows as row, i (row.value)}
			<li data-i={i}>
				<span class="ico"><row.icon size={14} /></span>
				<span class="text"><span class="k">{row.label()}</span><span class="v">{row.value}</span></span>
				<span class="state"><span class="dot"></span>{m.adv_local_device()}</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	.local {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 12px;
		padding: 18px;
	}

	.offline {
		position: absolute;
		top: 12px;
		right: 12px;
		font-size: 11px;
		color: var(--text-secondary);
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 14px 0 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 12px;
		background: var(--bg-primary);
	}

	.ico {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 8px;
		background: var(--bg-secondary);
	}

	.text {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}

	.k {
		color: var(--text-secondary);
		font-size: 11px;
	}

	.v {
		font-weight: 500;
	}

	.state {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
		color: var(--text-secondary);
		font-size: 11px;
		opacity: 0.35;
		transition: opacity 0.3s ease;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--control-selected);
		transition: background 0.3s ease;
	}

	.local:not([data-step='0']) li[data-i='0'] .state,
	.local:is([data-step='1'], [data-step='2'], [data-step='3']) li[data-i='0'] .state,
	.local:is([data-step='2'], [data-step='3']) li[data-i='1'] .state,
	.local[data-step='3'] li[data-i='2'] .state {
		opacity: 1;
	}

	.local:is([data-step='1'], [data-step='2'], [data-step='3']) li[data-i='0'] .dot,
	.local:is([data-step='2'], [data-step='3']) li[data-i='1'] .dot,
	.local[data-step='3'] li[data-i='2'] .dot {
		background: var(--color-success);
	}
</style>

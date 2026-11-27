<script lang="ts">
	import HouseIcon from '@lucide/svelte/icons/house';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { m } from '$lib/paraglide/messages';
	import { stepLoop } from './step-loop';

	// 0 the question, 1 a request goes out to the MCP server, 2 the result comes back, 3 the answer
	// Declared in markup so Svelte keeps the [data-step] rules; stepLoop drives it
	let step = $state('0');
	const durations = [650, 850, 850, 2400];
</script>

<div class="vg tools" data-vignette="tools" data-step={step} data-last={durations.length - 1} use:stepLoop={durations} aria-hidden="true">
	<p class="vg-bubble user">{m.adv_tools_user()}</p>

	<div class="lane">
		<span class="me" title=""></span>
		<div class="track">
			<span class="using">{m.adv_tools_using()}</span>
			<span class="packet out vg-mono">get_state(living_room)</span>
			<span class="packet back vg-mono">21.5 °C</span>
		</div>
		<div class="server">
			<span class="ico"><HouseIcon size={14} /></span>
			<span class="name">
				<b>Home Assistant</b>
				<small>MCP server</small>
			</span>
			<span class="ok"><CheckIcon size={12} /></span>
		</div>
	</div>

	<div class="answer">
		<p class="vg-bubble reply">{m.adv_tools_reply()}</p>
		<span class="via">{m.adv_tools_via()}</span>
	</div>
</div>

<style>
	.tools {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 14px;
		padding: 16px 18px;
	}

	.tools p {
		margin: 0;
	}

	.lane {
		display: grid;
		grid-template-columns: 36px 1fr auto;
		align-items: center;
		gap: 10px;
		opacity: 0.25;
		transition: opacity 0.3s ease;
	}

	/* your companion: Tsuki's face, cropped from the closing render */
	.me {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--bg-secondary) url('/landing-page/cta-pair.webp') 25.3% 18.5% / 720% auto no-repeat;
		box-shadow: 0 0 0 2px var(--bg-page), 0 0 0 3px var(--control-selected);
	}

	.track {
		position: relative;
		height: 36px;
	}

	/* the wire between the companion and the server */
	.track::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		border-top: 1.5px dashed var(--control-selected);
	}

	.using {
		position: absolute;
		left: 50%;
		top: -16px;
		translate: -50% 0;
		color: var(--text-secondary);
		font-size: 11px;
		white-space: nowrap;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.packet {
		position: absolute;
		top: 50%;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--bg-primary);
		box-shadow: 0 0 0 1px var(--control-selected);
		font-size: 11px;
		white-space: nowrap;
		opacity: 0;
	}

	.packet.out {
		left: 0;
		transform: translate(0, -50%);
	}

	.packet.back {
		left: 100%;
		transform: translate(-100%, -50%);
		background: var(--accent);
		color: var(--accent-contrast);
		box-shadow: none;
		font-weight: 600;
	}

	.server {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border-radius: 12px;
		background: var(--bg-primary);
		transition: box-shadow 0.25s ease;
	}

	.ico {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 7px;
		background: var(--bg-secondary);
	}

	.name {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}

	.name b {
		font-size: 12px;
		font-weight: 600;
	}

	.name small {
		color: var(--text-secondary);
		font-size: 10px;
	}

	.ok {
		position: absolute;
		top: -6px;
		right: -6px;
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--color-success);
		color: #fff;
		transform: scale(0);
		transition: transform 0.25s var(--ease-brand);
	}

	.answer {
		display: flex;
		align-items: center;
		gap: 10px;
		opacity: 0;
		transform: translateY(6px);
		transition:
			opacity 0.3s ease,
			transform 0.3s var(--ease-brand);
	}

	.via {
		color: var(--text-secondary);
		font-size: 11px;
		white-space: nowrap;
	}

	/* Steps */
	.tools:not([data-step='0']) .lane {
		opacity: 1;
	}
	.tools:is([data-step='1'], [data-step='2']) .using {
		opacity: 1;
	}
	.tools[data-step='1'] .packet.out {
		opacity: 1;
		left: 100%;
		transform: translate(-100%, -50%);
		transition: left 0.7s cubic-bezier(0.65, 0, 0.35, 1), transform 0.7s cubic-bezier(0.65, 0, 0.35, 1);
	}
	.tools:is([data-step='1'], [data-step='2']) .server {
		box-shadow: 0 0 0 2px var(--accent);
	}
	.tools:is([data-step='2'], [data-step='3']) .ok {
		transform: scale(1);
	}
	.tools:is([data-step='2'], [data-step='3']) .packet.back {
		opacity: 1;
		left: 0;
		transform: translate(0, -50%);
	}
	.tools[data-step='2'] .packet.back {
		transition: left 0.7s cubic-bezier(0.65, 0, 0.35, 1), transform 0.7s cubic-bezier(0.65, 0, 0.35, 1);
	}
	.tools[data-step='3'] .answer {
		opacity: 1;
		transform: none;
	}
</style>

<script lang="ts">
	import WrenchIcon from '@lucide/svelte/icons/wrench';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { m } from '$lib/paraglide/messages';
	import { stepLoop } from './step-loop';

	// 0 ask, 1 tool runs, 2 confirm, 3 result, 4 reply
	// Declared in markup so Svelte keeps the [data-step] rules; stepLoop drives it
	let step = $state('0');
	const durations = [900, 1100, 1300, 900, 2800];
</script>

<div class="vg tools" data-vignette="tools" data-step={step} data-last={durations.length - 1} use:stepLoop={durations} aria-hidden="true">
	<div class="thread">
		<p class="vg-bubble user">{m.adv_tools_user()}</p>
		<div class="card vg-in">
			<div class="row">
				<span class="ico"><WrenchIcon size={14} /></span>
				<span class="vg-mono">home_assistant.get_state</span>
				<span class="status run">
					<span class="spin"></span>
				</span>
				<span class="status done"><CheckIcon size={14} /></span>
			</div>
			<p class="vg-mono arg">entity_id: sensor.living_room</p>
			<div class="confirm">
				<span>{m.adv_tools_confirm()}</span>
				<span class="allow">{m.adv_tools_allow()}</span>
			</div>
			<p class="vg-mono result">21.5 °C</p>
		</div>
		<p class="vg-bubble reply vg-in">{m.adv_tools_reply()}</p>
	</div>
</div>

<style>
	.thread {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 18px;
	}

	.thread p {
		margin: 0;
	}

	.card {
		width: min(100%, 340px);
		padding: 10px 12px;
		border-radius: 14px;
		background: var(--bg-primary);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.ico {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 7px;
		background: var(--bg-secondary);
	}

	.status {
		display: none;
		margin-left: auto;
	}

	.spin {
		display: block;
		width: 14px;
		height: 14px;
		border: 2px solid var(--control-selected);
		border-top-color: var(--text-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.arg {
		margin: 6px 0 0 32px;
		color: var(--text-secondary);
	}

	.confirm,
	.result {
		display: none;
		margin: 8px 0 0 32px;
	}

	.confirm {
		align-items: center;
		gap: 10px;
		color: var(--text-secondary);
	}

	.allow {
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 500;
	}

	.result {
		font-size: 14px;
		font-weight: 600;
		font-family: var(--font-mono);
	}

	/* Steps */
	.tools:not([data-step='0']) .card {
		opacity: 1;
		transform: none;
	}
	.tools:is([data-step='1'], [data-step='2']) .run {
		display: block;
	}
	.tools[data-step='2'] .confirm {
		display: flex;
	}
	.tools:is([data-step='3'], [data-step='4']) .done {
		display: grid;
	}
	.tools:is([data-step='3'], [data-step='4']) .result {
		display: block;
	}
	.tools[data-step='4'] .reply {
		opacity: 1;
		transform: none;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

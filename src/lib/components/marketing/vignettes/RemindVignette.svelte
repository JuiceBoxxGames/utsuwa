<script lang="ts">
	import BellIcon from '@lucide/svelte/icons/bell';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import { m } from '$lib/paraglide/messages';
	import { stepLoop } from './step-loop';

	// 0 ask, 1 scheduled, 2 counting down, 3 due: the companion speaks up
	// Declared in markup so Svelte keeps the [data-step] rules; stepLoop drives it
	let step = $state('0');
	const durations = [900, 1100, 1100, 2600];
</script>

<div class="vg remind" data-vignette="remind" data-step={step} data-last={durations.length - 1} use:stepLoop={durations} aria-hidden="true">
	<span class="bell"><BellIcon size={15} /><span class="badge">1</span></span>
	<div class="thread">
		<p class="vg-bubble user">{m.adv_remind_user()}</p>
		<div class="task vg-in">
			<ClockIcon size={14} />
			<span>{m.adv_remind_task()}</span>
			<span class="when vg-mono"><span class="t10">10:00</span><span class="t9">09:59</span><span class="t0">00:00</span></span>
		</div>
		<p class="vg-bubble due vg-in">{m.adv_remind_due()}</p>
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

	.bell {
		position: absolute;
		top: 12px;
		left: 12px;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--bg-primary);
	}

	.badge {
		position: absolute;
		top: -3px;
		right: -3px;
		display: grid;
		place-items: center;
		min-width: 16px;
		height: 16px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 10px;
		font-weight: 600;
		transform: scale(0);
		transition: transform 0.3s var(--ease-brand);
	}

	.thread {
		margin-top: 28px;
	}

	.task {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		align-self: flex-start;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--bg-primary);
	}

	.when {
		color: var(--text-secondary);
	}

	.when span {
		display: none;
	}

	.remind:is([data-step='0'], [data-step='1']) .t10,
	.remind[data-step='2'] .t9,
	.remind[data-step='3'] .t0 {
		display: inline;
	}

	.remind:not([data-step='0']) .task {
		opacity: 1;
		transform: none;
	}

	.remind[data-step='3'] .due {
		opacity: 1;
		transform: none;
	}

	.remind[data-step='3'] .badge {
		transform: scale(1);
	}
</style>

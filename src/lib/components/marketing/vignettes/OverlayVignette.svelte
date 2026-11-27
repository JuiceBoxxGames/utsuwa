<script lang="ts">
	import { stepLoop } from './step-loop';

	// 0 a normal desktop, 1 the hotkey goes down, 2 the companion floats over it
	// Declared in markup so Svelte keeps the [data-step] rules; stepLoop drives it
	let step = $state('0');
	const durations = [1100, 600, 3000];
</script>

<div class="vg overlay" data-vignette="overlay" data-step={step} data-last={durations.length - 1} use:stepLoop={durations} aria-hidden="true">
	<div class="desk">
		<div class="win editor">
			<div class="bar"><i></i><i></i><i></i></div>
			{#each [72, 54, 88, 40, 66, 80, 48] as w, i (i)}<span class="line" style="width: {w}%"></span>{/each}
		</div>
		<div class="win browser">
			<div class="bar"><i></i><i></i><i></i></div>
			<span class="hero"></span>
			<span class="line" style="width: 70%"></span>
			<span class="line" style="width: 52%"></span>
		</div>
		<img class="buddy" src="/landing-page/hero-memory.webp" alt="" loading="lazy" />
	</div>
	<div class="keys">
		<kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>U</kbd>
	</div>
</div>

<style>
	.overlay {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		padding: 18px;
	}

	.desk {
		position: relative;
		width: min(100%, 520px);
		aspect-ratio: 16 / 9;
		border-radius: 12px;
		background: var(--bg-secondary);
		overflow: hidden;
	}

	.win {
		position: absolute;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 10px 10px;
		border-radius: 8px;
		background: var(--bg-page);
		box-shadow: var(--shadow-sm);
	}

	.editor {
		left: 6%;
		top: 12%;
		width: 52%;
		height: 70%;
	}

	.browser {
		left: 40%;
		top: 26%;
		width: 44%;
		height: 62%;
	}

	.bar {
		display: flex;
		gap: 4px;
		padding: 7px 0 3px;
	}

	.bar i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--control-selected);
	}

	.line {
		height: 5px;
		border-radius: 3px;
		background: var(--bg-secondary);
	}

	.hero {
		height: 34%;
		border-radius: 5px;
		background: var(--bg-secondary);
	}

	.buddy {
		position: absolute;
		right: 2%;
		bottom: -46%;
		height: 120%;
		opacity: 0;
		transform: translateY(14%);
		transition:
			opacity 0.45s ease,
			transform 0.5s var(--ease-brand);
		filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.18));
	}

	.keys {
		display: flex;
		gap: 6px;
	}

	kbd {
		min-width: 28px;
		padding: 4px 8px;
		border-radius: 7px;
		background: var(--bg-primary);
		box-shadow: inset 0 -2px 0 var(--control-selected);
		font-family: var(--font-sans);
		font-size: 12px;
		text-align: center;
		transition:
			background 0.15s ease,
			color 0.15s ease,
			transform 0.15s ease;
	}

	.overlay[data-step='1'] kbd {
		background: var(--accent);
		color: var(--accent-contrast);
		box-shadow: none;
		transform: translateY(1px);
	}

	.overlay:is([data-step='1'], [data-step='2']) .buddy {
		opacity: 1;
		transform: none;
	}
</style>

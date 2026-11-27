<script lang="ts">
	import PlayIcon from '@lucide/svelte/icons/play';
	import { m } from '$lib/paraglide/messages';
	import { stepLoop } from './step-loop';

	// The companion floats on top while you switch apps underneath:
	// 0 your editor, 1 a browser comes forward, 2 then a video, 3 and they are still right here
	// Declared in markup so Svelte keeps the [data-step] rules; stepLoop drives it
	let step = $state('0');
	const durations = [1000, 1000, 1000, 2600];
</script>

<div class="vg overlay" data-vignette="overlay" data-step={step} data-last={durations.length - 1} use:stepLoop={durations} aria-hidden="true">
	<div class="desk">
		<div class="win editor">
			<div class="bar"><i></i><i></i><i></i></div>
			{#each [62, 44, 78, 36, 58, 70, 40, 52] as w, i (i)}<span class="code" style="width: {w}%; margin-left: {i % 3 === 1 ? 10 : 0}%"></span>{/each}
		</div>
		<div class="win browser">
			<div class="bar"><i></i><i></i><i></i><span class="url"></span></div>
			<span class="hero"></span>
			<span class="code" style="width: 66%"></span>
			<span class="code" style="width: 48%"></span>
		</div>
		<div class="win video">
			<span class="play"><PlayIcon size={16} /></span>
			<span class="scrub"><span></span></span>
		</div>
		<div class="buddy">
			<span class="bubble">{m.adv_overlay_bubble()}</span>
			<img src="/landing-page/hero-memory.webp" alt="" loading="lazy" />
		</div>
	</div>
	<div class="keys">
		<span class="combo"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>U</kbd><em>{m.adv_overlay_toggle()}</em></span>
		<span class="combo"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Space</kbd><em>{m.adv_overlay_talk()}</em></span>
	</div>
</div>

<style>
	.overlay {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 16px;
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
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.1);
		transition:
			opacity 0.45s ease,
			transform 0.45s var(--ease-brand);
	}

	.editor {
		left: 5%;
		top: 9%;
		width: 60%;
		height: 78%;
	}

	.browser {
		left: 22%;
		top: 16%;
		width: 56%;
		height: 72%;
		opacity: 0;
		transform: translateY(12%) scale(0.97);
	}

	.video {
		left: 12%;
		top: 26%;
		width: 50%;
		height: 62%;
		padding: 0;
		align-items: center;
		justify-content: center;
		background: #1c1c1f;
		box-shadow:
			0 4px 16px rgb(0 0 0 / 0.1),
			inset 0 0 0 1px rgb(255 255 255 / 0.08);
		opacity: 0;
		transform: translateY(12%) scale(0.97);
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 7px 0 3px;
	}

	.bar i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--control-selected);
	}

	.url {
		flex: 1;
		height: 8px;
		margin-left: 8px;
		border-radius: 4px;
		background: var(--bg-secondary);
	}

	.code {
		height: 5px;
		border-radius: 3px;
		background: var(--bg-secondary);
	}

	.hero {
		height: 36%;
		border-radius: 5px;
		background: var(--bg-secondary);
	}

	.play {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.14);
		color: #fff;
	}

	.scrub {
		position: absolute;
		left: 10%;
		right: 10%;
		bottom: 10%;
		height: 3px;
		border-radius: 2px;
		background: rgb(255 255 255 / 0.2);
	}

	.scrub span {
		display: block;
		width: 38%;
		height: 100%;
		border-radius: inherit;
		background: #fff;
	}

	/* The companion sits above every window, always */
	.buddy {
		position: absolute;
		right: 3%;
		bottom: 0;
		z-index: 5;
		width: 30%;
		height: 100%;
	}

	.buddy img {
		position: absolute;
		right: 0;
		bottom: -62%;
		height: 150%;
		filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.2));
	}

	.bubble {
		position: absolute;
		right: 46%;
		top: 10%;
		padding: 6px 10px;
		border-radius: 12px 12px 4px 12px;
		background: var(--bg-page);
		box-shadow: 0 2px 10px rgb(0 0 0 / 0.12);
		font-size: 11px;
		white-space: nowrap;
		opacity: 0;
		transform: translateY(6px);
		transition:
			opacity 0.3s ease,
			transform 0.3s var(--ease-brand);
	}

	.keys {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px 18px;
	}

	.combo {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	kbd {
		min-width: 24px;
		padding: 3px 7px;
		border-radius: 6px;
		background: var(--bg-primary);
		box-shadow: inset 0 -2px 0 var(--control-selected);
		font-family: var(--font-sans);
		font-size: 11px;
		text-align: center;
	}

	em {
		margin-left: 4px;
		color: var(--text-secondary);
		font-size: 11px;
		font-style: normal;
	}

	/* Steps: windows come forward underneath, the companion stays on top */
	.overlay:not([data-step='0']) .browser {
		opacity: 1;
		transform: none;
	}
	.overlay:is([data-step='2'], [data-step='3']) .video {
		opacity: 1;
		transform: none;
	}
	.overlay[data-step='3'] .bubble {
		opacity: 1;
		transform: none;
	}
</style>

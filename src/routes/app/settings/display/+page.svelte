<script lang="ts">
	import {
		displayStore,
		type ChatDisplayMode,
		type SidebarPosition,
		type ChatBarAlignment,
		type TextRevealSpeed
	} from '$lib/stores/display.svelte';

	// Stored values keep their original names; only the labels changed
	const modes: { value: ChatDisplayMode; label: string }[] = [
		{ value: 'bubble', label: 'Immersive' },
		{ value: 'sidebar', label: 'Chat window' },
		{ value: 'both', label: 'Both' },
		{ value: 'off', label: 'Off' }
	];

	const positions: { value: SidebarPosition; label: string }[] = [
		{ value: 'left', label: 'Left' },
		{ value: 'right', label: 'Right' }
	];

	const alignments: { value: ChatBarAlignment; label: string }[] = [
		{ value: 'left', label: 'Left' },
		{ value: 'center', label: 'Center' },
		{ value: 'right', label: 'Right' }
	];

	const revealSpeeds: { value: TextRevealSpeed; label: string }[] = [
		{ value: 'off', label: 'Off' },
		{ value: 'slow', label: 'Slow' },
		{ value: 'normal', label: 'Normal' },
		{ value: 'fast', label: 'Fast' }
	];

	const sidebarActive = $derived(
		displayStore.chatDisplayMode === 'sidebar' || displayStore.chatDisplayMode === 'both'
	);

	let windowResetDone = $state(false);

	function resetWindowPosition() {
		displayStore.requestChatWindowReset();
		windowResetDone = true;
		setTimeout(() => (windowResetDone = false), 2000);
	}

	function stepDelay(delta: number) {
		const current = displayStore.typingIndicatorDelayMs / 1000;
		const next = Math.round((current + delta) * 10) / 10;
		displayStore.setTypingIndicatorDelayMs(next * 1000);
	}
</script>

<div class="display-page">
	<header class="page-header">
		<h2>Display</h2>
		<p>Configure how chat messages appear on screen.</p>
	</header>

	<section class="card">
		<div class="card-header">
			<h3>Chat Display</h3>
			<button class="reset-btn" onclick={() => displayStore.resetChatDisplay()}>
				Reset to defaults
			</button>
		</div>

		<div class="segment-control" role="group" aria-label="Chat display mode">
			{#each modes as mode}
				<button
					class="segment-btn"
					class:active={displayStore.chatDisplayMode === mode.value}
					onclick={() => displayStore.setChatDisplayMode(mode.value)}
					aria-pressed={displayStore.chatDisplayMode === mode.value}
				>
					{mode.label}
				</button>
			{/each}
		</div>
		<p class="hint">
			Immersive shows her replies in a bubble by her head. Chat window is a messenger-style
			window with the full history and the input docked inside.
		</p>
	</section>

	{#if sidebarActive}
		<section class="card">
			<div class="card-header">
				<h3>Chat Window</h3>
			</div>

			<div class="settings-stack">
				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Layout</span>
						<span class="setting-desc">Dock beside the avatar, or below it on small screens</span>
					</div>
					<div class="segment-control compact" role="group" aria-label="Chat window layout">
						{#each ['floating', 'docked'] as layout}
							<button class="segment-btn" class:active={displayStore.chatWindowLayout === layout}
								aria-pressed={displayStore.chatWindowLayout === layout}
								onclick={() => displayStore.setChatWindowLayout(layout as 'floating' | 'docked')}>
								{layout === 'floating' ? 'Floating' : 'Docked'}
							</button>
						{/each}
					</div>
				</div>
				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Snap side</span>
						<span class="setting-desc">Which edge the window uses on wide screens</span>
					</div>
					<div class="segment-control compact" role="group" aria-label="Chat window snap side">
						{#each positions as pos}
							<button
								class="segment-btn"
								class:active={displayStore.sidebarPosition === pos.value}
								onclick={() => displayStore.setSidebarPosition(pos.value)}
								aria-pressed={displayStore.sidebarPosition === pos.value}
							>
								{pos.label}
							</button>
						{/each}
					</div>
				</div>

				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Window position</span>
						<span class="setting-desc">Bring the window back if it ends up off screen</span>
					</div>
					<button class="reset-btn" onclick={resetWindowPosition}>
						{windowResetDone ? 'Done' : 'Reset position'}
					</button>
				</div>
			</div>
		</section>
	{/if}

	<section class="card">
		<div class="card-header">
			<h3>Floating Bar</h3>
		</div>

		<div class="segment-control" role="group" aria-label="Floating bar alignment">
			{#each alignments as alignment}
				<button
					class="segment-btn"
					class:active={displayStore.chatBarAlignment === alignment.value}
					onclick={() => displayStore.setChatBarAlignment(alignment.value)}
					aria-pressed={displayStore.chatBarAlignment === alignment.value}
				>
					{alignment.label}
				</button>
			{/each}
		</div>
		<p class="hint">Where the input bar sits along the bottom edge.</p>
	</section>

	<section class="card">
		<div class="card-header">
			<h3>Text Reveal</h3>
		</div>

		<div class="segment-control" role="group" aria-label="Text reveal speed">
			{#each revealSpeeds as speed}
				<button
					class="segment-btn"
					class:active={displayStore.textRevealSpeed === speed.value}
					onclick={() => displayStore.setTextRevealSpeed(speed.value)}
					aria-pressed={displayStore.textRevealSpeed === speed.value}
				>
					{speed.label}
				</button>
			{/each}
		</div>
		<p class="hint">How quickly her replies appear, word by word. Off shows text instantly.</p>
	</section>

	<section class="card">
		<div class="card-header">
			<h3>Typing Indicator</h3>
		</div>

		<div class="settings-stack">
			<div class="setting-row">
				<div class="setting-info">
					<span class="setting-label">Wait tone</span>
					<span class="setting-desc">Soft audio ping while the typing indicator is visible</span>
				</div>
				<button
					class="service-toggle"
					class:enabled={displayStore.waitToneEnabled}
					onclick={() => displayStore.setWaitToneEnabled(!displayStore.waitToneEnabled)}
					aria-label="Toggle wait tone"
					aria-pressed={displayStore.waitToneEnabled}
				>
					<span class="toggle-track">
						<span class="toggle-thumb"></span>
					</span>
				</button>
			</div>

			<div class="setting-row">
				<div class="setting-info">
					<span class="setting-label">Delay</span>
					<span class="setting-desc">Wait before the typing dots appear</span>
				</div>
				<div class="delay-input-container">
					<button class="delay-step" onclick={() => stepDelay(-0.1)} disabled={displayStore.typingIndicatorDelayMs <= 0}>−</button>
					<input
						type="number"
						class="delay-input"
						min="0"
						max="10"
						step="0.1"
						value={(displayStore.typingIndicatorDelayMs / 1000).toFixed(1)}
						oninput={(e) => {
							const v = parseFloat(e.currentTarget.value);
							if (!Number.isNaN(v)) displayStore.setTypingIndicatorDelayMs(v * 1000);
						}}
					/>
					<span class="delay-unit">s</span>
					<button class="delay-step" onclick={() => stepDelay(0.1)} disabled={displayStore.typingIndicatorDelayMs >= 10000}>+</button>
				</div>
			</div>
		</div>
	</section>
</div>

<style>
	.display-page {
		height: 100%;
		max-width: 720px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow-y: auto;
	}

	.page-header {
		flex-shrink: 0;
	}

	.page-header h2 {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.page-header p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.9375rem;
	}

	.card {
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
		box-shadow: var(--shadow-sm);
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-bottom: 0.625rem;
	}

	.card-header h3 {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.settings-stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.segment-control.compact {
		width: auto;
		flex-shrink: 0;
	}

	.segment-control.compact .segment-btn {
		flex: 0 0 auto;
		padding: 0.4rem 0.9rem;
	}

	.segment-control {
		display: flex;
		width: 100%;
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
		padding: 0.25rem;
		gap: 0.25rem;
	}

	.segment-btn {
		flex: 1;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: calc(var(--radius-md) - 0.125rem);
		color: var(--text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
		white-space: nowrap;
	}

	.segment-btn:hover {
		color: var(--text-primary);
	}

	.segment-btn.active {
		background: var(--accent-muted);
		color: var(--accent);
		font-weight: 600;
	}

	.reset-btn {
		padding: 0.375rem 0.75rem;
		background: var(--bg-secondary);
		border: none;
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.reset-btn:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.hint {
		margin: 0.625rem 0 0;
		color: var(--text-secondary);
		font-size: 0.8125rem;
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.setting-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.setting-label {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--text-primary);
	}

	.setting-desc {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	/* Same switch as the LLM / TTS / STT pages */
	.service-toggle {
		position: relative;
		width: 40px;
		height: 22px;
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
	}

	.toggle-track {
		display: block;
		width: 100%;
		height: 100%;
		background: var(--bg-tertiary);
		border-radius: var(--radius-full);
		transition: background 0.2s ease;
	}

	.service-toggle.enabled .toggle-track {
		background: var(--accent);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 18px;
		height: 18px;
		background: #fff;
		border-radius: var(--radius-full);
		transition: transform 0.2s ease;
		box-shadow: var(--shadow-xs);
	}

	.service-toggle.enabled .toggle-thumb {
		transform: translateX(18px);
	}

	.delay-input-container {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.delay-step {
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-md);
		border: none;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.delay-step:hover:not(:disabled) {
		background: var(--bg-tertiary);
	}

	.delay-step:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.delay-input {
		width: 3.5rem;
		padding: 0.35rem 0.5rem;
		border-radius: var(--radius-md);
		border: none;
		background: var(--bg-secondary);
		font-size: 0.875rem;
		color: var(--text-primary);
		text-align: center;
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.delay-input::-webkit-outer-spin-button,
	.delay-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
	}

	.delay-unit {
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	@media (max-width: 640px) {
		.setting-row { flex-wrap: wrap; }
		.segment-btn { white-space: normal; }
	}
</style>

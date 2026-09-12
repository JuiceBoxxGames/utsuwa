<script lang="ts">
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
	import { Button } from '$lib/components/ui';
	import { wakeLockStore } from '$lib/stores/wake-lock.svelte';
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

	<SettingsSection
		title="Keep screen awake"
		description="Keep the display on while Utsuwa is visible. This can use more battery."
	>
		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">Keep screen awake</span>
				<span class="setting-desc" role="status">
					{#if wakeLockStore.status === 'unsupported'}Not supported in this browser or desktop
						webview.
					{:else if wakeLockStore.status === 'active'}Active. The display is staying awake.
					{:else if wakeLockStore.status === 'requesting'}Requesting permission to keep the display
						awake...
					{:else if displayStore.keepScreenAwake}Inactive. Your browser or device released or
						declined the request.
					{:else}Off. Your normal display timeout applies.{/if}
				</span>
			</div>
			<Switch
				label="Keep screen awake"
				checked={displayStore.keepScreenAwake}
				onchange={displayStore.setKeepScreenAwake}
				disabled={wakeLockStore.status === 'unsupported' && !displayStore.keepScreenAwake}
			/>
		</div>
		{#if displayStore.keepScreenAwake && wakeLockStore.status === 'inactive'}<Button
				variant="secondary"
				size="sm"
				onclick={() => wakeLockStore.retry()}>Try again</Button
			>{/if}
	</SettingsSection>

	<SettingsSection title="Chat display">
		{#snippet actions()}<Button
				variant="secondary"
				size="sm"
				onclick={() => displayStore.resetChatDisplay()}
			>
				Reset to defaults
			</Button>{/snippet}

		<SegmentedControl
			label="Chat display mode"
			options={modes}
			value={displayStore.chatDisplayMode}
			onchange={displayStore.setChatDisplayMode}
		/>
		<p class="hint">
			Immersive shows her replies in a bubble by her head. Chat window is a messenger-style window
			with the full history and the input docked inside.
		</p>
	</SettingsSection>

	{#if sidebarActive}
		<SettingsSection title="Chat window">
			<div class="settings-stack">
				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Layout</span>
						<span class="setting-desc">Dock beside the avatar, or below it on small screens</span>
					</div>
					<SegmentedControl
						label="Chat window layout"
						options={[
							{ value: 'floating', label: 'Floating' },
							{ value: 'docked', label: 'Docked' }
						]}
						value={displayStore.chatWindowLayout}
						onchange={displayStore.setChatWindowLayout}
						compact
					/>
				</div>
				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Snap side</span>
						<span class="setting-desc">Which edge the window uses on wide screens</span>
					</div>
					<SegmentedControl
						label="Chat window snap side"
						options={positions}
						value={displayStore.sidebarPosition}
						onchange={displayStore.setSidebarPosition}
						compact
					/>
				</div>

				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Window position</span>
						<span class="setting-desc">Bring the window back if it ends up off screen</span>
					</div>
					<Button variant="secondary" size="sm" onclick={resetWindowPosition}>
						{windowResetDone ? 'Done' : 'Reset position'}
					</Button>
				</div>
			</div>
		</SettingsSection>
	{/if}

	<SettingsSection title="Floating bar">
		<SegmentedControl
			label="Floating bar alignment"
			options={alignments}
			value={displayStore.chatBarAlignment}
			onchange={displayStore.setChatBarAlignment}
		/>
		<p class="hint">Where the input bar sits along the bottom edge.</p>
	</SettingsSection>

	<SettingsSection title="Text reveal">
		<SegmentedControl
			label="Text reveal speed"
			options={revealSpeeds}
			value={displayStore.textRevealSpeed}
			onchange={displayStore.setTextRevealSpeed}
		/>
		<p class="hint">How quickly her replies appear, word by word. Off shows text instantly.</p>
	</SettingsSection>

	<SettingsSection title="Typing indicator">
		<div class="settings-stack">
			<div class="setting-row">
				<div class="setting-info">
					<span class="setting-label">Wait tone</span>
					<span class="setting-desc">Soft audio ping while the typing indicator is visible</span>
				</div>
				<Switch
					label="Wait tone"
					checked={displayStore.waitToneEnabled}
					onchange={displayStore.setWaitToneEnabled}
				/>
			</div>

			<div class="setting-row">
				<div class="setting-info">
					<span class="setting-label">Delay</span>
					<span class="setting-desc">Wait before the typing dots appear</span>
				</div>
				<div class="delay-input-container">
					<button
						class="delay-step"
						aria-label="Decrease typing delay"
						onclick={() => stepDelay(-0.1)}
						disabled={displayStore.typingIndicatorDelayMs <= 0}>−</button
					>
					<input
						type="number"
						class="delay-input settings-field"
						aria-label="Typing indicator delay in seconds"
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
					<button
						class="delay-step"
						aria-label="Increase typing delay"
						onclick={() => stepDelay(0.1)}
						disabled={displayStore.typingIndicatorDelayMs >= 10000}>+</button
					>
				</div>
			</div>
		</div>
	</SettingsSection>
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
		font-size: 0.875rem;
	}

	.settings-stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
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

	.delay-input-container {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.delay-step {
		width: 44px;
		height: 44px;
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
		.setting-row {
			flex-wrap: wrap;
		}
	}
</style>

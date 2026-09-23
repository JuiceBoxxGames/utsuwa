<script lang="ts">
	import { onMount } from 'svelte';
	import { getColorMode, setColorMode, type ColorMode } from '$lib/utils/color-mode';
	let colorMode = $state<ColorMode>('system');
	const colorModes: { value: ColorMode; label: string; icon: string }[] = [
		{ value: 'system', label: 'System', icon: 'monitor' },
		{ value: 'light', label: 'Light', icon: 'sun' },
		{ value: 'dark', label: 'Dark', icon: 'moon' }
	];
	onMount(() => { colorMode = getColorMode(); });

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
		{ value: 'sidebar', label: 'Chat window' }
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

	const sidebarActive = $derived(displayStore.chatDisplayMode === 'sidebar');

	function stepDelay(delta: number) {
		const current = displayStore.typingIndicatorDelayMs / 1000;
		const next = Math.round((current + delta) * 10) / 10;
		displayStore.setTypingIndicatorDelayMs(next * 1000);
	}
</script>

<div class="display-page">
	<header class="page-header"><h2>Display</h2><p>Choose your appearance and how conversations appear on screen.</p></header>
	<SettingsSection title="Appearance">
		<div class="setting-row">
			<div class="setting-info"><span class="setting-label">Color theme</span><span class="setting-desc">Choose a theme or follow your device's appearance.</span></div>
			<SegmentedControl label="Color theme" options={colorModes} value={colorMode} onchange={(value) => { colorMode = value; setColorMode(value); }} compact />
		</div>
	</SettingsSection>
	<SettingsSection title="Chat display">
		{#snippet actions()}<Button variant="ghost" size="sm" onclick={() => displayStore.resetChatDisplay()}>Reset to defaults</Button>{/snippet}
		<div class="setting-row">
			<div class="setting-info"><span class="setting-label">Conversation layout</span><span class="setting-desc">Show replies beside your companion or in a docked chat window.</span></div>
			<SegmentedControl label="Chat display mode" options={modes} value={displayStore.chatDisplayMode} onchange={displayStore.setChatDisplayMode} compact />
		</div>
		{#if sidebarActive}
			<div class="setting-row">
				<div class="setting-info"><span class="setting-label">Dock side</span><span class="setting-desc">Dock beside the avatar on wide screens, or below it on small screens.</span></div>
				<SegmentedControl label="Chat window dock side" options={positions} value={displayStore.sidebarPosition} onchange={displayStore.setSidebarPosition} compact />
			</div>
		{:else}
			<div class="setting-row">
				<div class="setting-info"><span class="setting-label">Input bar alignment</span><span class="setting-desc">Where the input bar sits along the bottom edge.</span></div>
				<SegmentedControl label="Floating bar alignment" options={alignments} value={displayStore.chatBarAlignment} onchange={displayStore.setChatBarAlignment} compact />
			</div>
		{/if}
		<div class="setting-row">
			<div class="setting-info"><span class="setting-label">Text reveal</span><span class="setting-desc">How quickly replies appear. Off shows the full response immediately.</span></div>
			<SegmentedControl label="Text reveal speed" options={revealSpeeds} value={displayStore.textRevealSpeed} onchange={displayStore.setTextRevealSpeed} compact />
		</div>
	</SettingsSection>
	<SettingsSection title="Typing indicator">
		<div class="setting-row">
			<div class="setting-info"><span class="setting-label">Wait tone</span><span class="setting-desc">Soft audio ping while the typing indicator is visible.</span></div>
			<Switch label="Wait tone" checked={displayStore.waitToneEnabled} onchange={displayStore.setWaitToneEnabled} />
		</div>
		<div class="setting-row">
			<div class="setting-info"><span class="setting-label">Delay</span><span class="setting-desc">Wait before the typing dots appear.</span></div>
			<div class="delay-input-container">
				<button class="btn btn-secondary btn-icon" aria-label="Decrease typing delay" onclick={() => stepDelay(-0.1)} disabled={displayStore.typingIndicatorDelayMs <= 0}>−</button>
				<input type="number" class="delay-input settings-field" aria-label="Typing indicator delay in seconds" min="0" max="10" step="0.1" value={(displayStore.typingIndicatorDelayMs / 1000).toFixed(1)} oninput={(e) => { const v = parseFloat(e.currentTarget.value); if (!Number.isNaN(v)) displayStore.setTypingIndicatorDelayMs(v * 1000); }} />
				<span class="delay-unit">s</span>
				<button class="btn btn-secondary btn-icon" aria-label="Increase typing delay" onclick={() => stepDelay(0.1)} disabled={displayStore.typingIndicatorDelayMs >= 10000}>+</button>
			</div>
		</div>
	</SettingsSection>
	<SettingsSection title="Behavior">
		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">Keep screen awake</span>
				<span class="setting-desc">Keep the display on while Utsuwa is visible. This can use more battery.</span>
				<span class="setting-desc" role="status">
					{#if wakeLockStore.status === 'unsupported'}Not supported in this browser or desktop webview.
					{:else if wakeLockStore.status === 'active'}Active. The display is staying awake.
					{:else if wakeLockStore.status === 'requesting'}Requesting permission to keep the display awake...
					{:else if displayStore.keepScreenAwake}Inactive. Your browser or device released or declined the request.
					{:else}Off. Your normal display timeout applies.{/if}
				</span>
			</div>
			<Switch label="Keep screen awake" checked={displayStore.keepScreenAwake} onchange={displayStore.setKeepScreenAwake} disabled={wakeLockStore.status === 'unsupported' && !displayStore.keepScreenAwake} />
		</div>
		{#if displayStore.keepScreenAwake && wakeLockStore.status === 'inactive'}<Button variant="secondary" size="sm" onclick={() => wakeLockStore.retry()}>Try again</Button>{/if}
		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">Mood expressions</span>
				<span class="setting-desc">Her face reflects her current mood. Turn this off if your model's expressions read too strong.</span>
			</div>
			<Switch label="Mood expressions" checked={displayStore.moodExpressions} onchange={displayStore.setMoodExpressions} />
		</div>
	</SettingsSection>
</div>

<style>
	.display-page {
		height: 100%;
		max-width: 960px;
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

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.setting-info {
		flex: 1;
		min-width: 180px;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.setting-label {
		font-weight: 500;
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

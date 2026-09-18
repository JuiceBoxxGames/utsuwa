<script lang="ts">
	import { goto } from '$app/navigation';
	import { Icon } from '$lib/components/ui';
	import CameraSettingsPanel from '$lib/components/ui/CameraSettingsPanel.svelte';
	import ArUnsupportedModal from '$lib/components/ui/ArUnsupportedModal.svelte';
	import { localPath } from '$lib/config/links';
	import { isTauri } from '$lib/services/platform';
	import { arStore } from '$lib/stores/ar.svelte';
	import { getColorMode, cycleColorMode, type ColorMode } from '$lib/utils/color-mode';
	import { onMount } from 'svelte';
	import type { Reminder } from '$lib/types/memory';

	interface Props {
		onInfoClick: () => void;
		upcomingReminders?: Reminder[];
		onDeleteReminder?: (id: number) => void;
		recentFired?: Reminder[];
		onDismissRecentFired?: (id: number) => void;
	}

	let {
		onInfoClick,
		upcomingReminders = [],
		onDeleteReminder,
		recentFired = [],
		onDismissRecentFired
	}: Props = $props();
	let showOverlayBtn = $state(false);
	let clusterOpen = $state(false);
	let remindersOpen = $state(false);
	let showCamera = $state(false);
	let colorMode = $state<ColorMode>('system');
	let rootEl = $state<HTMLDivElement | null>(null);
	let showArModal = $state(false);

	function handleArClick() {
		if (!arStore.supported) {
			showArModal = true;
			clusterOpen = false;
			return;
		}
		if (arStore.active) {
			arStore.exit();
		} else {
			arStore.enter();
		}
	}

	const themeIcon = $derived(
		colorMode === 'system' ? 'monitor' : colorMode === 'light' ? 'sun' : 'moon'
	);
	const themeLabel = $derived(
		colorMode === 'system' ? 'Theme: System' : colorMode === 'light' ? 'Theme: Light' : 'Theme: Dark'
	);

	onMount(() => {
		showOverlayBtn = isTauri();
		colorMode = getColorMode();

		// Close dropdowns when clicking anywhere outside the root element
		const onPointerDown = (e: PointerEvent) => {
			if (!rootEl || rootEl.contains(e.target as Node)) return;
			clusterOpen = false;
			remindersOpen = false;
			showCamera = false;
		};
		document.addEventListener('pointerdown', onPointerDown);
		return () => document.removeEventListener('pointerdown', onPointerDown);
	});

	function toggleCluster() {
		clusterOpen = !clusterOpen;
		remindersOpen = false;
		if (!clusterOpen) showCamera = false;
	}

	function formatTimeLabel(date: Date): string {
		const now = new Date();
		const diffMs = date.getTime() - now.getTime();
		const diffMin = Math.max(0, Math.ceil(diffMs / 60000));
		if (diffMin < 60) return `in ${diffMin} min`;
		const diffH = Math.ceil(diffMin / 60);
		return `in ${diffH} h`;
	}

	function deleteReminder(id?: number) {
		if (id === undefined) return;
		remindersOpen = false;
		onDeleteReminder?.(id);
	}

	function dismissRecentFired(id?: number) {
		if (id === undefined) return;
		onDismissRecentFired?.(id);
	}

	async function launchOverlay() {
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			const { getCurrentWindow } = await import('@tauri-apps/api/window');

			// Show overlay and hide main window
			await invoke('show_overlay');
			const mainWindow = getCurrentWindow();
			await mainWindow.hide();
		} catch (e) {
			console.error('Failed to launch overlay:', e);
		}
	}
</script>

<div class="top-right-buttons" bind:this={rootEl}>
	<div class="button-row">
		<div class="reminder-wrapper">
			<button
				class="icon-btn"
				class:active={remindersOpen}
				onclick={() => (remindersOpen = !remindersOpen)}
				aria-label="Open reminders"
				title="Open reminders"
			>
				<Icon name="bell" size={20} />
				{#if upcomingReminders.length > 0}
					<span class="reminder-badge">{upcomingReminders.length}</span>
				{/if}
			</button>
			{#if remindersOpen}
				<div class="reminder-dropdown">
					<div class="reminder-header">Open tasks</div>
					{#if upcomingReminders.length === 0}
						<div class="reminder-empty">No open tasks or timers</div>
					{:else}
						<ul class="reminder-list">
							{#each upcomingReminders as reminder (reminder.id)}
								<li class="reminder-item">
									<div class="reminder-text">
										<span class="reminder-content">{reminder.content}</span>
										<span class="reminder-time">{formatTimeLabel(reminder.triggerAt)}</span>
									</div>
									<button
										class="reminder-delete"
										onclick={() => deleteReminder(reminder.id)}
										aria-label="Delete reminder"
										title="Delete reminder"
									>
										<Icon name="trash" size={14} />
									</button>
								</li>
							{/each}
						</ul>
					{/if}

					{#if recentFired.length > 0}
						<div class="reminder-header reminder-header--fired">Fired or missed</div>
						<ul class="reminder-list">
							{#each recentFired as reminder (reminder.id)}
								<li class="reminder-item reminder-item--fired">
									<div class="reminder-text">
										<span class="reminder-content">{reminder.content}</span>
										<span class="reminder-time">{formatTimeLabel(reminder.triggerAt)}</span>
									</div>
									<button
										class="reminder-delete"
										onclick={() => dismissRecentFired(reminder.id)}
										aria-label="Dismiss reminder"
										title="Dismiss reminder"
									>
										<Icon name="check" size={14} />
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
		{#if showOverlayBtn}
			<button class="icon-btn overlay-btn" onclick={launchOverlay} aria-label="Launch overlay" title="Launch Overlay Mode">
				<Icon name="monitor" size={20} />
			</button>
		{/if}
		<button class="icon-btn" onclick={onInfoClick} aria-label="App info">
			<Icon name="info" size={20} />
		</button>
		<button
			class="icon-btn cluster-trigger"
			class:open={clusterOpen}
			onclick={toggleCluster}
			aria-label="Controls"
			aria-expanded={clusterOpen}
			title="Controls"
		>
			<Icon name={clusterOpen ? 'x' : 'sliders'} size={20} />
		</button>
	</div>

	{#if clusterOpen}
		<div class="cluster">
			<button
				class="icon-btn cluster-item"
				style="--i: 0"
				onclick={() => goto(localPath('app', '/settings'))}
				aria-label="Settings"
				title="Settings"
			>
				<Icon name="settings" size={20} />
			</button>
			<button
				class="icon-btn cluster-item"
				class:active={showCamera}
				style="--i: 1"
				onclick={() => (showCamera = !showCamera)}
				aria-label="Camera settings"
				title="Camera"
			>
				<Icon name="video" size={20} />
			</button>
			<button
				class="icon-btn cluster-item"
				style="--i: 2"
				onclick={() => (colorMode = cycleColorMode())}
				aria-label={themeLabel}
				title={themeLabel}
			>
				<Icon name={themeIcon} size={20} />
			</button>
			<button
				class="icon-btn cluster-item"
				class:active={arStore.active}
				style="--i: 3"
				onclick={handleArClick}
				aria-label={arStore.active ? 'Exit AR' : 'Enter AR'}
				title={arStore.active ? 'Exit AR' : 'View in AR'}
			>
				<Icon name="cube" size={20} />
			</button>
		</div>

		{#if showCamera}
			<div class="camera-anchor">
				<CameraSettingsPanel onclose={() => (showCamera = false)} />
			</div>
		{/if}
	{/if}
</div>

{#if showArModal}
	<ArUnsupportedModal onclose={() => (showArModal = false)} />
{/if}

<style>
	.top-right-buttons {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 50;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.button-row {
		display: flex;
		gap: 0.5rem;
	}

	/* Expanded column hangs below the trigger */
	.cluster {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.cluster-item {
		animation: clusterIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
		animation-delay: calc(var(--i) * 45ms);
	}

	@keyframes clusterIn {
		from {
			opacity: 0;
			transform: translateY(-8px) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.camera-anchor {
		position: absolute;
		top: 3.25rem;
		right: 3.25rem;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: var(--bg-tertiary);
		border: none;
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		cursor: pointer;
		transition: color 0.15s ease, background 0.15s ease,
			box-shadow 0.15s ease, transform 0.15s ease;
		box-shadow: var(--shadow-sm);
	}

	.icon-btn:hover {
		color: var(--text-primary);
		background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 8%);
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}

	.icon-btn:focus-visible {
		outline: none;
		color: var(--text-primary);
		box-shadow: 0 0 0 3px var(--accent-muted);
	}

	.icon-btn:active {
		color: var(--accent);
		transform: translateY(0) scale(0.96);
		box-shadow: var(--shadow-sm);
	}

	.cluster-trigger.open,
	.cluster-item.active {
		color: var(--accent);
	}

	/* Overlay button - accent action */
	.overlay-btn {
		background: var(--accent);
		border-color: transparent;
		color: #fff;
	}

	.overlay-btn:hover {
		background: var(--accent-hover);
		color: #fff;
	}

	.overlay-btn:active {
		color: #fff;
	}

	.reminder-wrapper {
		position: relative;
	}

	.reminder-badge {
		position: absolute;
		top: -2px;
		right: -2px;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		background: var(--color-error);
		color: white;
		font-size: 10px;
		font-weight: 700;
		border-radius: 9px;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
	}

	.reminder-dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: 280px;
		max-height: 320px;
		overflow-y: auto;
		background: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-lg);
		padding: 0.75rem;
		box-shadow: var(--shadow-lg);
		z-index: 60;
	}

	.reminder-header {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-bottom: 0.5rem;
		padding: 0 0.25rem;
	}

	.reminder-header--fired {
		margin-top: 0.75rem;
		color: var(--color-error);
	}

	.reminder-empty {
		font-size: 0.85rem;
		color: var(--text-muted);
		padding: 0.75rem 0.25rem;
		text-align: center;
	}

	.reminder-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.reminder-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem;
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
		transition: background 0.15s ease;
	}

	.reminder-item:hover {
		background: var(--bg-tertiary);
	}

	.reminder-text {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
		flex: 1;
	}

	.reminder-content {
		font-size: 0.85rem;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.reminder-time {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.reminder-delete {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: var(--radius-full);
		color: var(--text-muted);
		cursor: pointer;
		transition: color 0.15s ease, background 0.15s ease;
		flex-shrink: 0;
	}

	.reminder-delete:hover {
		color: var(--color-error);
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
	}
</style>

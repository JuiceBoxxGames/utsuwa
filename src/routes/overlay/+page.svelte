<script lang="ts">
	import ScreenWakeLock from '$lib/components/display/ScreenWakeLock.svelte';
	import WakeLockIndicator from '$lib/components/display/WakeLockIndicator.svelte';
	import VrmScene from '$lib/components/vrm/VrmScene.svelte';
	import { pop } from '$lib/utils/motion';
	import BottomChatBar from '$lib/components/chat/BottomChatBar.svelte';
	import SpeechBubble from '$lib/components/chat/SpeechBubble.svelte';
	import FloatingChatIcon from '$lib/components/overlay/FloatingChatIcon.svelte';
	import FloatingMicButton from '$lib/components/overlay/FloatingMicButton.svelte';
	import HotkeyHandler from '$lib/components/overlay/HotkeyHandler.svelte';
	import CompanionStatus from '$lib/components/ui/CompanionStatus.svelte';
	import CameraSettingsPanel from '$lib/components/ui/CameraSettingsPanel.svelte';
	import FloatingStatIndicators from '$lib/components/ui/FloatingStatIndicators.svelte';
	import { EventScene } from '$lib/components/events';
	import { Icon } from '$lib/components/ui';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { sttStore } from '$lib/stores/stt.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { modulesStore } from '$lib/stores/modules.svelte';
	import { ttsStore } from '$lib/stores/tts.svelte';
	import { characterStore } from '$lib/stores/character.svelte';
	import { personaStore } from '$lib/stores/persona.svelte';
	import { overlayStore } from '$lib/stores/overlay.svelte';
	import { isTauri, startDragging } from '$lib/services/platform';
	import { sendCompanionMessage, type SendCompanionMessageOptions } from '$lib/services/chat/companion-chat';
	import { type ThinkingPhase } from '$lib/services/chat/chat-phase';
	import { createReminderFiredHandler } from '$lib/services/chat/reminder-chat';
	import { type PreparedImage } from '$lib/services/storage/keepsakes';
	import { eventsApi } from '$lib/engine/events';
	import { completionMarkers } from '$lib/engine/event-completion';
	import { reminderStore } from '$lib/stores/reminders.svelte';
	import type { EventDefinition } from '$lib/types/events';
	import type { StateUpdates } from '$lib/types/character';

	import {
		hydrateWorkingMemory,
		backfillEmbeddings,
		getEmbeddingBackfillStatus
	} from '$lib/engine/memory';
	import { initEmbeddingModel } from '$lib/services/embeddings';
	import { debugEventsStore } from '$lib/stores/debugEvents.svelte';

	let latestResponse = $state('');
	let isTyping = $state(false);
	let thinkingPhase = $state<ThinkingPhase>('thinking');
	let activeEvent = $state<EventDefinition | null>(null);
	let showCamera = $state(false);
	let positionLocked = $state(false);

	const chatExpanded = $derived(overlayStore.chatExpanded);

	// --- Overlay window sizing & lock ---
	const SIZE_KEY = 'utsuwa-overlay-size';
	const LOCK_KEY = 'utsuwa-overlay-locked';

	// Restore lock preference and last window size
	$effect(() => {
		positionLocked = localStorage.getItem(LOCK_KEY) === 'true';
		if (!isTauri()) return;
		const saved = localStorage.getItem(SIZE_KEY);
		if (saved) {
			(async () => {
				try {
					const { w, h } = JSON.parse(saved);
					const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
					await getCurrentWindow().setSize(new LogicalSize(w, h));
				} catch (e) {
					console.error('Failed to restore overlay size:', e);
				}
			})();
		}
	});

	function toggleLock() {
		positionLocked = !positionLocked;
		localStorage.setItem(LOCK_KEY, String(positionLocked));
	}

	// Top-left corner-tab drag resize: the window stays anchored at its
	// bottom-right, so growing means moving the origin up/left while the size
	// increases. Pointer deltas are in logical px, same unit as Tauri's
	// Logical* types, so the math is direct.
	let resizing = false;
	let resizeStart = { x: 0, y: 0, w: 0, h: 0, wx: 0, wy: 0 };
	let lastRequested = { w: 0, h: 0, x: 0, y: 0 };
	let resizeRaf = 0;

	async function onResizeStart(e: PointerEvent) {
		if (!isTauri()) return;
		e.preventDefault();
		e.stopPropagation();
		// Capture so pointermove keeps firing when the cursor leaves the window
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		resizeStart = { x: e.screenX, y: e.screenY, w: window.innerWidth, h: window.innerHeight, wx: 0, wy: 0 };
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const win = getCurrentWindow();
			const pos = await win.outerPosition();
			const scale = await win.scaleFactor();
			resizeStart.wx = pos.x / scale;
			resizeStart.wy = pos.y / scale;
			resizing = true;
		} catch (err) {
			console.error('Failed to start overlay resize:', err);
		}
	}

	function onResizeMove(e: PointerEvent) {
		if (!resizing) return;
		const w = Math.min(900, Math.max(280, resizeStart.w - (e.screenX - resizeStart.x)));
		const h = Math.min(1400, Math.max(380, resizeStart.h - (e.screenY - resizeStart.y)));
		// Re-derive the origin from the clamped size so the bottom-right corner
		// never drifts, even at the size limits
		lastRequested = {
			w,
			h,
			x: resizeStart.wx + (resizeStart.w - w),
			y: resizeStart.wy + (resizeStart.h - h)
		};
		// Coalesce to one window update per frame
		if (resizeRaf) return;
		resizeRaf = requestAnimationFrame(async () => {
			resizeRaf = 0;
			try {
				const { getCurrentWindow, LogicalSize, LogicalPosition } = await import(
					'@tauri-apps/api/window'
				);
				const win = getCurrentWindow();
				await win.setSize(new LogicalSize(lastRequested.w, lastRequested.h));
				await win.setPosition(new LogicalPosition(lastRequested.x, lastRequested.y));
			} catch (err) {
				console.error('Failed to resize overlay:', err);
			}
		});
	}

	function onResizeEnd() {
		if (!resizing) return;
		resizing = false;
		if (lastRequested.w > 0) {
			localStorage.setItem(SIZE_KEY, JSON.stringify({ w: lastRequested.w, h: lastRequested.h }));
		}
	}

	// Hydrate working memory on start
	$effect(() => {
		(async () => {
			try {
				await hydrateWorkingMemory();
			} catch (e) {
				console.error('Failed to hydrate working memory:', e);
			}
		})();
	});

	// Initialize embedding model and backfill facts without embeddings
	$effect(() => {
		initEmbeddingModel().then(async (ready) => {
			if (ready) {
				const status = await getEmbeddingBackfillStatus();
				if (status.withoutEmbeddings > 0) {
					await backfillEmbeddings();
				}
			}
		}).catch((e) => {
			console.error('Failed to initialize embedding model:', e);
		});
	});

	// Debug events (from developer tools)
	$effect(() => {
		const debugEvent = debugEventsStore.consume();
		if (debugEvent) {
			activeEvent = debugEvent;
		}
	});
	// Start reminder polling in the overlay too, so timers fire even when the
	// main app window is hidden. Fired reminders are sent back through the LLM
	// so the companion can react (speech, search, etc.).
	$effect(() => {
		const unsubscribeReminder = reminderStore.addReminderFiredListener(
			createReminderFiredHandler(handleReminderSend)
		);
		reminderStore.startPolling();
		return () => {
			reminderStore.stopPolling();
			unsubscribeReminder();
		};
	});


	// Handle drag for Tauri window
	function handleDragStart(e: MouseEvent) {
		if (isTauri() && !positionLocked && !resizing) {
			startDragging();
		}
	}

	// Exit overlay and return to main window
	async function exitToMain() {
		if (!isTauri()) return;
		try {
			const { getCurrentWindow, getAllWindows } = await import('@tauri-apps/api/window');

			const windows = await getAllWindows();
			const mainWindow = windows.find(w => w.label === 'main');

			if (!mainWindow) {
				// Main window was closed — don't hide overlay or user loses the app
				console.error('Main window not found, cannot exit overlay');
				return;
			}

			await mainWindow.show();
			await mainWindow.setFocus();

			const overlay = getCurrentWindow();
			await overlay.hide();
		} catch (e) {
			console.error('Failed to exit overlay:', e);
		}
	}


	// Send a message through the shared companion pipeline. The overlay collapses
	// its chat on send and has no image path.
	async function handleSend(content: string, images: PreparedImage[] = []) {
		await sendCompanionMessage(content, images, {
			setTyping: (v) => (isTyping = v),
			setLatestResponse: (v) => (latestResponse = v),
			setActiveEvent: (e) => (activeEvent = e),
			setPhase: (p) => (thinkingPhase = p),
			beforeStream: () => overlayStore.setChatExpanded(false)
		});
	}

	// Send a fired reminder through the overlay pipeline as a system event.
	async function handleReminderSend(content: string, options?: SendCompanionMessageOptions) {
		await sendCompanionMessage(content, [], {
			setTyping: (v) => (isTyping = v),
			setLatestResponse: (v) => (latestResponse = v),
			setActiveEvent: (e) => (activeEvent = e),
			setPhase: (p) => (thinkingPhase = p),
			beforeStream: () => overlayStore.setChatExpanded(false)
		}, options);
	}

	function handleBubbleHide() {
		latestResponse = '';
	}

	function handleCharacterClick() {
		overlayStore.activate();
	}

	function handleEventComplete(choiceIndex?: number, stateChanges?: Partial<StateUpdates>) {
		if (!activeEvent) return;
		const event = $state.snapshot(activeEvent);
		if (stateChanges) {
			characterStore.applyUpdates(stateChanges as StateUpdates);
		} else if (event.stateChanges) {
			characterStore.applyUpdates(event.stateChanges);
		}
		// Apply gating markers synchronously before the DB write so a failed write
		// can't strand a stage unlock (see app/+page.svelte for the full rationale).
		for (const marker of completionMarkers(event, choiceIndex)) {
			characterStore.markEventCompleted(marker);
		}
		eventsApi
			.recordCompletedEvent(
				event,
				choiceIndex,
				choiceIndex !== undefined ? `Choice ${choiceIndex + 1}` : undefined
			)
			.catch((e) => console.error('Failed to record event:', e));
		activeEvent = null;
	}

	function handleEventClose() {
		activeEvent = null;
	}
</script>

<ScreenWakeLock />
<div class="overlay-wake-status"><WakeLockIndicator /></div>
<div class="overlay-container">
	<!-- VRM Scene (fills the overlay) - locked to prevent rotation when dragging -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="scene-container" onmousedown={handleDragStart}>
		<VrmScene overlay={true} locked={true} />
	</div>

	<!-- Hover chrome: soft frame + corner resize tab -->
	<div class="overlay-frame"></div>
	{#if isTauri()}
		<div
			class="resize-tab"
			onpointerdown={onResizeStart}
			onpointermove={onResizeMove}
			onpointerup={onResizeEnd}
			onpointercancel={onResizeEnd}
			role="separator"
			aria-label="Resize overlay"
			title="Drag to resize"
		></div>
	{/if}

	<!-- Control rail (revealed on hover) -->
	<div class="overlay-rail">
		<button class="rail-btn" onclick={exitToMain} aria-label="Exit to main app" title="Back to app">
			<Icon name="x" size={15} />
		</button>
		<button
			class="rail-btn"
			class:rail-btn-active={showCamera}
			onclick={() => (showCamera = !showCamera)}
			aria-label="Camera settings"
			title="Camera"
		>
			<Icon name="video" size={15} />
		</button>
		<button
			class="rail-btn"
			class:rail-btn-active={positionLocked}
			onclick={toggleLock}
			aria-label={positionLocked ? 'Unlock position' : 'Lock position'}
			title={positionLocked ? 'Position locked' : 'Lock position'}
		>
			<Icon name={positionLocked ? 'lock' : 'lock-open'} size={15} />
		</button>
	</div>

	{#if showCamera}
		<div class="overlay-camera-anchor">
			<CameraSettingsPanel profile="overlay" onclose={() => (showCamera = false)} />
		</div>
	{/if}

	<!-- Speech Bubble: docked as a dialog box — the window moves around, so a
	     head-tracking bubble is unreadable in overlay mode -->
	<SpeechBubble
		message={latestResponse}
		isTyping={isTyping}
		phase={thinkingPhase}
		onHide={handleBubbleHide}
		docked
	/>

	<!-- Floating stat change indicators -->
	<FloatingStatIndicators />

	<!-- Bottom controls (status + mic + chat icon) -->
	<div class="chat-controls">
		<CompanionStatus overlay={true} />
		{#if !chatExpanded}
			<FloatingMicButton onTranscript={handleSend} />
		{/if}
		<FloatingChatIcon />
	</div>

	<!-- Expandable Chat Bar -->
	{#if chatExpanded}
		<div class="chat-bar-container" out:pop={{ base: 'translateX(-50%)', y: 10, duration: 180 }}>
			<BottomChatBar onSend={handleSend} disabled={chatStore.isLoading} overlay />
		</div>
	{/if}

	<!-- Error toasts -->
	{#if chatStore.error}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="error-toast" out:pop={{ base: 'translateX(-50%)', y: 8, duration: 180 }} onclick={() => chatStore.setError(null)}>
			<span>{chatStore.error}</span>
		</div>
	{/if}
	{#if sttStore.error}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="error-toast error-toast--stt" out:pop={{ base: 'translateX(-50%)', y: 8, duration: 180 }} onclick={() => sttStore.clearError()}>
			<span>{sttStore.error}</span>
		</div>
	{/if}

	<!-- Event Scene Overlay -->
	{#if activeEvent?.scene}
		<EventScene
			scene={activeEvent?.scene}
			eventName={activeEvent?.name}
			eventType={activeEvent?.type}
			companionName={personaStore.activeCard.name}
			overlay={true}
			onComplete={handleEventComplete}
			onClose={handleEventClose}
		/>
	{/if}

	<!-- Global hotkey handler (Tauri only) -->
	<HotkeyHandler onSendMessage={handleSend} />
</div>

<style>
	.overlay-container {
		position: relative;
		width: 100%;
		height: 100%;
		background: transparent;
	}

	.scene-container {
		position: absolute;
		inset: 0;
		cursor: grab;
	}

	.scene-container:active {
		cursor: grabbing;
	}

	/* Soft boundary stroke so the invisible window edges are discoverable.
	   Double stroke (light outer, dark inner) stays visible on any desktop. */
	.overlay-frame {
		position: fixed;
		inset: 5px;
		border-radius: 22px;
		pointer-events: none;
		z-index: 45;
		box-shadow:
			0 0 0 1.5px rgba(255, 255, 255, 0.3),
			inset 0 0 0 1.5px rgba(0, 0, 0, 0.18);
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.overlay-container:hover .overlay-frame {
		opacity: 1;
	}

	/* Corner grab tab for resizing (top-left; the rail owns the top-right) */
	.resize-tab {
		position: fixed;
		left: 8px;
		top: 8px;
		width: 26px;
		height: 26px;
		z-index: 55;
		cursor: nwse-resize;
		touch-action: none;
		border-radius: 16px 4px 8px 4px;
		background: color-mix(in srgb, var(--bg-tertiary) 65%, transparent);
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25);
		opacity: 0;
		transition: opacity 0.2s ease, background 0.15s ease;
	}

	.resize-tab::before {
		content: '';
		position: absolute;
		left: 6px;
		top: 6px;
		width: 10px;
		height: 10px;
		border-left: 2px solid var(--text-secondary);
		border-top: 2px solid var(--text-secondary);
		border-radius: 3px 0 0 0;
	}

	.overlay-container:hover .resize-tab {
		opacity: 0.75;
	}

	.resize-tab:hover {
		opacity: 1;
		background: var(--bg-tertiary);
	}

	/* Control rail: exit / camera / lock, revealed on hover */
	.overlay-rail {
		position: fixed;
		top: 0.875rem;
		right: 0.875rem;
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.rail-btn {
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-full);
		background: var(--bg-tertiary);
		color: var(--text-secondary);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-sm);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease,
			box-shadow 0.15s ease, transform 0.15s ease;
	}

	.overlay-container:hover .rail-btn {
		opacity: 0.6;
		pointer-events: auto;
	}

	.rail-btn:hover {
		opacity: 1;
		color: var(--text-primary);
		background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 8%);
		box-shadow: var(--shadow-md);
		transform: scale(1.1);
	}

	/* Active states (camera panel open, position locked) stay visible */
	.rail-btn-active,
	.overlay-container:hover .rail-btn-active {
		opacity: 1;
		pointer-events: auto;
		color: var(--accent);
	}

	.overlay-camera-anchor {
		position: fixed;
		top: 0.875rem;
		right: 3.5rem;
		z-index: 60;
	}

	.chat-controls {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 40;
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;
	}

	.chat-bar-container {
		position: fixed;
		bottom: 5rem;
		left: 50%;
		transform: translateX(-50%);
		width: 100%;
		max-width: 400px;
		padding: 0 1rem;
		z-index: 35;
		animation: slideUp 0.2s ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.error-toast {
		position: fixed;
		bottom: 5rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.5rem 0.875rem;
		background: var(--color-error);
		border: 1px solid transparent;
		border-radius: var(--radius-lg);
		color: #fff;
		font-size: 0.75rem;
		max-width: calc(100% - 2rem);
		text-align: center;
		cursor: pointer;
		z-index: 50;
		animation: slideUpShake 0.5s ease-out;
		box-shadow: var(--shadow-lg);
	}

	/* STT errors stack above chat errors instead of sharing the same slot */
	.error-toast--stt {
		bottom: 8.5rem;
	}

	@keyframes slideUpShake {
		0% {
			opacity: 0;
			transform: translateX(-50%) translateY(8px);
		}
		30% {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
		45% {
			transform: translateX(calc(-50% + 6px)) translateY(0);
		}
		60% {
			transform: translateX(calc(-50% - 5px)) translateY(0);
		}
		75% {
			transform: translateX(calc(-50% + 3px)) translateY(0);
		}
		90% {
			transform: translateX(calc(-50% - 2px)) translateY(0);
		}
		100% {
			transform: translateX(-50%) translateY(0);
		}
	}

	.overlay-wake-status { position: fixed; top: 48px; right: 12px; z-index: 70; }
</style>

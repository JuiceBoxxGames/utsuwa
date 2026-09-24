<script lang="ts">
	import WakeLockIndicator from '$lib/components/display/WakeLockIndicator.svelte';
	import VrmScene from '$lib/components/vrm/VrmScene.svelte';
	import FloatingStatIndicators from '$lib/components/ui/FloatingStatIndicators.svelte';
	import { TopRightButtons, TopLeftButtons, InfoModal, Icon } from '$lib/components/ui';
	import BottomChatBar from '$lib/components/chat/BottomChatBar.svelte';
	import PhotoModeDock from '$lib/components/photomode/PhotoModeDock.svelte';
	import PhotoStickerLayer from '$lib/components/photomode/PhotoStickerLayer.svelte';
	import PhotoFramePreview from '$lib/components/photomode/PhotoFramePreview.svelte';
	import { photomodeStore, PHOTO_FILTERS } from '$lib/stores/photomode.svelte';
	import { backgroundToCss, type SceneBackground } from '$lib/services/scene-backgrounds';

	// Live preview filter shared with the capture composite
	const photoFilterCss = $derived(
		photomodeStore.active && photomodeStore.filterId !== 'none'
			? PHOTO_FILTERS[photomodeStore.filterId].css
			: undefined
	);

	// The backdrop behind the (then transparent) GL canvas: a photo-mode
	// override wins while posing; otherwise the persistent scene background.
	const effectiveBackdrop = $derived.by((): SceneBackground | null => {
		if (photomodeStore.active && photomodeStore.background.type !== 'room') {
			return photomodeStore.background as SceneBackground;
		}
		if (displayStore.sceneBackground.type !== 'default') return displayStore.sceneBackground;
		return null;
	});
	import SpeechBubble from '$lib/components/chat/SpeechBubble.svelte';
	import ChatWindow from '$lib/components/chat/ChatWindow.svelte';
	import { type ThinkingPhase } from '$lib/services/chat/chat-phase';
	import ThinkingImages from '$lib/components/chat/ThinkingImages.svelte';
	import Photoboard from '$lib/components/chat/Photoboard.svelte';
	import { EventScene } from '$lib/components/events';
	import { OnboardingModal } from '$lib/components/onboarding';
	import { goto } from '$app/navigation';
	import { localPath } from '$lib/config/links';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { modulesStore } from '$lib/stores/modules.svelte';
	import { characterStore } from '$lib/stores/character.svelte';
	import { personaStore } from '$lib/stores/persona.svelte';
	import { displayStore } from '$lib/stores/display.svelte';
	import { startWaitTone, stopWaitTone, destroyWaitTone } from '$lib/utils/wait-tone';
	import { debugEventsStore } from '$lib/stores/debugEvents.svelte';
	import { getLLMProvider, providerSupportsVision } from '$lib/services/providers/registry';
	import { isLocalLLMProvider } from '$lib/services/providers/local-endpoints';
	import { canShowImages } from '$lib/services/providers/vision';
	import { onDestroy } from 'svelte';
	import { sendCompanionMessage, type SendCompanionMessageOptions } from '$lib/services/chat/companion-chat';
	import { createReminderFiredHandler } from '$lib/services/chat/reminder-chat';
	import { reminderStore } from '$lib/stores/reminders.svelte';
	import { type PreparedImage } from '$lib/services/storage/keepsakes';
	import { isTauri } from '$lib/services/platform';
	import { browser } from '$app/environment';
	import type { StateUpdates } from '$lib/types/character';
	import type { EventDefinition } from '$lib/types/events';
	import { pop, fadeFast } from '$lib/utils/motion';

	// V2 companion system imports
	import {
		hydrateWorkingMemory,
		backfillEmbeddings,
		getEmbeddingBackfillStatus
	} from '$lib/engine/memory';
	import { initEmbeddingModel } from '$lib/services/embeddings';
	import { eventsApi } from '$lib/engine/events';
	import { completionMarkers } from '$lib/engine/event-completion';

	let canvasRef: HTMLCanvasElement | null = null;

	// Event scene state
	let activeEvent = $state<EventDefinition | null>(null);

	// Info modal state
	let showInfoModal = $state(false);
	let showBoard = $state(false);
	// Her impression from the latest turn, attached to a kept photo as its note.
	let lastNewMemory: string | undefined;

	// Onboarding state
	let showOnboarding = $state(false);
	let onboardingDismissed = $state(false);

	// Speech bubble state
	let latestResponse = $state('');
	let isTyping = $state(false);
	// What she's doing this turn, for the shimmer label
	let thinkingPhase = $state<ThinkingPhase>('thinking');
	// Typing dots visibility — delayed by typingIndicatorDelayMs
	let typingDotsVisible = $state(false);
	$effect(() => {
		if (!isTyping) {
			typingDotsVisible = false;
			return;
		}
		typingDotsVisible = false;
		const delay = displayStore.typingIndicatorDelayMs;
		if (delay <= 0) {
			typingDotsVisible = true;
			return;
		}
		const timer = setTimeout(() => {
			typingDotsVisible = true;
		}, delay);
		return () => clearTimeout(timer);
	});

	// Wait tone — starts/stops with typing dots
	$effect(() => {
		if (typingDotsVisible && displayStore.waitToneEnabled) {
			startWaitTone();
		} else {
			stopWaitTone();
		}
	});

	const showBubble = $derived(displayStore.chatDisplayMode === 'bubble');
	const windowMode = $derived(displayStore.chatDisplayMode === 'sidebar');
	const dockedChat = $derived(windowMode && !photomodeStore.active);
	let availableHeight = $state(0);
	let frameWidth = $state(0);
	let frameHeight = $state(0);
	// Images she's currently being shown, floated above her head while she thinks
	let thinkingImages = $state<{ id: string; url: string }[]>([]);

	// Can the active LLM actually see images? Gates the "show" affordance.
	const visionCapable = $derived.by(() => {
		const cs = modulesStore.getModuleSettings('consciousness');
		const provider = cs.activeProvider as string;
		const model = cs.activeModel as string;
		if (!provider) return false;
		return canShowImages(providerSupportsVision(provider), isLocalLLMProvider(provider), model);
	});

	// Provider info for the one-time "where do photos go" disclosure.
	const imageProvider = $derived.by(() => {
		const provider = modulesStore.getModuleSettings('consciousness').activeProvider as string;
		return {
			label: getLLMProvider(provider)?.name ?? 'your AI provider',
			isLocal: provider ? isLocalLLMProvider(provider) : false
		};
	});

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

	// Initialize embedding model and backfill any facts without embeddings
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

	// Check for first-run (onboarding). ?onboarding=1 force-opens it for testing
	// without resetting the companion.
	$effect(() => {
		if (characterStore.isReady && !onboardingDismissed) {
			const forced = browser && new URLSearchParams(window.location.search).has('onboarding');
			const { lastInteraction, totalInteractions } = characterStore.state;
			// Completion updates state before its save resolves. Let onComplete
			// close setup only after that save has finished.
			if (forced || (lastInteraction === null && totalInteractions === 0)) showOnboarding = true;
		}
	});

	// Check for debug events (from developer tools)
	$effect(() => {
		const debugEvent = debugEventsStore.consume();
		if (debugEvent) {
			activeEvent = debugEvent;
		}
	});

	// Start reminder polling and react to fired reminders by sending them back
	// through the companion pipeline. This lets the LLM decide the action
	// (speech, web search, etc.) instead of showing a passive toast.
	$effect(() => {
		const unsubscribeReminder = reminderStore.addReminderFiredListener(
			createReminderFiredHandler((content, options) => handleSend(content, [], options))
		);
		reminderStore.startPolling();
		return () => {
			reminderStore.stopPolling();
			unsubscribeReminder();
		};
	});

	// Shown-image previews are blob: URLs (shared between the chat history and the
	// thinking overlay). Free them all when leaving the app so a long session's
	// images don't linger in memory.
	onDestroy(() => {
		for (const m of chatStore.messages) {
			for (const img of m.images ?? []) URL.revokeObjectURL(img.url);
		}
		for (const img of thinkingImages) URL.revokeObjectURL(img.url);
		stopWaitTone();
		destroyWaitTone();
	});


	// Send a message through the shared companion pipeline.
	async function handleSend(
		content: string,
		images: PreparedImage[] = [],
		options?: SendCompanionMessageOptions
	) {
		await sendCompanionMessage(content, images, {
			setTyping: (v) => (isTyping = v),
			setLatestResponse: (v) => (latestResponse = v),
			setActiveEvent: (e) => (activeEvent = e),
			setPhase: (p) => (thinkingPhase = p),
			onShownImages: (shown) => (thinkingImages = shown),
			onNewMemory: (m) => (lastNewMemory = m)
		}, options);
	}

	// Handle speech bubble hide
	function handleBubbleHide() {
		latestResponse = '';
	}

	// Handle event completion
	function handleEventComplete(choiceIndex?: number, stateChanges?: Partial<StateUpdates>) {
		if (!activeEvent) return;

		const event = $state.snapshot(activeEvent);

		if (stateChanges) {
			characterStore.applyUpdates(stateChanges as StateUpdates);
		} else if (event.stateChanges) {
			characterStore.applyUpdates(event.stateChanges);
		}

		// Apply the gating markers first and synchronously — the event id plus the
		// chosen outcome marker (e.g. confession_accepted) drive stage progression
		// and are persisted via the character store. Doing this before the DB write
		// means a failed write can't silently strand a hard-won stage unlock.
		for (const marker of completionMarkers(event, choiceIndex)) {
			characterStore.markEventCompleted(marker);
		}

		// Then record the durable history entry (also carries cooldown timestamps).
		eventsApi
			.recordCompletedEvent(
				event,
				choiceIndex,
				choiceIndex !== undefined ? `Choice ${choiceIndex + 1}` : undefined
			)
			.catch((e) => {
				console.error('Failed to record event completion:', e);
			});

		activeEvent = null;
	}

	function handleEventClose() {
		activeEvent = null;
	}
</script>

<div class="app-container">
	<div class="wake-status"><WakeLockIndicator /></div>
{#if !photomodeStore.active}
		<TopLeftButtons onOpenMemoryGraph={() => goto(localPath('app', '/settings/memory?view=graph'))} onBoardClick={() => showBoard = true} />
		<TopRightButtons
			onInfoClick={() => showInfoModal = true}
			upcomingReminders={reminderStore.upcoming}
			onDeleteReminder={reminderStore.deleteReminder}
			recentFired={reminderStore.recentFired}
			onDismissRecentFired={reminderStore.dismissRecentFired}
		/>
	{/if}
	{#if showInfoModal}
		<InfoModal onClose={() => showInfoModal = false} />
	{/if}
	{#if showBoard}
		<Photoboard onClose={() => showBoard = false} />
	{/if}

	<main class="main-content" class:docked-chat={dockedChat} class:dock-left={displayStore.sidebarPosition === 'left'}
		bind:clientHeight={availableHeight}
		style:--chat-dock-height={availableHeight > 0 && availableHeight < 500 ? '70%' : '50%'}>
		<div class="character-frame" aria-hidden="true" bind:clientWidth={frameWidth} bind:clientHeight={frameHeight}></div>
		<!-- VRM Stage (Full Background) -->
		<div class="stage-container">
			{#if vrmStore.isLoading || !vrmStore.modelUrl}
				<div class="loading-dots" out:fadeFast={{ duration: 300 }}>
					<span class="dot"></span>
					<span class="dot"></span>
					<span class="dot"></span>
				</div>
			{/if}

			{#if vrmStore.error}
				<div
					class="error-toast"
					out:pop={{ base: 'translateX(-50%)' }}
					role="button"
					tabindex="0"
					onclick={() => vrmStore.setError(null)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vrmStore.setError(null); } }}
				>
					<span>{vrmStore.error}</span>
					<button type="button" class="toast-dismiss" aria-label="Dismiss"><Icon name="x" size={14} /></button>
				</div>
			{/if}

			<!-- Backdrop behind the transparent GL canvas: the persistent scene
			     background in daily use, or the photo-mode override while posing.
			     Captures composite the identical background. -->
			{#if effectiveBackdrop}
				<div
					class="photo-bg-layer"
					style:filter={photoFilterCss}
					style:background={backgroundToCss(effectiveBackdrop, displayStore.activeBackgroundImage?.url)}
				></div>
			{/if}

			<!-- The avatar resolves into focus once the model is ready -->
			<div
				class="vrm-stage"
				class:is-loading={vrmStore.isLoading || !vrmStore.modelUrl}
				style:filter={photoFilterCss}
			>
				<VrmScene framing={{ width: frameWidth, height: frameHeight, left: displayStore.sidebarPosition === 'left' }} />
			</div>

			{#if photomodeStore.active && photomodeStore.vignette}
				<div class="photo-vignette" aria-hidden="true"></div>
			{/if}

			{#if photomodeStore.active && photomodeStore.frameId !== 'none'}
				<PhotoFramePreview />
			{/if}

			{#if photomodeStore.active}
				<PhotoStickerLayer />
			{/if}

			{#if photomodeStore.active && photomodeStore.showGrid}
				<div class="photo-grid" aria-hidden="true"></div>
			{/if}
		</div>

		<!-- Hidden (not unmounted) during photo mode so component-local state
		     like a typed chat draft survives the session -->
		<div style:display={photomodeStore.active ? 'none' : 'contents'}>
			<!-- Floating Stat Indicators -->
			<FloatingStatIndicators />

		<!-- Speech Bubble (shows latest response, click to dismiss) -->
			{#if showBubble && (latestResponse || (isTyping && typingDotsVisible))}
			<SpeechBubble
				message={latestResponse}
				isTyping={isTyping && typingDotsVisible}
				phase={thinkingPhase}
				onHide={handleBubbleHide}
			/>
		{/if}

			<!-- Chat window (hides with the rest of the chat UI in photo mode) -->
			<ChatWindow
				open={windowMode}
				isTyping={isTyping && typingDotsVisible}
				phase={thinkingPhase}
				onSend={handleSend}
				disabled={chatStore.isLoading}
				{visionCapable}
			/>

			<!-- The image she's being shown, floated above her head while she considers it -->
			<ThinkingImages images={thinkingImages} show={isTyping} />

			<!-- Bottom Chat Bar (its input docks into the chat window while open) -->
			<BottomChatBar
				onSend={handleSend}
				disabled={chatStore.isLoading}
				{visionCapable}
				providerLabel={imageProvider.label}
				providerIsLocal={imageProvider.isLocal}
				barHidden={windowMode}
			/>
		</div>
		{#if photomodeStore.active}
			<PhotoModeDock />
		{/if}

		<!-- Error toast for chat errors -->
		{#if chatStore.error}
			<div
				class="chat-error-toast"
				out:pop={{ base: 'translateX(-50%)' }}
				role="button"
				tabindex="0"
				onclick={() => chatStore.setError(null)}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chatStore.setError(null); } }}
			>
				<span>{chatStore.error}</span>
				<button type="button" class="toast-dismiss" aria-label="Dismiss"><Icon name="x" size={14} /></button>
			</div>
		{/if}

		<!-- Event Scene Overlay (deferred while posing; renders on exit) -->
		{#if activeEvent?.scene && !photomodeStore.active}
			<EventScene
				scene={activeEvent?.scene}
				eventName={activeEvent?.name}
				eventType={activeEvent?.type}
				companionName={personaStore.activeCard.name}
				onComplete={handleEventComplete}
				onClose={handleEventClose}
			/>
		{/if}
	</main>

	<!-- Onboarding Modal (first-run) -->
	{#if showOnboarding}
		<OnboardingModal onComplete={() => {
			onboardingDismissed = true;
			showOnboarding = false;
		}} />
	{/if}
</div>

<style>
	.app-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.main-content {
		--chat-dock-width: clamp(320px, 36vw, 440px);
		--chat-dock-height: 50%;
		min-height: 0;
		flex: 1;
		display: flex;
		position: relative;
		overflow: hidden;
	}

	.character-frame { position: absolute; inset: 0; pointer-events: none; }

	.stage-container {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	/* Photo-mode background preview sits behind the transparent GL canvas */
	.photo-bg-layer {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	/* Vignette preview matching the capture composite */
	.photo-vignette {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.38) 100%);
	}

	/* Rule-of-thirds composition guide (preview only, never captured) */
	.photo-grid {
		position: absolute;
		inset: 0;
		z-index: 4;
		pointer-events: none;
		background:
			linear-gradient(to right, transparent calc(33.33% - 0.5px), rgba(255, 255, 255, 0.35) 33.33%, transparent calc(33.33% + 0.5px)),
			linear-gradient(to right, transparent calc(66.66% - 0.5px), rgba(255, 255, 255, 0.35) 66.66%, transparent calc(66.66% + 0.5px)),
			linear-gradient(to bottom, transparent calc(33.33% - 0.5px), rgba(255, 255, 255, 0.35) 33.33%, transparent calc(33.33% + 0.5px)),
			linear-gradient(to bottom, transparent calc(66.66% - 0.5px), rgba(255, 255, 255, 0.35) 66.66%, transparent calc(66.66% + 0.5px));
		mix-blend-mode: difference;
	}

	/* The scene sits blurred and dimmed while the model loads, then resolves
	   into focus. Base state carries no filter so nothing lingers after. */
	.vrm-stage {
		position: relative;
		z-index: 1; /* above the photo background layer */
		height: 100%;
		transition:
			opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1),
			filter 0.9s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.vrm-stage.is-loading {
		opacity: 0;
		filter: blur(14px);
	}

	.loading-dots {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		z-index: 20;
	}

	.loading-dots .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-tertiary);
		animation: bounce 1.4s ease-in-out infinite;
	}

	.loading-dots .dot:nth-child(2) {
		animation-delay: 0.16s;
	}

	.loading-dots .dot:nth-child(3) {
		animation-delay: 0.32s;
	}

	@keyframes bounce {
		0%, 80%, 100% {
			opacity: 0.3;
			transform: scale(0.8);
		}
		40% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.error-toast,
	.chat-error-toast {
		position: fixed;
		top: 4.5rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		width: fit-content;
		max-width: 600px;
		padding: 0.75rem 1rem;
		background: var(--color-error);
		border: 1px solid transparent;
		border-radius: var(--radius-lg);
		color: #fff;
		font-size: 0.875rem;
		cursor: pointer;
		z-index: 50;
		animation: errorSlideDownShake 0.5s ease-out;
		box-shadow: var(--shadow-lg);
	}

	.error-toast span,
	.chat-error-toast span {
		flex: 1;
		word-wrap: break-word;
	}

	.toast-dismiss {
		background: rgba(255, 255, 255, 0.2);
		border: none;
		padding: 0.25rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
		color: white;
		opacity: 0.9;
		font-size: 0.875rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.toast-dismiss:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.3);
	}

	@keyframes errorSlideDownShake {
		0% {
			opacity: 0;
			transform: translateX(-50%) translateY(-8px);
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

	.chat-error-toast {
		top: 5.5rem;
	}

	@media (max-width: 640px) {
		.error-toast,
		.chat-error-toast {
			width: fit-content;
			max-width: calc(100vw - 1.5rem);
		}
	}

	.docked-chat .character-frame { right: var(--chat-dock-width); }
	.docked-chat.dock-left .character-frame { left: var(--chat-dock-width); right: 0; }
	@media (max-width: 720px) {
		.docked-chat .character-frame, .docked-chat.dock-left .character-frame {
			left: 0; right: 0; bottom: var(--chat-dock-height);
		}
	}

	.wake-status { position: fixed; top: 68px; left: 1rem; z-index: 46; }
</style>

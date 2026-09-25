<script lang="ts">
	import WakeLockIndicator from '$lib/components/display/WakeLockIndicator.svelte';
	import VrmScene from '$lib/components/vrm/VrmScene.svelte';
	import FloatingStatIndicators from '$lib/components/ui/FloatingStatIndicators.svelte';
	import { TopRightButtons, TopLeftButtons, InfoModal } from '$lib/components/ui';
	import Toasts from '$lib/components/ui/Toasts.svelte';
	import BottomChatBar from '$lib/components/chat/BottomChatBar.svelte';
	import McpConfirmDialog from '$lib/components/mcp/McpConfirmDialog.svelte';
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
	import { getLLMProvider, providerSupportsVision } from '$lib/services/providers/registry';
	import { isLocalLLMProvider } from '$lib/services/providers/local-endpoints';
	import { canShowImages } from '$lib/services/providers/vision';
	import { onDestroy, onMount } from 'svelte';
	import { sendCompanionMessage, type SendCompanionMessageOptions } from '$lib/services/chat/companion-chat';
	import { reminderStore } from '$lib/stores/reminders.svelte';
	import { type PreparedImage } from '$lib/services/storage/keepsakes';
	import { isTauri } from '$lib/services/platform';
	import { browser } from '$app/environment';
	import { fadeFast } from '$lib/utils/motion';
	import { startCompanionSession } from '$lib/services/session/companion-session';
	import { createEventSession } from '$lib/services/session/event-session.svelte';

	let canvasRef: HTMLCanvasElement | null = null;

	const events = createEventSession();

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

	onMount(() =>
		startCompanionSession({
			send: (content, options) => handleSend(content, [], options),
			onEvent: events.open
		})
	);

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
			setActiveEvent: events.open,
			setPhase: (p) => (thinkingPhase = p),
			onShownImages: (shown) => (thinkingImages = shown),
			onNewMemory: (m) => (lastNewMemory = m)
		}, options);
	}

	// Handle speech bubble hide
	function handleBubbleHide() {
		latestResponse = '';
	}
</script>

<svelte:head>
	<meta name="description" content="Chat with your AI companion: a 3D VRM avatar with voice, memory, and moods, running in your browser." />
</svelte:head>

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
	<McpConfirmDialog />
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

		<Toasts />

		<!-- Event Scene Overlay (deferred while posing; renders on exit) -->
		{#if events.activeEvent?.scene && !photomodeStore.active}
			<EventScene
				scene={events.generatedScene ?? events.activeEvent.scene}
				pending={events.pending}
				eventName={events.activeEvent.name}
				eventType={events.activeEvent.type}
				companionName={personaStore.activeCard.name}
				onComplete={events.complete}
				onClose={events.close}
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

	.docked-chat .character-frame { right: var(--chat-dock-width); }
	.docked-chat.dock-left .character-frame { left: var(--chat-dock-width); right: 0; }
	@media (max-width: 720px) {
		.docked-chat .character-frame, .docked-chat.dock-left .character-frame {
			left: 0; right: 0; bottom: var(--chat-dock-height);
		}
	}

	.wake-status { position: fixed; top: 68px; left: 1rem; z-index: 46; }
</style>

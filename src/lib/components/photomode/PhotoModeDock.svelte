<script lang="ts">
	import { rangeProgress } from '$lib/utils/range-progress';
	import { tick } from 'svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { Icon } from '$lib/components/ui';
	import {
		photomodeStore,
		PHOTO_FILTERS,
		type PhotoBackground,
		type PhotoFilterId,
		type PhotoFrameId
	} from '$lib/stores/photomode.svelte';
	import { displayStore, CAMERA_LIMITS } from '$lib/stores/display.svelte';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { loadPoseManifest, type PoseEntry } from '$lib/services/poses';
	import { keepImage } from '$lib/services/storage/keepsakes';
	import { saveToDownloads } from '$lib/utils/save-to-downloads';
	import { BACKGROUND_PRESETS, presetSwatch } from '$lib/services/scene-backgrounds';

	const TABS = [
		{ value: 'camera', label: 'Camera' },
		{ value: 'pose', label: 'Pose' },
		{ value: 'face', label: 'Face' },
		{ value: 'scene', label: 'Scene' },
		{ value: 'sticker', label: 'Sticker' }
	];

	let tab = $state('camera');
	let collapsed = $state(false);
	let poses = $state<PoseEntry[]>([]);
	let capturing = $state(false);
	let flash = $state(false);
	let captureStatus = $state('');
	let statusTimer: ReturnType<typeof setTimeout> | undefined;
	let timerOn = $state(false);
	let countdown = $state(0);

	const HIDDEN_EXPRESSIONS = new Set([
		'aa', 'ih', 'ou', 'ee', 'oh',
		'blink', 'blinkLeft', 'blinkRight',
		'lookUp', 'lookDown', 'lookLeft', 'lookRight',
		'neutral'
	]);
	const expressions = $derived(
		(vrmStore.availableExpressions ?? []).filter((name) => !HIDDEN_EXPRESSIONS.has(name))
	);

	// Shared preset library; 'default' means "the scene as it is", which in
	// photo terms is the room. Patterns and pastels included.
	const BACKGROUNDS = BACKGROUND_PRESETS.map((preset) => ({
		id: preset.id,
		label: preset.id === 'default' ? 'Room' : preset.label,
		bg: (preset.bg.type === 'default' ? { type: 'room' } : preset.bg) as PhotoBackground,
		swatch: presetSwatch(preset)
	}));

	const FRAMES: Array<{ value: PhotoFrameId; label: string }> = [
		{ value: 'none', label: 'None' },
		{ value: 'polaroid', label: 'Polaroid' },
		{ value: 'film', label: 'Film' }
	];

	const FILTERS = (Object.keys(PHOTO_FILTERS) as PhotoFilterId[]).map((id) => ({
		value: id,
		label: PHOTO_FILTERS[id].label
	}));

	const STICKERS: Array<{ id: string; label: string; src: string }> = [
		{ id: 'utsuwa-logo', label: 'Utsuwa logo', src: '/brand-assets/logo.svg' }
	];

	const activeBackgroundId = $derived(
		BACKGROUNDS.find(
			(b) =>
				b.bg.type === photomodeStore.background.type &&
				b.bg.value === photomodeStore.background.value
		)?.id ?? 'custom'
	);

	$effect(() => {
		let cancelled = false;
		loadPoseManifest().then((entries) => {
			if (!cancelled) poses = entries;
		});
		return () => {
			cancelled = true;
		};
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') photomodeStore.exit();
	}

	async function setCollapsed(value: boolean) {
		collapsed = value;
		await tick();
		document.querySelector<HTMLElement>(value ? '.panel-pill' : '.photo-panel .collapse-btn')?.focus();
	}

	function announce(message: string) {
		captureStatus = message;
		clearTimeout(statusTimer);
		statusTimer = setTimeout(() => (captureStatus = ''), 2400);
	}

	function resetFraming() {
		// Clear the session lens and re-fit; the user's saved camera profile is
		// never touched from photo mode
		photomodeStore.setPhotoFov(null);
		photomodeStore.requestReframe();
	}

	async function takePhoto(scale: number) {
		if (capturing) return;
		capturing = true;
		try {
			if (timerOn) {
				for (countdown = 3; countdown > 0; countdown--) {
					// Exiting photo mode during the countdown cancels the capture
					if (!photomodeStore.active) return;
					await new Promise((r) => setTimeout(r, 1000));
				}
			}
			if (!photomodeStore.active) return;
			const blob = await photomodeStore.capture(scale);
			if (!blob || !photomodeStore.active) return;

			flash = true;
			setTimeout(() => (flash = false), 220);

			await keepImage(crypto.randomUUID(), blob, {
				mimeType: 'image/png',
				note: 'Photo mode',
				kind: 'photo'
			});

			// Both platforms put the file where users expect downloads to land:
			// the browser via a download, the desktop app by writing directly to
			// the Downloads folder. The keepsake-store copy is kept either way.
			const filename = `utsuwa-photo-${Date.now()}.png`;
			try {
				await saveToDownloads(filename, blob);
			} catch (e) {
				console.error('[PhotoMode] Could not write to Downloads:', e);
			}

			announce('Photo saved');
		} catch (e) {
			console.error('[PhotoMode] Capture failed:', e);
			announce("Couldn't take the photo");
		} finally {
			countdown = 0;
			capturing = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if flash}
	<div class="shutter-flash" aria-hidden="true"></div>
{/if}

{#if countdown > 0}
	<div class="countdown" aria-hidden="true">{countdown}</div>
{/if}

{#if collapsed}
	<button class="panel-pill btn btn-secondary btn-icon" onclick={() => setCollapsed(false)} aria-label="Open photo controls">
		<Icon name="camera" size={16} />
	</button>
{:else}
	<section class="photo-panel" aria-label="Photo mode">
		<div class="panel-header">
			<h2 class="panel-title">Photo Mode</h2>
			<span class="capture-status" role="status">{captureStatus}</span>
			<button class="btn btn-ghost btn-icon collapse-btn" onclick={() => setCollapsed(true)} aria-label="Collapse panel">
				<Icon name="chevron-up" size={14} />
			</button>
			<button class="btn btn-ghost btn-icon" onclick={() => photomodeStore.exit()} aria-label="Exit photo mode">
				<Icon name="x" size={14} />
			</button>
		</div>

		<Tabs bind:value={tab} items={TABS} label="Photo controls">
			{#snippet children(current)}
				<div class="tab-content">
					{#if current === 'pose'}
						<div class="chip-wrap">
							<button
								class="btn btn-secondary btn-sm"
								aria-pressed={photomodeStore.selectedPoseId === null}
								onclick={() => photomodeStore.setPose(null)}
							>
								Natural
							</button>
							{#each poses as pose (pose.id)}
								<button
									class="btn btn-secondary btn-sm"
									aria-pressed={photomodeStore.selectedPoseId === pose.id}
									onclick={() => photomodeStore.setPose(pose.id)}
								>
									{pose.name}
								</button>
							{/each}
						</div>
					{:else if current === 'face'}
						<div class="chip-wrap">
							<button
								class="btn btn-secondary btn-sm"
								aria-pressed={photomodeStore.selectedExpression === null}
								onclick={() => photomodeStore.setExpression(null)}
							>
								Mood
							</button>
							{#each expressions as name (name)}
								<button
									class="btn btn-secondary btn-sm chip-cap"
									aria-pressed={photomodeStore.selectedExpression === name}
									onclick={() => photomodeStore.setExpression(name)}
								>
									{name}
								</button>
							{/each}
						</div>
					{:else if current === 'scene'}
						<div class="group">
							<span class="group-label" id="photo-bg-label">Background</span>
							<div class="swatches" role="group" aria-labelledby="photo-bg-label">
								{#each BACKGROUNDS as bg (bg.id)}
									<button
										class="swatch"
										aria-pressed={activeBackgroundId === bg.id}
										style:background={bg.swatch}
										title={bg.label}
										aria-label={bg.label}
										onclick={() => photomodeStore.setBackground(bg.bg)}
									></button>
								{/each}
							</div>
						</div>
						<div class="group filters">
							<span class="group-label">Filter</span>
							<SegmentedControl label="Filter" value={photomodeStore.filterId} options={FILTERS} onchange={(id) => photomodeStore.setFilter(id)} />
						</div>
						<div class="group">
							<span class="group-label">Frame</span>
							<SegmentedControl label="Frame" value={photomodeStore.frameId} options={FRAMES} onchange={(id) => photomodeStore.setFrame(id)} />
						</div>
						<div class="toggle-row"><span>Vignette</span><Switch label="Vignette" checked={photomodeStore.vignette} onchange={(value) => photomodeStore.setVignette(value)} /></div>
					{:else if current === 'camera'}
						<label class="slider-row">
							<span class="slider-label">
								Lens
								<span class="slider-value">{(photomodeStore.photoFov ?? displayStore.camera.fov).toFixed(0)} deg</span>
							</span>
							<input
								type="range" use:rangeProgress={photomodeStore.photoFov ?? displayStore.camera.fov}
								min={CAMERA_LIMITS.fov.min}
								max={CAMERA_LIMITS.fov.max}
								step="1"
								value={photomodeStore.photoFov ?? displayStore.camera.fov}
								oninput={(e) => photomodeStore.setPhotoFov(parseFloat(e.currentTarget.value))}
								aria-label="Field of view"
							/>
						</label>
						<div class="toggle-row"><span>Look at camera</span><Switch label="Look at camera" checked={photomodeStore.headTracking} onchange={(value) => photomodeStore.setHeadTracking(value)} /></div>
						<div class="toggle-row"><span>Thirds grid</span><Switch label="Thirds grid" checked={photomodeStore.showGrid} onchange={(value) => photomodeStore.setGrid(value)} /></div>
						<button class="btn btn-secondary" onclick={resetFraming}>Reset framing</button>
					{:else if current === 'sticker'}
						<div class="chip-wrap">
							{#each STICKERS as sticker (sticker.id)}
								<button class="btn btn-secondary btn-sm" onclick={() => photomodeStore.addSticker(sticker.src)}>
									{sticker.label}
								</button>
							{/each}
						</div>
						{#if photomodeStore.stickers.length > 0}
							<span class="group-label">On the shot</span>
							{#each photomodeStore.stickers as active, i (active.id)}
								<div class="sticker-row">
									<img class="sticker-thumb" src={active.src} alt="" />
									<span class="sticker-name">Sticker {i + 1}</span>
									<button
										class="btn btn-ghost btn-icon"
										aria-label={`Remove sticker ${i + 1}`}
										onclick={() => photomodeStore.removeSticker(active.id)}
									>
										<Icon name="x" size={13} />
									</button>
								</div>
							{/each}
							<span class="hint">Drag to move. Scroll to resize. Double-click also removes.</span>
						{:else}
							<span class="hint">Add a sticker, then drag it anywhere on the shot.</span>
						{/if}
					{/if}
				</div>
			{/snippet}
		</Tabs>

		<div class="capture-row">
			<button
				class="panel-btn timer btn btn-secondary"
				aria-pressed={timerOn}
				aria-label="3s self-timer"
				onclick={() => (timerOn = !timerOn)}
				title="3 second self-timer"
			>
				3s
			</button>
			<button class="panel-btn btn btn-secondary" onclick={() => takePhoto(1)} disabled={capturing}>Snap</button>
			<button class="panel-btn primary btn btn-primary" onclick={() => takePhoto(2)} disabled={capturing}>
				<Icon name="camera" size={14} />
				{capturing ? (countdown > 0 ? String(countdown) : '...') : 'Capture'}
			</button>
		</div>
	</section>
{/if}

<style>
	.shutter-flash {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: white;
		pointer-events: none;
		animation: flashOut 0.22s ease-out both;
	}

	@keyframes flashOut {
		from {
			opacity: 0.9;
		}
		to {
			opacity: 0;
		}
	}

	.countdown {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 55;
		font-size: 6rem;
		font-weight: 700;
		color: white;
		text-shadow: 0 2px 24px rgba(0, 0, 0, 0.45);
		pointer-events: none;
		animation: countPop 1s ease-out infinite;
	}

	@keyframes countPop {
		from {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
		to {
			opacity: 0.2;
			transform: translate(-50%, -50%) scale(1.25);
		}
	}

	.panel-pill { position: fixed; top: 1rem; left: 1rem; z-index: 45; }

	.photo-panel {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 45;
		width: min(288px, calc(100vw - 2rem));
		max-height: calc(100dvh - 2rem);
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		animation: panelIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@keyframes panelIn {
		from {
			opacity: 0;
			transform: translateY(-6px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.panel-title {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.capture-status {
		margin-right: auto;
		font-size: 13px;
		color: var(--text-secondary);
	}

	/* The shared tabs, tightened so all five fit the panel width */
	.photo-panel :global([data-tabs-root]) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.photo-panel :global(.ui-tabs-list) {
		flex-shrink: 0;
		gap: 2px;
		padding: 2px;
		border-radius: var(--radius-control);
	}

	.photo-panel :global(.ui-tab) {
		flex: 1 1 0;
		min-width: 0;
		padding: 0.375rem 0;
		border-radius: calc(var(--radius-control) - 2px);
		font-size: 13px;
	}

	.photo-panel :global(.ui-tab-panel[data-state='active']) {
		display: flex;
		flex-direction: column;
		min-height: 0;
		margin-top: 0.75rem;
	}

	.tab-content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		overflow-y: auto;
		min-height: 96px;
		/* Room for the selected swatch ring and the switch hit area, which the
		   scroll box would otherwise clip or scroll sideways for */
		margin-inline: -8px;
		padding: 4px 8px;
	}

	.group :global(.segmented-control) {
		width: 100%;
	}

	/* Six filters wrap as two even rows of three */
	.filters :global(.segmented-control button) {
		flex-basis: 30%;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.group-label {
		font-size: 14px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.chip-wrap {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.chip-cap {
		text-transform: capitalize;
	}

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	/* Swatches are artwork, so they keep a faint ring even though control
	   borders are transparent; otherwise the white preset vanishes. */
	.swatch {
		width: 32px;
		height: 32px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-control);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text-primary) 16%, transparent);
		cursor: pointer;
	}

	.swatch[aria-pressed='true'] {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	@media (pointer: coarse) {
		.swatch {
			width: 44px;
			height: 44px;
		}
	}

	.slider-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.slider-label {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-primary);
	}

	.slider-value {
		font-size: 13px;
		font-weight: 400;
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.slider-row input {
		width: 100%;
	}

	.toggle-row {
		min-height: 32px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-primary);
	}

	.hint {
		font-size: 13px;
		color: var(--text-secondary);
		line-height: 1.45;
	}

	.sticker-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.375rem;
		border-radius: var(--radius-control);
		background: var(--bg-secondary);
	}

	.sticker-thumb {
		width: 34px;
		height: 18px;
		object-fit: contain;
	}

	.sticker-name {
		flex: 1;
		font-size: 14px;
		color: var(--text-primary);
	}

	.capture-row {
		display: flex;
		gap: 0.375rem;
	}

	.panel-btn { flex: 1; }
	.panel-btn.timer { flex: 0 0 44px; }
	.panel-btn.primary { flex: 1.4; }
</style>

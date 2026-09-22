<script lang="ts">
	import { rangeProgress } from '$lib/utils/range-progress';
	import Switch from '$lib/components/ui/Switch.svelte';
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

	type Tab = 'pose' | 'face' | 'scene' | 'camera' | 'sticker';
	const TABS: Array<{ id: Tab; label: string }> = [
		{ id: 'camera', label: 'Camera' },
		{ id: 'pose', label: 'Pose' },
		{ id: 'face', label: 'Face' },
		{ id: 'scene', label: 'Scene' },
		{ id: 'sticker', label: 'Sticker' }
	];

	let tab = $state<Tab>('camera');
	let collapsed = $state(false);
	let poses = $state<PoseEntry[]>([]);
	let capturing = $state(false);
	let flash = $state(false);
	let savedTick = $state(false);
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

	const FRAMES: Array<{ id: PhotoFrameId; label: string }> = [
		{ id: 'none', label: 'None' },
		{ id: 'polaroid', label: 'Polaroid' },
		{ id: 'film', label: 'Film' }
	];

	const FILTER_IDS = Object.keys(PHOTO_FILTERS) as PhotoFilterId[];

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

			savedTick = true;
			setTimeout(() => (savedTick = false), 1600);
		} catch (e) {
			console.error('[PhotoMode] Capture failed:', e);
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
	<button class="panel-pill btn btn-secondary btn-icon" onclick={() => (collapsed = false)} aria-label="Open photo controls">
		<Icon name="camera" size={16} />
	</button>
{:else}
	<div class="photo-panel" role="toolbar" aria-label="Photo mode">
		<div class="panel-header">
			<span class="panel-title">Photo Mode</span>
			{#if savedTick}
				<span class="saved-tick">Saved</span>
			{/if}
			<button class="btn btn-ghost btn-icon" onclick={() => (collapsed = true)} aria-label="Collapse panel">
				<Icon name="chevron-up" size={14} />
			</button>
			<button class="btn btn-ghost btn-icon" onclick={() => photomodeStore.exit()} aria-label="Exit photo mode">
				<Icon name="x" size={14} />
			</button>
		</div>

		<div class="tab-strip" role="tablist">
			{#each TABS as t (t.id)}
				<button
					class="tab"
					class:active={tab === t.id}
					role="tab"
					aria-selected={tab === t.id}
					onclick={() => (tab = t.id)}
				>
					{t.label}
				</button>
			{/each}
		</div>

		<div class="tab-content">
			{#if tab === 'pose'}
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
			{:else if tab === 'face'}
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
			{:else if tab === 'scene'}
				<span class="mini-label">Background</span>
				<div class="chip-wrap">
					{#each BACKGROUNDS as bg (bg.id)}
						<button
							class="swatch"
							aria-pressed={activeBackgroundId === bg.id}
							style:background={bg.swatch}
							title={bg.label}
							aria-label={`Background: ${bg.label}`}
							onclick={() => photomodeStore.setBackground(bg.bg)}
						></button>
					{/each}
				</div>
				<span class="mini-label">Filter</span>
				<div class="chip-wrap">
					{#each FILTER_IDS as id (id)}
						<button
							class="btn btn-secondary btn-sm"
							aria-pressed={photomodeStore.filterId === id}
							onclick={() => photomodeStore.setFilter(id)}
						>
							{PHOTO_FILTERS[id].label}
						</button>
					{/each}
				</div>
				<span class="mini-label">Frame</span>
				<div class="chip-wrap">
					{#each FRAMES as frame (frame.id)}
						<button
							class="btn btn-secondary btn-sm"
							aria-pressed={photomodeStore.frameId === frame.id}
							onclick={() => photomodeStore.setFrame(frame.id)}
						>
							{frame.label}
						</button>
					{/each}
				</div>
				<div class="toggle-row"><span>Vignette</span><Switch label="Vignette" checked={photomodeStore.vignette} onchange={(value) => photomodeStore.setVignette(value)} /></div>
			{:else if tab === 'camera'}
				<span class="mini-label">
					Lens
					<span class="mini-value">{(photomodeStore.photoFov ?? displayStore.camera.fov).toFixed(0)} deg</span>
				</span>
				<input
					class="slider"
					type="range" use:rangeProgress={photomodeStore.photoFov ?? displayStore.camera.fov}
					min={CAMERA_LIMITS.fov.min}
					max={CAMERA_LIMITS.fov.max}
					step="1"
					value={photomodeStore.photoFov ?? displayStore.camera.fov}
					oninput={(e) => photomodeStore.setPhotoFov(parseFloat(e.currentTarget.value))}
					aria-label="Field of view"
				/>
				<div class="toggle-row"><span>Look at camera</span><Switch label="Look at camera" checked={photomodeStore.headTracking} onchange={(value) => photomodeStore.setHeadTracking(value)} /></div>
				<div class="toggle-row"><span>Thirds grid</span><Switch label="Thirds grid" checked={photomodeStore.showGrid} onchange={(value) => photomodeStore.setGrid(value)} /></div>
				<button class="panel-btn btn btn-secondary" onclick={resetFraming}>Reset framing</button>
			{:else if tab === 'sticker'}
				<div class="chip-wrap">
					{#each STICKERS as sticker (sticker.id)}
						<button class="btn btn-secondary btn-sm" onclick={() => photomodeStore.addSticker(sticker.src)}>
							{sticker.label}
						</button>
					{/each}
				</div>
				{#if photomodeStore.stickers.length > 0}
					<span class="mini-label">On the shot</span>
					{#each photomodeStore.stickers as active, i (active.id)}
						<div class="sticker-row">
							<img class="sticker-thumb" src={active.src} alt="" />
							<span class="sticker-name">Sticker {i + 1}</span>
							<button
								class="btn btn-ghost btn-icon"
								aria-label="Remove sticker"
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

		<div class="capture-row">
			<button
				class="panel-btn timer btn btn-secondary"
				aria-pressed={timerOn}
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
	</div>
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
		width: 272px;
		max-height: calc(100vh - 2rem);
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
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
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
		margin-right: auto;
	}

	.saved-tick {
		font-size: 0.6875rem;
		color: var(--color-success);
	}



	.tab-strip {
		display: flex;
		gap: 0.125rem;
		padding: 0.125rem;
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
	}

	.tab {
		flex: 1;
		padding: 0.3rem 0;
		border: none;
		border-radius: calc(var(--radius-md) - 2px);
		background: transparent;
		color: var(--text-tertiary);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.15s ease, background 0.15s ease;
	}

	.tab:hover {
		color: var(--text-primary);
	}

	.tab.active {
		background: var(--selection-bg);
		color: var(--text-primary);
		box-shadow: var(--shadow-xs);
	}

	.tab-content {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		overflow-y: auto;
		min-height: 96px;
	}

	.mini-label {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 600;
		text-transform: none;
		letter-spacing: normal;
		color: var(--text-tertiary);
	}

	.mini-value {
		font-variant-numeric: tabular-nums;
		text-transform: none;
	}

	.chip-wrap {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}


	.chip-cap {
		text-transform: capitalize;
	}



	.swatch {
		width: 26px;
		height: 26px;
		border-radius: var(--control-radius);
		border: 2px solid var(--border-subtle);
		cursor: pointer;
		transition: transform 0.15s ease, border-color 0.15s ease;
	}

	.swatch:hover {
		transform: scale(1.08);
	}

	.swatch[aria-pressed="true"] {
		border-color: var(--accent);
	}

	.slider { width: 100%; }



	.toggle-row {
		padding: 13px 7px 13px 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--text-secondary);
		cursor: pointer;
	}



	.hint {
		font-size: 12px;
		color: var(--text-tertiary);
		line-height: 1.4;
	}

	.sticker-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.375rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-secondary);
	}

	.sticker-thumb {
		width: 34px;
		height: 18px;
		object-fit: contain;
	}

	.sticker-name {
		flex: 1;
		font-size: 13px;
		color: var(--text-secondary);
	}

	.capture-row {
		display: flex;
		gap: 0.375rem;
	}

	.panel-btn { flex: 1; }
	.panel-btn.timer { flex: 0 0 44px; }
	.panel-btn.primary { flex: 1.4; }
</style>

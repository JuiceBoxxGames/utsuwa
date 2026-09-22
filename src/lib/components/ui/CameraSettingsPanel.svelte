<script lang="ts">
	import { rangeProgress } from '$lib/utils/range-progress';
	import { Icon } from '$lib/components/ui';
	import {
		displayStore,
		CAMERA_DEFAULTS,
		CAMERA_LIMITS,
		type CameraProfile
	} from '$lib/stores/display.svelte';
	import {
		PHYSICS_INTENSITY_MIN,
		PHYSICS_INTENSITY_MAX,
		PHYSICS_INTENSITY_DEFAULT
	} from '$lib/engine/spring-physics';
	import { BACKGROUND_PRESETS, presetSwatch } from '$lib/services/scene-backgrounds';

	// Transparent is a photo-capture concept; the scene picker skips it
	const SCENE_PRESETS = BACKGROUND_PRESETS.filter((p) => !p.photoOnly);

	interface Props {
		onclose: () => void;
		profile?: CameraProfile;
	}

	let { onclose, profile = 'main' }: Props = $props();

	const cam = $derived(profile === 'overlay' ? displayStore.overlayCamera : displayStore.camera);
	const isDefault = $derived(
		cam.fov === CAMERA_DEFAULTS.fov &&
			cam.zoom === CAMERA_DEFAULTS.zoom &&
			cam.height === CAMERA_DEFAULTS.height &&
			cam.panX === CAMERA_DEFAULTS.panX
	);
</script>

<div class="camera-panel" role="dialog" aria-label="Camera settings">
	<div class="panel-header">
		<span class="panel-title">Camera</span>
		<button class="btn btn-ghost btn-icon" onclick={onclose} aria-label="Close camera settings">
			<Icon name="x" size={14} />
		</button>
	</div>

	<label class="control">
		<span class="control-label">
			Zoom
			<span class="control-value">{cam.zoom.toFixed(2)}×</span>
		</span>
		<input
			type="range" use:rangeProgress={cam.zoom}
			min={CAMERA_LIMITS.zoom.min}
			max={CAMERA_LIMITS.zoom.max}
			step="0.05"
			value={cam.zoom}
			oninput={(e) => displayStore.setCamera({ zoom: parseFloat(e.currentTarget.value) }, profile)}
		/>
	</label>

	<label class="control">
		<span class="control-label">
			Height
			<span class="control-value">{cam.height > 0 ? '+' : ''}{(cam.height * 100).toFixed(0)} cm</span>
		</span>
		<input
			type="range" use:rangeProgress={cam.height}
			min={CAMERA_LIMITS.height.min}
			max={CAMERA_LIMITS.height.max}
			step="0.01"
			value={cam.height}
			oninput={(e) => displayStore.setCamera({ height: parseFloat(e.currentTarget.value) }, profile)}
		/>
	</label>

	<label class="control">
		<span class="control-label">
			Horizontal pan
			<span class="control-value">{cam.panX > 0 ? '+' : ''}{(cam.panX * 100).toFixed(0)} cm</span>
		</span>
		<input
			type="range" use:rangeProgress={cam.panX}
			min={CAMERA_LIMITS.panX.min}
			max={CAMERA_LIMITS.panX.max}
			step="0.05"
			value={cam.panX}
			oninput={(e) => displayStore.setCamera({ panX: Number(e.currentTarget.value) }, profile)}
		/>
	</label>

	<label class="control">
		<span class="control-label">
			Field of view
			<span class="control-value">{cam.fov.toFixed(0)}°</span>
		</span>
		<input
			type="range" use:rangeProgress={cam.fov}
			min={CAMERA_LIMITS.fov.min}
			max={CAMERA_LIMITS.fov.max}
			step="1"
			value={cam.fov}
			oninput={(e) => displayStore.setCamera({ fov: parseFloat(e.currentTarget.value) }, profile)}
		/>
	</label>

	<button class="btn btn-secondary" onclick={() => displayStore.resetCamera(profile)} disabled={isDefault}>
		Reset camera
	</button>

	{#if profile === 'main'}
		<div class="section-divider">
			<span class="section-label">Background</span>
		</div>

		<div class="swatch-row">
			{#each SCENE_PRESETS as preset (preset.id)}
				<button
					class="swatch"
					aria-pressed={displayStore.sceneBackground.type === preset.bg.type &&
						displayStore.sceneBackground.value === preset.bg.value}
					style:background={presetSwatch(preset)}
					title={preset.label}
					aria-label={`Background: ${preset.label}`}
					onclick={() => displayStore.setSceneBackground(preset.bg)}
				></button>
			{/each}
		</div>
	{/if}

	<div class="section-divider">
		<span class="section-label">Physics</span>
	</div>

	<label class="control">
		<span class="control-label">
			Movement intensity
			<span class="control-value">
				{displayStore.physicsIntensity === PHYSICS_INTENSITY_DEFAULT
					? 'Default'
					: `${displayStore.physicsIntensity.toFixed(2)}x`}
			</span>
		</span>
		<input
			type="range" use:rangeProgress={displayStore.physicsIntensity}
			min={PHYSICS_INTENSITY_MIN}
			max={PHYSICS_INTENSITY_MAX}
			step="0.05"
			value={displayStore.physicsIntensity}
			oninput={(e) => displayStore.setPhysicsIntensity(parseFloat(e.currentTarget.value))}
		/>
		<span class="range-ends" aria-hidden="true">
			<span>Subtle</span>
			<span>Lively</span>
		</span>
	</label>
</div>

<style>
	.camera-panel {
		width: min(280px, calc(100vw - 32px));
		max-height: calc(100dvh - 96px);
		overflow-y: auto;
		padding: 1rem;
		background: var(--bg-primary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		animation: panelIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@keyframes panelIn {
		from {
			opacity: 0;
			transform: translateY(-6px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.panel-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.control {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.control-label { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary); }

	.control-value {
		color: var(--text-tertiary);
		font-variant-numeric: tabular-nums;
	}

	.control input[type='range'] { width: 100%; }

	.section-divider {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.125rem;
	}

	.section-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border-subtle);
	}

	.section-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); }

	.range-ends {
		display: flex;
		justify-content: space-between;
		font-size: 0.6875rem;
		color: var(--text-tertiary);
	}

	.swatch-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.swatch {
		width: 24px;
		height: 24px;
		border-radius: var(--control-radius);
		border: 2px solid var(--border-subtle);
		cursor: pointer;
		transition: transform 0.15s ease, border-color 0.15s ease;
	}

	.swatch:hover {
		transform: scale(1.1);
	}

	.swatch[aria-pressed="true"] {
		border-color: var(--accent);
	}
</style>

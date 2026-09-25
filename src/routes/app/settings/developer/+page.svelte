<script lang="ts">
	import { rangeProgress } from '$lib/utils/range-progress';
	import Select from '$lib/components/ui/Select.svelte';
	import { onDestroy } from 'svelte';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { vrmGalleryStore } from '$lib/stores/vrm-gallery.svelte';
	import VrmScene from '$lib/components/vrm/VrmScene.svelte';
	import { Icon } from '$lib/components/ui';
	import * as THREE from 'three';
	import localforage from 'localforage';
	import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
	import { debugEventsStore, testEvents } from '$lib/stores/debug-events.svelte';
	import { goto } from '$app/navigation';
	import { localPath } from '$lib/config/links';

	// Material debug modes from @pixiv/three-vrm-materials-mtoon
	const materialDebugModes = [
		{ id: 'none', name: 'None (Normal Rendering)' },
		{ id: 'normal', name: 'Normals' },
		{ id: 'litShadeRate', name: 'Lit/Shade Rate' },
		{ id: 'uv', name: 'UV Coordinates' }
	];

	let currentDebugMode = $state('none');

	// Apply debug mode to all MToon materials in the VRM
	function setMaterialDebugMode(mode: string) {
		currentDebugMode = mode;
		const vrm = vrmStore.vrm;
		if (!vrm) return;

		vrm.scene.traverse((obj) => {
			if (obj instanceof THREE.Mesh && obj.material) {
				const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
				for (const mat of materials) {
					// Check if it's an MToon material (has debugMode property)
					if ('debugMode' in mat) {
						(mat as any).debugMode = mode;
						mat.needsUpdate = true;
					}
				}
			}
		});
	}

	// Expression categories for organization
	const expressionCategories = {
		eyes: [
			'eyeBlinkLeft',
			'eyeBlinkRight',
			'eyeLookDownLeft',
			'eyeLookDownRight',
			'eyeLookInLeft',
			'eyeLookInRight',
			'eyeLookOutLeft',
			'eyeLookOutRight',
			'eyeLookUpLeft',
			'eyeLookUpRight',
			'eyeSquintLeft',
			'eyeSquintRight',
			'eyeWideLeft',
			'eyeWideRight'
		],
		brows: [
			'browDownLeft',
			'browDownRight',
			'browInnerUp',
			'browOuterUpLeft',
			'browOuterUpRight'
		],
		mouth: [
			'jawForward',
			'jawLeft',
			'jawRight',
			'jawOpen',
			'mouthClose',
			'mouthFunnel',
			'mouthPucker',
			'mouthLeft',
			'mouthRight',
			'mouthSmileLeft',
			'mouthSmileRight',
			'mouthFrownLeft',
			'mouthFrownRight',
			'mouthDimpleLeft',
			'mouthDimpleRight',
			'mouthStretchLeft',
			'mouthStretchRight',
			'mouthRollLower',
			'mouthRollUpper',
			'mouthShrugLower',
			'mouthShrugUpper',
			'mouthPressLeft',
			'mouthPressRight',
			'mouthLowerDownLeft',
			'mouthLowerDownRight',
			'mouthUpperUpLeft',
			'mouthUpperUpRight'
		],
		other: [
			'cheekPuff',
			'cheekSquintLeft',
			'cheekSquintRight',
			'noseSneerLeft',
			'noseSneerRight',
			'tongueOut',
			'neutral',
			'happy',
			'angry',
			'sad',
			'relaxed',
			'surprised'
		]
	};

	// Track expression values
	let expressionValues = $state<Record<string, number>>({});

	// Use stored expressions (persists across navigation)
	let availableExpressions = $derived(vrmStore.availableExpressions);

	// Filter categories to only show available expressions
	function getAvailableInCategory(category: string[]): string[] {
		return category.filter((name) => availableExpressions.includes(name));
	}

	// Set expression value
	function setExpression(name: string, value: number) {
		expressionValues[name] = value;
		const vrm = vrmStore.vrm;
		if (vrm?.expressionManager) {
			try {
				vrm.expressionManager.setValue(name, value);
				vrm.expressionManager.update();
			} catch {
				// Expression doesn't exist
			}
		}
	}

	// Reset all expressions
	function resetAll() {
		const vrm = vrmStore.vrm;
		if (vrm?.expressionManager) {
			for (const name of availableExpressions) {
				vrm.expressionManager.setValue(name, 0);
				expressionValues[name] = 0;
			}
			vrm.expressionManager.update();
		}
	}

	// Test blink
	function testBlink() {
		setExpression('eyeBlinkLeft', 1);
		setExpression('eyeBlinkRight', 1);
		setTimeout(() => {
			setExpression('eyeBlinkLeft', 0);
			setExpression('eyeBlinkRight', 0);
		}, 150);
	}

	// Test smile
	function testSmile() {
		setExpression('mouthSmileLeft', 0.8);
		setExpression('mouthSmileRight', 0.8);
		setExpression('cheekSquintLeft', 0.3);
		setExpression('cheekSquintRight', 0.3);
		setTimeout(() => {
			setExpression('mouthSmileLeft', 0);
			setExpression('mouthSmileRight', 0);
			setExpression('cheekSquintLeft', 0);
			setExpression('cheekSquintRight', 0);
		}, 1000);
	}

	// Test surprised
	function testSurprised() {
		setExpression('eyeWideLeft', 0.8);
		setExpression('eyeWideRight', 0.8);
		setExpression('browInnerUp', 0.7);
		setExpression('browOuterUpLeft', 0.5);
		setExpression('browOuterUpRight', 0.5);
		setExpression('jawOpen', 0.4);
		setTimeout(() => {
			setExpression('eyeWideLeft', 0);
			setExpression('eyeWideRight', 0);
			setExpression('browInnerUp', 0);
			setExpression('browOuterUpLeft', 0);
			setExpression('browOuterUpRight', 0);
			setExpression('jawOpen', 0);
		}, 1000);
	}

	// Test sad
	function testSad() {
		setExpression('browInnerUp', 0.6);
		setExpression('browDownLeft', 0.3);
		setExpression('browDownRight', 0.3);
		setExpression('mouthFrownLeft', 0.5);
		setExpression('mouthFrownRight', 0.5);
		setTimeout(() => {
			setExpression('browInnerUp', 0);
			setExpression('browDownLeft', 0);
			setExpression('browDownRight', 0);
			setExpression('mouthFrownLeft', 0);
			setExpression('mouthFrownRight', 0);
		}, 1000);
	}

	// Open mouth for testing
	function testMouthOpen() {
		setExpression('jawOpen', 0.7);
		setTimeout(() => {
			setExpression('jawOpen', 0);
		}, 500);
	}

	// ── Temporary VRM Upload ──
	let tempModelName = $state('');

	// If parsing the temporary model fails, restore the original avatar so the
	// expression list and viewport do not stay empty/corrupted.
	$effect(() => {
		if (vrmGalleryStore.tempModelLoadError) {
			vrmStore.restoreOriginalModel();
			tempModelName = '';
		}
	});

	function handleTempModelSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !/\.vrm$/i.test(file.name)) return;

		tempModelName = file.name;
		try {
			vrmStore.loadTempModel(file);
		} catch (err) {
			console.error('Failed to load temp model:', err);
			tempModelName = '';
		}
		input.value = ''; // reset so same file can be selected again
	}

	function restoreOriginalModel() {
		vrmStore.restoreOriginalModel();
		tempModelName = '';
	}

	// Restore original avatar when leaving the developer page
	onDestroy(() => {
		vrmStore.restoreOriginalModel();
	});

	// Clear all VRM storage (IndexedDB)
	let clearingStorage = $state(false);
	async function clearVrmStorage() {
		clearingStorage = true;
		try {
			const vrmStorage = localforage.createInstance({ ...STORAGE_INVENTORY.localforage.vrm });
			await vrmStorage.clear();
			// Reload to reset state
			window.location.reload();
		} catch (e) {
			console.error('Failed to clear VRM storage:', e);
		}
		clearingStorage = false;
	}

	// Trigger a test event
	async function triggerEvent(event: typeof testEvents[0]) {
		debugEventsStore.trigger(event);
		// Navigate to home to show the event
		await goto(localPath('app'));
	}

	// Clear all character data
	async function clearCharacterData() {
		try {
			indexedDB.deleteDatabase(STORAGE_INVENTORY.indexedDb);
			window.location.reload();
		} catch (e) {
			console.error('Failed to clear character data:', e);
		}
	}
</script>

<div class="developer-settings">
	<div class="page-header">
		<div>
			<h2>Developer Tools</h2>
			<p >Test and debug VRM facial expressions and animations.</p>
		</div>
	</div>

	<div class="dev-layout">
		<!-- Viewport -->
		<div class="viewport-container">
			<div class="viewport">
				<VrmScene centered />
			</div>
			<div class="viewport-controls">
				<button class="btn btn-sm btn-secondary" onclick={resetAll} title="Reset expressions">
					<Icon name="refresh-cw" size={16} />
					Reset
				</button>
			</div>
		</div>

		<!-- Controls Panel -->
		<div class="controls-panel">
			<!-- Temporary VRM Model Upload -->
			<section class="section">
				<h3>Temporary VRM Model</h3>
				<p class="hint">
					Upload a .vrm file to preview it in the viewport. The model is loaded in memory only
					and is <strong>not saved</strong>. When you leave this page or click "Restore Original",
					the previously active avatar returns automatically.
				</p>
				{#if vrmGalleryStore.tempModelActive}
					<div class="temp-model-info">
						<span class="temp-model-name">{tempModelName || 'Temporary model'}</span>
						<button
							class="btn btn-sm btn-secondary"
							onclick={restoreOriginalModel}
							disabled={vrmGalleryStore.tempModelLoading}
						>
							<Icon name="rotate-ccw" size={14} />
							Restore Original
						</button>
					</div>
				{:else}
					<label class="btn btn-sm btn-primary" class:disabled={vrmGalleryStore.tempModelLoading}>
						<Icon name="upload" size={14} />
						{vrmGalleryStore.tempModelLoading ? 'Loading…' : 'Upload VRM'}
						<input
							type="file"
							accept=".vrm,.VRM"
							onchange={handleTempModelSelect}
							disabled={vrmGalleryStore.tempModelLoading}
							class="sr-only"
						/>
					</label>
				{/if}
			</section>

			<!-- Animation Selection -->
		<section class="section">
			<h3>Animation</h3>
			<p class="hint">Select an animation to play on the model.</p>
			<div class="animation-select">
				<Select label="Animation" value={vrmStore.currentAnimation || 'none'} onchange={(value) => vrmStore.setCurrentAnimation(value === 'none' ? null : value)} options={[{ value: 'none', label: 'None (idle)' }, ...vrmStore.availableAnimations.map(anim => ({ value: anim.url, label: anim.name }))]} />
			</div>
		</section>

		<!-- Material Debug -->
		<section class="section">
			<h3>Material Debug</h3>
			<p class="hint">Visualize different material properties (MToon).</p>
			<div class="animation-select">
				<Select label="Material debug" value={currentDebugMode} onchange={setMaterialDebugMode} options={materialDebugModes.map(mode => ({ value: mode.id, label: mode.name }))} />
			</div>
		</section>

		<!-- Quick Actions -->
		<section class="section">
			<h3>Quick Tests</h3>
			<div class="quick-actions">
				<button class="btn btn-sm btn-secondary" onclick={testBlink}>Test Blink</button>
				<button class="btn btn-sm btn-secondary" onclick={testSmile}>Test Smile</button>
				<button class="btn btn-sm btn-secondary" onclick={testSurprised}>Test Surprised</button>
				<button class="btn btn-sm btn-secondary" onclick={testSad}>Test Sad</button>
				<button class="btn btn-sm btn-secondary" onclick={testMouthOpen}>Test Mouth Open</button>
				<button class="btn btn-sm btn-danger" onclick={resetAll}>Reset All</button>
			</div>
		</section>

		<!-- Events Debug -->
		<section class="section">
			<h3>Event System</h3>
			<p class="hint">Trigger test events to preview the event modal styling.</p>
			<div class="event-buttons">
				{#each testEvents as event}
					<button class="btn btn-sm btn-secondary" onclick={() => triggerEvent(event)}>
						<Icon name={event.type === 'milestone' ? 'sparkles' : event.type === 'anniversary' ? 'calendar' : event.type === 'conditional' ? 'heart' : 'shuffle'} size={14} />
						{event.name}
					</button>
				{/each}
			</div>
		</section>

		<!-- Storage -->
		<section class="section">
			<h3>Storage</h3>
			<p class="hint">Clear cached data from browser storage.</p>
			<div class="quick-actions">
				<button class="btn btn-sm btn-danger" onclick={clearVrmStorage} disabled={clearingStorage}>
					{clearingStorage ? 'Clearing...' : 'Clear VRM Storage'}
				</button>
				<button class="btn btn-sm btn-danger" onclick={clearCharacterData}>
					Reset Character Data
				</button>
			</div>
		</section>

		<!-- Available Expressions Info -->
		<section class="section">
			<h3>Available Expressions ({availableExpressions.length})</h3>
			<p class="hint">This model supports the following expressions:</p>
			<div class="expression-tags">
				{#each availableExpressions as expr}
					<span class="tag">{expr}</span>
				{/each}
			</div>
		</section>

		<!-- Expression Sliders by Category -->
		{#each Object.entries(expressionCategories) as [category, expressions]}
			{@const available = getAvailableInCategory(expressions)}
			{#if available.length > 0}
				<section class="section">
					<h3>{category.charAt(0).toUpperCase() + category.slice(1)}</h3>
					<div class="sliders">
						{#each available as expr}
							<div class="slider-row">
								<label for={expr}>{expr}</label>
								<input
									type="range" use:rangeProgress={expressionValues[expr] || 0} class="settings-range"
									id={expr}
									min="0"
									max="1"
									step="0.01"
									value={expressionValues[expr] || 0}
									oninput={(e) => setExpression(expr, parseFloat(e.currentTarget.value))}
								/>
								<span class="value">{(expressionValues[expr] || 0).toFixed(2)}</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/each}
		</div>
	</div>
</div>

<style>
	.developer-settings {
		max-width: 1400px;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.dev-layout {
		display: grid;
		grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1fr);
		gap: 1.5rem;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.viewport-container {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.viewport {
		flex: 1;
		min-height: 400px;
		background: var(--bg-secondary);
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: var(--shadow-sm);
	}

	.viewport-controls {
		display: flex;
		gap: 0.5rem;
	}

	.controls-panel {
		min-width: 0;
		overflow-y: auto;
		min-height: 0;
		padding-right: 0.5rem;
		padding-bottom: 1rem;
	}

	.section {
		margin-bottom: 1.25rem;
		padding: 1.25rem;
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	.section h3 {
		margin: 0 0 0.75rem;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.hint {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
		color: var(--text-tertiary);
	}

	.quick-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.temp-model-info {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: var(--bg-tertiary);
		border-radius: var(--radius-lg);
	}

	.temp-model-name {
		font-size: 0.875rem;
		color: var(--text-secondary);
		word-break: break-all;
	}

	.event-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.expression-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.tag {
		padding: 0.3rem 0.6rem;
		background: var(--bg-tertiary);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-family: var(--font-mono);
		color: var(--text-secondary);
	}

	.sliders {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.slider-row {
		display: grid;
		grid-template-columns: 180px 1fr 50px;
		align-items: center;
		gap: 1rem;
	}

	.slider-row label {
		font-size: 0.8125rem;
		font-family: var(--font-mono);
		color: var(--text-secondary);
	}

	.slider-row .value {
		font-size: 0.75rem;
		font-family: var(--font-mono);
		color: var(--text-tertiary);
		text-align: right;
	}

	@media (max-width: 900px) {
		.dev-layout {
			grid-template-columns: minmax(0, 1fr);
			overflow-y: auto;
		}

		.controls-panel { overflow-y: visible; }

		.viewport {
			min-height: 300px;
			max-height: 350px;
		}
	}

	@media (max-width: 640px) {

		.viewport {
			min-height: 240px;
			max-height: 280px;
		}

		.section {
			padding: 1rem;
			margin-bottom: 1rem;
		}

		.section h3 {
			font-size: 0.9rem;
			margin-bottom: 0.75rem;
		}

		.hint {
			font-size: 0.8125rem;
			margin-bottom: 0.625rem;
		}

		.quick-actions {
			gap: 0.375rem;
		}

		.event-buttons {
			gap: 0.375rem;
		}

		.expression-tags {
			gap: 0.25rem;
		}

		.tag {
			padding: 0.1875rem 0.375rem;
			font-size: 0.6875rem;
		}

		.slider-row {
			grid-template-columns: 1fr 50px;
		}

		.slider-row label {
			grid-column: 1 / -1;
			margin-bottom: -0.5rem;
			font-size: 0.75rem;
		}

		.slider-row .value {
			font-size: 0.6875rem;
		}
	}

	@media (max-width: 400px) {
		.viewport {
			min-height: 200px;
			max-height: 240px;
		}

	}
</style>

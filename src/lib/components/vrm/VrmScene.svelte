<script lang="ts">
	import { type ChatFrame } from './chat-framing';
	import { Canvas } from '@threlte/core';
	import { XR } from '@threlte/xr';
	import { WebGLRenderer, SRGBColorSpace, NoToneMapping } from 'three';
	import { onMount } from 'svelte';
	import Scene from './Scene.svelte';
	import { vrmGalleryStore } from '$lib/stores/vrm-gallery.svelte';
	import { arStore } from '$lib/stores/ar.svelte';
	import { preGenerateThumbnails } from '$lib/utils/vrm-thumbnail';
	import { isWebGLAvailable } from '$lib/utils/webgl';

	interface Props {
		centered?: boolean;
		locked?: boolean;
		overlay?: boolean;
		framing?: ChatFrame;
	}

	let { centered = false, locked = false, overlay = false, framing }: Props = $props();
	let mounted = $state(false);
	let webglError = $state(false);

	// Custom renderer factory for screenshot support
	function createRenderer(canvas: HTMLCanvasElement) {
		// Handle GPU context loss (driver crash, sleep, etc.)
		canvas.addEventListener('webglcontextlost', (e) => {
			e.preventDefault();
			console.warn('WebGL context lost — will restore automatically');
		});
		canvas.addEventListener('webglcontextrestored', () => {
			console.warn('WebGL context restored');
		});

		// Chrome blocks new contexts after a loss involved page state; the
		// pre-mount check above normally catches that, this is the last line
		// of defense for a race between check and creation.
		try {
			const renderer = new WebGLRenderer({
				canvas,
				antialias: true,
				alpha: true,
				preserveDrawingBuffer: true
			});

			renderer.outputColorSpace = SRGBColorSpace;
			renderer.toneMapping = NoToneMapping;

			return renderer;
		} catch (err) {
			console.error('WebGL renderer creation failed:', err);
			webglError = true;
			throw err;
		}
	}

	onMount(() => {
		// After a context loss the browser blocks new contexts for this page
		// until a reload; creating the renderer would throw an uncaught error
		// and leave a blank scene. Fail gracefully instead.
		if (!isWebGLAvailable()) {
			console.error('WebGL is unavailable — showing fallback');
			webglError = true;
			return;
		}
		mounted = true;

		// Pre-generate thumbnails for models without previews. Wait for storage
		// init first, otherwise saved previews look missing and get regenerated.
		vrmGalleryStore.whenReady().then(() => {
			const modelsNeedingThumbnails = vrmGalleryStore.models.filter((m) => !m.previewUrl);
			if (modelsNeedingThumbnails.length > 0) {
				preGenerateThumbnails(modelsNeedingThumbnails, (modelId, dataUrl) => {
					vrmGalleryStore.setModelPreview(modelId, dataUrl);
				});
			}
		});
	});
</script>

<div class="vrm-scene">
	{#if mounted && !webglError}
		<Canvas {createRenderer} toneMapping={NoToneMapping}>
			<!-- Session management only: XR renders children solely while presenting,
			     so the scene lives beside it and stays mounted in both modes -->
			<XR
				offerSession={false}
				enterGrantedSession={false}
				onsessionstart={() => arStore.setActive(true)}
				onsessionend={() => arStore.setActive(false)}
			/>
			<Scene {centered} {locked} {overlay} {framing} />
		</Canvas>
	{:else if webglError}
		<div class="vrm-scene-fallback">
			<p>WebGL is unavailable on this device or browser.</p>
			<button onclick={() => window.location.reload()}>Reload</button>
		</div>
	{/if}
</div>

<style>
	.vrm-scene {
		width: 100%;
		height: 100%;
	}

	.vrm-scene-fallback {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		text-align: center;
	}
</style>

<script lang="ts">
	import { applyChatFraming, type ChatFrame } from './chat-framing';
	// Minimal viewer scene: one white directional light, flat backdrop,
	// grid + axes helpers, free orbit controls. No post-processing.
	import { T, useThrelte, useTask } from '@threlte/core';
	import { useXR } from '@threlte/xr';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import {
		ShaderMaterial,
		Color,
		Box3,
		Vector3,
		Vector2,
		Raycaster,
		PerspectiveCamera,
		Group
	} from 'three';
	import type { VRM } from '@pixiv/three-vrm';
	import ArPlacement from './ArPlacement.svelte';
	import VrmModel from './VrmModel.svelte';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { vrmGalleryStore } from '$lib/stores/vrm-gallery.svelte';
	import { displayStore } from '$lib/stores/display.svelte';
	import { photomodeStore, type CaptureOptions } from '$lib/stores/photomode.svelte';
	import { bucketTouchZone } from '$lib/services/photo-touch';
	import {
		drawPhotoFrame,
		drawPhotoBackground,
		drawPhotoVignette,
		drawPhotoStickers
	} from '$lib/services/photo-capture';
	import { drawSceneBackground } from '$lib/services/scene-backgrounds';
	import { PHOTO_FILTERS } from '$lib/stores/photomode.svelte';
	import { onMount } from 'svelte';

	// Floor tint per theme; the backdrop itself follows the page canvas token
	const FLOOR_COLORS = { light: '#000000', dark: '#ffffff' };

	// Soft studio floor: a disc that fades out toward its edge
	const floorVertexShader = `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`;

	const floorFragmentShader = `
		uniform vec3 uColor;
		uniform float uOpacity;
		varying vec2 vUv;
		void main() {
			float dist = length(vUv - 0.5);
			float alpha = uOpacity * smoothstep(0.5, 0.1, dist);
			gl_FragColor = vec4(uColor, alpha);
		}
	`;

	interface Props {
		centered?: boolean;
		locked?: boolean;
		overlay?: boolean;
		framing?: ChatFrame;
	}

	let { centered = false, locked = false, overlay = false, framing }: Props = $props();

	const modelUrl = $derived(vrmGalleryStore.modelUrl);

	const { camera, renderer, scene, size } = useThrelte();
	const { isPresenting } = useXR();
	let controls: OrbitControls | null = null;
	let modelRoot = $state<Group | undefined>();

	// Dark mode detection
	let isDarkMode = $state(false);
	let backgroundColor = $state('');

	onMount(() => {
		const checkDarkMode = () => {
			isDarkMode = document.documentElement.classList.contains('dark');
			backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim();
		};
		checkDarkMode();

		const observer = new MutationObserver(checkDarkMode);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

		// Photo-mode capture: render one supersampled frame in place (the canvas
		// has preserveDrawingBuffer), composite background and frame on a 2D
		// canvas, and hand back a PNG blob. Restores the live pixel ratio after.
		const unregisterCapture = photomodeStore.registerCapture(async (options: CaptureOptions) => {
			if (!renderer || !scene || !camera.current) return null;
			const glCanvas = renderer.domElement;
			const prevRatio = renderer.getPixelRatio();
			// Cap the supersample so width/height never exceed the GPU texture limit
			const maxTex = renderer.capabilities.maxTextureSize;
			const scale = Math.min(
				options.scale,
				maxTex / glCanvas.width || 1,
				maxTex / glCanvas.height || 1
			);
			try {
				if (scale !== 1) {
					renderer.setPixelRatio(prevRatio * scale);
				}
				renderer.render(scene, camera.current);

				const out = document.createElement('canvas');
				out.width = glCanvas.width;
				out.height = glCanvas.height;
				const ctx = out.getContext('2d');
				if (!ctx) return null;
				// The color filter covers the scene and background; stickers and
				// frames sit on top unfiltered, like real stickers would
				const filterCss = PHOTO_FILTERS[options.filter]?.css ?? 'none';
				ctx.filter = filterCss;
				// Patterns scale by CSS-to-capture pixel ratio so they bake at the
				// same visual size the preview shows
				const pixelScale = out.width / (glCanvas.clientWidth || out.width);
				if (options.background.type === 'room' && displayStore.sceneBackground.type !== 'default') {
					// Photo 'room' over a customized scene: composite the scene's own
					// background, which the transparent GL canvas does not carry
					drawSceneBackground(
						ctx,
						out.width,
						out.height,
						displayStore.sceneBackground,
						pixelScale,
						displayStore.activeBackgroundImage?.bitmap
					);
				} else {
					drawPhotoBackground(ctx, out.width, out.height, options.background, pixelScale);
				}
				ctx.drawImage(glCanvas, 0, 0);
				ctx.filter = 'none';
				if (options.vignette) drawPhotoVignette(ctx, out.width, out.height);
				drawPhotoFrame(ctx, out.width, out.height, options.frame);
				await drawPhotoStickers(ctx, out.width, out.height, options.stickers);

				return await new Promise<Blob | null>((resolve) =>
					out.toBlob((blob) => resolve(blob), 'image/png')
				);
			} finally {
				if (scale !== 1) {
					renderer.setPixelRatio(prevRatio);
					renderer.render(scene, camera.current);
				}
			}
		});

		// Tap reactions (universal, chat view and photo mode alike): commit the
		// raycast target at pointerdown (the camera can drift before pointerup),
		// fire only if the gesture stays a tap so orbit drags never trigger her.
		const canvas = renderer?.domElement;
		let tapCandidate: { zone: ReturnType<typeof bucketTouchZone>; x: number; y: number; at: number } | null = null;
		const raycaster = new Raycaster();
		const pointerNdc = new Vector2();

		function onPointerDown(e: PointerEvent) {
			// The overlay window handles dragging separately, and
			// XR sessions own their input
			if (overlay || renderer?.xr.isPresenting || !renderer || !camera.current) return;
			const vrm = vrmStore.vrm;
			if (!vrm) return;
			const rect = renderer.domElement.getBoundingClientRect();
			pointerNdc.set(
				((e.clientX - rect.left) / rect.width) * 2 - 1,
				-((e.clientY - rect.top) / rect.height) * 2 + 1
			);
			raycaster.setFromCamera(pointerNdc, camera.current);
			const hits = raycaster.intersectObject(vrm.scene, true);
			if (hits.length === 0) {
				tapCandidate = null;
				return;
			}
			tapCandidate = {
				zone: bucketTouchZone(vrm, hits[0].point),
				x: e.clientX,
				y: e.clientY,
				at: performance.now()
			};
		}

		function onPointerUp(e: PointerEvent) {
			if (!tapCandidate) return;
			const moved = Math.hypot(e.clientX - tapCandidate.x, e.clientY - tapCandidate.y);
			const elapsed = performance.now() - tapCandidate.at;
			if (tapCandidate.zone && moved < 8 && elapsed < 450) {
				vrmStore.requestReaction(tapCandidate.zone);
			}
			tapCandidate = null;
		}

		canvas?.addEventListener('pointerdown', onPointerDown);
		canvas?.addEventListener('pointerup', onPointerUp);

		// Set transparent background for overlay mode
		if (overlay) {
			if (scene) {
				scene.background = null;
			}
			// Ensure renderer clears to transparent
			if (renderer) {
				renderer.setClearColor(0x000000, 0);
			}
		}

		return () => {
			observer.disconnect();
			unregisterCapture();
			canvas?.removeEventListener('pointerdown', onPointerDown);
			canvas?.removeEventListener('pointerup', onPointerUp);
		};
	});

	// Photo mode is a plain-screen feature: entering it during an AR/XR
	// session ends the session first, so the shot always composes against the
	// regular scene and never AR passthrough. The existing isPresenting effect
	// then re-enables the orbit controls and re-applies the framing.
	$effect(() => {
		if (photomodeStore.active && $isPresenting) {
			renderer?.xr
				.getSession()
				?.end()
				.catch(() => {
					// Session may already be winding down; nothing to do
				});
		}
	});

	// Any custom backdrop (photo override, or the persistent scene background)
	// clears the GL canvas to transparent; the page shows a CSS preview behind
	// it and captures composite the same background, so what you see is what
	// you save. Photo 'room' means "whatever the scene shows", including a
	// customized scene background.
	const sceneBgActive = $derived(!overlay && displayStore.sceneBackground.type !== 'default');
	const photoTransparent = $derived(
		(photomodeStore.active && photomodeStore.background.type !== 'room') || sceneBgActive
	);

	$effect(() => {
		if (!renderer || overlay) return;
		if (photoTransparent) {
			renderer.setClearColor(0x000000, 0);
			return () => {
				// The renderer is created with alpha:true and never had an opaque
				// clear color; restoring alpha 1 here would break AR passthrough
				renderer.setClearColor(0x000000, 0);
			};
		}
	});

	// One material for the life of the scene; only its color uniform changes on
	// theme toggle. Rebuilding it per toggle (the old $derived.by) orphaned a GPU
	// shader program each time.
	const floorMaterial = new ShaderMaterial({
		uniforms: {
			uColor: { value: new Color(FLOOR_COLORS.light) },
			uOpacity: { value: 0.06 }
		},
		vertexShader: floorVertexShader,
		fragmentShader: floorFragmentShader,
		transparent: true,
		depthWrite: false
	});

	$effect(() => {
		(floorMaterial.uniforms.uColor.value as Color).set(isDarkMode ? FLOOR_COLORS.dark : FLOOR_COLORS.light);
	});

	onMount(() => () => floorMaterial.dispose());

	// --- Camera auto-fit ---
	// Frames each model by its actual proportions: bottom of frame around the
	// upper thigh, top of the head just under the top of the screen. User
	// settings (fov/zoom/height) adjust on top of the fitted framing.
	// Overlay windows frame very differently, so they keep their own profile
	const camSettings = $derived(overlay ? displayStore.overlayCamera : displayStore.camera);

	$effect(() => {
		const cam = $camera;
		if (!(cam instanceof PerspectiveCamera) || $isPresenting) return;
		applyChatFraming(cam, $size, overlay || photomodeStore.active ? undefined : framing);
	});

	function computeFit(vrm: VRM): { center: number; halfSpan: number } {
		vrm.scene.updateWorldMatrix(true, true);
		const box = new Box3().setFromObject(vrm.scene);
		const headTop = box.max.y;

		// Thigh line from the raw skeleton (world matrices are valid right after
		// updateWorldMatrix, unlike the normalized rig at load time); fall back
		// to a proportional guess
		let thighY = headTop * 0.45;
		const upperLeg =
			vrm.humanoid?.getRawBoneNode('leftUpperLeg') ??
			vrm.humanoid?.getNormalizedBoneNode('leftUpperLeg');
		if (upperLeg) {
			const p = new Vector3();
			upperLeg.getWorldPosition(p);
			thighY = p.y * 0.92;
		}

		const top = headTop + (headTop - thighY) * 0.04;
		return { center: (top + thighY) / 2, halfSpan: (top - thighY) / 2 };
	}

	function applyCamera() {
		// The XR session owns the camera while presenting
		if (renderer?.xr.isPresenting) return;
		const cam = camera.current;
		if (!(cam instanceof PerspectiveCamera)) return;

		const s = overlay ? displayStore.overlayCamera : displayStore.camera;
		cam.fov = s.fov;
		cam.updateProjectionMatrix();

		const vrm = vrmStore.vrm;
		const fit = vrm ? computeFit(vrm) : { center: 1.0, halfSpan: 0.55 };
		const distance = fit.halfSpan / Math.tan((s.fov * Math.PI) / 360) / s.zoom;
		const targetY = fit.center + s.height;

		cam.position.set(s.panX, targetY, distance);
		if (controls) {
			controls.target.set(s.panX, targetY, 0);
			controls.update();
		} else {
			cam.lookAt(s.panX, targetY, 0);
		}
	}

	// Re-frame when the model or the camera settings change. In photo mode the
	// user owns the framing, so FOV changes only adjust the lens in place
	// instead of snapping the camera back to the fitted position.
	$effect(() => {
		void vrmStore.vrm;
		void camSettings.fov;
		void camSettings.zoom;
		void camSettings.height;
		void camSettings.panX;
		if (photomodeStore.active) {
			const cam = camera.current;
			if (cam instanceof PerspectiveCamera) {
				cam.fov = photomodeStore.photoFov ?? camSettings.fov;
				cam.updateProjectionMatrix();
			}
			return;
		}
		applyCamera();
	});

	// The dock's reset chip explicitly asks for the fitted framing back
	$effect(() => {
		void photomodeStore.reframeCounter;
		if (photomodeStore.active) applyCamera();
	});

	// Photo-mode camera profile: damping for deliberate motion, a wider zoom
	// range for close portraits and full-body shots, and a polar clamp that
	// keeps the camera above the floor. Exiting restores the chat profile and
	// re-applies the fitted framing.
	$effect(() => {
		if (!controls) return;
		if (photomodeStore.active) {
			controls.enableDamping = true;
			controls.dampingFactor = 0.08;
			controls.minDistance = 0.3;
			controls.maxDistance = 8;
			controls.minPolarAngle = 0.05;
			controls.maxPolarAngle = Math.PI * 0.6;
			return () => {
				if (!controls) return;
				controls.enableDamping = false;
				controls.minDistance = 0;
				controls.maxDistance = Infinity;
				controls.minPolarAngle = 0;
				controls.maxPolarAngle = Math.PI;
				applyCamera();
			};
		}
	});

	// Setup OrbitControls (skip when locked)
	$effect(() => {
		if (locked) return;

		if (camera.current && renderer) {
			controls = new OrbitControls(camera.current, renderer.domElement);
			controls.screenSpacePanning = true;
			applyCamera();

			return () => {
				controls?.dispose();
			};
		}
	});

	// Orbit controls fight the XR camera; disable them while presenting and
	// re-apply the fitted framing when the session ends
	$effect(() => {
		if (!controls) return;
		controls.enabled = !$isPresenting;
		if (!$isPresenting) applyCamera();
	});

	useTask(() => {
		if (controls?.enabled) controls.update();
	});
</script>

<!-- Camera - auto-fitted to the model once it loads -->
<T.PerspectiveCamera manual makeDefault position={[0, 1.1, 2]} fov={camSettings.fov} near={0.1} far={1000} />

<!-- Backdrop + floor (hidden in overlay mode, AR passthrough, and photo
     backgrounds, which render through a transparent canvas + composite) -->
{#if !overlay && !$isPresenting && !photoTransparent && backgroundColor}
	<T.Color attach="background" args={[backgroundColor]} />
{/if}
{#if !overlay && !$isPresenting && !(photomodeStore.active && photomodeStore.background.type !== 'room')}
	<!-- The floor disc stays over the persistent scene background so she keeps
	     her grounding in daily use; photo overrides hide it for clean shots -->
	<T.Mesh rotation.x={-Math.PI / 2} position.y={0}>
		<T.CircleGeometry args={[2.5, 64]} />
		<T is={floorMaterial} />
	</T.Mesh>
{/if}

<!-- Single white directional light. Math.PI matches the legacy-lighting
     intensity 1 the classic three-vrm viewers were tuned against. -->
<T.DirectionalLight intensity={Math.PI} position={[1, 1, 1]} />

<!-- VRM Model, wrapped so AR placement can move/scale it without remounting -->
<T.Group bind:ref={modelRoot}>
	{#if modelUrl}
		<VrmModel url={modelUrl} />
	{/if}
</T.Group>

{#if $isPresenting && modelRoot}
	<ArPlacement root={modelRoot} />
{/if}

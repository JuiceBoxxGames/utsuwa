<script lang="ts">
	import { T, useThrelte, useTask } from '@threlte/core';
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
	import { createVRMAnimationClip } from '@pixiv/three-vrm-animation';
	import { loadVrmAnimation } from '$lib/services/vrm-animations';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { vrmGalleryStore } from '$lib/stores/vrm-gallery.svelte';
	import { animationLibraryStore } from '$lib/stores/animation-library.svelte';
	import { ttsStore } from '$lib/stores/tts.svelte';
	import { displayStore } from '$lib/stores/display.svelte';
	import { photomodeStore } from '$lib/stores/photomode.svelte';
	import { loadPoseAnimation, loadPoseManifest } from '$lib/services/poses';
	import { pickReaction, stageTier, type TouchZone } from '$lib/engine/photo-reactions';
	import { flashExpressionTarget, moodExpressionTarget } from '$lib/engine/mood-expression';
	import {
		composeExpressionWeights,
		createFaceState,
		findHappyExpression
	} from '$lib/engine/expression-compose';
	import { characterStore } from '$lib/stores/character.svelte';
	import { computeSpringJointParams, clampFrameDelta } from '$lib/engine/spring-physics';
	import { lipSyncAnalyzer } from '$lib/services/lipsync/analyzer';
	import { AvatarAnimator } from '$lib/services/avatar/avatar-animator';
	import { BodyMotion } from '$lib/services/avatar/body-motion';
	import {
		embeddedThumbnail,
		imageToDataUrl,
		normalizeModel,
		renderThumbnail,
		setIdlePose,
		snapshotSpringBase,
		type SpringBase
	} from '$lib/services/avatar/vrm-setup';
	import { untrack } from 'svelte';
	import * as THREE from 'three';

	interface Props {
		url: string;
	}

	let { url }: Props = $props();
	let vrm = $state<VRM | null>(null);
	let group = $state<THREE.Group | null>(null);
	// Created with each model; the mixer and every clip on it belong to it
	let animator: AvatarAnimator | null = null;
	// Flips once per model, when its first idle clip is running. An emote asked
	// for before that (Play from settings lands here mid-load) waits for it
	// instead of being dropped or blending with the idle as it fades in.
	let idleReady = $state(false);

	// === Spring-bone physics ===
	let springBase: SpringBase[] = [];

	// Applied live so slider tuning is immediate; re-runs on model switch since
	// the load path re-assigns `vrm` after rebuilding the snapshot.
	$effect(() => {
		const intensity = displayStore.physicsIntensity;
		if (!vrm) return;
		for (const { settings, base } of springBase) {
			const next = computeSpringJointParams(base, intensity);
			settings.stiffness = next.stiffness;
			settings.gravityPower = next.gravityPower;
			settings.dragForce = next.dragForce;
		}
	});

	// A url, not an index: the pool can change size between picks
	let lastIdleUrl: string | null = null;
	const currentAnimation = $derived(vrmStore.currentAnimation);
	// Talking animation plays when TTS is speaking OR when text-based talking is triggered
	const shouldTalk = $derived(ttsStore.isSpeaking || vrmStore.isTalking);
	// The wait before the first words, when the user picked a thinking clip
	const shouldThink = $derived(vrmStore.isThinking && !!animationLibraryStore.thinkingUrl && !shouldTalk);
	// Resting face from her tracked mood; photo mode hands the face to the user
	const moodTarget = $derived(
		displayStore.moodExpressions && !photomodeStore.active
			? moodExpressionTarget(characterStore.state.mood, vrmStore.availableExpressions)
			: null
	);

	// Mood, flash, and blink layers; blink timing carries across model switches
	let face = createFaceState();

	const { renderer, camera } = useThrelte();

	// Generate thumbnail from the current 3D render
	function generateThumbnail(modelId: string | null) {
		const canvas = renderer?.domElement;
		if (!canvas) return;
		const dataUrl = renderThumbnail(canvas);
		if (dataUrl) vrmGalleryStore.setModelPreview(modelId, dataUrl);
	}

	// Pick a random idle from the pool, excluding the last played one. Runs from
	// timers, so the pool is read untracked and a change lands on the next cycle.
	function pickRandomIdleUrl(): string | null {
		const urls = untrack(() => vrmStore.idleAnimationUrls);
		const choices = urls.length > 1 ? urls.filter((u) => u !== lastIdleUrl) : urls;
		lastIdleUrl = choices[Math.floor(Math.random() * choices.length)] ?? null;
		return lastIdleUrl;
	}

	function createAnimator(target: VRM) {
		// Pose clips are per-model; caching them means repeat selections reuse the
		// same mixer action instead of accumulating new clips
		const poseClips = new Map<string, THREE.AnimationClip>();
		return new AvatarAnimator(target.scene, {
			loadClip: (clipUrl) =>
				loadVrmAnimation(clipUrl).then((anim) => createVRMAnimationClip(anim, target)),
			loadPose: async (poseId) => {
				const entry = (await loadPoseManifest()).find((p) => p.id === poseId);
				if (!entry) return null;
				const animation = await loadPoseAnimation(entry.file);
				let clip = poseClips.get(poseId);
				if (!clip) {
					clip = createVRMAnimationClip(animation, target);
					poseClips.set(poseId, clip);
				}
				// Freeze at the manifest's hold (fraction of duration)
				return { clip, hold: entry.hold ?? 0 };
			},
			pickIdleUrl: pickRandomIdleUrl,
			isTalking: () => shouldTalk,
			isThinking: () => shouldThink,
			isPhotoActive: () => photomodeStore.active,
			onIdleReady: () => (idleReady = true)
		});
	}

	// === Photo mode ===
	// Enter freezes the current stance; exit hands back to the idle cycler.
	// vrm.update() keeps running in the render task, so spring bones and
	// blinking stay alive while posed.
	let wasPhotoActive = false;
	$effect(() => {
		const active = photomodeStore.active;
		untrack(() => {
			if (animator) {
				if (active && !wasPhotoActive) animator.enterPhoto();
				// Talking and thinking restart through their own effects
				else if (!active && wasPhotoActive) animator.exitPhoto(!shouldTalk && !shouldThink);
			}
			wasPhotoActive = active;
		});
	});

	// Apply pose selections while photo mode is active
	$effect(() => {
		const active = photomodeStore.active;
		const poseId = photomodeStore.selectedPoseId;
		if (!active) return;
		untrack(() => animator?.selectPose(poseId));
	});

	// Held photo expression: applied exclusively, cleared on change and exit.
	// Tap reactions layer a transient expression on top and restore this one.
	let heldExpression: string | null = null;
	$effect(() => {
		const active = photomodeStore.active;
		const name = photomodeStore.selectedExpression;
		untrack(() => {
			const em = vrm?.expressionManager;
			if (!em) return;
			if (heldExpression && heldExpression !== name) {
				em.setValue(heldExpression, 0);
				heldExpression = null;
			}
			if (active && name) {
				em.setValue(name, 1);
				heldExpression = name;
			}
		});
	});

	// Tap reactions: an expression flash plus a decaying rotation nudge whose
	// motion the spring bones inherit. Repeat taps inside the window escalate.
	const body = new BodyMotion();
	let reactionFace: { name: string; weight: number; t: number; duration: number } | null = null;
	// Happy face worn during an emote; owns its expression over the mood face
	let emoteFace: string | null = null;
	const recentTaps = { zone: null as TouchZone | null, at: 0, count: 0 };
	const REACTION_REPEAT_WINDOW_MS = 4000;

	$effect(() => {
		const request = vrmStore.reactionRequest;
		if (!request) return;
		untrack(() => {
			const targetVrm = vrm;
			if (!targetVrm) return;

			const now = performance.now();
			if (recentTaps.zone === request.zone && now - recentTaps.at < REACTION_REPEAT_WINDOW_MS) {
				recentTaps.count += 1;
			} else {
				recentTaps.count = 0;
			}
			recentTaps.zone = request.zone;
			recentTaps.at = now;

			const tier = stageTier(characterStore.state.relationshipStage);
			const spec = pickReaction(request.zone, tier, recentTaps.count);

			const em = targetVrm.expressionManager;
			if (em) {
				const name = spec.expressions.find((candidate) =>
					em.expressions.some((e) => e.expressionName === candidate)
				);
				if (name) {
					if (reactionFace && reactionFace.name !== name) em.setValue(reactionFace.name, 0);
					reactionFace = { name, weight: spec.weight, t: 0, duration: 1.8 };
				}
			}

			// Half strength while she is talking: the head is already moving,
			// and a full kick layered on that read as a jump
			body.tap(targetVrm, request.zone, spec.impulse * (shouldTalk ? 0.5 : 1));
		});
	});

	// A reaction the model asked for, between the mood face and tap reactions
	$effect(() => {
		const request = vrmStore.flashRequest;
		if (!request) return;
		untrack(() => {
			// Same switch as the resting face; off means no automatic faces at all
			if (!displayStore.moodExpressions) return;
			const target = flashExpressionTarget(request.emotion, vrmStore.availableExpressions);
			if (!target) return;
			if (face.flash && face.flash.name !== target.name) {
				vrm?.expressionManager?.setValue(face.flash.name, 0);
			}
			face = { ...face, flash: { name: target.name, weight: target.weight, t: 0, holdUntil: null } };
		});
	});

	// Update lip-sync analyser when TTS state changes
	$effect(() => {
		lipSyncAnalyzer.setAnalyser(ttsStore.currentAnalyser);
	});

	// Switch between idle and talking animations based on speaking/talking state
	$effect(() => {
		const speaking = shouldTalk;
		// Don't switch mid-emote or before the model loads. A held photo pose
		// must not be stomped by TTS either; exit restores the loop.
		if (!animator || animator.emotePlaying || photomodeStore.active) return;
		animator.setTalking(speaking);
	});

	// Thinking: loops the user's pick while the reply is on its way. Same fades
	// as talking; if talking starts, the effect above takes over the idle.
	$effect(() => {
		const think = shouldThink;
		if (photomodeStore.active) return;
		untrack(() => {
			const url = animationLibraryStore.thinkingUrl;
			if (!animator || animator.emotePlaying) return;
			if (!think) animator.stopThinking(!shouldTalk);
			else if (url) animator.startThinking(url);
		});
	});

	// Play emote animations when currentAnimation changes
	$effect(() => {
		const animId = currentAnimation;
		if (!idleReady) return;
		if (!animator) return;

		animator.stopEmote();
		if (!animId) {
			animator.clearEmote();
			return;
		}

		// Untracked: editing a description must not restart the emote
		const animationData = untrack(() =>
			vrmStore.availableAnimations.find((a) => a.url === animId || a.id === animId)
		);
		if (!animationData?.url) {
			// Deleted or unknown; don't leave a stale request blocking the next one
			vrmStore.setCurrentAnimation(null);
			return;
		}

		loadVrmAnimation(animationData.url)
			.then((vrmAnimation) => {
				untrack(() => {
					if (!vrm || !animator) return;
					const target = vrm;
					const happyExpr = findHappyExpression(
						target.expressionManager?.expressions.map((e) => e.expressionName) ?? []
					);
					animator.playEmote(createVRMAnimationClip(vrmAnimation, target), () => {
						if (happyExpr) target.expressionManager?.setValue(happyExpr, 0);
						emoteFace = null;
						vrmStore.setCurrentAnimation(null);
					});
					if (happyExpr) {
						target.expressionManager?.setValue(happyExpr, 0.7);
						emoteFace = happyExpr;
					}
				});
			})
			.catch((error) => {
				console.error('Error loading emote animation:', error);
				if (vrmStore.currentAnimation === animId) vrmStore.setCurrentAnimation(null);
			});
	});

	// Load VRM when URL changes
	$effect(() => {
		if (!url) return;
		// Browser tests skip the avatar unless they assert on it. Dev server only.
		if (import.meta.env.DEV && (globalThis as { __utsuwaE2eNoAvatar?: boolean }).__utsuwaE2eNoAvatar) return;

		// Capture the model this load belongs to, so a fast switch can't save this
		// render under a different model's id.
		const loadModelId = vrmGalleryStore.activeModelId;

		// Invalidate this load if the URL changes or the component unmounts
		// before the loader finishes, so a slow load can't clobber a newer one
		let cancelled = false;

		vrmStore.setLoading(true);
		vrmStore.setError(null);

		const loader = new GLTFLoader();
		loader.crossOrigin = 'anonymous';
		loader.register((parser) => {
			const plugin = new VRMLoaderPlugin(parser);
			// Enable thumbnail loading for VRM 1.0 models
			if (plugin.metaPlugin) {
				plugin.metaPlugin.needThumbnailImage = true;
			}
			return plugin;
		});

		loader.load(
			url,
			(gltf) => {
				const loadedVrm = gltf.userData.vrm as VRM;

				if (cancelled) {
					VRMUtils.deepDispose(loadedVrm.scene);
					return;
				}

				// Optimize VRM
				VRMUtils.removeUnnecessaryVertices(loadedVrm.scene);
				VRMUtils.removeUnnecessaryJoints(loadedVrm.scene);

				// Skip frustum culling so animated meshes never pop out at the edges
				loadedVrm.scene.traverse((obj) => {
					obj.frustumCulled = false;
				});

				normalizeModel(loadedVrm);
				setIdlePose(loadedVrm);

				// Capture this rig's authored spring values before `vrm` flips the
				// physics-intensity effect, so it applies over fresh bases.
				springBase = snapshotSpringBase(loadedVrm);

				vrm = loadedVrm;
				group = loadedVrm.scene;
				animator = createAnimator(loadedVrm);
				vrmStore.setVrm(loadedVrm);
				vrmStore.setLoading(false);

				// Start the looping idle and pre-load the talking clip
				animator.start(vrmStore.talkingAnimationUrl);

				const thumbnailImage = embeddedThumbnail(loadedVrm);
				if (thumbnailImage) {
					try {
						const thumbnailDataUrl = imageToDataUrl(thumbnailImage);
						if (thumbnailDataUrl) vrmGalleryStore.setModelPreview(loadModelId, thumbnailDataUrl);
					} catch (e) {
						console.error('Failed to extract thumbnail:', e);
						setTimeout(() => generateThumbnail(loadModelId), 500);
					}
				} else {
					// No embedded thumbnail - generate one from the 3D render
					setTimeout(() => generateThumbnail(loadModelId), 500);
				}
			},
			() => {},
			(error) => {
				if (cancelled) return;
				console.error('Error loading VRM:', error);
				vrmStore.setError('Failed to load VRM model');
			}
		);

		return () => {
			// Cleanup on unmount or URL change
			cancelled = true;
			// If an emote was mid-play, its 'finished' handler (bound to the old
			// mixer) never runs, so clear the request it would have cleared;
			// otherwise the next model can immediately replay the leftover emote.
			if (animator?.emotePlaying) vrmStore.setCurrentAnimation(null);
			animator?.dispose();
			animator = null;
			idleReady = false;
			if (vrm) {
				// Frees geometries, materials, and textures (manual traverse missed textures)
				VRMUtils.deepDispose(vrm.scene);
				vrmStore.setVrm(null);
				vrm = null;
				group = null;
				springBase = [];
				body.clearTaps();
				reactionFace = null;
				heldExpression = null;
				face = { ...face, mood: null, flash: null };
				emoteFace = null;
			}
		};
	});

	// Scratch vectors reused every frame; allocating three Vector3s per frame
	// (~180/sec) was needless GC pressure in the render loop.
	const scratchWorld = new THREE.Vector3();
	const scratchProjected = new THREE.Vector3();

	// Update VRM each frame
	useTask((delta) => {
		const model = vrm;
		if (!model) return;

		body.beginFrame();
		animator?.update(delta);
		body.afterMixer(model, camera.current, delta, displayStore.physicsIntensity);

		if (reactionFace && model.expressionManager) {
			reactionFace.t += delta;
			const progress = reactionFace.t / reactionFace.duration;
			const em = model.expressionManager;
			if (progress >= 1) {
				if (heldExpression === reactionFace.name) {
					// The reaction borrowed the held expression; hand it back whole
					em.setValue(heldExpression, 1);
				} else {
					em.setValue(reactionFace.name, 0);
					if (heldExpression) em.setValue(heldExpression, 1);
				}
				reactionFace = null;
			} else {
				// Quick attack, long release
				const shape =
					progress < 0.3 ? progress / 0.3 : 1 - Math.max(0, (progress - 0.5) / 0.5);
				em.setValue(reactionFace.name, Math.max(0, Math.min(1, reactionFace.weight * shape)));
			}
		}

		body.trackHead(model, camera.current, photomodeStore.active && photomodeStore.headTracking, delta);
		// The delta is clamped because a huge frame gap (tab refocus, window
		// drag) otherwise launches the spring bones violently.
		body.updateWithJiggle(model, () => model.update(clampFrameDelta(delta)));

		// Track head position for 3D speech bubble
		const headBone = model.humanoid.getNormalizedBoneNode('head');
		if (headBone && camera.current) {
			headBone.getWorldPosition(scratchWorld);
			// Offset above and slightly in front of head
			scratchProjected.set(scratchWorld.x, scratchWorld.y + 0.25, scratchWorld.z + 0.1);
			vrmStore.setHeadPosition([scratchProjected.x, scratchProjected.y, scratchProjected.z]);

			// Project to screen coordinates (in place)
			scratchProjected.project(camera.current);
			// Convert from NDC (-1 to 1) to screen percentage (0 to 100)
			const bounds = renderer.domElement.getBoundingClientRect();
			const x = ((bounds.left + (scratchProjected.x + 1) * bounds.width / 2) / window.innerWidth) * 100;
			const y = ((bounds.top + (-scratchProjected.y + 1) * bounds.height / 2) / window.innerHeight) * 100;
			vrmStore.setHeadScreenPosition({ x, y });
		}

		const expressionManager = model.expressionManager;
		if (!expressionManager) return;

		// Helper to set expression (silently ignores if not found)
		const setExpression = (name: string, value: number) => {
			try {
				expressionManager.setValue(name, value);
			} catch {
				// Expression doesn't exist on this model
			}
		};

		const composed = composeExpressionWeights({
			delta,
			state: face,
			moodTarget,
			emotePlaying: animator?.emotePlaying ?? false,
			held: heldExpression,
			emote: emoteFace,
			reaction: reactionFace
				? { name: reactionFace.name, value: expressionManager.getValue(reactionFace.name) ?? 0 }
				: null,
			photoActive: photomodeStore.active,
			speaking: ttsStore.isSpeaking,
			visemes: lipSyncAnalyzer.update(delta),
			random: Math.random
		});
		face = composed.state;
		for (const [name, value] of composed.face) setExpression(name, value);
		expressionManager.update();
		// Mouth weights land on the next update, as they always have
		for (const [name, value] of composed.mouth) setExpression(name, value);
	});
</script>

{#if group}
	<T is={group} />
{/if}

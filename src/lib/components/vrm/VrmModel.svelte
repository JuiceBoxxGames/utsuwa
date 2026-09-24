<script lang="ts">
	import { T, useThrelte, useTask } from '@threlte/core';
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
	import { createVRMAnimationClip } from '@pixiv/three-vrm-animation';
	import { loadVrmAnimation } from '$lib/services/vrm-animations';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { animationLibraryStore } from '$lib/stores/animation-library.svelte';
	import { ttsStore } from '$lib/stores/tts.svelte';
	import { displayStore } from '$lib/stores/display.svelte';
	import { photomodeStore } from '$lib/stores/photomode.svelte';
	import { loadPoseAnimation, loadPoseManifest } from '$lib/services/poses';
	import { pickReaction, stageTier, type TouchZone } from '$lib/engine/photo-reactions';
	import { flashExpressionTarget, moodExpressionTarget } from '$lib/engine/mood-expression';
	import { characterStore } from '$lib/stores/character.svelte';
	import {
		computeSpringJointParams,
		clampFrameDelta,
		type SpringJointParams
	} from '$lib/engine/spring-physics';
	import {
		cameraAngles,
		angularVelocity,
		stepJiggle,
		createJiggleState,
		type CameraAngles
	} from '$lib/engine/camera-impulse';
	import { lipSyncAnalyzer } from '$lib/services/lipsync/analyzer';
	import { untrack } from 'svelte';
	import * as THREE from 'three';

	// Pose configurations for different VRM versions
	// VRM 0.x and 1.0 have different bone orientations and coordinate systems
	const VRM_POSE_CONFIG = {
		// VRM 0.x (older models like AvatarSample_A/B)
		'0': {
			sceneRotationY: Math.PI, // Rotate 180° to face camera
			leftUpperArm: { x: Math.PI * 0.05, y: 0, z: Math.PI * 0.4 },
			rightUpperArm: { x: Math.PI * 0.05, y: 0, z: -Math.PI * 0.4 },
			leftLowerArm: { x: 0, y: -Math.PI * 0.1, z: 0 },
			rightLowerArm: { x: 0, y: Math.PI * 0.1, z: 0 }
		},
		// VRM 1.0 (VRoid Studio models like Utsuwa)
		'1': {
			sceneRotationY: 0, // Already facing camera
			leftUpperArm: { x: Math.PI * 0.05, y: 0, z: -Math.PI * 0.4 },
			rightUpperArm: { x: Math.PI * 0.05, y: 0, z: Math.PI * 0.4 },
			leftLowerArm: { x: 0, y: -Math.PI * 0.1, z: 0 }, // Same Y values as 0.x
			rightLowerArm: { x: 0, y: Math.PI * 0.1, z: 0 }
		}
	} as const;

	// Find a happy expression from available expressions (works with any model)
	function findHappyExpression(vrmInstance: VRM): string | null {
		const expressions = vrmInstance.expressionManager?.expressions;
		if (!expressions) return null;

		// Priority order of happy-like expressions to look for
		const happyKeywords = ['happy', 'joy', 'smile', 'fun', 'cheerful'];

		for (const keyword of happyKeywords) {
			const match = expressions.find((e) => e.expressionName.toLowerCase().includes(keyword));
			if (match) return match.expressionName;
		}
		return null;
	}

	interface Props {
		url: string;
	}

	let { url }: Props = $props();
	let vrm = $state<VRM | null>(null);
	let group = $state<THREE.Group | null>(null);

	// === Spring-bone physics ===
	// Authored per-joint values captured at load. The intensity setting always
	// multiplies these bases (never the current values), so re-applying is
	// idempotent and a model switch starts clean from its own rig tuning.
	let springBase: Array<{
		settings: { stiffness: number; gravityPower: number; dragForce: number };
		base: SpringJointParams;
	}> = [];

	function snapshotSpringBase(target: VRM) {
		springBase = [];
		const joints = target.springBoneManager?.joints;
		if (!joints) return;
		for (const joint of joints) {
			springBase.push({
				settings: joint.settings,
				base: {
					stiffness: joint.settings.stiffness,
					gravityPower: joint.settings.gravityPower,
					dragForce: joint.settings.dragForce
				}
			});
		}
	}

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

	// === Animation State ===
	let mixer = $state<THREE.AnimationMixer | null>(null);
	let idleAction = $state<THREE.AnimationAction | null>(null); // Current idle animation
	let talkingAction = $state<THREE.AnimationAction | null>(null); // Looping talking animation
	let talkingClip = $state<THREE.AnimationClip | null>(null); // Cached talking clip
	let emoteAction = $state<THREE.AnimationAction | null>(null); // One-shot emote animations
	let isEmotePlaying = $state(false); // True when an emote is playing (disables blinking)
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

	// === Blinking State ===
	let blinkTimer = $state(0);
	let nextBlinkTime = $state(Math.random() * 4 + 2); // 2-6 seconds
	let isBlinking = $state(false);
	let blinkProgress = $state(0);

	// === Breathing State ===
	let breathTime = $state(0);
	const BREATH_SPEED = 0.8; // cycles per second
	const BREATH_INTENSITY = 0.015; // subtle movement

	// === Eye Saccade State ===
	let saccadeTime = $state(0);
	let nextSaccadeIn = $state(1 + Math.random() * 2);
	let eyeTarget = $state({ x: 0, y: 0 });
	let currentEyeTarget = $state({ x: 0, y: 0 });

	// === Idle Face Animation State ===
	let idleFaceTime = $state(0);
	let headTime = $state(0);

	const { renderer, camera } = useThrelte();

	// Generate thumbnail from the current 3D render
	function generateThumbnail(modelId: string | null) {
		if (!renderer) return;

		const canvas = renderer.domElement;
		if (!canvas) return;

		const size = 256;
		const thumbCanvas = document.createElement('canvas');
		thumbCanvas.width = size;
		thumbCanvas.height = size;
		const ctx = thumbCanvas.getContext('2d');

		if (ctx) {
			const srcSize = Math.min(canvas.width, canvas.height);
			const srcX = (canvas.width - srcSize) / 2;
			const srcY = (canvas.height - srcSize) / 2;

			ctx.drawImage(canvas, srcX, srcY, srcSize, srcSize, 0, 0, size, size);

			const thumbnailDataUrl = thumbCanvas.toDataURL('image/png');
			vrmStore.setModelPreview(modelId, thumbnailDataUrl);
		}
	}

	// Normalize model orientation and position
	function normalizeModel(loadedVrm: VRM) {
		const scene = loadedVrm.scene;
		const version = loadedVrm.meta?.metaVersion === '1' ? '1' : '0';
		const config = VRM_POSE_CONFIG[version];

		// Apply version-specific scene rotation
		scene.rotation.y = config.sceneRotationY;

		// Calculate bounding box
		const box = new THREE.Box3().setFromObject(scene);
		const center = box.getCenter(new THREE.Vector3());

		// Center model at origin (X and Z)
		scene.position.x = -center.x;
		scene.position.z = -center.z;

		// Ground the model (feet at y=0)
		scene.position.y = -box.min.y;
	}

	// Set a natural idle pose (arms relaxed at sides)
	function setIdlePose(loadedVrm: VRM) {
		const humanoid = loadedVrm.humanoid;
		const version = loadedVrm.meta?.metaVersion === '1' ? '1' : '0';
		const config = VRM_POSE_CONFIG[version];

		// Get arm bones
		const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
		const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
		const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm');
		const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm');

		// Apply version-specific arm rotations
		if (leftUpperArm) {
			leftUpperArm.rotation.set(config.leftUpperArm.x, config.leftUpperArm.y, config.leftUpperArm.z);
		}
		if (rightUpperArm) {
			rightUpperArm.rotation.set(config.rightUpperArm.x, config.rightUpperArm.y, config.rightUpperArm.z);
		}
		if (leftLowerArm) {
			leftLowerArm.rotation.set(config.leftLowerArm.x, config.leftLowerArm.y, config.leftLowerArm.z);
		}
		if (rightLowerArm) {
			rightLowerArm.rotation.set(config.rightLowerArm.x, config.rightLowerArm.y, config.rightLowerArm.z);
		}
	}

	// Pick a random idle from the pool, excluding the last played one. Runs from
	// timers, so the pool is read untracked and a change lands on the next cycle.
	function pickRandomIdleUrl(): string | null {
		const urls = untrack(() => vrmStore.idleAnimationUrls);
		const choices = urls.length > 1 ? urls.filter((u) => u !== lastIdleUrl) : urls;
		lastIdleUrl = choices[Math.floor(Math.random() * choices.length)] ?? null;
		return lastIdleUrl;
	}

	// Idle animation cycling timer
	let idleCycleTimeout: ReturnType<typeof setTimeout> | null = null;

	// Load and start the looping idle animation
	function startIdleAnimation(targetVrm: VRM, targetMixer: THREE.AnimationMixer) {
		const idleUrl = pickRandomIdleUrl();
		if (!idleUrl) return;

		loadVrmAnimation(idleUrl)
			.then((vrmAnimation) => {
				// Model was swapped or unmounted while this animation loaded
				if (mixer !== targetMixer) return;

				const clip = createVRMAnimationClip(vrmAnimation, targetVrm);
				const action = targetMixer.clipAction(clip);
				action.setLoop(THREE.LoopRepeat, Infinity);
				action.play();
				// A model that finishes loading while photo mode is already open
				// holds its stance instead of idling through the shot
				if (photomodeStore.active) action.paused = true;
				idleAction = action;

				// Schedule next animation change
				scheduleIdleCycle(targetVrm, targetMixer, clip.duration);
			})
			.catch((error) => {
				console.error('Error loading idle animation:', error);
			});
	}

	// Schedule the next idle animation switch
	function scheduleIdleCycle(targetVrm: VRM, targetMixer: THREE.AnimationMixer, duration: number) {
		if (idleCycleTimeout) {
			clearTimeout(idleCycleTimeout);
		}
		// Switch after 1-2 full loops of the current animation
		const loops = 1 + Math.random();
		const delay = duration * loops * 1000;
		idleCycleTimeout = setTimeout(() => {
			if (!shouldTalk && !shouldThink && !isEmotePlaying && !photomodeStore.active) {
				playNextIdleAnimation(targetVrm, targetMixer);
			} else {
				// Retry later if we're busy (talking, thinking, emoting, or posing for a photo)
				scheduleIdleCycle(targetVrm, targetMixer, duration);
			}
		}, delay);
	}

	// Play the next random idle animation with smooth crossfade
	function playNextIdleAnimation(targetVrm: VRM, targetMixer: THREE.AnimationMixer) {
		const idleUrl = pickRandomIdleUrl();
		if (!idleUrl) return;

		loadVrmAnimation(idleUrl)
			.then((vrmAnimation) => {
				// Model was swapped or unmounted while this animation loaded
				if (mixer !== targetMixer) return;

				// Fade out current idle
				if (idleAction) {
					idleAction.fadeOut(1.2);
				}

				const clip = createVRMAnimationClip(vrmAnimation, targetVrm);
				const action = targetMixer.clipAction(clip);
				action.setLoop(THREE.LoopRepeat, Infinity);
				action.reset().fadeIn(1.2).play();
				idleAction = action;

				// Schedule next change
				scheduleIdleCycle(targetVrm, targetMixer, clip.duration);
			})
			.catch((error) => {
				console.error('Error loading idle animation:', error);
			});
	}

	// Load the talking animation clip (called once after model loads)
	function loadTalkingAnimation(targetVrm: VRM, targetMixer: THREE.AnimationMixer) {
		const talkingUrl = vrmStore.talkingAnimationUrl;
		if (!talkingUrl) return;

		loadVrmAnimation(talkingUrl)
			.then((vrmAnimation) => {
				// Model was swapped or unmounted while this animation loaded
				if (mixer !== targetMixer) return;

				talkingClip = createVRMAnimationClip(vrmAnimation, targetVrm);
			})
			.catch((error) => {
				console.error('Error loading talking animation:', error);
			});
	}

	// === Photo mode ===
	// A held pose is a single-frame clip: play, pause at t=0, and let the weight
	// crossfade do the transition. vrm.update() keeps running in the render task,
	// so spring bones and blinking stay alive while posed.
	let poseAction: THREE.AnimationAction | null = null;
	// Rapid pose taps race their async loads; only the latest application wins.
	let poseToken = 0;
	// Clips are per-model; caching them means repeat selections reuse the same
	// mixer action instead of accumulating new clips. Cleared on model switch.
	const poseClipCache = new Map<string, THREE.AnimationClip>();

	async function applyPhotoPose(poseId: string | null) {
		const targetVrm = vrm;
		const targetMixer = mixer;
		if (!targetVrm || !targetMixer) return;
		const token = ++poseToken;

		// A slower fade reads as easing into the pose rather than a hard cut
		const POSE_FADE = 0.6;

		if (poseId === null) {
			// Natural: fade any pose out and hold the idle stance
			if (poseAction) {
				poseAction.fadeOut(POSE_FADE);
				poseAction = null;
			}
			if (idleAction) {
				idleAction.reset().fadeIn(POSE_FADE).play();
				idleAction.paused = true;
			}
			return;
		}

		const manifest = await loadPoseManifest();
		const entry = manifest.find((p) => p.id === poseId);
		if (!entry) return;

		try {
			const animation = await loadPoseAnimation(entry.file);
			// Model swapped or a newer pose was requested while this one loaded
			if (mixer !== targetMixer || token !== poseToken) return;
			if (!photomodeStore.active) return;

			let clip = poseClipCache.get(poseId);
			if (!clip) {
				clip = createVRMAnimationClip(animation, targetVrm);
				poseClipCache.set(poseId, clip);
			}
			const previous = poseAction ?? idleAction;
			if (previous) previous.fadeOut(POSE_FADE);

			const action = targetMixer.clipAction(clip);
			action.reset();
			action.setLoop(THREE.LoopOnce, 1);
			action.clampWhenFinished = true;
			action.fadeIn(POSE_FADE).play();
			// Freeze at the clip's expressive moment (manifest hold, fraction of
			// duration). Frame zero is a neutral stance on most motion clips, which
			// made every placeholder pose look identical.
			action.paused = true;
			action.time = clip.duration * Math.min(Math.max(entry.hold ?? 0, 0), 0.99);
			poseAction = action;
		} catch (e) {
			console.error('[PhotoMode] Failed to apply pose:', e);
		}
	}

	// Enter/exit lifecycle: freeze the current stance on the way in, and re-run
	// the normal idle start path on the way out so cycling resumes cleanly.
	let wasPhotoActive = false;
	$effect(() => {
		const active = photomodeStore.active;
		untrack(() => {
			const targetVrm = vrm;
			const targetMixer = mixer;
			if (!targetVrm || !targetMixer) {
				wasPhotoActive = active;
				return;
			}
			if (active && !wasPhotoActive) {
				if (talkingAction) talkingAction.fadeOut(0.2);
				if (thinkingAction) {
					thinkingAction.fadeOut(0.2);
					thinkingAction = null;
				}
				if (idleAction) {
					// Ensure the idle actually holds weight (entering mid-talk left it
					// faded out), then freeze it as the held stance.
					idleAction.play();
					idleAction.fadeIn(0.2);
					idleAction.paused = true;
				}
			} else if (!active && wasPhotoActive) {
				if (poseAction) {
					poseAction.fadeOut(0.6);
					poseAction = null;
				}
				// Resume the frozen idle so the crossfade has live motion to blend
				// from, then hand back to the cycler, which fades it out against a
				// fresh idle clip and reschedules cycling. Starting a second idle at
				// full weight here (the old path) blended two idles at once and made
				// the resumed animation drift strangely. When TTS is still speaking,
				// the talking-switch effect fades the talking action back in instead;
				// starting an idle at the same time would blend both at half weight.
				// Thinking likewise restarts through its own effect.
				if (idleAction) idleAction.paused = false;
				if (!shouldTalk && !shouldThink) {
					playNextIdleAnimation(targetVrm, targetMixer);
				}
			}
			wasPhotoActive = active;
		});
	});

	// Apply pose selections while photo mode is active
	$effect(() => {
		const active = photomodeStore.active;
		const poseId = photomodeStore.selectedPoseId;
		if (!active) return;
		untrack(() => {
			// Entering starts on Natural, which the enter lifecycle already froze,
			// but the token still bumps so an in-flight pose load can't land stale
			if (poseId === null && !poseAction) {
				poseToken++;
				return;
			}
			applyPhotoPose(poseId);
		});
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
	// Pulses overlap instead of replacing each other (replacement snapped the
	// active nudge to zero, which read as a jump on rapid taps), and every
	// nudge applied to a bone is explicitly undone at the start of the next
	// frame, so nothing can accumulate no matter what the mixer weights are.
	interface ReactionPulse {
		bone: THREE.Object3D;
		t: number;
		duration: number;
		magnitude: number;
		direction: number;
	}
	let activePulses: ReactionPulse[] = [];
	let appliedNudges: Array<{ bone: THREE.Object3D; z: number; x: number }> = [];
	let reactionFace: { name: string; weight: number; t: number; duration: number } | null = null;
	// Mood face is the bottom layer: reactions, emotes, and held photo
	// expressions all win over it for the expression they touch
	let moodFace: { name: string; weight: number } | null = null;
	let emoteFace: string | null = null;
	// A reaction the model asked for, between the mood face and tap reactions.
	// holdUntil is fixed once the release starts so late speech can't pop it back.
	let flashFace: { name: string; weight: number; t: number; holdUntil: number | null } | null = null;
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

			const bone =
				request.zone === 'head' || request.zone === 'face'
					? targetVrm.humanoid.getNormalizedBoneNode('head')
					: request.zone === 'shoulder'
						? (targetVrm.humanoid.getNormalizedBoneNode('upperChest') ??
							targetVrm.humanoid.getNormalizedBoneNode('chest'))
						: request.zone === 'torso'
							? targetVrm.humanoid.getNormalizedBoneNode('spine')
							: targetVrm.humanoid.getNormalizedBoneNode('hips');
			const fallback = targetVrm.humanoid.getNormalizedBoneNode('spine');
			const target = bone ?? fallback;
			if (target && activePulses.length < 4) {
				// Half strength while she is talking: the head is already moving,
				// and a full kick layered on that read as a jump
				const talkScale = shouldTalk ? 0.5 : 1;
				activePulses.push({
					bone: target,
					t: 0,
					duration: 0.9,
					magnitude: spec.impulse * talkScale,
					direction: Math.random() > 0.5 ? 1 : -1
				});
			}
		});
	});

	$effect(() => {
		const request = vrmStore.flashRequest;
		if (!request) return;
		untrack(() => {
			// Same switch as the resting face; off means no automatic faces at all
			if (!displayStore.moodExpressions) return;
			const target = flashExpressionTarget(request.emotion, vrmStore.availableExpressions);
			if (!target) return;
			if (flashFace && flashFace.name !== target.name) {
				vrm?.expressionManager?.setValue(flashFace.name, 0);
			}
			flashFace = { name: target.name, weight: target.weight, t: 0, holdUntil: null };
		});
	});

	// Update lip-sync analyser when TTS state changes
	$effect(() => {
		lipSyncAnalyzer.setAnalyser(ttsStore.currentAnalyser);
	});

	// Switch between idle and talking animations based on speaking/talking state
	$effect(() => {
		const speaking = shouldTalk;
		const currentMixer = untrack(() => mixer);
		const currentIdleAction = untrack(() => idleAction);
		const currentTalkingClip = untrack(() => talkingClip);
		const currentEmotePlaying = untrack(() => isEmotePlaying);

		// Don't switch if emote is playing or no mixer/clips available. A held
		// photo pose must not be stomped by TTS either; exit restores the loop.
		if (!currentMixer || currentEmotePlaying || photomodeStore.active) return;

		if (speaking && currentTalkingClip) {
			// Start talking animation, fade out idle
			if (currentIdleAction) {
				currentIdleAction.fadeOut(0.3);
			}

			// Create and play talking action
			let currentTalkingAction = untrack(() => talkingAction);
			if (!currentTalkingAction) {
				currentTalkingAction = currentMixer.clipAction(currentTalkingClip);
				currentTalkingAction.setLoop(THREE.LoopRepeat, Infinity);
				talkingAction = currentTalkingAction;
			}
			currentTalkingAction.reset().fadeIn(0.3).play();

		} else if (!speaking) {
			// Stop talking, resume idle animation
			const currentTalkingAction = untrack(() => talkingAction);
			if (currentTalkingAction) {
				currentTalkingAction.fadeOut(0.3);
			}

			// Resume the current idle action
			if (currentIdleAction) {
				currentIdleAction.reset().fadeIn(0.3).play();
			}

		}
	});

	// Thinking: loops the user's pick while the reply is on its way. Same fades
	// as talking; if talking starts, the effect above takes over the idle.
	let thinkingAction: THREE.AnimationAction | null = null;
	let thinkingClip: { url: string; clip: THREE.AnimationClip } | null = null;
	let thinkingToken = 0;
	$effect(() => {
		const think = shouldThink;
		if (photomodeStore.active) return;
		untrack(() => {
			const targetVrm = vrm;
			const targetMixer = mixer;
			const url = animationLibraryStore.thinkingUrl;
			if (!targetVrm || !targetMixer || isEmotePlaying) return;

			if (!think) {
				thinkingToken++;
				if (!thinkingAction) return;
				thinkingAction.fadeOut(0.3);
				thinkingAction = null;
				if (!shouldTalk && idleAction) idleAction.reset().fadeIn(0.3).play();
				return;
			}
			if (thinkingAction || !url) return;

			const token = ++thinkingToken;
			const cached = thinkingClip?.url === url ? thinkingClip.clip : null;
			const clipReady = cached
				? Promise.resolve(cached)
				: loadVrmAnimation(url).then((anim) => createVRMAnimationClip(anim, targetVrm));
			clipReady
				.then((clip) => {
					// Model swapped, thinking ended, or something else took the stage
					if (mixer !== targetMixer || token !== thinkingToken) return;
					if (!shouldThink || isEmotePlaying || photomodeStore.active) return;
					thinkingClip = { url, clip };
					if (idleAction) idleAction.fadeOut(0.3);
					const action = targetMixer.clipAction(clip);
					action.setLoop(THREE.LoopRepeat, Infinity);
					action.reset().fadeIn(0.3).play();
					thinkingAction = action;
				})
				.catch((error) => {
					console.debug('[VrmModel] thinking clip failed to load, staying idle:', error);
				});
		});
	});

	// Flips once per model, when its first idle clip is running. An emote asked
	// for before that (Play from settings lands here mid-load) waits for it
	// instead of being dropped or blending with the idle as it fades in.
	const idleReady = $derived(idleAction !== null);

	// Play emote animations when currentAnimation changes
	$effect(() => {
		const animId = currentAnimation;
		if (!idleReady) return;
		const currentVrm = untrack(() => vrm);
		const currentMixer = untrack(() => mixer);
		const currentIdleAction = untrack(() => idleAction);

		if (!currentVrm || !currentMixer) return;

		// Stop any current emote
		const prevEmote = untrack(() => emoteAction);
		if (prevEmote) {
			prevEmote.fadeOut(0.3);
		}

		// If no emote selected, just ensure idle is playing
		if (!animId) {
			isEmotePlaying = false;
			emoteAction = null;
			if (currentIdleAction && !currentIdleAction.isRunning()) {
				currentIdleAction.reset().fadeIn(0.3).play();
			}
			return;
		}

		// Find the emote animation
		// Untracked: editing a description must not restart the emote
		const animationData = untrack(() =>
			vrmStore.availableAnimations.find((a) => a.url === animId || a.id === animId)
		);
		if (!animationData?.url) {
			// Deleted or unknown; don't leave a stale request blocking the next one
			vrmStore.setCurrentAnimation(null);
			return;
		}

		// Load emote VRMA file
		loadVrmAnimation(animationData.url)
			.then((vrmAnimation) => {
				untrack(() => {
					if (!vrm || !mixer) return;

					// Fade out idle animation
					const currentIdle = idleAction;
					if (currentIdle) {
						currentIdle.fadeOut(0.2);
					}

					// Create and play emote
					const clip = createVRMAnimationClip(vrmAnimation, vrm);
					const action = mixer.clipAction(clip);
					action.setLoop(THREE.LoopOnce, 1);
					action.clampWhenFinished = true;
					action.timeScale = 1.5;
					action.reset().fadeIn(0.2).play();
					emoteAction = action;
					isEmotePlaying = true;

					// Apply happy expression during emote
					const happyExpr = findHappyExpression(vrm);
					if (happyExpr) {
						vrm.expressionManager?.setValue(happyExpr, 0.7);
						emoteFace = happyExpr;
					}

					// When emote finishes, return to idle
					const capturedMixer = mixer;
					const capturedVrm = vrm;
					const capturedIdleAction = currentIdle;
					const onFinished = (e: { action: THREE.AnimationAction }) => {
						if (e.action === action) {
							capturedMixer.removeEventListener('finished', onFinished);
							isEmotePlaying = false;
							emoteAction = null;

							// Clear happy expression
							if (happyExpr) {
								capturedVrm.expressionManager?.setValue(happyExpr, 0);
							}
							emoteFace = null;

							// Resume idle animation
							if (capturedIdleAction) {
								capturedIdleAction.reset().fadeIn(0.3).play();
							}

							vrmStore.setCurrentAnimation(null);
						}
					};
					capturedMixer.addEventListener('finished', onFinished);
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

		// Capture the model this load belongs to, so a fast switch can't save this
		// render under a different model's id.
		const loadModelId = vrmStore.activeModelId;

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

				// Normalize model orientation and position
				normalizeModel(loadedVrm);

				// Set a natural idle pose (arms down instead of T-pose)
				setIdlePose(loadedVrm);

				// Capture this rig's authored spring values before `vrm` flips the
				// physics-intensity effect, so it applies over fresh bases.
				snapshotSpringBase(loadedVrm);

				vrm = loadedVrm;
				group = loadedVrm.scene;
				const newMixer = new THREE.AnimationMixer(loadedVrm.scene);
				mixer = newMixer;
				vrmStore.setVrm(loadedVrm);
				vrmStore.setLoading(false);

				// Start the looping idle animation
				startIdleAnimation(loadedVrm, newMixer);

				// Pre-load the talking animation
				loadTalkingAnimation(loadedVrm, newMixer);

				// Extract thumbnail from VRM metadata (supports both 0.x and 1.0)
				let thumbnailImage: HTMLImageElement | undefined;

				if (loadedVrm.meta) {
					if (loadedVrm.meta.metaVersion === '1') {
						// VRM 1.0: thumbnailImage is HTMLImageElement
						thumbnailImage = (loadedVrm.meta as any).thumbnailImage;
					} else {
						// VRM 0.x: texture contains the image
						const texture = (loadedVrm.meta as any).texture;
						if (texture?.image) {
							thumbnailImage = texture.image;
						}
					}
				}

				if (thumbnailImage) {
					try {
						const canvas = document.createElement('canvas');
						const width = thumbnailImage.width || (thumbnailImage as any).naturalWidth || 256;
						const height = thumbnailImage.height || (thumbnailImage as any).naturalHeight || 256;
						canvas.width = width;
						canvas.height = height;
						const ctx = canvas.getContext('2d');
						if (ctx) {
							ctx.drawImage(thumbnailImage as CanvasImageSource, 0, 0);
							const thumbnailDataUrl = canvas.toDataURL('image/png');
							vrmStore.setModelPreview(loadModelId, thumbnailDataUrl);
						}
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
			if (idleCycleTimeout) {
				clearTimeout(idleCycleTimeout);
				idleCycleTimeout = null;
			}
			if (mixer) {
				mixer.stopAllAction();
				mixer = null;
				idleAction = null;
				talkingAction = null;
				talkingClip = null;
				emoteAction = null;
			}
			thinkingAction = null;
			thinkingClip = null;
			thinkingToken++;
			// If an emote was mid-play, its 'finished' handler (bound to the old
			// mixer) never runs, so reset the flags it would have cleared —
			// otherwise currentAnimation stays stale and the next model can
			// immediately replay the leftover emote.
			if (isEmotePlaying) {
				isEmotePlaying = false;
				vrmStore.setCurrentAnimation(null);
			}
			if (vrm) {
				// Frees geometries, materials, and textures (manual traverse missed textures)
				VRMUtils.deepDispose(vrm.scene);
				vrmStore.setVrm(null);
				vrm = null;
				group = null;
				springBase = [];
				poseAction = null;
				poseClipCache.clear();
				activePulses = [];
				appliedNudges = [];
				reactionFace = null;
				heldExpression = null;
				moodFace = null;
				emoteFace = null;
				flashFace = null;
			}
		};
	});

	// Scratch vectors reused every frame — allocating three Vector3s per frame
	// (~180/sec) was needless GC pressure in the render loop.
	const scratchWorld = new THREE.Vector3();
	const scratchProjected = new THREE.Vector3();

	// === Photo-mode head tracking ===
	// Weight eases in/out so toggling never snaps the neck. The look rotation
	// is slerped over whatever the animation wrote this frame, clamped to a
	// natural range. Normalized humanoid bones face +Z in every VRM version.
	let headTrackWeight = 0;
	const headWorld = new THREE.Vector3();
	const camWorld = new THREE.Vector3();
	// Camera jiggle: orbiting excites the spring bones via a damped nudge on
	// the chest and head; the rig's own springs do the visible swinging
	const jiggleCamPos = new THREE.Vector3();
	const jiggleModelPos = new THREE.Vector3();
	let jiggleState = createJiggleState();
	let prevCamAngles: CameraAngles | null = null;
	const lookDir = new THREE.Vector3();
	const parentQuat = new THREE.Quaternion();
	const lookQuat = new THREE.Quaternion();
	const lookEuler = new THREE.Euler();

	// Update VRM each frame
	useTask((delta) => {
		if (!vrm) return;

		// Undo last frame's tap nudges before anything writes bones this frame.
		// When the mixer overwrites the rotation anyway this is a no-op; when it
		// does not, this is what makes accumulation impossible.
		for (const applied of appliedNudges) {
			applied.bone.rotation.z -= applied.z;
			applied.bone.rotation.x -= applied.x;
		}
		appliedNudges.length = 0;

		// Update animation mixer
		mixer?.update(delta);

		// Tap reactions: decaying additive nudges layered over whatever the
		// mixer wrote, rendered this frame (so the body sways with the physics
		// instead of the solver and the render disagreeing, which read as
		// jitter during talking). Overlapping pulses sum; each bone's total is
		// recorded for the undo above.
		if (activePulses.length > 0) {
			const remaining: ReactionPulse[] = [];
			for (const pulse of activePulses) {
				pulse.t += delta;
				const progress = pulse.t / pulse.duration;
				if (progress >= 1) continue;
				// sin^2 has zero slope at both ends: eases in and out
				const wave = Math.sin(progress * Math.PI);
				const envelope = wave * wave * Math.exp(-1.6 * progress);
				const angle = pulse.magnitude * 0.07 * envelope;
				const z = angle * pulse.direction;
				const x = -angle * 0.4;
				pulse.bone.rotation.z += z;
				pulse.bone.rotation.x += x;
				appliedNudges.push({ bone: pulse.bone, z, x });
				remaining.push(pulse);
			}
			activePulses = remaining;
		}

		// Camera-driven jiggle: measure orbit velocity and advance the damped
		// spring. The offsets are applied around vrm.update() further down, so
		// only the spring bones see the movement, never the rendered skeleton.
		{
			camera.current.getWorldPosition(jiggleCamPos);
			vrm.scene.getWorldPosition(jiggleModelPos);
			const angles = cameraAngles(jiggleCamPos, jiggleModelPos);
			if (prevCamAngles && delta > 0) {
				const vel = angularVelocity(prevCamAngles, angles, delta);
				jiggleState = stepJiggle(jiggleState, vel, displayStore.physicsIntensity, delta);
			}
			prevCamAngles = angles;
		}

		if (reactionFace && vrm.expressionManager) {
			reactionFace.t += delta;
			const progress = reactionFace.t / reactionFace.duration;
			const em = vrm.expressionManager;
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

		// Photo-mode head tracking toward the scene camera
		const trackTarget = photomodeStore.active && photomodeStore.headTracking ? 1 : 0;
		headTrackWeight += (trackTarget - headTrackWeight) * Math.min(1, delta * 5);
		if (headTrackWeight > 0.001 && camera.current) {
			const head = vrm.humanoid.getNormalizedBoneNode('head');
			if (head?.parent) {
				head.getWorldPosition(headWorld);
				camera.current.getWorldPosition(camWorld);
				lookDir.subVectors(camWorld, headWorld);
				head.parent.getWorldQuaternion(parentQuat).invert();
				lookDir.applyQuaternion(parentQuat).normalize();
				// VRM 0.x rigs face -Z where 1.0 faces +Z (the same split
				// VRM_POSE_CONFIG handles for the scene), so the whole look
				// direction mirrors on v0 models: horizontal AND vertical
				if (vrm.meta?.metaVersion !== '1') {
					lookDir.negate();
				}
				const yaw = THREE.MathUtils.clamp(Math.atan2(lookDir.x, lookDir.z), -0.65, 0.65);
				// Asymmetric pitch range: looking up reads charming well past where
				// looking down starts to double the chin. The wide bound is chosen
				// by world-space geometry (is the camera above her head), which is
				// immune to the v0/v1 sign-convention differences.
				const rawPitch = -Math.asin(THREE.MathUtils.clamp(lookDir.y, -1, 1));
				const pitchLimit = camWorld.y >= headWorld.y ? 0.85 : 0.32;
				const pitch = THREE.MathUtils.clamp(rawPitch, -pitchLimit, pitchLimit);
				lookEuler.set(pitch, yaw, 0, 'YXZ');
				lookQuat.setFromEuler(lookEuler);
				head.quaternion.slerp(lookQuat, headTrackWeight);
			}
		}

		// Camera jiggle, phase 1: displace the chest and head so the spring
		// solver inside vrm.update() reads their movement and swings hair,
		// clothes, and accessories accordingly.
		const jiggleActive =
			Math.abs(jiggleState.yaw) > 1e-5 || Math.abs(jiggleState.pitch) > 1e-5;
		let jiggleChest: THREE.Object3D | null = null;
		let jiggleHead: THREE.Object3D | null = null;
		if (jiggleActive) {
			jiggleChest =
				vrm.humanoid.getNormalizedBoneNode('upperChest') ??
				vrm.humanoid.getNormalizedBoneNode('chest') ??
				vrm.humanoid.getNormalizedBoneNode('spine');
			jiggleHead = vrm.humanoid.getNormalizedBoneNode('head');
			if (jiggleChest) {
				jiggleChest.rotation.z += jiggleState.yaw * 0.8;
				jiggleChest.rotation.y += jiggleState.yaw * 0.4;
				jiggleChest.rotation.x += jiggleState.pitch;
			}
			if (jiggleHead) {
				jiggleHead.rotation.z += jiggleState.yaw * 0.45;
				jiggleHead.rotation.y += jiggleState.yaw * 0.25;
				jiggleHead.rotation.x += jiggleState.pitch * 0.5;
			}
		}

		// Update VRM core. The delta is clamped because a huge frame gap (tab
		// refocus, window drag) otherwise launches the spring bones violently.
		vrm.update(clampFrameDelta(delta));

		// Camera jiggle, phase 2: put the skeleton straight back. The solver
		// already sampled the displaced pose; re-syncing the humanoid pushes
		// the rest pose back onto the raw render skeleton (vrm.update copied
		// the displaced one), so the body stays planted while only the spring
		// bones carry the motion.
		if (jiggleActive) {
			if (jiggleChest) {
				jiggleChest.rotation.z -= jiggleState.yaw * 0.8;
				jiggleChest.rotation.y -= jiggleState.yaw * 0.4;
				jiggleChest.rotation.x -= jiggleState.pitch;
			}
			if (jiggleHead) {
				jiggleHead.rotation.z -= jiggleState.yaw * 0.45;
				jiggleHead.rotation.y -= jiggleState.yaw * 0.25;
				jiggleHead.rotation.x -= jiggleState.pitch * 0.5;
			}
			if (jiggleChest || jiggleHead) vrm.humanoid.update();
		}

		// Track head position for 3D speech bubble
		const headBone = vrm.humanoid.getNormalizedBoneNode('head');
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

		const expressionManager = vrm.expressionManager;
		if (!expressionManager) return;

		// Helper to set expression (silently ignores if not found)
		const setExpression = (name: string, value: number) => {
			try {
				expressionManager.setValue(name, value);
			} catch {
				// Expression doesn't exist on this model
			}
		};

		// === Mood face ===
		// Swapping expressions fades the old one fully out before the new one
		// starts, so two moods never blend into a muddled face
		const moodGoal = isEmotePlaying ? null : moodTarget;
		const moodStep = Math.min(1, delta * 1.5);
		if (moodFace && moodFace.name !== moodGoal?.name) {
			moodFace.weight -= moodFace.weight * moodStep;
			if (moodFace.weight < 0.01) moodFace.weight = 0;
		} else if (moodGoal) {
			moodFace ??= { name: moodGoal.name, weight: 0 };
			moodFace.weight += (moodGoal.weight - moodFace.weight) * moodStep;
		}
		if (moodFace) {
			const name = moodFace.name;
			if (heldExpression !== name && emoteFace !== name) {
				// A tap reaction on the same expression rides on top of the mood
				// instead of dipping it to zero and popping back afterwards
				const floor = reactionFace?.name === name ? (expressionManager.getValue(name) ?? 0) : 0;
				setExpression(name, Math.max(floor, moodFace.weight));
			}
			if (moodFace.weight === 0) moodFace = null;
		}

		// === Flash face ===
		// Attack 0.25s, hold 2.5s (longer while she speaks, up to 8s), release 0.8s
		if (flashFace) {
			const flash = flashFace;
			const name = flash.name;
			const owned = heldExpression === name || emoteFace === name || reactionFace?.name === name;
			if (photomodeStore.active) {
				if (heldExpression !== name) setExpression(name, 0);
				flashFace = null;
			} else {
				flash.t += delta;
				if (flash.holdUntil === null) {
					const holdEnd = ttsStore.isSpeaking ? Math.min(8, Math.max(2.5, flash.t + 0.01)) : 2.5;
					if (flash.t >= holdEnd) flash.holdUntil = flash.t;
				}
				const shape =
					flash.holdUntil === null ? Math.min(1, flash.t / 0.25) : 1 - (flash.t - flash.holdUntil) / 0.8;
				if (shape <= 0) {
					if (!owned && moodFace?.name !== name) setExpression(name, 0);
					flashFace = null;
				} else if (!owned) {
					// Never dip the resting face on the same expression
					setExpression(name, Math.max(moodFace?.name === name ? moodFace.weight : 0, flash.weight * shape));
				}
			}
		}

		// === Blinking Animation (runs during idle, disabled during emotes) ===
		if (!isEmotePlaying) {
			blinkTimer += delta;

			if (!isBlinking && blinkTimer >= nextBlinkTime) {
				// Start blink
				isBlinking = true;
				blinkProgress = 0;
			}

			if (isBlinking) {
				blinkProgress += delta * 8; // Blink duration ~0.125s

				// Asymmetric blink curve: quick close (30%), slow open (70%)
				let blinkValue: number;
				if (blinkProgress < 0.3) {
					// Quick close
					blinkValue = blinkProgress / 0.3;
				} else {
					// Slow open
					blinkValue = 1 - (blinkProgress - 0.3) / 0.7;
				}

				const finalBlinkValue = Math.max(0, blinkValue);

				if (blinkProgress >= 1) {
					// End blink
					isBlinking = false;
					blinkTimer = 0;
					nextBlinkTime = Math.random() * 4 + 2; // Random 2-6 seconds
					// Try all blink expression variants
					setExpression('blink', 0);
					setExpression('Blink', 0);
					setExpression('eyeBlinkLeft', 0);
					setExpression('eyeBlinkRight', 0);
				} else {
					// Try all blink expression variants
					setExpression('blink', finalBlinkValue);
					setExpression('Blink', finalBlinkValue);
					setExpression('eyeBlinkLeft', finalBlinkValue);
					setExpression('eyeBlinkRight', finalBlinkValue);
				}
			}
		}

		// Apply expression changes
		expressionManager.update();

		// === Lip-sync Animation ===
		const visemes = lipSyncAnalyzer.update(delta);

		// Apply viseme weights - try multiple naming conventions
		// VRM 1.0 style
		setExpression('aa', visemes.aa);
		setExpression('ee', visemes.ee);
		setExpression('ih', visemes.ih);
		setExpression('oh', visemes.oh);
		setExpression('ou', visemes.ou);
		// VRM 0.x style
		setExpression('a', visemes.aa);
		setExpression('i', visemes.ih);
		setExpression('u', visemes.ou);
		setExpression('e', visemes.ee);
		setExpression('o', visemes.oh);
		// ARKit style (jawOpen for mouth)
		setExpression('jawOpen', visemes.aa * 0.7);
	});
</script>

{#if group}
	<T is={group} />
{/if}

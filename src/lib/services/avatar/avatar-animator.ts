import * as THREE from 'three';

export interface AnimatorHooks {
	loadClip(url: string): Promise<THREE.AnimationClip>;
	// hold is the fraction of the clip to freeze on
	loadPose(poseId: string): Promise<{ clip: THREE.AnimationClip; hold: number } | null>;
	pickIdleUrl(): string | null;
	isTalking(): boolean;
	isThinking(): boolean;
	isPhotoActive(): boolean;
	onIdleReady(): void;
}

// A slower fade reads as easing into the pose rather than a hard cut
const POSE_FADE = 0.6;

// One per loaded model. Async steps check `disposed` so a load that lands
// after a model switch can't touch the new model's mixer.
export class AvatarAnimator {
	readonly mixer: THREE.AnimationMixer;
	idle: THREE.AnimationAction | null = null;
	talking: THREE.AnimationAction | null = null;
	thinking: THREE.AnimationAction | null = null;
	emote: THREE.AnimationAction | null = null;
	pose: THREE.AnimationAction | null = null;
	emotePlaying = false;

	private talkingClip: THREE.AnimationClip | null = null;
	private thinkingClip: { url: string; clip: THREE.AnimationClip } | null = null;
	private thinkingToken = 0;
	// Rapid pose taps race their async loads; only the latest application wins
	private poseToken = 0;
	private idleCycle: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;

	hooks: AnimatorHooks;

	constructor(root: THREE.Object3D, hooks: AnimatorHooks) {
		this.mixer = new THREE.AnimationMixer(root);
		this.hooks = hooks;
	}

	start(talkingUrl: string | null) {
		this.loadIdle(false);
		if (!talkingUrl) return;
		this.hooks
			.loadClip(talkingUrl)
			.then((clip) => {
				if (!this.disposed) this.talkingClip = clip;
			})
			.catch((error) => console.error('Error loading talking animation:', error));
	}

	playNextIdle() {
		this.loadIdle(true);
	}

	private loadIdle(crossfade: boolean) {
		const url = this.hooks.pickIdleUrl();
		if (!url) return;
		this.hooks
			.loadClip(url)
			.then((clip) => {
				if (this.disposed) return;
				const action = this.mixer.clipAction(clip);
				action.setLoop(THREE.LoopRepeat, Infinity);
				if (crossfade) {
					this.idle?.fadeOut(1.2);
					action.reset().fadeIn(1.2).play();
				} else {
					action.play();
					// A model that finishes loading while photo mode is already open
					// holds its stance instead of idling through the shot
					if (this.hooks.isPhotoActive()) action.paused = true;
				}
				this.idle = action;
				this.hooks.onIdleReady();
				this.scheduleIdleCycle(clip.duration);
			})
			.catch((error) => console.error('Error loading idle animation:', error));
	}

	// Switch after 1-2 full loops; retry later while anything else has the stage
	private scheduleIdleCycle(duration: number) {
		if (this.idleCycle) clearTimeout(this.idleCycle);
		const delay = duration * (1 + Math.random()) * 1000;
		this.idleCycle = setTimeout(() => {
			const busy =
				this.hooks.isTalking() || this.hooks.isThinking() || this.emotePlaying || this.hooks.isPhotoActive();
			if (busy) this.scheduleIdleCycle(duration);
			else this.playNextIdle();
		}, delay);
	}

	setTalking(speaking: boolean) {
		if (speaking && this.talkingClip) {
			this.idle?.fadeOut(0.3);
			if (!this.talking) {
				this.talking = this.mixer.clipAction(this.talkingClip);
				this.talking.setLoop(THREE.LoopRepeat, Infinity);
			}
			this.talking.reset().fadeIn(0.3).play();
		} else if (!speaking) {
			this.talking?.fadeOut(0.3);
			this.idle?.reset().fadeIn(0.3).play();
		}
	}

	startThinking(url: string) {
		if (this.thinking) return;
		const token = ++this.thinkingToken;
		const cached = this.thinkingClip?.url === url ? this.thinkingClip.clip : null;
		(cached ? Promise.resolve(cached) : this.hooks.loadClip(url))
			.then((clip) => {
				// Model swapped, thinking ended, or something else took the stage
				if (this.disposed || token !== this.thinkingToken) return;
				if (!this.hooks.isThinking() || this.emotePlaying || this.hooks.isPhotoActive()) return;
				this.thinkingClip = { url, clip };
				this.idle?.fadeOut(0.3);
				const action = this.mixer.clipAction(clip);
				action.setLoop(THREE.LoopRepeat, Infinity);
				action.reset().fadeIn(0.3).play();
				this.thinking = action;
			})
			.catch((error) => {
				console.debug('[VrmModel] thinking clip failed to load, staying idle:', error);
			});
	}

	stopThinking(resumeIdle: boolean) {
		this.thinkingToken++;
		if (!this.thinking) return;
		this.thinking.fadeOut(0.3);
		this.thinking = null;
		if (resumeIdle) this.idle?.reset().fadeIn(0.3).play();
	}

	stopEmote() {
		this.emote?.fadeOut(0.3);
	}

	// No emote requested: make sure the idle is running
	clearEmote() {
		this.emotePlaying = false;
		this.emote = null;
		if (this.idle && !this.idle.isRunning()) this.idle.reset().fadeIn(0.3).play();
	}

	playEmote(clip: THREE.AnimationClip, onFinished: () => void) {
		const idle = this.idle;
		idle?.fadeOut(0.2);
		const action = this.mixer.clipAction(clip);
		action.setLoop(THREE.LoopOnce, 1);
		action.clampWhenFinished = true;
		action.timeScale = 1.5;
		action.reset().fadeIn(0.2).play();
		this.emote = action;
		this.emotePlaying = true;

		const mixer = this.mixer;
		const onDone = (e: { action: THREE.AnimationAction }) => {
			if (e.action !== action) return;
			mixer.removeEventListener('finished', onDone);
			this.emotePlaying = false;
			this.emote = null;
			// clampWhenFinished keeps the last frame at full weight; release it
			// or the idle blends against it and the arms hang between poses
			action.fadeOut(0.3);
			idle?.reset().fadeIn(0.3).play();
			onFinished();
		};
		mixer.addEventListener('finished', onDone);
	}

	// Freeze the current stance on the way in
	enterPhoto() {
		this.talking?.fadeOut(0.2);
		if (this.thinking) {
			this.thinking.fadeOut(0.2);
			this.thinking = null;
		}
		if (this.idle) {
			// Entering mid-talk left the idle faded out; give it weight, then hold it
			this.idle.play();
			this.idle.fadeIn(0.2);
			this.idle.paused = true;
		}
	}

	// Resume the frozen idle so the crossfade has live motion to blend from,
	// then hand back to the cycler. Skip that when talking or thinking will
	// take the stage through their own paths, or two clips blend at half weight.
	exitPhoto(resumeIdle: boolean) {
		if (this.pose) {
			this.pose.fadeOut(POSE_FADE);
			this.pose = null;
		}
		if (this.idle) this.idle.paused = false;
		if (resumeIdle) this.playNextIdle();
	}

	selectPose(poseId: string | null) {
		// Natural on entry is already frozen, but the token still bumps so an
		// in-flight pose load can't land stale
		if (poseId === null && !this.pose) {
			this.poseToken++;
			return;
		}
		void this.applyPose(poseId);
	}

	// A held pose is a single-frame clip: play, pause, and let the weight
	// crossfade do the transition
	private async applyPose(poseId: string | null) {
		const token = ++this.poseToken;
		if (poseId === null) {
			if (this.pose) {
				this.pose.fadeOut(POSE_FADE);
				this.pose = null;
			}
			if (this.idle) {
				this.idle.reset().fadeIn(POSE_FADE).play();
				this.idle.paused = true;
			}
			return;
		}

		let loaded: Awaited<ReturnType<AnimatorHooks['loadPose']>>;
		try {
			loaded = await this.hooks.loadPose(poseId);
		} catch (e) {
			console.error('[PhotoMode] Failed to apply pose:', e);
			return;
		}
		if (!loaded || this.disposed || token !== this.poseToken) return;
		if (!this.hooks.isPhotoActive()) return;

		const { clip, hold } = loaded;
		(this.pose ?? this.idle)?.fadeOut(POSE_FADE);
		const action = this.mixer.clipAction(clip);
		action.reset();
		action.setLoop(THREE.LoopOnce, 1);
		action.clampWhenFinished = true;
		action.fadeIn(POSE_FADE).play();
		// Freeze at the clip's expressive moment; frame zero is a neutral
		// stance on most motion clips
		action.paused = true;
		action.time = clip.duration * Math.min(Math.max(hold, 0), 0.99);
		this.pose = action;
	}

	update(delta: number) {
		this.mixer.update(delta);
	}

	dispose() {
		this.disposed = true;
		if (this.idleCycle) clearTimeout(this.idleCycle);
		this.idleCycle = null;
		this.mixer.stopAllAction();
	}
}

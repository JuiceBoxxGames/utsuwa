import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { TouchZone } from '$lib/engine/photo-reactions';
import {
	cameraAngles,
	angularVelocity,
	stepJiggle,
	createJiggleState,
	type CameraAngles
} from '$lib/engine/camera-impulse';

interface ReactionPulse {
	bone: THREE.Object3D;
	t: number;
	duration: number;
	magnitude: number;
	direction: number;
}

// Bone motion layered over the animation each frame: tap nudges, camera
// jiggle for the spring bones, and photo-mode head tracking.
export class BodyMotion {
	// Tap pulses overlap instead of replacing each other (replacement snapped
	// the active nudge to zero, which read as a jump on rapid taps), and every
	// nudge applied to a bone is explicitly undone at the start of the next
	// frame, so nothing can accumulate no matter what the mixer weights are.
	private pulses: ReactionPulse[] = [];
	private nudges: Array<{ bone: THREE.Object3D; z: number; x: number }> = [];

	// Camera jiggle: orbiting excites the spring bones via a damped nudge on
	// the chest and head; the rig's own springs do the visible swinging
	private jiggle = createJiggleState();
	private prevCamAngles: CameraAngles | null = null;
	private readonly jiggleCamPos = new THREE.Vector3();
	private readonly jiggleModelPos = new THREE.Vector3();

	// Head tracking weight eases in/out so toggling never snaps the neck
	private headTrackWeight = 0;
	private readonly headWorld = new THREE.Vector3();
	private readonly camWorld = new THREE.Vector3();
	private readonly lookDir = new THREE.Vector3();
	private readonly parentQuat = new THREE.Quaternion();
	private readonly lookQuat = new THREE.Quaternion();
	private readonly lookEuler = new THREE.Euler();

	tap(vrm: VRM, zone: TouchZone, magnitude: number) {
		const humanoid = vrm.humanoid;
		const bone =
			zone === 'head' || zone === 'face'
				? humanoid.getNormalizedBoneNode('head')
				: zone === 'shoulder'
					? (humanoid.getNormalizedBoneNode('upperChest') ?? humanoid.getNormalizedBoneNode('chest'))
					: zone === 'torso'
						? humanoid.getNormalizedBoneNode('spine')
						: humanoid.getNormalizedBoneNode('hips');
		const target = bone ?? humanoid.getNormalizedBoneNode('spine');
		if (target && this.pulses.length < 4) {
			this.pulses.push({
				bone: target,
				t: 0,
				duration: 0.9,
				magnitude,
				direction: Math.random() > 0.5 ? 1 : -1
			});
		}
	}

	clearTaps() {
		this.pulses = [];
		this.nudges = [];
	}

	// Undo last frame's tap nudges before anything writes bones this frame.
	// When the mixer overwrites the rotation anyway this is a no-op; when it
	// does not, this is what makes accumulation impossible.
	beginFrame() {
		for (const applied of this.nudges) {
			applied.bone.rotation.z -= applied.z;
			applied.bone.rotation.x -= applied.x;
		}
		this.nudges.length = 0;
	}

	// Runs after the mixer. Tap nudges are decaying additive rotations over
	// whatever the mixer wrote, rendered this frame (so the body sways with
	// the physics instead of the solver and the render disagreeing, which
	// read as jitter during talking). Overlapping pulses sum; each bone's
	// total is recorded for the undo above. Camera orbit velocity then
	// advances the jiggle spring, applied around vrm.update() later.
	afterMixer(vrm: VRM, camera: THREE.Camera, delta: number, physicsIntensity: number) {
		if (this.pulses.length > 0) {
			const remaining: ReactionPulse[] = [];
			for (const pulse of this.pulses) {
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
				this.nudges.push({ bone: pulse.bone, z, x });
				remaining.push(pulse);
			}
			this.pulses = remaining;
		}

		camera.getWorldPosition(this.jiggleCamPos);
		vrm.scene.getWorldPosition(this.jiggleModelPos);
		const angles = cameraAngles(this.jiggleCamPos, this.jiggleModelPos);
		if (this.prevCamAngles && delta > 0) {
			const vel = angularVelocity(this.prevCamAngles, angles, delta);
			this.jiggle = stepJiggle(this.jiggle, vel, physicsIntensity, delta);
		}
		this.prevCamAngles = angles;
	}

	// The look rotation is slerped over whatever the animation wrote this
	// frame, clamped to a natural range. Normalized humanoid bones face +Z in
	// every VRM version.
	trackHead(vrm: VRM, camera: THREE.Camera | undefined, active: boolean, delta: number) {
		const trackTarget = active ? 1 : 0;
		this.headTrackWeight += (trackTarget - this.headTrackWeight) * Math.min(1, delta * 5);
		if (!(this.headTrackWeight > 0.001 && camera)) return;
		const head = vrm.humanoid.getNormalizedBoneNode('head');
		if (!head?.parent) return;
		const { headWorld, camWorld, lookDir } = this;
		head.getWorldPosition(headWorld);
		camera.getWorldPosition(camWorld);
		lookDir.subVectors(camWorld, headWorld);
		head.parent.getWorldQuaternion(this.parentQuat).invert();
		lookDir.applyQuaternion(this.parentQuat).normalize();
		// VRM 0.x rigs face -Z where 1.0 faces +Z (the same split the pose
		// config handles for the scene), so the whole look direction mirrors
		// on v0 models: horizontal AND vertical
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
		this.lookEuler.set(pitch, yaw, 0, 'YXZ');
		this.lookQuat.setFromEuler(this.lookEuler);
		head.quaternion.slerp(this.lookQuat, this.headTrackWeight);
	}

	// Phase 1 displaces the chest and head so the spring solver inside
	// `update` reads their movement and swings hair, clothes, and accessories.
	// Phase 2 puts the skeleton straight back: re-syncing the humanoid pushes
	// the rest pose back onto the raw render skeleton (vrm.update copied the
	// displaced one), so the body stays planted while only the springs move.
	updateWithJiggle(vrm: VRM, update: () => void) {
		const { yaw, pitch } = this.jiggle;
		const active = Math.abs(yaw) > 1e-5 || Math.abs(pitch) > 1e-5;
		let chest: THREE.Object3D | null = null;
		let head: THREE.Object3D | null = null;
		if (active) {
			chest =
				vrm.humanoid.getNormalizedBoneNode('upperChest') ??
				vrm.humanoid.getNormalizedBoneNode('chest') ??
				vrm.humanoid.getNormalizedBoneNode('spine');
			head = vrm.humanoid.getNormalizedBoneNode('head');
			if (chest) {
				chest.rotation.z += yaw * 0.8;
				chest.rotation.y += yaw * 0.4;
				chest.rotation.x += pitch;
			}
			if (head) {
				head.rotation.z += yaw * 0.45;
				head.rotation.y += yaw * 0.25;
				head.rotation.x += pitch * 0.5;
			}
		}

		update();

		if (active) {
			if (chest) {
				chest.rotation.z -= yaw * 0.8;
				chest.rotation.y -= yaw * 0.4;
				chest.rotation.x -= pitch;
			}
			if (head) {
				head.rotation.z -= yaw * 0.45;
				head.rotation.y -= yaw * 0.25;
				head.rotation.x -= pitch * 0.5;
			}
			if (chest || head) vrm.humanoid.update();
		}
	}
}

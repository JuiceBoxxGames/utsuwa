import type { VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';
import type { SpringJointParams } from '$lib/engine/spring-physics';

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

const poseConfig = (vrm: VRM) => VRM_POSE_CONFIG[vrm.meta?.metaVersion === '1' ? '1' : '0'];

// Face the camera, center on X/Z, feet at y=0
export function normalizeModel(vrm: VRM) {
	const scene = vrm.scene;
	scene.rotation.y = poseConfig(vrm).sceneRotationY;
	const box = new THREE.Box3().setFromObject(scene);
	const center = box.getCenter(new THREE.Vector3());
	scene.position.x = -center.x;
	scene.position.z = -center.z;
	scene.position.y = -box.min.y;
}

// Arms relaxed at the sides instead of a T-pose
export function setIdlePose(vrm: VRM) {
	const config = poseConfig(vrm);
	for (const bone of ['leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm'] as const) {
		const r = config[bone];
		vrm.humanoid.getNormalizedBoneNode(bone)?.rotation.set(r.x, r.y, r.z);
	}
}

export interface SpringBase {
	settings: { stiffness: number; gravityPower: number; dragForce: number };
	base: SpringJointParams;
}

// Authored per-joint values captured at load. The intensity setting always
// multiplies these bases (never the current values), so re-applying is
// idempotent and a model switch starts clean from its own rig tuning.
export function snapshotSpringBase(vrm: VRM): SpringBase[] {
	const joints = vrm.springBoneManager?.joints;
	if (!joints) return [];
	return [...joints].map((joint) => ({
		settings: joint.settings,
		base: {
			stiffness: joint.settings.stiffness,
			gravityPower: joint.settings.gravityPower,
			dragForce: joint.settings.dragForce
		}
	}));
}

// The model's own preview image: VRM 1.0 carries an image, 0.x a texture
export function embeddedThumbnail(vrm: VRM): HTMLImageElement | undefined {
	const meta = vrm.meta;
	if (!meta) return undefined;
	if (meta.metaVersion === '1') return meta.thumbnailImage;
	return meta.texture?.image as HTMLImageElement | undefined;
}

// Throws when the image can't be read back (tainted canvas)
export function imageToDataUrl(image: HTMLImageElement): string | null {
	const canvas = document.createElement('canvas');
	canvas.width = image.width || image.naturalWidth || 256;
	canvas.height = image.height || image.naturalHeight || 256;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(image, 0, 0);
	return canvas.toDataURL('image/png');
}

// Center square of the live render, scaled to 256px
export function renderThumbnail(source: HTMLCanvasElement): string | null {
	const size = 256;
	const thumb = document.createElement('canvas');
	thumb.width = size;
	thumb.height = size;
	const ctx = thumb.getContext('2d');
	if (!ctx) return null;
	const srcSize = Math.min(source.width, source.height);
	const srcX = (source.width - srcSize) / 2;
	const srcY = (source.height - srcSize) / 2;
	ctx.drawImage(source, srcX, srcY, srcSize, srcSize, 0, 0, size, size);
	return thumb.toDataURL('image/png');
}

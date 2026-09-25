import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import {
	WebGLRenderer,
	Scene,
	PerspectiveCamera,
	AmbientLight,
	DirectionalLight,
	Box3,
	Vector3
} from 'three';

// dispose() alone keeps the WebGL context alive until GC; without forcing the
// loss, generating thumbnails for many models can hit the browser's live
// context cap and kill the main scene's context
function disposeRenderer(renderer: WebGLRenderer) {
	renderer.dispose();
	renderer.forceContextLoss();
}

function disposeVrm(vrm: VRM, scene: Scene) {
	vrm.scene.traverse((obj: any) => {
		if (obj.geometry?.dispose) obj.geometry.dispose();
		if (obj.material) {
			const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
			materials.forEach((mat: any) => {
				if (mat?.map?.dispose) mat.map.dispose();
				mat?.dispose?.();
			});
		}
	});
	scene.remove(vrm.scene);
}

// Same source as VrmModel: VRM 1.0 exposes an HTMLImageElement, 0.x a texture
function getEmbeddedThumbnail(vrm: VRM): HTMLImageElement | undefined {
	if (!vrm.meta) return undefined;
	if (vrm.meta.metaVersion === '1') {
		return (vrm.meta as any).thumbnailImage;
	}
	return (vrm.meta as any).texture?.image;
}

function embeddedThumbnailToDataUrl(image: HTMLImageElement): string | null {
	try {
		const canvas = document.createElement('canvas');
		canvas.width = image.width || (image as any).naturalWidth || 256;
		canvas.height = image.height || (image as any).naturalHeight || 256;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(image, 0, 0);
		return canvas.toDataURL('image/png');
	} catch {
		return null;
	}
}

// Drop the arms from the T-pose so fallback renders look natural
function applyRelaxedPose(vrm: VRM) {
	const isV1 = vrm.meta?.metaVersion === '1';
	const armZ = Math.PI * 0.4;
	const left = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
	const right = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
	if (left) left.rotation.z = isV1 ? -armZ : armZ;
	if (right) right.rotation.z = isV1 ? armZ : -armZ;
	vrm.humanoid?.update();
}

/**
 * Generate a thumbnail for a VRM model. Prefers the model's embedded meta
 * thumbnail (the same image the main scene uses) so previews stay consistent;
 * falls back to rendering the model in a relaxed pose offscreen.
 */
export async function generateVrmThumbnail(url: string): Promise<string | null> {
	const loader = new GLTFLoader();
	loader.crossOrigin = 'anonymous';
	loader.register((parser) => {
		const plugin = new VRMLoaderPlugin(parser);
		if (plugin.metaPlugin) {
			plugin.metaPlugin.needThumbnailImage = true;
		}
		return plugin;
	});

	return new Promise((resolve) => {
		loader.load(
			url,
			(gltf) => {
				const vrm = gltf.userData.vrm as VRM;

				// Embedded thumbnail needs no rendering at all
				const embedded = getEmbeddedThumbnail(vrm);
				if (embedded) {
					const dataUrl = embeddedThumbnailToDataUrl(embedded);
					if (dataUrl) {
						const scratch = new Scene();
						scratch.add(vrm.scene);
						disposeVrm(vrm, scratch);
						resolve(dataUrl);
						return;
					}
				}

				// Fallback: offscreen render in a relaxed pose
				const canvas = document.createElement('canvas');
				canvas.width = 512;
				canvas.height = 512;

				const renderer = new WebGLRenderer({
					canvas,
					alpha: true,
					antialias: true,
					preserveDrawingBuffer: true
				});
				renderer.setSize(canvas.width, canvas.height, false);
				renderer.setPixelRatio(1);

				const scene = new Scene();
				const camera = new PerspectiveCamera(35, 1, 0.01, 100);
				scene.add(new AmbientLight(0xffffff, 0.8));
				const directionalLight = new DirectionalLight(0xffffff, 0.8);
				directionalLight.position.set(1, 1, 1);
				scene.add(directionalLight);

				try {
					VRMUtils.removeUnnecessaryVertices(vrm.scene);
					VRMUtils.removeUnnecessaryJoints(vrm.scene);

					applyRelaxedPose(vrm);

					// VRM 0.x models face away from +Z; 1.0 models already face the camera
					if (vrm.meta?.metaVersion !== '1') {
						vrm.scene.rotation.y = Math.PI;
					}

					scene.add(vrm.scene);

					// Calculate bounding box and position camera
					const box = new Box3().setFromObject(vrm.scene);
					const center = box.getCenter(new Vector3());
					const size = box.getSize(new Vector3());

					// Position camera to frame the upper body/face
					const headY = center.y + size.y * 0.25;
					camera.position.set(0, headY, size.z * 2);
					camera.lookAt(0, headY, 0);
					camera.updateProjectionMatrix();

					renderer.render(scene, camera);
					const dataUrl = canvas.toDataURL('image/png');

					disposeVrm(vrm, scene);
					disposeRenderer(renderer);
					resolve(dataUrl);
				} catch (e) {
					console.error('Error generating thumbnail:', e);
					disposeRenderer(renderer);
					resolve(null);
				}
			},
			undefined,
			(error) => {
				console.error('Error loading VRM for thumbnail:', error);
				resolve(null);
			}
		);
	});
}

/**
 * Pre-generate thumbnails for all models that don't have one yet.
 */
export async function preGenerateThumbnails(
	models: Array<{ id: string; url: string; previewUrl?: string }>,
	onThumbnailGenerated: (modelId: string, dataUrl: string) => void
): Promise<void> {
	for (const model of models) {
		// Skip if already has a preview
		if (model.previewUrl) continue;

		const thumbnail = await generateVrmThumbnail(model.url);
		if (thumbnail) {
			onThumbnailGenerated(model.id, thumbnail);
		}
	}
}

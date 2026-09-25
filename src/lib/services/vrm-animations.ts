import type { VRMAnimation } from '@pixiv/three-vrm-animation';

// Animation files are small, fixed, and requested over and over: the idle cycle
// alone was refetching the same five .vrma files thousands of times a day, which
// made them roughly half of the app's edge requests. Cache the parsed
// VRMAnimation per URL. Clips stay uncached because createVRMAnimationClip binds
// them to a specific VRM, so callers build their own against whichever model is
// loaded.
//
// Deliberately not THREE.Cache: that is global, so it would also pin every 15MB
// .vrm model and every revoked blob: URL in memory for the life of the page.

export type VrmAnimationFetcher = (url: string) => Promise<VRMAnimation>;

const cache = new Map<string, Promise<VRMAnimation>>();

// Loaders import lazily so stores that only evict (settings pages) don't pull in three.
async function loadFromNetwork(url: string): Promise<VRMAnimation> {
	const [{ GLTFLoader }, { VRMAnimationLoaderPlugin }] = await Promise.all([
		import('three/addons/loaders/GLTFLoader.js'),
		import('@pixiv/three-vrm-animation')
	]);
	return new Promise<VRMAnimation>((resolve, reject) => {
		const loader = new GLTFLoader();
		loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
		loader.load(
			url,
			(gltf) => {
				const anims: VRMAnimation[] | undefined = gltf.userData.vrmAnimations;
				if (anims && anims.length > 0) {
					resolve(anims[0]);
				} else {
					reject(new Error(`No VRM animation in ${url}`));
				}
			},
			undefined,
			(error) => reject(error)
		);
	});
}

/**
 * Load a .vrma and reuse it for every later request of the same URL.
 * `fetcher` exists so tests can run without a real loader.
 */
export function loadVrmAnimation(
	url: string,
	fetcher: VrmAnimationFetcher = loadFromNetwork
): Promise<VRMAnimation> {
	let cached = cache.get(url);
	if (!cached) {
		cached = fetcher(url);
		// A transient failure must not poison the URL for the rest of the session.
		// The no-op catch also keeps a fire-and-forget caller from tripping an
		// unhandled rejection warning.
		cached.catch(() => cache.delete(url));
		cache.set(url, cached);
	}
	return cached;
}

/** Drop every cached animation. Used by tests. */
export function clearVrmAnimationCache(): void {
	cache.clear();
}

/** Forget one URL, e.g. a deleted custom animation's revoked blob: URL. */
export function evictVrmAnimation(url: string): void {
	cache.delete(url);
}

import type { VRMAnimation } from '@pixiv/three-vrm-animation';
// Relative so the node test runner can load this module
import { evictVrmAnimation, loadVrmAnimation } from '../vrm-animations.ts';

export const MAX_ANIMATION_BYTES = 25 * 1024 * 1024;
export const MAX_ANIMATION_SECONDS = 60;

// Browsers have no MIME type for .vrma, so an untyped file gets through here
// and the real check is parsing it
export function checkAnimationFile(file: { name: string; size: number; type: string }): void {
	if (!/\.vrma$/i.test(file.name) && file.type !== '') {
		throw new Error('That file is not a .vrma animation.');
	}
	if (file.size === 0) throw new Error('That file is empty.');
	if (file.size > MAX_ANIMATION_BYTES) throw new Error('That animation is over 25 MB.');
}

/**
 * Parse the blob with the real loader and hand back the object URL it is
 * cached under. The caller owns the URL; on rejection it is already revoked.
 */
export async function parseAnimationBlob(
	blob: Blob,
	fetcher?: (url: string) => Promise<VRMAnimation>
): Promise<{ url: string; durationSec: number }> {
	const url = URL.createObjectURL(blob);
	const discard = () => {
		evictVrmAnimation(url);
		URL.revokeObjectURL(url);
	};
	const animation = await loadVrmAnimation(url, fetcher).catch(() => null);
	if (!animation || !(animation.duration > 0)) {
		discard();
		throw new Error("That file couldn't be read as a VRM animation.");
	}
	if (animation.duration > MAX_ANIMATION_SECONDS) {
		discard();
		throw new Error(`Animations can run up to ${MAX_ANIMATION_SECONDS} seconds. Trim it and try again.`);
	}
	return { url, durationSec: Math.round(animation.duration * 10) / 10 };
}

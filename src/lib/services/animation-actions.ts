import { animationLibraryStore } from '$lib/stores/animation-library.svelte';
import { vrmStore } from '$lib/stores/vrm.svelte';
import { photomodeStore } from '$lib/stores/photomode.svelte';
import { resolveAction } from '$lib/engine/action-gate';

// Glue between the library and the vrm store, which imports the library and so
// can't be imported back from it.

// Session only: a reload resets the cooldowns
const lastFired = new Map<string, number>();
let lastAnyFired = -Infinity;

/** Play an animation the model asked for, if the gate and the scene allow it. */
export function requestAvatarAction(id: string): boolean {
	// Photo mode and an emote already running both win
	if (photomodeStore.active || vrmStore.currentAnimation) return false;
	const now = Date.now();
	const hit = resolveAction(id, now, {
		enabled: animationLibraryStore.enabledForLlm,
		lastFired,
		lastAnyFired
	});
	if (!hit) return false;
	lastFired.set(id, now);
	lastAnyFired = now;
	vrmStore.setCurrentAnimation(hit.url);
	return true;
}

/** Delete a custom animation, stopping it first if it is on screen. */
export async function removeAnimation(id: string): Promise<void> {
	const entry = animationLibraryStore.get(id);
	if (entry && vrmStore.currentAnimation === entry.url) vrmStore.setCurrentAnimation(null);
	await animationLibraryStore.remove(id);
}

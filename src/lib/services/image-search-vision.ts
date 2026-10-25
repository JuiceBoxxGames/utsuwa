/**
 * Presentation-side vision pass for the picture popup. Kept separate from the
 * search core so the core never depends on the Svelte store.
 */
import { imageSearchStore } from '$lib/stores/image-search.svelte';
import { resolveVisionLLM, visionModelEnabled } from '$lib/services/llm/active-llm';
import { streamChat } from '$lib/services/llm/transport';
import { describeImagesRequest } from '$lib/services/chat/turn-context';
import { stripThinkingBlocks } from '$lib/services/tts/chat-text';
import { fetchImage } from '$lib/services/image-search';

// Latest describe call wins; an older in-flight call must not overwrite it.
let describeSeq = 0;

/**
 * Describe the picture currently in focus with the separate vision model, so
 * the companion can talk about what is actually on screen. No-op without a
 * vision model or a file-fetch tool. Safe to call on every focus change.
 */
export async function describeFocusedImage(): Promise<void> {
	if (!visionModelEnabled()) return;
	const index = imageSearchStore.focusedIndex;
	const result = imageSearchStore.results[index];
	if (!result) return;
	const vision = resolveVisionLLM();
	if (!vision) return;

	const seq = ++describeSeq;
	const image = await fetchImage(result.url);
	if (!image || seq !== describeSeq) return;
	try {
		const request = describeImagesRequest('', [{ mimeType: image.mimeType, base64: image.data }]);
		const description = await streamChat(
			{
				...vision,
				messages: [{ role: 'user', content: request.content }],
				systemPrompt: request.system,
				// Same drift guard as the user-photo vision path.
				...(vision.isLocal && { temperature: 0 })
			},
			() => {}
		);
		const clean = stripThinkingBlocks(description).trim();
		// Only apply when this is still the focused picture of the same show.
		if (
			seq !== describeSeq ||
			!clean ||
			!imageSearchStore.isOpen ||
			imageSearchStore.focusedIndex !== index ||
			imageSearchStore.results[index]?.url !== result.url
		) {
			return;
		}
		imageSearchStore.setDescription(clean);
	} catch {
		// A failed description is non-fatal; the popup still shows the picture.
	}
}

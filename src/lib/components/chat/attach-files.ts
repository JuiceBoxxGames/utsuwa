import { prepareImage, UnsupportedImageError } from '$lib/services/storage/keepsakes';
import { chatDraftStore } from '$lib/stores/chat-draft.svelte';
import { chatHintStore } from '$lib/stores/chat-hint.svelte';

export const IMAGE_MIME: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	heic: 'image/heic',
	heif: 'image/heif',
	bmp: 'image/bmp'
};

export function imageMimeFromPath(path: string): string | null {
	return IMAGE_MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

export function showVisionHint() {
	chatHintStore.showHint(
		"This model can't see images. Pick a vision model (GPT-4o, Claude, Gemini, DeepSeek Flash, or a local one like llava), or turn on a separate vision model in Settings > LLM Model."
	);
}

/**
 * Queue dropped or picked files onto the shared draft. Non-images are
 * skipped; failures surface as hints. Shared by the picker (ChatInput) and
 * both drag-drop paths (BottomChatBar).
 */
export async function queueFiles(files: FileList | File[] | null, visionCapable: boolean) {
	if (!files) return;
	if (!visionCapable) {
		showVisionHint();
		return;
	}
	for (const file of Array.from(files)) {
		if (!file.type.startsWith('image/')) continue;
		try {
			const image = await prepareImage(file);
			chatDraftStore.addPending(image, URL.createObjectURL(file));
			chatHintStore.requestPrivacyNotice();
		} catch (e) {
			chatHintStore.showHint(
				e instanceof UnsupportedImageError
					? "That image format isn't supported. Try a JPEG, PNG, GIF or WebP (iPhone HEIC photos won't work)."
					: "Couldn't read that image. Try a different one."
			);
		}
	}
}

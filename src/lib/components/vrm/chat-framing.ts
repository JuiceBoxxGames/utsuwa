import type { PerspectiveCamera } from 'three';

export interface ChatFrame {
	width: number;
	height: number;
	left: boolean;
}

// Keep the character's framing in the uncovered area while rendering the
// same camera view beyond that area, behind the translucent chat panel.
export function applyChatFraming(
	camera: PerspectiveCamera,
	viewport: { width: number; height: number },
	frame?: ChatFrame
) {
	const { width, height } = viewport;
	if (width <= 0 || height <= 0) return;
	if (
		frame &&
		frame.width > 0 &&
		frame.height > 0 &&
		(frame.width < width || frame.height < height)
	) {
		const w = Math.min(frame.width, width);
		const h = Math.min(frame.height, height);
		camera.setViewOffset(w, h, frame.left ? w - width : 0, 0, width, height);
	} else {
		camera.aspect = width / height;
		camera.clearViewOffset();
	}
}

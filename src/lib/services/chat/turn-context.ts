// Message shaping for a companion turn. Store-free so it stays testable; the
// caller passes the chat history in.
import type { ContentPart } from './content.ts';
import type { OpenAiToolCall } from '../mcp/loop.ts';
import type { PreparedImage } from '../storage/keepsakes.ts';
import type { ConsciousnessSettings } from '../modules/settings.ts';
import { STATE_FENCE_OPEN } from '../../ai/response-parser.ts';
import { stripThinkingBlocks } from '../../ai/thinking-blocks.ts';

/** Message shape used by the chat loop; extends the plain history with the
 *  tool-role entries the MCP loop appends between rounds. */
export interface ChatLoopMessage {
	role: 'user' | 'assistant' | 'tool';
	content: string | ContentPart[];
	tool_calls?: OpenAiToolCall[];
	tool_call_id?: string;
}

interface HistoryMessage {
	role: string;
	content: string;
	images?: readonly unknown[];
}

type ImageBytes = Pick<PreparedImage, 'mimeType' | 'base64'>;

const imageParts = (images: ImageBytes[]): ContentPart[] =>
	images.map((img) => ({ type: 'image', mimeType: img.mimeType, data: img.base64 }));

// The current turn carries the image bytes; prior turns stay text. Empty
// messages are dropped (the assistant placeholder, and any stray blank turn)
// so we never send an empty message. With imageDescription (a separate vision
// model already looked), the current turn sends that text instead of the bytes.
export function buildMessages(history: HistoryMessage[], images: ImageBytes[], imageDescription?: string): ChatLoopMessage[] {
	const sent = history.filter((m) => m.content || m.images?.length);
	return sent.map((m, idx) => {
		const role = m.role as 'user' | 'assistant';
		const isCurrentTurn = idx === sent.length - 1 && images.length > 0;
		if (!isCurrentTurn) return { role, content: m.content };
		if (imageDescription !== undefined) {
			const shown = images.length === 1 ? 'an image. What it shows' : `${images.length} images. What they show`;
			const note = `[They showed you ${shown}: ${stripThinkingBlocks(imageDescription).trim()}]`;
			return { role, content: m.content ? `${m.content}\n\n${note}` : note };
		}
		const parts: ContentPart[] = [];
		if (m.content) parts.push({ type: 'text', text: m.content });
		return { role, content: [...parts, ...imageParts(images)] };
	});
}

const DESCRIBE_IMAGES_SYSTEM = `You describe images for a companion character who can't see them and will react to your description.
Describe what is actually visible, plainly and specifically: the main subject, any people and their expressions, animals, the setting, readable text, colors, and the overall mood.
With several images, describe each one in order, numbered.
No guessing beyond what is visible, no commentary, no advice. Plain text, under 150 words per image.`;

/** The one-shot request a separate vision model gets for this turn's images. */
export function describeImagesRequest(userMessage: string, images: ImageBytes[]) {
	const text = userMessage.trim()
		? `Their message, for context: ${userMessage.trim()}`
		: `Describe the ${images.length === 1 ? 'image' : 'images'}.`;
	return {
		system: DESCRIBE_IMAGES_SYSTEM,
		content: [{ type: 'text', text } as ContentPart, ...imageParts(images)]
	};
}

/** Keep native dialogue (speech tool pseudo-calls) before the state fence. */
export function withNativeContent(content: string, native: string): string {
	if (!native) return content;
	const fenceIndex = content.search(STATE_FENCE_OPEN);
	const insertAt = fenceIndex === -1 ? content.length : fenceIndex;
	return content.slice(0, insertAt) + '\n' + native + content.slice(insertAt);
}

/** Advanced parameters are only supported for OpenAI-compatible endpoints. */
export function buildAdvancedParams(custom: boolean | undefined, settings: ConsciousnessSettings) {
	return custom
		? {
				temperature: settings.temperature,
				topP: settings.topP,
				maxTokens: settings.maxTokens || undefined,
				presencePenalty: settings.presencePenalty,
				frequencyPenalty: settings.frequencyPenalty
			}
		: {};
}

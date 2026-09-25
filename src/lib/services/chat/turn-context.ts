// Message shaping for a companion turn. Store-free so it stays testable; the
// caller passes the chat history in.
import type { ContentPart } from './content.ts';
import type { OpenAiToolCall } from '../mcp/loop.ts';
import type { PreparedImage } from '../storage/keepsakes.ts';
import type { ConsciousnessSettings } from '../modules/settings.ts';
import { STATE_FENCE_OPEN } from '../../ai/response-parser.ts';

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

// The current turn carries the image bytes; prior turns stay text. Empty
// messages are dropped (the assistant placeholder, and any stray blank turn)
// so we never send an empty message.
export function buildMessages(history: HistoryMessage[], images: Pick<PreparedImage, 'mimeType' | 'base64'>[]): ChatLoopMessage[] {
	const sent = history.filter((m) => m.content || m.images?.length);
	return sent.map((m, idx) => {
		const isCurrentTurn = idx === sent.length - 1 && images.length > 0;
		if (!isCurrentTurn) {
			return { role: m.role as 'user' | 'assistant', content: m.content };
		}
		const parts: ContentPart[] = [];
		if (m.content) parts.push({ type: 'text', text: m.content });
		for (const img of images) {
			parts.push({ type: 'image', mimeType: img.mimeType, data: img.base64 });
		}
		return { role: m.role as 'user' | 'assistant', content: parts };
	});
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

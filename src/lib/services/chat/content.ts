// Multimodal message content. A message is either plain text or a mix of text
// and images ("things she's been shown"). Images are kept as raw base64 plus a
// mime type; the per-provider converters add whatever envelope each API wants.

export interface TextPart {
	type: 'text';
	text: string;
}

export interface ImagePart {
	type: 'image';
	mimeType: string; // e.g. 'image/png'
	data: string; // raw base64, no data: prefix
}

export type ContentPart = TextPart | ImagePart;

/** A message's content: plain text, or a mix of text and images. */
export type MessageContent = string | ContentPart[];

export function hasImages(content: MessageContent): boolean {
	return Array.isArray(content) && content.some((p) => p.type === 'image');
}

type OpenAIContentPart =
	| { type: 'text'; text: string }
	| { type: 'image_url'; image_url: { url: string } };

/** OpenAI-compatible content (also used by Ollama, LM Studio, xAI, Google's OpenAI endpoint). */
export function toOpenAIContent(content: MessageContent): string | OpenAIContentPart[] {
	if (typeof content === 'string') return content;
	return content.map((part) =>
		part.type === 'text'
			? { type: 'text' as const, text: part.text }
			: {
					type: 'image_url' as const,
					image_url: { url: `data:${part.mimeType};base64,${part.data}` }
				}
	);
}

type AnthropicContentPart =
	| { type: 'text'; text: string }
	| { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/** Anthropic Messages API content blocks. */
export function toAnthropicContent(content: MessageContent): string | AnthropicContentPart[] {
	if (typeof content === 'string') return content;
	return content.map((part) =>
		part.type === 'text'
			? { type: 'text' as const, text: part.text }
			: {
					type: 'image' as const,
					source: { type: 'base64' as const, media_type: part.mimeType, data: part.data }
				}
	);
}

/**
 * Tool-call delta aggregation for OpenAI-compatible streams. Streamed calls
 * arrive split across chunks (id/name first, arguments in fragments), so the
 * transport buffers them per index and emits each call once complete.
 */
export interface ToolCallBuffer {
	id: string;
	name: string;
	args: string;
}

export type ToolCallHandler = (
	name: string,
	args: Record<string, unknown>,
	id: string
) => void;

/**
 * Emit every buffered tool call after the stream ended. A no-arg tool streams
 * an empty argument string (or none at all) — that is a valid `{}`, not a
 * reason to drop the call. Malformed argument JSON is skipped.
 */
export function emitToolCalls(
	buffers: Map<number, ToolCallBuffer>,
	onToolCall?: ToolCallHandler
): void {
	if (!onToolCall) return;
	for (const [index, buf] of buffers) {
		if (!buf.name) continue;
		try {
			onToolCall(buf.name, buf.args ? JSON.parse(buf.args) : {}, buf.id || `call_${index}`);
		} catch {
			// Skip malformed tool call arguments
		}
	}
}

import type { ImageSearchToolSelection } from '$lib/types/mcp';

/** Parse the persisted picture-tool choice; invalid JSON returns null. */
export function parseImageSearchTool(raw: string | null): ImageSearchToolSelection | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<ImageSearchToolSelection>;
		return typeof parsed.serverId === 'string' && typeof parsed.toolName === 'string'
			? { serverId: parsed.serverId, toolName: parsed.toolName }
			: null;
	} catch {
		return null;
	}
}

/** Serialize the picture-tool choice; null removes the key. */
export function serializeImageSearchTool(next: ImageSearchToolSelection | null): string | null {
	return next ? JSON.stringify({ serverId: next.serverId, toolName: next.toolName }) : null;
}

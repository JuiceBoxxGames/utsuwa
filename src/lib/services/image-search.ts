/**
 * Companion picture search (app-driven).
 *
 * The model only supplies a query in its state JSON. This module runs the
 * configured MCP search tool, turns its result into structured picture data
 * and publishes a platform/window-independent event. Presentation lives in the
 * image-search store and modal; no store is touched here.
 */
import { mcpStore } from '$lib/stores/mcp.svelte';
import { callTool } from '$lib/services/mcp/capability';
import type { McpTool } from '$lib/types/mcp';
import { isRasterImageDataUrl } from '$lib/utils/image-mime';
import { assertSafeFetchUrl } from '$lib/services/providers/url-guard';
import {
	chooseImageSearchTool,
	parseImageResults,
	queryArgKey,
	toDataUrl,
	type ImageSearchResult
} from '$lib/utils/image-search';
import {
	newImageEventId,
	publishImageShowEvent,
	type ImageSearchErrorCode,
	type ImageSearchToolInfo
} from './image-search/events';

/** MCP tool name used to fetch a single image (the filefetcher server). */
export const IMAGE_FETCH_TOOL = 'fetch_file_from_url';

/** Largest edge requested from the file-fetch tool. */
const IMAGE_FETCH_MAX_DIMENSION = 1280;

/** True when MCP is available, so the companion can advertise pictures. */
export function isShowImagesEnabled(): boolean {
	return mcpStore.serverEnabled && mcpStore.enabledServers.length > 0;
}

export function hasConfiguredImageSearchTool(): boolean {
	return chooseImageSearchTool(mcpStore.tools, mcpStore.imageSearchTool).tool !== null;
}

/** Arguments a search tool understands: query plus only declared options. */
export function buildSearchArgs(tool: McpTool, query: string, page = 1): Record<string, unknown> {
	const props = tool.inputSchema?.properties ?? {};
	const args: Record<string, unknown> = {};
	args[queryArgKey(tool) ?? 'query'] = query;
	if ('categories' in props) args.categories = 'images';
	if ('result_detail' in props) args.result_detail = 'full';
	if ('response_format' in props) args.response_format = 'json';
	else if ('format' in props && !('result_detail' in props)) args.format = 'json';
	if (page > 1) {
		if ('pageno' in props) args.pageno = page;
		else if ('page' in props) args.page = page;
		else if ('page_number' in props) args.page_number = page;
	}
	return args;
}

function errorMessage(code: ImageSearchErrorCode): string {
	switch (code) {
		case 'no_tool':
			return 'No picture search tool configured';
		case 'tool_unavailable':
			return 'The selected picture search tool is unavailable';
		case 'empty_results':
			return 'No pictures found';
		case 'cancelled':
			return 'Picture search cancelled';
		default:
			return 'Search failed';
	}
}

function toolInfo(tool: McpTool): ImageSearchToolInfo {
	return { serverId: tool.serverId, serverName: tool.serverName, toolName: tool.name };
}

function publishError(
	requestId: string,
	query: string,
	code: ImageSearchErrorCode,
	detail?: string
): void {
	const base = errorMessage(code);
	const safeDetail = detail?.trim().slice(0, 240);
	const message = safeDetail ? `${base}: ${safeDetail}` : base;
	publishImageShowEvent({
		id: newImageEventId(),
		at: Date.now(),
		type: 'error',
		requestId,
		query,
		code,
		message
	});
}

/**
 * Resolve a query through the configured MCP search tool. Never throws;
 * failure is published as an event so the UI cannot silently do nothing.
 */
export async function searchImages(query: string, page = 1): Promise<ImageSearchResult[]> {
	const cleanQuery = query.trim();
	if (!cleanQuery) return [];
	const safePage = Number.isFinite(page) ? Math.max(1, Math.min(10, Math.floor(page))) : 1;
	const requestId = newImageEventId();

	publishImageShowEvent({
		id: newImageEventId(),
		at: Date.now(),
		type: 'loading',
		requestId,
		query: cleanQuery,
		page: safePage
	});

	try {
		await mcpStore.ensureTools();
	} catch (err) {
		publishError(requestId, cleanQuery, 'search_failed', err instanceof Error ? err.message : String(err));
		return [];
	}

	if (mcpStore.toolsError && mcpStore.tools.length === 0) {
		publishError(requestId, cleanQuery, 'search_failed', mcpStore.toolsError);
		return [];
	}

	const choice = chooseImageSearchTool(mcpStore.tools, mcpStore.imageSearchTool);
	if (!choice.tool) {
		publishError(requestId, cleanQuery, choice.error ?? 'no_tool');
		return [];
	}
	const tool = choice.tool;
	const server = mcpStore.servers.find((entry) => entry.id === tool.serverId && entry.enabled);
	if (!server) {
		publishError(requestId, cleanQuery, 'tool_unavailable');
		return [];
	}

	const args = buildSearchArgs(tool, cleanQuery, safePage);
	try {
		if (server.askBeforeRun !== false) {
			let confirmed = false;
			try {
				confirmed = await mcpStore.confirmToolCall({
					serverName: server.name,
					toolName: tool.name,
					args
				});
			} catch {
				confirmed = false;
			}
			if (!confirmed) {
				publishError(requestId, cleanQuery, 'cancelled');
				return [];
			}
		}
		const result = await callTool(server, tool.name, args);
		if (result.isError) {
			publishError(requestId, cleanQuery, 'search_failed', result.content);
			return [];
		}
		const images = parseImageResults(result.content, result.images);
		if (!images.length) {
			publishError(requestId, cleanQuery, 'empty_results', result.content.slice(0, 500));
			return [];
		}
		publishImageShowEvent({
			id: newImageEventId(),
			at: Date.now(),
			type: 'results',
			requestId,
			query: cleanQuery,
			page: safePage,
			results: images,
			tool: toolInfo(tool)
		});
		return images;
	} catch (err) {
		publishError(requestId, cleanQuery, 'search_failed', err instanceof Error ? err.message : String(err));
		return [];
	}
}

/** Close the popup in every window. */
export function closeImages(): void {
	publishImageShowEvent({
		id: newImageEventId(),
		at: Date.now(),
		type: 'close'
	});
}

export class ImageFetchCancelled extends Error {
	constructor() {
		super('Picture fetch cancelled');
	}
}

export interface FetchImageOptions {
	/** Ask once for user-initiated open/download; thumbnail prefetch stays off. */
	confirm?: boolean;
}

/**
 * Fetch one image through an enabled MCP `fetch_file_from_url` tool. Returns
 * the base64 image block, or null when no tool is configured, the host is
 * blocked, or the fetch fails. With `confirm: true` a server that asks before
 * running tools prompts once.
 *
 * @throws ImageFetchCancelled when the user declines that prompt.
 */
export async function fetchImage(
	url: string,
	options: FetchImageOptions = {}
): Promise<{ mimeType: string; data: string } | null> {
	if (!url) return null;
	try {
		assertSafeFetchUrl(url, true);
	} catch {
		return null;
	}
	try {
		await mcpStore.ensureTools();
	} catch {
		// Discovery failure must not break the caller; fall back to the raw URL.
	}
	const tool = mcpStore.tools.find((entry) => entry.name === IMAGE_FETCH_TOOL);
	if (!tool) return null;
	const server = mcpStore.servers.find((entry) => entry.id === tool.serverId && entry.enabled);
	if (!server) return null;
	const args = { url, max_dimension: IMAGE_FETCH_MAX_DIMENSION };
	if (server.askBeforeRun !== false) {
		// Batch prefetch must not queue one dialog per image; only an explicit
		// user open passes confirm:true.
		if (!options.confirm) return null;
		let confirmed = false;
		try {
			confirmed = await mcpStore.confirmToolCall({
				serverName: server.name,
				toolName: IMAGE_FETCH_TOOL,
				args
			});
		} catch {
			confirmed = false;
		}
		if (!confirmed) throw new ImageFetchCancelled();
	}
	try {
		const result = await callTool(server, IMAGE_FETCH_TOOL, args);
		return result.images?.[0] ?? null;
	} catch {
		// Fetch failures are non-fatal; the caller falls back to the raw URL.
		return null;
	}
}

/** Like `fetchImage`, but returns a `data:` URL (or null). */
export async function fetchImageAsDataUrl(
	url: string,
	options: FetchImageOptions = {}
): Promise<string | null> {
	const image = await fetchImage(url, options);
	if (!image) return null;
	return toDataUrl(image.mimeType, image.data) || null;
}

/**
 * Open a result in a new tab. A data: result is decoded synchronously; an HTTP
 * image goes through the file-fetch tool and opens only after a successful
 * fetch (or the raw URL when no fetch tool exists).
 */
export async function openImageResult(url: string): Promise<void> {
	const isData = url.startsWith('data:');
	if (isData) {
		if (!isRasterImageDataUrl(url)) return;
	} else {
		try {
			assertSafeFetchUrl(url, true);
		} catch {
			return;
		}
	}

	const popup = window.open('', '_blank');
	if (!popup) return;
	popup.opener = null;
	const close = () => {
		try { popup.close(); } catch { /* already gone */ }
	};

	if (isData) {
		const separator = url.indexOf(',');
		const mime = /^data:([^;]+)/i.exec(url)?.[1] ?? 'application/octet-stream';
		try {
			const binary = atob(url.slice(separator + 1));
			const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
			const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
			popup.location.href = objectUrl;
			setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
		} catch {
			close();
		}
		return;
	}

	let dataUrl: string | null = null;
	try {
		dataUrl = await fetchImageAsDataUrl(url, { confirm: true });
	} catch (err) {
		if (err instanceof ImageFetchCancelled) return close();
	}
	if (dataUrl) {
		try {
			const blob = await (await fetch(dataUrl)).blob();
			const objectUrl = URL.createObjectURL(blob);
			popup.location.href = objectUrl;
			setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
			return;
		} catch {
			// fall through to the raw URL
		}
	}
	popup.location.href = url;
}

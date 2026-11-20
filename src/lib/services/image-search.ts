/**
 * Companion picture search (app-driven).
 *
 * The model only supplies a query in its state JSON. This module runs the
 * configured MCP search tool, turns its result into structured picture data
 * and publishes a platform/window-independent event. Presentation lives in the
 * image-search store and modal; no store is touched here.
 */
import { env as publicEnv } from '$env/dynamic/public';
import { mcpStore } from '$lib/stores/mcp.svelte';
import { callTool } from '$lib/services/mcp/capability';
import type { McpTool } from '$lib/types/mcp';
import { isRasterImageDataUrl } from '$lib/utils/image-mime';
import { assertSafeFetchUrl } from '$lib/services/providers/url-guard';
import {
	chooseImageSearchTool,
	countForPage,
	IMAGE_FETCH_TOOL,
	IMAGE_PAGE_SIZE,
	imagePaging,
	imageSearchErrorCopy,
	isDirectImageUrl,
	isToolOnConfirmList,
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

/** Largest edge requested from the file-fetch tool. */
const IMAGE_FETCH_MAX_DIMENSION = 1280;

export interface ImageFetchCapability {
	available: boolean;
	/** True when the server asks before running tools, so each fetch confirms. */
	asksFirst: boolean;
}

function findImageFetchServer() {
	const tool = mcpStore.tools.find((entry) => entry.name === IMAGE_FETCH_TOOL);
	if (!tool) return null;
	return mcpStore.servers.find((entry) => entry.id === tool.serverId && entry.enabled) ?? null;
}

/** Current view for prompt context, from the already loaded tool list. */
export function imageFetchCapabilitySync(): ImageFetchCapability {
	const server = findImageFetchServer();
	return { available: server !== null, asksFirst: server ? server.askBeforeRun !== false : false };
}

/** Resolve preview capability after tool discovery. */
export async function imageFetchCapability(): Promise<ImageFetchCapability> {
	try {
		await mcpStore.ensureTools();
	} catch {
		// Discovery failure falls through to "unavailable".
	}
	return imageFetchCapabilitySync();
}

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
	const paging = imagePaging(tool);
	if (page > 1 && paging?.kind === 'page') args[paging.arg] = page;
	else if (page > 1 && paging?.kind === 'count') args[paging.arg] = countForPage(paging, page);
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
		case 'empty_query':
			return 'The picture request had no search query';
		case 'no_paging':
			return 'The selected picture tool cannot load more results';
		case 'confirm_required':
			return 'The selected picture tool requires manual confirmation';
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
 * Explain a tool limit next to the pictures that are already on screen. A
 * notice never opens the panel and never clears results.
 */
export function publishImageNotice(query: string, code: ImageSearchErrorCode): void {
	publishImageShowEvent({
		id: newImageEventId(),
		at: Date.now(),
		type: 'notice',
		query: query.trim(),
		code,
		message: imageSearchErrorCopy(code).message
	});
}

/**
 * Publish a picture-intent error that has no search request behind it (for
 * example a state block with an empty query). The loading event gives the
 * store a matching request id, so the panel opens with the explanation.
 */
export function reportImageIntentError(
	query: string,
	code: ImageSearchErrorCode,
	detail?: string
): void {
	const requestId = newImageEventId();
	const clean = query.trim();
	publishImageShowEvent({
		id: newImageEventId(),
		at: Date.now(),
		type: 'loading',
		requestId,
		query: clean,
		page: 1
	});
	publishError(requestId, clean, code, detail);
}

/**
 * Resolve a query through the configured MCP search tool. Never throws;
 * failure is published as an event so the UI cannot silently do nothing.
 */
export async function searchImages(query: string, page = 1): Promise<ImageSearchResult[]> {
	const cleanQuery = query.trim();
	if (!cleanQuery) {
		reportImageIntentError('', 'empty_query');
		return [];
	}
	const safePage = Number.isFinite(page) ? Math.max(1, Math.min(10, Math.floor(page))) : 1;
	const requestId = newImageEventId();
	const publishLoading = () =>
		publishImageShowEvent({
			id: newImageEventId(),
			at: Date.now(),
			type: 'loading',
			requestId,
			query: cleanQuery,
			page: safePage
		});
	// The panel opens on a failure with its explanation; a successful search
	// publishes the same loading event right before it calls the tool.
	const fail = (code: ImageSearchErrorCode, detail?: string): ImageSearchResult[] => {
		publishLoading();
		publishError(requestId, cleanQuery, code, detail);
		return [];
	};

	try {
		await mcpStore.ensureTools();
	} catch (err) {
		return fail('search_failed', err instanceof Error ? err.message : String(err));
	}

	if (mcpStore.toolsError && mcpStore.tools.length === 0) {
		return fail('search_failed', mcpStore.toolsError);
	}

	const choice = chooseImageSearchTool(mcpStore.tools, mcpStore.imageSearchTool);
	if (!choice.tool) return fail(choice.error ?? 'no_tool');
	const tool = choice.tool;
	const server = mcpStore.servers.find((entry) => entry.id === tool.serverId && entry.enabled);
	if (!server) return fail('tool_unavailable');
	if (isToolOnConfirmList(tool.name, publicEnv.PUBLIC_MCP_CONFIRM_TOOLS)) {
		return fail('confirm_required');
	}

	const paging = imagePaging(tool);
	if (safePage > 1) {
		// Keep the pictures that are already on screen and explain the limit
		// instead of replacing them with an error panel. A page argument selects
		// the next page; a count-based tool only gets a larger batch, so the
		// request is pointless once the count stops growing.
		const exhausted =
			!paging ||
			(paging.kind === 'count' && countForPage(paging, safePage) <= countForPage(paging, safePage - 1));
		if (exhausted) {
			publishImageNotice(cleanQuery, 'no_paging');
			return [];
		}
	}

	const args = buildSearchArgs(tool, cleanQuery, safePage);
	publishLoading();
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
		const limit = paging?.kind === 'count' ? IMAGE_PAGE_SIZE * safePage : IMAGE_PAGE_SIZE;
		const parsed = parseImageResults(result.content, result.images, limit);
		// A count-based tool returns the same list again with more entries; the
		// next page is the window after the pictures that were already shown.
		const images =
			paging?.kind === 'count' && safePage > 1
				? parsed.slice(IMAGE_PAGE_SIZE * (safePage - 1), IMAGE_PAGE_SIZE * safePage)
				: parsed;
		if (!images.length) {
			if (safePage > 1 && paging?.kind === 'count') {
				publishImageNotice(cleanQuery, 'no_paging');
				return [];
			}
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
	const server = findImageFetchServer();
	if (!server) return null;
	if (isToolOnConfirmList(IMAGE_FETCH_TOOL, publicEnv.PUBLIC_MCP_CONFIRM_TOOLS)) return null;
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

export type OpenImageOutcome = 'opened' | 'cancelled' | 'blocked' | 'failed';

/**
 * Open a result in a new tab. Source pages open directly; image bytes go
 * through the file-fetch tool and fall back to the raw image URL. The caller
 * gets an explicit outcome so a failed fetch never looks like a successful
 * navigation.
 */
export async function openImageResult(url: string): Promise<OpenImageOutcome> {
	const isData = url.startsWith('data:');
	if (isData) {
		if (!isRasterImageDataUrl(url)) return 'failed';
	} else {
		try {
			assertSafeFetchUrl(url, true);
		} catch {
			return 'failed';
		}
	}

	// A source page is not an image. Opening it directly avoids a pointless
	// fetch prompt and the old silent fallback from "picture" to "web page".
	if (!isData && !isDirectImageUrl(url)) {
		const source = window.open(url, '_blank');
		if (!source) return 'blocked';
		source.opener = null;
		return 'opened';
	}

	const popup = window.open('', '_blank');
	if (!popup) return 'blocked';
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
			return 'opened';
		} catch {
			close();
			return 'failed';
		}
	}

	let dataUrl: string | null = null;
	try {
		dataUrl = await fetchImageAsDataUrl(url, { confirm: true });
	} catch (err) {
		if (err instanceof ImageFetchCancelled) {
			close();
			return 'cancelled';
		}
	}
	if (dataUrl) {
		try {
			const blob = await (await fetch(dataUrl)).blob();
			const objectUrl = URL.createObjectURL(blob);
			popup.location.href = objectUrl;
			setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
			return 'opened';
		} catch {
			// Fall through to the raw image URL.
		}
	}
	popup.location.href = url;
	return 'opened';
}

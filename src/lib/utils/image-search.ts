/**
 * Shared types and pure parsing helpers for the companion picture popup. The
 * model supplies only a query in its state JSON; the app searches through MCP
 * and builds the structured results here.
 */
import { isRasterImageDataUrl, isRasterImageMimeType } from './image-mime.ts';
export { isRasterImageMimeType } from './image-mime.ts';

export interface ImageSearchResult {
	title: string;
	url: string;
	thumbnail: string;
	source: string;
	license?: string;
	attribution?: string;
}

/** Hostname of a URL, or "unknown" when it cannot be parsed. */
export function extractHostname(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return 'unknown';
	}
}

/** Build a safe `data:` URL from a raster image block, or "" when unsupported. */
export function toDataUrl(mimeType: string, base64: string): string {
	if (!base64 || !isRasterImageMimeType(mimeType)) return '';
	return `data:${mimeType};base64,${base64}`;
}

// Keys that hold an image link in common search-tool result shapes.
const IMAGE_KEY_RE = /^(img|image|thumb|photo|picture)/i;
const IMAGE_URL_RE = /https?:\/\/[^\s"'<>\\]+\.(?:jpe?g|png|webp|gif|avif|bmp)(?:\?[^\s"'<>\\]*)?/gi;

/**
 * Pull direct image URLs out of a search tool result — JSON (img_src/thumbnail
 * fields) or plain text (any image-extension URL). De-duped, capped at 12.
 */
export function extractImageUrls(text: string): string[] {
	const found = new Set<string>();
	const add = (value: unknown) => {
		if (typeof value === 'string' && /^https?:\/\//i.test(value)) found.add(value.trim());
	};
	let data: unknown = null;
	try {
		data = JSON.parse(text);
	} catch {
		data = null;
	}
	if (data) {
		const walk = (node: unknown) => {
			if (Array.isArray(node)) {
				node.forEach(walk);
				return;
			}
			if (!node || typeof node !== 'object') return;
			for (const [key, value] of Object.entries(node)) {
				if (typeof value === 'string') {
					if (IMAGE_KEY_RE.test(key)) add(value);
				} else if (typeof value === 'object') {
					walk(value);
				}
			}
		};
		walk(data);
	}
	// Fallback: any URL ending in an image extension, whatever the JSON shape.
	for (const match of text.matchAll(IMAGE_URL_RE)) found.add(match[0]);
	// SearXNG's text format names the direct image separately from the page URL.
	for (const match of text.matchAll(/(?:Image Source|Image URL|Thumbnail)\s*:\s*(https?:\/\/[^\s]+)/gi)) {
		found.add(match[1]);
	}
	return [...found].slice(0, 12);
}

const PAGE_URL_KEYS = ['url', 'link', 'href', 'page_url', 'pageUrl', 'source_url', 'sourceUrl'];
const IMAGE_URL_KEYS = [
	'img_src',
	'imgSrc',
	'image',
	'image_url',
	'imageUrl',
	'photo',
	'picture',
	'src'
];
const THUMBNAIL_KEYS = [
	'thumbnail_src',
	'thumbnailSrc',
	'thumbnail',
	'thumb',
	'preview',
	'preview_url',
	'previewUrl',
	...IMAGE_URL_KEYS
];
const TITLE_KEYS = ['title', 'name', 'caption', 'label'];
const SOURCE_KEYS = ['source', 'site', 'publisher', 'engine', 'provider', 'author'];
const LICENSE_KEYS = ['license', 'licence', 'license_name', 'licenseName', 'license_url', 'licenseUrl', 'license_type', 'licenseType'];
const RESULT_ARRAY_KEYS = ['results', 'images', 'items', 'entries', 'data'];

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstNestedString(record: Record<string, unknown>, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = asRecord(record[key]);
		const found = firstString(value, ['url', 'src', 'href', 'plain', 'text']);
		if (found) return found;
	}
	return undefined;
}

function isHttpUrl(value: string | undefined): boolean {
	return !!value && /^https?:\/\//i.test(value);
}

function isSafeImageUrl(value: string | undefined): boolean {
	return !!value && (/^https?:\/\//i.test(value) || isRasterImageDataUrl(value));
}

function collectResultRecords(data: unknown): Record<string, unknown>[] {
	if (Array.isArray(data)) {
		return data.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry));
	}
	if (!data || typeof data !== 'object') return [];
	const record = data as Record<string, unknown>;
	const records: Record<string, unknown>[] = [];
	let foundArray = false;
	for (const key of RESULT_ARRAY_KEYS) {
		const value = record[key];
		if (!Array.isArray(value)) continue;
		const entries = value.filter(
			(entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry)
		);
		if (entries.length) {
			records.push(...entries);
			foundArray = true;
		}
	}
	if (!foundArray && THUMBNAIL_KEYS.some((key) => typeof record[key] === 'string')) {
		records.push(record);
	}
	if (!records.length) {
		for (const value of Object.values(record)) {
			if (Array.isArray(value)) records.push(...collectResultRecords(value));
			else if (value && typeof value === 'object') records.push(...collectResultRecords(value));
		}
	}
	return records;
}

/**
 * Convert a search tool result into popup results. Handles SearXNG-style
 * `img_src`/`thumbnail_src` JSON, generic `image`/`url` shapes, and plain text
 * with image-extension URLs. Missing metadata falls back to the hostname.
 */
export function parseImageResults(
	content: string,
	images: Array<{ mimeType: string; data: string }> = []
): ImageSearchResult[] {
	const results: ImageSearchResult[] = [];
	const seen = new Set<string>();
	const push = (result: ImageSearchResult) => {
		if (!isHttpUrl(result.url) && !result.url.startsWith('data:image/')) return;
		const key = `${result.url}\n${result.thumbnail}`;
		if (seen.has(key)) return;
		seen.add(key);
		results.push(result);
	};

	let data: unknown = null;
	try {
		data = JSON.parse(content);
	} catch {
		data = null;
	}
	for (const record of collectResultRecords(data)) {
		const properties = asRecord(record.properties);
		const urls = asRecord(record.urls);
		const thumbnailObject = asRecord(record.thumbnail);
		const attributionObject = asRecord(record.attribution);
		const pageUrl =
			firstString(record, PAGE_URL_KEYS) ?? firstString(record, ['source_image_url', 'sourceImageUrl']);
		const imageUrl =
			firstString(record, IMAGE_URL_KEYS) ??
			firstString(properties, ['url', 'src']) ??
			firstString(thumbnailObject, ['src', 'url']) ??
			firstString(urls, ['regular', 'large', 'small', 'full', 'thumb']);
		const thumbnail =
			firstString(record, THUMBNAIL_KEYS) ??
			firstString(properties, ['placeholder', 'url']) ??
			firstString(thumbnailObject, ['src', 'url']) ??
			firstString(urls, ['thumb', 'small']) ??
			imageUrl ??
			pageUrl;
		const url = pageUrl ?? imageUrl;
		if (typeof url !== 'string' || typeof thumbnail !== 'string') continue;
		if (!isHttpUrl(url) || !isSafeImageUrl(thumbnail)) continue;
		const host = extractHostname(pageUrl ?? url);
		const license = firstString(record, LICENSE_KEYS);
		const attribution =
			firstString(attributionObject, ['plain', 'text']) ??
			(typeof record.attribution === 'string' ? record.attribution.trim() : undefined);
		push({
			title: firstString(record, TITLE_KEYS) ?? firstString(record, ['description', 'alt_description', 'altDescription']) ?? host,
			url,
			thumbnail,
			source: firstString(record, SOURCE_KEYS) ?? firstString(record, ['photographer', 'photographer_username']) ?? host,
			...(license && { license }),
			...(attribution && { attribution })
		});
		if (results.length >= 12) return results;
	}

	if (!results.length) {
		for (const url of extractImageUrls(content)) {
			push({
				title: extractHostname(url),
				url,
				thumbnail: url,
				source: extractHostname(url)
			});
			if (results.length >= 12) return results;
		}
	}

	// Some search servers return image content blocks instead of links.
	for (const image of images.slice(0, 12 - results.length)) {
		const dataUrl = toDataUrl(image.mimeType, image.data);
		push({ title: 'Image', url: dataUrl, thumbnail: dataUrl, source: 'MCP image' });
	}
	return results.slice(0, 12);
}

// ── Choosing an image-search MCP tool ────────────────────────────────────────
// A search tool is any tool that takes a text query. File-fetch tools take a
// `url`, so they are naturally excluded.

export interface SearchToolLike {
	name: string;
	description?: string;
	inputSchema?: { properties?: Record<string, unknown> };
}

const QUERY_KEYS = ['query', 'q', 'search', 'term', 'prompt'];

/** The parameter a tool uses for the search text, or null if it takes no query. */
export function queryArgKey(tool: SearchToolLike): string | null {
	const props = tool.inputSchema?.properties ?? {};
	return QUERY_KEYS.find((key) => key in props) ?? null;
}

const NON_PICTURE_TOOL_RE =
	/(suggest|autocomplete|instance[_-]?info|url[_-]?read|web[_-]?read|fetch|file|filesystem|scrape|crawl|download|upload|video|news|map|local|place)/i;
const PICTURE_HINT_RE = /(image|photo|picture|bild|foto|stock|pexafy|unsplash|pexels|pixabay)/i;

/**
 * A query-taking tool that can plausibly return pictures. This keeps
 * suggestions, page readers, file fetchers and unrelated search tools out of
 * the picture-search picker.
 */
export function isPictureSearchTool(tool: SearchToolLike): boolean {
	if (!queryArgKey(tool)) return false;
	const name = tool.name.toLowerCase();
	if (NON_PICTURE_TOOL_RE.test(name)) return false;
	const text = `${name} ${tool.description ?? ''}`;
	if (PICTURE_HINT_RE.test(text)) return true;
	// SearXNG's general web tool is image-capable through its categories option.
	const props = tool.inputSchema?.properties ?? {};
	return name === 'searxng_web_search' || ('categories' in props && 'response_format' in props);
}

/** Lower is a better image-search candidate; null means "not a candidate". */
export function searchToolRank(tool: SearchToolLike): number | null {
	if (!isPictureSearchTool(tool)) return null;
	const name = tool.name.toLowerCase();
	if (name.includes('image') && name.includes('search')) return 0;
	if (name.includes('searxng')) return 1;
	if (name.includes('photo')) return 2;
	if (name.includes('image')) return 3;
	if (name.includes('search')) return 4;
	return 5;
}

/** Pick the best query-taking MCP tool for image search, or undefined. */
export function pickSearchTool<T extends SearchToolLike>(tools: T[]): T | undefined {
	return tools
		.map((tool) => ({ tool, rank: searchToolRank(tool) }))
		.filter((entry): entry is { tool: T; rank: number } => entry.rank !== null)
		.sort((a, b) => a.rank - b.rank)[0]?.tool;
}

export interface ImageSearchToolSelection {
	serverId: string;
	toolName: string;
}

export interface ImageSearchToolChoice<T extends SearchToolLike> {
	tool: T | null;
	error: 'no_tool' | 'tool_unavailable' | null;
}

/**
 * The explicit user choice wins. Only without one does pickSearchTool() choose a
 * default. An explicit tool that disappeared is an error, never a silent switch.
 */
export function chooseImageSearchTool<T extends SearchToolLike & { serverId: string }>(
	tools: T[],
	selection: ImageSearchToolSelection | null
): ImageSearchToolChoice<T> {
	if (selection) {
		const tool = tools.find(
			(entry) => entry.serverId === selection.serverId && entry.name === selection.toolName
		);
		return tool && isPictureSearchTool(tool)
			? { tool, error: null }
			: { tool: null, error: 'tool_unavailable' };
	}
	const tool = pickSearchTool(tools);
	return tool ? { tool, error: null } : { tool: null, error: 'no_tool' };
}

/** True when the user clearly asks to close the picture popup. */
export function isCloseImagesRequest(text: string): boolean {
	const value = text.toLowerCase();
	const close = /\b(close|hide|dismiss|schlie(?:ß|ss)|mach.*zu|zumachen|beende|ausblenden)/.test(value);
	const target = /\b(pictures?|images?|photos?|bilder?|fotos?|popup|fenster)/.test(value);
	return close && target;
}

/** True when the user asks for more of the pictures already shown. */
export function isMoreImagesRequest(text: string): boolean {
	return /\b(noch mehr|mehr davon|weitere (?:bilder|fotos)|more (?:pictures?|images?|photos?|of (?:them|those|these))|another (?:picture|image|photo))\b/i.test(text);
}

/**
 * Broad, language-tolerant hint that the turn asks to be shown something. The
 * separate query-recovery call still decides whether it is a picture request, so
 * "Zeig mir süße Hunde" works without the word "Bilder", while the recovery
 * model returns null for unrelated "zeig mir..." requests.
 */
export function isImageRequest(text: string): boolean {
	if (/\b(pictures?|images?|photos?|bilder?|fotos?)\b/i.test(text)) return true;
	// "show me / zeig mir ..." covers requests like "Zeig mir süße Hunde"
	// without treating ordinary "I see..." or "send it" as picture intent.
	return /\b(?:show|zeig(?:e)?|schick|send|find|such)\s+(?:me|mir)\b/i.test(text);
}

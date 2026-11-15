import test from 'node:test';
import assert from 'node:assert/strict';

import {
	describeImageFetch,
	describePictureSearch,
	extractHostname,
	extractImageUrls,
	chooseImageSearchTool,
	isPictureSearchTool,
	isCloseImagesRequest,
	isImageRequest,
	isMoreImagesRequest,
	imageOpenLabel,
	imageQueryFromMessage,
	imageSearchErrorCopy,
	isDirectImageUrl,
	parseImageResults,
	pickSearchTool,
	queryArgKey,
	supportsImagePaging,
	toDataUrl
} from './image-search.ts';
import { isRasterImageDataUrl, isRasterImageMimeType } from './image-mime.ts';

test('extractHostname returns the host or a safe fallback', () => {
	assert.equal(extractHostname('https://example.com/a/b.png'), 'example.com');
	assert.equal(extractHostname('not a url'), 'unknown');
});

test('toDataUrl only builds raster image data URLs', () => {
	assert.equal(toDataUrl('image/png', 'AAAA'), 'data:image/png;base64,AAAA');
	assert.equal(toDataUrl('image/jpeg', 'AAAA'), 'data:image/jpeg;base64,AAAA');
	assert.equal(toDataUrl('', 'AAAA'), '');
	assert.equal(toDataUrl('image/svg+xml', 'AAAA'), '');
	assert.equal(toDataUrl('application/octet-stream', 'AAAA'), '');
});

test('extractImageUrls reads img_src/thumbnail fields from JSON', () => {
	const json = JSON.stringify({
		results: [
			{ url: 'https://page/1', img_src: 'https://cdn/a.jpg', title: 'A' },
			{ url: 'https://page/2', thumbnail_src: 'https://cdn/b.png' }
		]
	});
	const urls = extractImageUrls(json);
	assert.ok(urls.includes('https://cdn/a.jpg'));
	assert.ok(urls.includes('https://cdn/b.png'));
});

test('extractImageUrls falls back to image-extension URLs in plain text', () => {
	const urls = extractImageUrls('see https://x/y.webp?w=2 and https://z/p.jpg');
	assert.deepEqual(urls.sort(), ['https://x/y.webp?w=2', 'https://z/p.jpg'].sort());
});

test('extractImageUrls ignores page URLs and caps at 12', () => {
	assert.equal(extractImageUrls('{"url":"https://page/no-ext"}').length, 0);
	const json = JSON.stringify({
		results: Array.from({ length: 20 }, (_, i) => ({ url: `https://page/${i}`, img_src: `https://cdn/${i}.jpg` }))
	});
	assert.equal(extractImageUrls(json).length, 12);
});

test('extractImageUrls returns nothing for empty or non-image text', () => {
	assert.deepEqual(extractImageUrls(''), []);
	assert.deepEqual(extractImageUrls('no links here'), []);
});

test('parseImageResults caps the popup list at 12 entries', () => {
	const results = parseImageResults(JSON.stringify({
		results: Array.from({ length: 15 }, (_, i) => ({
			url: `https://page.example/${i}`,
			img_src: `https://cdn.example/${i}.jpg`
		}))
	}));
	assert.equal(results.length, 12);
});

test('parseImageResults returns nothing for empty content', () => {
	assert.deepEqual(parseImageResults(''), []);
});

test('queryArgKey finds the query parameter, or null without one', () => {
	assert.equal(queryArgKey({ name: 'x', inputSchema: { properties: { q: {} } } }), 'q');
	assert.equal(queryArgKey({ name: 'x', inputSchema: { properties: { url: {} } } }), null);
	assert.equal(queryArgKey({ name: 'x' }), null);
});

test('pickSearchTool prefers image-search and SearXNG tools, excludes file/fetch tools', () => {
	const tools = [
		{ name: 'fetch_image_from_url', inputSchema: { properties: { url: {} } } },
		{ name: 'web_search', inputSchema: { properties: { query: {} } } },
		{ name: 'brave_image_search', inputSchema: { properties: { q: {} } } }
	];
	assert.equal(pickSearchTool(tools)?.name, 'brave_image_search');
	assert.equal(pickSearchTool([
		{ name: 'file_search', inputSchema: { properties: { query: {} } } },
		{ name: 'searxng_web_search', inputSchema: { properties: { query: {} } } }
	])?.name, 'searxng_web_search');
	assert.equal(
		pickSearchTool([{ name: 'fetch_file_from_url', inputSchema: { properties: { url: {} } } }]),
		undefined
	);
	assert.equal(pickSearchTool([]), undefined);
});

test('parseImageResults maps SearXNG fields including license and source', () => {
	const results = parseImageResults(JSON.stringify({
		results: [
			{
				title: 'Snowy castle',
				url: 'https://example.com/castle',
				img_src: 'https://cdn.example.com/castle.jpg',
				thumbnail_src: 'https://cdn.example.com/castle-thumb.jpg',
				source: 'Wikimedia',
				license: 'CC BY-SA 4.0'
			}
		]
	}));
	assert.deepEqual(results, [{
		title: 'Snowy castle',
		url: 'https://example.com/castle',
		thumbnail: 'https://cdn.example.com/castle-thumb.jpg',
		source: 'Wikimedia',
		license: 'CC BY-SA 4.0'
	}]);
});

test('parseImageResults handles generic shapes, dedupes and falls back to hostnames', () => {
	const results = parseImageResults(JSON.stringify({
		items: [
			{ name: 'Cat', link: 'https://a.example/page', image: 'https://a.example/cat.png' },
			{ name: 'Cat duplicate', link: 'https://a.example/page', image: 'https://a.example/cat.png' }
		]
	}));
	assert.equal(results.length, 1);
	assert.equal(results[0].title, 'Cat');
	assert.equal(results[0].source, 'a.example');
	assert.equal(results[0].thumbnail, 'https://a.example/cat.png');
});

test('parseImageResults falls back to image URLs in plain text and rejects unsafe schemes', () => {
	assert.deepEqual(
		parseImageResults('see https://x.example/a.jpg').map((result) => result.url),
		['https://x.example/a.jpg']
	);
	assert.deepEqual(
		parseImageResults(JSON.stringify({ results: [{ image: 'javascript:alert(1)' }, { image: 'data:image/png;base64,AA' }] })),
		[]
	);
});

test('parseImageResults supports MCP image blocks as data URLs', () => {
	const results = parseImageResults('', [{ mimeType: 'image/png', data: 'AAAA' }]);
	assert.equal(results.length, 1);
	assert.equal(results[0].url, 'data:image/png;base64,AAAA');
	assert.equal(results[0].thumbnail, results[0].url);
});

test('chooseImageSearchTool prefers an explicit selection and never switches silently', () => {
	const tools = [
		{ serverId: 'a', name: 'searxng_image_search', inputSchema: { properties: { query: {} } } },
		{ serverId: 'b', name: 'search_photos', inputSchema: { properties: { q: {} } } }
	];
	assert.equal(
		chooseImageSearchTool(tools, { serverId: 'b', toolName: 'search_photos' }).tool?.serverId,
		'b'
	);
	assert.deepEqual(
		chooseImageSearchTool(tools, { serverId: 'b', toolName: 'file_search' }),
		{ tool: null, error: 'tool_unavailable' }
	);
	assert.deepEqual(
		chooseImageSearchTool(tools, { serverId: 'missing', toolName: 'x' }),
		{ tool: null, error: 'tool_unavailable' }
	);
	assert.equal(chooseImageSearchTool(tools.slice(1), null).tool?.name, 'search_photos');
	assert.deepEqual(chooseImageSearchTool([], null), { tool: null, error: 'no_tool' });
});

test('chooseImageSearchTool rejects an explicit tool without a query parameter', () => {
	const tools = [{ serverId: 'a', name: 'fetch_file_from_url', inputSchema: { properties: { url: {} } } }];
	assert.deepEqual(
		chooseImageSearchTool(tools, { serverId: 'a', toolName: 'fetch_file_from_url' }),
		{ tool: null, error: 'tool_unavailable' }
	);
	assert.deepEqual(chooseImageSearchTool(tools, null), { tool: null, error: 'no_tool' });
});

test('isMoreImagesRequest recognizes continuation phrases', () => {
	assert.equal(isMoreImagesRequest('Zeig mir noch mehr davon.'), true);
	assert.equal(isMoreImagesRequest('Show me more pictures.'), true);
	assert.equal(isMoreImagesRequest('Zeig mir Bilder von Katzen.'), false);
});

test('isImageRequest finds picture nouns and ignores time questions', () => {
	assert.equal(isImageRequest('Zeig mir Bilder von Katzen.'), true);
	assert.equal(isImageRequest('Fotos vom Schloss'), true);
	assert.equal(isImageRequest('Zeig mir süße Hunde.'), true);
	assert.equal(isImageRequest('Show me something cute.'), true);
	assert.equal(isImageRequest('I see what you mean.'), false);
	assert.equal(isImageRequest('Send it.'), false);
	assert.equal(isImageRequest('Wie spät ist es?'), false);
});

test('isCloseImagesRequest recognizes close phrases in both languages', () => {
	assert.equal(isCloseImagesRequest('Schließ die Bilder.'), true);
	assert.equal(isCloseImagesRequest('Close the pictures, please.'), true);
	assert.equal(isCloseImagesRequest('Mach das Fenster zu'), true);
	assert.equal(isCloseImagesRequest('Zeig mir noch mehr Bilder'), false);
	assert.equal(isCloseImagesRequest('Wie spät ist es?'), false);
});

test('extractImageUrls reads SearXNG text Image Source URLs without an extension', () => {
	const text = 'Title: Cat\nURL: https://page.example/cat\nImage Source: https://cdn.example/image?id=1\n';
	assert.deepEqual(extractImageUrls(text), ['https://cdn.example/image?id=1']);
});

test('parseImageResults reads Brave image items (page url plus properties.url)', () => {
	const results = parseImageResults(JSON.stringify({
		type: 'object',
		count: 1,
		items: [{
			title: 'Castle',
			url: 'https://example.com/castle',
			page_fetched: '2026-01-01T00:00:00Z',
			confidence: 'high',
			properties: { url: 'https://cdn.example.com/castle.jpg', width: 800, height: 600 }
		}]
	}));
	assert.deepEqual(results, [{
		title: 'Castle',
		url: 'https://example.com/castle',
		thumbnail: 'https://cdn.example.com/castle.jpg',
		source: 'example.com'
	}]);
});

test('parseImageResults reads Pexafy photo fields and attribution', () => {
	const results = parseImageResults(JSON.stringify({
		data: [{
			photo_id: 'p1',
			description: 'Mountain lake at dawn',
			source_image_url: 'https://source.example/photo',
			urls: { thumb: 'https://cdn.pexafy.test/thumb.jpg', regular: 'https://cdn.pexafy.test/regular.jpg' },
			source: 'Pexels',
			license_type: 'free',
			attribution: { plain: 'Photo by Ada on Pexels' }
		}]
	}));
	assert.deepEqual(results, [{
		title: 'Mountain lake at dawn',
		url: 'https://source.example/photo',
		thumbnail: 'https://cdn.pexafy.test/thumb.jpg',
		source: 'Pexels',
		license: 'free',
		attribution: 'Photo by Ada on Pexels'
	}]);
});

test('isPictureSearchTool excludes suggestions, page readers and file tools', () => {
	assert.equal(isPictureSearchTool({ name: 'searxng_search_suggestions', inputSchema: { properties: { query: {} } } }), false);
	assert.equal(isPictureSearchTool({ name: 'web_url_read', inputSchema: { properties: { url: {} } } }), false);
	assert.equal(isPictureSearchTool({ name: 'file_search', inputSchema: { properties: { query: {} } } }), false);
	assert.equal(isPictureSearchTool({ name: 'brave_image_search', inputSchema: { properties: { query: {} } } }), true);
	assert.equal(isPictureSearchTool({ name: 'search_photos', inputSchema: { properties: { q: {} } } }), true);
	assert.equal(isPictureSearchTool({ name: 'searxng_web_search', inputSchema: { properties: { query: {} } } }), true);
});


test('raster MIME helpers reject SVG and non-image payloads', () => {
	assert.equal(isRasterImageMimeType('image/png'), true);
	assert.equal(isRasterImageMimeType('image/svg+xml'), false);
	assert.equal(isRasterImageDataUrl('data:image/png;base64,AAAA'), true);
	assert.equal(isRasterImageDataUrl('data:image/svg+xml;base64,AAAA'), false);
});

test('error copy turns search codes into plain language', () => {
	const noTool = imageSearchErrorCopy('no_tool');
	assert.equal(noTool.settings, true);
	assert.match(noTool.message, /No picture search tool/);

	const unavailable = imageSearchErrorCopy('tool_unavailable');
	assert.equal(unavailable.settings, true);

	const empty = imageSearchErrorCopy('empty_results', 'cats');
	assert.match(empty.message, /cats/);
	assert.equal(empty.settings, false);

	const noQuery = imageSearchErrorCopy('empty_query');
	assert.match(noQuery.message, /no subject/);

	const failed = imageSearchErrorCopy('search_failed');
	assert.match(failed.message, /failed/i);
	assert.equal(failed.settings, false);
});

test('Pexafy search_photos is a query tool with its own argument name', () => {
	const tool = {
		name: 'search_photos',
		description: 'Search free stock photographs',
		inputSchema: {
			type: 'object',
			properties: { english_search_sentence: { type: 'string' } }
		}
	};
	assert.equal(queryArgKey(tool), 'english_search_sentence');
	assert.equal(isPictureSearchTool(tool), true);
});

test('parseImageResults reads Pexafy search_photos output', () => {
	const content = JSON.stringify({
		success: true,
		data: [
			{
				urls: { regular: 'https://cdn.pixabay.com/photo/nature_1280.jpg' },
				preview_url: 'https://thumb.pexafy.com/abc/480w.jpg',
				source_image_url: 'https://pixabay.com/photos/nature-6810212/',
				alt_description: 'Foggy mountain landscape with autumn trees',
				source: 'Pixabay',
				license_type: 'free',
				attribution: { plain: 'Photo by johnNaturePhotos on Pixabay' }
			}
		]
	});
	const results = parseImageResults(content, []);
	assert.equal(results.length, 1);
	assert.equal(results[0].thumbnail, 'https://thumb.pexafy.com/abc/480w.jpg');
	assert.equal(results[0].url, 'https://pixabay.com/photos/nature-6810212/');
	assert.equal(results[0].title, 'Foggy mountain landscape with autumn trees');
	assert.equal(results[0].license, 'free');
	assert.equal(results[0].attribution, 'Photo by johnNaturePhotos on Pixabay');
});

test('reverse image search tools are not picture-search candidates', () => {
	const byImage = {
		name: 'search_photos_by_image',
		description: 'Find similar photographs from a reference picture',
		inputSchema: {
			type: 'object',
			properties: { image_url: { type: 'string' }, english_search_sentence: { type: 'string' } }
		}
	};
	const byText = {
		name: 'search_photos',
		description: 'Search free stock photographs',
		inputSchema: {
			type: 'object',
			properties: { english_search_sentence: { type: 'string' } },
			required: ['english_search_sentence']
		}
	};
	assert.equal(isPictureSearchTool(byImage), false);
	assert.equal(pickSearchTool([byImage, byText])?.name, 'search_photos');
});

const pictureTool = (name: string, properties: Record<string, unknown>, serverId = 's1') => ({
	name,
	serverId,
	serverName: 'Search',
	inputSchema: { type: 'object', properties }
});

const readyState = { loading: false, mcpEnabled: true, enabledServers: 1, toolsError: false };

test('describePictureSearch reports automatic, selected and loading states', () => {
	const image = pictureTool('image_search', { query: {} });
	const fetch = pictureTool('fetch_file_from_url', { url: {} });

	assert.deepEqual(describePictureSearch([fetch, image], null, readyState), {
		kind: 'automatic',
		tool: image
	});
	assert.deepEqual(
		describePictureSearch([image], { serverId: 's1', toolName: 'image_search' }, readyState),
		{ kind: 'selected', tool: image }
	);
	assert.deepEqual(describePictureSearch([], null, { ...readyState, loading: true }), {
		kind: 'checking'
	});
});

test('describePictureSearch flags an unavailable or unsuitable explicit choice', () => {
	const reverse = pictureTool('search_photos_by_image', {
		image_url: {},
		english_search_sentence: {}
	});
	const selection = { serverId: 's1', toolName: 'search_photos_by_image' };
	assert.deepEqual(describePictureSearch([reverse], selection, readyState), {
		kind: 'selection_unsupported',
		selection
	});
	assert.deepEqual(
		describePictureSearch([], { serverId: 's1', toolName: 'gone' }, readyState),
		{ kind: 'selection_missing', selection: { serverId: 's1', toolName: 'gone' } }
	);
});

test('describePictureSearch separates missing server, disabled MCP and load errors', () => {
	const fetch = pictureTool('fetch_file_from_url', { url: {} });
	assert.equal(
		describePictureSearch([], null, { ...readyState, enabledServers: 0 }).kind,
		'no_server'
	);
	assert.equal(
		describePictureSearch([], null, { ...readyState, mcpEnabled: false }).kind,
		'mcp_disabled'
	);
	assert.equal(
		describePictureSearch([], null, { ...readyState, toolsError: true }).kind,
		'load_failed'
	);
	assert.equal(describePictureSearch([fetch], null, readyState).kind, 'no_tool');
});

test('describeImageFetch reports the file-fetch tool or its absence', () => {
	const fetch = pictureTool('fetch_file_from_url', { url: {} });
	assert.deepEqual(describeImageFetch([fetch], readyState), { kind: 'ready', tool: fetch });
	assert.equal(describeImageFetch([], readyState).kind, 'missing');
	assert.equal(
		describeImageFetch([], { ...readyState, loading: true }).kind,
		'checking'
	);
});

test('imageQueryFromMessage keeps the subject and drops the request scaffolding', () => {
	assert.equal(imageQueryFromMessage('zeig mir herbstliche Berglandschaften im Morgennebel'), 'herbstliche Berglandschaften im Morgennebel');
	assert.equal(imageQueryFromMessage('Zeig mir Bilder von süßen Katzen!'), 'süßen Katzen');
	assert.equal(imageQueryFromMessage('show me some cute cats'), 'cute cats');
	assert.equal(imageQueryFromMessage('bitte ein paar Fotos von Bergen'), 'Bergen');
});

test('isDirectImageUrl and imageOpenLabel never promise a picture for a source page', () => {
	assert.equal(isDirectImageUrl('data:image/png;base64,AA'), true);
	assert.equal(isDirectImageUrl('https://cdn.example.com/a.JPG?x=1'), true);
	assert.equal(isDirectImageUrl('https://example.com/article/123'), false);
	assert.equal(isDirectImageUrl('javascript:alert(1)'), false);
	assert.equal(imageOpenLabel('https://cdn.example.com/a.webp'), 'Open picture');
	assert.equal(imageOpenLabel('https://example.com/article/123'), 'Open source');
});

test('supportsImagePaging only accepts tools with a declared page argument', () => {
	assert.equal(supportsImagePaging({ inputSchema: { properties: { query: {}, pageno: {} } } }), true);
	assert.equal(supportsImagePaging({ inputSchema: { properties: { query: {}, page: {} } } }), true);
	assert.equal(supportsImagePaging({ inputSchema: { properties: { query: {} } } }), false);
	assert.equal(supportsImagePaging(null), false);
});

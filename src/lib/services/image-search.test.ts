import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pictureTool = {
	serverId: 'search',
	serverName: 'Search',
	name: 'searxng_image_search',
	description: 'Search pictures',
	inputSchema: {
		type: 'object',
		properties: { query: {}, pageno: {}, categories: {}, result_detail: {}, response_format: {} }
	}
};
const fetchTool = {
	serverId: 'files',
	serverName: 'Files',
	name: 'fetch_file_from_url',
	description: 'Fetch a file',
	inputSchema: { type: 'object', properties: { url: {} } }
};

function searchStore(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		serverEnabled: true,
		enabledServers: [{ id: 'search', enabled: true }],
		servers: [{ id: 'search', name: 'Search', transport: 'http', url: 'http://search.local/mcp', enabled: true, askBeforeRun: false }],
		tools: [pictureTool],
		toolsError: null,
		imageSearchTool: { serverId: 'search', toolName: 'searxng_image_search' },
		ensureTools: async () => {},
		confirmToolCall: async () => true,
		...overrides
	};
}

/** Boot one Vite server with a fake MCP store/client for the search core. */
async function withSearchCore(
	fixture: {
		store: Record<string, unknown>;
		call: (...args: unknown[]) => Promise<unknown>;
		publicEnv?: Record<string, string>;
	},
	fn: (mod: Record<string, any>) => Promise<void>
): Promise<void> {
	const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.__imageSearchFixture = fixture;
	const replacements: Record<string, string> = {
		'src/lib/stores/mcp.svelte': 'export const mcpStore = globalThis.__imageSearchFixture.store;',
		'src/lib/services/mcp/capability': 'export const callTool = (...args) => globalThis.__imageSearchFixture.call(...args);',
		'$env/dynamic/public': 'export const env = globalThis.__imageSearchFixture.publicEnv ?? {};'
	};
	const vite = await createServer({
		root,
		configFile: false,
		server: { middlewareMode: true },
		appType: 'custom',
		resolve: {
			alias: [
				...Object.keys(replacements).map((key) => ({
					find: key.replace('src/lib/', '$lib/'),
					replacement: '\0image-search-fixture:' + key
				})),
				{ find: '$lib', replacement: `${root}/src/lib` }
			]
		},
		optimizeDeps: { noDiscovery: true, entries: [] },
		plugins: [{
			name: 'image-search-fixture',
			resolveId(id) {
				if (id.startsWith('\0image-search-fixture:')) return id;
				const key = id.startsWith(`${root}/`) ? id.slice(root.length + 1).replace(/\.ts$/, '') : id;
				if (key in replacements) return '\0image-search-fixture:' + key;
			},
			load(id) {
				if (id.startsWith('\0image-search-fixture:')) return replacements[id.slice('\0image-search-fixture:'.length)];
			}
		}]
	});
	try {
		const mod = await vite.ssrLoadModule('/src/lib/services/image-search.ts');
		const events = await vite.ssrLoadModule('/src/lib/services/image-search/events.ts');
		await fn({ ...mod, ...events });
	} finally {
		await vite.close();
		delete globals.__imageSearchFixture;
	}
}

// Search-core test with a fake MCP store/client. The event bus, parser and
// selection logic stay real; only browser stores and network calls are replaced.
test('searchImages turns the selected MCP result into loading/results events', async (t) => {
	const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
	const tool = {
		serverId: 'search',
		serverName: 'Search',
		name: 'searxng_image_search',
		description: 'Search pictures',
		inputSchema: { type: 'object', properties: { query: {}, pageno: {}, categories: {}, result_detail: {}, response_format: {} } }
	};
	const store = {
		serverEnabled: true,
		enabledServers: [{ id: 'search', name: 'Search', enabled: true }],
		servers: [{ id: 'search', name: 'Search', transport: 'http', url: 'http://search.local/mcp', enabled: true, askBeforeRun: false }],
		tools: [tool],
		toolsError: null as string | null,
		imageSearchTool: { serverId: 'search', toolName: 'searxng_image_search' } as const,
		ensureTools: async () => {},
		confirmToolCall: async () => true
	};
	let calls = 0;
	let args: Record<string, unknown> = {};
	const fixture = {
		store,
		call: async (_server: unknown, _name: string, next: Record<string, unknown>) => {
			calls++;
			args = next;
			return {
				toolName: 'searxng_image_search',
				isError: false,
				content: JSON.stringify({
					results: [{
						title: 'Castle in snow',
						url: 'https://example.com/castle',
						img_src: 'https://cdn.example.com/castle.jpg',
						thumbnail_src: 'https://cdn.example.com/castle-thumb.jpg',
						source: 'Wikimedia',
						license: 'CC BY-SA'
					}]
				})
			};
		}
	};
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.__imageSearchFixture = fixture;
	const replacements: Record<string, string> = {
		'src/lib/stores/mcp.svelte': 'export const mcpStore = globalThis.__imageSearchFixture.store;',
		'src/lib/services/mcp/capability': 'export const callTool = (...args) => globalThis.__imageSearchFixture.call(...args);',
		'$env/dynamic/public': 'export const env = globalThis.__imageSearchFixture.publicEnv ?? {};'
	};
	const vite = await createServer({
		root,
		configFile: false,
		server: { middlewareMode: true },
		appType: 'custom',
		resolve: {
			alias: [
				...Object.keys(replacements).map((key) => ({
					find: key.replace('src/lib/', '$lib/'),
					replacement: '\0image-search-test:' + key
				})),
				{ find: '$lib', replacement: `${root}/src/lib` }
			]
		},
		optimizeDeps: { noDiscovery: true, entries: [] },
		plugins: [{
			name: 'image-search-test-stores',
			resolveId(id) {
				if (id.startsWith('\0image-search-test:')) return id;
				const key = id.startsWith(`${root}/`) ? id.slice(root.length + 1).replace(/\.ts$/, '') : id;
				if (key in replacements) return '\0image-search-test:' + key;
			},
			load(id) {
				if (id.startsWith('\0image-search-test:')) return replacements[id.slice('\0image-search-test:'.length)];
			}
		}]
	});
	try {
		const { searchImages } = await vite.ssrLoadModule('/src/lib/services/image-search.ts');
		const { onImageShowEvent, closeImageChannel } = await vite.ssrLoadModule('/src/lib/services/image-search/events.ts');
		const events: Array<{ type: string; query?: string; results?: unknown[]; code?: string }> = [];
		const stop = onImageShowEvent((event: { type: string; query?: string; results?: unknown[]; code?: string }) => events.push(event));
		try {
			const results = await searchImages('Neuschwanstein', 2);
			assert.equal(calls, 1);
			assert.deepEqual(args, { query: 'Neuschwanstein', pageno: 2, categories: 'images', result_detail: 'full', response_format: 'json' });
			assert.equal(results.length, 1);
			assert.deepEqual(events.map((event) => event.type), ['loading', 'results']);
			assert.equal(events[1].query, 'Neuschwanstein');
			assert.deepEqual(events[1].results, [{
				title: 'Castle in snow',
				url: 'https://example.com/castle',
				thumbnail: 'https://cdn.example.com/castle-thumb.jpg',
				source: 'Wikimedia',
				license: 'CC BY-SA'
			}]);
		} finally {
			stop();
			closeImageChannel();
		}
	} finally {
		await vite.close();
		delete globals.__imageSearchFixture;
	}
});

test('searchImages emits a visible no_tool error instead of returning silently', async () => {
	const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
	const store = {
		serverEnabled: true,
		enabledServers: [{ id: 'search', enabled: true }],
		servers: [{ id: 'search', enabled: true }],
		tools: [],
		toolsError: null,
		imageSearchTool: null,
		ensureTools: async () => {},
		confirmToolCall: async () => true
	};
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.__imageSearchFixture = { store, call: async () => { throw new Error('should not run'); } };
	const replacements: Record<string, string> = {
		'src/lib/stores/mcp.svelte': 'export const mcpStore = globalThis.__imageSearchFixture.store;',
		'src/lib/services/mcp/capability': 'export const callTool = (...args) => globalThis.__imageSearchFixture.call(...args);',
		'$env/dynamic/public': 'export const env = globalThis.__imageSearchFixture.publicEnv ?? {};'
	};
	const vite = await createServer({
		root,
		configFile: false,
		server: { middlewareMode: true },
		appType: 'custom',
		resolve: {
			alias: [
				...Object.keys(replacements).map((key) => ({
					find: key.replace('src/lib/', '$lib/'),
					replacement: '\0image-search-test:' + key
				})),
				{ find: '$lib', replacement: `${root}/src/lib` }
			]
		},
		optimizeDeps: { noDiscovery: true, entries: [] },
		plugins: [{
			name: 'image-search-test-stores-2',
			resolveId(id) {
				if (id.startsWith('\0image-search-test:')) return id;
				const key = id.startsWith(`${root}/`) ? id.slice(root.length + 1).replace(/\.ts$/, '') : id;
				if (key in replacements) return '\0image-search-test:' + key;
			},
			load(id) {
				if (id.startsWith('\0image-search-test:')) return replacements[id.slice('\0image-search-test:'.length)];
			}
		}]
	});
	try {
		const { searchImages } = await vite.ssrLoadModule('/src/lib/services/image-search.ts');
		const { onImageShowEvent, closeImageChannel } = await vite.ssrLoadModule('/src/lib/services/image-search/events.ts');
		const events: Array<{ type: string; code?: string; message?: string }> = [];
		const stop = onImageShowEvent((event: { type: string; code?: string; message?: string }) => events.push(event));
		try {
			await searchImages('cats');
			assert.deepEqual(events.map((event) => event.type), ['loading', 'error']);
			assert.equal(events[1].code, 'no_tool');
			assert.equal(events[1].message, 'No picture search tool configured');
		} finally {
			stop();
			closeImageChannel();
		}
	} finally {
		await vite.close();
		delete globals.__imageSearchFixture;
	}
});

async function searchEvents(
	fixture: { store: Record<string, unknown>; call: (...args: unknown[]) => Promise<unknown> }
): Promise<Array<Record<string, any>>> {
	const events: Array<Record<string, any>> = [];
	await withSearchCore(fixture, async ({ searchImages, onImageShowEvent, closeImageChannel }) => {
		const stop = onImageShowEvent((event: Record<string, any>) => events.push(event));
		try {
			await searchImages('cats', 2);
		} finally {
			stop();
			closeImageChannel();
		}
	});
	return events;
}

test('searchImages explains an empty query instead of doing nothing', async () => {
	await withSearchCore(
		{ store: searchStore(), call: async () => { throw new Error('should not run'); } },
		async ({ searchImages, onImageShowEvent, closeImageChannel }) => {
			const events: Array<Record<string, any>> = [];
			const stop = onImageShowEvent((event: Record<string, any>) => events.push(event));
			try {
				assert.deepEqual(await searchImages('   '), []);
				assert.deepEqual(events.map((event) => event.type), ['loading', 'error']);
				assert.equal(events[1].code, 'empty_query');
			} finally {
				stop();
				closeImageChannel();
			}
		}
	);
});

test('searchImages explains a missing page instead of repeating page one', async () => {
	const noPageTool = {
		...pictureTool,
		name: 'search_photos',
		description: 'Search stock photos',
		inputSchema: { type: 'object', properties: { query: {} } }
	};
	let calls = 0;
	await withSearchCore(
		{
			store: searchStore({
				tools: [noPageTool],
				imageSearchTool: { serverId: 'search', toolName: 'search_photos' }
			}),
			call: async () => {
				calls++;
				return { content: '[]' };
			}
		},
		async ({ searchImages, onImageShowEvent, closeImageChannel }) => {
			const events: Array<Record<string, any>> = [];
			const stop = onImageShowEvent((event: Record<string, any>) => events.push(event));
			try {
				assert.deepEqual(await searchImages('cats', 2), []);
				assert.equal(calls, 0, 'the tool is not asked for the same page again');
				// The notice resolves the loading event it belongs to, so the
				// panel leaves "Loading…" and keeps the pictures on screen.
				assert.deepEqual(events.map((event) => event.type), ['loading', 'notice']);
				assert.equal(events[1].requestId, events[0].requestId);
				assert.equal(
					events[1].message,
					'This picture tool cannot load more results. Try a different subject.'
				);
			} finally {
				stop();
				closeImageChannel();
			}
		}
	);
});

test('a count-based tool serves the next slice for page two', async () => {
	const countTool = {
		...pictureTool,
		name: 'brave_image_search',
		description: 'Search images',
		inputSchema: { type: 'object', properties: { query: {}, count: { maximum: 200 } } }
	};
	let args: Record<string, unknown> = {};
	await withSearchCore(
		{
			store: searchStore({
				tools: [countTool],
				imageSearchTool: { serverId: 'search', toolName: 'brave_image_search' }
			}),
			call: async (_server, _name, next) => {
				args = next as Record<string, unknown>;
				return {
					content: JSON.stringify({
						results: Array.from({ length: 36 }, (_, i) => ({
							url: `https://page.example/${i}`,
							properties: { url: `https://cdn.example/${i}.jpg` }
						}))
					})
				};
			}
		},
		async ({ searchImages, onImageShowEvent, closeImageChannel }) => {
			const events: Array<Record<string, any>> = [];
			const stop = onImageShowEvent((event: Record<string, any>) => events.push(event));
			try {
				const images = await searchImages('cats', 2);
				assert.equal(args.count, 24, 'the batch grows by one page');
				assert.deepEqual(events.map((event) => event.type), ['loading', 'results']);
				assert.equal(events[1].page, 2);
				assert.equal(images.length, 12, 'only the new slice is shown');
				assert.equal(images[0].url, 'https://page.example/12');
			} finally {
				stop();
				closeImageChannel();
			}
		}
	);
});

test('a count-based tool that cannot grow any further shows a notice', async () => {
	const countTool = {
		...pictureTool,
		name: 'search_photos',
		description: 'Search stock photos',
		inputSchema: { type: 'object', properties: { query: {}, count: { maximum: 24 } } }
	};
	let calls = 0;
	await withSearchCore(
		{
			store: searchStore({
				tools: [countTool],
				imageSearchTool: { serverId: 'search', toolName: 'search_photos' }
			}),
			call: async () => {
				calls++;
				return { content: '[]' };
			}
		},
		async ({ searchImages, onImageShowEvent, closeImageChannel }) => {
			const events: Array<Record<string, any>> = [];
			const stop = onImageShowEvent((event: Record<string, any>) => events.push(event));
			try {
				assert.deepEqual(await searchImages('cats', 3), []);
				assert.equal(calls, 0, 'a batch that cannot grow is not requested again');
				assert.deepEqual(events.map((event) => event.type), ['loading', 'notice']);
				assert.equal(events[1].requestId, events[0].requestId);
				assert.equal(
					events[1].message,
					'This picture tool cannot load more results. Try a different subject.'
				);
			} finally {
				stop();
				closeImageChannel();
			}
		}
	);
});

test('an empty follow-up page keeps the gallery and resolves the loading state', async () => {
	const countTool = {
		...pictureTool,
		name: 'brave_image_search',
		description: 'Search images',
		inputSchema: { type: 'object', properties: { query: {}, count: { maximum: 50 } } }
	};
	await withSearchCore(
		{
			store: searchStore({
				tools: [countTool],
				imageSearchTool: { serverId: 'search', toolName: 'brave_image_search' }
			}),
			call: async () => ({
				content: JSON.stringify({
					results: Array.from({ length: 10 }, (_, i) => ({
						url: `https://page.example/${i}`,
						properties: { url: `https://cdn.example/${i}.jpg` }
					}))
				})
			})
		},
		async ({ searchImages, onImageShowEvent, closeImageChannel }) => {
			const events: Array<Record<string, any>> = [];
			const stop = onImageShowEvent((event: Record<string, any>) => events.push(event));
			try {
				// Page two asks for 24, the tool returns only 10: the slice after
				// the first 12 is empty. The notice must resolve the loading state
				// (regression: the panel stayed on "Loading pictures…" forever).
				assert.deepEqual(await searchImages('cats', 2), []);
				assert.deepEqual(events.map((event) => event.type), ['loading', 'notice']);
				assert.equal(events[1].requestId, events[0].requestId);
				assert.equal(
					events[1].message,
					'This picture tool cannot load more results. Try a different subject.'
				);
			} finally {
				stop();
				closeImageChannel();
			}
		}
	);
});

test('an empty page of a page-based tool keeps the gallery', async () => {
	await withSearchCore(
		{
			store: searchStore(),
			call: async () => ({ content: '[]' })
		},
		async ({ searchImages, onImageShowEvent, closeImageChannel }) => {
			const events: Array<Record<string, any>> = [];
			const stop = onImageShowEvent((event: Record<string, any>) => events.push(event));
			try {
				assert.deepEqual(await searchImages('cats', 2), []);
				// A page tool that runs out of results is a limit, not a failure:
				// no error panel, no cleared gallery.
				assert.deepEqual(events.map((event) => event.type), ['loading', 'notice']);
				assert.equal(events.some((event) => event.type === 'error'), false);
			} finally {
				stop();
				closeImageChannel();
			}
		}
	);
});

test('searchImages refuses a confirmation-listed tool', async () => {
	let calls = 0;
	await withSearchCore(
		{
			store: searchStore(),
			call: async () => {
				calls++;
				return { content: '[]' };
			},
			publicEnv: { PUBLIC_MCP_CONFIRM_TOOLS: 'searxng_image_search' }
		},
		async ({ searchImages, onImageShowEvent, closeImageChannel }) => {
			const events: Array<Record<string, any>> = [];
			const stop = onImageShowEvent((event: Record<string, any>) => events.push(event));
			try {
				assert.deepEqual(await searchImages('cats'), []);
				assert.equal(calls, 0, 'the listed tool is not called');
				assert.deepEqual(events.map((event) => event.type), ['loading', 'error']);
				assert.equal(events[1].code, 'confirm_required');
			} finally {
				stop();
				closeImageChannel();
			}
		}
	);
});

test('searchImages surfaces a failed tool listing as search_failed', async () => {
	const events = await searchEvents({
		store: searchStore({ tools: [], toolsError: 'listing failed' }),
		call: async () => { throw new Error('should not run'); }
	});
	assert.deepEqual(events.map((event) => event.type), ['loading', 'error']);
	assert.equal(events[1].code, 'search_failed');
	assert.equal(events[1].message, 'Search failed: listing failed');
});

test('searchImages reports a discovery failure instead of throwing', async () => {
	const events = await searchEvents({
		store: searchStore({ ensureTools: async () => { throw new Error('discovery down'); } }),
		call: async () => { throw new Error('should not run'); }
	});
	assert.deepEqual(events.map((event) => event.type), ['loading', 'error']);
	assert.equal(events[1].code, 'search_failed');
	assert.equal(events[1].message, 'Search failed: discovery down');
});

test('searchImages reports tool_unavailable when the selected server is disabled', async () => {
	const events = await searchEvents({
		store: searchStore({
			servers: [{ id: 'search', name: 'Search', transport: 'http', url: 'http://search.local/mcp', enabled: false }],
			enabledServers: []
		}),
		call: async () => { throw new Error('should not run'); }
	});
	assert.deepEqual(events.map((event) => event.type), ['loading', 'error']);
	assert.equal(events[1].code, 'tool_unavailable');
});

test('searchImages reports a tool error result as search_failed', async () => {
	const events = await searchEvents({
		store: searchStore(),
		call: async () => ({ toolName: 'searxng_image_search', isError: true, content: 'boom' })
	});
	assert.deepEqual(events.map((event) => event.type), ['loading', 'error']);
	assert.equal(events[1].code, 'search_failed');
});

test('searchImages reports an image-less first page as empty_results', async () => {
	await withSearchCore(
		{ store: searchStore(), call: async () => ({ toolName: 'searxng_image_search', isError: false, content: 'nothing here' }) },
		async ({ searchImages, onImageShowEvent, closeImageChannel }) => {
			const events: Array<Record<string, any>> = [];
			const stop = onImageShowEvent((event: Record<string, any>) => events.push(event));
			try {
				assert.deepEqual(await searchImages('cats'), []);
				assert.deepEqual(events.map((event) => event.type), ['loading', 'error']);
				assert.equal(events[1].code, 'empty_results');
			} finally {
				stop();
				closeImageChannel();
			}
		}
	);
});

test('buildSearchArgs sends only declared options and paging above page one', async () => {
	await withSearchCore(
		{ store: searchStore(), call: async () => ({}) },
		async ({ buildSearchArgs }) => {
			assert.deepEqual(
				buildSearchArgs({ name: 'x', inputSchema: { properties: { query: {} } } }, 'q', 2),
				{ query: 'q' }
			);
			assert.deepEqual(
				buildSearchArgs({ name: 'x', inputSchema: { properties: { q: {}, page: {} } } }, 'q', 3),
				{ q: 'q', page: 3 }
			);
			assert.deepEqual(
				buildSearchArgs({ name: 'x', inputSchema: { properties: { q: {}, page_number: {} } } }, 'q', 4),
				{ q: 'q', page_number: 4 }
			);
			assert.deepEqual(
				buildSearchArgs(
					{
						name: 'x',
						inputSchema: {
							properties: { q: {}, pageno: {}, categories: {}, result_detail: {}, response_format: {} }
						}
					},
					'q',
					1
				),
				{ q: 'q', categories: 'images', result_detail: 'full', response_format: 'json' }
			);
			assert.deepEqual(
				buildSearchArgs({ name: 'x', inputSchema: { properties: { q: {}, format: {} } } }, 'q', 1),
				{ q: 'q', format: 'json' }
			);
			// Count-based tools keep their default on page one and grow the batch.
			assert.deepEqual(
				buildSearchArgs(
					{ name: 'x', inputSchema: { properties: { query: {}, count: { maximum: 200 } } } },
					'q',
					1
				),
				{ query: 'q' }
			);
			assert.deepEqual(
				buildSearchArgs(
					{ name: 'x', inputSchema: { properties: { query: {}, count: { maximum: 200 } } } },
					'q',
					2
				),
				{ query: 'q', count: 24 }
			);
			assert.deepEqual(
				buildSearchArgs(
					{ name: 'x', inputSchema: { properties: { query: {}, count: { maximum: 40 } } } },
					'q',
					5
				),
				{ query: 'q', count: 40 }
			);
		}
	);
});

test('searchImages clamps the page before it reaches the tool', async () => {
	const seen: Array<Record<string, unknown>> = [];
	await withSearchCore(
		{
			store: searchStore(),
			call: async (_server, _name, args) => {
				seen.push(args as Record<string, unknown>);
				return { toolName: 'searxng_image_search', isError: false, content: 'https://cdn.example/a.jpg' };
			}
		},
		async ({ searchImages, closeImageChannel }) => {
			try {
				await searchImages('q', 99);
				await searchImages('q', 0);
			} finally {
				closeImageChannel();
			}
		}
	);
	assert.equal(seen[0].pageno, 10);
	assert.equal('pageno' in seen[1], false);
});

test('fetchImage returns the first image block from the fetch tool', async () => {
	let callArgs: unknown[] = [];
	await withSearchCore(
		{
			store: searchStore({
				tools: [fetchTool],
				servers: [{ id: 'files', name: 'Files', transport: 'http', url: 'http://files.local/mcp', enabled: true, askBeforeRun: false }],
				enabledServers: [{ id: 'files', enabled: true }],
				imageSearchTool: null
			}),
			call: async (...args) => {
				callArgs = args;
				return {
					toolName: 'fetch_file_from_url',
					isError: false,
					content: '[image: image/png]',
					images: [{ mimeType: 'image/png', data: 'AAAA' }]
				};
			}
		},
		async ({ fetchImage, fetchImageAsDataUrl, closeImageChannel }) => {
			try {
				assert.deepEqual(await fetchImage('https://cdn.example/a.jpg'), {
					mimeType: 'image/png',
					data: 'AAAA'
				});
				assert.equal(callArgs[1], 'fetch_file_from_url');
				assert.deepEqual(callArgs[2], {
					url: 'https://cdn.example/a.jpg',
					max_dimension: 1280
				});
				assert.equal(
					await fetchImageAsDataUrl('https://cdn.example/a.jpg'),
					'data:image/png;base64,AAAA'
				);
				assert.equal(await fetchImage(''), null);
			} finally {
				closeImageChannel();
			}
		}
	);
});

test('fetchImage without confirm never calls the tool when the server asks first', async () => {
	let asked = 0;
	let called = false;
	await withSearchCore(
		{
			store: searchStore({
				tools: [fetchTool],
				servers: [{ id: 'files', name: 'Files', transport: 'http', url: 'http://files.local/mcp', enabled: true, askBeforeRun: true }],
				enabledServers: [{ id: 'files', enabled: true }],
				imageSearchTool: null,
				confirmToolCall: async () => {
					asked++;
					return true;
				}
			}),
			call: async () => {
				called = true;
				throw new Error('should not run');
			}
		},
		async ({ fetchImage, closeImageChannel }) => {
			try {
				assert.equal(await fetchImage('https://cdn.example/a.jpg'), null);
				assert.equal(asked, 0);
				assert.equal(called, false);
			} finally {
				closeImageChannel();
			}
		}
	);
});

test('fetchImage returns null without a fetch tool or an enabled server', async () => {
	await withSearchCore(
		{ store: searchStore({ tools: [] }), call: async () => { throw new Error('should not run'); } },
		async ({ fetchImage }) => {
			assert.equal(await fetchImage('https://cdn.example/a.jpg'), null);
		}
	);
	await withSearchCore(
		{
			store: searchStore({
				tools: [fetchTool],
				servers: [{ id: 'files', name: 'Files', transport: 'http', url: 'http://files.local/mcp', enabled: false }],
				enabledServers: []
			}),
			call: async () => { throw new Error('should not run'); }
		},
		async ({ fetchImage }) => {
			assert.equal(await fetchImage('https://cdn.example/a.jpg'), null);
		}
	);
});

test('image availability helpers follow the store state and closeImages publishes close', async () => {
	await withSearchCore(
		{ store: searchStore(), call: async () => ({}) },
		async ({ isShowImagesEnabled, hasConfiguredImageSearchTool, closeImages, onImageShowEvent, closeImageChannel }) => {
			assert.equal(isShowImagesEnabled(), true);
			assert.equal(hasConfiguredImageSearchTool(), true);
			const events: Array<Record<string, any>> = [];
			const stop = onImageShowEvent((event: Record<string, any>) => events.push(event));
			try {
				closeImages();
			} finally {
				stop();
				closeImageChannel();
			}
			assert.deepEqual(events.map((event) => event.type), ['close']);
		}
	);
	await withSearchCore(
		{ store: searchStore({ serverEnabled: false, enabledServers: [], tools: [] }), call: async () => ({}) },
		async ({ isShowImagesEnabled, hasConfiguredImageSearchTool }) => {
			assert.equal(isShowImagesEnabled(), false);
			assert.equal(hasConfiguredImageSearchTool(), false);
		}
	);
});


test('searchImages respects a per-server askBeforeRun and reports a declined search', async () => {
	let called = false;
	let asked = 0;
	const events = await searchEvents({
		store: searchStore({
			servers: [{ id: 'search', name: 'Search', transport: 'http', url: 'http://search.local/mcp', enabled: true, askBeforeRun: true }],
			confirmToolCall: async () => { asked++; return false; }
		}),
		call: async () => { called = true; throw new Error('should not run'); }
	});
	assert.equal(asked, 1);
	assert.equal(called, false);
	assert.equal(events.at(-1)?.type, 'error');
	assert.equal(events.at(-1)?.code, 'cancelled');
	assert.match(events.at(-1)?.message ?? '', /cancelled/);
});

test('searchImages runs the search after the user confirms', async () => {
	let asked = 0;
	let called = 0;
	const events = await searchEvents({
		store: searchStore({
			servers: [{ id: 'search', name: 'Search', transport: 'http', url: 'http://search.local/mcp', enabled: true, askBeforeRun: true }],
			confirmToolCall: async () => { asked++; return true; }
		}),
		call: async () => {
			called++;
			return { toolName: 'searxng_image_search', isError: false, content: 'https://cdn.example/castle.jpg' };
		}
	});
	assert.equal(asked, 1);
	assert.equal(called, 1);
	assert.deepEqual(events.map((event) => event.type), ['loading', 'results']);
});

test('fetchImage blocks metadata/private literals before calling the tool', async () => {
	let called = false;
	await withSearchCore(
		{
			store: searchStore({
				tools: [fetchTool],
				servers: [{ id: 'files', name: 'Files', transport: 'http', url: 'http://files.local/mcp', enabled: true, askBeforeRun: false }],
				enabledServers: [{ id: 'files', enabled: true }],
				imageSearchTool: null
			}),
			call: async () => { called = true; return { toolName: 'fetch_file_from_url', isError: false, content: '', images: [] }; }
		},
		async ({ fetchImage }) => {
			assert.equal(await fetchImage('http://169.254.169.254/latest/meta-data'), null);
		}
	);
	assert.equal(called, false);
});

test('fetchImage does not auto-fetch on a server that asks before running tools', async () => {
	let called = false;
	await withSearchCore(
		{
			store: searchStore({
				tools: [fetchTool],
				servers: [{ id: 'files', name: 'Files', transport: 'http', url: 'http://files.local/mcp', enabled: true, askBeforeRun: true }],
				enabledServers: [{ id: 'files', enabled: true }],
				imageSearchTool: null
			}),
			call: async () => { called = true; return { toolName: 'fetch_file_from_url', isError: false, content: '', images: [] }; }
		},
		async ({ fetchImage }) => {
			assert.equal(await fetchImage('https://example.com/a.png'), null);
		}
	);
	assert.equal(called, false);
});


test('fetchImage asks once when opened by the user and proceeds after confirmation', async () => {
	let asked = 0;
	let called = 0;
	await withSearchCore(
		{
			store: searchStore({
				tools: [fetchTool],
				servers: [{ id: 'files', name: 'Files', transport: 'http', url: 'http://files.local/mcp', enabled: true, askBeforeRun: true }],
				enabledServers: [{ id: 'files', enabled: true }],
				imageSearchTool: null,
				confirmToolCall: async () => { asked++; return true; }
			}),
			call: async () => {
				called++;
				return { toolName: 'fetch_file_from_url', isError: false, content: '[image: image/png]', images: [{ mimeType: 'image/png', data: 'AAAA' }] };
			}
		},
		async ({ fetchImage }) => {
			assert.deepEqual(await fetchImage('https://example.com/a.png', { confirm: true }), { mimeType: 'image/png', data: 'AAAA' });
		}
	);
	assert.equal(asked, 1);
	assert.equal(called, 1);
});

test('fetchImage aborts with ImageFetchCancelled when the user declines', async () => {
	let asked = 0;
	let called = false;
	await withSearchCore(
		{
			store: searchStore({
				tools: [fetchTool],
				servers: [{ id: 'files', name: 'Files', transport: 'http', url: 'http://files.local/mcp', enabled: true, askBeforeRun: true }],
				enabledServers: [{ id: 'files', enabled: true }],
				imageSearchTool: null,
				confirmToolCall: async () => { asked++; return false; }
			}),
			call: async () => {
				called = true;
				return { toolName: 'fetch_file_from_url', isError: false, content: '', images: [] };
			}
		},
		async ({ fetchImage, ImageFetchCancelled }) => {
			await assert.rejects(
				() => fetchImage('https://example.com/a.png', { confirm: true }),
				ImageFetchCancelled
			);
		}
	);
	assert.equal(asked, 1);
	assert.equal(called, false);
});

test('fetchImage skips a confirmation-listed file fetcher', async () => {
	let calls = 0;
	await withSearchCore(
		{
			store: searchStore({
				tools: [fetchTool],
				servers: [{ id: 'files', name: 'Files', transport: 'http', url: 'http://files.local/mcp', enabled: true, askBeforeRun: false }],
				enabledServers: [{ id: 'files', enabled: true }],
				imageSearchTool: null
			}),
			call: async () => {
				calls++;
				return { images: [{ mimeType: 'image/png', data: 'AA' }] };
			},
			publicEnv: { PUBLIC_MCP_CONFIRM_TOOLS: 'fetch_file_from_url' }
		},
		async ({ fetchImage }) => {
			assert.equal(await fetchImage('https://example.com/a.png'), null);
			assert.equal(calls, 0, 'the listed file fetcher is not called');
		}
	);
});

test('openImageResult opens a source page directly with noopener', async () => {
	await withSearchCore(
		{ store: searchStore(), call: async () => { throw new Error('should not fetch'); } },
		async ({ openImageResult }) => {
			const popup = { opener: 'x' as unknown, location: { href: '' }, close() {} };
			const opened: string[] = [];
			const globals = globalThis as unknown as { window?: unknown };
			const previous = globals.window;
			globals.window = { open: (url: string) => { opened.push(url); return popup; } };
			try {
				assert.equal(await openImageResult('https://example.com/article'), 'opened');
				assert.deepEqual(opened, ['https://example.com/article']);
				assert.equal(popup.opener, null);
			} finally {
				globals.window = previous;
			}
		}
	);
});

test('openImageResult reports a blocked popup instead of a generic failure', async () => {
	await withSearchCore(
		{ store: searchStore(), call: async () => { throw new Error('should not fetch'); } },
		async ({ openImageResult }) => {
			const globals = globalThis as unknown as { window?: unknown };
			const previous = globals.window;
			globals.window = { open: () => null };
			try {
				assert.equal(await openImageResult('https://example.com/article'), 'blocked');
			} finally {
				globals.window = previous;
			}
		}
	);
});

test('openImageResult rejects non-raster data URLs without opening a tab', async () => {
	await withSearchCore(
		{ store: searchStore(), call: async () => { throw new Error('should not fetch'); } },
		async ({ openImageResult }) => {
			let opened = 0;
			const globals = globalThis as unknown as { window?: unknown };
			const previous = globals.window;
			globals.window = { open: () => { opened++; return { opener: null, location: { href: '' }, close() {} }; } };
			try {
				assert.equal(await openImageResult('data:image/svg+xml;base64,AA'), 'failed');
				assert.equal(opened, 0);
			} finally {
				globals.window = previous;
			}
		}
	);
});

test('openImageResult renders a raster data URL through a blob', async () => {
	await withSearchCore(
		{ store: searchStore(), call: async () => { throw new Error('should not fetch'); } },
		async ({ openImageResult }) => {
			const popup = { opener: null as unknown, location: { href: '' }, close() {} };
			const globals = globalThis as unknown as { window?: unknown };
			const previous = globals.window;
			globals.window = { open: () => popup };
			const urlApi = URL as unknown as { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void };
			const previousCreate = urlApi.createObjectURL;
			const previousRevoke = urlApi.revokeObjectURL;
			urlApi.createObjectURL = () => 'blob:test';
			urlApi.revokeObjectURL = () => {};
			try {
				assert.equal(await openImageResult('data:image/png;base64,AAAA'), 'opened');
				assert.equal(popup.location.href, 'blob:test');
			} finally {
				urlApi.createObjectURL = previousCreate;
				urlApi.revokeObjectURL = previousRevoke;
				globals.window = previous;
			}
		}
	);
});

test('openImageResult reports a cancelled confirmation', async () => {
	await withSearchCore(
		{
			store: searchStore({
				tools: [fetchTool],
				servers: [{ id: 'files', name: 'Files', transport: 'http', url: 'http://files.local/mcp', enabled: true, askBeforeRun: true }],
				enabledServers: [{ id: 'files', enabled: true }],
				imageSearchTool: null,
				confirmToolCall: async () => false
			}),
			call: async () => { throw new Error('should not call'); }
		},
		async ({ openImageResult }) => {
			let closed = false;
			const popup = { opener: null, location: { href: '' }, close: () => { closed = true; } };
			const globals = globalThis as unknown as { window?: unknown };
			const previous = globals.window;
			globals.window = { open: () => popup };
			try {
				assert.equal(await openImageResult('https://cdn.example.com/a.png'), 'cancelled');
				assert.equal(closed, true);
			} finally {
				globals.window = previous;
			}
		}
	);
});

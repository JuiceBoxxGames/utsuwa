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
	fixture: { store: Record<string, unknown>; call: (...args: unknown[]) => Promise<unknown> },
	fn: (mod: Record<string, any>) => Promise<void>
): Promise<void> {
	const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.__imageSearchFixture = fixture;
	const replacements: Record<string, string> = {
		'src/lib/stores/mcp.svelte': 'export const mcpStore = globalThis.__imageSearchFixture.store;',
		'src/lib/services/mcp/capability': 'export const callTool = (...args) => globalThis.__imageSearchFixture.call(...args);'
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
		'src/lib/services/mcp/capability': 'export const callTool = (...args) => globalThis.__imageSearchFixture.call(...args);'
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
		'src/lib/services/mcp/capability': 'export const callTool = (...args) => globalThis.__imageSearchFixture.call(...args);'
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

test('searchImages publishes nothing for an empty query', async () => {
	await withSearchCore(
		{ store: searchStore(), call: async () => { throw new Error('should not run'); } },
		async ({ searchImages, onImageShowEvent, closeImageChannel }) => {
			const events: Array<Record<string, any>> = [];
			const stop = onImageShowEvent((event: Record<string, any>) => events.push(event));
			try {
				assert.deepEqual(await searchImages('   '), []);
				assert.deepEqual(events, []);
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

test('searchImages reports an image-less result as empty_results', async () => {
	const events = await searchEvents({
		store: searchStore(),
		call: async () => ({ toolName: 'searxng_image_search', isError: false, content: 'nothing here' })
	});
	assert.deepEqual(events.map((event) => event.type), ['loading', 'error']);
	assert.equal(events[1].code, 'empty_results');
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

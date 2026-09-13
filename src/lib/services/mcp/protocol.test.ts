import test from 'node:test';
import assert from 'node:assert/strict';
import {
	buildAuthHeaders,
	buildInitializedNotification,
	buildInitializeRequest,
	buildRpcRequest,
	combineServerResults,
	isServerMcpEnabled,
	isAllowedMcpHttpUrl,
	isBlockedMcpHost,
	isStdioCommandAllowed,
	mergeStdioEnv,
	mcpUrlCandidates,
	parseEnvLines,
	parseJsonRpcResult,
	parseQuotedArgs,
	parseSseResult,
	parseToolNameList,
	parseToolsList,
	pickStdioEnv,
	resolveCapabilityFromProbe,
	singleFlight,
	stdioDenyReason,
	stringifyToolResult
} from './protocol.ts';

test('isServerMcpEnabled: server and both enable the routes', () => {
	assert.equal(isServerMcpEnabled('server'), true);
	assert.equal(isServerMcpEnabled('both'), true);
});

test('isServerMcpEnabled: unset, off and reserved modes stay off', () => {
	assert.equal(isServerMcpEnabled(undefined), false);
	assert.equal(isServerMcpEnabled(null), false);
	assert.equal(isServerMcpEnabled(''), false);
	assert.equal(isServerMcpEnabled('off'), false);
	assert.equal(isServerMcpEnabled('client'), false);
	assert.equal(isServerMcpEnabled('true'), false);
});

test('resolveCapabilityFromProbe maps 404 to none and success to server', () => {
	assert.equal(resolveCapabilityFromProbe(404, 'unknown'), 'none');
	assert.equal(resolveCapabilityFromProbe(200, 'unknown'), 'server');
});

test('resolveCapabilityFromProbe keeps a known capability on transient errors', () => {
	assert.equal(resolveCapabilityFromProbe(500, 'server'), 'server');
	assert.equal(resolveCapabilityFromProbe(503, 'client'), 'client');
	assert.equal(resolveCapabilityFromProbe(500, 'unknown'), 'none');
	assert.equal(resolveCapabilityFromProbe(401, 'none'), 'none');
});

test('mcpUrlCandidates tries the configured form first, then the slash variant', () => {
	assert.deepEqual(mcpUrlCandidates('http://ha.local:8123/api/mcp'), [
		'http://ha.local:8123/api/mcp',
		'http://ha.local:8123/api/mcp/'
	]);
});

test('mcpUrlCandidates normalizes trailing slashes and whitespace', () => {
	assert.deepEqual(mcpUrlCandidates('  http://ha.local:8123/api/mcp/  '), [
		'http://ha.local:8123/api/mcp',
		'http://ha.local:8123/api/mcp/'
	]);
	assert.deepEqual(mcpUrlCandidates('http://ha.local:8123'), [
		'http://ha.local:8123',
		'http://ha.local:8123/'
	]);
});

test('mcpUrlCandidates returns no candidates for empty input', () => {
	assert.deepEqual(mcpUrlCandidates(''), []);
	assert.deepEqual(mcpUrlCandidates('   '), []);
});

test('buildAuthHeaders: bearer with token adds the Authorization header', () => {
	assert.deepEqual(buildAuthHeaders({ type: 'bearer', token: 'abc' }), {
		Authorization: 'Bearer abc'
	});
});

test('buildAuthHeaders: none and empty bearer add no header', () => {
	assert.deepEqual(buildAuthHeaders({ type: 'none' }), {});
	assert.deepEqual(buildAuthHeaders(undefined), {});
	assert.deepEqual(buildAuthHeaders({ type: 'bearer', token: '' }), {});
});

test('buildRpcRequest and initialize request carry the JSON-RPC shape', () => {
	assert.deepEqual(buildRpcRequest(7, 'tools/list', {}), {
		jsonrpc: '2.0',
		id: 7,
		method: 'tools/list',
		params: {}
	});
	const init = buildInitializeRequest(1);
	assert.equal(init.method, 'initialize');
	assert.equal(init.params.protocolVersion, '2024-11-05');
	assert.equal(buildInitializedNotification().method, 'notifications/initialized');
});

test('parseJsonRpcResult returns the result and throws on errors', () => {
	assert.deepEqual(parseJsonRpcResult({ result: { tools: [] } }), { tools: [] });
	assert.throws(() => parseJsonRpcResult({ error: { message: 'boom' } }), /boom/);
	assert.throws(() => parseJsonRpcResult(null), /empty response/);
});

test('parseSseResult reads the first data line', () => {
	const sse = 'event: message\ndata: {"result":{"ok":true}}\n\n';
	assert.deepEqual(parseSseResult(sse), { ok: true });
});

test('parseSseResult skips keep-alive lines and [DONE]', () => {
	const sse = 'data: [DONE]\n\ndata: {"result":42}\n';
	assert.equal(parseSseResult(sse), 42);
});

test('parseSseResult throws without a data line and on JSON-RPC errors', () => {
	assert.throws(() => parseSseResult('event: ping\n\n'), /no data/);
	assert.throws(() => parseSseResult('data: {"error":{"message":"nope"}}\n'), /nope/);
});

test('parseSseResult reports malformed JSON in a data line', () => {
	assert.throws(() => parseSseResult('data: {not json}\n\n'), /invalid JSON in SSE response/);
});

test('parseToolsList maps tools and tolerates missing fields', () => {
	const tools = parseToolsList({
		tools: [
			{ name: 'get_state', description: 'Read a state', inputSchema: { type: 'object' } },
			{ description: 'nameless tool' },
			null
		]
	});
	assert.equal(tools.length, 1);
	assert.equal(tools[0].name, 'get_state');
	assert.equal(tools[0].description, 'Read a state');
});

test('parseToolsList returns an empty list for malformed results', () => {
	assert.deepEqual(parseToolsList(undefined), []);
	assert.deepEqual(parseToolsList({}), []);
	assert.deepEqual(parseToolsList({ tools: 'nope' }), []);
});

test('stringifyToolResult joins text parts and falls back to JSON', () => {
	assert.equal(
		stringifyToolResult({ content: [{ type: 'text', text: 'line 1' }, { type: 'text', text: 'line 2' }] }),
		'line 1\nline 2'
	);
	assert.equal(
		stringifyToolResult({ content: [{ type: 'image', data: 'x' }] }),
		JSON.stringify({ content: [{ type: 'image', data: 'x' }] })
	);
	assert.equal(stringifyToolResult(null), '');
});

test('combineServerResults collects fulfilled values in order', () => {
	const { values, errors } = combineServerResults(
		[{ status: 'fulfilled', value: ['a'] }, { status: 'fulfilled', value: ['b'] }],
		[{ id: 's1', name: 'One' }, { id: 's2', name: 'Two' }]
	);
	assert.deepEqual(values, [['a'], ['b']]);
	assert.deepEqual(errors, []);
});

test('combineServerResults turns rejections into per-server errors', () => {
	const { values, errors } = combineServerResults(
		[{ status: 'fulfilled', value: ['a'] }, { status: 'rejected', reason: new Error('401: Unauthorized') }],
		[{ id: 's1', name: 'One' }, { id: 's2', name: 'Two' }]
	);
	assert.deepEqual(values, [['a']]);
	assert.deepEqual(errors, [{ serverId: 's2', serverName: 'Two', message: '401: Unauthorized' }]);
});

test('combineServerResults stringifies non-Error reasons and labels missing servers', () => {
	const { errors } = combineServerResults([{ status: 'rejected', reason: 'boom' }], []);
	assert.equal(errors[0].message, 'boom');
	assert.equal(errors[0].serverName, 'Unknown server');
	assert.equal(errors[0].serverId, '');
});

test('isAllowedMcpHttpUrl accepts http and https endpoints', () => {
	assert.equal(isAllowedMcpHttpUrl('http://homeassistant.local:8123/api/mcp'), true);
	assert.equal(isAllowedMcpHttpUrl('https://api.githubcopilot.com/mcp/'), true);
});

test('isAllowedMcpHttpUrl rejects non-http schemes and garbage', () => {
	assert.equal(isAllowedMcpHttpUrl('file:///etc/passwd'), false);
	assert.equal(isAllowedMcpHttpUrl('data:text/plain,hi'), false);
	assert.equal(isAllowedMcpHttpUrl('ftp://example.com/mcp'), false);
	assert.equal(isAllowedMcpHttpUrl('not a url'), false);
	assert.equal(isAllowedMcpHttpUrl(''), false);
});

test('parseToolNameList trims and drops blank entries', () => {
	assert.deepEqual(parseToolNameList('unlock_door, set_alarm'), ['unlock_door', 'set_alarm']);
	assert.deepEqual(parseToolNameList(' get_state ,, set_state ,'), ['get_state', 'set_state']);
});

test('parseToolNameList returns an empty list when unset or blank', () => {
	assert.deepEqual(parseToolNameList(undefined), []);
	assert.deepEqual(parseToolNameList(null), []);
	assert.deepEqual(parseToolNameList(''), []);
	assert.deepEqual(parseToolNameList(' , , '), []);
});

test('isBlockedMcpHost blocks link-local and metadata hosts', () => {
	assert.equal(isBlockedMcpHost('169.254.169.254'), true);
	assert.equal(isBlockedMcpHost('::ffff:169.254.169.254'), true);
	assert.equal(isBlockedMcpHost('fe80::1'), true);
	assert.equal(isBlockedMcpHost('[fe80::1]'), true);
	assert.equal(isBlockedMcpHost('metadata.google.internal'), true);
});

test('isBlockedMcpHost covers cloud metadata aliases and IPv6 endpoints', () => {
	assert.equal(isBlockedMcpHost('metadata'), true);
	assert.equal(isBlockedMcpHost('instance-data'), true);
	assert.equal(isBlockedMcpHost('metadata.goog'), true);
	assert.equal(isBlockedMcpHost('100.100.100.200'), true);
	assert.equal(isBlockedMcpHost('fd00:ec2::254'), true);
	assert.equal(isBlockedMcpHost('[fd00:ec2::254]'), true);
});

test('isBlockedMcpHost keeps loopback, RFC1918 and public hosts reachable', () => {
	assert.equal(isBlockedMcpHost('127.0.0.1'), false);
	assert.equal(isBlockedMcpHost('192.168.10.3'), false);
	assert.equal(isBlockedMcpHost('homeassistant.local'), false);
	assert.equal(isBlockedMcpHost('api.githubcopilot.com'), false);
});

test('isStdioCommandAllowed is fail-closed without an allowlist', () => {
	assert.equal(isStdioCommandAllowed('rm', []), false);
	assert.equal(isStdioCommandAllowed('npx', []), false);
	assert.equal(isStdioCommandAllowed(undefined, []), false);
});

test('isStdioCommandAllowed enforces a configured allowlist and the wildcard', () => {
	assert.equal(isStdioCommandAllowed('npx', ['npx', 'node']), true);
	assert.equal(isStdioCommandAllowed('rm', ['npx', 'node']), false);
	assert.equal(isStdioCommandAllowed(undefined, ['npx']), false);
	assert.equal(isStdioCommandAllowed('rm', ['*']), true);
});

test('stdioDenyReason explains disabled vs not-allowed', () => {
	assert.equal(stdioDenyReason('npx', ['npx']), null);
	assert.match(stdioDenyReason('npx', []) ?? '', /disabled/);
	assert.match(stdioDenyReason('rm', ['npx']) ?? '', /not allowed/);
});

test('pickStdioEnv keeps only the safe environment subset', () => {
	const picked = pickStdioEnv({
		PATH: '/usr/bin',
		HOME: '/home/u',
		LANG: 'en_US.UTF-8',
		DATABASE_URL: 'postgres://secret',
		OPENAI_API_KEY: 'sk-secret',
		BRAVE_API_KEY: 'brave-secret',
		EMPTY: undefined
	});
	assert.deepEqual(picked, { PATH: '/usr/bin', HOME: '/home/u', LANG: 'en_US.UTF-8' });
});

test('pickStdioEnv matches Windows-style casing and per-server env adds secrets', () => {
	const base = pickStdioEnv({ Path: 'C:\\Windows', TEMP: 'C:\\Temp', SECRET: 'x' });
	assert.deepEqual(base, { Path: 'C:\\Windows', TEMP: 'C:\\Temp' });
	const merged = mergeStdioEnv(base, { BRAVE_API_KEY: 'brave-secret' });
	assert.equal(merged.BRAVE_API_KEY, 'brave-secret');
	assert.equal(merged.SECRET, undefined);
});

test('mergeStdioEnv blocks critical variables from the server config', () => {
	const merged = mergeStdioEnv(
		{ PATH: '/usr/bin', HOME: '/home/u' },
		{ SEARXNG_URL: 'http://x', PATH: '/evil', NODE_OPTIONS: '--require ./x' }
	);
	assert.equal(merged.SEARXNG_URL, 'http://x');
	assert.equal(merged.PATH, '/usr/bin');
	assert.equal(merged.HOME, '/home/u');
	assert.equal(merged.NODE_OPTIONS, undefined);
});

test('parseQuotedArgs keeps quoted arguments with spaces intact', () => {
	assert.deepEqual(parseQuotedArgs('-y mcp-searxng'), ['-y', 'mcp-searxng']);
	assert.deepEqual(parseQuotedArgs('--config "/path/with spaces/x.json" --flag'), [
		'--config',
		'/path/with spaces/x.json',
		'--flag'
	]);
	assert.deepEqual(parseQuotedArgs("--name 'a b'"), ['--name', 'a b']);
	assert.deepEqual(parseQuotedArgs(''), []);
});

test('singleFlight collapses concurrent calls into one invocation', async () => {
	let calls = 0;
	let resolve!: (value: string) => void;
	const run = singleFlight(() => {
		calls++;
		return new Promise<string>((r) => (resolve = r));
	});
	const first = run();
	const second = run();
	assert.equal(calls, 1);
	resolve('done');
	assert.deepEqual(await Promise.all([first, second]), ['done', 'done']);
});

test('singleFlight runs again after the previous call settled', async () => {
	let calls = 0;
	const run = singleFlight(async () => ++calls);
	assert.equal(await run(), 1);
	assert.equal(await run(), 2);
});

test('singleFlight resets after a rejection so a retry can run', async () => {
	let calls = 0;
	const run = singleFlight(async () => {
		calls++;
		if (calls === 1) throw new Error('boom');
		return 'ok';
	});
	await assert.rejects(() => run(), /boom/);
	assert.equal(await run(), 'ok');
	assert.equal(calls, 2);
});

test('parseEnvLines parses KEY=value, ignores comments and blanks', () => {
	assert.deepEqual(parseEnvLines('A=1\n# comment\n\nB = two words \nbroken\nC='), {
		A: '1',
		B: 'two words',
		C: ''
	});
	assert.deepEqual(parseEnvLines(''), {});
});

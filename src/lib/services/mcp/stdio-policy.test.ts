import test from 'node:test';
import assert from 'node:assert/strict';
import {
	applyStdioPolicy,
	createLimiter,
	filterStdioEnv,
	isStdioLaunchAllowed,
	parseStdioAllowlist,
	stdioDenyReason
} from './stdio-policy.ts';
import { mergeStdioEnv } from './protocol.ts';

const BRAVE = 'npx -y @modelcontextprotocol/server-brave-search';

test('parseStdioAllowlist reads full command lines and a trailing *', () => {
	assert.deepEqual(parseStdioAllowlist(` ${BRAVE} , node "./my server.mjs" *,, `), [
		{ command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], extraArgs: false },
		{ command: 'node', args: ['./my server.mjs'], extraArgs: true }
	]);
	assert.deepEqual(parseStdioAllowlist('*'), [{ command: '*', args: [], extraArgs: true }]);
	assert.deepEqual(parseStdioAllowlist(undefined), []);
	assert.deepEqual(parseStdioAllowlist(' , '), []);
});

test('the exact command line is allowed', () => {
	const entries = parseStdioAllowlist(BRAVE);
	assert.equal(isStdioLaunchAllowed('npx', ['-y', '@modelcontextprotocol/server-brave-search'], entries), true);
});

test('a bare command name no longer allows arbitrary arguments', () => {
	const entries = parseStdioAllowlist('npx,node,uvx');
	assert.equal(isStdioLaunchAllowed('node', ['-e', 'require("child_process")'], entries), false);
	assert.equal(isStdioLaunchAllowed('npx', ['-y', 'evil-package'], entries), false);
	assert.equal(isStdioLaunchAllowed('node', [], entries), true);
});

test('extra, missing, reordered, or different arguments are rejected', () => {
	const entries = parseStdioAllowlist(BRAVE);
	assert.equal(isStdioLaunchAllowed('npx', ['-y', '@modelcontextprotocol/server-brave-search', '--x'], entries), false);
	assert.equal(isStdioLaunchAllowed('npx', ['-y'], entries), false);
	assert.equal(isStdioLaunchAllowed('npx', ['@modelcontextprotocol/server-brave-search', '-y'], entries), false);
	assert.equal(isStdioLaunchAllowed('npx', ['-y', '@modelcontextprotocol/server-brave-searc'], entries), false);
	assert.equal(isStdioLaunchAllowed('/usr/bin/npx', ['-y', '@modelcontextprotocol/server-brave-search'], entries), false);
	assert.equal(isStdioLaunchAllowed('node', ['-y', '@modelcontextprotocol/server-brave-search'], entries), false);
	assert.equal(isStdioLaunchAllowed(undefined, [], entries), false);
});

test('an entry ending in * allows further arguments after its prefix', () => {
	const entries = parseStdioAllowlist('npx -y @modelcontextprotocol/server-filesystem *');
	assert.equal(isStdioLaunchAllowed('npx', ['-y', '@modelcontextprotocol/server-filesystem'], entries), true);
	assert.equal(isStdioLaunchAllowed('npx', ['-y', '@modelcontextprotocol/server-filesystem', '/srv/a', '/srv/b'], entries), true);
	assert.equal(isStdioLaunchAllowed('npx', ['-y', 'other-package', '/srv/a'], entries), false);
	assert.equal(isStdioLaunchAllowed('npx', ['-e', '@modelcontextprotocol/server-filesystem'], entries), false);
});

test('a bare * allows every command line', () => {
	const entries = parseStdioAllowlist('*');
	assert.equal(isStdioLaunchAllowed('node', ['-e', 'anything'], entries), true);
	assert.equal(isStdioLaunchAllowed(undefined, [], entries), false);
});

test('stdio is fail-closed without an allowlist', () => {
	assert.equal(isStdioLaunchAllowed('npx', [], []), false);
	assert.match(stdioDenyReason('npx', [], []) ?? '', /stdio is disabled/);
	assert.match(stdioDenyReason('node', ['-e', 'x'], parseStdioAllowlist(BRAVE)) ?? '', /not allowed.*MCP_STDIO_ALLOWED_COMMANDS/);
	assert.equal(stdioDenyReason('npx', ['-y', '@modelcontextprotocol/server-brave-search'], parseStdioAllowlist(BRAVE)), null);
});

test('client env vars are dropped unless their names are allowlisted', () => {
	assert.deepEqual(filterStdioEnv({ BRAVE_API_KEY: 'k', EVIL: 'x' }, ['BRAVE_API_KEY']), { BRAVE_API_KEY: 'k' });
	assert.deepEqual(filterStdioEnv({ BRAVE_API_KEY: 'k' }, []), {});
	assert.deepEqual(filterStdioEnv(undefined, ['BRAVE_API_KEY']), {});
	assert.deepEqual(filterStdioEnv({ brave_api_key: 'k' }, ['BRAVE_API_KEY']), {}, 'names match exactly');
});

test('the deny list wins over the env allowlist', () => {
	const denied = {
		NODE_OPTIONS: '--require ./x',
		BASH_ENV: '/tmp/x',
		PYTHONPATH: '/tmp',
		NPM_CONFIG_REGISTRY: 'http://evil',
		npm_config_userconfig: '/tmp/npmrc',
		PATH: '/evil',
		LD_PRELOAD: '/tmp/x.so'
	};
	assert.deepEqual(filterStdioEnv(denied, Object.keys(denied)), {});
	const merged = mergeStdioEnv({ PATH: '/usr/bin' }, denied);
	assert.deepEqual(merged, { PATH: '/usr/bin' });
});

test('applyStdioPolicy denies or returns the server with a filtered env', () => {
	const server = {
		id: 'b', name: 'Brave', transport: 'stdio' as const, enabled: true,
		command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'],
		env: { BRAVE_API_KEY: 'k', NODE_OPTIONS: '--require ./x', OTHER: 'y' }
	};
	const allowed = applyStdioPolicy(server, { MCP_STDIO_ALLOWED_COMMANDS: BRAVE, MCP_STDIO_ENV_ALLOWLIST: 'BRAVE_API_KEY,NODE_OPTIONS' });
	assert.ok('server' in allowed);
	assert.deepEqual(allowed.server.env, { BRAVE_API_KEY: 'k' });
	assert.deepEqual(allowed.server.args, server.args);

	const denied = applyStdioPolicy({ ...server, command: 'node', args: ['-e', 'x'] }, { MCP_STDIO_ALLOWED_COMMANDS: BRAVE });
	assert.ok('error' in denied);
	assert.match(denied.error, /not allowed/);

	assert.ok('error' in applyStdioPolicy({ ...server, args: 'nope' as unknown as string[] }, { MCP_STDIO_ALLOWED_COMMANDS: '*' }));
});

test('createLimiter never runs more than the limit at once', async () => {
	const limit = createLimiter(2);
	let running = 0;
	let peak = 0;
	const results = await Promise.allSettled(
		[1, 2, 3, 4, 5].map((n) =>
			limit(async () => {
				running++;
				peak = Math.max(peak, running);
				await new Promise((r) => setTimeout(r, 5));
				running--;
				if (n === 3) throw new Error('boom');
				return n;
			})
		)
	);
	assert.equal(peak, 2);
	assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
});

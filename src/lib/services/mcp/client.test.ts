import test from 'node:test';
import assert from 'node:assert/strict';
import { listTools, callTool } from './client.ts';
import type { McpServerConfig } from '$lib/types/mcp';

const stdioConfig: McpServerConfig = {
	id: 'echo',
	name: 'Echo',
	transport: 'stdio',
	command: 'node',
	enabled: true
};

test('desktop listTools reports stdio as an error instead of an empty list', async () => {
	await assert.rejects(listTools(stdioConfig), /only available in the server/);
});

test('desktop callTool reports stdio as an error result', async () => {
	const result = await callTool(stdioConfig, 'echo', {});
	assert.equal(result.isError, true);
	assert.match(result.content, /only available in the server/);
});

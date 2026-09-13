import test from 'node:test';
import assert from 'node:assert/strict';
import {
	buildAssistantToolMessage,
	buildToolResultMessages,
	capToolResult,
	ensureToolPairs,
	findMcpTool,
	mcpCallsOnly,
	splitToolCalls,
	speechToolAck,
	stripFromStateFence,
	toOpenAiTool
} from './loop.ts';
import type { McpCollectedToolCall, McpTool } from '$lib/types/mcp';

const TOOL: McpTool = {
	serverId: 's1',
	serverName: 'Home Assistant',
	name: 'get_state',
	description: 'Read an entity state',
	inputSchema: { type: 'object', properties: { entity_id: { type: 'string' } }, required: ['entity_id'] }
};

test('toOpenAiTool maps an MCP tool to an OpenAI tool definition', () => {
	const def = toOpenAiTool(TOOL);
	assert.equal(def.type, 'function');
	assert.equal(def.function.name, 'get_state');
	assert.equal(def.function.description, 'Read an entity state');
	assert.deepEqual(def.function.parameters, TOOL.inputSchema);
});

test('toOpenAiTool strips outputSchema and does not mutate the source', () => {
	const withOutput = { ...TOOL, inputSchema: { ...TOOL.inputSchema, outputSchema: { type: 'object' } } };
	const def = toOpenAiTool(withOutput);
	assert.equal('outputSchema' in def.function.parameters, false);
	assert.equal('outputSchema' in withOutput.inputSchema, true);
});

test('stripFromStateFence cuts at the first fence', () => {
	assert.equal(stripFromStateFence('Hallo.\n```json\n{}\n```'), 'Hallo.\n');
	assert.equal(stripFromStateFence('No fence here.'), 'No fence here.');
	assert.equal(stripFromStateFence('```json\n{}\n```'), '');
});

test('stripFromStateFence cuts at the first of multiple fences', () => {
	const text = 'First.\n```json\n{"a":1}\n```\nrepeat\n```json\n{"b":2}\n```\nend';
	assert.equal(stripFromStateFence(text), 'First.\n');
});

test('buildAssistantToolMessage keeps text and stringifies call args', () => {
	const calls: McpCollectedToolCall[] = [{ id: 'c1', name: 'get_state', args: { entity_id: 'light.kitchen' } }];
	const message = buildAssistantToolMessage('Let me check.', calls);
	assert.equal(message.role, 'assistant');
	assert.equal(message.content, 'Let me check.');
	assert.equal(message.tool_calls?.length, 1);
	assert.equal(message.tool_calls?.[0].id, 'c1');
	assert.equal(message.tool_calls?.[0].function.name, 'get_state');
	assert.deepEqual(JSON.parse(message.tool_calls![0].function.arguments), { entity_id: 'light.kitchen' });
});

test('buildToolResultMessages answers every call with a tool message', () => {
	const calls: McpCollectedToolCall[] = [
		{ id: 'c1', name: 'get_state', args: {} },
		{ id: 'c2', name: 'speak_segment', args: { text: 'Hi' } }
	];
	const messages = buildToolResultMessages([
		{ call: calls[0], content: 'light.kitchen is on' },
		{ call: calls[1], content: speechToolAck(calls[1].args) }
	]);
	assert.equal(messages.length, 2);
	assert.equal(messages[0].role, 'tool');
	assert.equal(messages[0].tool_call_id, 'c1');
	assert.equal(messages[0].content, 'light.kitchen is on');
	assert.equal(messages[1].tool_call_id, 'c2');
});

test('buildToolResultMessages adds a user-side copy when injectAsUser is set', () => {
	const call: McpCollectedToolCall = { id: 'c1', name: 'search', args: {} };
	const messages = buildToolResultMessages([{ call, content: 'result text', injectAsUser: true }]);
	assert.equal(messages.length, 2);
	assert.equal(messages[0].role, 'tool');
	assert.equal(messages[1].role, 'user');
	assert.match(messages[1].content, /result text/);
});

test('speechToolAck mirrors the server-side no-op result shape', () => {
	assert.equal(speechToolAck({ text: 'Hi' }), JSON.stringify({ result: { text: 'Hi' } }));
});

test('mcpCallsOnly filters speech calls out and keeps MCP calls', () => {
	const calls: McpCollectedToolCall[] = [
		{ id: 'c1', name: 'speak_segment', args: {} },
		{ id: 'c2', name: 'get_state', args: {} }
	];
	const filtered = mcpCallsOnly(calls, [TOOL]);
	assert.deepEqual(
		filtered.map((c) => c.id),
		['c2']
	);
	assert.deepEqual(mcpCallsOnly(calls, []), []);
});

test('findMcpTool finds by name and returns undefined otherwise', () => {
	assert.equal(findMcpTool([TOOL], 'get_state')?.serverId, 's1');
	assert.equal(findMcpTool([TOOL], 'missing'), undefined);
});

test('splitToolCalls caps the calls that run and reports the excess', () => {
	const calls = Array.from({ length: 10 }, (_, i) => i);
	const { run, skipped } = splitToolCalls(calls, 8);
	assert.deepEqual(run, [0, 1, 2, 3, 4, 5, 6, 7]);
	assert.deepEqual(skipped, [8, 9]);
	assert.deepEqual(splitToolCalls([1, 2]).skipped, []);
});

test('capToolResult truncates oversized results with a marker', () => {
	assert.equal(capToolResult('short'), 'short');
	const capped = capToolResult('x'.repeat(100), 50);
	assert.equal(capped, `${'x'.repeat(50)}\n…[truncated]`);
});

test('ensureToolPairs re-attaches the assistant parent of a kept tool message', () => {
	const all = [
		{ role: 'user' as const },
		{ role: 'assistant' as const },
		{ role: 'tool' as const },
		{ role: 'tool' as const },
		{ role: 'assistant' as const }
	];
	const repaired = ensureToolPairs(all, all.slice(2));
	assert.equal(repaired.length, 4);
	assert.equal(repaired[0].role, 'assistant');
	assert.equal(repaired[1].role, 'tool');
	assert.deepEqual(ensureToolPairs(all, all.slice(4)), all.slice(4));
	assert.deepEqual(ensureToolPairs(all, []), []);
});

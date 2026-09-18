import test from 'node:test';
import assert from 'node:assert/strict';
import { emitToolCalls, type ToolCallBuffer } from './tool-call-buffers.ts';

test('emitToolCalls emits a no-arg call as an empty object', () => {
	const seen: Array<[string, Record<string, unknown>, string]> = [];
	const buffers = new Map<number, ToolCallBuffer>([
		[0, { id: 'call_1', name: 'get_time', args: '' }]
	]);

	emitToolCalls(buffers, (name, args, id) => seen.push([name, args, id]));

	assert.deepEqual(seen, [['get_time', {}, 'call_1']]);
});

test('emitToolCalls parses argument JSON and falls back to a generated id', () => {
	const seen: Array<[string, Record<string, unknown>, string]> = [];
	const buffers = new Map<number, ToolCallBuffer>([
		[2, { id: '', name: 'search', args: '{"q":"x"}' }]
	]);

	emitToolCalls(buffers, (name, args, id) => seen.push([name, args, id]));

	assert.deepEqual(seen, [['search', { q: 'x' }, 'call_2']]);
});

test('emitToolCalls skips malformed arguments and unnamed buffers', () => {
	const seen: unknown[] = [];
	const buffers = new Map<number, ToolCallBuffer>([
		[0, { id: 'a', name: 'broken', args: '{oops' }],
		[1, { id: 'b', name: '', args: '{}' }]
	]);

	emitToolCalls(buffers, (...entry) => seen.push(entry));

	assert.deepEqual(seen, []);
});

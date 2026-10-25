import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImageSearchTool, serializeImageSearchTool } from './mcp-image-tool-storage.ts';

test('picture-tool persistence round-trips and rejects malformed values', () => {
	assert.deepEqual(parseImageSearchTool('{"serverId":"s","toolName":"t"}'), { serverId: 's', toolName: 't' });
	assert.equal(parseImageSearchTool(null), null);
	assert.equal(parseImageSearchTool(''), null);
	assert.equal(parseImageSearchTool('not json'), null);
	assert.equal(parseImageSearchTool('{"serverId":1}'), null);
	assert.equal(serializeImageSearchTool(null), null);
	assert.equal(serializeImageSearchTool({ serverId: 's', toolName: 't' }), '{"serverId":"s","toolName":"t"}');
});

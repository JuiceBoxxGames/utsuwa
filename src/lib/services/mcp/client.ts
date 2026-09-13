/**
 * Client-side MCP client for the Tauri desktop build. HTTP requests go through
 * the Tauri HTTP plugin, which runs in the Rust core and therefore bypasses
 * webview CORS (plain fetch would be blocked by servers like Home Assistant).
 * stdio is server-side only and reports a clear error here.
 */
import type { McpServerConfig, McpTool, McpToolResult } from '$lib/types/mcp';
import { createHttpMcpClient, type FetchLike } from './http-client.ts';

let clientPromise: Promise<ReturnType<typeof createHttpMcpClient>> | null = null;

function getHttpClient() {
	if (!clientPromise) {
		clientPromise = import('@tauri-apps/plugin-http').then(({ fetch }) =>
			createHttpMcpClient(fetch as unknown as FetchLike)
		);
	}
	return clientPromise;
}

export async function listTools(config: McpServerConfig): Promise<McpTool[]> {
	if (config.transport === 'stdio') {
		// Surface this through the per-server error channel instead of an
		// empty list (callTool reports the same for stdio on desktop).
		throw new Error('stdio MCP servers are only available in the server (web) build.');
	}
	const client = await getHttpClient();
	return client.listTools(config);
}

export async function callTool(
	config: McpServerConfig,
	toolName: string,
	args: Record<string, unknown>
): Promise<McpToolResult> {
	if (config.transport === 'stdio') {
		return {
			toolName,
			content: 'Error: stdio MCP servers are only available in the server (web) build.',
			isError: true
		};
	}
	const client = await getHttpClient();
	return client.callTool(config, toolName, args);
}

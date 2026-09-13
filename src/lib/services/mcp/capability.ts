/**
 * Client-side capability façade for MCP.
 *
 * Web (hosted + self-hosted): the SvelteKit API routes act as the MCP proxy —
 * server-to-server requests avoid CORS, mixed content and Private Network
 * Access blocks that kill browser-side MCP calls.
 *
 * Desktop (Tauri): the static build has no server routes, so calls go through
 * the Tauri HTTP plugin (CORS-free). stdio stays server-side.
 */
import type { McpServerConfig, McpServerError, McpTool, McpToolResult } from '$lib/types/mcp';
import { isTauri } from '$lib/services/platform';
import { combineServerResults } from './protocol.ts';

export type McpCapability = 'server' | 'client';

export interface McpListResult {
	tools: McpTool[];
	errors: McpServerError[];
}

export function getMcpCapability(): McpCapability {
	return isTauri() ? 'client' : 'server';
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(errBody?.error || `MCP request failed (${res.status})`);
	}
	return res.json() as Promise<T>;
}

export async function listTools(servers: McpServerConfig[]): Promise<McpListResult> {
	if (getMcpCapability() === 'client') {
		const { listTools: listClientTools } = await import('./client.ts');
		const settled = await Promise.allSettled(servers.map((server) => listClientTools(server)));
		const { values, errors } = combineServerResults(settled, servers);
		return { tools: values.flat(), errors };
	}
	return postJson<McpListResult>('/api/mcp/tools', { servers });
}

export async function callTool(
	server: McpServerConfig,
	toolName: string,
	args: Record<string, unknown>
): Promise<McpToolResult> {
	if (getMcpCapability() === 'client') {
		const { callTool: callClientTool } = await import('./client.ts');
		return callClientTool(server, toolName, args);
	}
	return postJson<McpToolResult>('/api/mcp/call', { server, toolName, args });
}

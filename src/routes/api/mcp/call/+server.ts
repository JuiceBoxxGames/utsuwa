/**
 * /api/mcp/call — execute a single MCP tool call (web proxy). Gated by
 * MCP_ENABLED=server|both; otherwise 404.
 */
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';
import type { McpServerConfig } from '$lib/types/mcp';
import { callTool } from '$lib/services/mcp/client.server';
import {
	isAllowedMcpHttpUrl,
	isServerMcpEnabled,
	parseToolNameList,
	stdioDenyReason
} from '$lib/services/mcp/protocol';

export const POST: RequestHandler = async ({ request }) => {
	if (!isServerMcpEnabled(env.MCP_ENABLED)) {
		return new Response(JSON.stringify({ error: 'MCP is disabled on this server' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const body = (await request.json().catch(() => null)) as {
		server?: McpServerConfig;
		toolName?: string;
		args?: Record<string, unknown>;
	} | null;

	const server = body?.server;
	const toolName = body?.toolName;
	const args = body?.args ?? {};

	const valid =
		server &&
		typeof server === 'object' &&
		typeof toolName === 'string' &&
		toolName.length > 0 &&
		((server.transport === 'http' && typeof server.url === 'string' && isAllowedMcpHttpUrl(server.url)) ||
			(server.transport === 'stdio' && typeof server.command === 'string' && server.command.length > 0));

	if (!valid) {
		return new Response(JSON.stringify({ error: 'Invalid MCP server or tool call' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Env-gated safety net: stdio is fail-closed — without an allowlist no
	// command runs; with one, only listed commands pass.
	const stdioDeny =
		server.transport === 'stdio'
			? stdioDenyReason(server.command, parseToolNameList(env.MCP_STDIO_ALLOWED_COMMANDS))
			: null;
	if (stdioDeny) {
		return new Response(JSON.stringify({ error: stdioDeny }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Env-gated safety net: tools on the confirmation list are never executed
	// automatically (the chat loop reports the same, this covers direct calls).
	if (parseToolNameList(publicEnv.PUBLIC_MCP_CONFIRM_TOOLS).includes(toolName)) {
		return new Response(
			JSON.stringify({ error: `Tool "${toolName}" requires manual user confirmation` }),
			{ status: 403, headers: { 'Content-Type': 'application/json' } }
		);
	}

	const result = await callTool(server, toolName, args);

	return new Response(JSON.stringify(result), {
		headers: { 'Content-Type': 'application/json' }
	});
};

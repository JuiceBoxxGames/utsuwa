/**
 * /api/mcp/tools — list tools of the configured MCP servers (web proxy).
 * Gated by MCP_ENABLED=server|both; otherwise 404 so a hosted deployment
 * stays untouched unless it opts in.
 */
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import type { McpServerConfig } from '$lib/types/mcp';
import { listTools } from '$lib/services/mcp/client.server';
import { combineServerResults, isServerMcpEnabled, parseToolNameList, stdioDenyReason } from '$lib/services/mcp/protocol';

export const POST: RequestHandler = async ({ request }) => {
	if (!isServerMcpEnabled(env.MCP_ENABLED)) {
		return new Response(JSON.stringify({ error: 'MCP is disabled on this server' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const body = (await request.json().catch(() => null)) as { servers?: McpServerConfig[] } | null;
	const enabled = Array.isArray(body?.servers)
		? body.servers.filter((s) => s?.enabled && (s.transport === 'http' || s.transport === 'stdio'))
		: [];

	const stdioAllowed = parseToolNameList(env.MCP_STDIO_ALLOWED_COMMANDS);
	const settled = await Promise.allSettled(
		enabled.map((server) => {
			const denyReason =
				server.transport === 'stdio' ? stdioDenyReason(server.command, stdioAllowed) : null;
			return denyReason ? Promise.reject(new Error(denyReason)) : listTools(server);
		})
	);
	const { values, errors } = combineServerResults(settled, enabled);

	return new Response(JSON.stringify({ tools: values.flat(), errors }), {
		headers: { 'Content-Type': 'application/json' }
	});
};

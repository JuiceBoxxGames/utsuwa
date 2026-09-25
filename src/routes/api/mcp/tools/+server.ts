/**
 * /api/mcp/tools — list tools of the configured MCP servers (web proxy).
 * Gated by MCP_ENABLED=server|both; otherwise 404 so a hosted deployment
 * stays untouched unless it opts in.
 */
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import type { McpServerConfig } from '$lib/types/mcp';
import { listTools } from '$lib/services/mcp/client.server';
import { combineServerResults, isServerMcpEnabled } from '$lib/services/mcp/protocol';
import { applyStdioPolicy, createLimiter, STDIO_MAX_CONCURRENT } from '$lib/services/mcp/stdio-policy';

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

	const limitStdio = createLimiter(STDIO_MAX_CONCURRENT);
	const settled = await Promise.allSettled(
		enabled.map(async (server) => {
			if (server.transport !== 'stdio') return listTools(server);
			const policy = applyStdioPolicy(server, env);
			if ('error' in policy) throw new Error(policy.error);
			return limitStdio(() => listTools(policy.server));
		})
	);
	const { values, errors } = combineServerResults(settled, enabled);

	return new Response(JSON.stringify({ tools: values.flat(), errors }), {
		headers: { 'Content-Type': 'application/json' }
	});
};

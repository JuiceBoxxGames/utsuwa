/**
 * /api/mcp/call — execute a single MCP tool call (web proxy). Gated by
 * MCP_ENABLED=server|both; otherwise 404.
 */
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';
import type { McpServerConfig } from '$lib/types/mcp';
import { callTool } from '$lib/services/mcp/client.server';
import { isAllowedMcpHttpUrl, isServerMcpEnabled, parseToolNameList } from '$lib/services/mcp/protocol';
import { applyStdioPolicy } from '$lib/services/mcp/stdio-policy';
import { assertSafeFetchTarget } from '$lib/services/providers/url-guard.server';

// A file-fetch tool downloads a URL supplied by the model, so guard it against
// SSRF before relaying: block metadata/link-local/private targets (private only
// opens with ALLOW_LOCAL_PROVIDER_HOSTS, consistent with the provider proxy).
const FILE_FETCH_TOOL = 'fetch_file_from_url';

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

	// stdio is fail-closed: only allowlisted command lines run, and only
	// allowlisted env var names reach the process.
	let target = server;
	if (server.transport === 'stdio') {
		const policy = applyStdioPolicy(server, env);
		if ('error' in policy) {
			return new Response(JSON.stringify({ error: policy.error }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		target = policy.server;
	}

	// Env-gated safety net: tools on the confirmation list are never executed
	// automatically (the chat loop reports the same, this covers direct calls).
	if (parseToolNameList(publicEnv.PUBLIC_MCP_CONFIRM_TOOLS).includes(toolName)) {
		return new Response(
			JSON.stringify({ error: `Tool "${toolName}" requires manual user confirmation` }),
			{ status: 403, headers: { 'Content-Type': 'application/json' } }
		);
	}

	// SSRF guard for the file-fetch tool: the URL comes from the model, so
	// validate it before the fetch runs. The external MCP server performs the
	// actual fetch, so redirects/DNS rebinding after this check are outside this
	// guard; keep that residual risk in mind when choosing a filefetcher.
	if (toolName === FILE_FETCH_TOOL) {
		const url = args.url;
		if (typeof url !== 'string' || !url.trim()) {
			return new Response(JSON.stringify({ error: `${FILE_FETCH_TOOL} needs a url argument` }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		const normalizedUrl = url.trim();
		try {
			await assertSafeFetchTarget(normalizedUrl, env.ALLOW_LOCAL_PROVIDER_HOSTS === 'true');
		} catch (e) {
			return new Response(
				JSON.stringify({ error: e instanceof Error ? e.message : 'URL not allowed' }),
				{ status: 403, headers: { 'Content-Type': 'application/json' } }
			);
		}
		args.url = normalizedUrl;
	}

	const result = await callTool(target, toolName, args);

	return new Response(JSON.stringify(result), {
		headers: { 'Content-Type': 'application/json' }
	});
};

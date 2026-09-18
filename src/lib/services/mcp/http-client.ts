/**
 * Streamable HTTP transport for MCP — fetch-injectable so the same protocol
 * code runs on the server (Node fetch) and on desktop (Tauri HTTP plugin,
 * which bypasses webview CORS).
 */
import type { McpServerConfig, McpTool, McpToolResult } from '$lib/types/mcp';
import {
	buildAuthHeaders,
	buildInitializedNotification,
	buildRpcRequest,
	isAllowedMcpHttpUrl,
	isBlockedMcpHost,
	mcpUrlCandidates,
	nextRpcId,
	parseJsonRpcResult,
	parseSseResult,
	parseToolsList,
	stringifyToolResult
} from './protocol.ts';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Tauri's HTTP plugin takes redirect handling through its own client option. */
type RedirectCapableInit = RequestInit & { maxRedirections?: number };

const MAX_REDIRECTS = 3;

function isRedirectStatus(status: number): boolean {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Reject non-http(s) schemes and link-local/metadata hosts. Runs for the
 * configured URL and every redirect target — on the server the DNS-based check
 * in client.server.ts adds hostnames that resolve to blocked addresses.
 */
function assertSafeMcpUrl(rawUrl: string): void {
	if (!isAllowedMcpHttpUrl(rawUrl)) {
		throw new Error('MCP HTTP URL must use http: or https:');
	}
	let hostname: string;
	try {
		hostname = new URL(rawUrl).hostname;
	} catch {
		return;
	}
	if (isBlockedMcpHost(hostname)) {
		throw new Error(`MCP HTTP host "${hostname}" is blocked (link-local/metadata)`);
	}
}

/**
 * Follow redirects manually so every hop is re-validated: Node fetch follows
 * redirects by default, which would let a 307 bypass the SSRF guard and land
 * on a metadata address. `redirect: 'manual'` covers Node, `maxRedirections: 0`
 * the Tauri HTTP plugin (reqwest Policy::none()). Only 307/308 are followed —
 * they preserve method and body; 301/302/303 would silently turn the JSON-RPC
 * POST into a GET and are reported as errors instead.
 */
function guardRedirects(fetchImpl: FetchLike): FetchLike {
	return async (input, init) => {
		let url = String(input);
		const requestInit: RedirectCapableInit = {
			...init,
			redirect: 'manual',
			maxRedirections: 0
		};
		for (let hop = 0; ; hop++) {
			assertSafeMcpUrl(url);
			// Tauri consumes and deletes maxRedirections from the passed options.
			const res = await fetchImpl(url, { ...requestInit });
			if (!isRedirectStatus(res.status)) return res;
			const location = res.headers.get('location');
			if (!location) return res;
			void res.body?.cancel().catch(() => {});
			if (res.status !== 307 && res.status !== 308) {
				throw new Error(
					`MCP HTTP redirect (${res.status}) is not followed (JSON-RPC requires POST)`
				);
			}
			if (hop >= MAX_REDIRECTS) throw new Error('MCP HTTP too many redirects');
			const target = new URL(location, url);
			assertSafeMcpUrl(target.toString());
			if (target.origin !== new URL(url).origin) {
				throw new Error('MCP HTTP cross-origin redirects are not allowed');
			}
			url = target.toString();
		}
	};
}

export interface HttpMcpClient {
	listTools(config: McpServerConfig): Promise<McpTool[]>;
	callTool(
		config: McpServerConfig,
		toolName: string,
		args: Record<string, unknown>
	): Promise<McpToolResult>;
}

export function createHttpMcpClient(
	fetchImpl: FetchLike,
	options: { timeoutMs?: number } = {}
): HttpMcpClient {
	const timeoutMs = options.timeoutMs ?? 15_000;
	const safeFetch = guardRedirects(fetchImpl);
	/** Session ids returned by Streamable HTTP initialize responses, per server+URL. */
	const sessionIds = new Map<string, string>();
	/** Working URL variant per configured URL (some servers 404 on a trailing slash). */
	const resolvedUrls = new Map<string, string>();

	function sessionKey(config: McpServerConfig, url: string): string {
		return `${config.id ?? ''}|${config.name ?? ''}|${url}`;
	}

	function candidatesFor(config: McpServerConfig): string[] {
		const key = (config.url ?? '').trim();
		const known = resolvedUrls.get(key);
		return known ? [known] : mcpUrlCandidates(key);
	}

	function headersFor(config: McpServerConfig, url: string): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
			...buildAuthHeaders(config.auth)
		};
		const sessionId = sessionIds.get(sessionKey(config, url));
		if (sessionId) headers['mcp-session-id'] = sessionId;
		return headers;
	}

	async function fetchWithTimeout<T>(
		url: string,
		init: RequestInit,
		read: (response: Response) => Promise<T>
	): Promise<T> {
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				controller.abort();
				reject(new Error(`MCP HTTP timeout after ${timeoutMs}ms`));
			}, timeoutMs);
		});
		try {
			return await Promise.race([
				safeFetch(url, { ...init, signal: controller.signal }).then(read),
				timeout
			]);
		} catch (err) {
			if (controller.signal.aborted) {
				throw new Error(`MCP HTTP timeout after ${timeoutMs}ms`);
			}
			throw err;
		} finally {
			clearTimeout(timer!);
		}
	}

	async function rpc(
		config: McpServerConfig,
		method: string,
		params: unknown = {},
		recoverSession = true
	): Promise<unknown> {
		const key = (config.url ?? '').trim();
		if (!isAllowedMcpHttpUrl(key)) {
			throw new Error('MCP HTTP URL must use http: or https:');
		}
		const urls = candidatesFor(config);
		if (urls.length === 0) throw new Error('MCP HTTP server has no URL configured');

		let lastError: Error | null = null;
		for (const url of urls) {
			const id = nextRpcId();
			const headers = headersFor(config, url);
			const { res, result, errText } = await fetchWithTimeout(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(buildRpcRequest(id, method, params))
			}, async (res) => {
				const text = await res.text();
				return {
					res,
					errText: res.ok ? '' : text,
					result: !res.ok ? undefined : res.headers.get('content-type')?.includes('text/event-stream')
						? parseSseResult(text, id)
						: parseJsonRpcResult(JSON.parse(text))
				};
			});

			if (res.status === 404 && headers['mcp-session-id']) {
				sessionIds.delete(sessionKey(config, url));
				if (recoverSession && method !== 'initialize') {
					await initialize(config);
					return rpc(config, method, params, false);
				}
				throw new Error(`MCP HTTP error 404: ${url}`);
			}

			// Wrong URL variant (e.g. Home Assistant 404s on a trailing slash):
			// drain and try the next candidate. Auth errors are not retried.
			if (res.status === 404 || res.status === 405) {
				lastError = new Error(`MCP HTTP error ${res.status}: ${url}`);
				continue;
			}

			if (!res.ok) {
				const detail = errText ? `: ${errText.slice(0, 300)}` : '';
				throw new Error(`MCP HTTP error ${res.status}${detail}`);
			}

			// Remember the variant that worked so later calls skip the probing.
			resolvedUrls.set(key, url);

			// The server may refresh the session id at any point.
			const newSessionId = res.headers.get('mcp-session-id');
			if (newSessionId) sessionIds.set(sessionKey(config, url), newSessionId);

			return result;
		}
		throw lastError ?? new Error('MCP HTTP request failed');
	}

	/**
	 * Some servers require the initialize handshake before any other request.
	 * Servers that don't care simply ignore it — failures are non-fatal.
	 */
	async function initialize(config: McpServerConfig): Promise<void> {
		if (candidatesFor(config).some((url) => sessionIds.has(sessionKey(config, url)))) return;
		try {
			await rpc(config, 'initialize', {
				protocolVersion: '2024-11-05',
				capabilities: { tools: {} },
				clientInfo: { name: 'utsuwa', version: '1.0.0' }
			});
			const key = (config.url ?? '').trim();
			const url = resolvedUrls.get(key) ?? mcpUrlCandidates(key)[0];
			if (!url) return;
			// Notifications have no JSON-RPC response body.
			await fetchWithTimeout(url, {
				method: 'POST',
				headers: headersFor(config, url),
				body: JSON.stringify(buildInitializedNotification())
			}, async (res) => { await res.body?.cancel(); }).catch(() => {});
		} catch {
			// Servers without a handshake still work; the real call reports errors.
		}
	}

	async function listTools(config: McpServerConfig): Promise<McpTool[]> {
		await initialize(config);
		const result = await rpc(config, 'tools/list', {});
		return parseToolsList(result).map((tool) => ({
			serverId: config.id,
			serverName: config.name,
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema as McpTool['inputSchema']
		}));
	}

	async function callTool(
		config: McpServerConfig,
		toolName: string,
		args: Record<string, unknown>
	): Promise<McpToolResult> {
		try {
			await initialize(config);
			const result = await rpc(config, 'tools/call', { name: toolName, arguments: args });
			return { toolName, content: stringifyToolResult(result), isError: false };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(`[MCP] callTool failed for "${config.name}/${toolName}":`, message);
			return { toolName, content: `Error: ${message}`, isError: true };
		}
	}

	return { listTools, callTool };
}

/**
 * MCP protocol core — pure, dependency-free helpers shared by the server-side
 * client (Node fetch + stdio) and the client-side client (Tauri HTTP plugin).
 * MCP is plain JSON-RPC 2.0, so no SDK is needed.
 */
import type { McpAuth, McpServerError } from '$lib/types/mcp';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const MCP_CLIENT_NAME = 'utsuwa';
export const MCP_CLIENT_VERSION = '1.0.0';

let rpcIdCounter = 1;

/** Monotonic JSON-RPC request id. */
export function nextRpcId(): number {
	return rpcIdCounter++;
}

/**
 * Server gate for the MCP API routes: `MCP_ENABLED=server` (or `both`) turns
 * them on. Anything else — including unset — keeps them off, so a hosted
 * deployment stays untouched unless it opts in.
 */
export function isServerMcpEnabled(raw: string | undefined | null): boolean {
	return raw === 'server' || raw === 'both';
}

/** Capability of the current runtime as seen by the client store. */
export type McpCapabilityState = 'unknown' | 'server' | 'client' | 'none';

/**
 * Map a capability-probe response to the new state. A 404 means MCP is
 * disabled on this deployment; a success means the server routes are active.
 * Anything else (e.g. a transient 500) must not downgrade a capability we
 * already know — otherwise the settings entry and tools flicker off.
 */
export function resolveCapabilityFromProbe(
	status: number,
	current: McpCapabilityState
): McpCapabilityState {
	if (status === 404) return 'none';
	if (status >= 200 && status < 300) return 'server';
	return current === 'unknown' ? 'none' : current;
}

/**
 * MCP Streamable HTTP endpoints are mounted differently across servers: most
 * accept a trailing slash (and some redirect to it), while strict routers like
 * Home Assistant 404 on it. Candidates are tried in order — the URL as the user
 * configured it first, then the trailing-slash variant.
 */
export function mcpUrlCandidates(raw: string): string[] {
	const trimmed = raw.trim().replace(/\/+$/, '');
	if (!trimmed) return [];
	return [trimmed, `${trimmed}/`];
}

/**
 * Only `http:`/`https:` endpoints may be contacted. Blocks `file:`, `data:`,
 * `ftp:` and similar schemes before any request is made (server proxy and
 * desktop transport share this check).
 */
export function isAllowedMcpHttpUrl(raw: string): boolean {
	try {
		const protocol = new URL(raw).protocol;
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

export function buildRpcRequest<P = Record<string, unknown>>(id: number, method: string, params: P = {} as P) {
	return { jsonrpc: '2.0' as const, id, method, params };
}

export function buildInitializeRequest(id: number) {
	return buildRpcRequest(id, 'initialize', {
		protocolVersion: MCP_PROTOCOL_VERSION,
		capabilities: { tools: {} },
		clientInfo: { name: MCP_CLIENT_NAME, version: MCP_CLIENT_VERSION }
	});
}

export function buildInitializedNotification() {
	return { jsonrpc: '2.0' as const, method: 'notifications/initialized', params: {} };
}

/** Authentication headers for HTTP requests. No auth means no header at all. */
export function buildAuthHeaders(auth?: McpAuth): Record<string, string> {
	if (auth?.type === 'bearer' && auth.token) {
		return { Authorization: `Bearer ${auth.token}` };
	}
	return {};
}

interface JsonRpcError {
	code?: number;
	message?: string;
}

function rpcErrorMessage(error: JsonRpcError | undefined): string {
	return error?.message ? `MCP error: ${error.message}` : 'MCP error: unknown error';
}

/**
 * Parse a JSON-RPC response body. Throws on protocol-level errors so callers
 * surface a readable message instead of a malformed result.
 */
export function parseJsonRpcResult(json: unknown): unknown {
	const body = json as { result?: unknown; error?: JsonRpcError } | null;
	if (!body || typeof body !== 'object') {
		throw new Error('MCP error: empty response');
	}
	if (body.error) {
		throw new Error(rpcErrorMessage(body.error));
	}
	return body.result;
}

/**
 * Match a response after any SSE notifications or unrelated responses.
 * Multiple data lines belong to one event and are joined with newlines.
 */
export function parseSseResult(text: string, expectedId?: number): unknown {
	for (const event of text.split(/\r\n\r\n|\n\n|\r\r/)) {
		const payload = event.split(/\r\n|\n|\r/)
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice(5).replace(/^ /, ''))
			.join('\n').trim();
		if (!payload || payload === '[DONE]') continue;
		let json: unknown;
		try {
			json = JSON.parse(payload);
		} catch {
			throw new Error('MCP error: invalid JSON in SSE response');
		}
		for (const message of Array.isArray(json) ? json : [json]) {
			if (!message || typeof message !== 'object' || 'method' in message) continue;
			if (expectedId !== undefined && message.id !== expectedId) continue;
			if (message.error) throw new Error(rpcErrorMessage(message.error));
			if ('result' in message) return message.result;
		}
	}
	throw new Error('MCP error: no data for the requested response found in SSE stream');
}

interface RawMcpTool {
	name?: unknown;
	description?: unknown;
	inputSchema?: unknown;
}

/** Map a `tools/list` result to the tool shape used across the app. */
export function parseToolsList(result: unknown): Array<{
	name: string;
	description: string;
	inputSchema: { type: 'object'; properties?: Record<string, unknown>; required?: string[]; [key: string]: unknown };
}> {
	const tools = (result as { tools?: RawMcpTool[] } | null)?.tools;
	if (!Array.isArray(tools)) return [];
	return tools
		.filter((tool): tool is RawMcpTool & { name: string } => typeof tool?.name === 'string' && tool.name.length > 0)
		.map((tool) => ({
			name: tool.name,
			description: typeof tool.description === 'string' ? tool.description : '',
			inputSchema: (typeof tool.inputSchema === 'object' && tool.inputSchema !== null
				? tool.inputSchema
				: { type: 'object' }) as { type: 'object'; [key: string]: unknown }
		}));
}

/**
 * Flatten an MCP `tools/call` result to plain text. Text parts are joined;
 * anything else (images, resources) falls back to the raw JSON so the model
 * still receives the data.
 */
export function stringifyToolResult(result: unknown): string {
	const content = (result as { content?: Array<{ type?: string; text?: string }> } | null)?.content;
	if (Array.isArray(content)) {
		const text = content
			.filter((part) => part?.type === 'text' && typeof part.text === 'string')
			.map((part) => part.text as string)
			.join('\n');
		if (text) return text;
	}
	if (result === undefined || result === null) return '';
	return JSON.stringify(result);
}

/**
 * Split per-server `Promise.allSettled` results into collected values and
 * readable per-server errors (one broken server must not hide the others).
 */
export function combineServerResults<T>(
	results: Array<PromiseSettledResult<T>>,
	servers: Array<{ id: string; name: string }>
): { values: T[]; errors: McpServerError[] } {
	const values: T[] = [];
	const errors: McpServerError[] = [];
	results.forEach((result, index) => {
		if (result.status === 'fulfilled') {
			values.push(result.value);
			return;
		}
		errors.push({
			serverId: servers[index]?.id ?? '',
			serverName: servers[index]?.name ?? 'Unknown server',
			message: result.reason instanceof Error ? result.reason.message : String(result.reason)
		});
	});
	return { values, errors };
}

/**
 * Parse the settings textarea format: one `KEY=value` per line, `#` comments
 * and blank lines ignored.
 */
export function parseEnvLines(raw: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq < 1) continue;
		result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
	}
	return result;
}

/**
 * Collapse concurrent calls into one in-flight promise. Used for the MCP
 * capability probe so the settings layout and page mounts share a single
 * request; once it settles, the next call runs again.
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
	let inFlight: Promise<T> | null = null;
	return () => {
		if (!inFlight) {
			inFlight = fn().finally(() => {
				inFlight = null;
			});
		}
		return inFlight;
	};
}

/**
 * Parse a comma-separated tool-name list (env config). Blank entries are
 * dropped, so an unset or empty value yields an empty list.
 */
export function parseToolNameList(raw: string | undefined | null): string[] {
	return (raw ?? '')
		.split(',')
		.map((name) => name.trim())
		.filter(Boolean);
}

/**
 * Link-local and cloud-metadata hosts are blocked on the server-side HTTP
 * path. Loopback and RFC1918 stay allowed on purpose — Home Assistant and
 * other self-hosted MCP servers live on the local network.
 */
export function isBlockedMcpHost(rawHostname: string): boolean {
	let host = rawHostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
	if (!host) return false;
	if (host.includes(':')) {
		try { host = new URL(`http://[${host}]/`).hostname.slice(1, -1); } catch { /* invalid host */ }
		const mapped = host.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/);
		if (mapped) {
			const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
			host = `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
		}
	}
	// Cloud metadata hostnames (GCP, AWS, Azure, generic aliases).
	if (
		host === 'metadata' ||
		host === 'instance-data' ||
		host === 'metadata.google.internal' ||
		host === 'metadata.goog'
	) {
		return true;
	}
	// IPv4-mapped IPv6 (::ffff:169.254.x.x)
	const mapped = host.startsWith('::ffff:') ? host.slice(7) : host;
	const v4 = mapped.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (v4) {
		// AWS/Azure/GCP IMDS link-local range and Alibaba Cloud's metadata IP.
		return (Number(v4[1]) === 169 && Number(v4[2]) === 254) || mapped === '100.100.100.200';
	}
	// IPv6 link-local fe80::/10 (fe80–febf) and AWS IMDSv2 (fd00:ec2::254).
	return /^fe[89ab][0-9a-f]:/.test(host) || /^fd00:ec2:/.test(host);
}

/**
 * stdio is fail-closed: without an allowlist no command runs. `*` is the
 * explicit opt-in to allow every command.
 */
export function isStdioCommandAllowed(
	command: string | undefined | null,
	allowed: string[]
): boolean {
	if (allowed.includes('*')) return true;
	if (!command) return false;
	return allowed.includes(command);
}

/** Human-readable reason when a stdio command is denied, else null. */
export function stdioDenyReason(
	command: string | undefined | null,
	allowed: string[]
): string | null {
	if (isStdioCommandAllowed(command, allowed)) return null;
	if (allowed.length === 0) {
		return 'stdio is disabled — set MCP_STDIO_ALLOWED_COMMANDS to allowlist commands';
	}
	return `stdio command "${command ?? ''}" is not allowed (MCP_STDIO_ALLOWED_COMMANDS)`;
}

/**
 * Environment a spawned stdio server inherits from the app process. Everything
 * else — database URLs, API keys, provider tokens — stays inside the app; the
 * per-server `env` config adds only what a server actually needs (e.g.
 * BRAVE_API_KEY). Matched case-insensitively for Windows (`Path`).
 */
const STDIO_ENV_ALLOWLIST = new Set(
	[
		'PATH',
		'HOME',
		'USER',
		'LOGNAME',
		'SHELL',
		'LANG',
		'LC_ALL',
		'LC_CTYPE',
		'TZ',
		'TMPDIR',
		'TMP',
		'TEMP',
		'SystemRoot',
		'ComSpec',
		'PATHEXT',
		'APPDATA',
		'LOCALAPPDATA',
		'NODE_EXTRA_CA_CERTS',
		'SSL_CERT_FILE',
		'SSL_CERT_DIR'
	].map((key) => key.toLowerCase())
);

/** Pick only the safe subset of a base environment for stdio servers. */
export function pickStdioEnv(base: Record<string, string | undefined>): Record<string, string> {
	const picked: Record<string, string> = {};
	for (const [key, value] of Object.entries(base)) {
		if (value === undefined) continue;
		if (!STDIO_ENV_ALLOWLIST.has(key.toLowerCase())) continue;
		picked[key] = value;
	}
	return picked;
}

/**
 * Environment variables that must never be overridden by per-server config:
 * they change how a spawned process resolves binaries or loads code.
 */
const STDIO_ENV_DENYLIST = new Set([
	'PATH',
	'HOME',
	'NODE_OPTIONS',
	'NODE_PATH',
	'LD_PRELOAD',
	'LD_LIBRARY_PATH',
	'DYLD_INSERT_LIBRARIES',
	'DYLD_LIBRARY_PATH'
]);

/** Merge per-server env vars over the (already filtered) base env, blocking critical keys. */
export function mergeStdioEnv(
	base: Record<string, string | undefined>,
	extra: Record<string, string> | undefined | null
): Record<string, string> {
	const merged: Record<string, string> = {};
	for (const [key, value] of Object.entries(base)) {
		if (value !== undefined) merged[key] = value;
	}
	for (const [key, value] of Object.entries(extra ?? {})) {
		if (STDIO_ENV_DENYLIST.has(key.toUpperCase())) continue;
		merged[key] = value;
	}
	return merged;
}

/**
 * Split a command-line string into arguments, honoring single and double
 * quotes so paths with spaces survive.
 */
export function parseQuotedArgs(raw: string): string[] {
	const args: string[] = [];
	for (const match of raw.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
		args.push(match[1] ?? match[2] ?? match[3]);
	}
	return args;
}

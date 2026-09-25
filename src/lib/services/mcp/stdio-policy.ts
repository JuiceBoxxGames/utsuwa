/**
 * Which stdio MCP servers the web proxy may spawn. The routes are
 * unauthenticated and the server config comes from the client, so a command
 * name alone is not enough (`node -e ...` is arbitrary code). Each
 * MCP_STDIO_ALLOWED_COMMANDS entry is a full command line; a trailing `*`
 * allows further arguments after it, and a bare `*` allows everything.
 */
import type { McpServerConfig } from '$lib/types/mcp';
import { isDeniedStdioEnvName, parseQuotedArgs, parseToolNameList } from './protocol.ts';

export const STDIO_MAX_STDOUT_BUFFER = 4 * 1024 * 1024;
export const STDIO_MAX_CONCURRENT = 4;

export interface StdioAllowEntry {
	command: string;
	args: string[];
	extraArgs: boolean;
}

export function parseStdioAllowlist(raw: string | undefined | null): StdioAllowEntry[] {
	return parseToolNameList(raw).map((line) => {
		const tokens = parseQuotedArgs(line);
		const extraArgs = tokens.at(-1) === '*';
		if (extraArgs && tokens.length > 1) tokens.pop();
		const [command, ...args] = tokens;
		return { command, args, extraArgs };
	});
}

export function isStdioLaunchAllowed(
	command: string | undefined | null,
	args: string[],
	entries: StdioAllowEntry[]
): boolean {
	if (!command) return false;
	return entries.some(
		(entry) =>
			(entry.command === '*' || entry.command === command) &&
			entry.args.every((arg, i) => args[i] === arg) &&
			(entry.extraArgs || args.length === entry.args.length)
	);
}

export function stdioDenyReason(
	command: string | undefined | null,
	args: string[],
	entries: StdioAllowEntry[]
): string | null {
	if (isStdioLaunchAllowed(command, args, entries)) return null;
	if (entries.length === 0) {
		return 'stdio is disabled: set MCP_STDIO_ALLOWED_COMMANDS to allowlist command lines';
	}
	return `stdio command line "${[command ?? '', ...args].join(' ')}" is not allowed (MCP_STDIO_ALLOWED_COMMANDS)`;
}

/** Client-supplied env vars survive only if allowlisted by name and not on the deny list. */
export function filterStdioEnv(
	env: Record<string, string> | undefined | null,
	allowedNames: string[]
): Record<string, string> {
	const filtered: Record<string, string> = {};
	for (const [key, value] of Object.entries(env ?? {})) {
		if (allowedNames.includes(key) && !isDeniedStdioEnvName(key)) filtered[key] = value;
	}
	return filtered;
}

/** Route-level gate: the stdio server to spawn, or why it may not run. */
export function applyStdioPolicy(
	server: McpServerConfig,
	env: Record<string, string | undefined>
): { server: McpServerConfig } | { error: string } {
	const args = server.args ?? [];
	if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) {
		return { error: 'Invalid stdio arguments' };
	}
	const deny = stdioDenyReason(server.command, args, parseStdioAllowlist(env.MCP_STDIO_ALLOWED_COMMANDS));
	if (deny) return { error: deny };
	const allowedEnv = parseToolNameList(env.MCP_STDIO_ENV_ALLOWLIST);
	return { server: { ...server, args, env: filterStdioEnv(server.env, allowedEnv) } };
}

/** Run at most `max` tasks at once; the rest wait their turn. */
export function createLimiter(max: number) {
	let running = 0;
	const queue: Array<() => void> = [];
	return async function limit<T>(task: () => Promise<T>): Promise<T> {
		// A finishing task hands its slot straight to the next waiter.
		if (running >= max) await new Promise<void>((resolve) => queue.push(resolve));
		else running++;
		try {
			return await task();
		} finally {
			const next = queue.shift();
			if (next) next();
			else running--;
		}
	};
}

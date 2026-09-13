// MCP (Model Context Protocol) types

export type McpTransport = 'http' | 'stdio';

/**
 * Authentication for an MCP server. Tokens are stored like other provider keys
 * (localStorage) and are only sent to the configured server — never to the LLM
 * and never logged.
 */
export type McpAuth = { type: 'none' } | { type: 'bearer'; token: string };

export interface McpServerConfig {
	id: string;
	name: string;
	transport: McpTransport;
	/** HTTP transport: base URL of the MCP endpoint (e.g. http://homeassistant.local:8123/api/mcp) */
	url?: string;
	/** stdio transport: command to spawn (server-side only) */
	command?: string;
	/** stdio transport: arguments for the command */
	args?: string[];
	/** stdio transport: extra environment variables for the spawned process */
	env?: Record<string, string>;
	/** Authentication sent with every HTTP request */
	auth?: McpAuth;
	/**
	 * If true, text tool results are injected as a user message in addition to
	 * the strict OpenAI "tool" role. Helps local/SLIM models that ignore tool
	 * role messages.
	 */
	injectResultsAsUser?: boolean;
	enabled: boolean;
}

export interface McpTool {
	/** ID of the McpServerConfig this tool belongs to */
	serverId: string;
	serverName: string;
	name: string;
	description: string;
	/** JSON Schema for the tool's input */
	inputSchema: {
		type: 'object';
		properties?: Record<string, unknown>;
		required?: string[];
		[key: string]: unknown;
	};
}

export interface McpToolResult {
	toolName: string;
	/** Stringified result content */
	content: string;
	isError: boolean;
}

/** A per-server failure while listing tools — surfaced in the settings UI so
 *  auth/URL problems are visible instead of an empty tool list. */
export interface McpServerError {
	serverId: string;
	serverName: string;
	message: string;
}

/** A tool call collected from a streamed chat response. The id is required to
 *  feed the result back to the provider in the tool-role message. */
export interface McpCollectedToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
}

/**
 * Shared parser for comma-separated tool-name lists from environment config
 * (PUBLIC_MCP_CONFIRM_TOOLS, MCP_STDIO_ENV_ALLOWLIST). Dependency-free so both
 * the MCP protocol and the image-search helpers can use it.
 */
export function parseToolNameList(raw: string | undefined | null): string[] {
	return (raw ?? '')
		.split(',')
		.map((name) => name.trim())
		.filter(Boolean);
}

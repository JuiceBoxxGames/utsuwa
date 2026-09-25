/**
 * Security headers and the locale middleware (`handle`), plus server startup
 * notices (`init`, runs once when the server boots).
 *
 * MCP is opt-in, but the `/api/mcp/*` routes are unauthenticated (like the
 * rest of the app) and stdio is effectively remote code execution for anyone
 * who can reach the app — warn accordingly.
 */
import type { Handle, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { isServerMcpEnabled } from '$lib/services/mcp/protocol';
import { parseStdioAllowlist } from '$lib/services/mcp/stdio-policy';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { isLightOnlyRoute } from '$lib/utils/light-only';

// No script CSP yet: the inline theme script and wasm would need nonces.
// vercel.json repeats these for the prerendered pages, which skip this hook.
// xr-spatial-tracking is for AR mode (WebXR immersive-ar), microphone for STT.
const SECURITY_HEADERS = [
	['Content-Security-Policy', "frame-ancestors 'none'"],
	['X-Content-Type-Options', 'nosniff'],
	['Referrer-Policy', 'strict-origin-when-cross-origin'],
	['Permissions-Policy', 'microphone=(self), camera=(), geolocation=(), xr-spatial-tracking=(self)']
] as const;

function setSecurityHeaders(headers: Headers) {
	for (const [name, value] of SECURITY_HEADERS) headers.set(name, value);
}

function withSecurityHeaders(response: Response): Response {
	try {
		setSecurityHeaders(response.headers);
		return response;
	} catch {
		// Responses passed straight through from fetch() have immutable headers.
		const copy = new Response(response.body, response);
		setSecurityHeaders(copy.headers);
		return copy;
	}
}

// Marketing pages get the locale middleware and the right <html lang>. The
// app, docs, and API never go through it.
export const handle: Handle = async ({ event, resolve }) => {
	if (!isLightOnlyRoute(event.url.hostname, event.url.pathname)) {
		return withSecurityHeaders(await resolve(event));
	}
	const response = await paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				locale === 'en' ? html : html.replace('<html lang="en"', `<html lang="${locale}"`)
		});
	});
	return withSecurityHeaders(response);
};

export const init: ServerInit = () => {
	if (!isServerMcpEnabled(env.MCP_ENABLED)) return;
	console.warn(
		'[MCP] server routes are enabled and unauthenticated — never expose this deployment without an authenticating reverse proxy.'
	);
	const allowed = parseStdioAllowlist(env.MCP_STDIO_ALLOWED_COMMANDS);
	if (allowed.length === 0) {
		console.warn(
			'[MCP] stdio is disabled: set MCP_STDIO_ALLOWED_COMMANDS to allowlist command lines.'
		);
		return;
	}
	for (const entry of allowed) {
		if (entry.args.length === 0 && !entry.extraArgs) {
			console.warn(
				`[MCP] MCP_STDIO_ALLOWED_COMMANDS entry "${entry.command}" only allows it without arguments. Entries are full command lines, e.g. "npx -y @modelcontextprotocol/server-brave-search".`
			);
		}
	}
	if (allowed.some((entry) => entry.command === '*')) {
		console.warn('[MCP] stdio allows every command line (MCP_STDIO_ALLOWED_COMMANDS=*).');
	}
};

/**
 * Server startup notices. Runs once when the server boots (SvelteKit `init`).
 *
 * MCP is opt-in, but the `/api/mcp/*` routes are unauthenticated (like the
 * rest of the app) and stdio is effectively remote code execution for anyone
 * who can reach the app — warn accordingly.
 */
import type { Handle, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { isServerMcpEnabled, parseToolNameList } from '$lib/services/mcp/protocol';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { isLightOnlyRoute } from '$lib/utils/light-only';

// Marketing pages get the locale middleware and the right <html lang>. The
// app, docs, and API never go through it.
export const handle: Handle = ({ event, resolve }) => {
	if (!isLightOnlyRoute(event.url.hostname, event.url.pathname)) return resolve(event);
	return paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				locale === 'en' ? html : html.replace('<html lang="en"', `<html lang="${locale}"`)
		});
	});
};

export const init: ServerInit = () => {
	if (!isServerMcpEnabled(env.MCP_ENABLED)) return;
	console.warn(
		'[MCP] server routes are enabled and unauthenticated — never expose this deployment without an authenticating reverse proxy.'
	);
	const allowed = parseToolNameList(env.MCP_STDIO_ALLOWED_COMMANDS);
	if (allowed.length === 0) {
		console.warn(
			'[MCP] stdio is disabled — set MCP_STDIO_ALLOWED_COMMANDS to allowlist commands.'
		);
		return;
	}
	if (allowed.includes('*')) {
		console.warn('[MCP] stdio allows every command (MCP_STDIO_ALLOWED_COMMANDS=*).');
	}
};

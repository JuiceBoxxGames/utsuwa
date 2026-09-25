// DNS half of the provider SSRF guard. The pure check in url-guard.ts only sees
// the name; a public-looking name can still resolve to 127.0.0.1 or the
// metadata address, so resolve it and check every answer.
// ponytail: resolve-then-fetch leaves a DNS rebinding window (fetch resolves
// again). Closing it needs an undici dispatcher that pins the checked address.
import { lookup } from 'node:dns/promises';
import { assertSafeProviderUrl, isBlockedHost } from './url-guard.ts';

export type Resolver = (host: string) => Promise<Array<{ address: string }>>;

const lookupAll: Resolver = (host) => lookup(host, { all: true });

async function assertResolvesSafe(url: URL, allowPrivate: boolean, resolve: Resolver): Promise<void> {
	let addresses: Array<{ address: string }>;
	try {
		addresses = await resolve(url.hostname.replace(/^\[(.*)\]$/, '$1'));
	} catch {
		throw new Error('Provider host could not be resolved');
	}
	if (addresses.length === 0) throw new Error('Provider host could not be resolved');
	if (addresses.some(({ address }) => isBlockedHost(address, { allowPrivate }))) {
		throw new Error('Provider URL host is not allowed');
	}
}

// Validates a client-supplied base URL. A query or fragment would swallow the
// path the routes append, and credentials have no business here.
export async function assertSafeProviderTarget(
	rawUrl: string,
	allowPrivate = false,
	resolve: Resolver = lookupAll
): Promise<URL> {
	const url = assertSafeProviderUrl(rawUrl, allowPrivate);
	if (url.username || url.password || url.search || url.hash) {
		throw new Error('Provider URL must not include credentials, a query, or a fragment');
	}
	await assertResolvesSafe(url, allowPrivate, resolve);
	return url;
}

// fetch that re-checks every request, refuses redirects (a public host could
// 302 to a private one), and gives up if no response headers arrive in time.
// The timer stops once headers land so long streamed replies are not cut off.
export function createGuardedFetch(
	allowPrivate: boolean,
	timeoutMs: number,
	resolve: Resolver = lookupAll
): typeof fetch {
	return async (input, init) => {
		const target = input instanceof Request ? input.url : String(input);
		await assertResolvesSafe(assertSafeProviderUrl(target, allowPrivate), allowPrivate, resolve);

		const timeout = new AbortController();
		const timer = setTimeout(
			() => timeout.abort(new DOMException('Provider request timed out', 'TimeoutError')),
			timeoutMs
		);
		const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
		const signal = callerSignal ? AbortSignal.any([callerSignal, timeout.signal]) : timeout.signal;

		let response: Response;
		try {
			response = await fetch(input, { ...init, redirect: 'manual', signal });
		} finally {
			clearTimeout(timer);
		}
		if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
			await response.body?.cancel();
			throw new Error('Provider answered with a redirect, which is not followed');
		}
		return response;
	};
}

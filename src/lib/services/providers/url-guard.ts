// Server-side SSRF guard for provider requests. The web deployment proxies
// model-list and chat requests to a client-supplied base URL; without this,
// anyone could point it at internal addresses (cloud metadata, localhost
// services, private ranges). The desktop build talks to providers directly and
// never hits these routes, so this only gates the hosted web path.
// This file is the pure host check; url-guard.server.ts adds DNS resolution
// and the redirect-refusing fetch.

// "private" is reachable with ALLOW_LOCAL_PROVIDER_HOSTS; "never" is not.
type HostClass = 'public' | 'private' | 'never';

const METADATA_HOSTS = new Set(['metadata', 'metadata.goog', 'metadata.google.internal', 'instance-data']);

function classifyIPv4(ip: number): HostClass {
	const a = ip >>> 24;
	const b = (ip >>> 16) & 0xff;
	const c = (ip >>> 8) & 0xff;
	if (a === 0) return 'never'; // this network / unspecified
	if (a === 169 && b === 254) return 'never'; // link-local + cloud metadata
	if (a >= 224) return 'never'; // multicast, reserved, broadcast
	if (a === 192 && b === 0 && c === 0) return 'never'; // IETF protocol assignments
	if (ip === 0x646464c8) return 'never'; // 100.100.100.200, Alibaba metadata
	if (a === 127 || a === 10) return 'private';
	if (a === 172 && b >= 16 && b <= 31) return 'private';
	if (a === 192 && b === 168) return 'private';
	if (a === 100 && b >= 64 && b <= 127) return 'private'; // CGNAT, also Tailscale
	if (a === 198 && (b === 18 || b === 19)) return 'private'; // benchmarking
	return 'public';
}

// Takes the WHATWG-serialized form (lowercase, compressed, no dotted tail).
function classifyIPv6(host: string): HostClass {
	const [head, tail] = host.split('::');
	const left = head ? head.split(':') : [];
	const right = tail ? tail.split(':') : [];
	const fill = tail === undefined ? [] : Array<string>(8 - left.length - right.length).fill('0');
	const g = [...left, ...fill, ...right].map((part) => parseInt(part, 16));
	if (g.length !== 8 || g.some(Number.isNaN)) return 'never';

	const v4 = () => classifyIPv4(((g[6] << 16) | g[7]) >>> 0);
	const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);

	if (zeroUpTo(7) && g[7] <= 1) return g[7] === 1 ? 'private' : 'never'; // ::1, ::
	if (zeroUpTo(6)) return v4(); // IPv4-compatible
	if (zeroUpTo(5) && g[5] === 0xffff) return v4(); // IPv4-mapped
	if (g[0] === 0x64 && g[1] === 0xff9b) {
		if (g.slice(2, 6).every((x) => x === 0)) return v4(); // NAT64
		return 'never'; // 64:ff9b:1::/48 local-use NAT64
	}
	if ((g[0] & 0xffc0) === 0xfe80) return 'never'; // link-local
	if ((g[0] & 0xff00) === 0xff00) return 'never'; // multicast
	if (g[0] === 0xfd00 && g[1] === 0xec2) return 'never'; // AWS IMDS
	if ((g[0] & 0xfe00) === 0xfc00) return 'private'; // unique-local
	if ((g[0] & 0xffc0) === 0xfec0) return 'private'; // deprecated site-local
	return 'public';
}

function classifyHost(raw: string): HostClass {
	let host = raw.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1');
	if (!host) return 'never';
	// Let the URL parser canonicalize, so 0x7f000001, 0177.0.0.1, 127.1 and
	// ::ffff:127.0.0.1 are judged in the same form fetch will connect to.
	try {
		host = new URL(`http://${host.includes(':') ? `[${host}]` : host}/`).hostname;
	} catch {
		return 'never';
	}
	host = host.replace(/^\[(.*)\]$/, '$1').replace(/\.+$/, '');

	if (host.includes(':')) return classifyIPv6(host);
	const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (v4) return classifyIPv4(((+v4[1] << 24) | (+v4[2] << 16) | (+v4[3] << 8) | +v4[4]) >>> 0);
	if (METADATA_HOSTS.has(host)) return 'never';
	if (host === 'localhost' || host.endsWith('.localhost')) return 'private';
	return 'public';
}

export function isBlockedHost(host: string, opts: { allowPrivate?: boolean } = {}): boolean {
	const kind = classifyHost(host);
	return kind === 'never' || (kind === 'private' && !opts.allowPrivate);
}

// Validate a resolved provider base URL before the server fetches it. Returns the
// parsed URL, or throws if it uses a non-HTTP scheme or targets a blocked host.
// allowPrivate (self-hosters running local models behind the web server) opens
// loopback and private ranges, never link-local or metadata.
export function assertSafeProviderUrl(rawUrl: string, allowPrivate = false): URL {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new Error('Invalid provider URL');
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error('Provider URL must use http or https');
	}

	if (isBlockedHost(url.hostname, { allowPrivate })) {
		throw new Error('Provider URL host is not allowed');
	}

	return url;
}

import test from 'node:test';
import assert from 'node:assert/strict';

import { assertSafeProviderTarget, createGuardedFetch, type Resolver } from './url-guard.server.ts';

const resolvesTo =
	(...addresses: string[]): Resolver =>
	async () =>
		addresses.map((address) => ({ address }));

test('names that resolve to private addresses are rejected', async () => {
	await assert.rejects(assertSafeProviderTarget('http://127.0.0.1.nip.io:8890', false, resolvesTo('127.0.0.1')));
	await assert.rejects(assertSafeProviderTarget('http://evil.example/v1', false, resolvesTo('8.8.8.8', '10.0.0.5')));
	await assert.rejects(assertSafeProviderTarget('http://evil.example/v1', false, resolvesTo('::ffff:169.254.169.254')));
});

test('allowPrivate still rejects names that resolve to link-local or metadata', async () => {
	await assert.rejects(assertSafeProviderTarget('http://imds.example', true, resolvesTo('169.254.169.254')));
	await assert.rejects(assertSafeProviderTarget('http://imds.example', true, resolvesTo('fe80::1')));
	const url = await assertSafeProviderTarget('http://nas.lan:11434', true, resolvesTo('192.168.1.20'));
	assert.equal(url.hostname, 'nas.lan');
});

test('public names pass and the resolver sees the bare hostname', async () => {
	const seen: string[] = [];
	const resolver: Resolver = async (host) => {
		seen.push(host);
		return [{ address: '2606:4700::1' }];
	};
	const url = await assertSafeProviderTarget('https://api.openai.com/v1', false, resolver);
	assert.equal(url.href, 'https://api.openai.com/v1');
	await assertSafeProviderTarget('http://[2606:4700::1]/v1', false, resolver);
	assert.deepEqual(seen, ['api.openai.com', '2606:4700::1']);
});

test('resolution failures and empty answers are rejected', async () => {
	const failing: Resolver = async () => {
		throw new Error('getaddrinfo ENOTFOUND nope.invalid');
	};
	await assert.rejects(assertSafeProviderTarget('http://nope.invalid', false, failing), /could not be resolved/);
	await assert.rejects(assertSafeProviderTarget('http://empty.example', false, resolvesTo()), /could not be resolved/);
});

test('literal blocked hosts are rejected before any lookup', async () => {
	let called = false;
	const resolver: Resolver = async () => {
		called = true;
		return [{ address: '8.8.8.8' }];
	};
	await assert.rejects(assertSafeProviderTarget('http://[::ffff:127.0.0.1]:8890', false, resolver));
	await assert.rejects(assertSafeProviderTarget('http://localhost.:8890', false, resolver));
	await assert.rejects(assertSafeProviderTarget('http://0x7f000001:8890', false, resolver));
	assert.equal(called, false);
});

test('base URLs with a query, fragment, or credentials are rejected', async () => {
	const ok = resolvesTo('8.8.8.8');
	for (const raw of ['http://api.example/?x', 'http://api.example/v1?x=1', 'http://api.example/#x', 'http://u:p@api.example/']) {
		await assert.rejects(assertSafeProviderTarget(raw, false, ok), raw);
	}
});

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
	const original = globalThis.fetch;
	globalThis.fetch = impl as typeof fetch;
	return () => {
		globalThis.fetch = original;
	};
}

test('guarded fetch refuses redirects instead of following them', async () => {
	let seenInit: RequestInit | undefined;
	const restore = stubFetch(async (_input, init) => {
		seenInit = init;
		return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1:8890/' } });
	});
	try {
		const guarded = createGuardedFetch(false, 1000, resolvesTo('8.8.8.8'));
		await assert.rejects(guarded('https://public.example/v1/models'), /redirect/);
		assert.equal(seenInit?.redirect, 'manual');
	} finally {
		restore();
	}
});

test('guarded fetch treats an opaque redirect as a failure', async () => {
	const restore = stubFetch(async () => {
		const res = new Response(null, { status: 200 });
		Object.defineProperty(res, 'type', { value: 'opaqueredirect' });
		return res;
	});
	try {
		await assert.rejects(createGuardedFetch(false, 1000, resolvesTo('8.8.8.8'))('https://public.example/'), /redirect/);
	} finally {
		restore();
	}
});

test('guarded fetch re-validates every request URL', async () => {
	let calls = 0;
	const restore = stubFetch(async () => {
		calls++;
		return new Response('ok');
	});
	try {
		const guarded = createGuardedFetch(false, 1000, resolvesTo('10.0.0.1'));
		await assert.rejects(guarded('https://rebound.example/v1/chat/completions'));
		await assert.rejects(guarded(new URL('http://169.254.169.254/latest/meta-data/')));
		assert.equal(calls, 0);
		const open = createGuardedFetch(false, 1000, resolvesTo('8.8.8.8'));
		assert.equal(await (await open('https://public.example/')).text(), 'ok');
		assert.equal(calls, 1);
	} finally {
		restore();
	}
});

test('guarded fetch attaches a timeout and still honors the caller signal', async () => {
	let seenSignal: AbortSignal | undefined;
	const hang = async (_input: RequestInfo | URL, init?: RequestInit) => {
		seenSignal = init?.signal ?? undefined;
		return new Promise<Response>((_resolve, reject) => {
			if (init?.signal?.aborted) return reject(init.signal.reason);
			init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
		});
	};
	const restore = stubFetch(hang);
	try {
		const guarded = createGuardedFetch(false, 50, resolvesTo('8.8.8.8'));
		await assert.rejects(guarded('https://slow.example/'), (err: Error) => err.name === 'TimeoutError');
		assert.equal(seenSignal?.aborted, true);

		const caller = new AbortController();
		const pending = guarded('https://slow.example/', { signal: caller.signal });
		caller.abort(new Error('client went away'));
		await assert.rejects(pending, /client went away/);
	} finally {
		restore();
	}
});

test('the timeout stops once headers arrive so a long stream is not cut off', async () => {
	let seenSignal: AbortSignal | undefined;
	const restore = stubFetch(async (_input, init) => {
		seenSignal = init?.signal ?? undefined;
		return new Response('streaming');
	});
	try {
		await createGuardedFetch(false, 20, resolvesTo('8.8.8.8'))('https://public.example/');
		await new Promise((resolve) => setTimeout(resolve, 60));
		assert.equal(seenSignal?.aborted, false);
	} finally {
		restore();
	}
});

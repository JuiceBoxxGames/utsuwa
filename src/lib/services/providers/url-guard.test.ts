import test from 'node:test';
import assert from 'node:assert/strict';

import { isBlockedHost, assertSafeProviderUrl } from './url-guard.ts';

const isPrivateHost = (h: string) => isBlockedHost(h);

test('loopback and localhost hosts are private', () => {
	for (const h of ['localhost', 'foo.localhost', '127.0.0.1', '127.5.5.5', '::1', '0.0.0.0']) {
		assert.equal(isPrivateHost(h), true, h);
	}
});

test('private IPv4 ranges are blocked', () => {
	for (const h of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254']) {
		assert.equal(isPrivateHost(h), true, h);
	}
});

test('public-range IPv4 near private blocks is allowed', () => {
	for (const h of ['172.32.0.1', '192.169.0.1', '11.0.0.1', '8.8.8.8']) {
		assert.equal(isPrivateHost(h), false, h);
	}
});

test('IPv6 link-local and unique-local are blocked; mapped loopback too', () => {
	assert.equal(isPrivateHost('fe80::1'), true);
	assert.equal(isPrivateHost('fd00::1'), true);
	assert.equal(isPrivateHost('[::1]'), true);
	assert.equal(isPrivateHost('::ffff:127.0.0.1'), true);
});

test('real provider hosts are allowed', () => {
	for (const h of ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com', 'api.x.ai']) {
		assert.equal(isPrivateHost(h), false, h);
	}
});

test('assertSafeProviderUrl accepts public https provider URLs', () => {
	const url = assertSafeProviderUrl('https://api.openai.com/v1');
	assert.equal(url.hostname, 'api.openai.com');
});

test('assertSafeProviderUrl rejects private hosts and non-http schemes', () => {
	assert.throws(() => assertSafeProviderUrl('http://169.254.169.254/latest/meta-data/'));
	assert.throws(() => assertSafeProviderUrl('http://localhost:11434/v1'));
	assert.throws(() => assertSafeProviderUrl('file:///etc/passwd'));
	assert.throws(() => assertSafeProviderUrl('not a url'));
});

test('allowPrivate lets self-hosters reach local models', () => {
	const url = assertSafeProviderUrl('http://localhost:11434/v1', true);
	assert.equal(url.hostname, 'localhost');
});

test('loopback expressed in non-decimal IPv4 encodings is still blocked', () => {
	// All of these resolve to 127.0.0.1 via inet_aton and used to bypass the guard.
	for (const h of ['2130706433', '0x7f000001', '0x7f.0.0.1', '0177.0.0.1', '017700000001', '127.1', '127.0.1']) {
		assert.equal(isPrivateHost(h), true, h);
	}
});

test('cloud metadata in integer form is blocked', () => {
	// 169.254.169.254 = 2852039166
	assert.equal(isPrivateHost('2852039166'), true);
});

test('assertSafeProviderUrl rejects encoded loopback', () => {
	assert.throws(() => assertSafeProviderUrl('http://2130706433:11434/v1'));
	assert.throws(() => assertSafeProviderUrl('http://0x7f000001/v1'));
});

test('hostnames that merely start with fc/fd are not misclassified as IPv6', () => {
	for (const h of ['fcbanking.com', 'fd-cdn.example.com', 'fcm.googleapis.com']) {
		assert.equal(isPrivateHost(h), false, h);
	}
});

test('public integer-form IPs are still allowed', () => {
	// 8.8.8.8 = 134744072
	assert.equal(isPrivateHost('134744072'), false);
});

// Hostnames are checked after the WHATWG parser has canonicalized them, so feed
// the bypass inputs through new URL() the same way the routes do.
const hostOf = (raw: string) => new URL(raw).hostname;

test('IPv4-mapped IPv6 is unwrapped, including the hex form the URL parser produces', () => {
	assert.equal(hostOf('http://[::ffff:127.0.0.1]/'), '[::ffff:7f00:1]');
	for (const raw of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:a9fe:a9fe]/', 'http://[::ffff:10.0.0.1]/']) {
		assert.equal(isBlockedHost(hostOf(raw)), true, raw);
		assert.throws(() => assertSafeProviderUrl(raw), raw);
	}
	assert.equal(isBlockedHost('[::ffff:8.8.8.8]'), false);
});

test('NAT64 and IPv4-compatible IPv6 are unwrapped', () => {
	for (const h of ['[64:ff9b::7f00:1]', '[64:ff9b::a9fe:a9fe]', '[64:ff9b::127.0.0.1]', '[::7f00:1]', '[64:ff9b:1::1]']) {
		assert.equal(isBlockedHost(h), true, h);
	}
	assert.equal(isBlockedHost('[64:ff9b::808:808]'), false);
});

test('trailing dots do not hide a blocked name', () => {
	for (const raw of ['http://localhost./', 'http://foo.localhost./', 'http://metadata.google.internal./', 'http://127.0.0.1./']) {
		assert.equal(isBlockedHost(hostOf(raw)), true, raw);
		assert.throws(() => assertSafeProviderUrl(raw), raw);
	}
});

test('metadata hostnames are blocked', () => {
	for (const h of ['metadata.google.internal', 'metadata.goog', 'metadata', 'instance-data', 'METADATA.GOOGLE.INTERNAL']) {
		assert.equal(isBlockedHost(h), true, h);
	}
});

test('special-purpose IPv4 ranges are blocked', () => {
	for (const h of ['100.64.0.1', '100.127.255.255', '198.18.0.1', '198.19.255.255', '224.0.0.1', '239.255.255.250', '255.255.255.255', '240.0.0.1', '0.1.2.3', '192.0.0.192', '100.100.100.200']) {
		assert.equal(isBlockedHost(h), true, h);
	}
	for (const h of ['100.63.255.255', '100.128.0.1', '198.17.255.255', '198.20.0.1', '223.255.255.255']) {
		assert.equal(isBlockedHost(h), false, h);
	}
});

test('special-purpose IPv6 ranges are blocked', () => {
	for (const h of ['[fec0::1]', '[feff::1]', '[ff02::1]', '[ff05::1:3]', '[fe80::1]', '[febf::1]', '[fc00::1]', '[fd00:ec2::254]', '[::]', '[::1]']) {
		assert.equal(isBlockedHost(h), true, h);
	}
	for (const h of ['[2001:4860:4860::8888]', '[2606:4700:4700::1111]']) {
		assert.equal(isBlockedHost(h), false, h);
	}
});

test('decimal, octal, and hex IPv4 spellings match what new URL() makes of them', () => {
	for (const raw of ['http://2130706433/', 'http://0177.0.0.1/', 'http://0x7f000001/', 'http://0x7f.1/', 'http://2852039166/']) {
		const host = hostOf(raw);
		assert.match(host, /^(127\.0\.0\.1|169\.254\.169\.254)$/, raw);
		assert.equal(isBlockedHost(host), true, raw);
		assert.equal(isBlockedHost(host.replace(/^http:\/\//, '')), true, raw);
		assert.throws(() => assertSafeProviderUrl(raw), raw);
	}
});

test('allowPrivate opens loopback, RFC1918, unique-local, CGNAT, and benchmark ranges', () => {
	for (const h of ['localhost', 'localhost.', 'foo.localhost', '127.0.0.1', '[::1]', '10.1.2.3', '172.20.0.1', '192.168.1.10', '[fd12::1]', '[fec0::1]', '100.64.0.1', '198.18.0.1', '[::ffff:7f00:1]', '[64:ff9b::a00:1]']) {
		assert.equal(isBlockedHost(h, { allowPrivate: true }), false, h);
		assert.equal(isBlockedHost(h), true, h);
	}
});

test('allowPrivate never opens link-local, metadata, unspecified, or multicast', () => {
	for (const h of ['169.254.169.254', '169.254.0.1', '[fe80::1]', '[::ffff:a9fe:a9fe]', '[64:ff9b::a9fe:a9fe]', 'metadata.google.internal', 'metadata.google.internal.', '100.100.100.200', '[fd00:ec2::254]', '0.0.0.0', '[::]', '224.0.0.1', '[ff02::1]', '255.255.255.255', '']) {
		assert.equal(isBlockedHost(h, { allowPrivate: true }), true, h);
	}
	assert.throws(() => assertSafeProviderUrl('http://169.254.169.254/', true));
	assert.throws(() => assertSafeProviderUrl('http://[fe80::1]/', true));
	assert.equal(assertSafeProviderUrl('http://127.0.0.1:8890', true).hostname, '127.0.0.1');
});

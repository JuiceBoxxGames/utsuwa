import test from 'node:test';
import assert from 'node:assert/strict';

import {
	partitionNewRecords,
	factKey,
	sessionKey,
	turnKey,
	eventKey,
	importSessions,
	remapSessionIds
} from './import-dedup.ts';

// --- key functions ---

test('factKey distinguishes by category and content', () => {
	assert.equal(factKey({ category: 'user', content: 'likes tea' }), 'user|likes tea');
	assert.notEqual(
		factKey({ category: 'user', content: 'a' }),
		factKey({ category: 'relationship', content: 'a' })
	);
});

test('date-based keys normalize Date objects and ISO strings to the same value', () => {
	const iso = '2026-07-03T12:00:00.000Z';
	const date = new Date(iso);
	assert.equal(sessionKey({ startedAt: iso }), sessionKey({ startedAt: date }));
	assert.equal(
		turnKey({ createdAt: iso, role: 'user', content: 'hi' }),
		turnKey({ createdAt: date, role: 'user', content: 'hi' })
	);
	assert.equal(
		eventKey({ eventId: 'confession_event', completedAt: iso }),
		eventKey({ eventId: 'confession_event', completedAt: date })
	);
});

test('missing dates produce a stable empty key rather than NaN', () => {
	assert.equal(sessionKey({}), '');
	assert.equal(turnKey({ role: 'user', content: 'x' }), '|user|x');
});

// --- partitionNewRecords (the merge dedup) ---

test('with no existing keys, all unique records are added', () => {
	const recs = [{ content: 'a' }, { content: 'b' }, { content: 'c' }];
	const { toAdd, skipped } = partitionNewRecords(recs, (r) => r.content, new Set());
	assert.equal(toAdd.length, 3);
	assert.equal(skipped, 0);
});

test('regression: re-importing records already present adds nothing', () => {
	const recs = [
		{ category: 'user', content: 'a' },
		{ category: 'user', content: 'b' }
	];
	const existing = new Set(recs.map(factKey));
	const { toAdd, skipped } = partitionNewRecords(recs, factKey, existing);
	assert.equal(toAdd.length, 0);
	assert.equal(skipped, 2);
});

test('duplicates within the same batch are only added once', () => {
	const recs = [
		{ category: 'user', content: 'a' },
		{ category: 'user', content: 'a' },
		{ category: 'user', content: 'b' }
	];
	const { toAdd, skipped } = partitionNewRecords(recs, factKey, new Set());
	assert.equal(toAdd.length, 2);
	assert.equal(skipped, 1);
});

test('mixed present-and-new: only the new records are added', () => {
	const recs = [
		{ category: 'user', content: 'old' },
		{ category: 'user', content: 'new' }
	];
	const existing = new Set([factKey({ category: 'user', content: 'old' })]);
	const { toAdd, skipped } = partitionNewRecords(recs, factKey, existing);
	assert.deepEqual(
		toAdd.map((r) => r.content),
		['new']
	);
	assert.equal(skipped, 1);
});

// --- session id mapping ---

test('importSessions maps exported session ids to the ids the database assigns', async () => {
	let next = 40;
	const added: unknown[] = [];
	const result = await importSessions(
		[
			{ id: 1, startedAt: '2026-07-01T00:00:00Z' },
			{ id: 2, startedAt: '2026-07-02T00:00:00Z' },
			{ id: 3, startedAt: '2026-07-01T00:00:00Z' }
		],
		[{ id: 9, startedAt: new Date('2026-07-02T00:00:00Z') }],
		async (record) => {
			added.push(record);
			return next++;
		}
	);
	assert.deepEqual([...result.idMap], [[1, 40], [2, 9], [3, 40]]);
	assert.equal(result.added, 1);
	assert.equal(result.skipped, 2);
	assert.deepEqual(added, [{ startedAt: '2026-07-01T00:00:00Z' }], 'the old id is never written');
});

test('remapSessionIds points turns at the new sessions and drops unknown ids', () => {
	const turns = [{ sessionId: 1 }, { sessionId: 2 }, { sessionId: 77 }, {}];
	assert.deepEqual(remapSessionIds(turns, new Map([[1, 40], [2, 9]])), [
		{ sessionId: 40 },
		{ sessionId: 9 },
		{ sessionId: undefined },
		{}
	]);
});

test('remapSessionIds leaves older saves without session ids alone', () => {
	const turns = [{ sessionId: 3 }];
	assert.equal(remapSessionIds(turns, new Map()), turns);
});

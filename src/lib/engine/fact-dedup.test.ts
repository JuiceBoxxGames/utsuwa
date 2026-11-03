import test from 'node:test';
import assert from 'node:assert/strict';

import {
	cosineSimilarity,
	normalizeFactContent,
	findDuplicateFact,
	duplicateFactUpdate,
	HEURISTIC_FACT_SOURCE,
	FACT_DUPLICATE_SIMILARITY
} from './fact-dedup.ts';

test('cosineSimilarity basics', () => {
	assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
	assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
	assert.equal(cosineSimilarity([1, 0], [1, 0, 0]), 0); // length mismatch
	assert.equal(cosineSimilarity([0, 0], [1, 0]), 0); // zero vector
});

test('normalizeFactContent trims, lowercases, and collapses whitespace', () => {
	assert.equal(normalizeFactContent('  They love   Coffee '), 'they love coffee');
});

test('exact-normalized content matches regardless of embeddings', () => {
	const existing = [
		{ id: 1, content: 'They love coffee', embedding: undefined },
		{ id: 2, content: 'They have a dog named Mochi', embedding: undefined }
	];
	const match = findDuplicateFact({ content: '  they LOVE coffee  ' }, existing);
	assert.equal(match?.id, 1);
});

test('a near-paraphrase is caught by embedding similarity', () => {
	// Two nearly-identical directions, one orthogonal
	const existing = [
		{ id: 1, content: 'User is a designer at Rove', embedding: [0.9999, 0.0141, 0] },
		{ id: 2, content: 'They are scared of thunderstorms', embedding: [0, 0, 1] }
	];
	const candidate = {
		content: 'The user works as a designer at Rove iQ',
		embedding: [1, 0, 0]
	};
	const match = findDuplicateFact(candidate, existing);
	assert.equal(match?.id, 1);
});

test('distinct facts below the threshold are not merged', () => {
	const existing = [{ id: 1, content: 'They like tea', embedding: [0.8, 0.6, 0] }];
	// similarity 0.8, below the 0.9 threshold
	const match = findDuplicateFact({ content: 'They like trains', embedding: [1, 0, 0] }, existing);
	assert.equal(match, null);
});

test('the most similar duplicate wins when several clear the threshold', () => {
	const existing = [
		{ id: 1, content: 'a', embedding: [0.95, Math.sqrt(1 - 0.95 * 0.95), 0] },
		{ id: 2, content: 'b', embedding: [0.99, Math.sqrt(1 - 0.99 * 0.99), 0] }
	];
	const match = findDuplicateFact({ content: 'c', embedding: [1, 0, 0] }, existing);
	assert.equal(match?.id, 2);
});

test('existing facts without embeddings are skipped by the semantic path', () => {
	const existing = [{ id: 1, content: 'Something else entirely', embedding: [] }];
	const match = findDuplicateFact({ content: 'New fact', embedding: [1, 0, 0] }, existing);
	assert.equal(match, null);
});

test('no candidate embedding falls back to string matching only', () => {
	const existing = [{ id: 1, content: 'They love coffee', embedding: [1, 0, 0] }];
	assert.equal(findDuplicateFact({ content: 'They love espresso' }, existing), null);
	assert.equal(findDuplicateFact({ content: 'they love coffee' }, existing)?.id, 1);
});

test('acceptance: 50 same-topic writes leave no near-duplicate pair in the table', () => {
	// Simulates the storage loop: dedup against the table, bump on match,
	// insert otherwise. Paraphrases are tiny angular perturbations of the same
	// direction; genuinely new facts are orthogonal.
	type Row = { id: number; content: string; embedding: number[]; referenceCount: number };
	const table: Row[] = [];
	let nextId = 1;

	const DIM = 8;
	const basis = (k: number) => Array.from({ length: DIM }, (_, j) => (j === k ? 1 : 0));

	// Paraphrases: tiny rotations within the e0/e1 plane, similarity > 0.99
	const paraphrase = (i: number): { content: string; embedding: number[] } => {
		const wobble = 0.01 * (i % 5);
		const e = basis(0).map((v, j) => (j === 0 ? Math.cos(wobble) : j === 1 ? Math.sin(wobble) : 0));
		return { content: `They talked about the coffee ritual variant ${i}`, embedding: e };
	};

	for (let i = 0; i < 50; i++) {
		// Every 10th write is a genuinely new fact on its own axis
		const candidate =
			i % 10 === 0
				? { content: `Unique fact ${i}`, embedding: basis(2 + i / 10) }
				: paraphrase(i);
		const dupe = findDuplicateFact(candidate, table);
		if (dupe) {
			dupe.referenceCount++;
		} else {
			table.push({ id: nextId++, referenceCount: 0, ...candidate });
		}
	}

	for (let a = 0; a < table.length; a++) {
		for (let b = a + 1; b < table.length; b++) {
			const sim = cosineSimilarity(table[a].embedding, table[b].embedding);
			assert.ok(
				sim < FACT_DUPLICATE_SIMILARITY,
				`facts ${table[a].id} and ${table[b].id} are near-duplicates (${sim.toFixed(3)})`
			);
		}
	}
});

test('duplicateFactUpdate: a semantic match takes the newer wording', () => {
	const now = new Date('2026-11-03T12:00:00Z');
	const existing = {
		content: 'User is 25 years old',
		importance: 70,
		confidence: 0.8,
		source: 'conversation',
		referenceCount: 2,
		embedding: [1, 0]
	};
	const patch = duplicateFactUpdate(
		existing,
		{ content: 'User is 26 years old', importance: 50, confidence: 1, source: 'manual' },
		[0.99, 0.1],
		'model-x',
		now
	);
	assert.deepEqual(patch, {
		referenceCount: 3,
		importance: 70,
		lastAccessed: now,
		content: 'User is 26 years old',
		confidence: 1,
		source: 'manual',
		embedding: [0.99, 0.1],
		embeddingModel: 'model-x'
	});
});

test('duplicateFactUpdate: an exact match only bumps the reference', () => {
	const now = new Date('2026-11-03T12:00:00Z');
	const patch = duplicateFactUpdate(
		{ content: 'User loves coffee', importance: 40, referenceCount: 0 },
		{ content: '  user LOVES coffee ', importance: 60 },
		[1, 0],
		'model-x',
		now
	);
	assert.deepEqual(patch, { referenceCount: 1, importance: 60, lastAccessed: now });
});

test('duplicateFactUpdate: a heuristic fragment never replaces existing wording', () => {
	const now = new Date('2026-11-03T12:00:00Z');
	const patch = duplicateFactUpdate(
		{ content: 'User is a nurse who works night shifts', importance: 50, referenceCount: 0 },
		{ content: 'User: a nurse who works night shifts', source: HEURISTIC_FACT_SOURCE },
		[1, 0],
		'model-x',
		now
	);
	assert.deepEqual(patch, { referenceCount: 1, importance: 50, lastAccessed: now });
});

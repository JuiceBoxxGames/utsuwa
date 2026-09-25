import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STORAGE_INVENTORY, listClearTargets } from './storage-inventory.ts';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === 'paraglide' ? [] : sourceFiles(path);
		return /\.(ts|svelte)$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
	});
}

test('every localforage store and localStorage key in the inventory is a clear target', () => {
	const keys = [
		...Object.values(STORAGE_INVENTORY.localStorage),
		`${STORAGE_INVENTORY.localStorageModulePrefix}vision`,
		'someone-elses-key'
	];
	const targets = listClearTargets(keys);
	assert.deepEqual(
		targets.localforage.map((s) => s.name).sort(),
		Object.values(STORAGE_INVENTORY.localforage).map((s) => s.name).sort()
	);
	assert.deepEqual(targets.localStorage.sort(), keys.filter((k) => k !== 'someone-elses-key').sort());
});

test('every inventory localStorage key uses the utsuwa- prefix or is colorMode', () => {
	for (const key of Object.values(STORAGE_INVENTORY.localStorage)) {
		assert.ok(key.startsWith('utsuwa-') || key === 'colorMode', key);
	}
});

// A store that names its own storage bypasses the inventory, and Clear All Data
// would miss it. Strings that merely look like keys (event names, ids) are listed.
const NOT_STORAGE = new Set(['utsuwa-logo', 'utsuwa-open-character-settings']);

test('no source file names a store or storage key outside the inventory', () => {
	const offenders: string[] = [];
	for (const file of sourceFiles(SRC)) {
		if (file.endsWith('storage-inventory.ts')) continue;
		const text = readFileSync(file, 'utf8');
		if (/createInstance\(\s*\{\s*name:\s*['"`]/.test(text)) offenders.push(`${file}: createInstance literal`);
		if (/localStorage\.setItem\(\s*['"`]/.test(text)) offenders.push(`${file}: setItem literal`);
		for (const [, literal] of text.matchAll(/['"`](utsuwa-[\w-]+)['"`]/g)) {
			if (!NOT_STORAGE.has(literal)) offenders.push(`${file}: ${literal}`);
		}
	}
	assert.deepEqual(offenders, []);
});

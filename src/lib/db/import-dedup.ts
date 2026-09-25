// Dedup helpers for save-file import. Kept dependency-free (no Dexie, no stores)
// so they can be unit tested. Exported records have their auto-increment ids
// stripped, so merge-mode re-import must dedup on natural content keys instead.

const asTime = (v: unknown): string => {
	const t = v == null ? NaN : new Date(v as string | number | Date).getTime();
	return Number.isNaN(t) ? '' : String(t);
};

export const factKey = (f: { content?: unknown; category?: unknown }): string =>
	`${f.category ?? ''}|${f.content ?? ''}`;

export const sessionKey = (s: { startedAt?: unknown }): string => asTime(s.startedAt);

export const turnKey = (t: { createdAt?: unknown; role?: unknown; content?: unknown }): string =>
	`${asTime(t.createdAt)}|${t.role ?? ''}|${t.content ?? ''}`;

export const eventKey = (e: { eventId?: unknown; completedAt?: unknown }): string =>
	`${e.eventId ?? ''}|${asTime(e.completedAt)}`;

// Split incoming records into those to insert vs. duplicates to skip. Dedupes
// against records already present AND within the incoming batch itself.
export function partitionNewRecords<T>(
	records: T[],
	keyOf: (r: T) => string,
	existingKeys: Set<string>
): { toAdd: T[]; skipped: number } {
	const seen = new Set(existingKeys);
	const toAdd: T[] = [];
	let skipped = 0;
	for (const record of records) {
		const key = keyOf(record);
		if (seen.has(key)) {
			skipped++;
			continue;
		}
		seen.add(key);
		toAdd.push(record);
	}
	return { toAdd, skipped };
}

// Sessions get fresh auto-increment ids on insert, so turns that reference the
// exported id must be pointed at whatever id the session lands on (or the
// existing duplicate it merged into).
export async function importSessions<T extends { id?: number; startedAt?: unknown }>(
	records: T[],
	existing: { id?: number; startedAt?: unknown }[],
	add: (record: Omit<T, 'id'>) => Promise<number>
): Promise<{ idMap: Map<number, number>; added: number; skipped: number }> {
	const idByKey = new Map<string, number>();
	for (const s of existing) if (s.id !== undefined) idByKey.set(sessionKey(s), s.id);
	const idMap = new Map<number, number>();
	let added = 0;
	let skipped = 0;
	for (const { id: oldId, ...rest } of records) {
		const key = sessionKey(rest);
		let newId = idByKey.get(key);
		if (newId === undefined) {
			newId = await add(rest);
			idByKey.set(key, newId);
			added++;
		} else {
			skipped++;
		}
		if (typeof oldId === 'number') idMap.set(oldId, newId);
	}
	return { idMap, added, skipped };
}

// Saves exported before session ids were kept carry no mapping; their turns are
// left as they were since there's nothing better to point them at.
export function remapSessionIds<T extends { sessionId?: number }>(
	records: T[],
	idMap: Map<number, number>
): T[] {
	if (idMap.size === 0) return records;
	return records.map((r) =>
		r.sessionId === undefined ? r : { ...r, sessionId: idMap.get(r.sessionId) }
	);
}

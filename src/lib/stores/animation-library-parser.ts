// Pure half of the animation library: built-in defaults plus the parser for the
// metadata saved in localStorage. Blobs live in localforage, not here.

export interface AnimationEntry {
	id: string;
	name: string;
	url: string;
	description: string;
	llmEnabled: boolean;
	// Idle clips loop and are never offered to the model
	kind: 'emote' | 'idle' | 'custom';
	createdAt?: number;
	durationSec?: number;
}

export type BuiltinOverride = { description?: string; llmEnabled?: boolean };
export type StoredCustomAnimation = Omit<AnimationEntry, 'url' | 'kind'>;

// Ids are checked against the library at read time, so a deleted clip just
// drops out of the pool
export interface BaseBehavior {
	idlePool: string[];
	thinkingId: string | null;
}

export interface StoredAnimationMetadata {
	overrides: Record<string, BuiltinOverride>;
	custom: StoredCustomAnimation[];
	base: BaseBehavior;
}

// Same rule the response parser applies to "action", so every stored id is one
// the model can actually address
export const ANIMATION_ID_PATTERN = /^[a-z0-9_-]{1,64}$/i;
export const MAX_NAME_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 300;

// Names and descriptions by dezihh (dezihh/utsuwa#5)
export const BUILTIN_ANIMATIONS: readonly AnimationEntry[] = [
	['vrma_01', 'Show Full Body', 'Step back and present the full avatar body'],
	['vrma_02', 'Greeting', 'Greet with a polite bowing motion'],
	['vrma_03', 'Peace Sign', 'Make a peace sign with the fingers'],
	['vrma_04', 'Shoot', 'Point finger forward like shooting'],
	['vrma_05', 'Spin', 'Spin around once'],
	['vrma_06', 'Model Pose', 'Strike a confident model pose'],
	['vrma_07', 'Squat', 'Squat down briefly']
].map(([id, name, description]) => ({
	id,
	name,
	description,
	url: `/animations/${id.toUpperCase()}.vrma`,
	llmEnabled: true,
	kind: 'emote' as const
}));

export const BUILTIN_IDLES: readonly AnimationEntry[] = ['idle', 'idle_2', 'idle_3', 'idle_4', 'idle_5'].map(
	(file, i) => ({
		id: `idle_${i + 1}`,
		name: `Idle ${i + 1}`,
		description: 'Built-in idle loop',
		url: `/animations/${file}.vrma`,
		llmEnabled: false,
		kind: 'idle' as const
	})
);

const BUILTIN_IDS = new Set([...BUILTIN_ANIMATIONS, ...BUILTIN_IDLES].map((a) => a.id));

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const finite = (v: unknown): number | undefined =>
	typeof v === 'number' && Number.isFinite(v) ? v : undefined;

function parseOverride(raw: unknown): BuiltinOverride | null {
	if (!isRecord(raw)) return null;
	const out: BuiltinOverride = {};
	if (typeof raw.description === 'string') out.description = raw.description.slice(0, MAX_DESCRIPTION_LENGTH);
	if (typeof raw.llmEnabled === 'boolean') out.llmEnabled = raw.llmEnabled;
	return out;
}

function parseCustom(raw: unknown): StoredCustomAnimation | null {
	if (!isRecord(raw)) return null;
	const { id, name } = raw;
	if (typeof id !== 'string' || !ANIMATION_ID_PATTERN.test(id) || BUILTIN_IDS.has(id)) return null;
	if (typeof name !== 'string' || !name.trim()) return null;
	const entry: StoredCustomAnimation = {
		id,
		name: name.slice(0, MAX_NAME_LENGTH),
		description: typeof raw.description === 'string' ? raw.description.slice(0, MAX_DESCRIPTION_LENGTH) : '',
		llmEnabled: raw.llmEnabled === true
	};
	const createdAt = finite(raw.createdAt);
	const durationSec = finite(raw.durationSec);
	if (createdAt !== undefined) entry.createdAt = createdAt;
	if (durationSec !== undefined) entry.durationSec = durationSec;
	return entry;
}

function parseBase(raw: unknown): BaseBehavior {
	if (!isRecord(raw)) return { idlePool: [], thinkingId: null };
	const pool = Array.isArray(raw.idlePool) ? raw.idlePool.filter((id): id is string => typeof id === 'string') : [];
	return {
		idlePool: [...new Set(pool)],
		thinkingId: typeof raw.thinkingId === 'string' ? raw.thinkingId : null
	};
}

export function parseAnimationMetadata(raw: string | null): StoredAnimationMetadata {
	const empty: StoredAnimationMetadata = { overrides: {}, custom: [], base: parseBase(null) };
	if (!raw) return empty;
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		console.warn('Ignoring unreadable animation library settings');
		return empty;
	}
	if (!isRecord(data)) return empty;

	const overrides: Record<string, BuiltinOverride> = {};
	if (isRecord(data.overrides)) {
		for (const [id, value] of Object.entries(data.overrides)) {
			const parsed = BUILTIN_IDS.has(id) ? parseOverride(value) : null;
			if (parsed) overrides[id] = parsed;
		}
	}

	const custom: StoredCustomAnimation[] = [];
	if (Array.isArray(data.custom)) {
		for (const value of data.custom) {
			const parsed = parseCustom(value);
			if (parsed && !custom.some((c) => c.id === parsed.id)) custom.push(parsed);
		}
	}
	return { overrides, custom, base: parseBase(data.base) };
}

export function applyBuiltinOverrides(overrides: Record<string, BuiltinOverride>): AnimationEntry[] {
	return [...BUILTIN_ANIMATIONS, ...BUILTIN_IDLES].map((a) => ({ ...a, ...overrides[a.id] }));
}

/** URLs the idle cycle picks from: the chosen clips that still exist, else the fallback. */
export function resolveIdlePool(
	base: BaseBehavior,
	candidates: readonly AnimationEntry[],
	fallbackUrls: readonly string[]
): string[] {
	const urls = base.idlePool.flatMap((id) => candidates.find((c) => c.id === id)?.url ?? []);
	return urls.length > 0 ? urls : [...fallbackUrls];
}

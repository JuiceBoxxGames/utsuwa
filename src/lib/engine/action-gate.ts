// Decides whether an "action" the model asked for actually plays. Cooldowns
// stop her repeating the same gesture every reply or chaining different ones.
export function resolveAction(
	id: string,
	now: number,
	opts: {
		enabled: readonly { id: string; url: string }[];
		lastFired: ReadonlyMap<string, number>;
		lastAnyFired: number;
		perActionCooldownMs?: number;
		globalCooldownMs?: number;
	}
): { url: string } | null {
	const { perActionCooldownMs = 20000, globalCooldownMs = 8000 } = opts;
	const entry = opts.enabled.find((e) => e.id === id);
	if (!entry) return null;
	const last = opts.lastFired.get(id);
	if (last !== undefined && now - last < perActionCooldownMs) return null;
	if (now - opts.lastAnyFired < globalCooldownMs) return null;
	return { url: entry.url };
}

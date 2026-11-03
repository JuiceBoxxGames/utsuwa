// Pure streak logic, split from the character store so it can be unit-tested.

export interface StreakSnapshot {
	currentStreak: number;
	longestStreak: number;
	streakLastDate: string | null;
}

// Format a date as local YYYY-MM-DD (toISOString would use UTC day boundaries,
// which breaks streaks for anyone chatting across a UTC midnight)
export function localDateKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function computeStreakUpdate(streak: StreakSnapshot, now: Date): StreakSnapshot {
	const today = localDateKey(now);

	if (streak.streakLastDate === today) {
		return { ...streak };
	}

	// A recorded date a day or two ahead is timezone travel or a clock set back
	// slightly: treat it as already visited rather than resetting. Further out it
	// came from a clock that was wrong once, so re-anchor on today or the streak
	// stays frozen until that date comes around.
	if (streak.streakLastDate && streak.streakLastDate > today) {
		const latestPlausible = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));
		if (streak.streakLastDate <= latestPlausible) return { ...streak };
		return { ...streak, streakLastDate: today };
	}

	// Calendar arithmetic, not now - 24h: DST days aren't 24 hours long.
	const yesterday = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

	if (streak.streakLastDate === yesterday) {
		const next = streak.currentStreak + 1;
		return {
			currentStreak: next,
			longestStreak: Math.max(streak.longestStreak, next),
			streakLastDate: today
		};
	}

	return {
		currentStreak: 1,
		longestStreak: Math.max(streak.longestStreak, 1),
		streakLastDate: today
	};
}

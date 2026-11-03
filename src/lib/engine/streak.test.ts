import test from 'node:test';
import assert from 'node:assert/strict';

import { computeStreakUpdate, localDateKey } from './streak.ts';

test('localDateKey formats in local time with zero padding', () => {
	assert.equal(localDateKey(new Date(2026, 0, 5)), '2026-01-05');
	assert.equal(localDateKey(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

test('first visit starts a streak of 1', () => {
	const result = computeStreakUpdate(
		{ currentStreak: 0, longestStreak: 0, streakLastDate: null },
		new Date(2026, 5, 15, 9, 0)
	);
	assert.deepEqual(result, { currentStreak: 1, longestStreak: 1, streakLastDate: '2026-06-15' });
});

test('a repeat visit on the same day changes nothing', () => {
	const streak = { currentStreak: 4, longestStreak: 6, streakLastDate: '2026-06-15' };
	const result = computeStreakUpdate(streak, new Date(2026, 5, 15, 22, 30));
	assert.deepEqual(result, streak);
});

test('a consecutive day increments and updates the longest streak', () => {
	const result = computeStreakUpdate(
		{ currentStreak: 3, longestStreak: 3, streakLastDate: '2026-06-14' },
		new Date(2026, 5, 15, 7, 0)
	);
	assert.deepEqual(result, { currentStreak: 4, longestStreak: 4, streakLastDate: '2026-06-15' });
});

test('a missed day resets the streak to 1 but keeps the longest', () => {
	const result = computeStreakUpdate(
		{ currentStreak: 5, longestStreak: 8, streakLastDate: '2026-06-12' },
		new Date(2026, 5, 15)
	);
	assert.deepEqual(result, { currentStreak: 1, longestStreak: 8, streakLastDate: '2026-06-15' });
});

test('yesterday crosses month and year boundaries by calendar arithmetic', () => {
	// Dec 31 -> Jan 1
	const newYear = computeStreakUpdate(
		{ currentStreak: 2, longestStreak: 5, streakLastDate: '2025-12-31' },
		new Date(2026, 0, 1, 8)
	);
	assert.equal(newYear.currentStreak, 3);

	// Feb 28 -> Mar 1 (2026 is not a leap year)
	const march = computeStreakUpdate(
		{ currentStreak: 1, longestStreak: 1, streakLastDate: '2026-02-28' },
		new Date(2026, 2, 1, 12)
	);
	assert.equal(march.currentStreak, 2);
});

test('a DST transition day still counts as consecutive', () => {
	// US spring-forward is 2026-03-08; the local calendar day before it is 03-07
	// regardless of the day only having 23 hours.
	const result = computeStreakUpdate(
		{ currentStreak: 5, longestStreak: 5, streakLastDate: '2026-03-07' },
		new Date(2026, 2, 8, 9, 0)
	);
	assert.deepEqual(result, { currentStreak: 6, longestStreak: 6, streakLastDate: '2026-03-08' });
});

test('a clock set backwards (future streakLastDate) reads as already visited, not a reset', () => {
	// Within the two-day window, e.g. flying west across the date line.
	const streak = { currentStreak: 7, longestStreak: 9, streakLastDate: '2026-06-17' };
	const result = computeStreakUpdate(streak, new Date(2026, 5, 15));
	assert.deepEqual(result, streak);
});

test('a streakLastDate far in the future re-anchors to today instead of freezing', () => {
	// One visit with the clock a year ahead used to pin the streak until that date.
	let s = computeStreakUpdate(
		{ currentStreak: 5, longestStreak: 5, streakLastDate: '2027-11-03' },
		new Date(2026, 10, 3, 12)
	);
	assert.deepEqual(s, { currentStreak: 5, longestStreak: 5, streakLastDate: '2026-11-03' });
	s = computeStreakUpdate(s, new Date(2026, 10, 4, 12));
	assert.equal(s.currentStreak, 6);
});

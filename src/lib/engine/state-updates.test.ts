import test from 'node:test';
import assert from 'node:assert/strict';

import {
	applyTimeDecay,
	mergeUpdates,
	checkAndApplyStageTransition,
	resolveTimeDecayOnLoad
} from './state-updates.ts';
import { STAGE_ORDER } from './stages.ts';
import type { CharacterState, StateUpdates } from '$lib/types/character';

const HOUR = 1000 * 60 * 60;

function makeState(overrides: Partial<CharacterState> = {}): CharacterState {
	return {
		name: 'Utsuwa',
		systemPrompt: '',
		extensions: {},
		mood: { primary: 'neutral', intensity: 50, causes: [] },
		energy: 100,
		affection: 0,
		trust: 0,
		intimacy: 0,
		comfort: 0,
		respect: 0,
		appMode: 'dating_sim',
		relationshipStage: 'stranger',
		personality: {},
		lastInteraction: null,
		firstMet: new Date('2026-01-01'),
		daysKnown: 0,
		totalInteractions: 0,
		currentStreak: 0,
		longestStreak: 0,
		streakLastDate: null,
		completedEvents: [],
		createdAt: new Date('2026-01-01'),
		updatedAt: new Date('2026-01-01'),
		...overrides
	} as CharacterState;
}

// --- applyTimeDecay ---

test('a short absence only recovers energy', () => {
	const updates = applyTimeDecay(makeState({ energy: 50, affection: 500, trust: 80 }), 1);
	assert.ok((updates.energyDelta ?? 0) >= 1);
	assert.equal(updates.affectionDelta, undefined);
	assert.equal(updates.trustDelta, undefined);
	assert.equal(updates.moodChange, undefined);
});

test('energy recovers fully after 6 hours and never over-fills', () => {
	const updates = applyTimeDecay(makeState({ energy: 40 }), 7);
	assert.equal(updates.energyDelta, 60);
	const full = applyTimeDecay(makeState({ energy: 100 }), 7);
	assert.equal(full.energyDelta, undefined);
});

test('partial energy recovery always restores at least 1', () => {
	const updates = applyTimeDecay(makeState({ energy: 99 }), 1);
	assert.equal(updates.energyDelta, 1);
});

test('affection decays only after 48 hours and is capped at 50', () => {
	const none = applyTimeDecay(makeState({ affection: 500 }), 48);
	assert.equal(none.affectionDelta, undefined);

	const some = applyTimeDecay(makeState({ affection: 500 }), 72);
	assert.equal(some.affectionDelta, -5); // 1 day past grace at 1%/day

	const capped = applyTimeDecay(makeState({ affection: 1000 }), 24 * 60);
	assert.equal(capped.affectionDelta, -50);
});

test('trust decays only after 7 days and is capped at 10', () => {
	const none = applyTimeDecay(makeState({ trust: 90 }), 168);
	assert.equal(none.trustDelta, undefined);

	const oneWeek = applyTimeDecay(makeState({ trust: 90 }), 169);
	assert.equal(oneWeek.trustDelta, -2);

	const capped = applyTimeDecay(makeState({ trust: 90 }), 168 * 10);
	assert.equal(capped.trustDelta, -10);
});

test('mood shifts to melancholy after 3 days away', () => {
	const updates = applyTimeDecay(makeState(), 96);
	assert.equal(updates.moodChange?.emotion, 'melancholy');
	assert.ok((updates.moodChange?.intensityDelta ?? 0) <= 30);
});

// --- resolveTimeDecayOnLoad (once-per-absence guard) ---

test('a 3-day absence decays affection once and marks lastDecayAt', () => {
	const now = 1_000_000_000_000;
	const state = makeState({
		affection: 500,
		trust: 90,
		lastInteraction: new Date(now - 72 * HOUR),
		lastDecayAt: null
	});
	const result = resolveTimeDecayOnLoad(state, now);
	assert.equal(result.changed, true);
	assert.equal(result.next.affection, 495); // -5 for a 3-day absence
	assert.ok(result.next.lastDecayAt instanceof Date);
});

test('regression: reloading after decay does NOT re-deduct affection', () => {
	const now = 1_000_000_000_000;
	const lastInteraction = new Date(now - 72 * HOUR);
	const first = resolveTimeDecayOnLoad(
		makeState({ affection: 500, trust: 90, lastInteraction, lastDecayAt: null }),
		now
	);
	// Second load: same absence, but lastDecayAt is now set from the first pass
	const second = resolveTimeDecayOnLoad(
		makeState({ affection: 495, trust: 90, lastInteraction, lastDecayAt: first.next.lastDecayAt }),
		now + HOUR
	);
	assert.equal(second.next.affection, undefined, 'affection must not decay a second time');
	assert.equal(second.changed, false);
});

test('interacting re-arms decay for the next absence', () => {
	const now = 1_000_000_000_000;
	// Decayed during a past absence, then chatted (lastInteraction advanced past lastDecayAt)
	const state = makeState({
		affection: 500,
		trust: 90,
		lastDecayAt: new Date(now - 100 * HOUR),
		lastInteraction: new Date(now - 72 * HOUR)
	});
	const result = resolveTimeDecayOnLoad(state, now);
	assert.equal(result.next.affection, 495, 'a new absence decays again');
});

test('energy still recovers on every load even when decay is locked out', () => {
	const now = 1_000_000_000_000;
	const lastInteraction = new Date(now - 72 * HOUR);
	const state = makeState({
		energy: 40,
		affection: 500,
		lastInteraction,
		lastDecayAt: lastInteraction // already decayed this absence
	});
	const result = resolveTimeDecayOnLoad(state, now);
	assert.equal(result.next.energy, 100); // energy is self-limiting, always recovers
	assert.equal(result.next.affection, undefined); // decay stays locked out
	assert.equal(result.changed, true);
});

test('no decay under the 30-minute floor', () => {
	const now = 1_000_000_000_000;
	const result = resolveTimeDecayOnLoad(
		makeState({ lastInteraction: new Date(now - 10 * 60 * 1000) }),
		now
	);
	assert.equal(result.changed, false);
});

// --- zero-decay guard (48-72h dead zone) ---

test('a 49h absence computes zero decay and sets no affection delta', () => {
	const updates = applyTimeDecay(makeState({ affection: 500 }), 49);
	assert.equal(updates.affectionDelta, undefined);
});

test('a rounding-to-zero decay sets no delta either', () => {
	// affection 30 at 5 days away: floor(30 * 0.03) = 0
	const updates = applyTimeDecay(makeState({ affection: 30 }), 120);
	assert.equal(updates.affectionDelta, undefined);
});

test('regression: a zero-decay load does not consume the once-per-absence slot', () => {
	const now = 1_000_000_000_000;
	const lastInteraction = new Date(now - 49 * HOUR);

	// Opening the app at hour 49 without interacting: energy recovers, but no
	// decay happened, so the absence's decay slot must stay armed.
	const first = resolveTimeDecayOnLoad(
		makeState({ energy: 40, affection: 500, lastInteraction, lastDecayAt: null }),
		now
	);
	assert.equal(first.next.energy, 100);
	assert.equal(first.next.affection, undefined);
	assert.equal(first.next.lastDecayAt, undefined, 'zero decay must not write lastDecayAt');
	assert.equal(first.changed, true);

	// Returning at hour 120 of the same absence: the real decay still applies.
	const second = resolveTimeDecayOnLoad(
		makeState({ affection: 500, lastInteraction, lastDecayAt: null }),
		lastInteraction.getTime() + 120 * HOUR
	);
	assert.equal(second.next.affection, 485); // 3 days past grace at 1%/day
	assert.ok(second.next.lastDecayAt instanceof Date);
});

// --- mergeUpdates ---

test('LLM deltas are clamped relative to the baseline', () => {
	const baseline: StateUpdates = { affectionDelta: 2, trustDelta: 1 };
	const merged = mergeUpdates(baseline, { affectionDelta: 100, trustDelta: 100 });
	assert.equal(merged.affectionDelta, 5); // max(|2|*2, 5)
	assert.equal(merged.trustDelta, 3); // max(|1|*2, 3)

	const negative = mergeUpdates(baseline, { affectionDelta: -100 });
	assert.equal(negative.affectionDelta, -5);
});

test('intimacy/comfort/respect use fixed clamps', () => {
	const merged = mergeUpdates({}, { intimacyDelta: 99, comfortDelta: -99, respectDelta: 99 });
	assert.equal(merged.intimacyDelta, 5);
	assert.equal(merged.comfortDelta, -3);
	assert.equal(merged.respectDelta, 5);
});

test('missing LLM fields keep the baseline values', () => {
	const baseline: StateUpdates = { affectionDelta: 2, energyDelta: -3 };
	const merged = mergeUpdates(baseline, {});
	assert.equal(merged.affectionDelta, 2);
	assert.equal(merged.energyDelta, -3);
});

test('LLM can override mood and pass through memory/events', () => {
	const merged = mergeUpdates(
		{ moodChange: { emotion: 'neutral', intensityDelta: 0, cause: 'baseline' } },
		{
			moodChange: { emotion: 'happy', intensityDelta: 5, cause: 'good news' },
			newMemory: 'They got the job',
			triggeredEvent: 'first_deep_conversation'
		}
	);
	assert.equal(merged.moodChange?.emotion, 'happy');
	assert.equal(merged.newMemory, 'They got the job');
	assert.equal(merged.triggeredEvent, 'first_deep_conversation');
});

// --- checkAndApplyStageTransition ---

test('transitions when the calculated stage differs', () => {
	const state = makeState({ affection: 50, trust: 20, totalInteractions: 3 });
	const result = checkAndApplyStageTransition(state, []);
	assert.equal(result.transitioned, true);
	assert.equal(result.fromStage, 'stranger');
	assert.equal(result.toStage, 'acquaintance');
	assert.equal(result.newState.relationshipStage, 'acquaintance');
});

test('no transition when the stage already matches', () => {
	const state = makeState();
	const result = checkAndApplyStageTransition(state, []);
	assert.equal(result.transitioned, false);
	assert.equal(result.newState, state);
});

test('acceptance: oscillating at a stage boundary yields one promotion and no demotions', () => {
	const events = ['first_deep_conversation', 'shared_vulnerability'];
	let state = makeState({
		affection: 449,
		trust: 75,
		intimacy: 30,
		comfort: 50,
		daysKnown: 10,
		totalInteractions: 25,
		relationshipStage: 'close_friend'
	});

	let promotions = 0;
	let demotions = 0;
	for (let turn = 0; turn < 20; turn++) {
		state = { ...state, affection: state.affection + (turn % 2 === 0 ? 1 : -1) };
		const result = checkAndApplyStageTransition(state, events);
		if (result.transitioned && result.fromStage && result.toStage) {
			if (STAGE_ORDER.indexOf(result.toStage) > STAGE_ORDER.indexOf(result.fromStage)) {
				promotions++;
			} else {
				demotions++;
			}
			state = result.newState;
		}
	}

	assert.equal(promotions, 1);
	assert.equal(demotions, 0);
});

test('a decay collapse demotes and flags the transition as strained', () => {
	const state = makeState({
		affection: 300,
		trust: 75,
		intimacy: 30,
		comfort: 50,
		daysKnown: 10,
		totalInteractions: 25,
		relationshipStage: 'romantic_interest'
	});
	const result = checkAndApplyStageTransition(state, [
		'first_deep_conversation',
		'shared_vulnerability'
	]);
	assert.equal(result.transitioned, true);
	assert.equal(result.toStage, 'close_friend');
	assert.equal(result.strained, true);
});

test('promotions are not flagged as strained', () => {
	const state = makeState({ affection: 50, trust: 20, totalInteractions: 3 });
	const result = checkAndApplyStageTransition(state, []);
	assert.equal(result.transitioned, true);
	assert.equal(result.strained, false);
});

// --- mergeUpdates: full-weight LLM deltas for non-Latin input ---

test('trustLLMDeltas passes sanitized LLM deltas through instead of clamping to baseline', () => {
	const baseline: StateUpdates = { affectionDelta: 1, trustDelta: 0 };
	// Default mode: relative clamp caps affection at max(|1|*2, 5) = 5
	const clamped = mergeUpdates(baseline, { affectionDelta: 15, trustDelta: 8 });
	assert.equal(clamped.affectionDelta, 5);
	assert.equal(clamped.trustDelta, 3);

	// Full-weight mode: the parser already sanitized these, take them as-is
	const trusted = mergeUpdates(baseline, { affectionDelta: 15, trustDelta: 8 }, { trustLLMDeltas: true });
	assert.equal(trusted.affectionDelta, 15);
	assert.equal(trusted.trustDelta, 8);
});

test('trustLLMDeltas keeps baseline values for fields the LLM omitted', () => {
	const baseline: StateUpdates = { affectionDelta: 2, energyDelta: -3 };
	const merged = mergeUpdates(baseline, { trustDelta: 4 }, { trustLLMDeltas: true });
	assert.equal(merged.affectionDelta, 2);
	assert.equal(merged.energyDelta, -3);
	assert.equal(merged.trustDelta, 4);
});

test('mergeUpdates passes the action through', () => {
	assert.equal(mergeUpdates({ affectionDelta: 1 }, { action: 'vrma_02' }).action, 'vrma_02');
	assert.equal(mergeUpdates({}, {}).action, undefined);
});

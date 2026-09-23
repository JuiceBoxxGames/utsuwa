import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moodExpressionTarget } from './mood-expression.ts';
import type { Emotion, MoodState } from '../types/character.ts';

const VRM1 = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'blink', 'neutral'];
const VRM0 = ['Joy', 'Angry', 'Sorrow', 'Fun', 'A', 'Blink', 'Neutral'];

const mood = (primary: Emotion, intensity: number): MoodState => ({ primary, intensity, causes: [] });

test('neutral mood leaves the face alone', () => {
	assert.equal(moodExpressionTarget(mood('neutral', 100), VRM1), null);
});

test('undefined mood returns null', () => {
	assert.equal(moodExpressionTarget(undefined, VRM1), null);
});

test('happy at full intensity maps to the happy preset', () => {
	assert.deepEqual(moodExpressionTarget(mood('happy', 100), VRM1), { name: 'happy', weight: 0.6 });
});

test('excited reads stronger than happy', () => {
	const happy = moodExpressionTarget(mood('happy', 100), VRM1);
	const excited = moodExpressionTarget(mood('excited', 100), VRM1);
	assert.ok(happy && excited);
	assert.equal(excited.name, 'happy');
	assert.ok(excited.weight > happy.weight);
});

test('intensity scales the weight', () => {
	assert.deepEqual(moodExpressionTarget(mood('happy', 50), VRM1), { name: 'happy', weight: 0.3 });
	assert.deepEqual(moodExpressionTarget(mood('anxious', 33), VRM1), { name: 'sad', weight: 0.099 });
});

test('zero intensity returns null', () => {
	assert.equal(moodExpressionTarget(mood('happy', 0), VRM1), null);
});

test('legacy VRM 0.x names are used when modern ones are missing', () => {
	assert.deepEqual(moodExpressionTarget(mood('happy', 100), VRM0), { name: 'Joy', weight: 0.6 });
	assert.deepEqual(moodExpressionTarget(mood('sad', 100), VRM0), { name: 'Sorrow', weight: 0.6 });
	assert.deepEqual(moodExpressionTarget(mood('content', 100), VRM0), { name: 'Fun', weight: 0.5 });
});

test('matching is case-insensitive and keeps the model casing', () => {
	assert.deepEqual(moodExpressionTarget(mood('frustrated', 100), ['Happy', 'ANGRY']), {
		name: 'ANGRY',
		weight: 0.5
	});
});

test('candidate priority order wins over list order', () => {
	assert.equal(moodExpressionTarget(mood('playful', 100), ['joy', 'fun', 'happy'])?.name, 'happy');
	assert.equal(moodExpressionTarget(mood('playful', 100), ['joy', 'fun'])?.name, 'fun');
});

test('missing candidate returns null', () => {
	assert.equal(moodExpressionTarget(mood('curious', 100), ['happy', 'sad']), null);
	assert.equal(moodExpressionTarget(mood('happy', 100), []), null);
});

test('intensity is clamped to 0..100', () => {
	assert.deepEqual(moodExpressionTarget(mood('happy', 250), VRM1), { name: 'happy', weight: 0.6 });
	assert.equal(moodExpressionTarget(mood('happy', -40), VRM1), null);
	assert.equal(moodExpressionTarget(mood('happy', Number.NaN), VRM1), null);
});

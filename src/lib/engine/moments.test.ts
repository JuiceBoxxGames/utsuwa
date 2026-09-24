import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMomentPrompt, parseMoment, selectMomentMemories, type MomentContext } from './moments.ts';
import type { Scene } from '$lib/types/events';

const choiceScene: Scene = {
	id: 'one_month_scene',
	intro: "She's prepared something special for today...",
	dialogue: "So... it's been a month.",
	choices: [
		{
			text: "You've become important to me too.",
			response: 'Really? I am so happy.',
			stateChanges: { affectionDelta: 50, trustDelta: 15 },
			nextSceneId: 'next_a',
			unlocks: ['deep_topics']
		},
		{
			text: "I'm glad we met.",
			response: 'Me too.',
			stateChanges: { affectionDelta: 40, comfortDelta: 25 }
		}
	],
	backgroundChange: 'sunset',
	expressionOverride: 'happy',
	musicCue: 'soft'
};

const plainScene: Scene = {
	id: 'one_week_scene',
	intro: 'She seems unusually thoughtful today...',
	dialogue: "It's been a whole week."
};

function makeCtx(overrides: Partial<MomentContext> = {}): MomentContext {
	return {
		companionName: 'Hana',
		personality: 'Shy, bookish, loves rainy days.',
		mode: 'dating_sim',
		stage: 'friend',
		mood: { primary: 'happy', intensity: 60, causes: [] },
		daysKnown: 30,
		totalInteractions: 120,
		memories: ['We watched the fireworks together on the balcony', 'They have a cat named Miso'],
		recentUserLines: ['Guten Morgen! Wie geht es dir?', 'Ich war heute im Park.'],
		eventName: 'One Month Together',
		eventType: 'anniversary',
		...overrides
	};
}

// ---- buildMomentPrompt ----

test('prompt carries the companion, memories, user lines, scope rule, and template', () => {
	const { system, user } = buildMomentPrompt(choiceScene, makeCtx());
	const all = system + '\n' + user;
	assert.match(all, /Hana/);
	assert.match(all, /Shy, bookish, loves rainy days\./);
	assert.match(all, /We watched the fireworks together on the balcony/);
	assert.match(all, /They have a cat named Miso/);
	assert.match(all, /Guten Morgen! Wie geht es dir\?/);
	assert.ok(
		all.includes(
			'You may reference only the facts and shared experiences listed above. If none fits, stay general. Never invent specific past events, names, places, or dates.'
		)
	);
	assert.ok(user.includes(JSON.stringify({ intro: choiceScene.intro, dialogue: choiceScene.dialogue, choices: [{ text: "You've become important to me too.", response: 'Really? I am so happy.' }, { text: "I'm glad we met.", response: 'Me too.' }], outro: null }, null, 2)));
	assert.ok(!all.includes('\u2014'), 'no em dashes');
});

test('prompt falls back to English when there are no user lines', () => {
	const { system, user } = buildMomentPrompt(plainScene, makeCtx({ recentUserLines: [] }));
	assert.match(system + user, /English/);
});

test('prompt says so when there are no memories', () => {
	const { system, user } = buildMomentPrompt(plainScene, makeCtx({ memories: [] }));
	assert.doesNotMatch(system + user, /fireworks/);
	assert.match(system + user, /none yet/i);
});

// ---- parseMoment ----

const goodChoices = {
	intro: 'Sie hat heute etwas vorbereitet...',
	dialogue: 'Ein ganzer Monat schon.',
	choices: [
		{ text: 'Du bist mir auch wichtig.', response: 'Wirklich? Das freut mich so.' },
		{ text: 'Ich bin froh, dass wir uns getroffen haben.', response: 'Ich auch.' }
	],
	outro: null
};

test('parses a valid moment with choices and keeps state from the template', () => {
	const scene = parseMoment(JSON.stringify(goodChoices), choiceScene);
	assert.ok(scene);
	assert.equal(scene.id, choiceScene.id);
	assert.equal(scene.intro, goodChoices.intro);
	assert.equal(scene.dialogue, goodChoices.dialogue);
	assert.equal(scene.backgroundChange, 'sunset');
	assert.equal(scene.expressionOverride, 'happy');
	assert.equal(scene.musicCue, 'soft');
	assert.equal(scene.outro, undefined);
	assert.equal(scene.choices?.length, 2);
	assert.equal(scene.choices?.[0].text, 'Du bist mir auch wichtig.');
	assert.equal(scene.choices?.[0].response, 'Wirklich? Das freut mich so.');
	assert.deepEqual(scene.choices?.[0].stateChanges, { affectionDelta: 50, trustDelta: 15 });
	assert.equal(scene.choices?.[0].nextSceneId, 'next_a');
	assert.deepEqual(scene.choices?.[0].unlocks, ['deep_topics']);
	assert.deepEqual(scene.choices?.[1].stateChanges, { affectionDelta: 40, comfortDelta: 25 });
	assert.equal(scene.choices?.[1].nextSceneId, undefined);
});

test('parses fenced and unfenced JSON, with prose around it', () => {
	const fenced = 'Here you go:\n```json\n' + JSON.stringify(goodChoices) + '\n```\nEnjoy!';
	const bare = 'Sure. ' + JSON.stringify(goodChoices) + ' {"trailing": true}';
	assert.equal(parseMoment(fenced, choiceScene)?.dialogue, goodChoices.dialogue);
	assert.equal(parseMoment(bare, choiceScene)?.dialogue, goodChoices.dialogue);
});

test('handles braces inside strings when finding the object', () => {
	const raw = JSON.stringify({ ...goodChoices, dialogue: 'A {curly} month }' });
	assert.equal(parseMoment(raw, choiceScene)?.dialogue, 'A {curly} month }');
});

test('rejects a choice count mismatch', () => {
	const raw = JSON.stringify({ ...goodChoices, choices: [goodChoices.choices[0]] });
	assert.equal(parseMoment(raw, choiceScene), null);
	assert.equal(parseMoment(JSON.stringify({ ...goodChoices, choices: null }), choiceScene), null);
});

test('rejects choices with empty text or response', () => {
	const raw = JSON.stringify({
		...goodChoices,
		choices: [goodChoices.choices[0], { text: ' ', response: 'Ich auch.' }]
	});
	assert.equal(parseMoment(raw, choiceScene), null);
});

test('rejects empty or missing dialogue', () => {
	assert.equal(parseMoment(JSON.stringify({ ...goodChoices, dialogue: '  ' }), choiceScene), null);
	assert.equal(parseMoment(JSON.stringify({ intro: 'x', choices: goodChoices.choices }), choiceScene), null);
});

test('rejects garbage', () => {
	assert.equal(parseMoment('', plainScene), null);
	assert.equal(parseMoment('no json here', plainScene), null);
	assert.equal(parseMoment('{"dialogue": "unterminated', plainScene), null);
	assert.equal(parseMoment('[1,2,3]', plainScene), null);
});

test('falls back when the template has an intro and the result does not', () => {
	// An English intro before translated dialogue reads worse than the static scene
	assert.equal(parseMoment(JSON.stringify({ intro: null, dialogue: 'Eine Woche!', choices: null, outro: null }), plainScene), null);
	const scene = parseMoment(JSON.stringify({ intro: 'Sie wirkt nachdenklich...', dialogue: 'Eine Woche!', choices: null, outro: null }), plainScene);
	assert.equal(scene?.intro, 'Sie wirkt nachdenklich...');
	assert.equal(scene?.dialogue, 'Eine Woche!');
	assert.equal(scene?.choices, undefined);
});

test('drops intro and outro the template does not have', () => {
	const scene = parseMoment(
		JSON.stringify({ intro: 'Neu', dialogue: 'Hallo', choices: null, outro: 'Ende' }),
		{ id: 's', dialogue: 'Hi' }
	);
	assert.equal(scene?.intro, undefined);
	assert.equal(scene?.outro, undefined);
});

test('ignores extra choices on a template without any', () => {
	const scene = parseMoment(
		JSON.stringify({ intro: 'Neu', dialogue: 'Hallo', choices: goodChoices.choices, outro: null }),
		plainScene
	);
	assert.equal(scene?.choices, undefined);
});

test('enforces length caps', () => {
	const long = (n: number) => 'a'.repeat(n);
	assert.ok(parseMoment(JSON.stringify({ ...goodChoices, intro: long(400) }), choiceScene));
	assert.equal(parseMoment(JSON.stringify({ ...goodChoices, intro: long(401) }), choiceScene), null);
	assert.ok(parseMoment(JSON.stringify({ ...goodChoices, dialogue: long(1200) }), choiceScene));
	assert.equal(parseMoment(JSON.stringify({ ...goodChoices, dialogue: long(1201) }), choiceScene), null);
	const withChoice = (text: string, response: string) =>
		JSON.stringify({ ...goodChoices, choices: [{ text, response }, goodChoices.choices[1]] });
	assert.ok(parseMoment(withChoice(long(160), long(800)), choiceScene));
	assert.equal(parseMoment(withChoice(long(161), 'ok'), choiceScene), null);
	assert.equal(parseMoment(withChoice('ok', long(801)), choiceScene), null);
	const outroScene: Scene = { ...plainScene, outro: 'The moment lingers.' };
	assert.equal(parseMoment(JSON.stringify({ intro: 'Sie wartet.', dialogue: 'x', outro: long(401) }), outroScene), null);
	assert.equal(parseMoment(JSON.stringify({ intro: 'Sie wartet.', dialogue: 'x', outro: 'Bleib.' }), outroScene)?.outro, 'Bleib.');
});

// ---- selectMomentMemories ----

const day = (n: number) => new Date(2026, 0, n);

test('prefers shared experiences and relationship facts, then importance, then recency', () => {
	const picked = selectMomentMemories(
		[
			{ content: 'They like jazz', category: 'user', importance: 95, createdAt: day(1) },
			{ content: 'We laughed about the burnt pancakes', category: 'shared_experience', importance: 40, createdAt: day(2) },
			{ content: 'They trust me with secrets', category: 'relationship', importance: 60, createdAt: day(3) },
			{ content: 'We stargazed together', category: 'shared_experience', importance: 40, createdAt: day(5) }
		],
		3
	);
	assert.deepEqual(picked, ['They trust me with secrets', 'We stargazed together', 'We laughed about the burnt pancakes']);
});

test('dedupes, trims, and caps at eight by default', () => {
	const facts = Array.from({ length: 12 }, (_, i) => ({
		content: `Fact ${i}  \n`,
		category: 'user',
		importance: 50 - i,
		createdAt: day(i + 1)
	}));
	facts.push({ content: 'Fact 0', category: 'user', importance: 10, createdAt: day(20) });
	const picked = selectMomentMemories(facts);
	assert.equal(picked.length, 8);
	assert.equal(picked[0], 'Fact 0');
	assert.equal(new Set(picked).size, 8);
});

test('skips blank facts', () => {
	assert.deepEqual(
		selectMomentMemories([{ content: '   ', category: 'shared_experience', importance: 90, createdAt: day(1) }]),
		[]
	);
});

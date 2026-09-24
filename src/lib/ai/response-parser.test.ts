import test from 'node:test';
import assert from 'node:assert/strict';

import { parseResponse, validateStateUpdates } from './response-parser.ts';

test('parses a clean fenced json block', () => {
	const raw = [
		'Hey, good to see you.',
		'```json',
		'{ "mood_change": { "emotion": "happy", "intensity_delta": 5 }, "trust_delta": 3, "new_memory": "They like jazz" }',
		'```'
	].join('\n');
	const { dialogue, stateUpdates } = parseResponse(raw);
	assert.equal(dialogue, 'Hey, good to see you.');
	assert.equal(stateUpdates?.moodChange?.emotion, 'happy');
	assert.equal(stateUpdates?.trustDelta, 3);
	assert.equal(stateUpdates?.newMemory, 'They like jazz');
});

test('strips <think> reasoning so it never reaches dialogue', () => {
	const raw = [
		'<think>The user seems tired. I should be warm. I will set trust up a bit.</think>',
		"I hear you. Let's take it easy tonight.",
		'```json',
		'{ "mood_change": { "emotion": "content", "intensity_delta": 2 }, "comfort_delta": 4 }',
		'```'
	].join('\n');
	const { dialogue, stateUpdates } = parseResponse(raw);
	assert.ok(!dialogue.includes('think'), 'reasoning leaked into dialogue');
	assert.ok(!dialogue.includes('trust up'), 'reasoning leaked into dialogue');
	assert.equal(dialogue, "I hear you. Let's take it easy tonight.");
	assert.equal(stateUpdates?.comfortDelta, 4);
});

test('handles a lone </think> closing tag (opener consumed as a special token)', () => {
	const raw =
		'Okay, weighing how to respond here.</think>That sounds rough, I am glad you told me.\n```json\n{ "mood_change": { "emotion": "sad", "intensity_delta": 3 }, "new_memory": "They had a rough day" }\n```';
	const { dialogue, stateUpdates } = parseResponse(raw);
	assert.equal(dialogue, 'That sounds rough, I am glad you told me.');
	assert.ok(!dialogue.includes('weighing'));
	assert.equal(stateUpdates?.newMemory, 'They had a rough day');
});

test('does not parse json that lives inside a reasoning block', () => {
	const raw =
		'<think>Maybe I should output {"trust_delta": 99} but that is too much.</think>Nice to meet you.\n```json\n{ "mood_change": { "emotion": "curious", "intensity_delta": 2 }, "trust_delta": 2 }\n```';
	const { stateUpdates } = parseResponse(raw);
	assert.equal(stateUpdates?.trustDelta, 2, 'used the real block, not the reasoning one');
});

test('tolerates trailing commas', () => {
	const raw = '```json\n{ "mood_change": { "emotion": "playful", "intensity_delta": 4, }, "affection_delta": 5, }\n```';
	const { stateUpdates } = parseResponse(raw);
	assert.equal(stateUpdates?.moodChange?.emotion, 'playful');
	assert.equal(stateUpdates?.affectionDelta, 5);
});

test('tolerates // and /* */ comments in the json', () => {
	const raw = [
		'```json',
		'{',
		'  "mood_change": { "emotion": "content", "intensity_delta": 1 }, // small lift',
		'  /* relationship barely moved */',
		'  "trust_delta": 1',
		'}',
		'```'
	].join('\n');
	const { stateUpdates } = parseResponse(raw);
	assert.equal(stateUpdates?.moodChange?.emotion, 'content');
	assert.equal(stateUpdates?.trustDelta, 1);
});

test('recovers bare JSON with no code fence', () => {
	const raw =
		'Sure, I can help with that.\n{ "mood_change": { "emotion": "happy", "intensity_delta": 3 }, "new_memory": "They are learning Rust" }';
	const { dialogue, stateUpdates } = parseResponse(raw);
	assert.equal(dialogue, 'Sure, I can help with that.');
	assert.equal(stateUpdates?.newMemory, 'They are learning Rust');
});

test('recovers a memory-only object (no delta keys)', () => {
	const raw = 'Got it.\n```json\n{ "new_memory": "They have a dog named Pixel" }\n```';
	const { stateUpdates } = parseResponse(raw);
	assert.equal(stateUpdates?.newMemory, 'They have a dog named Pixel');
});

test('ignores unrelated JSON the user pasted, with no state block', () => {
	const raw = 'Here is my config: { "theme": "dark", "fontSize": 14 } looks good right?';
	const { dialogue, stateUpdates } = parseResponse(raw);
	assert.equal(stateUpdates, null);
	assert.ok(dialogue.includes('config'));
});

test('returns null state for plain prose', () => {
	const { stateUpdates } = parseResponse('Just a normal reply with no JSON at all.');
	assert.equal(stateUpdates, null);
});

test('cuts runaway output at a leaked </s> stop token', () => {
	const raw =
		"I'm really glad you told me.</s>\nPlease tell me more, I'm all ears and ready to";
	const { dialogue } = parseResponse(raw);
	assert.equal(dialogue, "I'm really glad you told me.");
	assert.ok(!dialogue.includes('</s>'));
	assert.ok(!dialogue.includes('Please tell me more'));
});

test('strips stray ChatML / Llama template tokens', () => {
	const raw = '<|im_start|>assistant\nHey there.<|im_end|>';
	const { dialogue } = parseResponse(raw);
	assert.ok(!dialogue.includes('<|im_start|>'));
	assert.ok(!dialogue.includes('<|im_end|>'));
	assert.ok(dialogue.includes('Hey there.'));
});

test('cuts at <|eot_id|> and keeps the dialogue before it', () => {
	const raw = 'Take care of yourself tonight.<|eot_id|>garbage continuation here';
	const { dialogue } = parseResponse(raw);
	assert.equal(dialogue, 'Take care of yourself tonight.');
});

test('maps compound and synonym emotions to the canonical set', () => {
	const compound = parseResponse('```json\n{ "mood_change": { "emotion": "grateful|cared-for", "intensity_delta": 4 } }\n```');
	assert.equal(compound.stateUpdates?.moodChange?.emotion, 'happy');

	const synonym = parseResponse('```json\n{ "mood_change": { "emotion": "excitement", "intensity_delta": 6 } }\n```');
	assert.equal(synonym.stateUpdates?.moodChange?.emotion, 'excited');

	const firstOfCompound = parseResponse('```json\n{ "mood_change": { "emotion": "happy|curious", "intensity_delta": 3 } }\n```');
	assert.equal(firstOfCompound.stateUpdates?.moodChange?.emotion, 'happy');
});

test('drops a truly unknown emotion rather than guessing', () => {
	const { stateUpdates } = parseResponse('```json\n{ "mood_change": { "emotion": "zorblax", "intensity_delta": 5 }, "trust_delta": 2 }\n```');
	assert.equal(stateUpdates?.moodChange, undefined);
	assert.equal(stateUpdates?.trustDelta, 2);
});

test('cuts a hallucinated user turn the model appended as a note', () => {
	const raw =
		'I apologize for the confusion earlier, CJ. How are you doing today?\n\nCJ: "They corrected me on their name and asked how my day is going. Seems polite but formal."';
	const { dialogue } = parseResponse(raw);
	assert.equal(dialogue, 'I apologize for the confusion earlier, CJ. How are you doing today?');
	assert.ok(!dialogue.includes('They corrected me'));
});

test('cuts known transcript labels (They:/User:) the model keeps writing', () => {
	const they = parseResponse('That sounds lovely.\nThey: tell me more about it');
	assert.equal(they.dialogue, 'That sounds lovely.');
	const user = parseResponse('Glad to hear it!\nUser: what should I do next?');
	assert.equal(user.dialogue, 'Glad to hear it!');
});

test('does not cut a legit reply that just contains a colon line', () => {
	const raw = 'Here is the plan:\nFirst we get coffee, then we walk.';
	const { dialogue } = parseResponse(raw);
	assert.ok(dialogue.includes('First we get coffee'));
});

test('strips a leading self-label (the companion name) without nuking the reply', () => {
	const { dialogue } = parseResponse('Luna: Hey, good to see you.', 'Luna');
	assert.equal(dialogue, 'Hey, good to see you.');
});

test('preserves legit "Word:" line prefixes that are not speaker labels', () => {
	const note = parseResponse('Note: I will remember that for you.', 'Luna');
	assert.equal(note.dialogue, 'Note: I will remember that for you.');
	const reminder = parseResponse('Reminder: your interview is Thursday.', 'Luna');
	assert.equal(reminder.dialogue, 'Reminder: your interview is Thursday.');
});

test('does not clip a reply that quotes someone on a new line', () => {
	const raw = 'She told me something sweet:\n"You always make me smile."';
	const { dialogue } = parseResponse(raw, 'Luna');
	assert.ok(dialogue.includes('You always make me smile'), 'a quoted line by a non-speaker must survive');
});

test('still cuts the companion impersonating a later turn as itself', () => {
	const { dialogue } = parseResponse('Sure thing!\nLuna: and then I said more', 'Luna');
	assert.equal(dialogue, 'Sure thing!');
});

// The extraction fallback feeds parseResponse the raw model output directly.
// Some providers (Anthropic) fence it, some (OpenAI json_object) return bare
// JSON. Both must parse — the caller must NOT re-wrap in another ```json fence.
test('parses an extraction payload whether fenced or bare', () => {
	const fenced = parseResponse(
		'```json\n{ "mood_change": { "emotion": "content", "intensity_delta": 2 }, "trust_delta": 2, "new_memory": "They are a graphic designer" }\n```'
	);
	assert.equal(fenced.stateUpdates?.moodChange?.emotion, 'content');
	assert.equal(fenced.stateUpdates?.trustDelta, 2);
	assert.equal(fenced.stateUpdates?.newMemory, 'They are a graphic designer');

	const bare = parseResponse('{ "mood_change": { "emotion": "happy", "intensity_delta": 3 }, "affection_delta": 4 }');
	assert.equal(bare.stateUpdates?.moodChange?.emotion, 'happy');
	assert.equal(bare.stateUpdates?.affectionDelta, 4);
});

test('a truncated unterminated ```json fence never leaks into dialogue', () => {
	const raw = [
		"Hmph. Well, that's... something. A dog, huh? Congratulations, I suppose.",
		'',
		'```json',
		'{',
		'  "mood_change": { "emotion": "neutral", "intensity_delta": 2 },',
		'  "affection_delta": -1,'
		// note: no closing brace, no closing fence (hit max_tokens mid-block)
	].join('\n');
	const { dialogue } = parseResponse(raw);
	assert.ok(!dialogue.includes('```'), 'fence markers must be stripped');
	assert.ok(!dialogue.toLowerCase().includes('mood_change'), 'raw JSON keys must be stripped');
	assert.ok(dialogue.startsWith('Hmph. Well'));
});

test('a truncated bare state block (no fence) never leaks into dialogue', () => {
	const raw =
		'Oh, that sounds lovely!\n{ "mood_change": { "emotion": "content", "intensity_delta": 3 }, "affection_delta":';
	const { dialogue } = parseResponse(raw);
	assert.ok(!dialogue.includes('mood_change'));
	assert.ok(!dialogue.includes('{'));
	assert.equal(dialogue, 'Oh, that sounds lovely!');
});

test('prose with a stray brace but no state keys is left intact', () => {
	const raw = 'I was thinking { maybe we could get coffee sometime?';
	const { dialogue } = parseResponse(raw);
	assert.ok(dialogue.includes('coffee'));
	assert.ok(dialogue.includes('{'));
});

test('repeated text after the state block is cut (regression, double-speech report)', () => {
	// The model repeated the whole reply after the JSON state block and
	// leaked a system reminder. Only the text before the block is the reply;
	// parseResponse and the streaming speech path both cut there.
	const raw = [
		'¡Ah, qué romántico! ¡Me encanta! Here comes the vocabulary.',
		'```json',
		'{ "mood_change": { "emotion": "happy", "intensity_delta": 3 } }',
		'```',
		'¡Ah, qué romántico! ¡Me encanta! Here comes the vocabulary.',
		'<system-reminder>Your operational mode has changed.</system-reminder>'
	].join('\n');
	const { dialogue, stateUpdates } = parseResponse(raw);
	assert.equal(dialogue, '¡Ah, qué romántico! ¡Me encanta! Here comes the vocabulary.');
	assert.equal(stateUpdates?.moodChange?.emotion, 'happy');
});

test('a state block at the very start falls back to the text after it', () => {
	const raw = [
		'```json',
		'{ "mood_change": { "emotion": "neutral", "intensity_delta": 1 } }',
		'```',
		'Gracias, that is all.'
	].join('\n');
	const { dialogue } = parseResponse(raw);
	assert.equal(dialogue, 'Gracias, that is all.');
});

test('a dangling reasoning block is cut like the streaming path does', () => {
	// Parody the stream end: the closing tag never arrived. Parser and TTS
	// must agree so the chat never shows reasoning the voice already skipped.
	const { dialogue } = parseResponse(['Hola!', '<thinking>Er wirkt müde, ich sollte', '```json', '{ "energy_delta": 1 }', '```'].join('\n'));
	assert.equal(dialogue, 'Hola!');
});

// --- action ---

test('action ids are trimmed and lowercased', () => {
	const raw = 'Hi there!\n```json\n{ "mood_change": { "emotion": "happy", "intensity_delta": 2 }, "action": "  VRMA_02 " }\n```';
	assert.equal(parseResponse(raw).stateUpdates?.action, 'vrma_02');
});

test('null, malformed, or non-string actions are dropped', () => {
	for (const action of ['null', '"wave hello"', '"a/b"', '""', '5', `"${'a'.repeat(65)}"`]) {
		const raw = `Hi!\n\`\`\`json\n{ "energy_delta": 0, "action": ${action} }\n\`\`\``;
		assert.equal(parseResponse(raw).stateUpdates?.action, undefined, `action ${action}`);
	}
});

test('a leftover action object is cleaned out of the dialogue', () => {
	const { dialogue } = parseResponse('Sure thing. {"action": "vrma_02"} See you.');
	assert.ok(!dialogue.includes('action'), dialogue);
});

test('validateStateUpdates passes a well-formed action and drops a bad one', () => {
	assert.equal(validateStateUpdates({ action: 'anim-1-abc' }).sanitized.action, 'anim-1-abc');
	const bad = validateStateUpdates({ action: 'drop table' });
	assert.equal(bad.sanitized.action, undefined);
	assert.equal(bad.valid, false);
});

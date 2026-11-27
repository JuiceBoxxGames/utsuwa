import test from 'node:test';
import assert from 'node:assert/strict';
import {
	cleanSpeechMarkers,
	cutAtStateFence,
	stripAngleBlocks,
	hasIncompleteTrailingMarkup,
	StreamingDisplayCleaner
} from './chat-text.ts';
import { parseResponse } from '../../ai/response-parser.ts';

// ── cleanSpeechMarkers ─────────────────────────────────────

test('cleanSpeechMarkers removes angle speak tags keeping inner text', () => {
	const result = cleanSpeechMarkers('Hola <speak:es>¿Cómo estás?</speak> bien');
	assert.equal(result, 'Hola ¿Cómo estás? bien');
});

test('cleanSpeechMarkers removes bracket lang tags keeping inner text', () => {
	const result = cleanSpeechMarkers('Hallo [lang:es]¡Hola![/lang] Welt');
	assert.equal(result, 'Hallo ¡Hola! Welt');
});

test('cleanSpeechMarkers tolerates language codes in closing tags (regression)', () => {
	// Models sometimes repeat the code in the closer — the tag must still be
	// stripped instead of being spoken literally.
	assert.equal(
		cleanSpeechMarkers('Klar! [lang:es]Disfruta tu café![/lang:es] Bis bald!'),
		'Klar! Disfruta tu café! Bis bald!'
	);
	assert.equal(
		cleanSpeechMarkers('Hola <speak:es>¿Cómo estás?</speak:es> bien'),
		'Hola ¿Cómo estás? bien'
	);
});

test('cleanSpeechMarkers strips orphan lang tags without a matching partner', () => {
	// Opener without closer (model forgot the pair or the pair was cut by a
	// sentence boundary while streaming).
	assert.equal(cleanSpeechMarkers('Hola [lang:es]mundo'), 'Hola mundo');
	// Closer without opener.
	assert.equal(cleanSpeechMarkers('Hola mundo[/lang:es]'), 'Hola mundo');
	// Ordinary bracketed words are untouched.
	assert.equal(cleanSpeechMarkers('Das ist [wichtig] heute'), 'Das ist [wichtig] heute');
});

test('cleanSpeechMarkers strips orphan angle lang tags', () => {
	assert.equal(cleanSpeechMarkers('Hola <speak:es>mundo'), 'Hola mundo');
	assert.equal(cleanSpeechMarkers('Hola mundo</speak:es>'), 'Hola mundo');
});

test('cleanSpeechMarkers removes lang equals tags and gesture markers', () => {
	const result = cleanSpeechMarkers('Hi <lang=fr>Salut</lang> <gesture:wave> there');
	assert.equal(result, 'Hi Salut there');
});

test('cleanSpeechMarkers removes angle-code lang tags keeping inner text', () => {
	const result = cleanSpeechMarkers(
		'Das spanische Wort für Hahn ist <lang code="es">gallo</lang>.'
	);
	assert.equal(result, 'Das spanische Wort für Hahn ist gallo.');
});

test('cleanSpeechMarkers returns plain text unchanged when no markers', () => {
	const result = cleanSpeechMarkers('Hello world');
	assert.equal(result, 'Hello world');
});

test('cleanSpeechMarkers removes pseudo-tool-call syntax', () => {
	const result = cleanSpeechMarkers('Hola speak({ lang: "es", text: "¿Cómo estás?" }) amigo');
	assert.equal(result, 'Hola ¿Cómo estás? amigo');
});

test('cleanSpeechMarkers removes gesture pseudo-tool-call', () => {
	const result = cleanSpeechMarkers('Hello gesture({ type: "smile" }) there');
	assert.equal(result, 'Hello there');
});

test('cleanSpeechMarkers strips inline tags even when no pseudo-tool-calls exist', () => {
	const result = cleanSpeechMarkers('Hola [lang:es]mundo[/lang]');
	assert.equal(result, 'Hola mundo');
});

// ── non-verbal markers ─────────────────────────────────────

test('cleanSpeechMarkers removes non-verbal markers from the display', () => {
	const result = cleanSpeechMarkers('speak({ text: "[laughter] Das war lustig!" })');
	assert.equal(result, 'Das war lustig!');
});

test('cleanSpeechMarkers removes all official non-verbal marker variants', () => {
	const result = cleanSpeechMarkers(
		'[laughter] [sigh] [confirmation-en] [question-ah] [surprise-wa] [dissatisfaction-hnn] Text'
	);
	assert.equal(result, 'Text');
});

test('cleanSpeechMarkers keeps ordinary bracketed words', () => {
	// Only the official marker list is stripped; user content stays intact.
	const result = cleanSpeechMarkers('Das ist [wichtig] zu wissen');
	assert.equal(result, 'Das ist [wichtig] zu wissen');
});

// ── strip-only contract ────────────────────────────────────
// Legacy tags must never become language-aware speech segments; the TTS
// fallback relies on stripLegacyTags producing clean primary-language text.

test('cleanSpeechMarkers removes legacy tags but keeps the inner text', () => {
	const result = cleanSpeechMarkers('Erkläre <lang=es>el coche</lang> bitte');
	assert.equal(result, 'Erkläre el coche bitte');
});

// ── reasoning leaks ───────────────────────────────────────

test('cleanSpeechMarkers preserves ordinary English dialogue and state updates', () => {
	const sentences = [
		'Maybe we can go for a walk together.',
		'Let me know how your interview goes.',
		'This is the Spanish word for a dog.',
		'We should try that restaurant tomorrow.'
	];
	const state = '\n```json\n{"new_memory":"Their interview is tomorrow"}\n```';
	for (const text of sentences) {
		assert.equal(cleanSpeechMarkers(text), text);
		const call = `speak(${JSON.stringify({ text, lang: 'en' })})`;
		const parsed = parseResponse(cleanSpeechMarkers(call + state, { keepStateFences: true }));
		assert.equal(parsed.dialogue, text);
		assert.equal(parsed.stateUpdates?.newMemory, 'Their interview is tomorrow');
	}
});

test('cleanSpeechMarkers removes explicitly tagged reasoning around speech', () => {
	assert.equal(
		cleanSpeechMarkers('<think>We need to plan the reply.</think> speak({ text: "Hallo!" })'),
		'Hallo!'
	);
});

// ── angle-bracket section markers ──────────────────────────

test('stripAngleBlocks unwraps < text > sections and drops < > separators', () => {
	const result = stripAngleBlocks(
		'< Hier ist ein Satz. > < > < Aquí está una oración. >'
	);
	assert.equal(result, 'Hier ist ein Satz.  Aquí está una oración.');
});

test('stripAngleBlocks leaves real XML speak tags untouched', () => {
	const result = stripAngleBlocks('<speak text="Hallo">');
	assert.equal(result, '<speak text="Hallo">');
});

test('cleanSpeechMarkers unwraps angle-bracket sections', () => {
	const result = cleanSpeechMarkers('< Hallo Welt! > < > < ¡Hola mundo! >');
	assert.equal(result, 'Hallo Welt! ¡Hola mundo!');
});

// ── JSON actions envelopes ─────────────────────────────────

test('cleanSpeechMarkers removes actions envelopes keeping the speak texts', () => {
	const result = cleanSpeechMarkers(
		'{"actions":[{"function":"speak","args":{"text":"Hallo!","lang":"de"}},{"function":"speak","args":{"text":"¡Hola!","lang":"es"}}]}'
	);
	assert.equal(result, 'Hallo! ¡Hola!');
});

test('cleanSpeechMarkers keeps prose around an envelope', () => {
	const result = cleanSpeechMarkers(
		'Vorher. {"actions":[{"function":"speak","args":{"text":"Hallo","lang":"de"}}]} Nachher.'
	);
	assert.equal(result, 'Vorher. Hallo Nachher.');
});

// ── XML-style speak tags ──────────────────────────────────

test('cleanSpeechMarkers replaces XML speak tags with their texts', () => {
	const result = cleanSpeechMarkers(
		'<speak text="Hallo!" /> <gesture type="smile" /> <speak lang="es" text="¡Hola!" />'
	);
	assert.equal(result, 'Hallo! ¡Hola!');
});

test('cleanSpeechMarkers inlines XML open/close tags and unescapes quotes', () => {
	const result = cleanSpeechMarkers(
		'<speak lang="es">Un adjetivo es \\"enojado\\"</speak>.'
	);
	assert.equal(result, 'Un adjetivo es "enojado".');
});

// ── hasIncompleteTrailingMarkup ───────────────────────────

test('hasIncompleteTrailingMarkup flags an unfinished speak call', () => {
	assert.equal(hasIncompleteTrailingMarkup('Hallo speak({"text":"Hallo'), true);
});

test('hasIncompleteTrailingMarkup ignores a closing paren inside the text', () => {
	// Regression: ")" inside the text argument used to close the call early,
	// letting raw incomplete syntax through to the chat bubble.
	assert.equal(hasIncompleteTrailingMarkup('speak({"text":"hallo) und'), true);
	assert.equal(hasIncompleteTrailingMarkup('speak({"text":"(hallo"'), true);
});

test('hasIncompleteTrailingMarkup passes complete calls and plain text', () => {
	assert.equal(hasIncompleteTrailingMarkup('speak({"text":"Hallo"})'), false);
	assert.equal(hasIncompleteTrailingMarkup('Hallo Welt.'), false);
	assert.equal(hasIncompleteTrailingMarkup(''), false);
});

test('hasIncompleteTrailingMarkup flags unclosed legacy bracket lang tags', () => {
	// An opener whose closer has not arrived yet must hold the chunk back so
	// the raw tag never appears in the flushed display.
	assert.equal(hasIncompleteTrailingMarkup('Klar! [lang:es]Disfruta tu café!'), true);
	assert.equal(hasIncompleteTrailingMarkup('Klar! [lang:'), true);
	// Once the closer arrived the chunk is complete.
	assert.equal(hasIncompleteTrailingMarkup('Klar! [lang:es]Disfruta![/lang:es]'), false);
});

test('hasIncompleteTrailingMarkup flags unbalanced JSON braces in speak calls', () => {
	// Regression: a closing paren with an unclosed JSON object used to count as
	// a complete call, letting raw syntax through to the chat bubble.
	assert.equal(hasIncompleteTrailingMarkup('speak({"text":"Hallo")'), true);
	assert.equal(hasIncompleteTrailingMarkup('speak({"text":"Hallo"}'), true);
});

test('hasIncompleteTrailingMarkup ignores braces inside the text string', () => {
	assert.equal(hasIncompleteTrailingMarkup('speak({"text":"{hallo}"})'), false);
	assert.equal(hasIncompleteTrailingMarkup('speak({"text":"a) } (b"})'), false);
});

test('hasIncompleteTrailingMarkup flags unfinished lang, actions and XML tags', () => {
	assert.equal(hasIncompleteTrailingMarkup('<lang'), true);
	assert.equal(hasIncompleteTrailingMarkup('{"actions":[{"function":"speak","args":{'), true);
	assert.equal(hasIncompleteTrailingMarkup('<speak text="Hallo'), true);
});

test('hasIncompleteTrailingMarkup flags an unfinished pause tag', () => {
	// Regression: the XML check only matched speak|gesture, so a partial
	// <pause tag slipped through to the chat bubble.
	assert.equal(hasIncompleteTrailingMarkup('<pause ms="30'), true);
	assert.equal(hasIncompleteTrailingMarkup('<pause'), true);
	assert.equal(hasIncompleteTrailingMarkup('<pause ms="300" />'), false);
});

test('hasIncompleteTrailingMarkup ignores escaped quotes inside the string', () => {
	// Regression: \" used to toggle the string state, so a complete call with
	// an escaped quote was misread as still open.
	assert.equal(hasIncompleteTrailingMarkup('speak({"text":"Er sagte \\"hi\\"."})'), false);
	assert.equal(hasIncompleteTrailingMarkup('speak({"text":"Er sagte \\"hi'), true);
});

test('cleanSpeechMarkers strips fenced JSON state blocks entirely', () => {
	// State blocks are app instructions, not prose — they must never reach
	// the chat display or a TTS pass.
	assert.equal(
		cleanSpeechMarkers('Hola!\n```json\n{ "mood_change": { "emotion": "happy" } }\n```\nBye!'),
		'Hola! Bye!'
	);
	assert.equal(
		cleanSpeechMarkers("```json\n{ \"energy_delta\": 3 }\n```"),
		''
	);
});

// stripThinkingBlocks tests moved to src/lib/ai/thinking-blocks.test.ts
// with the layering fix: reasoning-tag stripping is a property of the
// model response format, not of speech synthesis.

test('hasIncompleteTrailingMarkup flags unclosed code fences', () => {
	// While a ```json state block is still streaming, its backticks and
	// raw JSON must not leak into the chat bubble.
	assert.equal(hasIncompleteTrailingMarkup('¡Hola!\n```json'), true);
	assert.equal(hasIncompleteTrailingMarkup('```json\n{ "mood_change": { "emotion"'), true);
	// Complete fences flush normally.
	assert.equal(
		hasIncompleteTrailingMarkup('¡Hola!\n```json\n{ "mood": "happy" }\n```'),
		false
	);
	assert.equal(hasIncompleteTrailingMarkup('Kein Zaun hier.'), false);
});

test('StreamingDisplayCleaner keeps the space between flushed fragments', () => {
	// Regression: cleanSpeechMarkers trims every fragment, so naive
	// concatenation glued words together ("¡Muy bien,mi vida!").
	const cleaner = new StreamingDisplayCleaner();
	assert.equal(cleaner.push('¡Muy bien,'), '¡Muy bien,');
	assert.equal(cleaner.push(' mi vida!'), '¡Muy bien, mi vida!');
	assert.equal(cleaner.text, '¡Muy bien, mi vida!');
});

test('StreamingDisplayCleaner rejoins mid-word fragments without a separator', () => {
	// Tokenizer artifacts split words across chunks; the raw boundary has
	// no whitespace, so no separator space may be inserted.
	const cleaner = new StreamingDisplayCleaner();
	assert.equal(cleaner.push('Fast per'), 'Fast per');
	assert.equal(cleaner.push('fekt gemacht.'), 'Fast perfekt gemacht.');
});

test('StreamingDisplayCleaner carries whitespace across markup-only fragments', () => {
	// A fragment that cleans to nothing (pure markup) must not swallow the
	// boundary whitespace of its visible neighbours.
	const cleaner = new StreamingDisplayCleaner();
	cleaner.push('Hi ');
	cleaner.push('speak({"text":"adept"})');
	assert.equal(cleaner.push(' there'), 'Hi adept there');
	// Markup fragment bounded by raw spaces keeps the neighbours apart too.
	const quiet = new StreamingDisplayCleaner();
	quiet.push('Hi ');
	quiet.push(' pause({"ms":200})');
	assert.equal(quiet.push('there'), 'Hi there');
});

test('StreamingDisplayCleaner does not duplicate separator spaces', () => {
	const cleaner = new StreamingDisplayCleaner();
	cleaner.push('Hola ');
	// Raw fragment starts with whitespace AND previous one ended with it —
	// still exactly one separator space in the display.
	assert.equal(cleaner.push(' mundo'), 'Hola mundo');
	// Newlines between fragments collapse to one space in the live view;
	// the final refresh renders the real text.
	assert.equal(cleaner.push('\nSiguiente línea.'), 'Hola mundo Siguiente línea.');
});

test('cleanSpeechMarkers strips state fences by default but can keep them', () => {
	const raw = 'Hola cariño\n```json\n{ "mood_change": { "emotion": "happy" } }\n```';
	// Display and TTS never want the fence (the newline before it stays;
	// the live-view cleaner and parseResponse both trim).
	assert.equal(cleanSpeechMarkers(raw), 'Hola cariño\n');
	// The parser input must keep it as the anchor for state extraction and
	// the post-state dialogue cut.
	assert.equal(
		cleanSpeechMarkers(raw, { keepStateFences: true }),
		'Hola cariño\n```json\n{ "mood_change": { "emotion": "happy" } }\n```'
	);
});

test('omnivoice parse input cuts post-state repeats (regression: duplicated chat message)', () => {
	// The model sometimes repeats its whole reply after the ```json state
	// block. Before the fix, cleanSpeechMarkers stripped the fence before
	// parseResponse saw it, so the cut had no anchor and the repeat
	// survived in the dialogue — the chat displayed the message twice.
	const raw = [
		'speak({"language":"de","text":"Sehr schön, mi vida! Das Buch heißt el libro."})',
		'```json',
		'{ "mood_change": { "emotion": "happy", "intensity_delta": 2 } }',
		'```',
		'speak({"language":"de","text":"Sehr schön, mi vida! Das Buch heißt el libro."})'
	].join('\n');

	const cleaned = cleanSpeechMarkers(raw, { keepStateFences: true });
	const parsed = parseResponse(cleaned);

	assert.equal(parsed.dialogue, 'Sehr schön, mi vida! Das Buch heißt el libro.');
	assert.ok(parsed.stateUpdates, 'state updates must survive the cleaning');
	assert.equal(parsed.stateUpdates?.moodChange?.emotion, 'happy');
});

test('cutAtStateFence splits the raw buffer at the state fence', () => {
	// No fence yet: everything is visible, nothing is capped.
	assert.deepEqual(cutAtStateFence('Hola cariño, wie gehts?'), {
		visible: 'Hola cariño, wie gehts?',
		capped: false
	});
	// Fence appears: the visible part ends right before it.
	assert.deepEqual(cutAtStateFence('Hola.\n```json\n{ "mood_change": {} }'), {
		visible: 'Hola.\n',
		capped: true
	});
	// Fence at position zero: nothing visible.
	assert.deepEqual(cutAtStateFence('```json\n{}\n```\nRepeat?'), {
		visible: '',
		capped: true
	});
});

test('live display freezes at the state fence (regression: message built up twice)', () => {
	// Mirrors the omnivoice onDelta display flow: gate → fence cut →
	// cleaner. The post-state repeat must never reach the live view.
	const replay = (deltas: string[]): string => {
		const cleaner = new StreamingDisplayCleaner();
		let pendingRaw = '';
		let capped = false;
		for (const delta of deltas) {
			if (capped) continue;
			pendingRaw += delta;
			const cut = cutAtStateFence(pendingRaw);
			if (cut.capped) {
				if (cut.visible && !hasIncompleteTrailingMarkup(cut.visible)) {
					cleaner.push(cut.visible);
				}
				pendingRaw = '';
				capped = true;
			} else if (!hasIncompleteTrailingMarkup(pendingRaw)) {
				cleaner.push(pendingRaw);
				pendingRaw = '';
			}
		}
		return cleaner.text;
	};

	const reply = 'Sehr schön, mi vida! Das Buch heißt el libro.';
	const display = replay([
		'Sehr schön, mi vida!',
		' Das Buch heißt el libro.',
		'\n```json',
		'\n{ "mood_change": { "emotion": "happy" } }',
		'\n```',
		`\n${reply}` // post-state repeat — must not display
	]);
	assert.equal(display, reply);
});

test('live display drops an incomplete markup tail before the fence', () => {
	// If the text right before the fence ends mid-markup, that tail is
	// held back from the live view instead of flashing raw fragments.
	const replay = (deltas: string[]): string => {
		const cleaner = new StreamingDisplayCleaner();
		let pendingRaw = '';
		let capped = false;
		for (const delta of deltas) {
			if (capped) continue;
			pendingRaw += delta;
			const cut = cutAtStateFence(pendingRaw);
			if (cut.capped) {
				if (cut.visible && !hasIncompleteTrailingMarkup(cut.visible)) {
					cleaner.push(cut.visible);
				}
				pendingRaw = '';
				capped = true;
			} else if (!hasIncompleteTrailingMarkup(pendingRaw)) {
				cleaner.push(pendingRaw);
				pendingRaw = '';
			}
		}
		return cleaner.text;
	};

	const display = replay(['Hola!', '\nspeak({"te', '\n```json\n{ }\n```', '\nrepeat']);
	// The incomplete speak( tail before the fence is dropped; the final
	// parser replace restores the correct message afterwards.
	assert.equal(display, 'Hola!');
});

test('cleanSpeechMarkers collapses native speech text repeated as plain text', () => {
	const sentence = '¡Claro, volvemos a lo clásico! Dann hole ich dir jetzt die süßen gatitos zurück – die gehen ja immer.';
	const result = cleanSpeechMarkers(`speak({"text":${JSON.stringify(sentence)}}) ${sentence}`);
	assert.equal(result, sentence);
});

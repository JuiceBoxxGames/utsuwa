import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

import { StreamingSpeechBuffer } from './streaming-speech-buffer.ts';

function createBuffer() {
	const segments: { text: string; language?: string }[] = [];
	const buffer = new StreamingSpeechBuffer({
		defaultLanguage: 'en',
		onSegment: (seg) => segments.push(seg)
	});
	return { buffer, segments };
}

test('emits a complete sentence immediately', () => {
	const { buffer, segments } = createBuffer();
	buffer.feed('Hello world.');
	assert.equal(segments.length, 1);
	assert.equal(segments[0].text, 'Hello world.');
});

test('emits multiple sentences from one chunk', () => {
	const { buffer, segments } = createBuffer();
	buffer.feed('First sentence. Second sentence.');
	assert.equal(segments.length, 2);
	assert.equal(segments[0].text, 'First sentence.');
	assert.equal(segments[1].text, 'Second sentence.');
});

test('buffers partial sentences until a terminator arrives', () => {
	const { buffer, segments } = createBuffer();
	buffer.feed('Hello ');
	assert.equal(segments.length, 0);
	buffer.feed('world.');
	assert.equal(segments.length, 1);
	assert.equal(segments[0].text, 'Hello world.');
});

test('flushes remaining text without a terminator', () => {
	const { buffer, segments } = createBuffer();
	buffer.feed('No terminator here');
	assert.equal(segments.length, 0);
	buffer.flush();
	assert.equal(segments.length, 1);
	assert.equal(segments[0].text, 'No terminator here');
});

test('splits at paragraph breaks', () => {
	const { buffer, segments } = createBuffer();
	buffer.feed('Paragraph one.\n\nParagraph two.');
	assert.equal(segments.length, 2);
	assert.equal(segments[0].text, 'Paragraph one.');
	assert.equal(segments[1].text, 'Paragraph two.');
});

test('does not emit while inside an open JSON block', () => {
	const { buffer, segments } = createBuffer();
	buffer.feed('Hello. {"mood_change":');
	assert.equal(segments.length, 1);
	assert.equal(segments[0].text, 'Hello.');
	buffer.feed('{"emotion":"happy"}} Goodbye.');
	assert.equal(segments.length, 2);
	assert.equal(segments[1].text, 'Goodbye.');
});

test('ignores braces inside JSON string values when tracking depth', () => {
	// Regression: {"...":"{hello}"} used to count the braces inside the string
	// value, leaving the depth stuck at >0 and blocking TTS for later text.
	const { buffer, segments } = createBuffer();
	buffer.feed('Hi. {"mood_change":{"text":"{hel');
	assert.equal(segments.length, 1);
	assert.equal(segments[0].text, 'Hi.');
	buffer.feed('lo}"}} Goodbye.');
	assert.equal(segments.length, 2);
	assert.equal(segments[1].text, 'Goodbye.');
});

test('keeps string state across chunk boundaries', () => {
	const { buffer, segments } = createBuffer();
	buffer.feed('Hi. {"mood_change":{"note":"a {');
	buffer.feed('b} c"}} Bye.');
	assert.equal(segments.length, 2);
	assert.equal(segments[1].text, 'Bye.');
});

test('reset clears pending text', () => {
	const { buffer, segments } = createBuffer();
	buffer.feed('Pending');
	buffer.reset();
	buffer.flush();
	assert.equal(segments.length, 0);
});

test('skips segments containing only punctuation and whitespace', () => {
	const { buffer, segments } = createBuffer();
	buffer.feed('   ');
	buffer.flush();
	assert.equal(segments.length, 0);
});

// OmniVoice-style language-marked tool calls -------------------------------

function createLanguageBuffer(defaultLanguage = 'de') {
	const segments: { text: string; language?: string }[] = [];
	const buffer = new StreamingSpeechBuffer({
		defaultLanguage,
		onSegment: (seg) => segments.push(seg)
	});
	return { buffer, segments };
}

test('emits a complete speak call immediately', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":"Hallo","lang":"de"})');
	assert.deepEqual(segments, [{ text: 'Hallo', language: 'de' }]);
});

test('emits a speak call split across multiple chunks only when complete', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":"Hall');
	assert.equal(segments.length, 0);
	buffer.feed('o","lang":"de"})');
	assert.deepEqual(segments, [{ text: 'Hallo', language: 'de' }]);
});

test('does not emit completed language calls twice when more chunks arrive', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":"Hallo","lang":"de"})');
	assert.equal(segments.length, 1);
	buffer.feed(' speak({"text":"Welt","lang":"de"})');
	assert.equal(segments.length, 2);
	assert.deepEqual(segments, [
		{ text: 'Hallo', language: 'de' },
		{ text: 'Welt', language: 'de' }
	]);
});

test('flush does not emit completed language calls twice', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":"hola","lang":"es"})');
	buffer.flush();
	assert.deepEqual(segments, [{ text: 'hola', language: 'es' }]);
});

test('preserves language switches within one sentence as separate segments', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":"Auf Spanisch sagt man ","lang":"de"})');
	buffer.feed(' speak({"text":"por favor,","lang":"es"})');
	buffer.feed(' speak({"text":" bitte.","lang":"de"})');

	assert.deepEqual(segments, [
		{ text: 'Auf Spanisch sagt man', language: 'de' },
		{ text: 'por favor,', language: 'es' },
		{ text: 'bitte.', language: 'de' }
	]);
});

test('keeps explicit language codes unchanged', () => {
	const { buffer, segments } = createLanguageBuffer('en');
	buffer.feed('speak({"text":"Hola","lang":"es"})');
	buffer.feed(' speak({"text":"Hello","lang":"en"})');
	buffer.feed(' speak({"text":"Bonjour","lang":"fr"})');

	assert.deepEqual(segments, [
		{ text: 'Hola', language: 'es' },
		{ text: 'Hello', language: 'en' },
		{ text: 'Bonjour', language: 'fr' }
	]);
});

test('never speaks raw or incomplete speak syntax', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":"Hallo"');
	assert.equal(segments.length, 0);

	buffer.feed(',"lang":"de"})');
	assert.deepEqual(segments, [{ text: 'Hallo', language: 'de' }]);
});

test('extracts speakable text from an incomplete tool call on flush (H3)', () => {
	// The last speak() call may be truncated at end-of-stream (missing the
	// closing `})`). Its text must still be spoken instead of silently dropped.
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":"Hallo, wie geht es dir');
	buffer.flush();
	assert.deepEqual(segments, [{ text: 'Hallo, wie geht es dir', language: 'de' }]);
});

test('does not speak a bare incomplete call with no text on flush', () => {
	// No text value present yet — nothing speakable to extract.
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":');
	buffer.flush();
	assert.equal(segments.length, 0);
});

test('extracts text when lang precedes text in a truncated call (H3)', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"lang":"es","text":"Hola');
	buffer.flush();
	assert.deepEqual(segments, [{ text: 'Hola', language: 'de' }]);
});

test('plaintext before a speak call is still emitted', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('Hello world. speak({"text":"Hola","lang":"es"})');
	assert.deepEqual(segments, [
		{ text: 'Hello world.', language: 'de' },
		{ text: 'Hola', language: 'es' }
	]);
});

test('emits Japanese sentences without whitespace after 。', () => {
	const { buffer, segments } = createLanguageBuffer('ja');
	buffer.feed('こんにちは。元気ですか。');
	assert.equal(segments.length, 2);
	assert.equal(segments[0].text, 'こんにちは。');
	assert.equal(segments[1].text, '元気ですか。');
});

test('emits Chinese sentences without whitespace after 。', () => {
	const { buffer, segments } = createLanguageBuffer('zh');
	buffer.feed('你好。今天怎么样？');
	assert.equal(segments.length, 2);
	assert.equal(segments[0].text, '你好。');
	assert.equal(segments[1].text, '今天怎么样？');
});

test('normalizes uppercase language codes in speak calls', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":"Hola","lang":"ES"})');
	assert.deepEqual(segments, [{ text: 'Hola', language: 'es' }]);
});

// Long speak() calls are split so synthesis of the first sentence starts
// immediately instead of waiting for the whole call to stream. ------------

test('splits a long speak call at sentence boundaries', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed(
		'speak({"text":"Erste Erklärung. Zweiter Satz. Dritter Satz. Vierter Satz.","lang":"de"})'
	);
	assert.deepEqual(segments, [
		{ text: 'Erste Erklärung.', language: 'de' },
		{ text: 'Zweiter Satz.', language: 'de' },
		{ text: 'Dritter Satz.', language: 'de' },
		{ text: 'Vierter Satz.', language: 'de' }
	]);
});

test('keeps short speak calls unsplit', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":"Hallo. Wie geht es dir?","lang":"de"})');
	assert.deepEqual(segments, [{ text: 'Hallo. Wie geht es dir?', language: 'de' }]);
});

test('split long calls keep their language on every part', () => {
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed('speak({"text":"Uno. Dos. Tres. Cuatro.","lang":"es"})');
	assert.deepEqual(segments, [
		{ text: 'Uno.', language: 'es' },
		{ text: 'Dos.', language: 'es' },
		{ text: 'Tres.', language: 'es' },
		{ text: 'Cuatro.', language: 'es' }
	]);
});

test('split long call preserves trailing text without terminator', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":"A. B. C. D. und noch ein Nachsatz","lang":"de"})');
	assert.equal(segments.length, 5);
	assert.equal(segments[4].text, 'und noch ein Nachsatz');
});

// Same-pass merging of adjacent same-language segments. --------------------

test('merges consecutive same-language speak calls from one chunk', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed(
		'speak({"text":"el oído","lang":"es"}) speak({"text":"el verbo ir","lang":"es"})'
	);
	assert.deepEqual(segments, [{ text: 'el oído el verbo ir', language: 'es' }]);
});

test('does not merge same-language calls arriving in separate chunks', () => {
	// Merging across chunks would delay the first word's synthesis.
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('speak({"text":"el oído","lang":"es"})');
	assert.equal(segments.length, 1);
	buffer.feed(' speak({"text":"el verbo ir","lang":"es"})');
	assert.deepEqual(segments, [
		{ text: 'el oído', language: 'es' },
		{ text: 'el verbo ir', language: 'es' }
	]);
});

test('does not merge more than 15 words', () => {
	const { buffer, segments } = createLanguageBuffer();
	const first = Array.from({ length: 10 }, (_, i) => `palabra${i}`).join(' ');
	const second = Array.from({ length: 10 }, (_, i) => `extra${i}`).join(' ');
	buffer.feed(`speak({"text":"${first}","lang":"es"}) speak({"text":"${second}","lang":"es"})`);
	assert.equal(segments.length, 2);
});

test('never merges the sentences of a split long call', () => {
	// The long-call split exists for early start; merging the parts back would
	// delay the first sentence behind the whole synthesis.
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed(
		'speak({"text":"Uno. Dos. Tres. Cuatro.","lang":"es"})'
	);
	assert.deepEqual(segments, [
		{ text: 'Uno.', language: 'es' },
		{ text: 'Dos.', language: 'es' },
		{ text: 'Tres.', language: 'es' },
		{ text: 'Cuatro.', language: 'es' }
	]);
});

test('merges plaintext prose with a following same-language call', () => {
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed('Das ist gut. speak({"text":"wirklich","lang":"de"})');
	assert.deepEqual(segments, [{ text: 'Das ist gut. wirklich', language: 'de' }]);
});

// JSON actions envelopes (some models emit them instead of speak() calls). ---

test('emits the speak actions of a complete JSON envelope', () => {
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed(
		'{"actions":[{"function":"gesture","args":{"type":"smile"}},{"function":"speak","args":{"text":"Hallo!","lang":"de"}},{"function":"speak","args":{"text":"¡Hola!","lang":"es"}}]}'
	);
	assert.deepEqual(segments, [
		{ text: 'Hallo!', language: 'de' },
		{ text: '¡Hola!', language: 'es' }
	]);
});

test('never speaks an incomplete actions envelope', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('{"actions":[{"function":"speak","args":{"text":"Hallo!');
	assert.equal(segments.length, 0);
	buffer.flush();
	assert.equal(segments.length, 0);
});

test('emits an envelope spread across chunks only when complete', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('{"actions":[{"function":"speak","args":{"text":"Hallo!');
	assert.equal(segments.length, 0);
	buffer.feed('","lang":"de"}}]}');
	assert.deepEqual(segments, [{ text: 'Hallo!', language: 'de' }]);
});

test('speaks prose before a complete envelope and keeps languages separate', () => {
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed(
		'Einleitung. {"actions":[{"function":"speak","args":{"text":"El participio","lang":"es"}}]}'
	);
	assert.deepEqual(segments, [
		{ text: 'Einleitung.', language: 'de' },
		{ text: 'El participio', language: 'es' }
	]);
});

// XML-style speak/gesture tags. ----------------------------------------------

test('emits the speak texts of self-closing XML tags with languages', () => {
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed(
		'<speak text="Hallo! Wie geht es dir?" /> <speak lang="es" text="¡Hola! ¿Cómo estás?" />'
	);
	assert.deepEqual(segments, [
		{ text: 'Hallo! Wie geht es dir?', language: 'de' },
		{ text: '¡Hola! ¿Cómo estás?', language: 'es' }
	]);
});

test('never speaks an incomplete XML tag', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('<speak text="Hallo!');
	assert.equal(segments.length, 0);
	buffer.flush();
	assert.equal(segments.length, 0);
});

test('does not re-emit prose that follows a complete XML tag (M-1)', () => {
	// Regression: after <speak .../> the trailing prose must be spoken exactly
	// once, not again on a later flush.
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed('<speak text="Hola" lang="es"/> und weiter.');
	buffer.flush();
	const texts = segments.map((s) => s.text);
	const undCount = texts.filter((t) => t === 'und weiter.').length;
	assert.equal(undCount, 1, `"und weiter." must appear exactly once, got ${JSON.stringify(texts)}`);
	assert.ok(texts.includes('Hola'), `"Hola" must be spoken, got ${JSON.stringify(texts)}`);
});

test('emits an open/close XML tag spread across chunks only when complete', () => {
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('<speak lang="es">Hola, ¿c');
	assert.equal(segments.length, 0);
	buffer.feed('ómo estás?</speak>');
	assert.deepEqual(segments, [{ text: 'Hola, ¿cómo estás?', language: 'es' }]);
});

test('never speaks the incomplete tail of an XML tag while streaming', () => {
	// A complete tag followed by a partial tag: only the complete tag's text
	// may be emitted; the raw `<gesture` tail must stay held.
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('<speak text="Klar."/> <gesture');
	assert.deepEqual(segments, [{ text: 'Klar.', language: 'de' }]);
	buffer.feed(' type="smile"/>');
	assert.deepEqual(segments, [{ text: 'Klar.', language: 'de' }]);
});

test('never speaks a bare < at the end of a streaming chunk', () => {
	// A chunk can end with a lone `<` (the tag letters arrive next); it must
	// be held as markup, not spoken.
	const { buffer, segments } = createLanguageBuffer();
	buffer.feed('<speak lang="es" text="Hola." /> <');
	assert.deepEqual(segments, [{ text: 'Hola.', language: 'es' }]);
	buffer.feed('speak lang="de" text="Hallo." />');
	assert.deepEqual(segments, [
		{ text: 'Hola.', language: 'es' },
		{ text: 'Hallo.', language: 'de' }
	]);
});

test('does not re-emit prose between a complete and an incomplete XML tag (M-1 streaming)', () => {
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed('<speak text="Hola" lang="es"/> und weiter <speak text="noch');
	// The complete tag is emitted, the prose before the incomplete tag is emitted
	// once, and the incomplete tag itself stays held.
	const texts = segments.map((s) => s.text);
	assert.equal(texts.filter((t) => t === 'und weiter').length, 1, JSON.stringify(texts));
	buffer.feed('nicht');
	assert.equal(segments.length, 2);
});

test('emits <speak text="..."> tags opened without self-closing', () => {
	// The model sometimes opens the tag with a plain `>` and no </speak>;
	// the text is complete inside the attribute.
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed(
		'<speak text="Hallo! Wie geht es dir?"> <pause ms=300/> <speak lang="es" text="¡Hola! ¿Cómo estás?">'
	);
	assert.deepEqual(segments, [
		{ text: 'Hallo! Wie geht es dir?', language: 'de' },
		{ text: '¡Hola! ¿Cómo estás?', language: 'es' }
	]);
});

test('sections separated by bare </speak> tags keep the default language', () => {
	// Some models emit only closing tags as section separators; the sections
	// are plaintext and get the default language here. The orchestrator's
	// validateAndSplitSegment re-validates and re-tags them against the
	// session's ELD subset (see language-sim.test.ts for the golden cases).
	const segments: { text: string; language?: string }[] = [];
	const b = new StreamingSpeechBuffer({
		defaultLanguage: 'de',
		onSegment: (seg) => segments.push(seg)
	});
	b.feed(
		'Hier ist die Konjugation.</speak> Präsens: ich gehe – du gehst.</speak> ' +
			'Aquí tienes la conjugación.</speak> Presente: yo voy – tú vas. ¡Perfecto!'
	);
	b.flush();
	assert.deepEqual(segments, [
		{ text: 'Hier ist die Konjugation.', language: 'de' },
		{ text: 'Präsens: ich gehe – du gehst.', language: 'de' },
		{ text: 'Aquí tienes la conjugación.', language: 'de' },
		{ text: 'Presente: yo voy – tú vas.', language: 'de' },
		{ text: '¡Perfecto!', language: 'de' }
	]);
});

test('bare </speak> tags are never spoken', () => {
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed('Hallo.</speak> Welt.');
	buffer.flush();
	assert.deepEqual(segments, [
		{ text: 'Hallo.', language: 'de' },
		{ text: 'Welt.', language: 'de' }
	]);
});

test('angle-bracket < text > sections are spoken without the brackets', () => {
	const segments: { text: string; language?: string }[] = [];
	const b = new StreamingSpeechBuffer({
		defaultLanguage: 'de',
		onSegment: (seg) => segments.push(seg)
	});
	b.feed(
		'< Hier ist die Konjugation. > < > < Aquí tienes la conjugación. > < > < Presente: yo voy, tú vas. ¡Perfecto! >'
	);
	b.flush();
	assert.deepEqual(segments, [
		{ text: 'Hier ist die Konjugation.', language: 'de' },
		{ text: 'Aquí tienes la conjugación.', language: 'de' },
		{ text: 'Presente: yo voy, tú vas.', language: 'de' },
		{ text: '¡Perfecto!', language: 'de' }
	]);
});

// State-block fragments must never be spoken. -------------------------------

test('never speaks a state block that arrives without outer braces', () => {
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed(
		'speak({"text":"Hallo! Wie geht es dir?","lang":"de"})\n' +
			'{"mood_change": {"emotion": "happy", "intensity_delta": 0}, "energy_delta": 0, "new_memory": null}'
	);
	assert.deepEqual(segments, [{ text: 'Hallo! Wie geht es dir?', language: 'de' }]);
});

test('never speaks state-key fragments left over from block stripping', () => {
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed(
		'"mood_change": {"emotion": "happy", "intensity_delta": 0}, "energy_delta": 0, "new_memory": null'
	);
	buffer.flush();
	assert.deepEqual(segments, []);
});

test('never speaks state fragments that reach the plaintext path with a sentence boundary', () => {
	// A fragment ending with a period would be emitted via the plaintext path;
	// it must still be filtered.
	const { buffer, segments } = createLanguageBuffer('de');
	buffer.feed('"mood_change": {"emotion": "happy"}. Weiterer Text.');
	assert.deepEqual(segments, [{ text: 'Weiterer Text.', language: 'de' }]);
});

// ── flush timer integration ──────────────────────────────────────────

test('flush timer emits a trailing fragment after the timeout', () => {
	// A fragment without a sentence terminator is held back; the 1500 ms
	// flush timer must still emit it so the end of a reply is never lost.
	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const { buffer, segments } = createBuffer();
		buffer.feed('Trailing fragment without terminator');
		assert.equal(segments.length, 0);
		mock.timers.tick(1499);
		assert.equal(segments.length, 0);
		mock.timers.tick(1);
		assert.deepEqual(segments, [{ text: 'Trailing fragment without terminator', language: 'en' }]);
	} finally {
		mock.timers.reset();
	}
});

// ── code fences split across chunks ──────────────────────────────────

test('a code fence split before its language label never speaks the label', () => {
	// Regression: the model wrapped its state block in a ```json fence and
	// the fence arrived alone at a chunk boundary; stripping it immediately
	// orphaned the label, which was then spoken as the word "json".
	const { buffer, segments } = createBuffer();
	buffer.feed('Du bist fleißig!\n\n```');
	buffer.feed('json\n{"mood_change":{"emotion":"happy"}}\n```');
	buffer.flush();
	assert.deepEqual(
		segments.map((s) => s.text),
		['Du bist fleißig!']
	);
});

test('a flushed naked fence does not orphan the label in a later chunk', () => {
	// Same split, but the flush timer fires between the two chunks.
	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const { buffer, segments } = createBuffer();
		buffer.feed('Erster Satz. ```');
		mock.timers.tick(2000);
		buffer.feed('json\n{"mood_change":{"emotion":"happy"}}\n```');
		buffer.flush();
		assert.deepEqual(
			segments.map((s) => s.text),
			['Erster Satz.']
		);
	} finally {
		mock.timers.reset();
	}
});

test('a complete fenced state block in one chunk is fully suppressed', () => {
	const { buffer, segments } = createBuffer();
	buffer.feed('Alles klar. ```json\n{"mood_change":{"emotion":"happy"}}\n```');
	buffer.flush();
	assert.deepEqual(
		segments.map((s) => s.text),
		['Alles klar.']
	);
});

// ── speak() language pass-through ────────────────────────────────
// The buffer no longer pre-tags segments: the orchestrator's
// validateAndSplitSegment is the single arbiter (ELD subset + alt-run
// splitting). These tests pin the pass-through contract.

test('speak call without lang keeps the default language', () => {
	const segments: { text: string; language?: string }[] = [];
	const b = new StreamingSpeechBuffer({
		defaultLanguage: 'de',
		onSegment: (seg) => segments.push(seg)
	});
	b.feed('speak({"text":"¿Cómo estás?"})');
	assert.deepEqual(segments, [{ text: '¿Cómo estás?', language: 'de' }]);
});

test('speak call with a lang tag keeps the declared language', () => {
	const segments: { text: string; language?: string }[] = [];
	const b = new StreamingSpeechBuffer({
		defaultLanguage: 'de',
		onSegment: (seg) => segments.push(seg)
	});
	b.feed('speak({"text":"¿Qué tal?","lang":"es"}) speak({"text":"Das ist für dich.","lang":"de"})');
	assert.deepEqual(segments, [
		{ text: '¿Qué tal?', language: 'es' },
		{ text: 'Das ist für dich.', language: 'de' }
	]);
});

// --- split-at-every-position harness (streaming leak net) ---

const CORPUS: { name: string; text: string }[] = [
	{
		name: 'calls with alts',
		text: 'speak({"text":"Guten Tag, wie geht es dir?","lang":"de"}) speak({"text":"¿Hola, cómo estás?","lang":"es"})'
	},
	{
		name: 'call + state block + prose',
		text: 'speak({"text":"Hallo!"})\n```json\n{"mood_change":{"text":"na ja","params":{}}}\n```\nGuten Tag. Wie geht es dir?'
	},
	{
		name: 'fence between calls',
		text: 'speak({"text":"Eins.","lang":"de"})\n```json\n{"mood_change":{"text":"na ja","params":{}}}\n```\nspeak({"text":"Zwei!","lang":"es"})'
	},
	{
		name: 'xml self-closing + prose',
		text: '<speak text="Hola" lang="es"/> Was machst du gerade?'
	},
	{
		name: 'xml + call handoff',
		text: '<speak text="Hi"/> speak({"text":"Hallo!","lang":"es"}) Bis bald.'
	},
	{
		name: 'mixed tag-call syntax',
		text: '<speak({"text":"Hallo!","lang":"es"}) Tschüss!'
	},
	{
		name: 'pause + gesture + call',
		text: 'speak({"text":"Hmm.","lang":"de"}) pause({"ms":300}) gesture({"name":"nod"}) speak({"text":"Tschüss!","lang":"es"})'
	},
	{
		name: 'actions envelope',
		text: '{"actions":[{"function":"speak","args":{"text":"Hola, todo bien!","lang":"es"}}]}'
	}
];

const LEAK_MARKERS = ['```', 'peak(', 'speak(', 'gesture(', 'pause(', '<speak', '<s', '"text":', 'mood_change'];
const LEAK_WORDS = ['json', 'son', 'jso', 'spea', 'peak'];

function assertNoLeaks(
	entry: { name: string; text: string },
	split: number | 'byte',
	segments: { text: string; language?: string }[]
) {
	const spoken = segments.map((seg) => seg.text).join('\n');
	for (const marker of LEAK_MARKERS) {
		assert.ok(
			!spoken.includes(marker),
			`[${entry.name}] split=${split}: leak "${marker}" in ${JSON.stringify(spoken)}`
		);
	}
	for (const word of LEAK_WORDS) {
		const re = new RegExp(`\\b${word}\\b`);
		assert.ok(!re.test(spoken), `[${entry.name}] split=${split}: leak "${word}" in ${JSON.stringify(spoken)}`);
	}
	for (const seg of segments) {
		assert.ok(
			seg.language === undefined || seg.language === 'de' || seg.language === 'es',
			`[${entry.name}] split=${split}: odd language ${seg.language} for ${JSON.stringify(seg.text)}`
		);
		assert.ok(
			/[\p{L}\p{N}]/u.test(seg.text),
			`[${entry.name}] split=${split}: punctuation-only segment ${JSON.stringify(seg.text)}`
		);
	}
}

test('split-at-every-position: byte-by-byte leaks nothing', () => {
	for (const entry of CORPUS) {
		const segments: { text: string; language?: string }[] = [];
		const buffer = new StreamingSpeechBuffer({
			defaultLanguage: 'de',
			onSegment: (seg) => segments.push(seg)
		});
		for (const ch of entry.text) buffer.feed(ch);
		buffer.flush();
		assertNoLeaks(entry, 'byte', segments);
	}
});

test('split-at-every-position: single boundary leaks nothing', () => {
	for (const entry of CORPUS) {
		for (let i = 1; i < entry.text.length; i++) {
			const segments: { text: string; language?: string }[] = [];
			const buffer = new StreamingSpeechBuffer({
				defaultLanguage: 'de',
				onSegment: (seg) => segments.push(seg)
			});
			buffer.feed(entry.text.slice(0, i));
			buffer.flush();
			assertNoLeaks(entry, i, segments);
		}
	}
});

function collectSegments(feeds: string[]): { text: string; language?: string }[] {
	const segments: { text: string; language?: string }[] = [];
	const buffer = new StreamingSpeechBuffer({
		defaultLanguage: 'de',
		onSegment: (seg) => segments.push(seg)
	});
	for (const feed of feeds) buffer.feed(feed);
	buffer.flush();
	return segments;
}

test('regression: stray ")" from a }|) boundary is consumed with the call', () => {
	// Maintainer observation: a split between "}" and ")" of a speak call
	// leaked the ")" into the text path as a spoken segment.
	const segments = collectSegments(['speak({"text":"Hallo"}', ')']);
	assert.deepEqual(segments.map((seg) => seg.text), ['Hallo']);
});

test('regression: split fence label never leaks "son" (tagged es)', () => {
	// Maintainer observation: byte-by-byte streaming of "```json" split as
	// "```j" + "son" leaked "son" as a Spanish-tagged word, because the
	// stripper removed "```j" but orphaned the label remainder.
	const segments = collectSegments(['```', 'j', 'son\n{"mood_change":{"text":"na ja"}}', '\n']);
	const spoken = segments.map((seg) => seg.text).join('\n');
	assert.ok(!/\bson\b/.test(spoken), `leaked "son" in ${JSON.stringify(spoken)}`);
	assert.ok(!/```/.test(spoken), `leaked fence syntax in ${JSON.stringify(spoken)}`);
});

test('regression: mixed <speak({ syntax never leaks "peak("', () => {
	// Maintainer observation: the XML-to-call handoff could end up speaking
	// 'peak({"text":...' literally when "<speak" met a call opener.
	const segments = collectSegments(['<speak({"text":"Hallo!","lang":"es"})']);
	assert.deepEqual(segments.map((seg) => seg.text), ['Hallo!']);
});

test('explicit primary lang passes through unchanged', () => {
	// Regression: "es" in "wie geht es dir?" must never flip an explicitly
	// German-tagged segment. The buffer passes tags through; the orchestrator
	// re-validates against the ELD subset (see language-sim.test.ts).
	const segments = collectSegments(['speak({"text":"Guten Tag, wie geht es dir?","lang":"de"})']);
	assert.deepEqual(segments.map((seg) => seg.language), ['de']);
});

test('flush keeps capitalized prose words but drops lowercase marker names', () => {
	// "Pause" is a German noun — legitimate prose; a lowercase "pause" at
	// end-of-stream is an aborted call opener and must not be spoken.
	const prose = collectSegments(['Wie wäre es mit einer Pause']);
	assert.equal(prose.map((seg) => seg.text).join(' '), 'Wie wäre es mit einer Pause');
	const aborted = collectSegments(['Und dann pause']);
	assert.equal(aborted.map((seg) => seg.text).join(' '), 'Und dann');
});


test('preserves conversational English in prose and speak calls', () => {
	const sentences = [
		'Maybe we can go for a walk together.',
		'Let me know how your interview goes.',
		'This is the Spanish word for a dog.'
	];
	for (const text of sentences) {
		for (const input of [text, `speak(${JSON.stringify({ text, lang: 'en' })})`]) {
			const { buffer, segments } = createBuffer();
			buffer.feed(input);
			buffer.flush();
			assert.equal(segments.map((s) => s.text).join(' '), text);
		}
	}
});

// ── #319: timer flush + end-of-stream flush ─────────────────────────

test('timer flush over a truncated call does not repeat it on the final flush (#319)', () => {
	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const { buffer, segments } = createBuffer();
		buffer.feed('speak({"text":"See you tomorrow');
		mock.timers.tick(1500);
		buffer.flush();
		assert.deepEqual(segments.map((s) => s.text), ['See you tomorrow']);
	} finally {
		mock.timers.reset();
	}
});

test('timer flush over a truncated call does not repeat it once the call completes (#319)', () => {
	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const { buffer, segments } = createBuffer();
		buffer.feed('speak({"text":"See you tomorrow');
		mock.timers.tick(1500);
		buffer.feed('.","lang":"en"})');
		buffer.flush();
		assert.deepEqual(segments.map((s) => s.text), ['See you tomorrow.']);
	} finally {
		mock.timers.reset();
	}
});

test('a repeated final flush never re-speaks a truncated call (#319)', () => {
	const { buffer, segments } = createBuffer();
	buffer.feed('speak({"text":"See you tomorrow');
	buffer.flush();
	buffer.flush();
	assert.deepEqual(segments.map((s) => s.text), ['See you tomorrow']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './matura-mistakes.js';
import { sanitizeMaturaReviewPayload } from './db.js';
import { PUBLIC_SCRIPTS } from './static-allowlist.js';

const MM = globalThis.MaturaMistakes;

test('normalizeType maps model wording to known ids', () => {
    assert.equal(MM.normalizeType('Grammar'), 'grammar');
    assert.equal(MM.normalizeType('grammar (tense)'), 'grammar');
    assert.equal(MM.normalizeType('word_order'), 'word-order');
    assert.equal(MM.normalizeType('Word order'), 'word-order');
    assert.equal(MM.normalizeType('Lexis / collocation'), 'vocabulary');
    assert.equal(MM.normalizeType('Style/register'), 'style');
    assert.equal(MM.normalizeType('punctuation'), 'punctuation');
    assert.equal(MM.normalizeType('cohesion'), 'coherence');
    assert.equal(MM.normalizeType('banana'), 'other');
    assert.equal(MM.normalizeType(''), null);
});

test('classifyMistake gives a sensible fallback type', () => {
    assert.equal(MM.classifyMistake(','), 'punctuation');
    assert.equal(MM.classifyMistake('recieve'), 'spelling');
    assert.equal(MM.classifyMistake('since'), 'grammar');
    assert.equal(MM.classifyMistake('have went'), 'grammar');
    assert.equal(MM.classifyMistake('gonna'), 'style');
    assert.equal(MM.classifyMistake('Moreover'), 'coherence');
    assert.equal(MM.classifyMistake('pleasure'), 'vocabulary');
    for (const t of ['x', 'a b c', '...']) assert.ok(MM.TYPE_IDS.includes(MM.classifyMistake(t)));
});

test('sanitizeMistakes drops junk, clips and normalizes', () => {
    const out = MM.sanitizeMistakes([
        null, { text: '' }, { text: 'goed', type: 'GRAMMAR', correction: 'went', explanation: 'Past of go is irregular.', extra: 1 },
        { original: 'recieve', category: 'spelling', fix: 'receive' }, { text: 'x'.repeat(500) },
    ]);
    assert.equal(out.length, 3);
    assert.deepEqual(out[0], { text: 'goed', type: 'grammar', correction: 'went', explanation: 'Past of go is irregular.' });
    assert.equal(out[1].type, 'spelling');
    assert.equal(out[1].correction, 'receive');
    assert.ok(out[2].text.length <= 300);
    assert.deepEqual(MM.sanitizeMistakes('nope'), []);
});

test('parseMarkedTranscript aligns typed mistakes to markers, falls back for missing ones', () => {
    const marked = 'Yesterday I <<err>>goed<</err>> to the park <<err>>,<</err>> and I <<err>>recieve<</err>> a gift.';
    const { segments, mistakes } = MM.parseMarkedTranscript(marked, '', [
        { text: 'recieve', type: 'spelling', correction: 'received' },
        { text: 'goed', type: 'grammar', correction: 'went' },
    ]);
    assert.equal(mistakes.length, 3);
    assert.equal(mistakes[0].type, 'grammar');
    assert.equal(mistakes[0].correction, 'went');
    assert.equal(mistakes[0].inferred, false);
    assert.equal(mistakes[1].type, 'punctuation');
    assert.equal(mistakes[1].inferred, true);
    assert.equal(mistakes[2].correction, 'received');
    assert.equal(segments.map(s => s.text).join(''), marked.replace(/<<\/?err>>/g, ''));
    assert.deepEqual(segments.filter(s => s.mistake).map(s => s.index), [0, 1, 2]);
});

test('parseMarkedTranscript: positional match when counts agree; old results infer everything', () => {
    const a = MM.parseMarkedTranscript('I <<err>>has<</err>> it', '', [{ text: 'have', type: 'grammar', correction: 'have' }]);
    assert.equal(a.mistakes[0].inferred, false);
    assert.equal(a.mistakes[0].text, 'has');
    const b = MM.parseMarkedTranscript('<<err>>Their<</err>> is <<err>>alot<</err>>', '', undefined);
    assert.ok(b.mistakes.every(m => m.inferred));
    const c = MM.parseMarkedTranscript('', 'plain essay', []);
    assert.equal(c.mistakes.length, 0);
    assert.equal(c.segments[0].text, 'plain essay');
});

test('saved review keeps sanitized mistakes', () => {
    const clean = sanitizeMaturaReviewPayload({ review: { markedTranscript: '<<err>>a<</err>>', mistakes: [{ text: 'a', type: 'Grammar', correction: 'the', junk: 'x' }] } });
    assert.deepEqual(clean.mistakes, [{ text: 'a', type: 'grammar', correction: 'the', explanation: '' }]);
    assert.deepEqual(sanitizeMaturaReviewPayload({ review: {} }).mistakes, []);
});

test('browser wiring: allowlisted, loaded by index.html, prompt asks for typed mistakes', () => {
    assert.ok(PUBLIC_SCRIPTS.has('matura-mistakes.js'));
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.match(html, /<script src="matura-mistakes\.js"><\/script>/);
    assert.match(html, /id="matura-mistakes-list"/);
    const server = readFileSync(new URL('./server.js', import.meta.url), 'utf8');
    assert.match(server, /"mistakes": \[\{ "text"/);
    assert.match(server, /sanitizeMaturaMistakes\(parsed\?\.mistakes\)/);
});

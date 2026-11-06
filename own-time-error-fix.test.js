import assert from 'node:assert/strict';
import test from 'node:test';
import './own-time-error-fix.js';
const {
    tokenizeSentence, inferErrorSpan, applyFix, gradeErrorCorrection,
    enrichErrorItem, parseStudentValue, encodeStudentValue, contiguousRange, spanText,
} = globalThis.OwnTimeErrorFix;
import { buildUoeItem, normalizeOwnTimeLesson, uoeInstruction, buildOwnTimeLessonPrompt, validateOwnTimeGenerateRequest } from './own-time-prompts.js';

test('tokenizeSentence: every word is a clickable token; punctuation stays attached', () => {
    const t = tokenizeSentence("She don't like milk.");
    assert.deepEqual(t.filter((x) => x.clickable).map((x) => x.text), ["She", "don't", 'like', 'milk.']);
    const t2 = tokenizeSentence('If I would be rich, I would travel.');
    assert.ok(t2.every((x) => x.clickable)); // comma attached to rich,
    assert.ok(t2.some((x) => x.text === 'rich,'));
    assert.ok(t2.some((x) => x.text === 'would'));
});

test('inferErrorSpan + applyFix: multi-word errorFrom → fragment only', () => {
    const lead = 'If I would be rich, I would travel.';
    const span = inferErrorSpan(lead, { errorFrom: 'would be', answer: 'were' });
    assert.equal(span.errorFrom, 'would be');
    assert.equal(applyFix(lead, span.start, span.end, 'were'), 'If I were rich, I would travel.');

    const lead2 = 'She suggested to go home early.';
    const span2 = inferErrorSpan(lead2, { errorFrom: 'to go', answer: 'going' });
    assert.equal(span2.errorFrom, 'to go');
    assert.equal(applyFix(lead2, span2.start, span2.end, 'going'), 'She suggested going home early.');

    const lead3 = 'Despite of the rain, we went out.';
    const span3 = inferErrorSpan(lead3, { errorFrom: 'Despite of', answer: 'Despite' });
    assert.equal(applyFix(lead3, span3.start, span3.end, 'Despite'), 'Despite the rain, we went out.');
});

test('contiguousRange keeps a single span from first to last click', () => {
    assert.deepEqual(contiguousRange(5, 2), { start: 2, end: 5 });
    assert.deepEqual(contiguousRange(3, 3), { start: 3, end: 3 });
});

test('gradeErrorCorrection: fragment match, sentence-equivalence for wider span, empty', () => {
    const item = enrichErrorItem({
        lead: 'If I would be rich, I would travel more.',
        errorFrom: 'would be',
        answer: 'were',
        alts: ['was'],
    });
    assert.equal(gradeErrorCorrection(item, '').status, 'empty');
    assert.equal(gradeErrorCorrection(item, encodeStudentValue({ start: item.errorStart, end: item.errorEnd, fix: 'were' })).status, 'ok');
    assert.equal(gradeErrorCorrection(item, encodeStudentValue({ start: item.errorStart, end: item.errorEnd, fix: 'was' })).status, 'ok');
    // Wider selection that still yields the correct sentence after replacement
    const wide = gradeErrorCorrection(item, encodeStudentValue({
        start: item.errorStart - 1, // "I would be"
        end: item.errorEnd,
        fix: 'I were',
    }));
    assert.equal(wide.status, 'ok');
    assert.equal(gradeErrorCorrection(item, encodeStudentValue({ start: item.errorStart, end: item.errorEnd, fix: 'are' })).status, 'wrong');
    // Legacy plain fragment
    assert.equal(gradeErrorCorrection(item, 'were').status, 'ok');
});

test('buildUoeItem error_correction records errorFrom + fragment answer + indices', () => {
    const it = buildUoeItem('error_correction', {
        lead: 'He have a cat.',
        errorFrom: 'have',
        answer: 'has',
        acceptedAnswers: ['He has a cat.'],
    }, 'A2');
    assert.equal(it.errorFrom, 'have');
    assert.equal(it.answer, 'has');
    assert.ok(Number.isInteger(it.errorStart));
    assert.ok(Number.isInteger(it.errorEnd));
    assert.equal(it.corrected, 'He has a cat.');
});

test('normalize + polecenia mention clicking words (no word box)', () => {
    const kid = uoeInstruction('error_correction', 'A1', { age: 9 });
    assert.match(kid, /Kliknij|wyraz/i);
    assert.doesNotMatch(kid, /ramka|word box|Use these words/i);
    const exam = uoeInstruction('error_correction', 'A2', { age: 14 });
    assert.match(exam, /Kliknij|wyraz/i);

    const lesson = normalizeOwnTimeLesson({
        title: 'E', cefr: 'B2',
        tasks: [
            { type: 'uoe', format: 'error_correction', instruction: 'x', items: [
                { lead: 'If I would be rich, I would travel.', errorFrom: 'would be', answer: 'were' },
                { lead: 'She suggested to go home.', errorFrom: 'to go', answer: 'going' },
            ] },
            { type: 'uoe', format: 'tense_form', instruction: 'x', items: [
                { q: 'She ___ yesterday.', cue: 'go', answer: 'went' },
                { q: 'He ___ now.', cue: 'play', answer: 'is playing' },
            ] },
            { type: 'vocab_drill', instruction: 'Uzupełnij', items: [{ q: 'a', answer: 'b' }] },
            { type: 'reading', instruction: 'Przeczytaj', prompt: 'Tom lives here. He likes parks.', items: [{ q: 'Where does Tom live?', answer: 'here' }] },
            { type: 'writing', instruction: 'Napisz', prompt: 'Write.' },
        ],
    }, { age: 17, cefr: 'B2', instrLang: 'pl', taskPrefs: ['grammar'] });
    const ec = lesson.tasks.find((t) => t.format === 'error_correction');
    assert.ok(ec);
    assert.match(ec.instruction, /Kliknij|wyraz/i);
    assert.equal(ec.items[0].errorFrom, 'would be');
    assert.equal(ec.items[0].answer, 'were');
    assert.ok(ec.items[0].corrected.includes('were'));

    const p = buildOwnTimeLessonPrompt(validateOwnTimeGenerateRequest({
        profile: { cefr: 'B1', age: 15, taskPrefs: ['grammar'], intensity: 'standard', instrLang: 'pl' },
    }).value);
    assert.match(p, /errorFrom/);
    assert.match(p, /replacement fragment/);
});

test('parseStudentValue round-trip', () => {
    const enc = encodeStudentValue({ start: 2, end: 3, fix: 'were' });
    assert.deepEqual(parseStudentValue(enc), { start: 2, end: 3, fix: 'were' });
    assert.equal(parseStudentValue('were').fix, 'were');
});

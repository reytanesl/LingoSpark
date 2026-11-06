import test from 'node:test';
import assert from 'node:assert/strict';
import {
    instructionAudience,
    taskInstruction,
    uoeInstruction,
    instructionToneGuide,
    adaptTaskInstruction,
    normalizeOwnTimeLesson,
    buildOwnTimeLessonPrompt,
    instructionCueRefs,
    dedupeBracketCue,
    applyWordCues,
    sanitizeReadingItems,
} from './own-time-prompts.js';

test('instructionAudience infers age from level and level from age', () => {
    assert.equal(instructionAudience({ cefr: 'A1' }).band, 'kid');
    assert.equal(instructionAudience({ cefr: 'A2' }).band, 'young'); // inferred age 13
    assert.equal(instructionAudience({ age: 14, cefr: 'A2' }).band, 'exam'); // E8 age
    assert.equal(instructionAudience({ age: 17, cefr: 'B2' }).band, 'exam');
    assert.equal(instructionAudience({ age: 20, cefr: 'C1' }).band, 'adult');
    assert.equal(instructionAudience({ age: 10 }).band, 'kid');
    assert.equal(instructionAudience({ age: 22 }).cefr, 'C1');
});

test('polecenia differ for young A1 vs E8-age A2 vs adult C1 (same brackets-like action)', () => {
    const kid = uoeInstruction('brackets', 'A2', { age: 10 });
    const e8 = uoeInstruction('brackets', 'A2', { age: 14 });
    const adult = taskInstruction('writing', { age: 20, cefr: 'C1', instrLang: 'pl' });
    assert.equal(kid, 'Uzupełnij każde zdanie poprawną formą czasownika z nawiasu.');
    assert.match(e8, /Wpisz w każdą lukę wyrazy podane w nawiasach/);
    assert.notEqual(kid, e8);
    assert.match(adult, /5–6 zdań/);
    assert.match(adult, /110–150/);
    assert.ok(kid.length < e8.length, 'kid polecenie shorter than exam');
});

test('kid writing / unscramble stay short; adult writing is more precise', () => {
    const kidW = taskInstruction('writing', { age: 9, cefr: 'A1', instrLang: 'pl' });
    const adultW = taskInstruction('writing', { age: 21, cefr: 'C1', instrLang: 'pl' });
    const kidU = taskInstruction('unscramble', { age: 9, cefr: 'A1', instrLang: 'pl' });
    assert.equal(kidW, 'Napisz 2–3 krótkie zdania.');
    assert.equal(kidU, 'Ułóż słowo z liter.');
    assert.match(adultW, /zgodnie z poleceniem/);
    assert.doesNotMatch(kidW, /rejestr|spójny/);
});

test('normalizeOwnTimeLesson rewrites mismatched UOE / jargon for kids; keeps exam CKE for B2 teens', () => {
    const kid = normalizeOwnTimeLesson({
        cefr: 'A1',
        instrLang: 'pl',
        tasks: [{
            type: 'vocab_drill',
            instruction: 'Przeczytaj tekst. Uzupełnij każdą lukę, przekształcając wyraz podany w nawiasie, tak aby otrzymać logiczny, spójny i poprawny językowo tekst. W każdą lukę możesz wpisać tylko jeden wyraz.',
            items: [{ q: 'cat = ___', answer: 'kot' }, { q: 'dog = ___', answer: 'pies' }],
        }],
    }, { age: 10, cefr: 'A1', instrLang: 'pl' });
    assert.match(kid.tasks[0].instruction, /Uzupełnij każde zdanie|napisz brakujące słowo/i);
    assert.ok(kid.tasks[0].instruction.length < 100);

    const b2 = normalizeOwnTimeLesson({
        cefr: 'B2',
        tasks: [{
            type: 'uoe',
            format: 'word_formation',
            instruction: 'Ułóż słowo z liter.',
            items: [{ q: 'CREATE', answer: 'creation' }, { q: 'HAPPY', answer: 'happiness' }],
        }],
    }, { age: 17, cefr: 'B2', instrLang: 'pl' });
    assert.match(b2.tasks[0].instruction, /przekształcając wyraz podany w nawiasie/);
});

test('adaptTaskInstruction never reintroduces a word box', () => {
    const t = adaptTaskInstruction({
        type: 'vocab_drill',
        instruction: 'Uzupełnij luki wyrazami z ramki. Dwa wyrazy są zbędne.',
        items: [{ q: 'a ___', answer: 'b', cue: 'be' }],
    }, { age: 10, cefr: 'A1', instrLang: 'pl' });
    assert.equal(instructionCueRefs(t.instruction).box, false);
    assert.doesNotMatch(t.instruction, /ramk|box|zbędn|Use these words/i);
});

test('AI prompt includes age+level instruction tone with concrete examples', () => {
    const kid = buildOwnTimeLessonPrompt({
        age: 10, cefr: 'A1', instrLang: 'pl', interests: [], taskPrefs: ['vocab'],
        purpose: '', intensity: 'standard', topic: '', vocab: '', recentFeedback: [],
    });
    assert.match(kid, /INSTRUCTION TONE \(band=kid/);
    assert.match(kid, /Wpisz czasownik z nawiasu w poprawnym czasie|Uzupełnij każde zdanie poprawną formą czasownika z nawiasu/);
    assert.match(kid, /Never reuse one generic instruction/);

    const adult = buildOwnTimeLessonPrompt({
        age: 20, cefr: 'C1', instrLang: 'pl', interests: [], taskPrefs: ['uoe'],
        purpose: '', intensity: 'standard', topic: '', vocab: '', recentFeedback: [],
    });
    assert.match(adult, /INSTRUCTION TONE \(band=adult/);
    assert.match(adult, /dokładnie jednym wyrazem|utworzonym od formy/);
});

test('English instructions also follow the band', () => {
    assert.equal(
        taskInstruction('unscramble', { age: 9, cefr: 'A1', instrLang: 'en' }),
        'Build the word from the letters.',
    );
    assert.match(
        taskInstruction('reading', { age: 20, cefr: 'C1', instrLang: 'en' }),
        /carefully|concisely/i,
    );
});

import './answer-check.js';
const AC = globalThis.AnswerCheck;

test('gap items keep at most one bracket cue (no ___ (go) plus cue go)', () => {
    const raw = dedupeBracketCue({ q: 'She ___ (go) to school.', cue: 'go', answer: 'goes' });
    assert.equal(raw.q, 'She ___ to school.');
    assert.equal(raw.cue, 'go');
    assert.equal(raw._bracketPairsNearGap, 0);
    const dup = dedupeBracketCue({ q: 'They ___ (play) outside (play).', cue: 'play', answer: 'played' });
    assert.doesNotMatch(dup.q, /\(play\)/i);
    const task = applyWordCues({
        type: 'uoe', format: 'brackets', instruction: 'Uzupełnij',
        items: [
            { q: 'He ___ (be) tired.', cue: 'be', answer: 'is' },
            { q: 'We ___ (go) home.', answer: 'went' },
        ],
    }, { tier: 0, age: 14, cefr: 'A2', lang: 'pl' });
    for (const it of task.items) {
        assert.doesNotMatch(it.q, /\([^)]+\)/);
        assert.ok(it.cue, it.q);
    }
});

test('sanitizeReadingItems keeps well-posed grounded questions and drops bad ones', () => {
    const text = 'Maya works in a library in Kraków. On Saturdays she reads stories to children. Her favourite book is about dragons.';
    const kept = sanitizeReadingItems(text, [
        { q: 'Where does Maya work?', answer: 'library' },
        { q: 'What does she do on Saturdays?', answer: 'reads stories' },
        { q: 'What colour is her car?', answer: 'blue' },
        { q: 'Tell something', answer: 'dragons' },
        { q: 'Who lives on the moon?', answer: 'Maya' },
    ]);
    assert.ok(kept.some((x) => /Where does Maya/i.test(x.q)));
    assert.ok(kept.some((x) => /Saturdays/i.test(x.q)));
    assert.ok(!kept.some((x) => /colour|car|Tell something|moon/i.test(x.q)));
    const lesson = normalizeOwnTimeLesson({
        cefr: 'A2', instrLang: 'pl',
        tasks: [{ type: 'reading', prompt: text, instruction: 'Przeczytaj', items: [
            { q: 'Where does Maya work?', answer: 'in a library' },
            { q: 'What is her favourite book about?', answer: 'dragons' },
            { q: 'How old is the bus?', answer: 'twelve' },
        ] }],
    }, { age: 13, cefr: 'A2' });
    const reading = lesson.tasks.find((t) => t.type === 'reading');
    assert.ok(reading);
    assert.ok(reading.items.every((it) => /\?$|_{3,}/.test(it.q) || /^(Where|What|Who|When|Why|How)/i.test(it.q)));
    assert.ok(!reading.items.some((it) => /bus/i.test(it.q)));
});

test('Zweryfikuj prompt is context-aware and mock accepts contextual equivalents', () => {
    const prompt = AC.buildOpenCheckPrompt({
        format: 'brackets', cefr: 'A2', prompt: 'Yesterday Anna ___ very happy.',
        items: [{ i: 0, q: 'Yesterday Anna ___ very happy.', answer: 'was', accepted: ['felt'], given: 'felt' }],
    });
    assert.match(prompt, /CONTEXT|fits the sentence|synonyms|context-fitting/i);
    const m = AC.mockOpenCheck([
        { i: 0, q: '___ the rain, we went out.', answer: 'Despite', accepted: [], given: 'In spite of' },
        { i: 1, q: 'She was ___ to see him.', answer: 'happy', accepted: [], given: 'glad' },
        { i: 2, q: 'The cat sat on the ___ .', answer: 'mat', accepted: [], given: 'elephant' },
    ], 'simple');
    assert.equal(m[0].correct, true);
    assert.equal(m[1].correct, true);
    assert.equal(m[2].correct, false);
});

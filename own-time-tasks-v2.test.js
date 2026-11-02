import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeOwnTimeLesson, ensureOpenCloze, OPEN_CLOZE_MIN, enforceFormChange, enforceUniqueCues, applyWordCues,
    alignInstructionWithBox, instructionCueRefs, buildOwnTimeLessonPrompt, validateOwnTimeGenerateRequest,
} from './own-time-prompts.js';
import * as F from './own-time-fixtures.js';

const ALL = [
    ['A1', F.OWN_TIME_MOCK_LOW_REPLY], ['A2', F.OWN_TIME_MOCK_REPLY], ['A2', F.OWN_TIME_MOCK_EXTRA_REPLY],
    ['B1', F.OWN_TIME_MOCK_B1_REPLY], ['B2', F.OWN_TIME_MOCK_B2_REPLY], ['C1', F.OWN_TIME_MOCK_C1_REPLY],
];
const INTENSITIES = ['light', 'standard', 'stretch'];
const lessons = () => ALL.flatMap(([cefr, reply]) => INTENSITIES.map((intensity) => [cefr, intensity, normalizeOwnTimeLesson(reply, { cefr, instrLang: 'pl', intensity, age: 16 })]));
const cueKey = (it) => String(it.cue || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

/* 1. open cloze share */
test('open cloze minimum: B2 ≥ 1, C1 ≥ 2 per lesson (every difficulty incl. Wyzwanie)', () => {
    assert.deepEqual(OPEN_CLOZE_MIN, { B2: 1, C1: 2 });
    for (const [cefr, intensity, L] of lessons()) {
        const n = L.tasks.filter((t) => t.format === 'open_cloze').length;
        assert.ok(n >= (OPEN_CLOZE_MIN[cefr] || 0), `${cefr} ${intensity}: ${n}`);
        assert.equal(L.openClozeShort, undefined);
    }
});

test('ensureOpenCloze converts single-word mc_text into open cloze, else reports the shortfall', () => {
    const mc = { type: 'uoe', format: 'mc_text', instruction: 'x', prompt: 'A {{1}} b {{2}}.', items: [{ q: '', answer: 'of', options: ['of', 'in', 'at', 'on'] }, { q: '', answer: 'the', options: ['the', 'a', 'an', 'some'] }] };
    const r = ensureOpenCloze([mc, { ...mc, format: 'open_cloze' }], 'C1');
    assert.equal(r.openClozeShort, 0);
    assert.ok(r.tasks.every((t) => t.format === 'open_cloze'));
    assert.ok(r.tasks[0].items.every((it) => !it.options));
    const multi = { ...mc, items: [{ q: '', answer: 'in spite', options: ['in spite', 'a', 'b', 'c'] }] };
    assert.equal(ensureOpenCloze([multi], 'C1').openClozeShort, 2);
    assert.equal(ensureOpenCloze([multi], 'B1').openClozeShort, 0);
    assert.equal(ensureOpenCloze([{ type: 'writing', items: [] }], 'C1').openClozeShort, 0, 'no Use of English in lesson → nothing to enforce');
});

test('prompt asks for open cloze at B2 / C1', () => {
    const p = (cefr) => buildOwnTimeLessonPrompt(validateOwnTimeGenerateRequest({ profile: { age: 17, cefr, taskPrefs: ['uoe', 'vocab'], intensity: 'stretch', instrLang: 'pl' }, topic: 'x' }).value);
    const txt = (x) => (typeof x === 'string' ? x : JSON.stringify(x));
    assert.match(txt(p('B2')), /one of them MUST be "open_cloze"/);
    assert.match(txt(p('C1')), /At least 2 of them MUST be "open_cloze"/);
});

/* 2. word formation always changes form */
test('word formation: an item whose answer equals its cue (any case) is dropped, even if it leaves one item', () => {
    const wf = { type: 'uoe', format: 'word_formation', instruction: 'x', prompt: 'It was {{1}}. She was {{2}}.', items: [{ q: '', cue: 'HAPPY', answer: 'happy' }, { q: '', cue: 'KIND', answer: 'kindness' }] };
    const t = enforceFormChange(wf);
    assert.equal(t.items.length, 1);
    assert.equal(t.prompt, 'It was happy. She was {{1}}.');
    const allBad = normalizeOwnTimeLesson({ cefr: 'B2', tasks: [{ type: 'uoe', format: 'word_formation', prompt: 'A {{1}}.', items: [{ cue: 'Popular', answer: 'popular' }] }] }, { cefr: 'B2' });
    assert.ok(!allBad.tasks.some((x) => x.format === 'word_formation'), 'never shown as-is');
});

test('no word-formation item in any sample lesson repeats its cue unchanged', () => {
    for (const [, , L] of lessons()) for (const t of L.tasks.filter((x) => x.format === 'word_formation')) {
        for (const it of t.items) assert.notEqual(cueKey(it), String(it.answer).toLowerCase());
    }
});

/* 3. unique bracket cues */
test('repeated bracket cues inside a task: later gaps are dropped (item.cue and "___ (cue)")', () => {
    const t = enforceUniqueCues({ type: 'vocab_drill', instruction: 'x', items: [
        { q: 'I ___ (go) home.', answer: 'went' }, { q: 'We ___ (Go) out.', answer: 'are going' }, { q: 'He ___.', cue: 'play', answer: 'plays' }, { q: 'They ___.', cue: 'PLAY', answer: 'played' }] });
    assert.deepEqual(t.items.map((i) => i.answer), ['went', 'plays']);
    assert.equal(t.duplicateCuesDropped, 2);
    const wf = enforceUniqueCues({ type: 'uoe', format: 'word_formation', prompt: '{{1}} {{2}} {{3}}', items: [{ q: '', cue: 'X', answer: 'a' }, { q: '', cue: 'Y', answer: 'b' }, { q: '', cue: 'x', answer: 'c' }] });
    assert.equal(wf.prompt, '{{1}} {{2}} c');
});

test('every sample lesson has unique cues per task (fixture B2 had a duplicate FLEXIBLE)', () => {
    for (const [cefr, , L] of lessons()) for (const t of L.tasks) {
        if (t.format === 'transformation') continue;
        const keys = t.items.map(cueKey).filter(Boolean);
        assert.equal(new Set(keys).size, keys.length, `${cefr} ${t.format || t.type}`);
    }
    const b2 = normalizeOwnTimeLesson(F.OWN_TIME_MOCK_B2_REPLY, { cefr: 'B2' });
    assert.equal(b2.tasks.find((t) => t.format === 'word_formation').items.length, 4);
});

/* 4. box size = what the instruction says */
const consistent = (t, label = '') => {
    const r = instructionCueRefs(t.instruction);
    const hasBox = Array.isArray(t.wordBank) && t.wordBank.length > 0;
    assert.equal(r.box, hasBox, `box ref ${label}: ${t.instruction}`);
    if (!hasBox) { assert.equal(r.total, null, label); assert.equal(r.extra, null, label); return; }
    assert.equal(r.extra ?? 0, t.boxExtra || 0, `extras ${label}: ${t.instruction}`);
    if (r.total != null) assert.equal(r.total, t.wordBank.length, `total ${label}: ${t.instruction}`);
    const answers = t.items.length;
    assert.equal(t.wordBank.length, answers + (t.boxExtra || 0), `box size ${label}`);
};

test('all sample lessons × difficulties: box size matches the instruction', () => {
    for (const [cefr, intensity, L] of lessons()) for (const t of L.tasks) if (['vocab_drill', 'uoe'].includes(t.type)) consistent(t, `${cefr}/${intensity}/${t.format || t.type}`);
});

const three = [{ q: 'I ___ ok.', answer: 'am' }, { q: 'We ___ ok.', answer: 'are' }, { q: 'She ___ ok.', answer: 'is' }];
const SYN = [
    ['Use 4 of the 7 words in the box to complete the sentences.', ['am', 'are', 'is', 'be', 'was', 'been', 'being']],
    ['Complete the sentences with words from the box. There are two extra words.', ['am', 'are', 'is', 'be', 'was', 'were']],
    ['The box has eight words. Complete the gaps.', ['am', 'are', 'is', 'be']],
    ['There are 5 words in the box. One word is not needed.', ['am', 'are', 'is']],
    ['Complete the text with words from the box. You do not need two of the words.', ['am', 'are', 'is', 'be', 'was']],
    ['Uzupełnij zdania wyrazami z ramki. Dwa wyrazy są zbędne.', ['am', 'are', 'is', 'be']],
    ['Uzupełnij zdania. W ramce jest sześć wyrazów, trzy są dodatkowe.', ['am', 'are', 'is', 'be', 'was', 'were']],
    ['Wykorzystaj 3 z 6 wyrazów z ramki.', ['am', 'are', 'is', 'be']],
    ['Ramka zawiera 7 wyrazów. Wpisz w luki wyrazy z ramki.', ['am', 'are', 'is', 'was']],
    ['Uzupełnij luki. W ramce podano dodatkowe wyrazy, które nie pasują do żadnej luki.', ['am', 'are', 'is']],
    ['Uzupełnij zdania. W ramce jest pięć wyrazów.', null],
    ['Complete the sentences.', ['am', 'are', 'is', 'be', 'was', 'were', 'been', 'being']],
];
test('synthetic instruction phrasings (PL + EN, totals and extras) at every tier', () => {
    for (const [instruction, wordBank] of SYN) for (const tier of [0, 1, 2, 3]) {
        const t = applyWordCues({ type: 'vocab_drill', instruction, items: three, ...(wordBank ? { wordBank } : {}) }, { tier });
        consistent(t, `t${tier} "${instruction}"`);
    }
});

test('no box → instruction mentions neither the box, its size nor extra words', () => {
    const t = alignInstructionWithBox({ type: 'uoe', format: 'open_cloze', instruction: 'Complete the text. There are 6 words in the box. Two words are extra.', items: three });
    assert.equal(t.instruction, 'Complete the text.');
});

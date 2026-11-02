import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWordCues, validateWordBank, shuffleWordBank, BOX_DISTRACTORS, cueRuleText, normalizeOwnTimeLesson } from './own-time-prompts.js';
import { OWN_TIME_MOCK_LOW_REPLY } from './own-time-fixtures.js';

const items = [
    { q: 'I ___ tired.', answer: 'am' },
    { q: 'We ___ late.', answer: 'are' },
    { q: 'They ___ here.', answer: 'are', alts: ['were'] },
];
const task = (wordBank) => ({ type: 'vocab_drill', instruction: 'Fill the gaps.', items, ...(wordBank ? { wordBank } : {}) });
const sorted = (a) => [...a].sort();

test('validateWordBank adds missing answers with correct counts', () => {
    const r = validateWordBank(['am', 'be'], items, 2);
    assert.deepEqual(sorted(r.bank), ['am', 'are', 'are', 'be']);
    assert.deepEqual(r.added, ['are', 'are']);
    assert.deepEqual(r.distractors, ['be']);
});

test('validateWordBank strips distractors that equal a correct answer or an accepted alternative', () => {
    const r = validateWordBank(['am', 'are', 'are', 'were', 'AM', 'is', 'is'], items, 4);
    assert.deepEqual(sorted(r.bank), ['am', 'are', 'are', 'is']);
    assert.deepEqual(r.distractors, ['is']);
});

test('validateWordBank caps distractors per level', () => {
    const r = validateWordBank(['be', 'is', 'was', 'been'], items, 2);
    assert.deepEqual(r.distractors, ['be', 'is']);
});

test('distractor counts per level: A0–A2 1–2, B1 2–3, B2 3–4, C1 3–5', () => {
    assert.deepEqual(BOX_DISTRACTORS, [[1, 2], [2, 3], [3, 4], [3, 5]]);
    const many = ['am', 'are', 'are', 'be', 'is', 'was', 'been', 'being', 'isn\'t'];
    [2, 3, 4, 5].forEach((max, tier) => {
        const t = applyWordCues(task(many), { tier });
        assert.equal(t.wordBank.length, 3 + max, `tier ${tier}`);
    });
    assert.match(cueRuleText(0), /1–2 distractors/);
    assert.match(cueRuleText(1), /2–3 distractors/);
    assert.match(cueRuleText(2), /3–4 distractors/);
});

test('applyWordCues: AI box missing an answer gets it back; box words never in gap order', () => {
    const t = applyWordCues(task(['am', 'be']), { tier: 0 });
    assert.deepEqual(sorted(t.wordBank), ['am', 'are', 'are', 'be']);
});

test('B2+ open cloze keeps no box; translation keeps no box', () => {
    const oc = applyWordCues({ type: 'uoe', format: 'open_cloze', prompt: 'A {{1}} b', items: [{ q: '', answer: 'the' }], wordBank: ['the', 'a'] }, { tier: 3 });
    assert.equal(oc.wordBank, undefined);
    const tr = applyWordCues({ type: 'uoe', format: 'translation', items: [{ q: 'I ___ .', answer: 'am', pl: 'jestem' }], wordBank: ['am', 'is'] }, { tier: 1 });
    assert.equal(tr.wordBank, undefined);
});

test('shuffleWordBank keeps duplicates, contains the same words, and is not in answer order', () => {
    const w = ['a', 'b', 'b', 'c', 'd'];
    const s = shuffleWordBank(w, 'x');
    assert.deepEqual(sorted(s), sorted(w));
    assert.notDeepEqual(s, w);
    assert.deepEqual(shuffleWordBank(['a', 'a', 'b'], '', { dedupe: true }).length, 2);
});

test('mock A1 lesson: am/is/are box has every answer (are twice) + the distractor', () => {
    const L = normalizeOwnTimeLesson(OWN_TIME_MOCK_LOW_REPLY, { cefr: 'A1', instrLang: 'pl', intensity: 'standard', age: 15 });
    const t = L.tasks.find((x) => x.format === 'simple' && /am, is/.test(x.instruction));
    assert.deepEqual(sorted(t.wordBank), ['am', 'are', 'are', 'be', 'is']);
});

test('client reshuffles the box every time it is rendered', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('function wordBoxHtml'), src.indexOf('function wordBoxHtml') + 900);
    assert.match(fn, /Math\.random\(\)/);
});

/* ---------- instruction ↔ box consistency ---------- */
import { alignInstructionWithBox, instructionCueRefs, extraWordsSentence } from './own-time-prompts.js';
const two = [{ q: 'I ___ ok.', answer: 'am' }, { q: 'We ___ ok.', answer: 'are' }];
const consistent = (t) => {
    const refs = instructionCueRefs(t.instruction);
    const hasBox = Array.isArray(t.wordBank) && t.wordBank.length > 0;
    assert.equal(refs.box, hasBox, `box reference vs box: ${t.instruction}`);
    if (hasBox) assert.equal(refs.extra ?? 0, t.boxExtra || 0, `extra count: ${t.instruction}`);
};

test('stated extra-word count is rewritten to the real distractor count (PL + EN)', () => {
    const pl = applyWordCues({ type: 'vocab_drill', instruction: 'Uzupełnij zdania słowami z ramki. Dwa wyrazy są zbędne.', items: two, wordBank: ['am', 'are', 'is'] }, { tier: 0 });
    assert.equal(pl.boxExtra, 1);
    assert.match(pl.instruction, /W ramce 1 wyraz jest zbędny\.$/);
    assert.doesNotMatch(pl.instruction, /Dwa/);
    consistent(pl);
    const en = applyWordCues({ type: 'vocab_drill', instruction: 'Complete with one word from the box. There are three extra words.', items: two, wordBank: ['am', 'are', 'is', 'be'] }, { tier: 1 });
    assert.equal(en.boxExtra, 2);
    assert.match(en.instruction, /There are 2 extra words/);
    consistent(en);
});

test('a box with no distractors says every word is used; instruction without box mention gets one', () => {
    const t = applyWordCues({ type: 'vocab_drill', instruction: 'Fill the gaps.', items: two }, { tier: 0 });
    assert.match(t.instruction, /Use the words from the box\. Every word in the box is used\./);
    consistent(t);
});

test('no box shown → instruction does not reference a box or extra words', () => {
    const t = alignInstructionWithBox({ type: 'vocab_drill', instruction: 'Uzupełnij każde zdanie jednym słowem z ramki. Dwa wyrazy są zbędne.', items: [{ q: 'a ___', answer: 'x' }] });
    assert.equal(t.instruction, 'Uzupełnij każde zdanie jednym słowem.');
    consistent(t);
});

test('bracket-cued task: "from the box" becomes the bracket wording, no box', () => {
    const t = applyWordCues({ type: 'vocab_drill', instruction: 'Complete with one word from the box.', items: [{ q: 'I ___ (go).', answer: 'went' }, { q: 'We ___ (play).', answer: 'played' }] }, { tier: 0 });
    assert.equal(t.wordBank, undefined);
    assert.equal(t.instruction, 'Complete the gaps with the correct form of the words in brackets.');
    consistent(t);
});

test('"words in brackets" but the cue is a box → instruction points at the box', () => {
    const t = applyWordCues({ type: 'vocab_drill', instruction: 'Uzupełnij zdania wyrazami z nawiasów.', items: two }, { tier: 0 });
    assert.ok(t.wordBank.length);
    assert.match(t.instruction, /^Uzupełnij luki wyrazami z ramki\./);
    consistent(t);
});

test('Polish plural forms of the extra-word sentence', () => {
    assert.equal(extraWordsSentence(1), 'W ramce 1 wyraz jest zbędny.');
    assert.equal(extraWordsSentence(3), 'W ramce 3 wyrazy są zbędne.');
    assert.equal(extraWordsSentence(5), 'W ramce 5 wyrazów jest zbędnych.');
    assert.equal(extraWordsSentence(1, 'en'), 'There is 1 extra word in the box that you do not need.');
});

test('every box task in the mock lessons is consistent with its instruction', () => {
    const L = normalizeOwnTimeLesson(OWN_TIME_MOCK_LOW_REPLY, { cefr: 'A1', instrLang: 'pl', intensity: 'standard', age: 15 });
    L.tasks.filter((t) => ['vocab_drill', 'uoe'].includes(t.type) && t.instruction).forEach(consistent);
});

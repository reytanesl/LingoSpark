import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeOwnTimeLesson, applyWordCues, needsWordCue, shuffleWordBank, isVerbFormTask,
    buildCueRepairPrompt, cueTier, cueRuleText, applyCueRepair, publicOwnTimeLesson, buildOwnTimeLessonPrompt, validateOwnTimeGenerateRequest,
} from './own-time-prompts.js';
import { OWN_TIME_MOCK_REPLY, OWN_TIME_MOCK_EXTRA_REPLY, OWN_TIME_MOCK_LOW_REPLY, OWN_TIME_MOCK_B1_REPLY, OWN_TIME_MOCK_B2_REPLY, OWN_TIME_MOCK_C1_REPLY } from './own-time-fixtures.js';

const gapTask = (extra = {}) => ({ type: 'vocab_drill', instruction: 'Uzupełnij zdania.', items: [
    { q: 'I ___ a shop assistant.', answer: 'am', alts: [] },
    { q: 'They ___ at work.', answer: 'are', alts: [] },
    { q: 'She ___ tired.', answer: 'is', alts: [] }], ...extra });

test('gap-fill without cues gets a shuffled word box containing every answer', () => {
    const t = applyWordCues(gapTask());
    assert.deepEqual([...t.wordBank].sort(), ['am', 'are', 'is']);
    assert.notDeepEqual(t.wordBank, ['am', 'are', 'is']);
    assert.equal(t.autoWordBank, true);
    assert.equal(t.needsCueRepair, undefined);
});

test('AI word box is kept and completed with missing answers', () => {
    const t = applyWordCues(gapTask({ wordBank: ['am', 'is', 'were'] }), { tier: 1 });
    assert.deepEqual([...t.wordBank].sort(), ['am', 'are', 'is', 'were']);
    assert.equal(t.autoWordBank, undefined);
});

test('bracket cue after the gap becomes item.cue; fully cued tasks get no box', () => {
    const t = applyWordCues({ type: 'vocab_drill', instruction: 'Complete each sentence with the correct verb form.', items: [
        { q: 'She ___ (go) home.', answer: 'went' }, { q: 'We ___ (play) now.', answer: 'are playing', cue: 'play' }] });
    assert.equal(t.items[0].q, 'She ___ home.');
    assert.equal(t.items[0].cue, 'go');
    assert.equal(t.wordBank, undefined);
});

test('a cue equal to the answer is dropped (it would reveal it)', () => {
    const t = applyWordCues({ type: 'vocab_drill', instruction: 'x', items: [{ q: 'A ___ b.', answer: 'cat', cue: 'cat' }, { q: 'C ___ d.', answer: 'dog' }] });
    assert.ok(t.items.every((it) => !it.cue));
    assert.deepEqual([...t.wordBank].sort(), ['cat', 'dog']);
});

test('verb-form task without cues: box fallback + repair request; repair replaces box with base-form cues', () => {
    const t = applyWordCues({ type: 'vocab_drill', instruction: 'Complete each sentence with the correct verb form.', items: [
        { q: 'She ___ to school.', answer: 'went' }, { q: 'They ___ football now.', answer: 'are playing' }] });
    assert.ok(t.wordBank.length === 2 && t.needsCueRepair);
    assert.ok(isVerbFormTask(t));
    const lesson = { tasks: [t] };
    assert.match(buildCueRepairPrompt(lesson), /BASE form/);
    const fixed = applyCueRepair(lesson, { tasks: [{ task: 1, cues: ['go', 'play'] }] });
    assert.deepEqual(fixed.tasks[0].items.map((i) => i.cue), ['go', 'play']);
    assert.equal(fixed.tasks[0].wordBank, undefined);
    const bad = applyCueRepair(lesson, { tasks: [{ task: 1, cues: ['went'] }] });
    assert.ok(bad.tasks[0].wordBank, 'box kept when repair is incomplete');
    assert.equal(publicOwnTimeLesson(bad).tasks[0].needsCueRepair, undefined);
});

test('verb-form task with some cues drops the cue-less items when 2+ cued remain', () => {
    const t = applyWordCues({ type: 'uoe', format: 'brackets', instruction: 'x', items: [
        { q: 'A ___ b.', answer: 'went', cue: 'go' }, { q: 'C ___ d.', answer: 'saw', cue: 'see' }, { q: 'E ___ f.', answer: 'ate' }] });
    assert.equal(t.items.length, 2);
    assert.equal(t.wordBank, undefined);
});

test('translation, options, transformation and tile tasks are exempt', () => {
    assert.equal(needsWordCue({ type: 'uoe', format: 'translation', items: [{ q: 'I ___ you.', pl: 'kocham', answer: 'love' }] }), false);
    assert.equal(needsWordCue({ type: 'uoe', format: 'mc_sentences', items: [{ q: 'I ___.', options: ['a', 'b', 'c'], answer: 'a' }] }), false);
    assert.equal(needsWordCue({ type: 'vocab_drill', instruction: 'Przetłumacz zdania.', items: [{ q: 'I ___ (kocham) you.', answer: 'love' }] }), false);
    assert.equal(needsWordCue({ type: 'word_order', items: [{ answer: 'I am here.' }] }), false);
    assert.equal(needsWordCue({ type: 'vocab_drill', items: [{ q: 'a person who sells', answer: 'seller' }] }), false);
});

test('every gap-fill task in every mock lesson has a cue (box or bracket per gap)', () => {
    for (const reply of [OWN_TIME_MOCK_REPLY, OWN_TIME_MOCK_EXTRA_REPLY, OWN_TIME_MOCK_LOW_REPLY, OWN_TIME_MOCK_B1_REPLY, OWN_TIME_MOCK_B2_REPLY, OWN_TIME_MOCK_C1_REPLY]) {
        const l = normalizeOwnTimeLesson(reply, { cefr: reply.cefr, instrLang: 'pl' });
        const tier = cueTier({ cefr: reply.cefr });
        for (const t of l.tasks.filter(needsWordCue).filter((x) => !(tier >= 2 && x.format === 'open_cloze') && !(tier >= 3 && x.format === 'lexical_set'))) {
            const textGaps = /\{\{\s*\d+\s*\}\}/.test(t.prompt);
            const ok = (t.wordBank || []).length || t.items.every((it) => it.cue || (textGaps && it.q && it.q.length <= 24));
            assert.ok(ok, `${reply.title} / ${t.instruction}`);
        }
    }
    const extra = normalizeOwnTimeLesson(OWN_TIME_MOCK_EXTRA_REPLY, { cefr: 'A2', instrLang: 'pl' });
    assert.ok(extra.tasks.some((t) => t.wordBank?.length && !t.autoWordBank), 'mock has an AI word box');
    assert.ok(extra.tasks.some((t) => t.items.length && t.items.every((i) => i.cue)), 'mock has a verb-form task with bracket cues');
});

test('shuffle is stable and never in answer order', () => {
    const a = shuffleWordBank(['x', 'y'], 's');
    assert.deepEqual(a, shuffleWordBank(['x', 'y'], 's'));
    assert.deepEqual(a, ['y', 'x']);
});

test('prompt requires a word cue for every gap-fill and exempts translation', () => {
    const p = buildOwnTimeLessonPrompt(validateOwnTimeGenerateRequest({ profile: { age: 13, cefr: 'A2', taskPrefs: ['vocab', 'uoe'], instrLang: 'pl' }, topic: 'work' }).value);
    assert.match(p, /WORD CUE \(mandatory for EVERY gap-fill/);
    assert.match(p, /BASE verb/);
    assert.match(p, /Do NOT add a box or cue to translation tasks/);
});

test('cue tier rises with level; difficulty shifts it one step; young learners get most help', () => {
    assert.deepEqual(['A0', 'A1', 'A2', 'B1', 'B2', 'C1'].map((cefr) => cueTier({ cefr })), [0, 0, 0, 1, 2, 3]);
    assert.equal(cueTier({ cefr: 'B1', intensity: 'light' }), 0);
    assert.equal(cueTier({ cefr: 'B1', intensity: 'stretch' }), 2);
    assert.equal(cueTier({ cefr: 'C1', intensity: 'stretch' }), 3);
    assert.equal(cueTier({ cefr: 'A1', intensity: 'light' }), 0);
    assert.equal(cueTier({ cefr: 'B2', age: 10 }), 0);
});

const boxTask = () => ({ type: 'vocab_drill', instruction: 'Uzupełnij.', wordBank: ['am', 'is', 'are', 'was', 'were', 'be', 'been'], items: [
    { q: 'I ___ ok.', answer: 'am' }, { q: 'He ___ ok.', answer: 'is' }, { q: 'We ___ ok.', answer: 'are' }] });

test('distractors in the box are capped per tier: 0 / 2 / 4 / 4', () => {
    assert.deepEqual([0, 1, 2, 3].map((tier) => applyWordCues(boxTask(), { tier }).wordBank.length), [3, 5, 7, 7]);
    assert.deepEqual([...applyWordCues(boxTask(), { tier: 0 }).wordBank].sort(), ['am', 'are', 'is']);
});

test('open cloze: box at A2/B1, no box/cues from B2; lexical sets exam-style (no cue) at C1 only', () => {
    const oc = { type: 'uoe', format: 'open_cloze', instruction: 'x', prompt: 'A {{1}} b {{2}}.', items: [{ q: '', answer: 'the' }, { q: '', answer: 'of' }], wordBank: ['the', 'of'] };
    assert.ok(applyWordCues(oc, { tier: 0 }).wordBank);
    assert.ok(applyWordCues(oc, { tier: 1 }).wordBank);
    assert.equal(applyWordCues(oc, { tier: 2 }).wordBank, undefined);
    const ls = { type: 'uoe', format: 'lexical_set', instruction: 'x', items: [{ q: 'a ___ b ___ c ___', answer: 'run' }, { q: 'd ___ e ___ f ___', answer: 'set' }] };
    assert.ok(applyWordCues(ls, { tier: 2 }).wordBank);
    assert.equal(applyWordCues(ls, { tier: 3 }).wordBank, undefined);
    const wf = { type: 'uoe', format: 'word_formation', instruction: 'x', prompt: 'A {{1}}.', items: [{ q: '', cue: 'CREATE', answer: 'creative' }] };
    assert.equal(applyWordCues(wf, { tier: 3 }).items[0].cue, 'CREATE');
});

test('normaliser uses lesson level + profile difficulty; prompt has the tier rule', () => {
    const c1 = normalizeOwnTimeLesson(OWN_TIME_MOCK_C1_REPLY, { cefr: 'C1', instrLang: 'pl', intensity: 'standard' });
    assert.ok(c1.tasks.filter((t) => ['open_cloze', 'lexical_set'].includes(t.format)).every((t) => !t.wordBank));
    const c1easy = normalizeOwnTimeLesson(OWN_TIME_MOCK_C1_REPLY, { cefr: 'C1', instrLang: 'pl', intensity: 'light' });
    assert.ok(c1easy.tasks.find((t) => t.format === 'lexical_set').wordBank);
    assert.match(cueRuleText(0), /EXACTLY the answer words/);
    assert.match(cueRuleText(3), /NO box and NO cues/);
    const p = buildOwnTimeLessonPrompt(validateOwnTimeGenerateRequest({ profile: { age: 17, cefr: 'C1', taskPrefs: ['uoe'], instrLang: 'pl', intensity: 'standard' }, topic: 'x' }).value);
    assert.match(p, /LEVEL CUES \(C1 exam format\)/);
});

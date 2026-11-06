import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeOwnTimeLesson, applyWordCues, needsWordCue, shuffleWordBank, isVerbFormTask,
    buildCueRepairPrompt, cueTier, cueRuleText, applyCueRepair, applyLocalCueRepair, guessBaseCue, publicOwnTimeLesson, buildOwnTimeLessonPrompt, validateOwnTimeGenerateRequest,
} from './own-time-prompts.js';
import { OWN_TIME_MOCK_REPLY, OWN_TIME_MOCK_EXTRA_REPLY, OWN_TIME_MOCK_LOW_REPLY, OWN_TIME_MOCK_B1_REPLY, OWN_TIME_MOCK_B2_REPLY, OWN_TIME_MOCK_C1_REPLY } from './own-time-fixtures.js';

const gapTask = (extra = {}) => ({ type: 'vocab_drill', instruction: 'Uzupełnij zdania.', items: [
    { q: 'I ___ a shop assistant.', answer: 'am', alts: [] },
    { q: 'They ___ at work.', answer: 'are', alts: [] },
    { q: 'She ___ tired.', answer: 'is', alts: [] }], ...extra });

test('gap-fill without cues stays open cloze — no word box', () => {
    const t = applyWordCues(gapTask({ wordBank: ['am', 'is', 'are', 'be'] }));
    assert.equal(t.wordBank, undefined);
    assert.equal(t.autoWordBank, undefined);
    assert.equal(t.needsCueRepair, undefined);
});

test('bracket cue after the gap becomes item.cue; no box', () => {
    const t = applyWordCues({ type: 'vocab_drill', instruction: 'Complete each sentence with the correct verb form.', items: [
        { q: 'She ___ (go) home.', answer: 'went' }, { q: 'We ___ (play) now.', answer: 'are playing', cue: 'play' }] });
    assert.equal(t.items[0].q, 'She ___ home.');
    assert.equal(t.items[0].cue, 'go');
    assert.equal(t.wordBank, undefined);
});

test('a cue equal to the answer is dropped (it would reveal it); still no box', () => {
    const t = applyWordCues({ type: 'vocab_drill', instruction: 'x', items: [{ q: 'A ___ b.', answer: 'cat', cue: 'cat' }, { q: 'C ___ d.', answer: 'dog' }] });
    assert.ok(t.items.every((it) => !it.cue));
    assert.equal(t.wordBank, undefined);
});

test('verb-form task without cues: repair request, never a box', () => {
    const t = applyWordCues({ type: 'vocab_drill', instruction: 'Complete each sentence with the correct verb form.', items: [
        { q: 'She ___ to school.', answer: 'went' }, { q: 'They ___ football now.', answer: 'are playing' }] });
    assert.equal(t.wordBank, undefined);
    assert.ok(t.needsCueRepair);
    assert.ok(isVerbFormTask(t));
    const lesson = { tasks: [t] };
    assert.match(buildCueRepairPrompt(lesson), /BASE form/);
    const fixed = applyCueRepair(lesson, { tasks: [{ task: 1, cues: ['go', 'play'] }] });
    assert.deepEqual(fixed.tasks[0].items.map((i) => i.cue), ['go', 'play']);
    assert.equal(fixed.tasks[0].wordBank, undefined);
    const bad = applyCueRepair(lesson, { tasks: [{ task: 1, cues: ['went'] }] });
    assert.equal(bad.tasks[0].wordBank, undefined, 'no box when repair is incomplete');
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

test('mock lessons never keep a wordBank; bracket-cued tasks keep cues', () => {
    for (const reply of [OWN_TIME_MOCK_REPLY, OWN_TIME_MOCK_EXTRA_REPLY, OWN_TIME_MOCK_LOW_REPLY, OWN_TIME_MOCK_B1_REPLY, OWN_TIME_MOCK_B2_REPLY, OWN_TIME_MOCK_C1_REPLY]) {
        const l = normalizeOwnTimeLesson(reply, { cefr: reply.cefr, instrLang: 'pl' });
        for (const t of l.tasks) {
            assert.equal(t.wordBank, undefined, `${reply.title}: ${t.instruction}`);
        }
    }
    const extra = normalizeOwnTimeLesson(OWN_TIME_MOCK_EXTRA_REPLY, { cefr: 'A2', instrLang: 'pl' });
    assert.ok(extra.tasks.some((t) => t.items.length && t.items.every((i) => i.cue)), 'mock has a verb-form task with bracket cues');
});

test('shuffle helper still works for other callers', () => {
    const a = shuffleWordBank(['x', 'y'], 's');
    assert.deepEqual(a, shuffleWordBank(['x', 'y'], 's'));
    assert.deepEqual(a, ['y', 'x']);
});

test('prompt forbids word boxes and still requires form-change cues', () => {
    const p = buildOwnTimeLessonPrompt(validateOwnTimeGenerateRequest({ profile: { age: 13, cefr: 'A2', taskPrefs: ['vocab', 'uoe'], instrLang: 'pl' }, topic: 'work' }).value);
    assert.match(p, /WORD CUE/);
    assert.match(p, /NEVER use a word box/i);
    assert.match(p, /BASE verb/);
    assert.doesNotMatch(p, /"wordBank"/);
});

test('cue tier rises with level; difficulty shifts it one step; young learners get most help', () => {
    assert.deepEqual(['A0', 'A1', 'A2', 'B1', 'B2', 'C1'].map((cefr) => cueTier({ cefr })), [0, 0, 0, 1, 2, 3]);
    assert.equal(cueTier({ cefr: 'B1', intensity: 'light' }), 0);
    assert.equal(cueTier({ cefr: 'B1', intensity: 'stretch' }), 2);
    assert.equal(cueTier({ cefr: 'C1', intensity: 'stretch' }), 3);
    assert.equal(cueTier({ cefr: 'A1', intensity: 'light' }), 0);
    assert.equal(cueTier({ cefr: 'B2', age: 10 }), 0);
});

test('open cloze / lexical_set: never a box at any tier; word_formation keeps CAPITAL cue', () => {
    const oc = { type: 'uoe', format: 'open_cloze', instruction: 'x', prompt: 'A {{1}} b {{2}}.', items: [{ q: '', answer: 'the' }, { q: '', answer: 'of' }], wordBank: ['the', 'of'] };
    for (const tier of [0, 1, 2, 3]) assert.equal(applyWordCues(oc, { tier }).wordBank, undefined);
    const ls = { type: 'uoe', format: 'lexical_set', instruction: 'x', items: [{ q: 'a ___ b ___ c ___', answer: 'run' }, { q: 'd ___ e ___ f ___', answer: 'set' }], wordBank: ['run', 'set'] };
    for (const tier of [0, 1, 2, 3]) assert.equal(applyWordCues(ls, { tier }).wordBank, undefined);
    const wf = { type: 'uoe', format: 'word_formation', instruction: 'x', prompt: 'A {{1}}.', items: [{ q: '', cue: 'CREATE', answer: 'creative' }] };
    assert.equal(applyWordCues(wf, { tier: 3 }).items[0].cue, 'CREATE');
});

test('normaliser strips banks; prompt has the no-box tier rule', () => {
    const c1 = normalizeOwnTimeLesson(OWN_TIME_MOCK_C1_REPLY, { cefr: 'C1', instrLang: 'pl', intensity: 'standard' });
    assert.ok(c1.tasks.every((t) => !t.wordBank));
    const c1easy = normalizeOwnTimeLesson(OWN_TIME_MOCK_C1_REPLY, { cefr: 'C1', instrLang: 'pl', intensity: 'light' });
    assert.ok(c1easy.tasks.every((t) => !t.wordBank));
    assert.match(cueRuleText(0), /Never use a word box/i);
    assert.match(cueRuleText(3), /Never a word box/i);
    const p = buildOwnTimeLessonPrompt(validateOwnTimeGenerateRequest({ profile: { age: 17, cefr: 'C1', taskPrefs: ['uoe'], instrLang: 'pl', intensity: 'standard' }, topic: 'x' }).value);
    assert.match(p, /LEVEL CUES \(C1 exam format\)/);
});

test('guessBaseCue recovers common verb bases without AI', () => {
    assert.equal(guessBaseCue('went'), 'go');
    assert.equal(guessBaseCue('are playing'), 'play');
    assert.equal(guessBaseCue("doesn't like"), 'not / like');
    assert.equal(guessBaseCue('written'), 'write');
    assert.equal(guessBaseCue('happiness'), ''); // not a verb form we reverse
});

test('applyLocalCueRepair fills cues and skips AI cue-repair prompt', () => {
    const lesson = {
        tasks: [{
            needsCueRepair: true,
            type: 'uoe',
            format: 'tense_form',
            instruction: 'Complete with the correct verb form.',
            items: [
                { q: 'She ___ yesterday.', answer: 'went' },
                { q: 'They ___ now.', answer: 'are playing' },
            ],
        }],
    };
    const fixed = applyLocalCueRepair(lesson);
    assert.equal(fixed.tasks[0].items[0].cue, 'go');
    assert.equal(fixed.tasks[0].items[1].cue, 'play');
    assert.equal(fixed.tasks[0].needsCueRepair, undefined);
    assert.equal(buildCueRepairPrompt(fixed), '');
});

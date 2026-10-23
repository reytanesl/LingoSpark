import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeOwnTimeLesson, applyWordCues, needsWordCue, shuffleWordBank, isVerbFormTask,
    buildCueRepairPrompt, applyCueRepair, publicOwnTimeLesson, buildOwnTimeLessonPrompt, validateOwnTimeGenerateRequest,
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
    const t = applyWordCues(gapTask({ wordBank: ['am', 'is', 'were'] }));
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
        for (const t of l.tasks.filter(needsWordCue)) {
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

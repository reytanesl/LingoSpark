import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    parseVocabList, vocabSig, planVocab, advanceVocabState, publicVocabPlan, freshVocabState,
    vocabBatchSize, OWN_TIME_VOCAB_MIN, sanitizeVocabState,
    wordSetItemsToVocabText, sanitizeWordSetKey, OWN_TIME_BUILTIN_DECKS,
} from './own-time-vocab.js';
import {
    buildOwnTimeLessonPrompt, validateOwnTimeGenerateRequest, normalizeOwnTimeLesson,
    shuffleChoices, isUnchangedGap, enforceFormChange, cleanRecentFeedback,
} from './own-time-prompts.js';
import { sanitizeOwnTimeFeedback } from './db.js';
import { OWN_TIME_MOCK_REPLY } from './own-time-fixtures.js';

const words = (n) => Array.from({ length: n }, (_, i) => `word${i + 1} - słowo ${i + 1}`).join('\n');
const clientSrc = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
const serverSrc = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');
const dbSrc = fs.readFileSync(new URL('./db.js', import.meta.url), 'utf8');
const allowlist = fs.readFileSync(new URL('./static-allowlist.js', import.meta.url), 'utf8');

test('parseVocabList: lines, bullets, commas, duplicates', () => {
    assert.deepEqual(parseVocabList('- cat\n2) dog\n\nCat\n'), ['cat', 'dog']);
    assert.deepEqual(parseVocabList('a, b; c'), ['a', 'b', 'c']);
    assert.ok(parseVocabList(words(600)).length <= 500); // raised from 300 for whole textbook chapters (test-prep plan)
});

test('short list (<10) and free mode do not activate list mode', () => {
    assert.equal(planVocab({ vocabText: words(OWN_TIME_VOCAB_MIN - 1), cefr: 'A2' }).active, false);
    const items = parseVocabList(words(20));
    const st = { ...freshVocabState(vocabSig(items), 20), free: true };
    const p = planVocab({ vocabText: words(20), state: st, cefr: 'A2' });
    assert.equal(p.active, false);
    assert.equal(p.free, true);
});

test('list is worked through batch by batch until exhausted, then revision cycles covered items', () => {
    const text = words(20);
    assert.equal(vocabBatchSize('A1'), 6);
    assert.equal(vocabBatchSize('B1'), 8);
    let state = null;
    const seen = [];
    let plan = planVocab({ vocabText: text, state, cefr: 'B1' });
    assert.equal(plan.mode, 'new');
    assert.deepEqual(plan.idx, [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(plan.words[0], 'word1 - słowo 1');
    for (let guard = 0; guard < 10 && plan.active && !plan.exhausted; guard += 1) {
        seen.push(...plan.idx);
        state = advanceVocabState(state, publicVocabPlan(plan), 'new');
        plan = planVocab({ vocabText: text, state, cefr: 'B1' });
    }
    assert.deepEqual(seen, Array.from({ length: 20 }, (_, i) => i), 'every item exactly once, in order');
    assert.equal(plan.exhausted, true);
    assert.equal(publicVocabPlan(plan).total, 20);
    // revise: only already-covered items
    state = { ...state, nextMode: 'revise' };
    const rev = planVocab({ vocabText: text, state, cefr: 'B1' });
    assert.equal(rev.mode, 'revise');
    assert.equal(rev.exhausted, false);
    assert.ok(rev.idx.every((i) => state.covered.includes(i)));
    const after = advanceVocabState(state, publicVocabPlan(rev), 'revise');
    assert.deepEqual(after.covered, state.covered, 'revising does not change coverage');
    assert.notEqual(after.reviseCursor, state.reviseCursor);
});

test('revise right after the first batch, then continue with the next unused part', () => {
    const text = words(30);
    let st = advanceVocabState(null, publicVocabPlan(planVocab({ vocabText: text, cefr: 'B1' })), 'revise');
    let p = planVocab({ vocabText: text, state: st, cefr: 'B1' });
    assert.equal(p.mode, 'revise');
    assert.deepEqual(p.idx, [0, 1, 2, 3, 4, 5, 6, 7]);
    st = advanceVocabState(st, publicVocabPlan(p), 'new');
    p = planVocab({ vocabText: text, state: st, cefr: 'B1' });
    assert.equal(p.mode, 'new');
    assert.deepEqual(p.idx, [8, 9, 10, 11, 12, 13, 14, 15]);
});

test('a different list restarts the progress (signature mismatch)', () => {
    const st = advanceVocabState(null, publicVocabPlan(planVocab({ vocabText: words(20), cefr: 'B1' })), 'new');
    const p = planVocab({ vocabText: words(21), state: st, cefr: 'B1' });
    assert.equal(p.mode, 'new');
    assert.equal(p.idx[0], 0);
    assert.equal(sanitizeVocabState({ sig: 'x' }), null);
});

test('prompt contains the batch (new) or revision instructions; none for free topics', () => {
    const base = { profile: { age: 13, cefr: 'B1', taskPrefs: ['uoe'], intensity: 'standard', instrLang: 'pl', vocab: words(20) }, topic: 'x', vocab: words(20) };
    const v = validateOwnTimeGenerateRequest(base);
    assert.ok(v.ok, JSON.stringify(v));
    v.value.vocabPlan = planVocab({ vocabText: v.value.vocab, state: null, cefr: 'B1' });
    const p = buildOwnTimeLessonPrompt(v.value);
    assert.match(p, /VOCABULARY LIST MODE/);
    assert.match(p, /NEW MATERIAL SET/);
    assert.match(p, /word8 - słowo 8/);
    assert.ok(!p.includes('word9 - słowo 9'), 'next batch is not leaked');
    const st = advanceVocabState(null, publicVocabPlan(v.value.vocabPlan), 'revise');
    v.value.vocabPlan = planVocab({ vocabText: v.value.vocab, state: st, cefr: 'B1' });
    assert.match(buildOwnTimeLessonPrompt(v.value), /REVISION SET/);
    v.value.vocabPlan = { active: false };
    assert.ok(!/VOCABULARY LIST MODE/.test(buildOwnTimeLessonPrompt(v.value)));
});

test('shuffleChoices: answer stays an option, position varies, never the same slot twice in a row', () => {
    const mk = (i) => ({ q: `Q${i} ___`, options: ['alpha', 'beta', 'gamma'], answer: 'alpha' });
    const out = shuffleChoices(Array.from({ length: 12 }, (_, i) => mk(i)), 'seed');
    const pos = out.map((it) => it.options.indexOf(it.answer));
    assert.ok(out.every((it) => it.options.length === 3 && [...it.options].sort().join() === 'alpha,beta,gamma'));
    assert.ok(new Set(pos).size >= 2, `positions vary: ${pos}`);
    for (let i = 1; i < pos.length; i += 1) assert.notEqual(pos[i], pos[i - 1]);
    assert.deepEqual(shuffleChoices([mk(1)], 's'), shuffleChoices([mk(1)], 's'), 'deterministic');
});

test('normalized fixtures: MC answers still present as option text after shuffling', () => {
    const l = normalizeOwnTimeLesson(OWN_TIME_MOCK_REPLY, { instrLang: 'pl', cefr: 'A2' });
    for (const t of l.tasks.filter((x) => x.type === 'uoe')) {
        for (const it of t.items.filter((i) => Array.isArray(i.options))) assert.ok(it.options.includes(it.answer));
    }
});

test('Use of English must change the form: unchanged gaps detected and removed', () => {
    assert.equal(isUnchangedGap({ q: 'She ___ (play) tennis', answer: 'play' }), true);
    assert.equal(isUnchangedGap({ q: 'She ___ (play) tennis', answer: 'plays' }), false);
    assert.equal(isUnchangedGap({ q: 'x ___', cue: 'not / like', answer: 'not like' }), true);
    const task = { type: 'uoe', format: 'word_formation', prompt: 'A {{1}} b {{2}} c {{3}}.', items: [
        { q: '', cue: 'happy', answer: 'happy' }, { q: '', cue: 'quick', answer: 'quickly' }, { q: '', cue: 'beauty', answer: 'beautiful' },
    ] };
    const out = enforceFormChange(task);
    assert.equal(out.items.length, 2);
    assert.equal(out.formChangeDropped, 1);
    assert.equal(out.prompt, 'A happy b {{1}} c {{2}}.');
    const tf = { type: 'uoe', format: 'transformation', items: [{ q: 'a', cue: 'keep', answer: 'keep' }, { q: 'b', cue: 'x', answer: 'y' }] };
    assert.equal(enforceFormChange(tf), tf, 'transformation keeps its KEY unchanged by design');
    const l = normalizeOwnTimeLesson(OWN_TIME_MOCK_REPLY, { instrLang: 'pl', cefr: 'A2' });
    for (const t of l.tasks.filter((x) => x.type === 'uoe' && x.format !== 'transformation')) assert.ok(!t.items.some(isUnchangedGap));
});

test('prompt states the change-of-form rule', () => {
    const v = validateOwnTimeGenerateRequest({ profile: { age: 13, cefr: 'B1', taskPrefs: ['uoe'], intensity: 'standard', instrLang: 'pl' }, topic: 'x' });
    assert.match(buildOwnTimeLessonPrompt(v.value), /CHANGE OF FORM/);
});

test('feedback: several focuses are kept, unknown ones dropped, legacy single focusNext still works', () => {
    const f = sanitizeOwnTimeFeedback({ levelOk: 'ok', modeNext: 'revise', focusNexts: ['uoe', 'reading', 'bogus', 'uoe'], note: 'hi' });
    assert.deepEqual(f.focusNexts, ['uoe', 'reading']);
    assert.equal(f.focusNext, 'uoe');
    assert.equal(f.modeNext, 'revise');
    assert.deepEqual(sanitizeOwnTimeFeedback({ focusNext: 'writing' }).focusNexts, ['writing']);
    const r = cleanRecentFeedback([{ focusNexts: ['drill', 'zzz', 'vocab'], levelOk: 'easy' }]);
    assert.deepEqual(r[0].focusNexts, ['drill', 'vocab']);
    const v = validateOwnTimeGenerateRequest({ profile: { age: 13, cefr: 'B1', taskPrefs: ['uoe'], intensity: 'standard', instrLang: 'pl' }, topic: 'x',
        recentFeedback: [{ levelOk: 'ok', focusNexts: ['uoe', 'reading'] }] });
    assert.match(buildOwnTimeLessonPrompt(v.value), /EVERY one of these focuses/);
});

test('client: multi-select focus chips, list chip, end-of-material screen, no Kontynuuj pill', () => {
    assert.match(clientSrc, /type="checkbox" name="ot-focus"/);
    assert.match(clientSrc, /focusNexts/);
    assert.match(clientSrc, /ot-listchip/);
    for (const id of ['ot-vocab-free', 'ot-vocab-new', 'ot-vocab-revise', 'ot-vocab-newlist', 'ot-vocab-newgo']) assert.ok(clientSrc.includes(id), id);
    assert.match(clientSrc, /data\.exhausted/);
    assert.ok(!/data-ppick-go|continueProfile|entryResumeView|ot-ppick-go/.test(clientSrc), 'pill removed');
});

test('server/db wiring: vocab endpoint, state column, reset on new list, own-time-vocab stays server-only', () => {
    assert.match(serverSrc, /\/api\/own-time\/vocab/);
    assert.match(serverSrc, /exhausted: true/);
    assert.match(dbSrc, /vocab_state JSONB/);
    assert.match(dbSrc, /vocab_state = CASE WHEN vocab IS DISTINCT FROM/);
    assert.ok(!allowlist.includes('own-time-vocab'));
});

test('wordSetItemsToVocabText formats term = definition lines and dedupes', () => {
    const text = wordSetItemsToVocabText([
        { term: 'apple', definition: 'a fruit' },
        { term: 'Apple', def: 'dup' },
        { term: 'run' },
        { term: '' },
        null,
    ]);
    assert.equal(text, 'apple = a fruit\nrun');
});

test('sanitizeWordSetKey accepts saved ids and builtin keys only', () => {
    assert.equal(sanitizeWordSetKey(''), '');
    assert.equal(sanitizeWordSetKey('42'), '42');
    assert.equal(sanitizeWordSetKey('builtin:intermediate'), 'builtin:intermediate');
    assert.equal(sanitizeWordSetKey('builtin:nope'), '');
    assert.equal(sanitizeWordSetKey('../etc'), '');
    assert.equal(sanitizeWordSetKey(' 99 '), '99');
});

test('built-in decks cover Vocab-practice / Live levels', () => {
    assert.deepEqual(OWN_TIME_BUILTIN_DECKS.map((d) => d.level), ['beginner', 'easy', 'intermediate', 'advanced']);
});

test('own-time UI offers a word-set selector and keeps the word box removed', () => {
    assert.match(clientSrc, /ot-wordset|ot-session-wordset/);
    assert.match(clientSrc, /wordSetKey/);
    assert.match(clientSrc, /Bez zestawu \(jak dotychczas\)|No word set \(current behaviour\)/);
    assert.match(serverSrc, /resolveOwnTimeWordSet/);
    assert.match(serverSrc, /wordSetItemsToVocabText/);
    assert.doesNotMatch(clientSrc, /class="ot-wordbox"|id="ot-wordbox"/);
    assert.match(clientSrc, /Word boxes \("Use these words"\) were removed/);
    assert.match(dbSrc, /word_set_key/);
});

test('generate request accepts wordSetKey and prompts never mention a word box', () => {
    const ok = validateOwnTimeGenerateRequest({
        profile: { age: 14, cefr: 'A2', taskPrefs: ['vocab'], wordSetKey: 'builtin:beginner' },
        wordSetKey: 'builtin:beginner',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.value.wordSetKey, 'builtin:beginner');
    const prompt = buildOwnTimeLessonPrompt({
        ...ok.value,
        vocab: 'apple = a fruit\nhouse = a building',
        vocabPlan: planVocab({ vocabText: words(12), cefr: 'A2' }),
    });
    assert.match(prompt, /VOCABULARY LIST MODE/);
    assert.match(prompt, /word1/);
    // Prompt still forbids a word box (negative instruction) — that is intentional.
    assert.match(prompt, /NEVER use a word box/i);
});

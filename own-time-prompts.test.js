import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnTimeLessonPrompt, normalizeOwnTimeLesson, validateOwnTimeGenerateRequest, writingTarget, defaultGuidance } from './own-time-prompts.js';
import { OWN_TIME_MOCK_REPLY } from './own-time-fixtures.js';

const req = { profile: { age: 13, classLabel: '7a', cefr: 'A2', interests: ['sport'], taskPrefs: ['writing'], intensity: 'standard', instrLang: 'pl' }, topic: 'summer jobs' };

test('prompt asks for student guidance fields and CEFR writing length', () => {
    const v = validateOwnTimeGenerateRequest(req);
    assert.ok(v.ok, JSON.stringify(v));
    const p = buildOwnTimeLessonPrompt(v.value);
    for (const k of ['"steps"', '"example"', '"usefulLanguage"', '"hint"', '"goal"', '"target"']) assert.ok(p.includes(k), k);
    assert.match(p, /3–4 sentences/);
    assert.match(p, /EXACTLY 5 or 6 tasks/);
    assert.ok(!/minutes/i.test(p.replace('No time limits or minutes anywhere', '')), 'no time frame in prompt');
    assert.ok(!p.includes('successCriteria'), 'checklist no longer requested');
});

test('old-style lesson without guidance gets defaults (backwards compatible)', () => {
    const l = normalizeOwnTimeLesson({ title: 'x', tasks: [
        { type: 'uoe', instruction: 'Uzupełnij', items: [{ q: 'I ___ happy', answer: 'am' }] },
        { type: 'writing', instruction: 'Napisz', prompt: 'Write' },
    ] }, { instrLang: 'pl', cefr: 'B1' });
    const [u, w] = l.tasks;
    assert.ok(u.steps.length >= 2 && u.hint);
    assert.equal(u.target, null);
    assert.equal(u.items[0].answer, 'am');
    assert.deepEqual([w.target.minSentences, w.target.maxSentences], writingTarget('B1').sentences);
    assert.ok(w.steps.some((c) => c.includes('4–5 zdań')));
    assert.equal(l.goal, '');
});

test('guidance from AI is kept, trimmed and capped', () => {
    const l = normalizeOwnTimeLesson(OWN_TIME_MOCK_REPLY, { instrLang: 'pl', cefr: 'A2' });
    assert.equal(l.tasks.length, 6);
    assert.match(l.goal, /Po tej lekcji/);
    const w = l.tasks[5];
    assert.equal(w.steps[0], OWN_TIME_MOCK_REPLY.tasks[5].steps[0]);
    assert.equal(w.usefulLanguage.length, 5);
    assert.equal(w.target.minSentences, 3);
    assert.ok(w.example);
    const big = normalizeOwnTimeLesson({ tasks: [{ type: 'vocab_drill', instruction: 'x', usefulLanguage: Array(20).fill('a'), steps: Array(9).fill('s'), minutes: 99 }] }, {});
    assert.equal(big.tasks[0].usefulLanguage.length, 6);
    assert.equal(big.tasks[0].steps.length, 4);
    assert.equal(big.tasks[0].minutes, undefined, 'no per-task minutes any more');
});

test('English defaults when instructions are in English', () => {
    assert.match(defaultGuidance('reading', 'en', 'B2').steps[0], /questions/);
    assert.match(defaultGuidance('writing', 'en', 'B2').steps[1], /5–6 sentences/);
    assert.equal(defaultGuidance('writing', 'en', 'B2').successCriteria, undefined);
});

test('saved/old lessons with successCriteria are accepted and the field is dropped', () => {
    const l = normalizeOwnTimeLesson({ tasks: [{ type: 'reading', instruction: 'x', successCriteria: ['a', 'b'] }] }, { instrLang: 'en', cefr: 'B1' });
    assert.equal(l.tasks.length, 1);
    assert.equal(l.tasks[0].successCriteria, undefined);
});

import { OWN_TIME_EXTRA_DAILY_LIMIT, buildOwnTimeExtraContext } from './own-time-prompts.js';
import { OWN_TIME_MOCK_EXTRA_REPLY } from './own-time-fixtures.js';

test('Keep going: extra request is validated, capped and adds an extra block to the prompt', () => {
    assert.equal(OWN_TIME_EXTRA_DAILY_LIMIT, 3);
    const plain = validateOwnTimeGenerateRequest(req).value;
    assert.equal(plain.extra, false);
    assert.equal(plain.extraContext, null);
    assert.ok(!buildOwnTimeLessonPrompt(plain).includes('EXTRA PRACTICE'));
    const v = validateOwnTimeGenerateRequest({ ...req, extra: true, extraContext: { avoid: Array(99).fill('tip'), weak: ['shift → shift (wrote: shit)'], previousTitle: 'Café', setNumber: 9 } }).value;
    assert.equal(v.extra, true);
    assert.equal(v.extraContext.avoid.length, 40);
    assert.equal(v.extraContext.setNumber, 3);
    const p = buildOwnTimeLessonPrompt(v);
    assert.match(p, /EXTRA PRACTICE \("Keep going" set 3 today\)/);
    assert.match(p, /Do NOT reuse any of these items.*tip/);
    assert.match(p, /shift → shift \(wrote: shit\)/);
    assert.match(p, /"Café"/);
    // only a literal true enables extra
    assert.equal(validateOwnTimeGenerateRequest({ ...req, extra: 'yes' }).value.extra, false);
});

test('Keep going: extra context lists previous items and wrong answers', () => {
    const lesson = normalizeOwnTimeLesson(OWN_TIME_MOCK_REPLY, { instrLang: 'pl', cefr: 'A2' });
    const ctx = buildOwnTimeExtraContext(lesson, { t0: { items: ['customer', 'tip', 'shit', ''] } });
    assert.ok(ctx.avoid.includes('customer'));
    assert.deepEqual(ctx.weak.filter((w) => w.startsWith('the hours') || w.startsWith('giving')).length, 2);
    assert.match(ctx.weak.find((w) => w.includes('shift')), /wrote: shit/);
    assert.equal(ctx.previousTitle, OWN_TIME_MOCK_REPLY.title);
});

test('Keep going: mock extra set has the same format and does not repeat base items', () => {
    const base = normalizeOwnTimeLesson(OWN_TIME_MOCK_REPLY, { instrLang: 'pl', cefr: 'A2' });
    const extra = normalizeOwnTimeLesson(OWN_TIME_MOCK_EXTRA_REPLY, { instrLang: 'pl', cefr: 'A2' });
    assert.ok(extra.tasks.length >= 2);
    assert.notEqual(extra.title, base.title);
    const baseAns = new Set(base.tasks.flatMap((t) => t.items.map((i) => i.answer)));
    for (const t of extra.tasks) for (const i of t.items) assert.ok(!baseAns.has(i.answer), i.answer);
});

import { normalizeGapMarker } from './own-time-prompts.js';

test('One-screen layout: prompt asks for inline gap markers and short tasks', () => {
    const p = buildOwnTimeLessonPrompt(validateOwnTimeGenerateRequest(req).value);
    assert.match(p, /\{\{1\}\}/);
    assert.match(p, /ONE "___"/);
    assert.match(p, /ONE-SCREEN RULE/);
});

test('Gap markers are canonicalised; old items without markers are left intact', () => {
    assert.equal(normalizeGapMarker('I ______ (be) happy.'), 'I ___ (be) happy.');
    assert.equal(normalizeGapMarker('She [...] tennis.'), 'She ___ tennis.');
    assert.equal(normalizeGapMarker('What did Ola buy?'), 'What did Ola buy?');
    const l = normalizeOwnTimeLesson({ tasks: [{ type: 'uoe', instruction: 'x', items: [{ q: 'He ____ (go) home.', answer: 'went' }, { q: 'Old item, no gap', answer: 'a' }] }] }, {});
    // A bracket cue right after the gap becomes the item cue (rendered as "(go)" next to the gap).
    assert.equal(l.tasks[0].items[0].q, 'He ___ home.');
    assert.equal(l.tasks[0].items[0].cue, 'go');
    assert.equal(l.tasks[0].items[1].q, 'Old item, no gap');
});

test('Mock fixtures use inline gaps: {{n}} cover every item; ___ sentences have one gap', () => {
    const all = [...OWN_TIME_MOCK_REPLY.tasks, ...OWN_TIME_MOCK_EXTRA_REPLY.tasks, ...OWN_TIME_MOCK_LOW_REPLY.tasks];
    const gapped = all.find((t) => /\{\{1\}\}/.test(t.prompt));
    assert.ok(gapped, 'a gapped-text task exists');
    gapped.items.forEach((_, i) => assert.ok(gapped.prompt.includes(`{{${i + 1}}}`), `{{${i + 1}}}`));
    const sentenceUoe = OWN_TIME_MOCK_EXTRA_REPLY.tasks.find((t) => t.type === 'uoe');
    sentenceUoe.items.forEach((it) => assert.equal(it.q.split('___').length, 2, it.q));
    assert.deepEqual(OWN_TIME_MOCK_REPLY.tasks.map((t) => t.type), ['vocab_drill', 'uoe', 'word_order', 'uoe', 'reading', 'writing']);
    for (const t of all) assert.ok((t.items || []).length <= 6);
});

// ---- tile tasks (word_order / unscramble) ----
import { buildTileItem, looseKey, OWN_TIME_TASK_TYPES } from './own-time-prompts.js';
import { OWN_TIME_MOCK_LOW_REPLY } from './own-time-fixtures.js';

test('looseKey ignores case, punctuation and apostrophe styles', () => {
    assert.equal(looseKey('I’m  happy!'), looseKey("i'm happy"));
    assert.equal(looseKey('Where do you live?'), 'where do you live');
});

test('buildTileItem word_order shuffles deterministically and keeps the word set', () => {
    const a = buildTileItem('word_order', { q: 'Lubię pływać.', answer: 'I like swimming in the sea.', alts: ['In the sea I like swimming.'] });
    const b = buildTileItem('word_order', { q: 'Lubię pływać.', answer: 'I like swimming in the sea.' });
    assert.ok(a && b);
    assert.deepEqual(a.tiles, b.tiles);
    assert.deepEqual([...a.tiles].sort(), ['I', 'in', 'like', 'sea', 'swimming', 'the'].sort());
    assert.notEqual(a.tiles.join(' '), 'I like swimming in the sea');
    assert.equal(a.end, '.');
    assert.equal(a.alts.length, 1);
    assert.equal(buildTileItem('word_order', { answer: 'Hi there' }), null, 'too short');
});

test('buildTileItem unscramble needs one word and yields letter tiles', () => {
    const u = buildTileItem('unscramble', { q: 'You buy food here', answer: 'Shop', emoji: '🛒' });
    assert.equal(u.answer.toLowerCase(), 'shop');
    assert.deepEqual([...u.tiles].sort(), ['h', 'o', 'p', 's']);
    assert.notEqual(u.tiles.join(''), 'shop');
    assert.equal(u.emoji, '🛒');
    assert.equal(buildTileItem('unscramble', { answer: 'two words' }), null);
    assert.equal(buildTileItem('unscramble', { answer: 'ab' }), null);
});

test('normalizer accepts tile types, drops bad items and empty tile tasks', () => {
    assert.ok(OWN_TIME_TASK_TYPES.includes('word_order') && OWN_TIME_TASK_TYPES.includes('unscramble'));
    const l = normalizeOwnTimeLesson({ title: 't', tasks: [
        { type: 'word_order', instruction: 'Ułóż', items: [{ answer: 'She goes to school by bus.' }, { answer: 'no' }] },
        { type: 'unscramble', instruction: 'Ułóż', items: [{ answer: 'x y' }] },
        { type: 'uoe', instruction: 'Uzupełnij', items: [{ q: 'I ___ happy', answer: 'am' }] },
    ] }, { cefr: 'A1', instrLang: 'pl' });
    const types = l.tasks.map(t => t.type);
    assert.deepEqual(types, ['word_order', 'uoe']);
    assert.equal(l.tasks[0].items.length, 1);
    assert.ok(Array.isArray(l.tasks[0].items[0].tiles));
    assert.ok(l.tasks[0].steps.length && l.tasks[0].hint);
});

test('prompt mixes tile tasks in for low levels only', () => {
    const low = validateOwnTimeGenerateRequest({ ...req, profile: { ...req.profile, cefr: 'A1', age: 10 } });
    const pLow = buildOwnTimeLessonPrompt(low.value);
    assert.match(pLow, /ONE–TWO tile tasks/);
    assert.match(pLow, /within the 5–6 tasks/);
    const hi = validateOwnTimeGenerateRequest({ ...req, profile: { ...req.profile, cefr: 'B2', age: 16 } });
    assert.match(buildOwnTimeLessonPrompt(hi.value), /B2\+: do NOT use word_order or unscramble/);
    const b1 = validateOwnTimeGenerateRequest({ ...req, profile: { ...req.profile, cefr: 'B1', age: 14 } });
    assert.match(buildOwnTimeLessonPrompt(b1.value), /MAY use one short "word_order"/);
});

test('low mock fixture normalizes with both tile types intact', () => {
    const l = normalizeOwnTimeLesson(OWN_TIME_MOCK_LOW_REPLY, { cefr: 'A1', instrLang: 'pl' });
    const byType = Object.fromEntries(l.tasks.map(t => [t.type, t]));
    assert.equal(byType.unscramble.items.length, 5);
    assert.equal(byType.word_order.items.length, 4);
    assert.ok(l.tasks.length >= 5 && l.tasks.length <= 6);
});

// ---- 5–6 task model + CKE exam Use of English formats ----
import { UOE_FORMATS, UOE_LEVELS, buildUoeItem, resolveUoeFormat, uoeInstruction, OWN_TIME_TASKS_MIN, OWN_TIME_TASKS_MAX } from './own-time-prompts.js';
import { OWN_TIME_MOCK_B1_REPLY, OWN_TIME_MOCK_B2_REPLY, OWN_TIME_MOCK_C1_REPLY } from './own-time-fixtures.js';

test('every mock lesson and extra set has 5–6 tasks and no minutes', () => {
    for (const [raw, cefr] of [[OWN_TIME_MOCK_REPLY, 'A2'], [OWN_TIME_MOCK_EXTRA_REPLY, 'A2'], [OWN_TIME_MOCK_LOW_REPLY, 'A1'], [OWN_TIME_MOCK_B1_REPLY, 'B1'], [OWN_TIME_MOCK_B2_REPLY, 'B2'], [OWN_TIME_MOCK_C1_REPLY, 'C1']]) {
        const l = normalizeOwnTimeLesson(raw, { cefr, instrLang: 'pl' });
        assert.ok(l.tasks.length >= OWN_TIME_TASKS_MIN && l.tasks.length <= OWN_TIME_TASKS_MAX, `${raw.title}: ${l.tasks.length}`);
        assert.equal(l.taskCountOk, true);
        assert.equal(l.minutes, undefined);
        l.tasks.forEach((t) => assert.equal(t.minutes, undefined));
    }
});

test('task count is capped at 6 and short lessons are repaired by splitting, else flagged', () => {
    const many = { tasks: Array.from({ length: 9 }, () => ({ type: 'vocab_drill', instruction: 'x', items: [{ q: 'a', answer: 'b' }] })) };
    assert.equal(normalizeOwnTimeLesson(many, { cefr: 'A1' }).tasks.length, 6);
    const items = Array.from({ length: 6 }, (_, i) => ({ q: `w${i}`, answer: `a${i}` }));
    const short = normalizeOwnTimeLesson({ tasks: [
        { type: 'vocab_drill', instruction: 'x', items }, { type: 'vocab_drill', instruction: 'y', items }, { type: 'writing', instruction: 'w', prompt: 'p' },
    ] }, { cefr: 'A1' });
    assert.equal(short.tasks.length, 5);
    assert.equal(short.taskCountOk, true);
    assert.deepEqual(short.tasks.map((t) => t.n), [1, 2, 3, 4, 5]);
    const tiny = normalizeOwnTimeLesson({ tasks: [{ type: 'writing', instruction: 'w', prompt: 'p' }] }, { cefr: 'A1' });
    assert.equal(tiny.taskCountOk, false);
});

test('difficulty replaces the time frame in the prompt', () => {
    const v = validateOwnTimeGenerateRequest({ ...req, profile: { ...req.profile, intensity: 'stretch' } }).value;
    const p = buildOwnTimeLessonPrompt(v);
    assert.match(p, /Difficulty: stretch → challenge/);
    assert.ok(!/12–15|18–20|15–18/.test(p));
});

test('prompt maps CKE exam formats by level', () => {
    const p = (cefr) => buildOwnTimeLessonPrompt(validateOwnTimeGenerateRequest({ ...req, profile: { ...req.profile, cefr } }).value);
    assert.match(p('A2'), /Egzamin ósmoklasisty/);
    assert.match(p('A2'), /mc_translation/);
    assert.match(p('B1'), /Matura — poziom podstawowy/);
    assert.match(p('B1'), /two_sentences/);
    assert.match(p('B2'), /Matura — poziom rozszerzony/);
    assert.match(p('B2'), /"transformation"/);
    assert.match(p('B2'), /"word_formation"/);
    assert.match(p('C1'), /poziom dwujęzyczny/);
    assert.match(p('C1'), /lexical_set/);
    assert.match(p('A1'), /"format": "simple"/);
    assert.ok(!/Egzamin|Matura/.test(p('A1')));
});

test('every level format exists and has a Polish CKE-style instruction', () => {
    for (const [lvl, lv] of Object.entries(UOE_LEVELS)) {
        for (const f of lv.formats) {
            assert.ok(UOE_FORMATS[f], `${lvl}:${f}`);
            assert.match(uoeInstruction(f, lvl), /^(Wybierz|Przeczytaj|Uzupełnij|Przetłumacz|Wpisz)/);
        }
    }
    assert.match(uoeInstruction('translation', 'B2'), /maksymalnie pięć wyrazów/);
    assert.ok(!/pięć/.test(uoeInstruction('translation', 'A2')));
    assert.equal(UOE_LEVELS.A2.options, 3);
    assert.equal(UOE_LEVELS.B2.options, 4);
});

test('buildUoeItem validates each format', () => {
    // multiple choice: answer must be one of the options; letters are mapped
    assert.equal(buildUoeItem('mc_sentences', { q: 'I ___ there.', options: ['go', 'went', 'going'], answer: 'B' }, 'A2').answer, 'went');
    assert.equal(buildUoeItem('mc_sentences', { q: 'I ___ there.', options: ['go', 'goes', 'going'], answer: 'went' }, 'A2'), null);
    assert.equal(buildUoeItem('mc_sentences', { q: 'I ___ there.', options: ['go', 'went'], answer: 'went' }, 'A2'), null, 'needs 3 options');
    assert.equal(buildUoeItem('mc_text', { options: ['A) made', 'B) done', 'C) let', 'D) caused'], answer: 'made' }, 'B2').options.length, 4);
    assert.equal(buildUoeItem('mc_text', { options: ['made', 'done', 'let', 'caused'], answer: 'made' }, 'A2').options.length, 3);
    // translation: Polish fragment required (or extracted from the brackets before the gap)
    assert.equal(buildUoeItem('translation', { q: 'We ___ for you.', pl: 'poczekalibyśmy', answer: 'would have waited' }, 'B2').pl, 'poczekalibyśmy');
    const ex = buildUoeItem('translation', { q: 'We (poczekalibyśmy) ___ for you.', answer: 'would have waited' }, 'B2');
    assert.equal(ex.pl, 'poczekalibyśmy');
    assert.equal(ex.q, 'We ___ for you.');
    assert.equal(buildUoeItem('translation', { q: 'We ___ for you.', answer: 'x' }, 'B2'), null);
    // transformation: lead + key word (upper-cased) + gap
    const tf = buildUoeItem('transformation', { lead: 'I started 3 years ago.', key: 'for', q: 'I have ___ 3 years.', answer: 'worked here for' }, 'B2');
    assert.equal(tf.key, 'FOR');
    assert.equal(buildUoeItem('transformation', { q: 'I have ___.', answer: 'x' }, 'B2'), null);
    // lexical set / two sentences need several gaps
    assert.ok(buildUoeItem('lexical_set', { q: 'a ___ b\nc ___ d\ne ___ f', answer: 'drew' }, 'C1'));
    assert.equal(buildUoeItem('lexical_set', { q: 'a ___ b', answer: 'drew' }, 'C1'), null);
    // word formation in a text: short q becomes the cue
    assert.equal(buildUoeItem('word_formation', { q: 'POPULARITY', answer: 'popular' }, 'B2').cue, 'POPULARITY');
});

test('resolveUoeFormat keeps level formats, infers others and uses simple for A0/A1', () => {
    assert.equal(resolveUoeFormat({ format: 'transformation' }, 'B2'), 'transformation');
    assert.equal(resolveUoeFormat({ format: 'transformation' }, 'A1'), 'simple');
    assert.equal(resolveUoeFormat({ format: 'lexical_set', items: [{ options: ['a', 'b', 'c'] }] }, 'A2'), 'mc_sentences');
    assert.equal(resolveUoeFormat({ prompt: 'x {{1}} y', items: [{ options: ['a', 'b', 'c'] }] }, 'B1'), 'mc_text');
    assert.equal(resolveUoeFormat({ items: [{ q: 'I ___ (go).', answer: 'went' }] }, 'A2'), 'brackets');
    assert.equal(resolveUoeFormat({ items: [{ q: 'I ___.', pl: 'poszedłem', answer: 'went' }] }, 'C1'), 'translation');
});

test('uoe tasks get the official instruction and an exam tag; bad items fall back to the open format', () => {
    const l = normalizeOwnTimeLesson(OWN_TIME_MOCK_B2_REPLY, { cefr: 'B2', instrLang: 'pl' });
    const wf = l.tasks.find((t) => t.format === 'word_formation');
    assert.equal(wf.exam, 'MR');
    assert.match(wf.instruction, /przekształcając wyraz podany w nawiasie/);
    const fb = normalizeOwnTimeLesson({ cefr: 'B2', tasks: [{ type: 'uoe', format: 'mc_text', items: [{ q: 'I ___ it.', answer: 'did' }, { q: 'You ___ it.', answer: 'saw' }] }] }, {});
    assert.equal(fb.tasks[0].format, 'open_cloze');
    assert.equal(fb.tasks[0].items.length, 2);
    // old saved lessons without a format still normalise
    const old = normalizeOwnTimeLesson({ cefr: 'A1', tasks: [{ type: 'uoe', instruction: 'x', prompt: 'I {{1}} ok.', items: [{ q: 'be', answer: 'am' }] }] }, {});
    assert.equal(old.tasks[0].format, 'simple');
    assert.equal(old.tasks[0].items[0].answer, 'am');
});

test('answers are case/punctuation-insensitive and accept AI alternatives', () => {
    const it = buildUoeItem('translation', { q: 'My parents ___ work.', pl: 'nie pozwalają mi', answer: 'don’t let me', alts: ['do not let me'] }, 'B1');
    const ok = (v) => [it.answer, ...it.alts].map(looseKey).includes(looseKey(v));
    assert.ok(ok("Don't let me"));
    assert.ok(ok('do not let me.'));
    assert.ok(!ok('dont let me go'));
});

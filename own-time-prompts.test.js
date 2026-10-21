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
    assert.match(p, /15–20/);
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
    assert.equal(l.tasks.length, 4);
    assert.match(l.goal, /Po tej lekcji/);
    const w = l.tasks[3];
    assert.equal(w.steps[0], OWN_TIME_MOCK_REPLY.tasks[3].steps[0]);
    assert.equal(w.usefulLanguage.length, 5);
    assert.equal(w.target.minSentences, 3);
    assert.ok(w.example);
    const big = normalizeOwnTimeLesson({ tasks: [{ type: 'vocab_drill', instruction: 'x', usefulLanguage: Array(20).fill('a'), steps: Array(9).fill('s'), minutes: 99 }] }, {});
    assert.equal(big.tasks[0].usefulLanguage.length, 6);
    assert.equal(big.tasks[0].steps.length, 4);
    assert.equal(big.tasks[0].minutes, 12);
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
    assert.match(p, /\{\{1\}\}, \{\{2\}\}/);
    assert.match(p, /exactly ONE "___"/);
    assert.match(p, /ONE-SCREEN RULE/);
});

test('Gap markers are canonicalised; old items without markers are left intact', () => {
    assert.equal(normalizeGapMarker('I ______ (be) happy.'), 'I ___ (be) happy.');
    assert.equal(normalizeGapMarker('She [...] tennis.'), 'She ___ tennis.');
    assert.equal(normalizeGapMarker('What did Ola buy?'), 'What did Ola buy?');
    const l = normalizeOwnTimeLesson({ tasks: [{ type: 'uoe', instruction: 'x', items: [{ q: 'He ____ (go) home.', answer: 'went' }, { q: 'Old item, no gap', answer: 'a' }] }] }, {});
    assert.equal(l.tasks[0].items[0].q, 'He ___ (go) home.');
    assert.equal(l.tasks[0].items[1].q, 'Old item, no gap');
});

test('Mock fixtures use inline gaps: {{n}} cover every item; ___ sentences have one gap', () => {
    const all = [...OWN_TIME_MOCK_REPLY.tasks, ...OWN_TIME_MOCK_EXTRA_REPLY.tasks];
    const gapped = all.find((t) => /\{\{1\}\}/.test(t.prompt));
    assert.ok(gapped, 'a gapped-text task exists');
    gapped.items.forEach((_, i) => assert.ok(gapped.prompt.includes(`{{${i + 1}}}`), `{{${i + 1}}}`));
    const sentenceUoe = OWN_TIME_MOCK_EXTRA_REPLY.tasks.find((t) => t.type === 'uoe');
    sentenceUoe.items.forEach((it) => assert.equal(it.q.split('___').length, 2, it.q));
    assert.deepEqual(OWN_TIME_MOCK_REPLY.tasks.map((t) => t.type), ['vocab_drill', 'uoe', 'reading', 'writing']);
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
    assert.match(pLow, /include exactly ONE/);
    assert.match(pLow, /15–20/);
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
    assert.ok(l.tasks.length >= 3 && l.tasks.length <= 5);
});

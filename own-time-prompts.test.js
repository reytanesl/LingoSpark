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
    assert.equal(l.tasks.length, 3);
    assert.match(l.goal, /Po tej lekcji/);
    const w = l.tasks[2];
    assert.equal(w.steps[0], OWN_TIME_MOCK_REPLY.tasks[2].steps[0]);
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

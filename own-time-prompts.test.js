import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnTimeLessonPrompt, normalizeOwnTimeLesson, validateOwnTimeGenerateRequest, writingTarget, defaultGuidance } from './own-time-prompts.js';
import { OWN_TIME_MOCK_REPLY } from './own-time-fixtures.js';

const req = { profile: { age: 13, classLabel: '7a', cefr: 'A2', interests: ['sport'], taskPrefs: ['writing'], intensity: 'standard', instrLang: 'pl' }, topic: 'summer jobs' };

test('prompt asks for student guidance fields and CEFR writing length', () => {
    const v = validateOwnTimeGenerateRequest(req);
    assert.ok(v.ok, JSON.stringify(v));
    const p = buildOwnTimeLessonPrompt(v.value);
    for (const k of ['"steps"', '"successCriteria"', '"example"', '"usefulLanguage"', '"hint"', '"goal"', '"target"']) assert.ok(p.includes(k), k);
    assert.match(p, /3–4 sentences/);
    assert.match(p, /15–20/);
});

test('old-style lesson without guidance gets defaults (backwards compatible)', () => {
    const l = normalizeOwnTimeLesson({ title: 'x', tasks: [
        { type: 'uoe', instruction: 'Uzupełnij', items: [{ q: 'I ___ happy', answer: 'am' }] },
        { type: 'writing', instruction: 'Napisz', prompt: 'Write' },
    ] }, { instrLang: 'pl', cefr: 'B1' });
    const [u, w] = l.tasks;
    assert.ok(u.steps.length >= 2 && u.successCriteria.length >= 2 && u.hint);
    assert.equal(u.target, null);
    assert.equal(u.items[0].answer, 'am');
    assert.deepEqual([w.target.minSentences, w.target.maxSentences], writingTarget('B1').sentences);
    assert.ok(w.successCriteria.some((c) => c.includes('4–5 zdań')));
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
    assert.match(defaultGuidance('writing', 'en', 'B2').successCriteria[1], /5–6 sentences/);
});

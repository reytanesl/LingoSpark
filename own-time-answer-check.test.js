import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './answer-check.js';
import { validateOwnTimeGenerateRequest, buildUoeItem, buildOwnTimeLessonPrompt, acceptedList } from './own-time-prompts.js';
import { staticAllowlist, PUBLIC_SCRIPTS } from './static-allowlist.js';
const A = globalThis.AnswerCheck;

test('layer 1: normalisation (case, spaces, punctuation, apostrophes, contractions)', () => {
    assert.equal(A.normAnswer('  Don’t   GO! '), 'do not go');
    assert.equal(A.normAnswer("won't"), 'will not');
    assert.equal(A.normAnswer("can't"), A.normAnswer('can not'));
    assert.equal(A.normAnswer("it's"), 'it is');
    assert.equal(A.gradeAnswer({ answer: 'do not like' }, "DON'T like.").status, 'ok');
});
test('layer 1: one-letter typo = almost (no credit), short words and bigger errors = wrong', () => {
    assert.equal(A.gradeAnswer({ answer: 'receipt' }, 'reciept').status, 'almost');
    assert.equal(A.gradeAnswer({ answer: 'receipt' }, 'recept').status, 'almost');
    assert.equal(A.gradeAnswer({ answer: 'in' }, 'on').status, 'wrong');
    assert.equal(A.gradeAnswer({ answer: 'receipt' }, 'bill').status, 'wrong');
    assert.equal(A.gradeAnswer({ answer: 'x' }, '  ').status, 'empty');
});
test('layer 2: acceptedAnswers are merged into alts and requested in the prompt', () => {
    assert.deepEqual(acceptedList({ acceptedAnswers: ['in spite of', 'Despite'], alts: ['despite'] }), ['in spite of', 'Despite']);
    const v = validateOwnTimeGenerateRequest({ profile: { cefr: 'B2', age: 16, instrLang: 'pl', taskPrefs: ['uoe'] } });
    assert.match(buildOwnTimeLessonPrompt(v.value), /"acceptedAnswers"/);
    const it = buildUoeItem('transformation', { lead: 'Although it rained, we went.', key: 'despite', q: '___ the rain, we went.', answer: 'Despite', acceptedAnswers: ['In spite of', 'despite'] }, 'B2');
    assert.deepEqual(it.alts, ['In spite of']);
});
test('layer 3: exam rules before AI (limits, key word, one word, root)', () => {
    assert.match(A.examRuleViolation('transformation', { key: 'despite' }, 'in spite of the rain'), /DESPITE/);
    assert.match(A.examRuleViolation('transformation', { key: 'had' }, 'if only I had not been so'), /5/);
    assert.equal(A.examRuleViolation('transformation', { key: 'despite' }, 'despite the rain'), '');
    assert.match(A.examRuleViolation('open_cloze', {}, 'a lot'), /jeden/);
    assert.match(A.examRuleViolation('translation', {}, 'one two three four five', 'B1'), /4/);
    assert.equal(A.examRuleViolation('translation', {}, 'one two three four five', 'C1'), '');
    assert.match(A.examRuleViolation('word_formation', { cue: 'SUCCEED' }, 'victory'), /SUCCEED/);
    assert.equal(A.examRuleViolation('word_formation', { cue: 'POSSIBLE' }, 'impossibility'), '');
});
test('layer 3: prompt/reply/mock helpers', () => {
    const items = [{ i: 0, q: '___ the rain', answer: 'despite', accepted: [], given: 'in spite of' }, { i: 2, answer: 'till', given: 'cash' }];
    assert.match(A.buildOpenCheckPrompt({ format: 'open_cloze', cefr: 'B2', items }), /Over the word limit = wrong/);
    assert.deepEqual(Object.keys(A.parseOpenCheckReply({ results: [{ i: 0, correct: true, explanation: 'ok' }, { i: 9, correct: true }] }, [0, 2])), ['0']);
    const m = A.mockOpenCheck(items);
    assert.equal(m[0].correct, true);
    assert.equal(m[2].correct, false);
});
test('server route behind the paywall, mocked AI, client wiring + AI verify limit', () => {
    const srv = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');
    assert.match(srv, /app\.post\('\/api\/own-time\/check-open', requireWritingAccess,/);
    assert.match(srv, /AnswerCheck\.examRuleViolation[\s\S]*mock \? AnswerCheck\.mockOpenCheck/);
    const ot = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
    assert.match(ot, /Poprawne — inna wersja niż w kluczu/);
    assert.match(ot, /'Zweryfikuj'/);
    assert.equal(A.APPEALS_PER_SET, 5);
    assert.ok(PUBLIC_SCRIPTS.has('answer-check.js'));
    assert.ok(typeof staticAllowlist === 'function' || staticAllowlist);
});

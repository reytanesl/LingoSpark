import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './answer-check.js';
import { validateOwnTimeGenerateRequest, buildOwnTimeLessonPrompt } from './own-time-prompts.js';
const A = globalThis.AnswerCheck;
const ot = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');

test('reading: meaning over grammar (key phrases, no article/preposition/case penalty, tolerant spelling)', () => {
    const it = { answer: 'in a small town' };
    for (const v of ['small town', 'In a small town.', 'a small town', 'SMALL TOWN', 'smal town', 'he lives in a small town']) assert.equal(A.gradeReading(it, v).status, 'ok', v);
    assert.equal(A.gradeReading({ answer: 'near a lake' }, 'near lake').status, 'ok');
    assert.equal(A.gradeReading({ answer: 'near a lake' }, 'lake').status, 'ok');
    assert.equal(A.gradeReading({ answer: 'cousin' }, 'is aunt').status, 'wrong');
    assert.equal(A.gradeReading({ answer: 'small town' }, 'big city').status, 'wrong');
    assert.equal(A.gradeReading({ answer: 'cousin', alts: ["Leo's cousin"] }, 'his cousin').status, 'ok');
    // Use of English stays strict (spelling/typo = almost, no credit)
    assert.equal(A.gradeAnswer({ answer: 'receipt' }, 'reciept').status, 'almost');
});
test('reading AI judge instructions are meaning-based; exam rules are not applied to reading', () => {
    const p = A.buildOpenCheckPrompt({ format: 'reading', cefr: 'A1', items: [{ i: 0, q: 'Where does Leo live?', answer: 'in a small town', given: 'small town' }] });
    assert.match(p, /Judge MEANING only, not grammar/);
    assert.match(p, /ignore missing articles or prepositions/);
    assert.equal(A.examRuleViolation('reading', {}, 'a long answer with many many words here'), '');
    assert.equal(A.mockOpenCheck([{ i: 0, answer: 'Nina', given: 'nina is cousin', accepted: [] }], 'reading')[0].correct, true);
});
test('prompt: reading clarity rules + self-check', () => {
    const p = buildOwnTimeLessonPrompt(validateOwnTimeGenerateRequest({ profile: { cefr: 'A1', age: 9, instrLang: 'pl', taskPrefs: ['reading'] } }).value);
    assert.match(p, /READING CLARITY/);
    assert.match(p, /Nina is Leo's cousin/);
    assert.match(p, /never convoluted kinship/);
    assert.match(p, /SELF-CHECK[^\n]*exactly ONE clear, unambiguous answer/);
    assert.match(p, /A1 learner/);
});
test('client: Sprawdź is local only; Zweryfikuj triggers the AI; reading graded by meaning; no Podpowiedź tab', () => {
    const chk = ot.slice(ot.indexOf("getElementById('ot-check')?.addEventListener"), ot.indexOf("answers[`t${taskIndex}`].checked = { ok, total }"));
    assert.doesNotMatch(chk, /if \(mismatched\.length\) recheckOpen/);
    assert.match(chk, /data-appeal[\s\S]*recheckOpen\(task, checkKey, \[\{ it: task\.items\[i\], i, given \}\], true\)/);
    assert.match(ot, /'Zweryfikuj'/);
    assert.doesNotMatch(ot, /Moja odpowiedź też jest poprawna/);
    assert.match(ot, /gradeItem\(it, ans\.items\[i\], verdict, task\.type\)/);
    assert.match(ot, /kind === 'reading' \? AC\.gradeReading/);
    assert.match(ot, /format: task\.type === 'reading' \? 'reading'/);
    assert.doesNotMatch(ot, /t\('Podpowiedź', 'Hint'\)/);
});

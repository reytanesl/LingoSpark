import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeMissingSentences, missingSentenceGapCount, missingSentencesInstruction, missingSentenceParts } from './worksheet-maker/lib/missing-sentences.js';
import { prepareLessonAnswers, answerKeyFromLesson } from './worksheet-maker/lib/answers.js';
import { buildLessonPrompt, LESSON_TASKS, syncLessonIncludedTasks, WORKSHEET_SEQUENCE } from './worksheet-maker/lib/lesson-prompt.js';
import { lessonToDeck } from './worksheet-maker/lib/lesson-to-deck.js';
import { insertAnswerSlides } from './worksheet-maker/lib/normalize-deck.js';
import { t, taskLabel } from './worksheet-maker/lib/ui-strings.js';

const raw = () => ({
  text: 'Plastic is everywhere in the sea. [1] Most of it comes from rivers. [2]\n\nSome young people are fighting back. [3] Others pick up rubbish on beaches. [4] Their message is simple. [5]',
  gapSentences: ['Turtles often mistake bags for food.', 'Rain washes rubbish from streets into them.', 'A Dutch teenager built a machine to collect it.', 'They meet every Saturday morning.', 'We can all use less plastic.'],
  extraSentence: 'Plastic was invented more than a hundred years ago.',
});

test('box has gaps + exactly one extra, each answer used once, extra never a gap answer, never in gap order', () => {
  for (let seed = 0; seed < 30; seed++) {
    let x = seed + 1; const random = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    const ms = normalizeMissingSentences(raw(), { cefr: 'B1', random });
    assert.equal(ms.options.length, ms.answers.length + 1);
    assert.equal(new Set(ms.answers).size, ms.answers.length);
    assert.ok(!ms.answers.includes(ms.extra));
    assert.equal(ms.options['ABCDEF'.indexOf(ms.extra)], raw().extraSentence);
    ms.answers.forEach((L, i) => assert.equal(ms.options['ABCDEF'.indexOf(L)], ms.gapSentences[i]));
    assert.notDeepEqual(ms.answers, ['A', 'B', 'C', 'D', 'E']);
  }
});

test('gap at the very start is filled back in; gap count capped by level; markers renumbered', () => {
  const r = raw();
  r.text = `[1] ${r.text.replace('[1]', '[6]')}`;
  r.gapSentences = ['Opening sentence.', ...r.gapSentences.slice(1), r.gapSentences[0]];
  const ms = normalizeMissingSentences(r, { cefr: 'A2' });
  assert.ok(ms.text.startsWith('Opening sentence.'));
  assert.equal(ms.answers.length, missingSentenceGapCount('A2'));
  assert.deepEqual(missingSentenceParts(ms.text).filter((p) => p.gap).map((p) => p.gap), [1, 2, 3, 4]);
  assert.equal(missingSentenceGapCount('B2'), 6);
  assert.equal(missingSentenceGapCount('B1'), 5);
});

test('invalid tasks are dropped: extra equals a gap sentence, duplicates, too few gaps, no extra', () => {
  assert.equal(normalizeMissingSentences({ ...raw(), extraSentence: 'We can all use LESS plastic' }), null);
  assert.equal(normalizeMissingSentences({ ...raw(), gapSentences: ['Same.', 'Same.', 'c.', 'd.', 'e.'] }), null);
  assert.equal(normalizeMissingSentences({ ...raw(), extraSentence: '' }), null);
  assert.equal(normalizeMissingSentences({ text: 'One. [1] Two. [2]', gapSentences: ['a.', 'b.'], extraSentence: 'x.' }), null);
  const lesson = prepareLessonAnswers({ title: 'x', cefr: 'B1', missingSentences: { ...raw(), extraSentence: raw().gapSentences[0] } }, '');
  assert.equal(lesson.missingSentences, undefined);
});

test('instruction states the one extra sentence (EN default, PL, DE)', () => {
  assert.match(missingSentencesInstruction('en', 5), /one extra sentence/);
  assert.match(missingSentencesInstruction('en', 5), /A–F/);
  assert.match(missingSentencesInstruction('pl', 4), /Jedno zdanie jest dodatkowe/);
  assert.match(missingSentencesInstruction('de', 4), /Ein Satz ist zu viel/);
  const ms = normalizeMissingSentences(raw(), { language: 'pl' });
  assert.match(ms.instruction, /A–F/);
});

test('selectable task: label EN/PL/DE, in the picker, prompt asks for it, sequence + detection', () => {
  assert.ok(LESSON_TASKS.some((x) => x.id === 'missingSentences'));
  assert.ok(WORKSHEET_SEQUENCE.includes('missingSentences'));
  assert.equal(taskLabel('pl', 'missingSentences'), 'Brakujące zdania (jedno zbędne)');
  assert.equal(taskLabel('en', 'missingSentences'), 'Missing sentences (one extra)');
  const html = fs.readFileSync(new URL('./worksheet-maker/index.html', import.meta.url), 'utf8');
  assert.match(html, /name="wsTask" value="missingSentences"/);
  assert.match(html, /missingSentences: \(\) => msHtml/);
  const p = buildLessonPrompt({ source: { title: 'x', skillHint: 'reading', wordCount: 10, text: 'x' }, cefr: 'B2', tasks: ['missingSentences'] });
  assert.match(p, /If missingSentences is selected/);
  assert.match(p, /Number of gaps: 6/);
  assert.match(p, /exactly ONE distractor/);
  assert.match(p, /never at the very start/);
  const l = prepareLessonAnswers({ title: 'x', cefr: 'B1', missingSentences: raw() }, '');
  syncLessonIncludedTasks(l);
  assert.ok(l.includedTasks.includes('missingSentences'));
  assert.equal(prepareLessonAnswers(l, '').missingSentences, l.missingSentences, 'idempotent on re-render');
});

test('slides: missing-sentences slide + one reveal per gap; answer key lists gaps', () => {
  const lesson = prepareLessonAnswers({ title: 'Plastic', cefr: 'B1', missingSentences: raw(), includedTasks: ['missingSentences'] }, '');
  const deck = insertAnswerSlides(lessonToDeck(lesson, {}, { tasks: ['missingSentences'], language: 'en', includeSourceOnSlides: false }));
  const ms = deck.slides.filter((s) => s.role === 'missing');
  assert.equal(ms.length, 1 + 5);
  assert.equal(ms[0].options.length, 6);
  assert.equal(answerKeyFromLesson(lesson).missingSentences.length, 5);
  assert.equal(t('pl', 'msKey'), 'Brakujące zdania:');
});

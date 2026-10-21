import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLessonAnswers } from './worksheet-maker/lib/answers.js';
import { lessonToDeck } from './worksheet-maker/lib/lesson-to-deck.js';
import { buildLessonPrompt } from './worksheet-maker/lib/lesson-prompt.js';
import { ensureInlineGap, isVocabBoxTask, isVocabTranslateTask } from './worksheet-maker/lib/lesson-display.js';

const lesson = () => ({
  title: 'Mock', level: 'B1', includedTasks: ['vocabBuild'],
  vocabBuilding: [
    { instruction: 'Complete the sentences with one word from the box.', kind: 'gap',
      items: [{ prompt: 'She ____ the bus.', answer: 'catches' }, { prompt: 'They ____ a decision.', answer: 'made' }, { prompt: 'He ____ attention.', answer: 'paid' }] },
    { instruction: 'Write the missing word to finish each phrase from the video.', kind: 'gap',
      items: [{ prompt: 'I ____ (zgadzam się) with you.', answer: 'agree' }, { prompt: 'It depends (zależy) on the weather', answer: 'depends' }] },
  ],
  wordBankTask: { instruction: 'Complete the sentences with words from the box.', sentences: ['A ____ b.', 'C ____ d.'], answers: ['x', 'y'] },
});

test('box task always gets a word box with every answer', () => {
  const l = prepareLessonAnswers(lesson(), '');
  const box = l.vocabBuilding[0];
  assert.equal(box.kind, 'box');
  assert.deepEqual([...box.wordBank].sort(), ['catches', 'made', 'paid']);
  assert.notDeepEqual(box.wordBank, ['catches', 'made', 'paid']);
  assert.deepEqual([...l.wordBankTask.wordBank].sort(), ['x', 'y']);
});

test('translate task keeps inline gap with Polish cue', () => {
  const l = prepareLessonAnswers(lesson(), '');
  const tr = l.vocabBuilding[1];
  assert.equal(tr.kind, 'translate');
  assert.equal(tr.items[0].prompt, 'I __________ (zgadzam się) with you.');
  assert.equal(ensureInlineGap('Thank you (dziękuję).'), 'Thank you __________ (dziękuję).');
  assert.ok(isVocabTranslateTask({ kind: 'translate' }) && isVocabBoxTask({ kind: 'box' }));
  assert.ok(!isVocabBoxTask({ kind: 'match', instruction: 'from the box' }));
});

test('deck vocabbuild slide carries the word box', () => {
  const l = prepareLessonAnswers(lesson(), '');
  const deck = lessonToDeck(l, {}, { tasks: ['vocabBuild'], language: 'en' });
  const slides = (deck.slides || deck).filter((s) => s.role === 'vocabbuild');
  assert.equal(slides[0].wordBank.length, 3);
  assert.equal(slides[1].wordBank.length, 0);
  assert.match(slides[1].sentences[0], /_{10} \(zgadzam się\)/);
});

test('prompt describes box and translate formats', () => {
  const p = buildLessonPrompt({ source: { text: 'x', title: 't' }, cefr: 'B1', tasks: ['vocabBuild'] });
  const s = typeof p === 'string' ? p : JSON.stringify(p);
  assert.match(s, /ALWAYS include wordBank/);
  assert.match(s, /\(zgadzam się\)/);
});

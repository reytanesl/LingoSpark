import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { printTaskList, applyPrintSelection, prunePrintExclusions } from './worksheet-maker/lib/print-select.js';
import { t } from './worksheet-maker/lib/ui-strings.js';

const sheet = () => new JSDOM(`<div id="sheet">
  <div class="task-block" data-task="preReading"><div class="task"><p class="task-head"><span class="n">1.</span> Predict.</p><div class="answer">a</div></div></div>
  <div class="task-block" data-task="source"><div class="task"><p class="task-head"><span class="n">2.</span> Watch the video, then read.</p><div class="media-sheet"></div></div></div>
  <div class="task-block" data-task="missingSentences"><div class="task"><p class="task-head"><span class="n">3.</span> Read the text. Choose the sentence.</p><div class="answer">1 B</div></div></div>
  <div class="task-block" data-task="vocabBuild:0"><div class="task"><p class="task-head"><span class="n">4.</span> Match.</p></div><div class="task"><p class="task-head"><span class="n">5.</span> Complete.</p></div></div>
</div>`).window.document.getElementById('sheet');

test('checklist lists every task block in sheet order (incl. media/source + missing sentences)', () => {
  const list = printTaskList(sheet());
  assert.deepEqual(list.map((x) => x.id), ['preReading', 'source', 'missingSentences', 'vocabBuild:0']);
  assert.equal(list[2].snippet, 'Read the text. Choose the sentence.');
});

test('live print: unticked blocks hidden, visible tasks renumbered, restore undoes it', () => {
  const root = sheet();
  const undo = applyPrintSelection(root, new Set(['preReading', 'missingSentences']));
  assert.equal(root.querySelectorAll('.print-excluded').length, 2);
  const nums = [...root.querySelectorAll('.task-block:not(.print-excluded) .task-head .n')].map((n) => n.textContent);
  assert.deepEqual(nums, ['1.', '2.', '3.']);
  undo();
  assert.equal(root.querySelectorAll('.print-excluded').length, 0);
  assert.deepEqual([...root.querySelectorAll('.task-head .n')].map((n) => n.textContent), ['1.', '2.', '3.', '4.', '5.']);
});

test('PDF / Drive clone: unticked blocks (and their answer keys) are removed', () => {
  const root = sheet();
  applyPrintSelection(root, new Set(['missingSentences']), { remove: true });
  assert.equal(root.querySelector('[data-task="missingSentences"]'), null);
  assert.equal(root.querySelectorAll('.answer').length, 1);
  assert.deepEqual([...root.querySelectorAll('.task-head .n')].map((n) => n.textContent), ['1.', '2.', '3.', '4.']);
});

test('stale exclusions are pruned', () => {
  const ex = new Set(['gone', 'source']);
  prunePrintExclusions(ex, sheet());
  assert.deepEqual([...ex], ['source']);
});

test('UI: checklist next to Print, all ticked by default, used for print + PDF clone; EN/PL strings', () => {
  const html = fs.readFileSync(new URL('./worksheet-maker/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="printPickBtn"[\s\S]{0,1500}id="printBtn"/);
  assert.match(html, /box\.checked = !printExcluded\.has\(task\.id\)/);
  assert.match(html, /applyPrintSelection\(\$\('sheet'\), printExcluded\)/);
  assert.match(html, /applyPrintSelection\(clone, printExcluded, \{ remove: true \}\)/);
  assert.match(html, /@media print \{ \.print-excluded \{ display: none !important; \} \}/);
  assert.equal(t('en', 'printPick'), 'Choose tasks');
  assert.equal(t('pl', 'printPick'), 'Wybierz zadania');
  assert.match(t('pl', 'printPickHint'), /klucza odpowiedzi/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('function resetCurrentSet()'), src.indexOf('/** Snapshot of the current lesson'));

test('reset clears answers, tiles, hints and goes back to task 1 of the same set', () => {
    for (const re of [/answers = \{\};/, /tileState\)\.forEach\(\(k\) => delete tileState\[k\]\)/, /openPanels\.clear\(\)/, /taskIndex = 0;/, /view = 'lesson';/]) assert.match(fn, re);
});

test('reset persists on the server and never generates a new set or touches Keep going', () => {
    assert.match(fn, /saveProgressNow\(\)/);
    assert.doesNotMatch(fn, /generate|keepGoing|extra|lesson = /);
});

test('reset button needs a confirming second tap', () => {
    assert.match(src, /id="ot-reset-set"/);
    assert.match(src, /classList\.contains\('is-confirm'\)/);
});

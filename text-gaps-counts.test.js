import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './text-gaps-counts.js';

const C = globalThis.TextGapsCounts;

test('clamp translate / sentence gap counts to sensible ranges', () => {
    assert.equal(C.clampTranslateGapCount(5), 5);
    assert.equal(C.clampTranslateGapCount(1), 3);
    assert.equal(C.clampTranslateGapCount(99), 10);
    assert.equal(C.clampTranslateGapCount('7'), 7);
    assert.equal(C.clampTranslateGapCount('x', 6), 6);
    assert.equal(C.clampSentenceGapCount(3), 3);
    assert.equal(C.clampSentenceGapCount(0), 2);
    assert.equal(C.clampSentenceGapCount(20), 6);
});

test('resolveGapsCount uses level defaults then chosen value', () => {
    const L = { gapsTranslate: 7, gapsSentences: 4 };
    assert.equal(C.resolveGapsCount({ mode: 'translate', levelGuide: L }), 7);
    assert.equal(C.resolveGapsCount({ mode: 'sentences', levelGuide: L }), 4);
    assert.equal(C.resolveGapsCount({ mode: 'translate', chosen: 9, levelGuide: L }), 9);
    assert.equal(C.resolveGapsCount({ mode: 'sentences', chosen: 2, levelGuide: L }), 2);
    assert.equal(C.resolveGapsCount({ mode: 'translate', chosen: 100, levelGuide: L }), 10);
});

test('normalizeGapsToCount trims excess gaps and merges trailing parts', () => {
    const parts = ['A ', ' B ', ' C ', ' D ', ' E'];
    const gaps = [
        { n: 1, answer: 'one' },
        { n: 2, answer: 'two' },
        { n: 3, answer: 'three' },
        { n: 4, answer: 'four' },
    ];
    const out = C.normalizeGapsToCount(parts, gaps, 2);
    assert.equal(out.gaps.length, 2);
    assert.equal(out.gaps[0].answer, 'one');
    assert.equal(out.gaps[1].n, 2);
    assert.equal(out.parts.length, 3);
    assert.match(out.parts[2], /C/);
    // Too few: leave as-is
    const short = C.normalizeGapsToCount(['x', 'y'], [{ answer: 'a' }], 4);
    assert.equal(short.gaps.length, 1);
});

test('index.html wires count pickers into Basic + Advanced setup and generation', () => {
    const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.match(html, /id="e8-gaps-setup-translate-count-field"/);
    assert.match(html, /id="e8-gaps-setup-sentences-count-field"/);
    assert.match(html, /id="adv-gaps-setup-translate-count-field"/);
    assert.match(html, /id="adv-gaps-setup-sentences-count-field"/);
    assert.match(html, /id="e8-gaps-play-translate-count-field"/);
    assert.match(html, /id="adv-gaps-play-sentences-count-field"/);
    assert.match(html, /name="e8-gaps-setup-translate-count"/);
    assert.match(html, /name="adv-gaps-setup-sentences-count"/);
    assert.match(html, /getAdvGapsChosenCount\(mode\)/);
    assert.match(html, /getBasicGapsChosenCount\(mode\)/);
    assert.match(html, /normalizeGapsToCount\(data\.parts, data\.gaps, gapCount\)/);
    assert.match(html, /normalizeGapsToCount\(data\.parts, data\.gaps, nGaps\)/);
    assert.match(html, /syncBasicGapsCountPickers\('setup'\)/);
    assert.match(html, /syncAdvGapsCountPickers\('setup'\)/);
    assert.match(html, /text-gaps-counts\.js/);
    // Relevant picker only: sentences field starts hidden
    assert.match(html, /id="e8-gaps-setup-sentences-count-field"[^>]*style="display:none;"/);
    assert.match(html, /id="adv-gaps-setup-sentences-count-field"[^>]*style="display:none;"/);
});

test('static allowlist serves text-gaps-counts.js', () => {
    const allow = fs.readFileSync(new URL('./static-allowlist.js', import.meta.url), 'utf8');
    assert.match(allow, /text-gaps-counts\.js/);
});

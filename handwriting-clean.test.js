import test from 'node:test';
import assert from 'node:assert/strict';
import { stripStruckText, removeReportedFragments, cleanHandwrittenTranscript, countEssayWords, HANDWRITING_STRIKE_RULES } from './handwriting-clean.js';

test('strips ~~ ~~, <s>, <strike>, <del> with their content', () => {
    assert.equal(stripStruckText('I ~~goed~~ went home.'), 'I went home.');
    assert.equal(stripStruckText('It was <s>very</s> really <del class="x">bad</del> good.'), 'It was really good.');
    assert.equal(stripStruckText('A <STRIKE>b c</STRIKE> d'), 'A d');
    assert.equal(stripStruckText('Line one ~~whole\nline~~ end'), 'Line one end');
});

test('strips [deleted]/[crossed out]/Polish markers and stray markup', () => {
    assert.equal(stripStruckText('We [crossed out: has] have time [deleted] now.'), 'We have time now.');
    assert.equal(stripStruckText('To [skreślone] jest'), 'To jest');
    assert.equal(stripStruckText('odd ~~ tilde </del> left'), 'odd tilde left');
});

test('strips U+0336 combining strike characters', () => {
    const struck = 'b\u0336a\u0336d\u0336';
    assert.equal(stripStruckText(`a ${struck} good idea`), 'a good idea');
    assert.equal(stripStruckText('słowo\u0338 ok').includes('\u0338'), false);
});

test('keeps paragraphs and leaves clean text untouched', () => {
    const clean = 'Dear Sir,\n\nI am writing to complain.\n\nYours, Anna';
    assert.equal(stripStruckText(clean), clean);
    assert.equal(stripStruckText('Para one ~~x~~.\n\nPara two.'), 'Para one.\n\nPara two.');
    assert.equal(stripStruckText('He said <<err>>has<</err>> it'), 'He said <<err>>has<</err>> it');
});

test('removes reported fragments the model copied unmarked, guarded', () => {
    assert.equal(removeReportedFragments('I think that in my opinion it is fine.', ['in my opinion']), 'I think that it is fine.');
    // ambiguous (twice) or too short → kept
    assert.equal(removeReportedFragments('so so', ['so']), 'so so');
    assert.equal(removeReportedFragments('a big big dog and big', ['big']), 'a big big dog and big');
    // whole-word only
    assert.equal(removeReportedFragments('important things', ['port']), 'important things');
});

test('cleanHandwrittenTranscript does not double-remove marked fragments', () => {
    const t = 'I ~~very important~~ think it is very important to go.';
    assert.equal(cleanHandwrittenTranscript(t, ['very important']), 'I think it is very important to go.');
    assert.equal(cleanHandwrittenTranscript('We goed went there.', ['goed']), 'We went there.');
});

test('word count uses cleaned text', () => {
    assert.equal(countEssayWords(cleanHandwrittenTranscript('One ~~two~~ three, it’s well-known.')), 4);
    assert.equal(countEssayWords(''), 0);
});

test('prompt rules mention the key behaviours', () => {
    for (const re of [/struck through/, /replacement/, /caret/, /unsure/, /removedFragments/]) assert.match(HANDWRITING_STRIKE_RULES, re);
});

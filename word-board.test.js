import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BOARD_SIZE,
    CENTER,
    applyPlacement,
    buildBagFromWords,
    createMatch,
    evaluatePlacement,
    parseWordList,
    playMove,
} from './word-board-engine.js';

test('parseWordList accepts lines and commas, unique A–Z words', () => {
    const list = parseWordList('apple\nBANANA, cherry; apple\nx\ntoolongwordfortheboardxx');
    assert.deepEqual(list, ['APPLE', 'BANANA', 'CHERRY']);
});

test('bag includes letters from the list plus blanks', () => {
    const bag = buildBagFromWords(['CAT', 'DOG'], 1);
    assert.ok(bag.includes('C'));
    assert.ok(bag.includes('A'));
    assert.ok(bag.filter((t) => t === '_').length >= 2);
});

test('first word must cover centre and be on the list', () => {
    const words = ['CAT', 'DOG', 'BIRD', 'FISH', 'LION'];
    const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    const bad = evaluatePlacement(board, [
        { row: 0, col: 0, letter: 'C' },
        { row: 0, col: 1, letter: 'A' },
        { row: 0, col: 2, letter: 'T' },
    ], words);
    assert.equal(bad.ok, false);

    const good = evaluatePlacement(board, [
        { row: CENTER, col: CENTER - 1, letter: 'C' },
        { row: CENTER, col: CENTER, letter: 'A' },
        { row: CENTER, col: CENTER + 1, letter: 'T' },
    ], words);
    assert.equal(good.ok, true);
    assert.deepEqual(good.words, ['CAT']);
    assert.ok(good.score > 0);
});

test('createMatch + playMove scores and advances turn', () => {
    const match = createMatch({
        words: ['CAT', 'DOG', 'BIRD', 'FISH', 'LION', 'BEAR'],
        teamNames: ['Red', 'Blue'],
        seed: 42,
    });
    // Force a known rack for team 0.
    match.teams[0].rack = ['C', 'A', 'T', 'X', 'Y', 'Z', 'Q'];
    const res = playMove(match, [
        { row: CENTER, col: CENTER - 1, letter: 'C' },
        { row: CENTER, col: CENTER, letter: 'A' },
        { row: CENTER, col: CENTER + 1, letter: 'T' },
    ]);
    assert.equal(res.ok, true);
    assert.equal(match.teams[0].score, res.result.score);
    assert.equal(match.turn, 1);
    assert.ok(match.found.has('CAT'));
    assert.ok(match.board[CENTER][CENTER]);
});

test('reject words not on the teacher list', () => {
    const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    const filled = applyPlacement(board, [
        { row: CENTER, col: CENTER - 1, letter: 'C', blank: false },
        { row: CENTER, col: CENTER, letter: 'A', blank: false },
        { row: CENTER, col: CENTER + 1, letter: 'T', blank: false },
    ]);
    const res = evaluatePlacement(filled, [
        { row: CENTER + 1, col: CENTER, letter: 'X' },
    ], ['CAT', 'DOG', 'BIRD', 'FISH', 'LION']);
    assert.equal(res.ok, false);
    assert.match(res.error, /not on your word list/i);
});

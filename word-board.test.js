import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BOARD_SIZE,
    CENTER,
    RACK_SIZE,
    buildBagFromWords,
    createMatch,
    evaluatePlacement,
    parseWordList,
    playMove,
    rackCanFormAny,
    rackCanSpell,
    refillRack,
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

test('first word must cover centre; non-list words are allowed', () => {
    const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    const bad = evaluatePlacement(board, [
        { row: 0, col: 0, letter: 'C' },
        { row: 0, col: 1, letter: 'A' },
        { row: 0, col: 2, letter: 'T' },
    ]);
    assert.equal(bad.ok, false);

    const good = evaluatePlacement(board, [
        { row: CENTER, col: CENTER - 1, letter: 'C' },
        { row: CENTER, col: CENTER, letter: 'A' },
        { row: CENTER, col: CENTER + 1, letter: 'T' },
    ]);
    assert.equal(good.ok, true);
    assert.deepEqual(good.words, ['CAT']);
    assert.ok(good.score > 0);

    // Words need not appear on the teacher list.
    const other = evaluatePlacement(board, [
        { row: CENTER, col: CENTER - 1, letter: 'Z' },
        { row: CENTER, col: CENTER, letter: 'O' },
        { row: CENTER, col: CENTER + 1, letter: 'O' },
    ]);
    assert.equal(other.ok, true);
    assert.deepEqual(other.words, ['ZOO']);
});

test('createMatch + playMove scores and advances turn', () => {
    const match = createMatch({
        words: ['CAT', 'DOG', 'BIRD', 'FISH', 'LION', 'BEAR'],
        teamNames: ['Red', 'Blue'],
        seed: 42,
    });
    match.teams[0].rack = ['C', 'A', 'T', 'X', 'Y', 'Z', 'Q'];
    const res = playMove(match, [
        { row: CENTER, col: CENTER - 1, letter: 'C' },
        { row: CENTER, col: CENTER, letter: 'A' },
        { row: CENTER, col: CENTER + 1, letter: 'T' },
    ]);
    assert.equal(res.ok, true);
    assert.equal(match.teams[0].score, res.result.score);
    assert.equal(match.turn, 1);
    assert.ok(match.board[CENTER][CENTER]);
    assert.equal(match.found, undefined);
});

test('rackCanSpell treats blanks as wildcards', () => {
    assert.equal(rackCanSpell(['C', 'A', 'T'], 'CAT'), true);
    assert.equal(rackCanSpell(['C', '_', 'T'], 'CAT'), true);
    assert.equal(rackCanSpell(['C', 'A'], 'CAT'), false);
});

test('opening racks can form a vocab word and are dealt independently', () => {
    const seeds = [];
    for (let seed = 1; seed <= 40; seed++) {
        const match = createMatch({
            words: ['CAT', 'DOG', 'BIRD', 'FISH', 'LION', 'BEAR', 'FROG'],
            teamNames: ['Red', 'Blue', 'Green'],
            seed,
        });
        const forms = match.teams.map((team) => {
            assert.equal(team.rack.length, RACK_SIZE, `seed ${seed} rack size`);
            assert.ok(
                rackCanFormAny(team.rack, match.words),
                `seed ${seed} team ${team.name} rack ${team.rack.join('')} forms nothing`,
            );
            return team.rack.join('');
        });
        seeds.push(forms.join('|'));
    }
    // Across seeds, team racks should not all be identical clones.
    assert.ok(new Set(seeds).size > 1);
});

test('refillRack picks independent seed words (different salts can differ)', () => {
    const words = ['CAT', 'DOG', 'BIRD', 'FISH', 'LION', 'BEAR', 'FROG', 'WOLF'];
    const racks = [];
    for (let salt = 1; salt <= 12; salt++) {
        const bag = buildBagFromWords(words, 99);
        const rack = refillRack([], bag, words, { seed: 99, salt });
        assert.ok(rackCanFormAny(rack, words), `salt ${salt} → ${rack.join('')}`);
        racks.push(rack.join(''));
    }
    assert.ok(new Set(racks).size > 1, 'expected varied racks across salts');
});

test('refillRack repairs a dead kept hand when the bag still has a word', () => {
    const words = ['CAT', 'DOG', 'BIRD', 'FISH', 'LION'];
    const bag = ['C', 'A', 'T', 'D', 'O', 'G', 'B', 'I', 'R'];
    const rack = refillRack(['Q', 'X', 'Z'], bag, words, { seed: 7, salt: 1 });
    assert.equal(rack.length, RACK_SIZE);
    assert.ok(rackCanFormAny(rack, words), `dead hand became ${rack.join('')}`);
});

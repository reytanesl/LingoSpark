import assert from 'node:assert/strict';
import test from 'node:test';
import './vocab-auction-chips.js';

const A = globalThis.AuctionChips;

test('chips split greedily; stacks escalate to bigger chips only when the pile gets tall', () => {
    assert.deepEqual(A.breakdown(150, [100, 50, 10]), [100, 50]);
    assert.deepEqual(A.breakdown(670, [100, 50, 10]), [100, 100, 100, 100, 100, 100, 50, 10, 10]);
    assert.deepEqual(A.breakdown(1150), [1000, 100, 50]);
    assert.deepEqual(A.chipsFor(300), [100, 100, 100]);
    assert.ok(A.chipsFor(4000).length <= 14);
    assert.equal(A.chipsFor(4000).reduce((s, v) => s + v, 0), 4000);
    assert.deepEqual(A.breakdown(0), []);
});

test('tapping a chip on a word adds it in 10-chip steps and never lets the total pass the bankroll', () => {
    const bets = { yesterday: 0, breakfast: 0, old: 0, teacher: 0 };
    bets.old = A.addChip(bets, 'old', 100, 1000);
    assert.equal(bets.old, 100);
    bets.old = A.addChip(bets, 'old', 500, 1000);
    assert.equal(bets.old, 600);
    bets.yesterday = A.addChip(bets, 'yesterday', 500, 1000);
    assert.equal(bets.yesterday, 400, 'only the 400 left in hand can go down');
    assert.equal(A.addChip(bets, 'teacher', 10, 1000), 0, 'nothing left to bet');
    assert.equal(A.sumBets(bets), 1000);
    // Odd bankroll after a hint: still 10-chip steps.
    assert.equal(A.addChip({ a: 0 }, 'a', 100, 85), 80);
});

test('the minus button takes a chip back off and never goes below zero', () => {
    const bets = { old: 150 };
    assert.equal(A.removeChip(bets, 'old', 100), 50);
    assert.equal(A.removeChip(bets, 'old', 500), 0);
    assert.equal(A.removeChip({ old: 0 }, 'old', 10), 0);
});

test('settlement keeps the original rules: correct bet paid 2x, wrong bets lost', () => {
    const mixed = A.settleBets({ yesterday: 150, breakfast: 0, old: 300, teacher: 0 }, 'old', 1000);
    assert.equal(mixed.after, 1150);
    assert.equal(mixed.net, 150);
    assert.equal(mixed.payout, 600);
    assert.deepEqual(mixed.lost, [{ word: 'yesterday', amount: 150 }]);
    const loss = A.settleBets({ sky: 400, teacher: 0 }, 'teacher', 1150);
    assert.equal(loss.after, 750);
    assert.equal(loss.won, false);
    assert.equal(A.settleBets({ Old: 200 }, 'old', 500).after, 700, 'case-insensitive match');
    const allIn = A.settleBets({ a: 500, b: 500 }, 'c', 1000);
    assert.equal(allIn.after, 0);
    assert.equal(A.settleTyped(200, true, 800).after, 1000);
    assert.equal(A.settleTyped(200, false, 800).after, 600);
});

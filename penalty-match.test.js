import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import './penalty-match-core.js';

const P = globalThis.PenaltyMatchCore;
const items = [
    { term: 'dog', definition: 'pies' }, { term: 'cat', definition: 'kot' },
    { term: 'apple', definition: 'jabłko' }, { term: 'book', definition: 'książka' },
    { term: 'water', definition: 'woda' }, { term: 'sun', definition: 'słońce' },
];

test('parses glossary lines and the original one-word-per-line format', () => {
    assert.deepEqual(P.parseList('Dog\nPies\nCat\nKot'), [{ term: 'Dog', definition: 'Pies' }, { term: 'Cat', definition: 'Kot' }]);
    assert.deepEqual(P.parseList('well-built = dobrze zbudowany\nbald - łysy\nangry: zły\nbook\tksiążka'), [
        { term: 'well-built', definition: 'dobrze zbudowany' }, { term: 'bald', definition: 'łysy' },
        { term: 'angry', definition: 'zły' }, { term: 'book', definition: 'książka' },
    ]);
    // duplicates (case-insensitive) and incomplete rows are dropped
    assert.deepEqual(P.parseList('dog = pies\nDOG = pies 2\nlonely'), [{ term: 'dog', definition: 'pies' }]);
    assert.deepEqual(P.cleanItems([{ term: ' x ', def: ' y ' }, { term: '', definition: 'z' }]), [{ term: 'x', definition: 'y' }]);
});

test('scoring: +10 snap a real pair, -5 tap a wrong pair, -2 miss a real pair, 0 for letting a wrong pair pass', () => {
    const g = P.createGame({ items, rng: P.mulberry32(7) });
    const play = (wantMatch, action) => {
        let cur;
        do { cur = P.nextPair(g, 0); if (cur.isMatch !== wantMatch) P.resolve(g, cur.isMatch ? 'tap' : 'timeout', 0); } while (cur.isMatch !== wantMatch);
        const before = g.score;
        return { ...P.resolve(g, action, 0), before };
    };
    const c = play(true, 'tap');
    assert.equal(c.outcome, 'correct'); assert.equal(g.score, c.before + 10);
    const w = play(false, 'tap');
    assert.equal(w.outcome, 'wrong'); assert.equal(w.points, -5); assert.equal(g.score, Math.max(0, w.before - 5));
    const m = play(true, 'timeout');
    assert.equal(m.outcome, 'missed'); assert.equal(m.points, -2); assert.equal(g.score, Math.max(0, m.before - 2));
    const p = play(false, 'timeout');
    assert.equal(p.outcome, 'passed'); assert.equal(p.points, 0); assert.equal(g.score, p.before);
    assert.equal(P.resolve(g, 'tap', 0), null, 'a pair can only be resolved once');
});

test('score never goes below zero', () => {
    const g = P.createGame({ items, rng: P.mulberry32(3), matchChance: 0 });
    for (let i = 0; i < 5; i++) { P.nextPair(g, 0); P.resolve(g, 'tap', 0); }
    assert.equal(g.score, 0);
    assert.equal(g.stats.wrong, 5);
});

test('wrong pairs never show the real meaning; real pairs always do', () => {
    const list = [...items, { term: 'puppy', definition: 'pies' }];   // shared meaning must not count as a decoy
    const g = P.createGame({ items: list, rng: P.mulberry32(11) });
    for (let i = 0; i < 300; i++) {
        const c = P.nextPair(g, 0);
        const shown = c.termOnTop ? c.bottom : c.top;
        const term = c.termOnTop ? c.top : c.bottom;
        assert.equal(term, c.base.term);
        if (c.isMatch) assert.equal(shown, c.base.definition);
        else assert.notEqual(shown.toLowerCase(), c.base.definition.toLowerCase());
        P.resolve(g, 'timeout', 0);
    }
    const share = g.stats.missed / g.round;
    assert.ok(share > 0.3 && share < 0.5, `about 40% real pairs (${share})`);
});

test('reaching 100 finishes the game with stats, stars and a review list (trouble words first)', () => {
    const g = P.createGame({ items, rng: P.mulberry32(5) });
    let n = 0;
    while (!g.finished && n++ < 500) {
        const c = P.nextPair(g, n * 1000);
        P.resolve(g, c.isMatch ? (c.base.term === 'cat' ? 'timeout' : 'tap') : 'timeout', n * 1000 + 500);
    }
    assert.ok(g.finished);
    assert.equal(P.nextPair(g), null);
    const s = P.summary(g);
    assert.equal(s.reached, true);
    assert.ok(s.score >= 100);
    assert.equal(s.stats.correct * 10 - s.stats.missed * 2 >= 100, true);
    assert.ok(s.durationMs > 0);
    assert.ok(s.stars >= 1 && s.stars <= 3);
    if (s.stats.missed) assert.equal(s.review[0].term, 'cat');
});

test('longer pairs get extra reading time (capped)', () => {
    assert.equal(P.roundDuration(2500, 'dog', 'pies'), 2500);
    assert.equal(P.roundDuration(1500, 'a'.repeat(34), ''), 1500 + 10 * 40);
    assert.equal(P.roundDuration(1500, 'a'.repeat(500), ''), 1500 + 4000);
});

test('refuses lists that cannot make a wrong pair', () => {
    assert.throws(() => P.createGame({ items: [{ term: 'a', definition: 'x' }] }));
    assert.throws(() => P.createGame({ items: [{ term: 'a', definition: 'x' }, { term: 'b', definition: 'X' }] }));
});

test('site wiring: card in Vocab Review, #/penalty-match route, game key and analytics key are allowed', () => {
    const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    const db = readFileSync(new URL('./db.js', import.meta.url), 'utf8');
    const page = readFileSync(new URL('./penalty-match.html', import.meta.url), 'utf8');
    const vocabSection = index.slice(index.indexOf('id="section-vocab"'), index.indexOf('id="section-live"'));
    assert.match(vocabSection, /href="#\/penalty-match"/);
    assert.match(index, /id="screen-penalty-match"/);
    assert.match(index, /penalty-match\.html\?embed=1/);
    assert.match(index, /root === 'penalty-match'/);
    assert.match(db, /'penalty_match'/);
    assert.match(db, /'penalty-match',/);
    assert.match(page, /gameKey: 'penalty_match'/);
    assert.match(page, /assets\/brand\/lingospark-logo-red\.svg/);
    assert.match(page, /penalty-match-core\.js/);
});

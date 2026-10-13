import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './challenge-deck.js';
import { PUBLIC_SCRIPTS } from './static-allowlist.js';

const { planDeck, MAX_EDGES } = globalThis.ChallengeDeck;

test('oldest stays on top while newer challenges queue underneath', () => {
    const a = planDeck([], ['c1']);
    assert.equal(a.topId, 'c1');
    assert.deepEqual(a.added, ['c1']);
    const b = planDeck(['c1'], ['c1', 'c2', 'c3']);
    assert.equal(b.topId, 'c1');
    assert.equal(b.topChanged, false, 'arrivals must not change the top card');
    assert.deepEqual(b.added, ['c2', 'c3']);
    assert.deepEqual(b.slots.map((s) => s.depth), [0, 1, 2]);
});

test('resolving the top lifts the next card', () => {
    const p = planDeck(['c1', 'c2', 'c3'], ['c2', 'c3']);
    assert.deepEqual(p.removed, ['c1']);
    assert.equal(p.topId, 'c2');
    assert.equal(p.topChanged, true);
    const q = planDeck(['c1', 'c2', 'c3'], ['c1', 'c3']);
    assert.equal(q.topChanged, false, 'resolving a buried card keeps the top');
});

test('at most MAX_EDGES edges visible, rest counted as +N', () => {
    assert.equal(MAX_EDGES, 3);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const p = planDeck([], ids);
    assert.deepEqual(p.slots.map((s) => s.visible), [true, true, true, true, false, false]);
    assert.equal(p.extra, 2);
    assert.equal(planDeck([], ['a', 'b']).extra, 0);
});

test('wiring: deck script allowlisted and loaded; host uses it for Word Cannon; shot feed bars removed', () => {
    assert.ok(PUBLIC_SCRIPTS.has('challenge-deck.js'));
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.match(html, /<script src="challenge-deck\.js" defer><\/script>/);
    assert.ok(html.indexOf('challenge-deck.js') < html.indexOf('live-game-client.js'));
    const client = readFileSync(new URL('./live-game-client.js', import.meta.url), 'utf8');
    assert.match(client, /window\.ChallengeDeck\.render\(panel, challenges/);
    const wc = readFileSync(new URL('./word-cannon-client.js', import.meta.url), 'utf8');
    assert.doesNotMatch(wc, /wc-feed|pushFeed/);
    const css = readFileSync(new URL('./word-cannon.css', import.meta.url), 'utf8');
    assert.doesNotMatch(css, /wc-feed/);
    const deckCss = readFileSync(new URL('./challenge-deck.css', import.meta.url), 'utf8');
    assert.match(deckCss, /\.live-challenge-deck > \.live-host-challenge-card\.is-top \{ transform: none; \}/);
});

test('Lucky Lanterns uses the same deck with its own compact styling', () => {
    const client = readFileSync(new URL('./live-game-client.js', import.meta.url), 'utf8');
    assert.match(client, /live-host-lanterns'\)\) && window\.ChallengeDeck/);
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="challenge-deck\.css">/);
    const shared = readFileSync(new URL('./challenge-deck.css', import.meta.url), 'utf8');
    assert.doesNotMatch(shared, /body\.live-host-(cannon|lanterns)/, 'shared CSS stays game-neutral');
    const ll = readFileSync(new URL('./lucky-lanterns.css', import.meta.url), 'utf8');
    assert.match(ll, /body\.live-host-lanterns \.live-host-challenge-panel\.live-challenge-deck \{/);
});

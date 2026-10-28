// The Bridge (tide-bridge) server rules: round tables, co-op counter, dual timers, shore challenge, medals, endings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ROUND_COUNT, ROUNDS, ROUND_TARGETS, SPANS_BY_MINUTES, TIDE_PER_SPAN_SECONDS, MIX_TYPED_PROBABILITY, ROUND_WAVE_SECONDS,
    TIDE_BETWEEN_MS, TIDE_TRANSITION_MS, TIDE_FAIL_MS, TIDE_SHRINK_FACTOR, SHORE_BREAKERS,
    spansForRound, roundHasShore, shoreAfterSpans, neededCorrectForRound, shoreNeededForRound, tideLimitMs, tideTier,
    roundConfig, createTideMatch, tickTide, submitTideAnswer, tideQuestionPayload, tidePublicView, tideWinners,
    finishTideEarly, settleTideChallenge, typedProbability,
} from './tide-bridge.js';
import { simulate, DECK } from './tide-bridge-sim.mjs';

const mkPlayers = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `P${i}` }));
const mk = ({ players = 5, ...o } = {}) => createTideMatch({ players: mkPlayers(players), deck: DECK, answerMode: 'recognise', gameMinutes: 10, seed: 7, now: 0, ...o });
/** answer the current span / shore challenge correctly with the first `n` unlocked players */
function answerCorrect(match, n, now) {
    let last;
    for (let k = 0; k < n; k++) {
        const pid = match.playerOrder.find((id) => !match.players[id].locked);
        if (!pid) break;
        const q = tideQuestionPayload(match, pid);
        const text = match.phase === 'breaker' ? match.breaker.answer : match.assignments[pid].entry.term;
        last = submitTideAnswer(match, pid, text, q.questionId, now);
        if (match.phase !== 'vocab' && match.phase !== 'breaker') break;
    }
    return last;
}

test('there are exactly six rounds with the documented names and bridge themes', () => {
    assert.equal(ROUND_COUNT, 6);
    assert.deepEqual(ROUNDS.map((r) => r.name), ['Gentle Start', 'Warming Up', 'Speed Test', 'Pressure On', 'Storm Surge', 'Final Escape']);
    assert.deepEqual(ROUNDS.map((r) => r.bridge), ['Wooden Footbridge', 'Cobblestone Arch', 'High Stone Viaduct', 'Raging Rapids Crossing', 'Iron Cliff Span', 'The Grand Citadel Bridge']);
    assert.deepEqual(ROUND_TARGETS, [2, 3, 4, 4, 5, 5]);
});

test('spans per bridge: tables per match length, early rounds easy, never shrinking below 1', () => {
    for (const m of [3, 5, 8, 10]) {
        const t = SPANS_BY_MINUTES[m];
        assert.equal(t.length, 6);
        assert.ok(t.every((n) => n >= 1));
        assert.ok(t.every((n, i) => i === 0 || n >= t[i - 1]), `spans must not decrease (${m} min)`);
        assert.ok(t[0] <= 2);
    }
    assert.deepEqual(SPANS_BY_MINUTES[10], [2, 3, 3, 4, 4, 5]);
    assert.deepEqual(SPANS_BY_MINUTES[8], [2, 3, 3, 3, 4, 4]);
    assert.deepEqual(SPANS_BY_MINUTES[5], [2, 2, 3, 3, 3, 4]);
    assert.equal(spansForRound(10, 6), 5);
    assert.equal(spansForRound(7, 1), spansForRound(5, 1)); // unknown lengths normalise like the rest of Live Spark
});

test('needed-correct rule: round target, capped by the player count when under the target', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((r) => neededCorrectForRound(r, 30)), [2, 3, 4, 4, 5, 5]);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((r) => neededCorrectForRound(r, 2)), [2, 2, 2, 2, 2, 2]);
    assert.equal(neededCorrectForRound(3, 3), 3);
    assert.equal(neededCorrectForRound(6, 1), 1);
    // shore: one lower than the round's target, min 2, capped by players
    assert.deepEqual([2, 3, 4, 5, 6].map((r) => shoreNeededForRound(r, 30)), [2, 3, 3, 4, 4]);
    assert.equal(shoreNeededForRound(5, 2), 2);
});

test('round tide limit shrinks every round (tide rises faster) for every match length', () => {
    for (const m of [3, 5, 8, 10]) {
        let prev = Infinity;
        for (let r = 1; r <= 6; r++) {
            const lim = tideLimitMs(m, r);
            assert.ok(lim > 0 && lim < prev, `round ${r} (${m} min) limit ${lim} must be < ${prev}`);
            assert.ok(lim <= prev * TIDE_SHRINK_FACTOR + 1000);
            prev = lim;
        }
    }
    // base per-span budget shrinks too, and the waves speed up
    assert.ok(TIDE_PER_SPAN_SECONDS.every((v, i) => i === 0 || v < TIDE_PER_SPAN_SECONDS[i - 1]));
    assert.ok(ROUND_WAVE_SECONDS.every((v, i) => i === 0 || v < ROUND_WAVE_SECONDS[i - 1]));
    // a competent class (~9 s per card) can finish: every round leaves >= 1.3x of that per event
    for (const m of [3, 5, 8, 10]) {
        for (let r = 1; r <= 6; r++) {
            const spans = spansForRound(m, r);
            const events = spans + (roundHasShore(r, spans) ? 1 : 0);
            assert.ok(tideLimitMs(m, r) / 1000 / events >= 9 * 1.0, `round ${r} (${m} min) too tight`);
        }
    }
});

test('shore challenge placement: one per round after the middle span; none in R1; R2 only with >= 3 spans', () => {
    assert.equal(roundHasShore(1, 5), false);
    assert.equal(roundHasShore(2, 2), false);
    assert.equal(roundHasShore(2, 3), true);
    for (const r of [3, 4, 5, 6]) { assert.equal(roundHasShore(r, 2), true); assert.equal(roundHasShore(r, 1), false); }
    assert.deepEqual([2, 3, 4, 5].map(shoreAfterSpans), [1, 2, 2, 3]);
    assert.equal(roundConfig(10, 3).shoreAfter, 2);
    assert.equal(roundConfig(10, 1).shoreAfter, null);
});

test('typed/mix bias: Random Mix typed probability rises R1 40% -> R6 90%; MC-only / typed-only are respected', () => {
    assert.deepEqual(MIX_TYPED_PROBABILITY, [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    const share = (answerMode, round) => {
        const m = mk({ players: 30, answerMode, seed: 11 + round });
        let typed = 0; let total = 0;
        for (let rep = 0; rep < 40; rep++) {
            m.round = round; // deal a fresh span for that round
            m.tide.runningSince = 0;
            tickTide(m, 0);
            // re-deal directly through a between/vocab cycle
            m.phase = 'between'; m.betweenNext = 'vocab'; m.phaseEndsAt = 0;
            tickTide(m, 1);
            for (const a of Object.values(m.assignments)) { total += 1; if (a.inputMode === 'typed') typed += 1; }
        }
        return typed / total;
    };
    assert.ok(Math.abs(share('randomise', 1) - 0.4) < 0.08);
    assert.ok(Math.abs(share('randomise', 6) - 0.9) < 0.06);
    assert.ok(share('randomise', 6) > share('randomise', 3) && share('randomise', 3) > share('randomise', 1));
    assert.equal(share('recognise', 6), 0);
    assert.equal(share('realise', 1), 1);
    assert.equal(typedProbability(4), 0.7);
});

test('medals by bridges completed: 0-2 Bronze, 3-4 Silver, 5-6 Gold with the document titles', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((n) => tideTier(n).id), ['bronze', 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold']);
    assert.equal(tideTier(0).title, 'Swept Back to Shore');
    assert.equal(tideTier(4).title, 'Mid-Channel Explorers');
    assert.equal(tideTier(6).title, 'Reached the Far Cliff');
});

test('shore bank: 12-20 items, tagged easy/normal/hard, ids unique, every level has items', () => {
    assert.ok(SHORE_BREAKERS.length >= 12 && SHORE_BREAKERS.length <= 20);
    assert.equal(new Set(SHORE_BREAKERS.map((b) => b.id)).size, SHORE_BREAKERS.length);
    for (const level of ['easy', 'normal', 'hard']) assert.ok(SHORE_BREAKERS.filter((b) => b.level === level).length >= 4, level);
    assert.ok(SHORE_BREAKERS.every((b) => b.prompt && b.answer));
});

test('a span needs the target number of DIFFERENT players; wrong answers deduct nothing; pause then next span', () => {
    const m = mk({ players: 5 }); // R1 target 2
    assert.equal(m.phase, 'vocab');
    assert.equal(m.neededCorrect, 2);
    const p0 = tideQuestionPayload(m, 'p0');
    const wrong = submitTideAnswer(m, 'p0', 'nope-nope', p0.questionId, 1000);
    assert.equal(wrong.result.correct, false);
    assert.equal(m.gotCorrect, 0);
    answerCorrect(m, 1, 2000);
    assert.equal(m.gotCorrect, 1);
    // same player cannot count twice
    assert.throws(() => submitTideAnswer(m, 'p0', m.assignments.p0.entry.term, null, 2100), /Already answered/);
    const out = answerCorrect(m, 1, 3000);
    assert.equal(out.cleared, true);
    assert.equal(m.phase, 'between');
    assert.equal(m.spansLaid, 1);
    assert.equal(m.spanIndex, 1);
    assert.equal(m.phaseEndsAt, 3000 + TIDE_BETWEEN_MS);
    assert.throws(() => submitTideAnswer(m, 'p2', 'x', null, 3500), /Wait for the next/);
    assert.equal(tickTide(m, 3000 + TIDE_BETWEEN_MS).changed, true);
    assert.equal(m.phase, 'vocab');
    assert.equal(m.gotCorrect, 0);
});

test('fewer players than the target: needed = player count (2 players clear a 5-answer round)', () => {
    const m = mk({ players: 2, gameMinutes: 3 });
    for (const [r, want] of [[1, 2], [3, 2], [6, 2]]) assert.equal(neededCorrectForRound(r, 2), want);
    assert.equal(m.neededCorrect, 2);
});

test('round tide timer: starts with the round, rises through the shore challenge, PAUSES in pause and transition', () => {
    const m = mk({ players: 5, gameMinutes: 10 }); // R1: 2 spans, no shore
    const limit = m.tide.limitMs;
    assert.equal(limit, tideLimitMs(10, 1));
    const v0 = tidePublicView(m, { now: 10_000 });
    assert.ok(Math.abs(v0.tideRatio - 10_000 / limit) < 1e-9);
    assert.equal(v0.tideRunning, true);
    answerCorrect(m, 2, 10_000); // span 1 cleared -> between (paused)
    assert.equal(m.phase, 'between');
    const a = tidePublicView(m, { now: 10_000 });
    const b = tidePublicView(m, { now: 10_000 + TIDE_BETWEEN_MS - 1 });
    assert.equal(a.tideElapsedMs, b.tideElapsedMs, 'tide frozen during the pause');
    assert.equal(b.tideRunning, false);
    tickTide(m, 10_000 + TIDE_BETWEEN_MS);
    assert.equal(m.phase, 'vocab');
    const c = tidePublicView(m, { now: 10_000 + TIDE_BETWEEN_MS + 5000 });
    assert.equal(c.tideElapsedMs, 10_000 + 5000, 'tide resumes where it paused (paused time not counted)');
    // clear the last span -> roundTransition: paused, round 2 starts with a FRESH (smaller) tide
    const t1 = 10_000 + TIDE_BETWEEN_MS + 5000;
    answerCorrect(m, 2, t1);
    assert.equal(m.phase, 'roundTransition');
    assert.equal(m.transition.kind, 'cleared');
    assert.equal(m.roundsCompleted, 1);
    const d1 = tidePublicView(m, { now: t1 }).tideElapsedMs;
    assert.equal(tidePublicView(m, { now: t1 + 3000 }).tideElapsedMs, d1);
    const r = tickTide(m, t1 + TIDE_TRANSITION_MS);
    assert.equal(r.newRound, true);
    assert.equal(m.round, 2);
    assert.equal(m.phase, 'vocab');
    assert.equal(m.tide.elapsedMs, 0);
    assert.ok(m.tide.limitMs < limit + 1);
    assert.equal(m.tide.limitMs, tideLimitMs(10, 2));
});

test('shore challenge runs mid-bridge after the middle span and rises with the tide, then the bridge continues', () => {
    const m = mk({ players: 6, gameMinutes: 10 });
    let now = 0;
    const step = () => { now += TIDE_BETWEEN_MS; tickTide(m, now); };
    // R1 (2 spans, no shore) then R2 (3 spans, shore after span 2)
    for (let i = 0; i < 2; i++) { answerCorrect(m, 9, now += 100); if (m.phase === 'between') step(); }
    now += TIDE_TRANSITION_MS; tickTide(m, now);
    assert.equal(m.round, 2);
    assert.equal(m.hasShore, true);
    assert.equal(m.shoreAfter, 2);
    for (let i = 0; i < 2; i++) { answerCorrect(m, 9, now += 100); if (m.phase === 'between') step(); }
    assert.equal(m.phase, 'breaker', 'shore after span 2 of 3');
    assert.equal(m.neededCorrect, shoreNeededForRound(2, 6));
    assert.equal(m.breaker.level, 'easy');
    const pubShore = tidePublicView(m, { now });
    assert.equal(pubShore.tideRunning, true);
    const spansBefore = m.spansLaid;
    answerCorrect(m, 9, now += 100); // clear the shore challenge: not counted as a span / bridge
    assert.equal(m.spansLaid, spansBefore);
    assert.equal(m.roundsCompleted, 1);
    assert.equal(m.phase, 'between');
    assert.equal(m.shoreDone, true);
    step();
    assert.equal(m.phase, 'vocab');
    assert.equal(m.spanIndex, 2);
    answerCorrect(m, 9, now += 100);
    assert.equal(m.phase, 'roundTransition');
    assert.equal(m.roundsCompleted, 2);
});

test('shore items match the round level (R2 easy, R3-R4 normal, R5-R6 hard) and never repeat in a match', () => {
    const r = simulate({ minutes: 10, answerEveryMs: () => 900, playerCount: 6, seed: 5 });
    assert.equal(r.match.roundsCompleted, 6);
    assert.equal(r.log.shores.length >= 5, true);
    const unique = [...new Set(r.match.shoreUsed)];
    assert.equal(unique.length, r.match.shoreUsed.length);
    assert.equal(r.match.shoreUsed.length, 5);
    const levels = r.match.shoreUsed.map((id) => SHORE_BREAKERS.find((b) => b.id === id).level);
    assert.deepEqual(levels, ['easy', 'normal', 'normal', 'hard', 'hard']);
});

test('R5/R6 shore needs a higher target than R3/R4 (harder mini-game)', () => {
    assert.ok(roundConfig(10, 5, 30).shoreTarget > roundConfig(10, 3, 30).shoreTarget);
    assert.equal(roundConfig(10, 6, 30).shoreTarget, roundConfig(10, 5, 30).shoreTarget);
});

test('SIMULATION: a fast class reaches GOLD (6/6 bridges) for every match length', () => {
    for (const [minutes, every] of [[10, 1800], [8, 1800], [5, 1500], [3, 900]]) {
        const r = simulate({ minutes, answerEveryMs: () => every, playerCount: 5, wrongFirst: true });
        assert.deepEqual(r.log.errors, [], `${minutes} min`);
        assert.equal(r.match.finished, true);
        assert.equal(r.match.endReason, 'victory', `${minutes} min`);
        assert.equal(r.match.roundsCompleted, 6);
        assert.equal(r.match.tier.id, 'gold');
        assert.equal(r.match.spansLaid, SPANS_BY_MINUTES[minutes].reduce((a, b) => a + b, 0));
        assert.equal(r.log.tideTicksWhilePaused, 0, 'round tide never moves while paused');
        for (const p of ['vocab', 'breaker', 'between', 'roundTransition', 'finished']) assert.ok(r.log.phases.has(p), p);
        assert.deepEqual(r.match.roundResults, Array(6).fill('done'));
        assert.ok(r.elapsedMs < minutes * 60_000);
    }
});

test('SIMULATION: tide failure — the round fails, "tide took the bridge" beat, then the match ends with final scoring', () => {
    const r = simulate({ minutes: 10, answerEveryMs: (m) => (m.round >= 3 ? 40_000 : 1800), playerCount: 5 });
    assert.equal(r.match.endReason, 'tide');
    assert.equal(r.match.failedRound, 3);
    assert.equal(r.match.roundsCompleted, 2);
    assert.equal(r.match.tier.id, 'bronze');
    assert.deepEqual(r.match.roundResults, ['done', 'done', 'failed', 'pending', 'pending', 'pending']);
    assert.ok(r.log.phases.has('roundTransition'));
    assert.equal(r.log.errors.length, 0);
    assert.equal(r.view.failedRound, 3);
    assert.equal(r.winners.failedRound, 3);
    assert.equal(r.view.tideRatio, 1);
    assert.equal(r.winners.roundsCompleted, 2);
});

test('failure sequence timing: tide hits 100% -> transition(kind failed) for TIDE_FAIL_MS -> finished', () => {
    const m = mk({ players: 4, gameMinutes: 10 });
    const limit = m.tide.limitMs;
    const out = tickTide(m, limit);
    assert.equal(out.tideFailed, true);
    assert.equal(m.phase, 'roundTransition');
    assert.equal(m.transition.kind, 'failed');
    assert.equal(m.failedRound, 1);
    assert.equal(m.finished, false);
    assert.throws(() => submitTideAnswer(m, 'p0', 'x', null, limit + 100), /Wait for the next/);
    assert.equal(tickTide(m, limit + TIDE_FAIL_MS - 1).changed, false);
    const end = tickTide(m, limit + TIDE_FAIL_MS);
    assert.equal(end.finished, true);
    assert.equal(m.endReason, 'tide');
    assert.equal(m.tier.id, 'bronze'); // 0 bridges is also bronze
});

test('an answer that arrives after the tide is full fails the round instead of counting', () => {
    const m = mk({ players: 4 });
    const q = tideQuestionPayload(m, 'p0');
    const res = submitTideAnswer(m, 'p0', m.assignments.p0.entry.term, q.questionId, m.tide.limitMs + 5);
    assert.equal(res.result.tideFailed, true);
    assert.equal(m.phase, 'roundTransition');
    assert.equal(m.spansLaid, 0);
});

test('SIMULATION: global clock ends the match immediately and the round in progress does not count', () => {
    const r = simulate({ minutes: 5, playerCount: 2, answerEveryMs: () => 8000 });
    assert.equal(r.match.endReason, 'clock');
    assert.equal(r.match.finished, true);
    assert.ok(r.elapsedMs >= 5 * 60_000 - 250 && r.elapsedMs <= 5 * 60_000 + 250);
    assert.ok(r.match.roundsCompleted >= 3 && r.match.roundsCompleted <= 5);
    assert.equal(r.match.tier.id, tideTier(r.match.roundsCompleted).id);
    assert.equal(r.log.errors.length, 0);
    // a mid-round clock end: the unfinished round is marked incomplete and contributes nothing
    const m = mk({ players: 4, gameMinutes: 3 });
    answerCorrect(m, 4, 1000);
    tickTide(m, 1000 + TIDE_BETWEEN_MS);
    const done = m.roundsCompleted;
    const t = tickTide(m, m.endsAt);
    assert.equal(t.finished, true);
    assert.equal(m.roundsCompleted, done);
    assert.equal(m.endReason, 'clock');
});

test('global clock wins even when it expires during the pause / transition beat', () => {
    // 10 min: R1 has 2 spans -> first clear = pause ('between'), second clear = bridge cleared ('roundTransition')
    const m1 = mk({ players: 4, gameMinutes: 10 });
    answerCorrect(m1, 4, 1000);
    assert.equal(m1.phase, 'between');
    assert.equal(tickTide(m1, m1.endsAt + 10).finished, true);
    assert.equal(m1.endReason, 'clock');
    // 3 min: R1 is a 1-span bridge, so the first clear is the bridge-cleared transition and it still counts (bridge is built)
    const m2 = mk({ players: 4, gameMinutes: 3 });
    answerCorrect(m2, 4, 1000);
    assert.equal(m2.phase, 'roundTransition');
    assert.equal(m2.roundsCompleted, 1);
    assert.equal(tickTide(m2, m2.endsAt).finished, true);
    assert.equal(m2.endReason, 'clock');
    assert.equal(m2.roundsCompleted, 1);
});

test('host End finishes early with the medal for the bridges built so far', () => {
    const m = mk({ players: 4 });
    answerCorrect(m, 4, 1000); tickTide(m, 4000); answerCorrect(m, 4, 5000); // R1 complete (2 spans)
    assert.equal(m.roundsCompleted, 1);
    finishTideEarly(m);
    assert.equal(m.finished, true);
    assert.equal(m.endReason, 'host');
    assert.equal(m.tier.id, 'bronze');
});

test('public view carries everything the clients render (round, spans, tide, results strip, transition)', () => {
    const m = mk({ players: 5, gameMinutes: 10 });
    const v = tidePublicView(m, { now: 5000 });
    assert.equal(v.round, 1); assert.equal(v.rounds, 6);
    assert.equal(v.roundName, 'Gentle Start'); assert.equal(v.roundBridge, 'Wooden Footbridge'); assert.equal(v.roundTheme, 'footbridge');
    assert.equal(v.spansInRound, 2); assert.equal(v.spanNumber, 1); assert.equal(v.spanIndex, 0);
    assert.equal(v.neededCorrect, 2); assert.equal(v.gotCorrect, 0);
    assert.equal(v.phase, 'vocab');
    assert.deepEqual(v.roundResults, ['current', 'pending', 'pending', 'pending', 'pending', 'pending']);
    assert.equal(v.totalSpans, 21);
    assert.equal(v.tideLimitMs, tideLimitMs(10, 1));
    assert.ok(v.remainingMs > 0 && v.remainingMs <= 600_000);
    assert.ok(v.waveSeconds > 0);
    assert.equal(v.finished, false);
    assert.equal(v.transition, null);
    for (const k of ['clockRatio', 'tideRatio', 'tideRemainingMs', 'roundsCompleted', 'failedRound', 'endReason', 'hasShore', 'shoreAfter', 'players']) assert.ok(k in v, k);
});

test('question payloads and results carry round / span info; between and transition deal no questions', () => {
    const m = mk({ players: 5 });
    const q = tideQuestionPayload(m, 'p1');
    assert.equal(q.round, 1); assert.equal(q.rounds, 6); assert.equal(q.spansInRound, 2); assert.equal(q.spanNumber, 1);
    const res = answerCorrect(m, 2, 100);
    assert.equal(res.result.correct, true);
    assert.equal(res.result.spanNumber, 2);
    assert.equal(res.result.gotCorrect, 2);
    assert.equal(tideQuestionPayload(m, 'p1'), null);
    assert.equal(m.phase, 'between');
});

test('typed challenge: accepted counts toward the span (no lockout), stale challenges do not count', () => {
    const m = mk({ players: 5, answerMode: 'realise' });
    const q = tideQuestionPayload(m, 'p0');
    const w = submitTideAnswer(m, 'p0', 'almostright', q.questionId, 100);
    assert.equal(w.result.challengeable, true);
    assert.ok(w.pendingChallenge);
    assert.equal(m.players.p0.locked, false, 'a wrong typed answer never locks the player out');
    const ok = settleTideChallenge(m, 'p0', true, 200);
    assert.equal(ok.result.correct, true);
    assert.equal(m.gotCorrect, 1);
    answerCorrect(m, 1, 300); // second player clears R1 span 1
    assert.equal(m.phase, 'between');
    const stale = settleTideChallenge(m, 'p3', true, 400);
    assert.equal(stale.result.stale, true);
    assert.equal(stale.result.correct, false);
});

test('tideWinners ranks by correct answers and reports bridges + failed round', () => {
    const r = simulate({ minutes: 10, answerEveryMs: () => 1800 });
    const w = r.winners;
    assert.equal(w.coop, true);
    assert.equal(w.roundsCompleted, 6);
    assert.equal(w.tier.id, 'gold');
    assert.equal(w.totalSpans, 21);
    assert.equal(w.cleared, 21);
    assert.ok(w.players.every((p, i, a) => i === 0 || a[i - 1].correct >= p.correct));
});

test('constants are plain named exports, transition beats are the documented lengths', () => {
    assert.equal(TIDE_BETWEEN_MS, 2500);
    assert.equal(TIDE_TRANSITION_MS, 3500);
    assert.equal(TIDE_FAIL_MS, 3000);
});

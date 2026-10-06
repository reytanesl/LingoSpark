import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CANNON_MAX_HP,
    CANNON_ROUND_BUDGET,
    CANNON_STORM_MS,
    advanceCannon,
    ballsLoaded,
    baseDamage,
    buildSuddenDeathVolley,
    buildVolley,
    cannonMvp,
    cannonPublicView,
    cannonTimeLeft,
    closeCannonAnswering,
    createCannonMatch,
    finishCannonEarly,
    hostSkipCannon,
    isStormActive,
    markCannonChallengePending,
    mulberry32,
    resolveShot,
    settleCannonChallenge,
    shotLabel,
    skipCannonPrompt,
    speedTier,
    submitCannonAnswer,
} from './word-cannon.js';

const deck = [
    { term: 'cold', definition: 'Opposite of hot' },
    { term: 'tall', definition: 'Opposite of short (height)' },
    { term: 'happy', definition: 'Feeling joy' },
    { term: 'river', definition: 'A large natural stream of water' },
    { term: 'quiet', definition: 'Making little noise' },
];
const teams = {
    red: [{ id: 'r1', nickname: 'Ada' }, { id: 'r2', nickname: 'Ben' }],
    blue: [{ id: 'b1', nickname: 'Cleo' }, { id: 'b2', nickname: 'Dan' }],
};
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

function newMatch(extra = {}) {
    return createCannonMatch({ teams, deck, answerMode: 'realise', questionMs: 20_000, gameMinutes: 5, introMs: 0, now: 0, seed: 7, ...extra });
}

test('mulberry32 is deterministic for a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const xs = [a(), a(), a()];
    assert.deepEqual(xs, [b(), b(), b()]);
    assert.notDeepEqual(xs, [c(), c(), c()]);
    for (const x of xs) assert.ok(x >= 0 && x < 1);
});

test('speed tiers scale with the question time', () => {
    assert.equal(speedTier(1200, 20_000).tier, 'fast');
    assert.equal(speedTier(6000, 20_000).tier, 'fast');
    assert.equal(speedTier(6001, 20_000).tier, 'good');
    assert.equal(speedTier(12_000, 20_000).tier, 'good');
    assert.equal(speedTier(15_000, 20_000).tier, 'slow');
    // 10 s questions: 4 s is already "good"
    assert.equal(speedTier(4000, 10_000).tier, 'good');
});

test('ball loading and damage are fair across team sizes', () => {
    assert.equal(ballsLoaded(0, 3), 0);
    assert.equal(ballsLoaded(2, 3), 2);
    assert.equal(ballsLoaded(9, 3), 3);
    assert.equal(ballsLoaded(10, 10), 5);
    assert.equal(ballsLoaded(5, 10), 3); // round(2.5)
    assert.equal(ballsLoaded(1, 10), 1);
    // A whole team answering fast deals the same budget, whatever its size.
    for (const size of [1, 2, 3, 4, 5, 8, 20]) {
        const balls = ballsLoaded(size, size);
        assert.ok(Math.abs(balls * baseDamage(size) - CANNON_ROUND_BUDGET) < 1e-9, `size ${size}`);
    }
});

test('fast shots always hit; slow shots can miss into the sea', () => {
    const fast = resolveShot({ ms: 1200, questionMs: 20_000, teamSize: 2, rng: () => 0.999 });
    assert.deepEqual(fast, { outcome: 'hit', tier: 'fast', damage: 10 }); // budget 20 / 2
    const slowMiss = resolveShot({ ms: 18_000, questionMs: 20_000, teamSize: 2, rng: () => 0.4 });
    assert.equal(slowMiss.outcome, 'miss');
    assert.equal(slowMiss.damage, 0);
    const slowHit = resolveShot({ ms: 18_000, questionMs: 20_000, teamSize: 2, rng: () => 0.39 });
    assert.deepEqual(slowHit, { outcome: 'hit', tier: 'slow', damage: 2 }); // 10 * 0.2
    const goodHit = resolveShot({ ms: 9000, questionMs: 20_000, teamSize: 2, rng: () => 0.74 });
    assert.deepEqual(goodHit, { outcome: 'hit', tier: 'good', damage: 5 }); // 10 * 0.5
    assert.equal(resolveShot({ ms: 9000, questionMs: 20_000, teamSize: 2, rng: () => 0.75 }).outcome, 'miss');
    // Speed must clearly change the punch: FAST > GOOD > SLOW.
    assert.ok(fast.damage > goodHit.damage && goodHit.damage > slowHit.damage);
});

test('the storm blows shots away or lands lucky hits', () => {
    const blown = resolveShot({ ms: 1000, questionMs: 20_000, teamSize: 2, storm: true, rng: () => 0.1 });
    assert.equal(blown.outcome, 'blown');
    assert.equal(blown.damage, 0);
    const lucky = resolveShot({ ms: 18_000, questionMs: 20_000, teamSize: 2, storm: true, rng: () => 0.3 });
    assert.equal(lucky.outcome, 'lucky');
    assert.equal(lucky.damage, 3); // slow full 2 * 1.5
    const normal = resolveShot({ ms: 1000, questionMs: 20_000, teamSize: 2, storm: true, rng: () => 0.5 });
    assert.equal(normal.outcome, 'hit');
    // Over many seeded rolls roughly 20% blow away and 15% are lucky.
    const rng = mulberry32(1);
    const counts = { blown: 0, lucky: 0, hit: 0, miss: 0 };
    for (let i = 0; i < 4000; i++) counts[resolveShot({ ms: 1000, questionMs: 20_000, teamSize: 2, storm: true, rng }).outcome] += 1;
    assert.ok(Math.abs(counts.blown / 4000 - 0.2) < 0.03, JSON.stringify(counts));
    assert.ok(Math.abs(counts.lucky / 4000 - 0.15) < 0.03, JSON.stringify(counts));
});

test('volleys alternate teams, fastest team first, and stop when a fort sinks', () => {
    const v = buildVolley({
        shooters: {
            red: [{ id: 'r1', ms: 5000 }, { id: 'r2', ms: 2000 }, { id: 'r3', ms: 3000 }],
            blue: [{ id: 'b1', ms: 1500 }],
        },
        hp: { red: 100, blue: 100 },
        sizes: { red: 3, blue: 2 },
        rng: () => 0,
    });
    assert.equal(v.first, 'blue');
    assert.deepEqual(v.shots.map((s) => s.team), ['blue', 'red', 'red', 'red']);
    assert.deepEqual(v.shots.map((s) => s.shooterId), ['b1', 'r2', 'r3', 'r1']);
    assert.equal(v.shots[0].damage, 10); // blue size 2, FAST
    assert.equal(v.shots[1].damage, 7); // red size 3, FAST (20/3)
    assert.deepEqual(v.hpAfter, { red: 90, blue: 79 }); // 100-10; 100-7-7-7
    assert.equal(v.shots[1].label, 'FAST 2.0s: HIT!');
    assert.ok(v.shots[1].at > v.shots[0].at);

    const sink = buildVolley({
        shooters: { red: [{ id: 'r1', ms: 1000 }, { id: 'r2', ms: 1100 }], blue: [{ id: 'b1', ms: 1200 }] },
        hp: { red: 50, blue: 20 },
        sizes: { red: 2, blue: 2 },
        rng: () => 0,
    });
    assert.equal(sink.shots.length, 3);
    assert.equal(sink.shots[2].final, true);
    assert.equal(sink.shots[2].hpAfter, 0);
    assert.equal(sink.shots[2].damage, 10); // leftover HP after first FAST 10 on a 20 HP fort
    assert.equal(sink.sunk, 'blue');
    assert.ok(sink.shots[2].dur > sink.shots[0].dur, 'last shot plays in slow motion');
});

test('shot labels match the concept wording', () => {
    assert.equal(shotLabel({ ms: 1234, tier: 'fast', outcome: 'hit' }), 'FAST 1.2s: HIT!');
    assert.equal(shotLabel({ ms: 8900, tier: 'slow', outcome: 'miss' }), 'SLOW 8.9s: MISS');
    assert.equal(shotLabel({ ms: 100, tier: 'fast', outcome: 'blown' }), 'BLOWN AWAY!');
    assert.equal(shotLabel({ ms: 100, tier: 'fast', outcome: 'lucky' }), 'LUCKY HIT!');
    assert.equal(shotLabel({ lastShot: true }), 'LAST SHOT!');
});

test('a round loads cannonballs, fires a volley and moves on', () => {
    const m = newMatch();
    assert.equal(m.phase, 'question');
    submitCannonAnswer(m, 'r1', 'cold', 1200);
    submitCannonAnswer(m, 'b1', 'cold', 2000);
    const view = cannonPublicView(m, { forHost: true, now: 2000 });
    assert.equal(view.teams.red.loaded, 1);
    assert.equal(view.teams.blue.loaded, 1);
    assert.equal(view.correctTerm, 'cold');
    assert.equal(cannonPublicView(m, { playerId: 'r1', now: 2000 }).correctTerm, undefined);
    const wrong = submitCannonAnswer(m, 'b2', 'cool', 3000);
    assert.equal(wrong.result.challengeable, true);
    skipCannonPrompt(m, 'b2', 3100);
    const { result } = submitCannonAnswer(m, 'r2', 'cold', 15_000);
    assert.equal(result.tier, 'slow');
    assert.equal(result.ms, 15_000);
    assert.equal(m.phase, 'volley');
    assert.equal(m.volley.shots.length, 3);
    assert.equal(m.volley.first, 'red');
    assert.ok(m.teams.blue.hp < CANNON_MAX_HP);
    assert.equal(m.volley.next, 'question');
    assert.equal(m.phaseEndsAt, 15_000 + m.volley.durationMs);
    advanceCannon(m, m.phaseEndsAt);
    assert.equal(m.phase, 'question');
    assert.equal(m.roundIndex, 2);
    assert.equal(m.entry.term, 'tall');
});

test('a challenged answer pauses the storm clock and an accepted one loads a ball', () => {
    const m = newMatch();
    submitCannonAnswer(m, 'r1', 'cold', 1000);
    submitCannonAnswer(m, 'r2', 'cold', 1000);
    submitCannonAnswer(m, 'b1', 'cold', 1000);
    submitCannonAnswer(m, 'b2', 'cool', 3000);
    assert.equal(m.phase, 'review');
    markCannonChallengePending(m, 'b2', 4000);
    assert.equal(m.phaseEndsAt, null);
    assert.equal(cannonTimeLeft(m, 60_000), 5 * 60_000 - 4000, 'clock frozen while the teacher decides');
    const { result } = settleCannonChallenge(m, 'b2', true, 64_000);
    assert.equal(result.challengeAccepted, true);
    assert.equal(result.eligible, true);
    assert.equal(m.phase, 'volley');
    assert.equal(m.volley.loaded.blue, 2);
    assert.equal(cannonTimeLeft(m, 64_000), 5 * 60_000 - 4000);
    assert.equal(m.stats.b2.correct, 1);
});

test('a declined challenge loads nothing', () => {
    const m = newMatch();
    submitCannonAnswer(m, 'r1', 'warm', 1000);
    markCannonChallengePending(m, 'r1', 1100);
    closeCannonAnswering(m, 20_000);
    assert.equal(m.phase, 'review');
    settleCannonChallenge(m, 'r1', false, 21_000);
    assert.equal(m.phase, 'volley');
    assert.equal(m.volley.loaded.red, 0);
    assert.equal(m.volley.shots.length, 0);
});

test('the storm arrives in the final minute', () => {
    const m = newMatch({ gameMinutes: 3 });
    assert.equal(isStormActive(m, 0), false);
    assert.equal(isStormActive(m, 3 * 60_000 - CANNON_STORM_MS - 1), false);
    assert.equal(isStormActive(m, 3 * 60_000 - CANNON_STORM_MS), true);
    // Fire a volley inside the storm: it is flagged as a storm volley.
    m.questionStartedAt = 150_000;
    submitCannonAnswer(m, 'r1', 'cold', 151_000);
    closeCannonAnswering(m, 152_000);
    assert.equal(m.volley.storm, true);
    assert.equal(cannonPublicView(m, { now: 152_000 }).storm, true);
});

test('a sunk fort ends the game with a LAST SHOT', () => {
    const m = newMatch();
    m.teams.blue.hp = 10;
    submitCannonAnswer(m, 'r1', 'cold', 500);
    closeCannonAnswering(m, 20_000);
    assert.equal(m.volley.sunk, 'blue');
    assert.equal(m.volley.next, 'finished');
    assert.equal(m.volley.shots.at(-1).final, true);
    advanceCannon(m, m.phaseEndsAt);
    assert.equal(m.phase, 'finished');
    const view = cannonPublicView(m, { now: m.phaseEndsAt });
    assert.equal(view.result.winner, 'red');
    assert.equal(view.result.reason, 'sunk');
    assert.equal(view.result.mvp.id, 'r1');
});

test('time up: the healthier fort wins', () => {
    const m = newMatch({ gameMinutes: 2, rng: () => 0.9 });
    m.teams.red.hp = 40;
    m.teams.blue.hp = 70;
    m.questionStartedAt = 121_000;
    submitCannonAnswer(m, 'b1', 'cold', 122_000);
    closeCannonAnswering(m, 122_000);
    assert.equal(m.volley.timeUp, true);
    assert.equal(m.volley.next, 'finished');
    assert.equal(m.volley.winner, 'blue');
    assert.equal(m.volley.reason, 'time');
    assert.ok(m.volley.shots[0].final, 'last hit on the losing fort plays in slow motion');
    advanceCannon(m, m.phaseEndsAt);
    assert.equal(m.phase, 'finished');
});

test('time up on a tie goes to a sudden-death LAST SHOT', () => {
    const m = newMatch({ gameMinutes: 2 });
    m.teams.red.hp = 50;
    m.teams.blue.hp = 50;
    closeCannonAnswering(m, 125_000);
    assert.equal(m.volley.next, 'sudden');
    advanceCannon(m, m.phaseEndsAt);
    assert.equal(m.suddenDeath, true);
    assert.equal(m.phase, 'question');
    const start = m.questionStartedAt;
    submitCannonAnswer(m, 'r2', 'tall', start + 4000);
    submitCannonAnswer(m, 'b2', 'tall', start + 2500);
    closeCannonAnswering(m, start + 20_000);
    assert.equal(m.volley.suddenDeath, true);
    assert.equal(m.volley.shots.length, 1);
    assert.equal(m.volley.shots[0].team, 'blue');
    assert.equal(m.volley.shots[0].lastShot, true);
    assert.equal(m.volley.shots[0].label, 'LAST SHOT!');
    assert.equal(m.teams.red.hp, 0);
    advanceCannon(m, m.phaseEndsAt);
    assert.equal(m.phase, 'finished');
    assert.equal(m.result.winner, 'blue');
    assert.equal(m.result.reason, 'sudden');
});

test('sudden death without a correct answer ends in a draw after three tries', () => {
    const m = newMatch({ gameMinutes: 2 });
    closeCannonAnswering(m, 125_000); // 100 vs 100
    for (let i = 0; i < 3; i++) {
        advanceCannon(m, m.phaseEndsAt);
        assert.equal(m.phase, 'question');
        closeCannonAnswering(m, m.phaseEndsAt);
    }
    assert.equal(m.volley.next, 'finished');
    assert.equal(m.volley.reason, 'draw');
    advanceCannon(m, m.phaseEndsAt);
    assert.equal(m.result.winner, null);
});

test('sudden death volley helper picks the fastest correct answer', () => {
    const v = buildSuddenDeathVolley({ shooters: { red: [{ id: 'r', ms: 900 }], blue: [{ id: 'b', ms: 1000 }] }, hp: { red: 30, blue: 30 } });
    assert.equal(v.shots[0].team, 'red');
    assert.equal(v.hpAfter.blue, 0);
    const none = buildSuddenDeathVolley({ shooters: { red: [], blue: [] }, hp: { red: 30, blue: 30 } });
    assert.equal(none.shots.length, 0);
    assert.equal(none.sunk, null);
});

test('host end: healthier fort wins, equal health is a draw', () => {
    const a = newMatch();
    a.teams.red.hp = 60;
    finishCannonEarly(a);
    assert.equal(a.phase, 'finished');
    assert.equal(a.result.winner, 'blue');
    const b = newMatch();
    finishCannonEarly(b);
    assert.equal(b.result.winner, null);
    assert.equal(b.result.reason, 'draw');
});

test('host skip walks intro, question, review and volley', () => {
    const m = createCannonMatch({ teams, deck, answerMode: 'realise', now: 0, seed: 3 });
    assert.equal(m.phase, 'intro');
    assert.equal(hostSkipCannon(m, 100).phase, 'question');
    submitCannonAnswer(m, 'r1', 'nope', 200);
    markCannonChallengePending(m, 'r1', 300);
    assert.equal(hostSkipCannon(m, 400).phase, 'review');
    const forced = hostSkipCannon(m, 500);
    assert.equal(forced.phase, 'volley');
    assert.deepEqual(forced.declined, ['r1']);
    assert.equal(hostSkipCannon(m, 600).phase, 'question');
});

test('same seed, same battle', () => {
    const play = () => {
        const m = newMatch({ seed: 99, answerMode: 'randomise' });
        const out = [];
        for (let r = 0; r < 4 && m.phase !== 'finished'; r++) {
            const start = m.questionStartedAt;
            for (const [i, id] of ['r1', 'r2', 'b1', 'b2'].entries()) {
                if (m.phase !== 'question') break;
                submitCannonAnswer(m, id, m.entry.term, start + 3000 + i * 3000);
            }
            out.push(m.volley.shots.map((s) => `${s.team}:${s.outcome}:${s.damage}`).join(','));
            advanceCannon(m, m.phaseEndsAt);
        }
        return out;
    };
    assert.deepEqual(play(), play());
});

test('MVP prefers hits, then correct answers', () => {
    const m = newMatch();
    m.stats.r1 = { correct: 3, answered: 3, shots: 3, hits: 2, damage: 30, totalMs: 6000 };
    m.stats.b1 = { correct: 4, answered: 4, shots: 4, hits: 2, damage: 30, totalMs: 6000 };
    assert.equal(cannonMvp(m).id, 'b1');
    m.stats.r2 = { correct: 1, answered: 1, shots: 1, hits: 3, damage: 40, totalMs: 1000 };
    assert.equal(cannonMvp(m).id, 'r2');
});

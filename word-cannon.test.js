import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CANNON_MAX_HP,
    CANNON_ROUND_BUDGET,
    CANNON_STORM_MS,
    FORCE_STEP_MS,
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
    shotForce,
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

test('shot force drops every 0.1s and is steeper for multiple choice than type-in', () => {
    assert.equal(FORCE_STEP_MS, 100);
    assert.equal(shotForce(0, 'choice'), 1);
    assert.equal(shotForce(0, 'typed'), 1);
    // After the same delay, MC has less force left than typed.
    const lateChoice = shotForce(5_000, 'choice');
    const lateTyped = shotForce(5_000, 'typed');
    assert.ok(lateChoice < 1 && lateTyped < 1);
    assert.ok(lateChoice < lateTyped, `${lateChoice} vs ${lateTyped}`);
    // Each 0.1 s step after the full-power window lowers force.
    const a = shotForce(2_500, 'typed');
    const b = shotForce(2_600, 'typed');
    const c = shotForce(2_700, 'typed');
    assert.ok(a > b && b > c);
    // Labels still map force bands to FAST / GOOD / SLOW.
    assert.equal(speedTier(500, 20_000, 'choice').tier, 'fast');
    assert.equal(speedTier(18_000, 20_000, 'typed').tier, 'slow');
});

test('every correct answer fires; damage dilutes by team size', () => {
    assert.equal(ballsLoaded(0, 3), 0);
    assert.equal(ballsLoaded(2, 3), 2);
    assert.equal(ballsLoaded(9, 3), 9);
    assert.equal(ballsLoaded(10, 10), 10);
    for (const size of [1, 2, 3, 4, 5, 8, 20]) {
        assert.ok(Math.abs(baseDamage(size) * size - CANNON_ROUND_BUDGET) < 1e-9, `size ${size}`);
    }
});

test('faster answers deal more damage; force is continuous', () => {
    const fast = resolveShot({ ms: 400, questionMs: 20_000, teamSize: 2, inputMode: 'typed', rng: () => 0.999 });
    assert.equal(fast.outcome, 'hit');
    assert.equal(fast.tier, 'fast');
    assert.equal(fast.force, 1);
    assert.equal(fast.damage, 10); // budget 20 / 2
    const mid = resolveShot({ ms: 8_000, questionMs: 20_000, teamSize: 2, inputMode: 'typed', rng: () => 0 });
    const slow = resolveShot({ ms: 18_000, questionMs: 20_000, teamSize: 2, inputMode: 'typed', rng: () => 0 });
    assert.ok(fast.damage > mid.damage && mid.damage > slow.damage);
    assert.ok(mid.force > slow.force);
    // Multiple choice decays faster: same time → weaker shot.
    const mc = resolveShot({ ms: 5_000, questionMs: 20_000, teamSize: 2, inputMode: 'choice', rng: () => 0 });
    const typed = resolveShot({ ms: 5_000, questionMs: 20_000, teamSize: 2, inputMode: 'typed', rng: () => 0 });
    assert.ok(mc.force < typed.force);
    assert.ok(mc.damage <= typed.damage);
});

test('the storm is more chaotic: more blown / lucky shots and wild damage', () => {
    const blown = resolveShot({ ms: 1000, questionMs: 20_000, teamSize: 2, storm: true, rng: () => 0.1 });
    assert.equal(blown.outcome, 'blown');
    assert.equal(blown.friendly, true);
    assert.ok(blown.damage > 0, 'blown shots damage own fort');
    const lucky = resolveShot({
        ms: 1000,
        questionMs: 20_000,
        teamSize: 2,
        storm: true,
        rng: (() => { let i = 0; return () => [0.4, 0][i++] ?? 0; })(),
    });
    assert.equal(lucky.outcome, 'lucky');
    assert.ok(lucky.damage > 10);
    const rng = mulberry32(1);
    const counts = { blown: 0, lucky: 0, hit: 0, miss: 0, own: 0 };
    for (let i = 0; i < 4000; i++) {
        counts[resolveShot({ ms: 1000, questionMs: 20_000, teamSize: 2, storm: true, rng }).outcome] += 1;
    }
    assert.ok(counts.blown / 4000 > 0.25, JSON.stringify(counts));
    assert.ok(counts.lucky / 4000 > 0.15, JSON.stringify(counts));
    // Combined chaos should dominate calm play.
    assert.ok((counts.blown + counts.lucky + counts.miss + counts.own) / 4000 > 0.45, JSON.stringify(counts));
});

test('volleys fire every correct answer as a salvo, fastest team first, and stop when a fort sinks', () => {
    const v = buildVolley({
        shooters: {
            red: [{ id: 'r1', ms: 5000 }, { id: 'r2', ms: 2000 }, { id: 'r3', ms: 3000 }],
            blue: [{ id: 'b1', ms: 1500 }],
        },
        hp: { red: 100, blue: 100 },
        sizes: { red: 3, blue: 2 },
        inputMode: 'typed',
        rng: () => 0,
    });
    assert.equal(v.first, 'blue');
    assert.deepEqual(v.shots.map((s) => s.team), ['blue', 'red', 'red', 'red']);
    assert.deepEqual(v.shots.map((s) => s.shooterId), ['b1', 'r2', 'r3', 'r1']);
    assert.equal(v.shots[0].damage, 10); // blue size 2, full force
    assert.ok(v.shots[0].force === 1);
    assert.ok(v.shots[1].damage >= 6); // red size 3, near-full
    assert.equal(v.shots[1].label, 'FAST 2.0s: HIT!');
    assert.ok(v.shots[1].at > v.shots[0].at);
    // Salvo: all shots start within a short window, not one-after-another.
    const span = v.shots.at(-1).at - v.shots[0].at;
    assert.ok(span < 600, `salvo stagger too long: ${span}`);
    assert.ok(v.durationMs < 4_500, `volley should finish quickly: ${v.durationMs}`);

    const sink = buildVolley({
        shooters: { red: [{ id: 'r1', ms: 1000 }, { id: 'r2', ms: 1100 }], blue: [{ id: 'b1', ms: 1200 }] },
        hp: { red: 50, blue: 20 },
        sizes: { red: 2, blue: 2 },
        inputMode: 'typed',
        rng: () => 0,
    });
    assert.equal(sink.shots.length, 3);
    assert.equal(sink.shots[2].final, true);
    assert.equal(sink.shots[2].hpAfter, 0);
    assert.equal(sink.sunk, 'blue');
    assert.ok(sink.shots[2].dur > sink.shots[0].dur, 'last shot plays in slow motion');
});

test('stray / blown shots can hit the shooter’s own fort', () => {
    const blown = buildVolley({
        shooters: { red: [{ id: 'r1', ms: 800 }], blue: [] },
        hp: { red: 100, blue: 100 },
        sizes: { red: 2, blue: 2 },
        storm: true,
        inputMode: 'typed',
        rng: () => 0.1,
    });
    assert.equal(blown.shots.length, 1);
    assert.equal(blown.shots[0].outcome, 'blown');
    assert.equal(blown.shots[0].target, 'red');
    assert.equal(blown.shots[0].friendly, true);
    assert.ok(blown.shots[0].damage > 0);
    assert.ok(blown.hpAfter.red < 100);
    assert.equal(blown.hpAfter.blue, 100);

    const own = resolveShot({
        ms: 9000,
        questionMs: 20_000,
        teamSize: 2,
        storm: false,
        inputMode: 'typed',
        // miss (force hitChance low) then roll under calmStrayOwn
        rng: (() => { let i = 0; return () => [0.99, 0.05, 0.5][i++] ?? 0.5; })(),
    });
    assert.equal(own.outcome, 'own');
    assert.equal(own.friendly, true);
    assert.ok(own.damage > 0);
});

test('shot labels match the concept wording', () => {
    assert.equal(shotLabel({ ms: 1234, tier: 'fast', outcome: 'hit' }), 'FAST 1.2s: HIT!');
    assert.equal(shotLabel({ ms: 8900, tier: 'slow', outcome: 'miss' }), 'SLOW 8.9s: MISS');
    assert.equal(shotLabel({ ms: 100, tier: 'fast', outcome: 'blown' }), 'BLOWN BACK!');
    assert.equal(shotLabel({ ms: 100, tier: 'fast', outcome: 'own' }), 'OWN FORT!');
    assert.equal(shotLabel({ ms: 100, tier: 'fast', outcome: 'lucky' }), 'LUCKY HIT!');
    assert.equal(shotLabel({ lastShot: true }), 'LAST SHOT!');
});

test('a round fires a shot per correct answer and moves on', () => {
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
    assert.ok(result.force < 0.5);
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

test('a challenged answer pauses the storm clock and an accepted one fires a shot', () => {
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
    m.questionStartedAt = 150_000;
    submitCannonAnswer(m, 'r1', 'cold', 151_000);
    closeCannonAnswering(m, 152_000);
    assert.equal(m.volley.storm, true);
    assert.equal(cannonPublicView(m, { now: 152_000 }).storm, true);
});

test('a sunk fort rebuilds and play continues with exactly 1 WIN', () => {
    const m = newMatch();
    m.teams.blue.hp = 10;
    submitCannonAnswer(m, 'r1', 'cold', 500);
    closeCannonAnswering(m, 20_000);
    assert.equal(m.volley.sunk, 'blue');
    assert.equal(m.volley.rebuild, true);
    assert.equal(m.volley.fortDown, 'blue');
    assert.equal(m.volley.next, 'question');
    assert.equal(m.volley.reason, 'fort-down');
    assert.equal(m.volley.shots.at(-1).final, true);
    // +1 correct +10 damage (full force, size 2) +20 fort kill
    assert.equal(m.teams.red.points, 1 + 10 + 20);
    assert.equal(m.teams.red.fortKills, 1, 'exactly one win per fort destruction');
    assert.equal(m.teams.blue.fortKills, 0);
    assert.equal(m.teams.blue.hp, 100, 'fallen fort rebuilds for the next round');
    advanceCannon(m, m.phaseEndsAt);
    assert.equal(m.phase, 'question');
    assert.equal(m.teams.blue.hp, 100);
    const view = cannonPublicView(m, { now: m.phaseEndsAt });
    assert.equal(view.teams.red.points, 31);
    assert.equal(view.teams.red.fortKills, 1);
});

test('sinking your own fort with a stray gives the other team 1 WIN', () => {
    const stormMatch = newMatch({ gameMinutes: 2, introMs: 0, now: 0, seed: 1 });
    stormMatch.teams.red.hp = 3;
    stormMatch.rng = () => 0.1;
    stormMatch.questionStartedAt = 2 * 60_000 - CANNON_STORM_MS + 1_000;
    submitCannonAnswer(stormMatch, 'r1', 'cold', stormMatch.questionStartedAt + 400);
    closeCannonAnswering(stormMatch, stormMatch.questionStartedAt + 20_000);
    assert.equal(stormMatch.volley.storm, true);
    assert.equal(stormMatch.volley.shots[0].target, 'red');
    assert.ok(stormMatch.volley.shots[0].damage > 0);
    assert.equal(stormMatch.volley.sunk, 'red');
    assert.equal(stormMatch.teams.blue.fortKills, 1);
    assert.equal(stormMatch.teams.red.fortKills, 0);
    // Own-fort damage does not award damage points; kill bonus goes to blue.
    assert.equal(stormMatch.teams.red.points, 1, 'only the correct-answer point');
    assert.equal(stormMatch.teams.blue.points, 20);
});

test('time up: the team with more points wins', () => {
    const m = newMatch({ gameMinutes: 2, rng: () => 0.9 });
    m.teams.red.points = 12;
    m.teams.blue.points = 30;
    m.questionStartedAt = 121_000;
    closeCannonAnswering(m, 122_000);
    assert.equal(m.volley.timeUp, true);
    assert.equal(m.volley.next, 'finished');
    assert.equal(m.volley.winner, 'blue');
    assert.equal(m.volley.reason, 'time');
    advanceCannon(m, m.phaseEndsAt);
    assert.equal(m.phase, 'finished');
    assert.equal(m.result.points.blue, 30);
});

test('time up on a points tie goes to a sudden-death LAST SHOT', () => {
    const m = newMatch({ gameMinutes: 2 });
    m.teams.red.points = 20;
    m.teams.blue.points = 20;
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
    closeCannonAnswering(m, 125_000);
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

test('host end: more points wins, equal points is a draw', () => {
    const a = newMatch();
    a.teams.blue.points = 18;
    a.teams.red.points = 7;
    finishCannonEarly(a);
    assert.equal(a.phase, 'finished');
    assert.equal(a.result.winner, 'blue');
    assert.equal(a.result.reason, 'ended');
    const b = newMatch();
    finishCannonEarly(b);
    assert.equal(b.result.winner, null);
    assert.equal(b.result.reason, 'draw');
});

test('correct answers and damage both add team points', () => {
    const m = newMatch({ rng: () => 0 }); // always hit
    submitCannonAnswer(m, 'r1', 'cold', 1000); // full force
    submitCannonAnswer(m, 'b1', 'cold', 14_000); // weak
    closeCannonAnswering(m, 20_000);
    assert.equal(m.teams.red.points, 1 + m.volley.shots.find((s) => s.team === 'red').damage);
    assert.equal(m.teams.blue.points, 1 + m.volley.shots.find((s) => s.team === 'blue').damage);
    assert.ok(m.teams.red.points > m.teams.blue.points);
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

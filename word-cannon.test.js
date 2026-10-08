import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CANNON_MAX_HP,
    CANNON_ROUND_BUDGET,
    CANNON_STORM_MS,
    FORCE_STEP_MS,
    FORCE_WINDOWS,
    STORM_RULES,
    VOLLEY_TIMING,
    leaderByWinsThenPoints,
    rollStormGust,
    shotDetail,
    stormBlownChance,
    advanceCannon,
    ballsLoaded,
    baseDamage,
    buildSuddenDeathVolley,
    buildVolley,
    cannonMvp,
    cannonPublicView,
    cannonTimeLeft,
    closeCannonAnswering,
    cannonTimeoutResults,
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

test('the storm is more chaotic: blow-backs (mostly slow shots), lucky hits and wild damage', () => {
    // Slow typed answer (9 s → ~54% force) with a low roll is blown back onto its own fort.
    const blown = resolveShot({ ms: 9_000, questionMs: 20_000, teamSize: 2, storm: true, rng: () => 0.1 });
    assert.equal(blown.outcome, 'blown');
    assert.equal(blown.friendly, true);
    assert.ok(blown.damage > 0, 'blown shots damage own fort');
    const lucky = resolveShot({
        ms: 1000,
        questionMs: 20_000,
        teamSize: 2,
        storm: true,
        rng: (() => { let i = 0; return () => [0.2, 0.5][i++] ?? 0; })(),
    });
    assert.equal(lucky.outcome, 'lucky');
    assert.ok(lucky.damage > 10);
    const rng = mulberry32(1);
    const counts = { blown: 0, lucky: 0, hit: 0, miss: 0, own: 0 };
    for (let i = 0; i < 4000; i++) {
        counts[resolveShot({ ms: 12_000, questionMs: 20_000, teamSize: 2, storm: true, gust: rollStormGust(rng), rng }).outcome] += 1;
    }
    assert.ok(counts.blown / 4000 > 0.12, JSON.stringify(counts));
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
        shooters: { red: [{ id: 'r1', ms: 9_000 }], blue: [] },
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
    stormMatch.teams.red.hp = 2;
    stormMatch.rng = () => 0.1;
    stormMatch.questionStartedAt = 2 * 60_000 - CANNON_STORM_MS + 1_000;
    // A slow answer in the storm is the one that gets blown back.
    submitCannonAnswer(stormMatch, 'r1', 'cold', stormMatch.questionStartedAt + 9_000);
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

// ---------------------------------------------------------------------------
// Rules added in the v2 round: speed curve, own-fort strays, win counting,
// storm randomness bounds, time-up slow-mo.
// ---------------------------------------------------------------------------

test('speed → force curve: full window, then an equal drop every 0.1 s to the floor, per question type', () => {
    const { choice, typed } = FORCE_WINDOWS;
    assert.deepEqual(choice, { fullMs: 700, decayMs: 6_500, floor: 0.12 });
    assert.deepEqual(typed, { fullMs: 2_200, decayMs: 13_000, floor: 0.12 });
    for (const [mode, cfg] of [['choice', choice], ['typed', typed]]) {
        assert.equal(shotForce(cfg.fullMs, mode), 1, `${mode} full window`);
        const step = (1 - cfg.floor) / (cfg.decayMs / FORCE_STEP_MS);
        // Inside one 0.1 s step the force is flat; each new step drops by the same amount.
        assert.equal(shotForce(cfg.fullMs + 50, mode), 1);
        for (let k = 1; k <= 5; k++) {
            const f = shotForce(cfg.fullMs + k * FORCE_STEP_MS, mode);
            assert.ok(Math.abs(f - (1 - k * step)) < 1e-9, `${mode} step ${k}: ${f}`);
        }
        assert.equal(shotForce(cfg.fullMs + cfg.decayMs, mode), cfg.floor);
        assert.equal(shotForce(cfg.fullMs + cfg.decayMs + 5_000, mode), cfg.floor);
    }
    // Reference points used in the report.
    assert.ok(Math.abs(shotForce(2_000, 'choice') - 0.824) < 0.001);
    assert.ok(Math.abs(shotForce(5_000, 'choice') - 0.4179) < 0.001);
    assert.ok(Math.abs(shotForce(5_000, 'typed') - 0.8105) < 0.001);
    assert.ok(Math.abs(shotForce(10_000, 'typed') - 0.4720) < 0.001);
    // Damage follows force continuously (team of 2 → 10 HP at full power).
    const dmg = (ms, inputMode) => resolveShot({ ms, teamSize: 2, inputMode, rng: () => 0 }).damage;
    assert.equal(dmg(500, 'choice'), 10);
    assert.equal(dmg(2_000, 'choice'), 8);
    assert.equal(dmg(5_000, 'choice'), 4);
    assert.equal(dmg(5_000, 'typed'), 8);
});

test('labels show answer time, force and damage', () => {
    assert.equal(shotDetail({ ms: 1234, force: 0.92, damage: 9, team: 'red', target: 'blue' }), '1.2s · 92% force · −9');
    assert.equal(shotDetail({ ms: 8000, force: 0.3, damage: 0, team: 'red', target: 'blue' }), '8.0s · 30% force · no damage');
    assert.equal(shotDetail({ ms: 9000, force: 0.5, damage: 3, team: 'red', target: 'red' }), '9.0s · 50% force · −3 own fort');
    const v = buildVolley({ shooters: { red: [{ id: 'r1', ms: 1500 }], blue: [] }, hp: { red: 100, blue: 100 }, sizes: { red: 2, blue: 2 }, inputMode: 'choice', rng: () => 0 });
    assert.match(v.shots[0].detail, /^1\.5s · \d+% force · −\d+$/);
});

test('own-fort hits are rare: never for fast calm shots, mostly slow answers and the storm', () => {
    const rate = (ms, storm, n = 20_000) => {
        const rng = mulberry32(11);
        let own = 0;
        for (let i = 0; i < n; i++) {
            const r = resolveShot({ ms, teamSize: 2, storm, gust: storm ? rollStormGust(rng) : 1, inputMode: 'choice', rng });
            if (r.friendly) own += 1;
        }
        return own / n;
    };
    const calmFast = rate(500, false);
    const calmGood = rate(3_500, false);
    const calmSlow = rate(6_500, false);
    const stormFast = rate(500, true);
    const stormSlow = rate(6_500, true);
    assert.equal(calmFast, 0, 'fast calm shots always hit the enemy');
    assert.ok(calmGood < 0.02, `good calm ${calmGood}`);
    assert.ok(calmSlow > 0.01 && calmSlow < 0.08, `slow calm ${calmSlow}`);
    assert.ok(stormFast < stormSlow, `storm fast ${stormFast} vs slow ${stormSlow}`);
    assert.ok(stormFast < 0.05, `storm fast ${stormFast}`);
    assert.ok(stormSlow > 0.15 && stormSlow < 0.45, `storm slow ${stormSlow}`);
    assert.ok(stormSlow > calmSlow * 3, `storm slow ${stormSlow}`);
});

test('storm randomness stays inside its bounds', () => {
    const rng = mulberry32(5);
    const gusts = Array.from({ length: 500 }, () => rollStormGust(rng));
    assert.ok(Math.min(...gusts) >= STORM_RULES.gustMin && Math.max(...gusts) <= STORM_RULES.gustMax);
    assert.ok(Math.max(...gusts) - Math.min(...gusts) > 0.6, 'gusts really vary between volleys');
    for (const f of [0, 0.12, 0.5, 1]) {
        for (const g of [0.6, 1, 1.4]) {
            const c = stormBlownChance(f, g);
            assert.ok(c >= STORM_RULES.blownMinChance && c <= STORM_RULES.blownMaxChance, `${f}/${g} → ${c}`);
        }
        assert.ok(stormBlownChance(f, 1.4) >= stormBlownChance(f, 0.6));
    }
    assert.ok(stormBlownChance(0.2, 1) > stormBlownChance(1, 1), 'slow shots blow back more');
    const seen = new Set();
    for (let i = 0; i < 6_000; i++) {
        const ms = Math.floor(rng() * 8_000);
        const gust = rollStormGust(rng);
        const r = resolveShot({ ms, teamSize: 2, storm: true, gust, inputMode: 'choice', rng });
        const full = baseDamage(2) * r.force;
        seen.add(r.outcome);
        if (r.outcome === 'lucky') {
            assert.ok(r.damage >= Math.max(1, Math.round(full * STORM_RULES.luckyMin)) && r.damage <= Math.max(1, Math.round(full * STORM_RULES.luckyMax)), JSON.stringify(r));
        } else if (r.outcome === 'hit') {
            assert.ok(r.damage >= 1 && r.damage <= Math.max(1, Math.round(full * STORM_RULES.wildMax)), JSON.stringify(r));
        } else if (r.outcome === 'blown' || r.outcome === 'own') {
            assert.ok(r.damage >= 1 && r.damage <= Math.max(1, Math.round(full * STORM_RULES.blownOwnMax)), JSON.stringify(r));
        } else {
            assert.equal(r.damage, 0);
        }
    }
    assert.deepEqual([...seen].sort(), ['blown', 'hit', 'lucky', 'miss', 'own']);
    // Every storm volley carries its gust for the UI.
    const v = buildVolley({ shooters: { red: [{ id: 'r1', ms: 1000 }], blue: [] }, hp: { red: 100, blue: 100 }, sizes: { red: 1, blue: 1 }, storm: true, rng: mulberry32(3) });
    assert.ok(v.gust >= STORM_RULES.gustMin && v.gust <= STORM_RULES.gustMax);
});

test('win counting: exactly 1 WIN per fort destroyed, across several kills', () => {
    const m = newMatch({ rng: () => 0 });
    for (let k = 1; k <= 3; k++) {
        m.teams.blue.hp = 5;
        const start = m.questionStartedAt;
        submitCannonAnswer(m, 'r1', m.entry.term, start + 500);
        submitCannonAnswer(m, 'r2', m.entry.term, start + 600);
        closeCannonAnswering(m, start + 20_000);
        assert.equal(m.volley.fortDown, 'blue');
        // The salvo stops at the sink: the second red ball never double-counts.
        assert.equal(m.volley.shots.filter((s) => s.final).length, 1);
        assert.equal(m.teams.red.fortKills, k);
        assert.deepEqual(m.volley.winsBefore, { red: k - 1, blue: 0 });
        assert.deepEqual(m.volley.wins, { red: k, blue: 0 });
        advanceCannon(m, m.phaseEndsAt);
    }
    assert.equal(m.teams.blue.fortKills, 0);
    assert.equal(cannonPublicView(m, { now: m.questionStartedAt }).teams.red.fortKills, 3);
});

test('time up: most WINS wins, points only break a tie on WINS', () => {
    assert.equal(leaderByWinsThenPoints({ red: { fortKills: 2, points: 40 }, blue: { fortKills: 1, points: 90 } }), 'red');
    assert.equal(leaderByWinsThenPoints({ red: { fortKills: 1, points: 40 }, blue: { fortKills: 1, points: 41 } }), 'blue');
    assert.equal(leaderByWinsThenPoints({ red: { fortKills: 1, points: 40 }, blue: { fortKills: 1, points: 40 } }), null);
    const m = newMatch({ gameMinutes: 2, rng: () => 0.9 });
    m.teams.red.fortKills = 1;
    m.teams.red.points = 25;
    m.teams.blue.points = 60;
    m.questionStartedAt = 121_000;
    closeCannonAnswering(m, 122_000);
    assert.equal(m.volley.next, 'finished');
    assert.equal(m.volley.winner, 'red', 'a destroyed fort beats a points lead');
    advanceCannon(m, m.phaseEndsAt);
    assert.equal(m.result.winner, 'red');
    assert.deepEqual(m.result.wins, { red: 1, blue: 0 });
    // Host end uses the same rule.
    const e = newMatch();
    e.teams.blue.fortKills = 2;
    e.teams.red.fortKills = 1;
    e.teams.red.points = 99;
    finishCannonEarly(e);
    assert.equal(e.result.winner, 'blue');
});

test('time-up slow motion only lands on a real enemy hit, never on a blown-back ball', () => {
    const m = newMatch({ gameMinutes: 2, seed: 4 });
    m.teams.red.points = 50;
    // Storm (gust 1.0), red: a fast hit first, then a slow blow-back as the very last ball.
    const seq = [0.5, 0.5, 0.05, 0.5, 0.05, 0.5];
    let i = 0;
    m.rng = () => seq[i++] ?? 0.5;
    m.questionStartedAt = 119_000;
    submitCannonAnswer(m, 'r1', m.entry.term, 119_500);
    submitCannonAnswer(m, 'r2', m.entry.term, 126_000);
    closeCannonAnswering(m, 130_000);
    const v = m.volley;
    assert.equal(v.next, 'finished');
    const finals = v.shots.filter((s) => s.final);
    for (const s of finals) {
        assert.ok(!s.friendly && s.target !== s.team, `final shot must hit the enemy: ${JSON.stringify(s)}`);
    }
    assert.equal(v.shots.length, 2);
    assert.equal(v.shots[1].outcome, 'blown');
    assert.equal(v.shots[1].final, false, 'no slow-mo on the blown-back ball');
    assert.equal(v.shots[0].outcome, 'hit');
    assert.equal(v.shots[0].final, true, 'slow-mo replays the last real hit instead');
});

test('pacing: volleys and holds are short so players wait less', () => {
    assert.ok(VOLLEY_TIMING.introMs <= 500);
    assert.ok(VOLLEY_TIMING.outroMs <= 700);
    assert.ok(VOLLEY_TIMING.emptyMs <= 1_600);
    assert.ok(VOLLEY_TIMING.endHoldMs <= 4_500);
    assert.ok(VOLLEY_TIMING.fortDownMs <= 2_200);
    const v = buildVolley({
        shooters: { red: [{ id: 'r1', ms: 900 }, { id: 'r2', ms: 1500 }], blue: [{ id: 'b1', ms: 1200 }, { id: 'b2', ms: 4000 }] },
        hp: { red: 100, blue: 100 },
        sizes: { red: 2, blue: 2 },
        inputMode: 'choice',
        rng: () => 0,
    });
    assert.ok(v.durationMs <= 2_700, `4-ball salvo should take < 2.7 s, got ${v.durationMs}`);
});

test('running out of time counts as a wrong answer: no shot, counted in stats, Time\'s up result, never challengeable', () => {
    const m = newMatch();
    submitCannonAnswer(m, 'r1', 'cold', 1000);
    submitCannonAnswer(m, 'b1', 'warm', 2000); // a real wrong answer…
    skipCannonPrompt(m, 'b1', 2100); // …that is not challenged
    assert.equal(m.phase, 'question', 'still waiting for r2 and b2');
    assert.deepEqual(cannonTimeoutResults(m), []);

    closeCannonAnswering(m, 20_000);
    for (const id of ['r2', 'b2']) {
        const a = m.answers[id];
        assert.equal(a.submitted, true);
        assert.equal(a.correct, false);
        assert.equal(a.eligible, false);
        assert.equal(a.decision, 'wrong');
        assert.equal(a.answerText, '');
        assert.equal(a.timedOut, true);
        assert.equal(a.ms, 20_000);
        assert.equal(m.stats[id].answered, 1, 'counted as an answered (wrong) question, like b1');
        assert.equal(m.stats[id].correct, 0);
        assert.throws(() => markCannonChallengePending(m, id, 20_100), /no answer to challenge/);
    }
    assert.equal(m.answers.b1.timedOut, false);
    assert.equal(m.stats.b1.answered, 1);
    // Blank answers are not challengeable, so nobody holds the round: straight to the volley.
    assert.equal(m.phase, 'volley');
    assert.equal(m.volley.shots.length, 1, 'only the correct answer fires');
    assert.equal(m.volley.loaded.red, 1);
    assert.equal(m.volley.loaded.blue, 0);

    const results = cannonTimeoutResults(m);
    assert.deepEqual(results.map((r) => r.playerId).sort(), ['b2', 'r2']);
    for (const { result } of results) {
        assert.equal(result.correct, false);
        assert.equal(result.eligible, false);
        assert.equal(result.challengeable, false);
        assert.equal(result.timedOut, true);
        assert.equal(result.correctTerm, 'cold');
        assert.equal(result.cannon, true);
    }
    assert.deepEqual(cannonTimeoutResults(m), [], 'each timeout is reported once');

    const r2 = cannonPublicView(m, { playerId: 'r2', now: 20_000 }).you;
    const b1 = cannonPublicView(m, { playerId: 'b1', now: 20_000 }).you;
    assert.equal(r2.status, b1.status, 'same status as a wrong answer');
    assert.equal(r2.timedOut, true);
    assert.equal(b1.timedOut, false);
    assert.equal(r2.correctTerm, 'cold');
    assert.equal(b1.correctTerm, 'cold');
    assert.equal(cannonPublicView(m, { playerId: 'r1', now: 20_000 }).you.correctTerm, null);
});

test('host skip of a question counts silent players as wrong; everyone answering still fires at once', () => {
    const m = newMatch();
    submitCannonAnswer(m, 'r1', 'cold', 1000);
    hostSkipCannon(m, 1500);
    assert.deepEqual(cannonTimeoutResults(m).map((r) => r.playerId).sort(), ['b1', 'b2', 'r2']);
    assert.equal(m.phase, 'volley');
    advanceCannon(m, m.phaseEndsAt);
    assert.equal(m.phase, 'question');
    const t = m.questionStartedAt;
    for (const id of ['r1', 'r2', 'b1', 'b2']) submitCannonAnswer(m, id, m.entry.term, t + 1000);
    assert.equal(m.phase, 'volley', 'everyone answered -> no waiting for the timer');
    assert.deepEqual(cannonTimeoutResults(m), []);
    assert.equal(m.stats.r2.answered, 2);
});

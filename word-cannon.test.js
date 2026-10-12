import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CANNON_FLOW,
    CANNON_FORT_KILL_BONUS,
    CANNON_MAX_HP,
    CANNON_SHOT_BUDGET,
    CANNON_SIZE_EXP,
    FORCE_STEP_MS,
    FORCE_WINDOWS,
    STORM_RULES,
    baseDamage,
    cannonMvp,
    cannonPublicView,
    cannonQuestionPayload,
    cannonTimeLeft,
    challengeCannonAnswer,
    createCannonMatch,
    finishCannonEarly,
    hostSkipCannon,
    isStormActive,
    leaderByWinsThenPoints,
    mulberry32,
    resolveShot,
    rollStormGust,
    settleCannonReview,
    shotDetail,
    shotForce,
    shotLabel,
    skipCannonPrompt,
    speedTier,
    stormBlownChance,
    submitCannonAnswer,
    tickCannon,
} from './word-cannon.js';

const deck = [
    { term: 'cold', definition: 'Opposite of hot' },
    { term: 'tall', definition: 'Opposite of short (height)' },
    { term: 'happy', definition: 'Feeling joy' },
    { term: 'river', definition: 'A large natural stream of water' },
    { term: 'quiet', definition: 'Making little noise' },
    { term: 'brave', definition: 'Not afraid' },
    { term: 'apple', definition: 'A red or green fruit' },
    { term: 'cloud', definition: 'White shape in the sky' },
];
const teams = {
    red: [{ id: 'r1', nickname: 'Ada' }, { id: 'r2', nickname: 'Ben' }],
    blue: [{ id: 'b1', nickname: 'Cleo' }, { id: 'b2', nickname: 'Dan' }],
};

function newMatch(extra = {}) {
    return createCannonMatch({ teams, deck, answerMode: 'realise', questionMs: 20_000, gameMinutes: 5, introMs: 0, now: 0, seed: 7, ...extra });
}
const q = (m, id) => m.players[id].q;
const right = (m, id, t) => submitCannonAnswer(m, id, q(m, id).term, q(m, id).id, t);
const wrongText = (m, id) => (q(m, id).inputMode === 'choice' ? q(m, id).choices.find((c) => c !== q(m, id).term) : 'zzz');
const wrong = (m, id, t) => submitCannonAnswer(m, id, wrongText(m, id), q(m, id).id, t);
/** Deterministic calm hit: pin the match rng so hit/miss rolls succeed. */
function pinRng(m, value = 0) { m.rng = () => value; }

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

test('faster answers deal more damage; force is continuous', () => {
    const fast = resolveShot({ ms: 400, questionMs: 20_000, teamSize: 2, inputMode: 'typed', rng: () => 0.999 });
    assert.equal(fast.outcome, 'hit');
    assert.equal(fast.tier, 'fast');
    assert.equal(fast.force, 1);
    assert.ok(Math.abs(fast.damage - Math.round(baseDamage(2) * 10) / 10) < 1e-9);
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
    assert.ok(lucky.damage > baseDamage(2));
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
            assert.ok(r.damage >= Math.round(full * STORM_RULES.luckyMin * 10) / 10 - 0.05 && r.damage <= Math.round(full * STORM_RULES.luckyMax * 10) / 10 + 0.05, JSON.stringify(r));
        } else if (r.outcome === 'hit') {
            assert.ok(r.damage >= 0.1 && r.damage <= Math.max(0.1, full * STORM_RULES.wildMax) + 0.05, JSON.stringify(r));
        } else if (r.outcome === 'blown' || r.outcome === 'own') {
            assert.ok(r.damage >= 0.1 && r.damage <= Math.max(0.1, full * STORM_RULES.blownOwnMax) + 0.05, JSON.stringify(r));
        } else {
            assert.equal(r.damage, 0);
        }
    }
});

test('damage per full-power shot = budget / size^exp (tuned for continuous fire)', () => {
    assert.equal(CANNON_SHOT_BUDGET, 16);
    assert.equal(CANNON_SIZE_EXP, 1.24);
    assert.equal(baseDamage(1), 16);
    for (const size of [1, 2, 3, 4, 8, 15]) {
        assert.ok(Math.abs(baseDamage(size) - 16 / size ** 1.24) < 1e-9);
        if (size > 1) assert.ok(baseDamage(size) < baseDamage(size - 1));
    }
    // Big teams still chip the fort: damage keeps 0.1 HP resolution, never 0 on a hit.
    const r = resolveShot({ ms: 19_000, teamSize: 15, inputMode: 'typed', rng: () => 0 });
    assert.ok(r.damage >= 0.1 && r.damage < 1, JSON.stringify(r));
});

test('intro → battle: every player gets an own question right away', () => {
    const m = newMatch({ introMs: 7_000 });
    assert.equal(m.phase, 'intro');
    assert.equal(cannonQuestionPayload(m, 'r1'), null);
    const out = tickCannon(m, 7_000);
    assert.equal(m.phase, 'battle');
    assert.deepEqual(out.dealt.sort(), ['b1', 'b2', 'r1', 'r2']);
    const ids = new Set(m.playerOrder.map((id) => q(m, id).id));
    assert.equal(ids.size, 4, 'question ids are unique per player');
    const p = cannonQuestionPayload(m, 'r1');
    assert.equal(p.questionId, q(m, 'r1').id);
    assert.equal(p.endsAt, 7_000 + 20_000);
    assert.equal(m.gameEndsAt, 7_000 + 5 * 60_000);
    // Host skip of the intro works too.
    const m2 = newMatch({ introMs: 7_000 });
    assert.equal(hostSkipCannon(m2, 100).phase, 'battle');
});

test('a correct answer fires that team cannon immediately; nobody waits for others', () => {
    const m = newMatch();
    pinRng(m, 0);
    const { result, shot } = right(m, 'r1', 1_000);
    assert.equal(result.correct, true);
    assert.ok(shot, 'shot fired at once');
    assert.equal(shot.team, 'red');
    assert.equal(shot.target, 'blue');
    assert.equal(shot.firedAt, 1_000);
    assert.equal(shot.ms, 1_000);
    assert.ok(shot.damage > 0);
    assert.equal(m.teams.blue.hp, CANNON_MAX_HP - shot.damage);
    assert.equal(m.teams.red.points, 1 + Math.round(shot.damage));
    // Other players are untouched and still answering their own questions.
    for (const id of ['r2', 'b1', 'b2']) assert.equal(m.players[id].mode, 'answering');
    // Shooter sees ~1 s feedback, then gets the next question from the tick.
    assert.equal(m.players.r1.mode, 'feedback');
    assert.equal(m.players.r1.nextAt, 1_000 + CANNON_FLOW.feedbackCorrectMs);
    assert.throws(() => submitCannonAnswer(m, 'r1', 'cold', null, 1_200), /next question/);
    const out = tickCannon(m, 2_000);
    assert.deepEqual(out.dealt, ['r1']);
    assert.equal(m.players.r1.mode, 'answering');
    assert.equal(m.players.r1.q.startedAt, 2_000);
    // Force comes from this player's own answer time.
    const later = right(m, 'r1', 2_000 + 9_000);
    assert.ok(later.shot.force < shot.force);
    assert.equal(m.shotSeq, 2);
});

test('players answer at their own pace: many shots from a fast player while a slow one thinks', () => {
    const m = newMatch();
    pinRng(m, 0);
    let t = 0;
    for (let i = 0; i < 5; i++) {
        t += 1_200;
        right(m, 'b1', t);
        t += CANNON_FLOW.feedbackCorrectMs;
        tickCannon(m, t);
    }
    assert.equal(m.stats.b1.shots, 5);
    assert.equal(m.stats.r1.answered, 0);
    assert.equal(m.players.r1.mode, 'answering');
    assert.ok(m.teams.red.hp < 100);
});

test('wrong multiple choice: correct answer shown 1.5 s, no shot; stale or spammed answers are refused', () => {
    const m = newMatch({ answerMode: 'recognise' });
    const qid = q(m, 'r1').id;
    const { result, shot } = wrong(m, 'r1', 2_000);
    assert.equal(shot, null);
    assert.equal(result.correct, false);
    assert.equal(result.challengeable, false);
    assert.equal(result.correctTerm, m.players.r1.q.term);
    assert.equal(m.players.r1.nextAt, 2_000 + CANNON_FLOW.feedbackWrongMs);
    assert.equal(m.shots.length, 0);
    tickCannon(m, 3_500);
    assert.equal(m.players.r1.mode, 'answering');
    assert.throws(() => submitCannonAnswer(m, 'r1', q(m, 'r1').term, qid, 3_600), /question is over/);
    assert.throws(() => submitCannonAnswer(m, 'r1', 'not-a-choice', q(m, 'r1').id, 3_600), /Invalid choice/);
});

test('anti-spam: at most rateMax answers per window', () => {
    const m = newMatch({ answerMode: 'recognise', timing: { feedbackWrongMs: 0 } });
    let t = 1_000;
    let refused = 0;
    for (let i = 0; i < 10; i++) {
        tickCannon(m, t);
        try { wrong(m, 'r1', t); } catch (e) { if (/Slow down/.test(e.message)) refused += 1; else throw e; }
        t += 50;
    }
    assert.ok(refused >= 5, `refused ${refused}`);
    assert.ok(m.stats.r1.answered <= CANNON_FLOW.rateMax);
});

test('a question that runs out counts as wrong, never challengeable, then the next one comes', () => {
    const m = newMatch();
    const out = tickCannon(m, 20_000);
    assert.equal(out.timeouts.length, 4);
    for (const t of out.timeouts) {
        assert.equal(t.result.timedOut, true);
        assert.equal(t.result.challengeable, false);
        assert.equal(t.result.answerText, '');
    }
    assert.equal(m.stats.r1.answered, 1);
    assert.equal(m.shots.length, 0);
    const next = tickCannon(m, 20_000 + CANNON_FLOW.feedbackWrongMs);
    assert.equal(next.dealt.length, 4);
});

test('wrong typed answer → challenge goes to the host queue and the player moves straight on', () => {
    const m = newMatch();
    pinRng(m, 0);
    const before = q(m, 'r1');
    const { result } = wrong(m, 'r1', 3_000);
    assert.equal(result.challengeable, true);
    assert.equal(m.players.r1.mode, 'prompt');
    const review = challengeCannonAnswer(m, 'r1', 4_000);
    assert.equal(review.ms, 3_000);
    assert.equal(review.term, before.term);
    assert.equal(m.reviews.length, 1);
    // No pause: player already has a new question; the clock was not touched.
    assert.equal(m.players.r1.mode, 'answering');
    assert.notEqual(q(m, 'r1').id, before.id);
    assert.equal(m.gameEndsAt, 5 * 60_000);
    // Only one open challenge per player.
    wrong(m, 'r1', 5_000);
    assert.equal(m.players.r1.mode, 'feedback', 'second wrong typed answer is not challengeable while one is open');
    // Accept → retroactive shot at the force earned at answer time (3.0 s typed).
    const hpBefore = m.teams.blue.hp;
    const settled = settleCannonReview(m, review.id, true, 30_000);
    assert.ok(settled.shot);
    assert.equal(settled.shot.retro, true);
    assert.equal(settled.shot.ms, 3_000);
    assert.equal(settled.shot.force, shotForce(3_000, 'typed'));
    assert.equal(m.teams.blue.hp, Math.round((hpBefore - settled.shot.damage) * 10) / 10);
    assert.equal(settled.result.challengeAccepted, true);
    assert.equal(m.reviews.length, 0);
    assert.equal(m.stats.r1.correct, 1);
});

test('rejected challenge just disappears; Continue skips to the next question', () => {
    const m = newMatch();
    wrong(m, 'b1', 2_000);
    const review = challengeCannonAnswer(m, 'b1', 2_500);
    const r = settleCannonReview(m, review.id, false, 3_000);
    assert.equal(r.shot, null);
    assert.equal(r.result.challengeDeclined, true);
    assert.equal(m.teams.red.hp, 100);
    assert.throws(() => settleCannonReview(m, review.id, true, 3_100), /not found/);
    wrong(m, 'b2', 2_000);
    const old = q(m, 'b2').id;
    skipCannonPrompt(m, 'b2', 2_200);
    assert.notEqual(q(m, 'b2').id, old);
    // Unanswered prompt auto-continues after promptMs.
    wrong(m, 'r2', 4_000);
    assert.equal(m.players.r2.mode, 'prompt');
    const out = tickCannon(m, 4_000 + CANNON_FLOW.promptMs);
    assert.ok(out.dealt.includes('r2'));
});

test('a destroyed fort gives exactly 1 WIN + bonus, rebuilds to 100 behind a short shield', () => {
    const m = newMatch();
    pinRng(m, 0);
    m.teams.blue.hp = 3;
    const ptsBefore = m.teams.red.points;
    const { shot } = right(m, 'r1', 500);
    assert.equal(shot.fortDown, 'blue');
    assert.equal(shot.final, true);
    assert.equal(shot.hpAfter, 0);
    assert.equal(shot.damage, 3);
    assert.equal(m.teams.red.fortKills, 1);
    assert.equal(m.teams.red.points, ptsBefore + 1 + 3 + CANNON_FORT_KILL_BONUS);
    assert.equal(m.teams.blue.hp, 100);
    assert.ok(shot.rebuildAt > 500);
    assert.equal(m.phase, 'battle', 'battle goes on');
    // During the rebuild a hit is absorbed by the shield (no damage, no second WIN).
    const s2 = right(m, 'r2', 800).shot;
    assert.equal(s2.outcome, 'shield');
    assert.equal(s2.damage, 0);
    assert.equal(m.teams.blue.hp, 100);
    assert.equal(shotLabel(s2), 'SHIELD! Fort rebuilding');
    tickCannon(m, shot.rebuildAt + 1_000);
    const s3 = right(m, 'r1', shot.rebuildAt + 1_200).shot;
    assert.ok(s3.damage > 0);
    assert.equal(m.teams.red.fortKills, 1);
});

test('own-fort sink credits the other team with the WIN', () => {
    const m = newMatch();
    m.teams.red.hp = 0.5;
    // Slow calm shot: miss roll then stray roll → own fort.
    let i = 0;
    m.rng = () => [0.99, 0.0, 0.5][i++ % 3];
    const { shot } = submitCannonAnswer(m, 'r1', q(m, 'r1').term, q(m, 'r1').id, 19_000);
    assert.equal(shot.friendly, true);
    assert.equal(shot.fortDown, 'red');
    assert.equal(m.teams.blue.fortKills, 1);
    assert.equal(m.teams.red.fortKills, 0);
});

test('storm arrives in the final minute and re-rolls the gust over time', () => {
    const m = newMatch({ gameMinutes: 3 });
    assert.equal(isStormActive(m, 100_000), false);
    assert.equal(isStormActive(m, 125_000), true);
    m.players.r1.q.startedAt = 124_000;
    m.players.r1.q.endsAt = 144_000;
    const { shot } = right(m, 'r1', 125_000);
    assert.equal(shot.storm, true);
    assert.ok(shot.gust >= STORM_RULES.gustMin && shot.gust <= STORM_RULES.gustMax);
    assert.equal(cannonTimeLeft(m, 125_000), 55_000);
});

test('time up: most WINS wins, points only break a tie on WINS; game ends after a short hold', () => {
    assert.equal(leaderByWinsThenPoints({ red: { fortKills: 1, points: 10 }, blue: { fortKills: 0, points: 300 } }), 'red');
    const m = newMatch({ gameMinutes: 3 });
    m.teams.blue.points = 40;
    m.teams.red.points = 30;
    const out = tickCannon(m, 180_000);
    assert.equal(m.phase, 'ending');
    assert.equal(m.result.winner, 'blue');
    assert.equal(m.result.reason, 'time');
    assert.throws(() => submitCannonAnswer(m, 'r1', 'cold', null, 180_100), /closed/);
    assert.ok(out.changed);
    const end = tickCannon(m, 180_000 + CANNON_FLOW.endHoldMs);
    assert.equal(end.finished, true);
    assert.equal(m.phase, 'finished');
});

test('time up on a tie → continuous sudden death: first correct answer fires the LAST SHOT', () => {
    const m = newMatch({ gameMinutes: 3 });
    tickCannon(m, 180_000);
    assert.equal(m.phase, 'battle');
    assert.equal(m.suddenDeath, true);
    // Players keep getting their own questions; anyone may answer.
    tickCannon(m, 180_000 + CANNON_FLOW.feedbackWrongMs);
    const { shot } = right(m, 'b2', 182_000);
    assert.equal(shot.lastShot, true);
    assert.equal(shot.target, 'red');
    assert.equal(m.phase, 'ending');
    assert.equal(m.result.winner, 'blue');
    assert.equal(m.result.reason, 'sudden');
    assert.equal(m.teams.red.hp, 0);
});

test('sudden death with nobody right ends in a draw; open challenges are dropped at the end', () => {
    const m = newMatch({ gameMinutes: 3 });
    wrong(m, 'r1', 179_000);
    const review = challengeCannonAnswer(m, 'r1', 179_500);
    tickCannon(m, 180_000);
    const out = tickCannon(m, 180_000 + CANNON_FLOW.suddenMs);
    assert.equal(m.phase, 'ending');
    assert.equal(m.result.winner, null);
    assert.equal(m.result.reason, 'draw');
    assert.deepEqual(out.dropped, [review.id]);
});

test('host end: more points wins, equal is a draw', () => {
    const m = newMatch();
    m.teams.red.points = 5;
    finishCannonEarly(m);
    assert.equal(m.result.winner, 'red');
    const d = newMatch();
    finishCannonEarly(d);
    assert.equal(d.result.reason, 'draw');
});

test('a player does not see the same word again too soon', () => {
    const m = newMatch({ timing: { feedbackWrongMs: 0, rateMax: 999 } });
    const seen = [];
    let t = 0;
    for (let i = 0; i < 40; i++) {
        seen.push(q(m, 'r1').idx);
        t += 100;
        wrong(m, 'r1', t);
        skipCannonPrompt(m, 'r1', t);
    }
    const gap = Math.min(CANNON_FLOW.repeatGap, Math.floor(deck.length / 2));
    for (let i = 1; i < seen.length; i++) {
        const window = seen.slice(Math.max(0, i - gap), i);
        assert.ok(!window.includes(seen[i]), `repeat at ${i}: ${seen.join(',')}`);
    }
    // Every word turns up.
    assert.equal(new Set(seen).size, deck.length);
});

test('same seed, same battle', () => {
    const run = () => {
        const m = newMatch({ seed: 99, answerMode: 'randomise' });
        let t = 0;
        for (let i = 0; i < 30; i++) {
            t += 700;
            for (const id of m.playerOrder) {
                if (m.players[id].mode === 'answering') right(m, id, t);
            }
            tickCannon(m, t + 1_000);
        }
        return { red: m.teams.red.hp, blue: m.teams.blue.hp, shots: m.shots.map((s) => s.outcome + s.damage) };
    };
    assert.deepEqual(run(), run());
});

test('public view: host gets the shot log and review queue; phones get their own question state', () => {
    const m = newMatch();
    pinRng(m, 0);
    right(m, 'r1', 1_000);
    wrong(m, 'b1', 1_500);
    challengeCannonAnswer(m, 'b1', 1_600);
    const host = cannonPublicView(m, { forHost: true, now: 1_700 });
    assert.equal(host.phase, 'battle');
    assert.equal(host.shots.length, 1);
    assert.equal(host.shotSeq, 1);
    assert.equal(host.reviews.length, 1);
    assert.equal(host.teams.red.stats.shots, 1);
    assert.equal(host.teams.blue.stats.answered, 1);
    assert.equal(host.clock.pausedAt, null);
    assert.equal(host.round, undefined, 'no round counter any more');
    const phone = cannonPublicView(m, { playerId: 'b1', now: 1_700 });
    assert.deepEqual(phone.reviews, []);
    assert.equal(phone.you.team, 'blue');
    assert.equal(phone.you.mode, 'answering');
    assert.equal(phone.you.reviewPending, true);
    assert.equal(phone.you.questionId, q(m, 'b1').id);
    assert.equal(cannonMvp(m).id, 'r1');
});

test('labels show answer time, force and damage', () => {
    assert.equal(shotDetail({ ms: 1234, force: 0.92, damage: 9, team: 'red', target: 'blue' }), '1.2s · 92% force · −9');
    assert.equal(shotDetail({ ms: 8000, force: 0.3, damage: 0, team: 'red', target: 'blue' }), '8.0s · 30% force · no damage');
    assert.equal(shotDetail({ ms: 9000, force: 0.5, damage: 3.4, team: 'red', target: 'red' }), '9.0s · 50% force · −3.4 own fort');
    assert.equal(shotLabel({ ms: 900, tier: 'fast', outcome: 'hit' }), 'FAST 0.9s: HIT!');
    assert.equal(shotLabel({ outcome: 'lucky' }), 'LUCKY HIT!');
    assert.equal(shotLabel({ lastShot: true }), 'LAST SHOT!');
});

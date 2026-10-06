import assert from 'node:assert/strict';
import test from 'node:test';
import {
    LANTERN_BASE,
    MYSTERY_POOL,
    advanceLantern,
    closeLanternAnswering,
    closeLanternPicks,
    createLanternMatch,
    expireLanternReview,
    forceLanternReview,
    markLanternChallengePending,
    normalizeLanternRounds,
    personalLanternResult,
    pickLantern,
    pickWeighted,
    resolveLanternRound,
    settleLanternChallenge,
    submitLanternAnswer,
} from './lucky-lanterns.js';

function rngOf(values) {
    let i = 0;
    return () => {
        const value = values[Math.min(i, values.length - 1)];
        i += 1;
        return value;
    };
}

function player(id, nickname, extra = {}) {
    return {
        id,
        nickname,
        score: 0,
        shield: false,
        eligible: true,
        pick: null,
        ...extra,
    };
}

test('rounds clamp to 3–20 and default to 10', () => {
    assert.equal(normalizeLanternRounds(undefined), 10);
    assert.equal(normalizeLanternRounds(1), 3);
    assert.equal(normalizeLanternRounds(40), 20);
    assert.equal(normalizeLanternRounds(7.4), 7);
});

test('safe lantern adds the base and never goes negative', () => {
    const resolved = resolveLanternRound([
        player('a', 'Ada', { score: 0, pick: 'safe' }),
        player('b', 'Bea', { eligible: false, score: 0 }),
    ], { rng: rngOf([0]) });
    const ada = resolved.leaderboard.find((row) => row.id === 'a');
    const bea = resolved.leaderboard.find((row) => row.id === 'b');
    assert.equal(ada.score, LANTERN_BASE);
    assert.equal(bea.score, 0);
    assert.equal(resolved.steps[0].group, 'safe');
    assert.ok(resolved.leaderboard.every((row) => row.score >= 0));
});

test('risk doubles the base or busts to 0, and a shield softens the bust', () => {
    const doubled = resolveLanternRound([
        player('a', 'Ada', { pick: 'risk' }),
    ], { rng: rngOf([0.1]) });
    assert.equal(doubled.leaderboard[0].score, LANTERN_BASE * 2);
    assert.equal(doubled.steps[0].coin, 'double');

    const bust = resolveLanternRound([
        player('a', 'Ada', { score: 40, pick: 'risk' }),
    ], { rng: rngOf([0.9]) });
    assert.equal(bust.leaderboard[0].score, 40);
    assert.equal(bust.steps[0].tone, 'bust');

    const saved = resolveLanternRound([
        player('a', 'Ada', { score: 40, shield: true, pick: 'risk' }),
    ], { rng: rngOf([0.9]) });
    assert.equal(saved.leaderboard[0].score, 40 + LANTERN_BASE);
    assert.equal(saved.leaderboard[0].shield, false);
    assert.equal(saved.steps[0].savedByShield, true);
});

test('no-pick scores nothing and a wrong answer is not a lantern', () => {
    const resolved = resolveLanternRound([
        player('a', 'Ada', { score: 80, pick: null }),
        player('b', 'Bea', { score: 80, eligible: false, pick: 'safe' }),
    ], { rng: rngOf([0]) });
    assert.equal(resolved.leaderboard.find((row) => row.id === 'a').score, 80);
    assert.equal(resolved.leaderboard.find((row) => row.id === 'b').score, 80);
    assert.equal(resolved.steps.length, 0);
    assert.match(personalLanternResult(resolved, 'a').detail, /No lantern picked/);
    assert.match(personalLanternResult(resolved, 'b').detail, /No lantern this round/);
});

test('steal takes at most 100 from the player above and cannot go negative', () => {
    const pool = [{ id: 'steal100', weight: 1 }];
    const resolved = resolveLanternRound([
        player('lead', 'Lead', { score: 400, pick: 'safe' }),
        player('mid', 'Mid', { score: 30, pick: null }),
        player('thief', 'Thief', { score: 10, pick: 'mystery' }),
    ], { rng: rngOf([0]), pool });
    const mid = resolved.leaderboard.find((row) => row.id === 'mid');
    const thief = resolved.leaderboard.find((row) => row.id === 'thief');
    const lead = resolved.leaderboard.find((row) => row.id === 'lead');
    assert.equal(mid.score, 0);
    assert.equal(thief.score, 40);
    assert.equal(lead.score, 500);
    assert.ok(resolved.leaderboard.every((row) => row.score >= 0));
});

test('a shield blocks a steal and the thief gets a small consolation', () => {
    const pool = [{ id: 'steal100', weight: 1 }];
    const resolved = resolveLanternRound([
        player('lead', 'Lead', { score: 200, shield: true, pick: null }),
        player('thief', 'Thief', { score: 50, pick: 'mystery' }),
    ], { rng: rngOf([0]), pool });
    const lead = resolved.leaderboard.find((row) => row.id === 'lead');
    const thief = resolved.leaderboard.find((row) => row.id === 'thief');
    assert.equal(lead.score, 200);
    assert.equal(lead.shield, false);
    assert.equal(thief.score, 100);
});

test('the leader who rolls steal gets +50 instead of punishing anyone', () => {
    const pool = [{ id: 'steal100', weight: 1 }];
    const resolved = resolveLanternRound([
        player('lead', 'Lead', { score: 200, pick: 'mystery' }),
        player('next', 'Next', { score: 50, pick: null }),
    ], { rng: rngOf([0]), pool });
    assert.equal(resolved.leaderboard.find((row) => row.id === 'lead').score, 250);
    assert.equal(resolved.leaderboard.find((row) => row.id === 'next').score, 50);
});

test('swap trades with the leader, a second swap pays +100, and the leader cannot swap', () => {
    const pool = [{ id: 'swapLeader', weight: 1 }];
    const resolved = resolveLanternRound([
        player('amy', 'Amy', { score: 50, pick: 'mystery' }),
        player('bea', 'Bea', { score: 40, pick: 'mystery' }),
        player('lee', 'Lee', { score: 500, pick: null }),
    ], { rng: rngOf([0, 0]), pool });
    const amy = resolved.leaderboard.find((row) => row.id === 'amy');
    const bea = resolved.leaderboard.find((row) => row.id === 'bea');
    const lee = resolved.leaderboard.find((row) => row.id === 'lee');
    assert.equal(amy.score, 500);
    assert.equal(lee.score, 50);
    assert.equal(bea.score, 140);

    const already = resolveLanternRound([
        player('lee', 'Lee', { score: 500, pick: 'mystery' }),
        player('amy', 'Amy', { score: 20, pick: null }),
    ], { rng: rngOf([0]), pool });
    assert.equal(already.leaderboard.find((row) => row.id === 'lee').score, 600);
    assert.equal(already.leaderboard.find((row) => row.id === 'amy').score, 20);
});

test('ALL IN doubles or zeroes the score, shield keeps it, and the bet is locked from steals', () => {
    const doubled = resolveLanternRound([
        player('a', 'Ada', { score: 250, pick: 'allin' }),
    ], { rng: rngOf([0.1]) });
    assert.equal(doubled.leaderboard[0].score, 500);

    const bust = resolveLanternRound([
        player('a', 'Ada', { score: 250, pick: 'allin' }),
    ], { rng: rngOf([0.9]) });
    assert.equal(bust.leaderboard[0].score, 0);

    const saved = resolveLanternRound([
        player('a', 'Ada', { score: 250, shield: true, pick: 'allin' }),
    ], { rng: rngOf([0.9]) });
    assert.equal(saved.leaderboard[0].score, 250);
    assert.equal(saved.leaderboard[0].shield, false);

    const pool = [{ id: 'steal100', weight: 1 }];
    const locked = resolveLanternRound([
        player('high', 'High', { score: 400, pick: 'allin' }),
        player('thief', 'Thief', { score: 100, pick: 'mystery' }),
    ], { rng: rngOf([0.1, 0]), pool });
    const high = locked.leaderboard.find((row) => row.id === 'high');
    const thief = locked.leaderboard.find((row) => row.id === 'thief');
    assert.equal(high.score, 800);
    assert.equal(thief.score, 150);
});

test('mystery bonuses and a new shield do not drop the score', () => {
    const plus = resolveLanternRound([
        player('a', 'Ada', { score: 10, pick: 'mystery' }),
    ], { rng: rngOf([0]), pool: [{ id: 'plus150', weight: 1 }] });
    assert.equal(plus.leaderboard[0].score, 160);

    const shield = resolveLanternRound([
        player('a', 'Ada', { score: 10, pick: 'mystery' }),
    ], { rng: rngOf([0]), pool: [{ id: 'shield', weight: 1 }] });
    assert.equal(shield.leaderboard[0].score, 10);
    assert.equal(shield.leaderboard[0].shield, true);
});

test('reveal order is safe, then risk, then mystery, then ALL IN', () => {
    const resolved = resolveLanternRound([
        player('m', 'Mia', { pick: 'mystery' }),
        player('r', 'Rex', { pick: 'risk' }),
        player('s', 'Sue', { pick: 'safe' }),
        player('z', 'Zed', { score: 20, pick: 'allin' }),
    ], { rng: rngOf([0.1, 0, 0.1]), pool: [{ id: 'plus50', weight: 1 }] });
    assert.deepEqual(resolved.steps.map((step) => step.group), ['safe', 'risk', 'mystery', 'allin']);
});

test('weighted picker stays inside the pool', () => {
    assert.equal(pickWeighted(MYSTERY_POOL, () => 0), 'plus150');
    assert.equal(pickWeighted(MYSTERY_POOL, () => 0.999), 'swapLeader');
});

const DECK = [
    { term: 'school', definition: 'A place where children learn' },
    { term: 'bakery', definition: 'A shop that sells bread' },
    { term: 'garden', definition: 'A place where flowers grow' },
    { term: 'harbour', definition: 'A place where boats stay' },
];

test('a realise round waits for a challenge before lanterns, and Accept earns a pick', () => {
    const now = 1_000_000;
    const match = createLanternMatch({
        players: [
            { id: 'ada', nickname: 'Ada' },
            { id: 'bea', nickname: 'Bea' },
        ],
        deck: DECK,
        rounds: 3,
        answerMode: 'realise',
        now,
        rng: rngOf([0.1, 0.1, 0.1]),
    });
    assert.equal(match.inputMode, 'typed');
    const term = match.entry.term;

    const wrong = submitLanternAnswer(match, 'ada', 'nope', now + 1000);
    assert.equal(wrong.result.challengeable, true);
    assert.equal(wrong.result.lantern, true);
    assert.equal(match.phase, 'question');

    const right = submitLanternAnswer(match, 'bea', term, now + 2000);
    assert.equal(right.result.correct, true);
    assert.equal(match.phase, 'review');
    assert.ok(match.phaseEndsAt > now + 2000);

    markLanternChallengePending(match, 'ada', now + 2500);
    assert.equal(match.phase, 'review');
    assert.equal(match.phaseEndsAt, null);
    settleLanternChallenge(match, 'ada', true, now + 3000);
    assert.equal(match.phase, 'picking');
    assert.equal(match.answers.ada.eligible, true);
    assert.equal(match.answers.bea.eligible, true);

    pickLantern(match, 'ada', 'safe', now + 4000);
    assert.equal(match.phase, 'picking');
    pickLantern(match, 'bea', 'safe', now + 4500);
    assert.equal(match.phase, 'reveal');
    assert.equal(match.scores.ada, 100);
    assert.equal(match.scores.bea, 100);

    assert.equal(advanceLantern(match, now + 8000), 'question');
    assert.equal(match.roundIndex, 1);
});

test('a declined challenge and a missed answer score nothing, and the last round allows ALL IN', () => {
    const now = 5_000;
    const match = createLanternMatch({
        players: [
            { id: 'ada', nickname: 'Ada' },
            { id: 'bea', nickname: 'Bea' },
            { id: 'cam', nickname: 'Cam' },
        ],
        deck: DECK,
        rounds: 3,
        answerMode: 'realise',
        now,
        rng: rngOf([0.9]),
    });
    submitLanternAnswer(match, 'ada', 'nope', now);
    markLanternChallengePending(match, 'ada', now);
    submitLanternAnswer(match, 'bea', match.entry.term, now);
    assert.equal(match.phase, 'question');
    closeLanternAnswering(match, now + 10);
    assert.equal(match.phase, 'review');
    settleLanternChallenge(match, 'ada', false, now + 20);
    assert.equal(match.phase, 'picking');
    assert.equal(match.answers.ada.eligible, false);
    assert.equal(match.answers.cam.eligible, false);
    assert.throws(() => pickLantern(match, 'ada', 'safe', now), /correct answer/);
    pickLantern(match, 'bea', 'safe', now);
    assert.equal(match.scores.bea, 100);
    assert.equal(match.scores.ada, 0);

    advanceLantern(match, now);
    closeLanternAnswering(match, now);
    closeLanternPicks(match, now);
    advanceLantern(match, now);
    assert.equal(match.isFinal, true);
    assert.throws(() => pickLantern(match, 'bea', 'allin', now), /not open/);
    submitLanternAnswer(match, 'bea', match.entry.term, now);
    closeLanternAnswering(match, now);
    assert.equal(match.phase, 'picking');
    pickLantern(match, 'bea', 'allin', now);
    assert.equal(match.phase, 'reveal');
    assert.ok(match.reveal.steps.some((step) => step.group === 'allin'));
    assert.equal(advanceLantern(match, now), 'finished');
});

test('multiple choice wrong answers are not challengeable, and review skip declines a pending challenge', () => {
    const now = 9_000;
    const match = createLanternMatch({
        players: [
            { id: 'ada', nickname: 'Ada' },
            { id: 'bea', nickname: 'Bea' },
        ],
        deck: DECK,
        rounds: 3,
        answerMode: 'recognise',
        now,
        rng: () => 0,
    });
    assert.equal(match.inputMode, 'choice');
    const wrongChoice = match.choices.find((choice) => choice.toLowerCase() !== match.entry.term.toLowerCase());
    const wrong = submitLanternAnswer(match, 'ada', wrongChoice, now);
    assert.equal(wrong.result.challengeable, false);
    assert.equal(match.answers.ada.decision, 'wrong');

    const typed = createLanternMatch({
        players: [
            { id: 'ada', nickname: 'Ada' },
            { id: 'bea', nickname: 'Bea' },
        ],
        deck: DECK,
        rounds: 3,
        answerMode: 'realise',
        now,
        rng: () => 0,
    });
    submitLanternAnswer(typed, 'ada', 'almost', now);
    submitLanternAnswer(typed, 'bea', typed.entry.term, now);
    assert.equal(typed.phase, 'review');
    const { skipped } = expireLanternReview(typed, now + 20_000);
    assert.deepEqual(skipped, ['ada']);
    assert.equal(typed.phase, 'picking');

    const pending = createLanternMatch({
        players: [
            { id: 'ada', nickname: 'Ada' },
            { id: 'bea', nickname: 'Bea' },
        ],
        deck: DECK,
        rounds: 3,
        answerMode: 'realise',
        now,
        rng: () => 0,
    });
    submitLanternAnswer(pending, 'ada', 'almost', now);
    submitLanternAnswer(pending, 'bea', pending.entry.term, now);
    pending.answers.ada.decision = 'pending';
    const forced = forceLanternReview(pending, now);
    assert.deepEqual(forced.declined, ['ada']);
    assert.equal(pending.answers.ada.eligible, false);
    assert.equal(pending.phase, 'picking');
});

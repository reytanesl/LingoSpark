/**
 * Word Cannon Battle — match flow and scoring for Live Spark.
 *
 * Two fixed teams (Red and Blue) defend forts that start at 100% health.
 * Every round has a shared question. Each correct answer loads one cannonball
 * into the team's ammo panel. After the question (and any Challenge review),
 * a volley fires the loaded balls, alternating teams.
 *
 * Aim depends on answer speed, measured as a share of the question time:
 * - FAST (<= 30% of the time): always hits, full damage
 * - GOOD (<= 60%):             75% hit chance, half damage
 * - SLOW (later):              40% hit chance, one-fifth damage
 * Smaller hits keep forts alive longer; the big FAST/GOOD/SLOW gap rewards speed.
 *
 * Fairness: each team can deal the same damage per round whatever its size.
 * A team loads at most CANNON_MAX_BALLS balls; with more players than slots,
 * the share of correct answers decides how many balls load (fastest shooters
 * fire). Ball damage = CANNON_ROUND_BUDGET / slots, times the speed factor.
 *
 * Storm: the host picks a game length. In the final CANNON_STORM_MS the storm
 * blows: 20% of shots are BLOWN AWAY (miss), 15% are a LUCKY HIT (sure hit,
 * x1.5 damage), the rest follow the speed rules.
 *
 * End: a fort at 0% sinks (that shot is the LAST SHOT). When time is up, the
 * round in progress finishes and the healthier fort wins. A tie goes to sudden
 * death: the team with the fastest correct answer fires one sure LAST SHOT.
 * After CANNON_SUDDEN_TRIES questions without a correct answer it is a draw.
 *
 * All randomness comes from the match rng (seedable with mulberry32).
 */

import { buildChoices, matchesTermAnswer, sanitizeAnswerText } from './vocab-quiz-utils.js';

export const CANNON_FORMAT = 'word-cannon';
export const CANNON_MAX_HP = 100;
export const CANNON_MAX_BALLS = 5;
export const CANNON_ROUND_BUDGET = 20;
export const CANNON_QUESTION_MS = 20_000;
export const CANNON_REVIEW_MS = 12_000;
export const CANNON_INTRO_MS = 4_200;
export const CANNON_GAME_MINUTES = [3, 5, 8, 10];
export const CANNON_DEFAULT_MINUTES = 5;
export const CANNON_STORM_MS = 60_000;
export const CANNON_SUDDEN_TRIES = 3;
export const CANNON_TEAM_IDS = ['red', 'blue'];
export const CANNON_TEAM_NAMES = { red: 'Red Team', blue: 'Blue Team' };

/** Volley pacing (ms). The client plays the same beats. */
export const VOLLEY_TIMING = {
    introMs: 1_100,
    shotMs: 1_850,
    finalShotMs: 4_400,
    outroMs: 1_500,
    emptyMs: 2_800,
    endHoldMs: 5_600,
};

export const SPEED_TIERS = [
    { tier: 'fast', upTo: 0.3, hitChance: 1, factor: 1 },
    { tier: 'good', upTo: 0.6, hitChance: 0.75, factor: 0.5 },
    { tier: 'slow', upTo: Infinity, hitChance: 0.4, factor: 0.2 },
];

export const STORM_RULES = { blownBelow: 0.2, luckyBelow: 0.35, luckyFactor: 1.5 };

/** Small, fast, seedable PRNG. */
export function mulberry32(seed) {
    let a = (Number(seed) >>> 0) || 0x9e3779b9;
    return function rng() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function normalizeGameMinutes(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n <= 0) return CANNON_DEFAULT_MINUTES;
    return Math.max(2, Math.min(15, n));
}

export function otherTeam(teamId) {
    return teamId === 'red' ? 'blue' : 'red';
}

/** Speed tier for an answer given after `ms` of a `questionMs` question. */
export function speedTier(ms, questionMs = CANNON_QUESTION_MS) {
    const total = Math.max(1, Number(questionMs) || CANNON_QUESTION_MS);
    const share = Math.max(0, Number(ms) || 0) / total;
    return SPEED_TIERS.find((t) => share <= t.upTo) || SPEED_TIERS[SPEED_TIERS.length - 1];
}

/** Ball slots for a team: never more than CANNON_MAX_BALLS, never fewer than 1. */
export function teamSlots(teamSize) {
    return Math.max(1, Math.min(CANNON_MAX_BALLS, Math.floor(Number(teamSize) || 0)));
}

/** Damage of one hit at full power for a team of this size. */
export function baseDamage(teamSize) {
    return CANNON_ROUND_BUDGET / teamSlots(teamSize);
}

/**
 * How many balls load: one per correct answer up to the slots. Bigger teams load
 * by share so a big class does not out-shoot a small one.
 */
export function ballsLoaded(correctCount, teamSize) {
    const correct = Math.max(0, Math.floor(correctCount || 0));
    const size = Math.max(1, Math.floor(teamSize || 0));
    if (!correct) return 0;
    if (size <= CANNON_MAX_BALLS) return Math.min(correct, size);
    return Math.max(1, Math.min(CANNON_MAX_BALLS, Math.round((CANNON_MAX_BALLS * correct) / size)));
}

/**
 * Resolve one shot. Pure apart from the rng.
 * Returns { outcome: 'hit'|'miss'|'blown'|'lucky', tier, damage }.
 */
export function resolveShot({ ms, questionMs, teamSize, storm = false, rng = Math.random }) {
    const tier = speedTier(ms, questionMs);
    const full = baseDamage(teamSize) * tier.factor;
    if (storm) {
        const roll = rng();
        if (roll < STORM_RULES.blownBelow) return { outcome: 'blown', tier: tier.tier, damage: 0 };
        if (roll < STORM_RULES.luckyBelow) {
            return { outcome: 'lucky', tier: tier.tier, damage: Math.max(1, Math.round(full * STORM_RULES.luckyFactor)) };
        }
    }
    const hit = tier.hitChance >= 1 || rng() < tier.hitChance;
    return hit
        ? { outcome: 'hit', tier: tier.tier, damage: Math.max(1, Math.round(full)) }
        : { outcome: 'miss', tier: tier.tier, damage: 0 };
}

/** Shot label like "FAST 1.2s: HIT!" (the client shows the same text). */
export function shotLabel(shot) {
    if (shot.lastShot) return 'LAST SHOT!';
    const secs = `${(Math.max(0, shot.ms || 0) / 1000).toFixed(1)}s`;
    const tier = String(shot.tier || 'slow').toUpperCase();
    if (shot.outcome === 'blown') return 'BLOWN AWAY!';
    if (shot.outcome === 'lucky') return 'LUCKY HIT!';
    return `${tier} ${secs}: ${shot.outcome === 'hit' ? 'HIT!' : 'MISS'}`;
}

/**
 * Build a volley from the correct answers of a round.
 * shooters: { red: [{id, nickname, ms}], blue: [...] } (any order)
 * hp: { red, blue }   sizes: { red, blue }
 * Teams alternate, starting with the team that had the fastest correct answer.
 * Damage is applied in order and the volley stops when a fort sinks.
 */
export function buildVolley({ shooters, hp, sizes, questionMs = CANNON_QUESTION_MS, storm = false, rng = Math.random, timing = VOLLEY_TIMING }) {
    const queues = {};
    const loaded = {};
    for (const team of CANNON_TEAM_IDS) {
        const list = [...(shooters?.[team] || [])].sort((a, b) => a.ms - b.ms || String(a.id).localeCompare(String(b.id)));
        const n = ballsLoaded(list.length, sizes?.[team] || list.length || 1);
        queues[team] = list.slice(0, n);
        loaded[team] = n;
    }
    let first = 'red';
    const fr = queues.red[0]?.ms ?? Infinity;
    const fb = queues.blue[0]?.ms ?? Infinity;
    if (fb < fr) first = 'blue';
    const hpNow = { red: hp?.red ?? CANNON_MAX_HP, blue: hp?.blue ?? CANNON_MAX_HP };
    const hpBefore = { ...hpNow };
    const order = [];
    let turn = first;
    while (queues.red.length || queues.blue.length) {
        if (!queues[turn].length) turn = otherTeam(turn);
        order.push({ team: turn, shooter: queues[turn].shift() });
        turn = otherTeam(turn);
    }
    const shots = [];
    let sunk = null;
    for (const { team, shooter } of order) {
        if (sunk) break;
        const target = otherTeam(team);
        const r = resolveShot({ ms: shooter.ms, questionMs, teamSize: sizes?.[team] || 1, storm, rng });
        const before = hpNow[target];
        const after = Math.max(0, before - r.damage);
        hpNow[target] = after;
        const shot = {
            index: shots.length,
            team,
            target,
            shooterId: shooter.id,
            nickname: shooter.nickname || '',
            ms: Math.round(shooter.ms),
            tier: r.tier,
            outcome: r.outcome,
            damage: before - after,
            hpBefore: before,
            hpAfter: after,
            final: after <= 0,
            lastShot: false,
        };
        shot.label = shotLabel(shot);
        shots.push(shot);
        if (after <= 0) sunk = target;
    }
    return timeVolley({ shots, loaded, hpBefore, hpAfter: hpNow, storm, first, sunk }, timing);
}

/** Add `at`/`dur` beats and the total duration. */
export function timeVolley(volley, timing = VOLLEY_TIMING) {
    let t = timing.introMs;
    for (const shot of volley.shots) {
        shot.at = t;
        shot.dur = shot.final ? timing.finalShotMs : timing.shotMs;
        t += shot.dur;
    }
    volley.durationMs = volley.shots.length ? t + timing.outroMs : timing.emptyMs;
    return volley;
}

/** Sudden death: the fastest correct answer fires one sure LAST SHOT that sinks the other fort. */
export function buildSuddenDeathVolley({ shooters, hp, timing = VOLLEY_TIMING }) {
    const all = [];
    for (const team of CANNON_TEAM_IDS) {
        for (const s of shooters?.[team] || []) all.push({ ...s, team });
    }
    all.sort((a, b) => a.ms - b.ms || String(a.id).localeCompare(String(b.id)));
    const hpBefore = { red: hp?.red ?? CANNON_MAX_HP, blue: hp?.blue ?? CANNON_MAX_HP };
    const hpAfter = { ...hpBefore };
    const loaded = { red: 0, blue: 0 };
    const shots = [];
    let sunk = null;
    const best = all[0];
    if (best) {
        const target = otherTeam(best.team);
        loaded[best.team] = 1;
        const before = hpBefore[target];
        hpAfter[target] = 0;
        const shot = {
            index: 0,
            team: best.team,
            target,
            shooterId: best.id,
            nickname: best.nickname || '',
            ms: Math.round(best.ms),
            tier: 'fast',
            outcome: 'hit',
            damage: before,
            hpBefore: before,
            hpAfter: 0,
            final: true,
            lastShot: true,
        };
        shot.label = shotLabel(shot);
        shots.push(shot);
        sunk = target;
    }
    return timeVolley({ shots, loaded, hpBefore, hpAfter, storm: false, first: best?.team || null, sunk, suddenDeath: true }, timing);
}

/** Winner by health: 'red' | 'blue' | null (tie). */
export function leaderByHp(hp) {
    if (hp.red > hp.blue) return 'red';
    if (hp.blue > hp.red) return 'blue';
    return null;
}

// ---------------------------------------------------------------------------
// Match flow
// ---------------------------------------------------------------------------

function resolveInputMode(answerMode, rng) {
    if (answerMode === 'recognise') return 'choice';
    if (answerMode === 'realise') return 'typed';
    return rng() < 0.5 ? 'choice' : 'typed';
}

function blankAnswer() {
    return { submitted: false, correct: false, eligible: false, answerText: '', decision: null, ms: null };
}

function blankStats() {
    return { correct: 0, answered: 0, shots: 0, hits: 0, damage: 0, totalMs: 0 };
}

/** Remaining game time (ms), honouring a paused clock. */
export function cannonTimeLeft(match, now = Date.now()) {
    if (!match?.gameEndsAt) return match?.gameMs ?? 0;
    const ref = match.clockPausedAt ?? now;
    return Math.max(0, match.gameEndsAt - ref);
}

export function isStormActive(match, now = Date.now()) {
    if (!match?.gameEndsAt) return false;
    return cannonTimeLeft(match, now) <= Math.min(CANNON_STORM_MS, match.gameMs);
}

function pauseClock(match, now) {
    if (match.gameEndsAt && match.clockPausedAt == null) match.clockPausedAt = now;
}

function resumeClock(match, now) {
    if (match.clockPausedAt != null) {
        match.gameEndsAt += Math.max(0, now - match.clockPausedAt);
        match.clockPausedAt = null;
    }
}

function beginRound(match, now) {
    match.phase = 'question';
    match.questionId += 1;
    match.roundIndex += 1;
    match.volley = null;
    match.answers = {};
    for (const id of match.playerOrder) match.answers[id] = blankAnswer();
    const entry = match.deck[match.cursor % match.deck.length];
    match.cursor += 1;
    match.entry = { term: entry.term, definition: entry.definition };
    match.inputMode = resolveInputMode(match.answerMode, match.rng);
    match.choices = match.inputMode === 'choice'
        ? buildChoices(entry.term, match.deck.map((d) => d.term), match.level)
        : null;
    if (!match.gameEndsAt) match.gameEndsAt = now + match.gameMs;
    resumeClock(match, now);
    match.questionStartedAt = now;
    match.phaseEndsAt = now + match.questionMs;
}

function openPrompt(match) {
    return match.playerOrder.some((id) => match.answers[id]?.decision === 'prompt');
}

function openPending(match) {
    return match.playerOrder.some((id) => match.answers[id]?.decision === 'pending');
}

function allSubmitted(match) {
    return match.playerOrder.every((id) => match.answers[id]?.submitted);
}

function shootersFromAnswers(match) {
    const shooters = { red: [], blue: [] };
    for (const id of match.playerOrder) {
        const answer = match.answers[id];
        if (!answer?.eligible) continue;
        shooters[match.playerTeam[id]].push({ id, nickname: match.nicknames[id], ms: answer.ms ?? match.questionMs });
    }
    return shooters;
}

function startVolley(match, now) {
    resumeClock(match, now);
    const shooters = shootersFromAnswers(match);
    const hp = { red: match.teams.red.hp, blue: match.teams.blue.hp };
    const sizes = { red: match.teams.red.memberIds.length, blue: match.teams.blue.memberIds.length };
    const timeUp = cannonTimeLeft(match, now) <= 0;
    const storm = !match.suddenDeath && isStormActive(match, now);
    let volley;
    if (match.suddenDeath) {
        volley = buildSuddenDeathVolley({ shooters, hp, timing: match.timing });
        match.suddenTries += 1;
    } else {
        volley = buildVolley({ shooters, hp, sizes, questionMs: match.questionMs, storm, rng: match.rng, timing: match.timing });
    }
    volley.round = match.roundIndex;
    volley.seq = ++match.volleySeq;
    volley.answerTerm = match.entry?.term || '';
    volley.definition = match.entry?.definition || '';
    volley.timeUp = timeUp;
    // Apply results.
    for (const team of CANNON_TEAM_IDS) match.teams[team].hp = volley.hpAfter[team];
    for (const shot of volley.shots) {
        const s = match.stats[shot.shooterId];
        if (!s) continue;
        s.shots += 1;
        if (shot.outcome === 'hit' || shot.outcome === 'lucky') s.hits += 1;
        s.damage += shot.damage;
    }
    // Decide what comes next.
    let next = 'question';
    let winner = null;
    let reason = null;
    if (volley.sunk) {
        winner = otherTeam(volley.sunk);
        reason = match.suddenDeath ? 'sudden' : 'sunk';
        next = 'finished';
    } else if (match.suddenDeath) {
        if (match.suddenTries >= CANNON_SUDDEN_TRIES) {
            next = 'finished';
            reason = 'draw';
        } else {
            next = 'sudden';
        }
    } else if (timeUp) {
        winner = leaderByHp(volley.hpAfter);
        if (winner) {
            next = 'finished';
            reason = 'time';
            // Slow-mo on the last hit that landed on the losing fort this volley.
            const loser = otherTeam(winner);
            const lastHit = [...volley.shots].reverse().find((s) => s.target === loser && s.damage > 0);
            if (lastHit && !lastHit.final) {
                lastHit.final = true;
                timeVolley(volley, match.timing);
            }
        } else {
            next = 'sudden';
            reason = 'tie';
        }
    }
    volley.next = next;
    volley.winner = winner;
    volley.reason = reason;
    if (next === 'finished') volley.durationMs += match.timing.endHoldMs;
    if (next === 'sudden') volley.durationMs += 1_400;
    match.volley = volley;
    match.phase = 'volley';
    match.phaseEndsAt = now + volley.durationMs;
    if (next === 'finished') {
        match.result = { winner, reason, hp: { ...volley.hpAfter } };
    }
    return 'volley';
}

function syncPhase(match, now) {
    if (match.phase !== 'question' && match.phase !== 'review') return match.phase;
    if (match.phase === 'question' && !allSubmitted(match)) return 'question';
    if (openPrompt(match) || openPending(match)) {
        const entered = match.phase !== 'review';
        match.phase = 'review';
        if (openPrompt(match)) {
            resumeClock(match, now);
            if (entered || match.phaseEndsAt == null) match.phaseEndsAt = now + CANNON_REVIEW_MS;
        } else {
            // Waiting for the teacher: the storm clock waits too.
            pauseClock(match, now);
            match.phaseEndsAt = null;
        }
        return 'review';
    }
    return startVolley(match, now);
}

export function createCannonMatch({
    teams,
    deck,
    answerMode = 'randomise',
    level = 'intermediate',
    questionMs = CANNON_QUESTION_MS,
    gameMinutes = CANNON_DEFAULT_MINUTES,
    gameMs = null,
    seed = null,
    rng = null,
    now = Date.now(),
    timing = VOLLEY_TIMING,
    introMs = CANNON_INTRO_MS,
}) {
    if (!Array.isArray(deck) || deck.length < 1) throw new Error('No words in this list.');
    const red = (teams?.red || []).map((p) => ({ id: String(p.id), nickname: String(p.nickname || 'Player') }));
    const blue = (teams?.blue || []).map((p) => ({ id: String(p.id), nickname: String(p.nickname || 'Player') }));
    if (!red.length || !blue.length) throw new Error('Both Red and Blue need at least one player.');
    const mode = ['recognise', 'realise', 'randomise'].includes(answerMode) ? answerMode : 'randomise';
    const matchSeed = seed == null ? Math.floor(Math.random() * 2 ** 31) : Number(seed) >>> 0;
    const match = {
        format: CANNON_FORMAT,
        seed: matchSeed,
        rng: rng || mulberry32(matchSeed),
        phase: 'intro',
        phaseEndsAt: now + Math.max(0, introMs),
        questionId: 0,
        roundIndex: 0,
        cursor: 0,
        deck,
        answerMode: mode,
        level: level || 'intermediate',
        questionMs: Number(questionMs) > 0 ? Math.round(Number(questionMs)) : CANNON_QUESTION_MS,
        gameMs: Number(gameMs) > 0 ? Math.round(Number(gameMs)) : normalizeGameMinutes(gameMinutes) * 60_000,
        gameEndsAt: null,
        clockPausedAt: null,
        questionStartedAt: null,
        timing,
        teams: {
            red: { id: 'red', name: CANNON_TEAM_NAMES.red, memberIds: red.map((p) => p.id), hp: CANNON_MAX_HP },
            blue: { id: 'blue', name: CANNON_TEAM_NAMES.blue, memberIds: blue.map((p) => p.id), hp: CANNON_MAX_HP },
        },
        playerOrder: [...red, ...blue].map((p) => p.id),
        playerTeam: {},
        nicknames: {},
        stats: {},
        answers: {},
        entry: null,
        inputMode: 'typed',
        choices: null,
        volley: null,
        volleySeq: 0,
        suddenDeath: false,
        suddenTries: 0,
        result: null,
    };
    for (const p of red) match.playerTeam[p.id] = 'red';
    for (const p of blue) match.playerTeam[p.id] = 'blue';
    for (const p of [...red, ...blue]) {
        match.nicknames[p.id] = p.nickname;
        match.stats[p.id] = blankStats();
        match.answers[p.id] = blankAnswer();
    }
    if (!(introMs > 0)) beginRound(match, now);
    return match;
}

export function renameCannonPlayer(match, playerId, nickname) {
    if (!match || nickname == null) return;
    const id = String(playerId);
    if (!match.nicknames[id]) return;
    match.nicknames[id] = String(nickname);
}

function resultPayload(match, playerId, answer) {
    const tier = answer.eligible && answer.ms != null ? speedTier(answer.ms, match.questionMs).tier : null;
    const team = match.playerTeam[playerId];
    return {
        correct: Boolean(answer.correct),
        reset: false,
        challengeable: answer.decision === 'prompt',
        progress: match.stats[playerId]?.correct || 0,
        won: false,
        correctTerm: match.entry?.term || '',
        answerText: answer.answerText || '',
        definition: match.entry?.definition || '',
        gameFormat: CANNON_FORMAT,
        cannon: true,
        eligible: Boolean(answer.eligible),
        questionId: match.questionId,
        round: match.roundIndex,
        ms: answer.ms,
        tier,
        team,
        teamName: CANNON_TEAM_NAMES[team],
        suddenDeath: Boolean(match.suddenDeath),
    };
}

export function submitCannonAnswer(match, playerId, rawText, now = Date.now()) {
    if (!match || match.phase !== 'question') throw new Error('Answering is closed.');
    const id = String(playerId);
    const answer = match.answers[id];
    if (!answer) throw new Error('Player not found.');
    if (answer.submitted) throw new Error('You already answered this round.');
    const text = sanitizeAnswerText(rawText);
    if (!text) {
        throw new Error(match.inputMode === 'choice' ? 'Choose an answer first.' : 'Type an answer first.');
    }
    if (match.inputMode === 'choice') {
        const ok = (match.choices || []).some((choice) => matchesTermAnswer(text, choice));
        if (!ok) throw new Error('Invalid choice.');
    }
    const correct = matchesTermAnswer(text, match.entry.term);
    answer.submitted = true;
    answer.answerText = text;
    answer.correct = correct;
    answer.ms = Math.max(0, Math.min(match.questionMs, now - (match.questionStartedAt ?? now)));
    const stats = match.stats[id];
    if (stats) stats.answered += 1;
    if (correct) {
        answer.eligible = true;
        answer.decision = 'correct';
        if (stats) {
            stats.correct += 1;
            stats.totalMs += answer.ms;
        }
    } else if (match.inputMode === 'typed') {
        answer.eligible = false;
        answer.decision = 'prompt';
    } else {
        answer.eligible = false;
        answer.decision = 'wrong';
    }
    const phase = syncPhase(match, now);
    return { phase, result: resultPayload(match, id, answer) };
}

export function markCannonChallengePending(match, playerId, now = Date.now()) {
    const answer = match?.answers?.[String(playerId)];
    if (!answer || answer.decision !== 'prompt') throw new Error('There is no answer to challenge.');
    answer.decision = 'pending';
    return syncPhase(match, now);
}

export function settleCannonChallenge(match, playerId, accept, now = Date.now()) {
    const id = String(playerId);
    const answer = match?.answers?.[id];
    if (!answer || answer.decision !== 'pending') throw new Error('Challenge state mismatch.');
    if (accept) {
        answer.decision = 'accepted';
        answer.eligible = true;
        answer.correct = true;
        const stats = match.stats[id];
        if (stats) {
            stats.correct += 1;
            stats.totalMs += answer.ms || 0;
        }
    } else {
        answer.decision = 'declined';
        answer.eligible = false;
        answer.correct = false;
    }
    const result = { ...resultPayload(match, id, answer), challengeAccepted: Boolean(accept), challengeDeclined: !accept };
    const phase = syncPhase(match, now);
    return { phase, result };
}

export function skipCannonPrompt(match, playerId, now = Date.now()) {
    const answer = match?.answers?.[String(playerId)];
    if (!answer || answer.decision !== 'prompt') throw new Error('No pending answer.');
    answer.decision = 'skipped';
    answer.eligible = false;
    const result = { ...resultPayload(match, String(playerId), answer), challengeDeclined: true };
    const phase = syncPhase(match, now);
    return { phase, result };
}

export function closeCannonAnswering(match, now = Date.now()) {
    if (!match || match.phase !== 'question') return match?.phase || null;
    for (const id of match.playerOrder) {
        const answer = match.answers[id];
        if (answer.submitted) continue;
        answer.submitted = true;
        answer.correct = false;
        answer.eligible = false;
        answer.decision = 'wrong';
    }
    return syncPhase(match, now);
}

export function expireCannonReview(match, now = Date.now()) {
    if (!match || match.phase !== 'review') return { phase: match?.phase || null, skipped: [] };
    const skipped = [];
    for (const id of match.playerOrder) {
        const answer = match.answers[id];
        if (answer.decision !== 'prompt') continue;
        answer.decision = 'skipped';
        answer.eligible = false;
        skipped.push(id);
    }
    if (openPending(match)) {
        pauseClock(match, now);
        match.phaseEndsAt = null;
        return { phase: 'review', skipped };
    }
    return { phase: startVolley(match, now), skipped };
}

export function forceCannonReview(match, now = Date.now()) {
    if (!match) throw new Error('No cannon match.');
    const declined = [];
    const skipped = [];
    for (const id of match.playerOrder) {
        const answer = match.answers[id];
        if (answer.decision === 'prompt') {
            answer.decision = 'skipped';
            answer.eligible = false;
            skipped.push(id);
        } else if (answer.decision === 'pending') {
            answer.decision = 'declined';
            answer.eligible = false;
            answer.correct = false;
            declined.push(id);
        }
    }
    startVolley(match, now);
    return { phase: match.phase, declined, skipped };
}

/** Move on after the intro or a volley. */
export function advanceCannon(match, now = Date.now()) {
    if (!match) return null;
    if (match.phase === 'intro') {
        beginRound(match, now);
        return 'question';
    }
    if (match.phase !== 'volley') return match.phase;
    const next = match.volley?.next || 'question';
    if (next === 'finished') {
        match.phase = 'finished';
        match.phaseEndsAt = null;
        return 'finished';
    }
    if (next === 'sudden') match.suddenDeath = true;
    beginRound(match, now);
    return 'question';
}

/** Host ends the game: healthier fort wins, equal health is a draw. */
export function finishCannonEarly(match) {
    if (!match) return;
    if (!match.result) {
        const hp = { red: match.teams.red.hp, blue: match.teams.blue.hp };
        const winner = leaderByHp(hp);
        match.result = { winner, reason: winner ? 'ended' : 'draw', hp };
    }
    match.phase = 'finished';
    match.phaseEndsAt = null;
}

export function hostSkipCannon(match, now = Date.now()) {
    if (!match) throw new Error('No cannon match.');
    if (match.phase === 'intro') return { phase: advanceCannon(match, now), declined: [], skipped: [] };
    if (match.phase === 'question') return { phase: closeCannonAnswering(match, now), declined: [], skipped: [] };
    if (match.phase === 'review') return forceCannonReview(match, now);
    if (match.phase === 'volley') return { phase: advanceCannon(match, now), declined: [], skipped: [] };
    return { phase: match.phase, declined: [], skipped: [] };
}

/** Per-player rows with stats, best first (hits, damage, correct, faster average). */
export function cannonPlayerRows(match) {
    if (!match) return [];
    const rows = match.playerOrder.map((id) => {
        const s = match.stats[id] || blankStats();
        return {
            id,
            nickname: match.nicknames[id],
            team: match.playerTeam[id],
            correct: s.correct,
            answered: s.answered,
            shots: s.shots,
            hits: s.hits,
            damage: s.damage,
            avgMs: s.correct ? Math.round(s.totalMs / s.correct) : null,
        };
    });
    rows.sort((a, b) => b.hits - a.hits
        || b.damage - a.damage
        || b.correct - a.correct
        || (a.avgMs ?? Infinity) - (b.avgMs ?? Infinity)
        || String(a.nickname).localeCompare(String(b.nickname)));
    rows.forEach((row, i) => { row.rank = i + 1; });
    return rows;
}

/** MVP: best player by hits, then damage, correct answers and speed. Needs at least one correct answer. */
export function cannonMvp(match) {
    const best = cannonPlayerRows(match)[0];
    if (!best || (!best.hits && !best.correct)) return null;
    return best;
}

export function cannonWinners(match) {
    const result = match?.result || { winner: leaderByHp({ red: match.teams.red.hp, blue: match.teams.blue.hp }), reason: null };
    const winner = result.winner || null;
    const rows = cannonPlayerRows(match);
    return {
        winner,
        reason: result.reason || null,
        winnerId: winner,
        winnerNickname: winner ? `${CANNON_TEAM_NAMES[winner]}` : "It's a draw",
        hp: { red: match.teams.red.hp, blue: match.teams.blue.hp },
        mvp: cannonMvp(match),
        players: rows,
    };
}

function statusFor(match, id) {
    const answer = match.answers[id];
    if (match.phase === 'intro') return 'ready';
    const decision = answer?.decision;
    if (!answer?.submitted) return 'answering';
    if (decision === 'prompt') return 'deciding';
    if (decision === 'pending') return 'challenging';
    if (answer.eligible) return 'loaded';
    return 'out';
}

export function cannonQuestionPayload(match) {
    if (!match || match.phase !== 'question') return null;
    return {
        progress: 0,
        termsToWin: 0,
        termIndex: match.roundIndex - 1,
        questionId: match.questionId,
        definition: match.entry.definition,
        inputMode: match.inputMode,
        answerMode: match.answerMode,
        gameFormat: CANNON_FORMAT,
        caseSensitive: false,
        round: match.roundIndex,
        endsAt: match.phaseEndsAt,
        timeLimitSec: Math.round(match.questionMs / 1000),
        suddenDeath: Boolean(match.suddenDeath),
        ...(match.inputMode === 'choice' ? { choices: match.choices } : {}),
    };
}

export function cannonPublicView(match, { playerId = null, forHost = false, connected = null, now = Date.now() } = {}) {
    if (!match) return null;
    const showVolley = (match.phase === 'volley' || match.phase === 'finished') && match.volley;
    const teams = {};
    for (const teamId of CANNON_TEAM_IDS) {
        const team = match.teams[teamId];
        const loadedNow = team.memberIds.filter((id) => match.answers[id]?.eligible).length;
        teams[teamId] = {
            id: teamId,
            name: team.name,
            // During a volley the client animates from hpBefore to hpAfter.
            hp: team.hp,
            hpBefore: showVolley && match.phase === 'volley' ? match.volley.hpBefore[teamId] : team.hp,
            maxHp: CANNON_MAX_HP,
            slots: teamSlots(team.memberIds.length),
            loaded: match.phase === 'volley' ? match.volley.loaded[teamId] : ballsLoaded(loadedNow, team.memberIds.length),
            members: team.memberIds.map((id) => ({
                id,
                nickname: match.nicknames[id],
                connected: connected ? connected[id] !== false : true,
                status: statusFor(match, id),
                correct: match.stats[id]?.correct || 0,
                hits: match.stats[id]?.hits || 0,
            })),
        };
    }
    const answeredCount = match.playerOrder.filter((id) => match.answers[id]?.submitted).length;
    const correctCount = match.playerOrder.filter((id) => match.answers[id]?.eligible).length;
    const view = {
        gameFormat: CANNON_FORMAT,
        phase: match.phase,
        serverNow: now,
        round: match.roundIndex,
        phaseEndsAt: match.phaseEndsAt,
        questionMs: match.questionMs,
        questionId: match.questionId,
        inputMode: match.inputMode,
        choices: match.inputMode === 'choice' && Array.isArray(match.choices) ? [...match.choices] : null,
        definition: match.entry?.definition || '',
        answeredCount,
        playerCount: match.playerOrder.length,
        correctCount: (forHost || match.phase !== 'question') ? correctCount : null,
        teams,
        clock: {
            gameMs: match.gameMs,
            gameEndsAt: match.gameEndsAt,
            pausedAt: match.clockPausedAt,
            timeLeftMs: cannonTimeLeft(match, now),
            stormMs: Math.min(CANNON_STORM_MS, match.gameMs),
        },
        storm: isStormActive(match, now),
        suddenDeath: Boolean(match.suddenDeath),
        volley: showVolley ? {
            seq: match.volley.seq,
            round: match.volley.round,
            storm: match.volley.storm,
            suddenDeath: Boolean(match.volley.suddenDeath),
            first: match.volley.first,
            loaded: match.volley.loaded,
            hpBefore: match.volley.hpBefore,
            hpAfter: match.volley.hpAfter,
            shots: match.volley.shots,
            durationMs: match.volley.durationMs,
            next: match.volley.next,
            winner: match.volley.winner,
            reason: match.volley.reason,
            timeUp: match.volley.timeUp,
            answerTerm: match.volley.answerTerm,
            definition: match.volley.definition,
        } : null,
        result: match.phase === 'finished' ? cannonWinners(match) : null,
        you: null,
    };
    if (forHost && (match.phase === 'question' || match.phase === 'review')) {
        view.correctTerm = match.entry?.term || '';
    }
    if (playerId != null && match.answers[String(playerId)]) {
        const id = String(playerId);
        const answer = match.answers[id];
        const team = match.playerTeam[id];
        view.you = {
            id,
            team,
            teamName: CANNON_TEAM_NAMES[team],
            decision: answer.decision || null,
            status: statusFor(match, id),
            eligible: Boolean(answer.eligible),
            ms: answer.ms,
            tier: answer.eligible && answer.ms != null ? speedTier(answer.ms, match.questionMs).tier : null,
            stats: { ...(match.stats[id] || blankStats()) },
            shots: showVolley ? match.volley.shots.filter((s) => s.shooterId === id) : [],
        };
    }
    return view;
}

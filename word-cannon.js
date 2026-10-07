/**
 * Word Cannon Battle — match flow and scoring for Live Spark.
 *
 * Two fixed teams (Red and Blue) defend forts that start at 100% health.
 * Every round has a shared question. Each correct answer fires one shot in the
 * following volley (teams alternate, fastest team first).
 *
 * Shot force and damage fall with answer time in 0.1 s steps. The decay curve
 * depends on the question type so multiple-choice (faster) and type-in (slower)
 * stay fair: MC loses power sooner; typed keeps power longer.
 *
 * Fairness: full-power damage per shot = CANNON_ROUND_BUDGET / team size, so a
 * whole team answering well deals about the same budget whatever its size.
 *
 * Storm (final CANNON_STORM_MS): rain, wild outcomes — many shots BLOWN BACK
 * onto your own fort, LUCKY HIT, or stray misses that can also hit own fort.
 * Remaining hits get a random damage multiplier. Players should focus on
 * getting answers right early, before the weather takes over.
 *
 * Volleys fire as a salvo (all shots in one tight burst) to keep the pace up.
 *
 * Scoring (kids-friendly):
 * - +1 point per correct answer (and that fires a shot)
 * - +1 point per HP of damage dealt to the opposing fort (faster = more damage)
 * - +1 WIN (+CANNON_FORT_KILL_BONUS points) each time a team destroys the other fort
 * Destroying a fort is celebrated (slow-mo, flag falls) then that fort rebuilds
 * to 100% and play continues until the game timer ends. Most points win.
 * Points tie when time is up -> sudden death LAST SHOT. After
 * CANNON_SUDDEN_TRIES empty sudden rounds it is a draw.
 *
 * All randomness comes from the match rng (seedable with mulberry32).
 */

import { buildChoices, matchesTermAnswer, sanitizeAnswerText } from './vocab-quiz-utils.js';

export const CANNON_FORMAT = 'word-cannon';
export const CANNON_MAX_HP = 100;
/** Kept for older callers; every correct answer now fires (no ammo cap). */
export const CANNON_MAX_BALLS = 5;
export const CANNON_ROUND_BUDGET = 20;
/** Points: correct answer, each HP of damage dealt, fort kill bonus. */
export const CANNON_POINTS_CORRECT = 1;
export const CANNON_POINTS_PER_DAMAGE = 1;
export const CANNON_FORT_KILL_BONUS = 20;
export const CANNON_QUESTION_MS = 20_000;
export const CANNON_REVIEW_MS = 12_000;
/** Host quick tutorial (skippable) before round 1. */
export const CANNON_INTRO_MS = 9_000;
export const CANNON_GAME_MINUTES = [3, 5, 8, 10];
export const CANNON_DEFAULT_MINUTES = 5;
export const CANNON_STORM_MS = 60_000;
export const CANNON_SUDDEN_TRIES = 3;
export const CANNON_TEAM_IDS = ['red', 'blue'];
export const CANNON_TEAM_NAMES = { red: 'Red Team', blue: 'Blue Team' };

/** Volley pacing (ms). Shots fire as a salvo; the client plays the same beats. */
export const VOLLEY_TIMING = {
    introMs: 700,
    /** Tiny stagger so balls leave nearly together without stacking perfectly. */
    salvoStaggerMs: 140,
    shotMs: 1_100,
    finalShotMs: 3_600,
    outroMs: 1_000,
    emptyMs: 2_200,
    endHoldMs: 5_600,
    /** Extra hold after a mid-game fort kill so the flag-fall can play before rebuild. */
    fortDownMs: 2_800,
};

/** Force drops once every FORCE_STEP_MS after a short full-power window. */
export const FORCE_STEP_MS = 100;
/**
 * Per input mode: keep full force for `fullMs`, then decay to `floor` over `decayMs`.
 * Multiple choice is answered faster → steeper curve. Type-in is slower → gentler.
 */
export const FORCE_WINDOWS = {
    choice: { fullMs: 700, decayMs: 6_500, floor: 0.12 },
    typed: { fullMs: 2_200, decayMs: 13_000, floor: 0.12 },
};

/** Storm: more chaos so late game rewards early correctness over aim gaming. */
export const STORM_RULES = {
    blownBelow: 0.32,
    luckyBelow: 0.52,
    luckyFactor: 1.8,
    /** Remaining shots: damage multiplied by this random band around force. */
    wildMin: 0.25,
    wildMax: 1.55,
    /** Blowback / stray damage to own fort (fraction of full power). */
    blownOwnMin: 0.35,
    blownOwnMax: 0.85,
    /** Chance a storm miss curves back into own fort. */
    stormStrayOwn: 0.45,
    /** Chance a calm miss still clips own fort. */
    calmStrayOwn: 0.12,
};

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

/** Normalize choice / typed / recognise aliases. */
export function normalizeInputMode(inputMode) {
    if (inputMode === 'choice' || inputMode === 'recognise') return 'choice';
    return 'typed';
}

/**
 * Shot force in 0..1. Full power for a short window, then −1 step every 0.1 s
 * until the floor. Window length depends on multiple-choice vs type-in.
 */
export function shotForce(ms, inputMode = 'typed') {
    const cfg = FORCE_WINDOWS[normalizeInputMode(inputMode)] || FORCE_WINDOWS.typed;
    const elapsed = Math.max(0, Number(ms) || 0);
    if (elapsed <= cfg.fullMs) return 1;
    const steps = Math.floor((elapsed - cfg.fullMs) / FORCE_STEP_MS);
    const totalSteps = Math.max(1, Math.ceil(cfg.decayMs / FORCE_STEP_MS));
    const force = 1 - (steps / totalSteps) * (1 - cfg.floor);
    return Math.max(cfg.floor, Math.min(1, force));
}

/**
 * Label band for UI (FAST / GOOD / SLOW) derived from continuous force.
 * `questionMs` kept for call-site compatibility; decay uses inputMode instead.
 */
export function speedTier(ms, questionMs = CANNON_QUESTION_MS, inputMode = 'typed') {
    void questionMs;
    const force = shotForce(ms, inputMode);
    const factor = force;
    if (force >= 0.72) return { tier: 'fast', force, factor, hitChance: 1 };
    if (force >= 0.38) return { tier: 'good', force, factor, hitChance: 0.7 + 0.25 * force };
    return { tier: 'slow', force, factor, hitChance: 0.28 + 0.45 * force };
}

/** Team size used for damage dilution (and leftover HUD slots). */
export function teamSlots(teamSize) {
    return Math.max(1, Math.floor(Number(teamSize) || 0));
}

/** Damage of one hit at full power for a team of this size. */
export function baseDamage(teamSize) {
    return CANNON_ROUND_BUDGET / teamSlots(teamSize);
}

/** One shot per correct answer — no ammo cap. */
export function ballsLoaded(correctCount, _teamSize) {
    return Math.max(0, Math.floor(correctCount || 0));
}

function ownFortDamage(full, rng) {
    const factor = STORM_RULES.blownOwnMin
        + rng() * (STORM_RULES.blownOwnMax - STORM_RULES.blownOwnMin);
    return Math.max(1, Math.round(full * factor));
}

/**
 * Resolve one shot. Pure apart from the rng.
 * Returns { outcome, tier, force, damage, friendly? }.
 * `friendly` / outcome `blown` / `own` means the ball hits the shooter's fort.
 */
export function resolveShot({
    ms,
    questionMs = CANNON_QUESTION_MS,
    teamSize,
    storm = false,
    inputMode = 'typed',
    rng = Math.random,
}) {
    const tierInfo = speedTier(ms, questionMs, inputMode);
    const force = tierInfo.force;
    const full = baseDamage(teamSize) * force;
    if (storm) {
        const roll = rng();
        if (roll < STORM_RULES.blownBelow) {
            return {
                outcome: 'blown',
                tier: tierInfo.tier,
                force,
                damage: ownFortDamage(full, rng),
                friendly: true,
            };
        }
        if (roll < STORM_RULES.luckyBelow) {
            return {
                outcome: 'lucky',
                tier: tierInfo.tier,
                force,
                damage: Math.max(1, Math.round(full * STORM_RULES.luckyFactor)),
            };
        }
        // Wild remaining shot: often weak or strong, hit chance no longer trustworthy.
        const wild = STORM_RULES.wildMin + rng() * (STORM_RULES.wildMax - STORM_RULES.wildMin);
        const hitChance = 0.35 + 0.4 * force;
        if (rng() >= hitChance) {
            if (rng() < STORM_RULES.stormStrayOwn) {
                return {
                    outcome: 'own',
                    tier: tierInfo.tier,
                    force,
                    damage: ownFortDamage(full, rng),
                    friendly: true,
                };
            }
            return { outcome: 'miss', tier: tierInfo.tier, force, damage: 0 };
        }
        return {
            outcome: 'hit',
            tier: tierInfo.tier,
            force,
            damage: Math.max(1, Math.round(full * wild)),
        };
    }
    const hit = tierInfo.hitChance >= 1 || rng() < tierInfo.hitChance;
    if (hit) {
        return { outcome: 'hit', tier: tierInfo.tier, force, damage: Math.max(1, Math.round(full)) };
    }
    if (rng() < STORM_RULES.calmStrayOwn) {
        return {
            outcome: 'own',
            tier: tierInfo.tier,
            force,
            damage: ownFortDamage(full, rng),
            friendly: true,
        };
    }
    return { outcome: 'miss', tier: tierInfo.tier, force, damage: 0 };
}

/** Shot label like "FAST 1.2s: HIT!" (the client shows the same text). */
export function shotLabel(shot) {
    if (shot.lastShot) return 'LAST SHOT!';
    const secs = `${(Math.max(0, shot.ms || 0) / 1000).toFixed(1)}s`;
    const tier = String(shot.tier || 'slow').toUpperCase();
    if (shot.outcome === 'blown') return 'BLOWN BACK!';
    if (shot.outcome === 'own') return 'OWN FORT!';
    if (shot.outcome === 'lucky') return 'LUCKY HIT!';
    return `${tier} ${secs}: ${shot.outcome === 'hit' ? 'HIT!' : 'MISS'}`;
}

/**
 * Build a volley from the correct answers of a round.
 * shooters: { red: [{id, nickname, ms}], blue: [...] } (any order)
 * hp: { red, blue }   sizes: { red, blue }
 * Teams alternate, starting with the team that had the fastest correct answer.
 * Damage is applied in order and the volley stops when a fort sinks.
 * Stray / blown shots can target the shooter's own fort.
 */
export function buildVolley({
    shooters,
    hp,
    sizes,
    questionMs = CANNON_QUESTION_MS,
    storm = false,
    inputMode = 'typed',
    rng = Math.random,
    timing = VOLLEY_TIMING,
}) {
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
    const mode = normalizeInputMode(inputMode);
    const shots = [];
    let sunk = null;
    for (const { team, shooter } of order) {
        if (sunk) break;
        const r = resolveShot({
            ms: shooter.ms,
            questionMs,
            teamSize: sizes?.[team] || 1,
            storm,
            inputMode: mode,
            rng,
        });
        const friendly = Boolean(r.friendly || r.outcome === 'blown' || r.outcome === 'own');
        const target = friendly ? team : otherTeam(team);
        const before = hpNow[target];
        const after = Math.max(0, before - r.damage);
        hpNow[target] = after;
        const shot = {
            index: shots.length,
            team,
            target,
            friendly,
            shooterId: shooter.id,
            nickname: shooter.nickname || '',
            ms: Math.round(shooter.ms),
            tier: r.tier,
            force: r.force,
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
    return timeVolley({ shots, loaded, hpBefore, hpAfter: hpNow, storm, first, sunk, inputMode: mode }, timing);
}

/** Add `at`/`dur` beats. All shots fire in one salvo (tiny stagger only). */
export function timeVolley(volley, timing = VOLLEY_TIMING) {
    const stagger = Math.max(0, timing.salvoStaggerMs ?? 140);
    let t = timing.introMs;
    for (const shot of volley.shots) {
        shot.at = t;
        shot.dur = shot.final ? timing.finalShotMs : timing.shotMs;
        t += stagger;
    }
    const last = volley.shots[volley.shots.length - 1];
    const end = last ? last.at + last.dur : timing.introMs;
    volley.durationMs = volley.shots.length ? end + timing.outroMs : timing.emptyMs;
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
            force: 1,
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

/** Winner by points: 'red' | 'blue' | null (tie). */
export function leaderByPoints(scores) {
    const red = Number(scores?.red) || 0;
    const blue = Number(scores?.blue) || 0;
    if (red > blue) return 'red';
    if (blue > red) return 'blue';
    return null;
}

export function teamPointsSnapshot(match) {
    return {
        red: match?.teams?.red?.points || 0,
        blue: match?.teams?.blue?.points || 0,
    };
}

function addTeamPoints(match, teamId, amount) {
    const team = match?.teams?.[teamId];
    if (!team || !(amount > 0)) return;
    team.points = (team.points || 0) + amount;
}

function awardCorrectPoints(match, playerId) {
    const teamId = match.playerTeam[String(playerId)];
    if (!teamId) return;
    addTeamPoints(match, teamId, CANNON_POINTS_CORRECT);
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
        volley = buildVolley({
            shooters,
            hp,
            sizes,
            questionMs: match.questionMs,
            storm,
            inputMode: match.inputMode,
            rng: match.rng,
            timing: match.timing,
        });
    }
    volley.round = match.roundIndex;
    volley.seq = ++match.volleySeq;
    volley.answerTerm = match.entry?.term || '';
    volley.definition = match.entry?.definition || '';
    volley.timeUp = timeUp;
    // Apply HP from the volley (may rebuild a sunk fort below).
    for (const team of CANNON_TEAM_IDS) match.teams[team].hp = volley.hpAfter[team];
    for (const shot of volley.shots) {
        const s = match.stats[shot.shooterId];
        const enemyHit = shot.damage > 0 && shot.target !== shot.team;
        if (s) {
            s.shots += 1;
            if (shot.outcome === 'hit' || shot.outcome === 'lucky') s.hits += 1;
            if (enemyHit) s.damage += shot.damage;
        }
        // Points only for damage to the opposing fort — own-fort strays score nothing.
        if (enemyHit) {
            const pts = shot.damage * CANNON_POINTS_PER_DAMAGE;
            addTeamPoints(match, shot.team, pts);
            match.teams[shot.team].damageDealt = (match.teams[shot.team].damageDealt || 0) + shot.damage;
        }
    }
    // Decide what comes next.
    let next = 'question';
    let winner = null;
    let reason = null;
    volley.rebuild = false;
    volley.fortDown = null;
    if (volley.sunk && match.suddenDeath) {
        // Only sudden death ends on a sunk fort.
        winner = otherTeam(volley.sunk);
        reason = 'sudden';
        next = 'finished';
    } else if (volley.sunk) {
        // 1 WIN for the team that destroyed the opposite fort (own-fort sink credits the other side).
        const killer = otherTeam(volley.sunk);
        addTeamPoints(match, killer, CANNON_FORT_KILL_BONUS);
        match.teams[killer].fortKills = (match.teams[killer].fortKills || 0) + 1;
        // Rebuild the fallen fort so the battle continues until the timer ends.
        match.teams[volley.sunk].hp = CANNON_MAX_HP;
        volley.rebuild = true;
        volley.fortDown = volley.sunk;
        volley.durationMs += match.timing.fortDownMs || 0;
        if (timeUp) {
            winner = leaderByPoints(teamPointsSnapshot(match));
            if (winner) {
                next = 'finished';
                reason = 'time';
            } else {
                next = 'sudden';
                reason = 'tie';
            }
        } else {
            next = 'question';
            reason = 'fort-down';
        }
    } else if (match.suddenDeath) {
        if (match.suddenTries >= CANNON_SUDDEN_TRIES) {
            next = 'finished';
            reason = 'draw';
        } else {
            next = 'sudden';
        }
    } else if (timeUp) {
        winner = leaderByPoints(teamPointsSnapshot(match));
        if (winner) {
            next = 'finished';
            reason = 'time';
            const lastHit = [...volley.shots].reverse().find((s) => s.damage > 0);
            if (lastHit && !lastHit.final) {
                lastHit.final = true;
                timeVolley(volley, match.timing);
                if (volley.rebuild) volley.durationMs += match.timing.fortDownMs || 0;
            }
        } else {
            next = 'sudden';
            reason = 'tie';
        }
    }
    volley.next = next;
    volley.winner = winner;
    volley.reason = reason;
    volley.points = teamPointsSnapshot(match);
    if (next === 'finished') volley.durationMs += match.timing.endHoldMs;
    if (next === 'sudden') volley.durationMs += 1_400;
    match.volley = volley;
    match.phase = 'volley';
    match.phaseEndsAt = now + volley.durationMs;
    if (next === 'finished') {
        match.result = {
            winner,
            reason,
            hp: { red: match.teams.red.hp, blue: match.teams.blue.hp },
            points: teamPointsSnapshot(match),
        };
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
            red: { id: 'red', name: CANNON_TEAM_NAMES.red, memberIds: red.map((p) => p.id), hp: CANNON_MAX_HP, points: 0, fortKills: 0, damageDealt: 0 },
            blue: { id: 'blue', name: CANNON_TEAM_NAMES.blue, memberIds: blue.map((p) => p.id), hp: CANNON_MAX_HP, points: 0, fortKills: 0, damageDealt: 0 },
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
    const tierInfo = answer.eligible && answer.ms != null
        ? speedTier(answer.ms, match.questionMs, match.inputMode)
        : null;
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
        tier: tierInfo?.tier || null,
        force: tierInfo?.force ?? null,
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
        awardCorrectPoints(match, id);
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
        awardCorrectPoints(match, id);
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

/** Host ends the game: most points wins, equal points is a draw. */
export function finishCannonEarly(match) {
    if (!match) return;
    if (!match.result) {
        const points = teamPointsSnapshot(match);
        const winner = leaderByPoints(points);
        match.result = {
            winner,
            reason: winner ? 'ended' : 'draw',
            hp: { red: match.teams.red.hp, blue: match.teams.blue.hp },
            points,
        };
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
    const points = teamPointsSnapshot(match);
    const result = match?.result || { winner: leaderByPoints(points), reason: null, points };
    const winner = result.winner || null;
    const rows = cannonPlayerRows(match);
    return {
        winner,
        reason: result.reason || null,
        winnerId: winner,
        winnerNickname: winner ? `${CANNON_TEAM_NAMES[winner]}` : "It's a draw",
        hp: { red: match.teams.red.hp, blue: match.teams.blue.hp },
        points: result.points || points,
        teams: {
            red: {
                hp: match.teams.red.hp,
                points: match.teams.red.points || 0,
                fortKills: match.teams.red.fortKills || 0,
                damageDealt: match.teams.red.damageDealt || 0,
            },
            blue: {
                hp: match.teams.blue.hp,
                points: match.teams.blue.points || 0,
                fortKills: match.teams.blue.fortKills || 0,
                damageDealt: match.teams.blue.damageDealt || 0,
            },
        },
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
            points: team.points || 0,
            fortKills: team.fortKills || 0,
            damageDealt: team.damageDealt || 0,
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
            rebuild: Boolean(match.volley.rebuild),
            fortDown: match.volley.fortDown || null,
            points: match.volley.points || teamPointsSnapshot(match),
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
            tier: answer.eligible && answer.ms != null
                ? speedTier(answer.ms, match.questionMs, match.inputMode).tier
                : null,
            force: answer.eligible && answer.ms != null
                ? shotForce(answer.ms, match.inputMode)
                : null,
            stats: { ...(match.stats[id] || blankStats()) },
            shots: showVolley ? match.volley.shots.filter((s) => s.shooterId === id) : [],
        };
    }
    return view;
}

/**
 * Word Cannon Battle — continuous-flow match logic for Live Spark.
 *
 * Two teams (Red and Blue) defend forts that start at 100% health. There are no rounds:
 * every player answers their own question stream at their own pace and every correct
 * answer fires that player's team cannon IMMEDIATELY.
 *
 * Shot force falls with the player's answer time in 0.1 s steps (curve per question
 * type: multiple choice decays sooner, type-in keeps power longer). Speed tiers, hit
 * chances, storm rules and own-fort chances are unchanged from the round-based game.
 *
 * Balance: full-power damage = CANNON_SHOT_BUDGET / teamSize^CANNON_SIZE_EXP so a fort
 * falls in about the same real time as with the old salvos.
 *
 * Feedback: correct → ~1 s then the next question; wrong pick / timeout → the correct
 * answer for 1.5 s; wrong typed → Challenge / Continue (4 s). A challenge goes to the
 * host review queue and the player carries on; Accept fires a retroactive shot at the
 * force earned at answer time.
 *
 * Scoring: +1 per correct answer, +1 per HP dealt to the enemy fort, +1 WIN
 * (+CANNON_FORT_KILL_BONUS) per fort destroyed; the fort rebuilds (short shield) and
 * the battle goes on. Time up: most WINS, then points; a tie goes to continuous sudden
 * death (first correct answer fires the LAST SHOT), then a draw.
 *
 * All randomness comes from the match rng (seedable with mulberry32).
 */

import { buildChoices, matchesTermAnswer, sanitizeAnswerText } from './vocab-quiz-utils.js';

export const CANNON_FORMAT = 'word-cannon';
export const CANNON_MAX_HP = 100;
/** Kept for older callers; every correct answer now fires (no ammo cap). */
export const CANNON_MAX_BALLS = 5;
/**
 * Damage per full-power shot = CANNON_SHOT_BUDGET / teamSize^CANNON_SIZE_EXP.
 * Tuned (see README / commit notes) so a fort falls in about the same real time as the
 * old round-based salvos (budget 20 / teamSize per round): continuous fire is ~1.4–3× more
 * shots per minute, more so for big teams that used to wait for the slowest player.
 */
export const CANNON_SHOT_BUDGET = 16;
export const CANNON_SIZE_EXP = 1.24;
/** Old per-round budget (kept for reference / older callers). */
export const CANNON_ROUND_BUDGET = 20;
/** Points: correct answer, each HP of damage dealt, fort kill bonus. */
export const CANNON_POINTS_CORRECT = 1;
export const CANNON_POINTS_PER_DAMAGE = 1;
export const CANNON_FORT_KILL_BONUS = 20;
export const CANNON_QUESTION_MS = 20_000;
/** Time a player gets to decide whether to challenge a wrong typed answer. */
export const CANNON_REVIEW_MS = 4_000;
/** Host quick tutorial (skippable) before round 1. */
export const CANNON_INTRO_MS = 7_000;
export const CANNON_GAME_MINUTES = [3, 5, 8, 10];
export const CANNON_DEFAULT_MINUTES = 5;
export const CANNON_STORM_MS = 60_000;
export const CANNON_SUDDEN_TRIES = 3;
export const CANNON_TEAM_IDS = ['red', 'blue'];
export const CANNON_TEAM_NAMES = { red: 'Red Team', blue: 'Blue Team' };

/**
 * Continuous-flow pacing (ms). Every player answers their own question stream; a correct
 * answer fires that player's team cannon immediately (no rounds, no waiting).
 */
export const CANNON_FLOW = {
    /** Correct answer: short "BOOM" feedback before the next question. */
    feedbackCorrectMs: 1_000,
    /** Wrong pick / timeout: show the correct answer this long, no shot. */
    feedbackWrongMs: 1_500,
    /** Wrong typed answer: Challenge / Continue choice auto-continues after this. */
    promptMs: 4_000,
    /** Ball flight on the host screen (shots land this long after firing). */
    flightMs: 950,
    /** Fort destroyed: flag falls, then the fort rebuilds; shots in this window hit a shield. */
    rebuildMs: 3_200,
    /** Storm: wind gust re-rolled this often. */
    gustEveryMs: 6_000,
    /** Sudden death: first correct answer anywhere fires the LAST SHOT; draw after this. */
    suddenMs: 40_000,
    /** Hold after the decisive moment so in-flight balls and banners can finish. */
    endHoldMs: 4_400,
    /** Anti-spam: at most `rateMax` answers per `rateWindowMs` per player. */
    rateMax: 4,
    rateWindowMs: 2_000,
    /** A player waits this many other questions before seeing a word again (capped by deck size). */
    repeatGap: 8,
    /** Last shots kept in the public state for the host animation / feed. */
    shotLog: 24,
};

/** Kept name for older callers: the same beats as CANNON_FLOW. */
export const VOLLEY_TIMING = CANNON_FLOW;

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

/**
 * Storm: more chaos so late game rewards early correctness over aim gaming.
 * Every storm volley rolls a wind gust in [gustMin, gustMax]; the gust scales
 * blow-back chance and lowers aim, so two storm rounds rarely feel the same.
 */
export const STORM_RULES = {
    gustMin: 0.6,
    gustMax: 1.4,
    /**
     * Blow-back chance = blownBase × gust × (blownSlope − force)², clamped. Squared so fast shots
     * almost never blow back (force 1 → 1–2 %) while slow ones often do (force 0.3 → 20–40 %).
     */
    blownBase: 0.35,
    blownSlope: 1.2,
    blownMinChance: 0.01,
    blownMaxChance: 0.45,
    luckyChance: 0.2,
    /** LUCKY HIT damage multiplier band. */
    luckyMin: 1.4,
    luckyMax: 2.2,
    /** Remaining hits: damage multiplied by this random band. */
    wildMin: 0.25,
    wildMax: 1.55,
    /** Blowback / stray damage to own fort (fraction of the shot's power). */
    blownOwnMin: 0.35,
    blownOwnMax: 0.85,
    /** Storm miss curves back into own fort: stormStrayOwn × (1.1 − force). */
    stormStrayOwn: 0.35,
    /** Calm miss clips own fort: calmStrayOwn × (1 − force) — only slow shots, rare. */
    calmStrayOwn: 0.12,
};

/** Random wind gust for one storm volley. */
export function rollStormGust(rng = Math.random) {
    return Math.round((STORM_RULES.gustMin + rng() * (STORM_RULES.gustMax - STORM_RULES.gustMin)) * 100) / 100;
}

function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}

/** Chance (0..1) that a storm shot with this force is blown back by this gust. */
export function stormBlownChance(force, gust = 1) {
    const f = clamp(Number(force) || 0, 0, 1);
    const g = clamp(Number(gust) || 1, STORM_RULES.gustMin, STORM_RULES.gustMax);
    const lost = Math.max(0, STORM_RULES.blownSlope - f);
    return clamp(STORM_RULES.blownBase * g * lost * lost, STORM_RULES.blownMinChance, STORM_RULES.blownMaxChance);
}

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
    return CANNON_SHOT_BUDGET / Math.pow(teamSlots(teamSize), CANNON_SIZE_EXP);
}

/** Damage is kept to 0.1 HP so big teams still chip the fort (HUD rounds it). */
function dmg(x) {
    return Math.max(0.1, Math.round(x * 10) / 10);
}

/** One shot per correct answer — no ammo cap. */
export function ballsLoaded(correctCount, _teamSize) {
    return Math.max(0, Math.floor(correctCount || 0));
}

function ownFortDamage(full, rng) {
    const factor = STORM_RULES.blownOwnMin
        + rng() * (STORM_RULES.blownOwnMax - STORM_RULES.blownOwnMin);
    return dmg(full * factor);
}

/**
 * Resolve one shot. Pure apart from the rng.
 * Returns { outcome, tier, force, damage, friendly? }.
 * `friendly` / outcome `blown` / `own` means the ball hits the shooter's fort.
 * `gust` (storm only) is the volley's wind strength, see rollStormGust().
 */
export function resolveShot({
    ms,
    questionMs = CANNON_QUESTION_MS,
    teamSize,
    storm = false,
    gust = 1,
    inputMode = 'typed',
    rng = Math.random,
}) {
    const tierInfo = speedTier(ms, questionMs, inputMode);
    const force = tierInfo.force;
    const full = baseDamage(teamSize) * force;
    if (storm) {
        const g = clamp(Number(gust) || 1, STORM_RULES.gustMin, STORM_RULES.gustMax);
        const blown = stormBlownChance(force, g);
        const roll = rng();
        if (roll < blown) {
            return { outcome: 'blown', tier: tierInfo.tier, force, damage: ownFortDamage(full, rng), friendly: true };
        }
        if (roll < blown + STORM_RULES.luckyChance) {
            const lucky = STORM_RULES.luckyMin + rng() * (STORM_RULES.luckyMax - STORM_RULES.luckyMin);
            return { outcome: 'lucky', tier: tierInfo.tier, force, damage: dmg(full * lucky) };
        }
        // Wild remaining shot: stronger gusts spoil the aim; damage is a random band.
        const hitChance = clamp(0.35 + 0.4 * force - 0.25 * (g - 1), 0.1, 0.95);
        if (rng() >= hitChance) {
            if (rng() < STORM_RULES.stormStrayOwn * Math.max(0, 1.1 - force)) {
                return { outcome: 'own', tier: tierInfo.tier, force, damage: ownFortDamage(full, rng), friendly: true };
            }
            return { outcome: 'miss', tier: tierInfo.tier, force, damage: 0 };
        }
        const wild = STORM_RULES.wildMin + rng() * (STORM_RULES.wildMax - STORM_RULES.wildMin);
        return { outcome: 'hit', tier: tierInfo.tier, force, damage: dmg(full * wild) };
    }
    const hit = tierInfo.hitChance >= 1 || rng() < tierInfo.hitChance;
    if (hit) {
        return { outcome: 'hit', tier: tierInfo.tier, force, damage: dmg(full) };
    }
    if (rng() < STORM_RULES.calmStrayOwn * (1 - force)) {
        return { outcome: 'own', tier: tierInfo.tier, force, damage: ownFortDamage(full, rng), friendly: true };
    }
    return { outcome: 'miss', tier: tierInfo.tier, force, damage: 0 };
}

/** Shot headline like "FAST 1.2s: HIT!" (the client shows the same text). */
export function shotLabel(shot) {
    if (shot.lastShot) return 'LAST SHOT!';
    const secs = `${(Math.max(0, shot.ms || 0) / 1000).toFixed(1)}s`;
    const tier = String(shot.tier || 'slow').toUpperCase();
    if (shot.outcome === 'blown') return 'BLOWN BACK!';
    if (shot.outcome === 'own') return 'OWN FORT!';
    if (shot.outcome === 'lucky') return 'LUCKY HIT!';
    if (shot.outcome === 'shield') return 'SHIELD! Fort rebuilding';
    return `${tier} ${secs}: ${shot.outcome === 'hit' ? 'HIT!' : 'MISS'}`;
}

function fmtDmg(d) {
    const n = Number(d) || 0;
    return n >= 10 || Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1);
}

/** Second label line: answer time, force and damage, e.g. "1.2s · 92% force · −9". */
export function shotDetail(shot) {
    const secs = `${(Math.max(0, shot.ms || 0) / 1000).toFixed(1)}s`;
    const force = `${Math.round(Math.max(0, Math.min(1, shot.force ?? 0)) * 100)}% force`;
    const dmg = shot.damage > 0
        ? (shot.target && shot.team && shot.target === shot.team ? `−${fmtDmg(shot.damage)} own fort` : `−${fmtDmg(shot.damage)}`)
        : 'no damage';
    return `${secs} · ${force} · ${dmg}`;
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

/**
 * Battle winner: most WINS (forts destroyed) first, then most points.
 * Returns 'red' | 'blue' | null (tie on both).
 */
export function leaderByWinsThenPoints(teams) {
    const kills = (t) => Number(teams?.[t]?.fortKills) || 0;
    if (kills('red') !== kills('blue')) return kills('red') > kills('blue') ? 'red' : 'blue';
    return leaderByPoints({ red: teams?.red?.points, blue: teams?.blue?.points });
}

function matchLeader(match) {
    return leaderByWinsThenPoints(match?.teams);
}

export function teamWinsSnapshot(match) {
    return {
        red: match?.teams?.red?.fortKills || 0,
        blue: match?.teams?.blue?.fortKills || 0,
    };
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
// Continuous match flow
//
// intro → battle (everyone answers their own questions; correct = immediate shot)
//       → [time up & tie] sudden death (still continuous; first correct = LAST SHOT)
//       → ending (short hold so the last balls / banners land) → finished
// The server calls tickCannon() ~10×/s to expire questions, feedback and phases.
// ---------------------------------------------------------------------------

function resolveInputMode(answerMode, rng) {
    if (answerMode === 'recognise') return 'choice';
    if (answerMode === 'realise') return 'typed';
    return rng() < 0.5 ? 'choice' : 'typed';
}

function blankStats() {
    return { correct: 0, answered: 0, shots: 0, hits: 0, damage: 0, totalMs: 0, streak: 0, bestStreak: 0 };
}

function blankPlayerState() {
    return {
        mode: 'idle', // idle | answering | feedback | prompt | done
        q: null,
        nextAt: null,
        last: null,
        wrong: null,
        recent: [],
        bag: [],
        submits: [],
        reviewId: null,
    };
}

/** Remaining game time (ms). The clock never pauses in the continuous game. */
export function cannonTimeLeft(match, now = Date.now()) {
    if (!match?.gameEndsAt) return match?.gameMs ?? 0;
    return Math.max(0, match.gameEndsAt - now);
}

export function isStormActive(match, now = Date.now()) {
    if (!match?.gameEndsAt || match.suddenDeath) return false;
    return cannonTimeLeft(match, now) <= Math.min(CANNON_STORM_MS, match.gameMs);
}

function currentGust(match, now) {
    const every = match.timing.gustEveryMs || 6_000;
    if (match.gust == null || match.gustUntil == null || now >= match.gustUntil) {
        match.gust = rollStormGust(match.rng);
        match.gustUntil = now + every;
    }
    return match.gust;
}

/** Next deck index for a player: shuffled bag, never one of their last `repeatGap` words. */
function pickEntryIndex(match, ps) {
    const n = match.deck.length;
    const gap = Math.min(match.timing.repeatGap ?? 8, Math.floor(n / 2));
    for (let guard = 0; guard < 4; guard += 1) {
        if (!ps.bag.length) {
            const bag = Array.from({ length: n }, (_, i) => i);
            for (let i = bag.length - 1; i > 0; i -= 1) {
                const j = Math.floor(match.rng() * (i + 1));
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }
            ps.bag = bag;
        }
        const recent = gap > 0 ? ps.recent.slice(-gap) : [];
        const at = ps.bag.findIndex((idx) => !recent.includes(idx));
        if (at >= 0) {
            const [idx] = ps.bag.splice(at, 1);
            ps.recent.push(idx);
            if (ps.recent.length > 32) ps.recent.shift();
            return idx;
        }
        ps.bag = [];
    }
    return Math.floor(match.rng() * n);
}

function dealQuestion(match, id, now) {
    const ps = match.players[id];
    const idx = pickEntryIndex(match, ps);
    const entry = match.deck[idx];
    const inputMode = resolveInputMode(match.answerMode, match.rng);
    match.questionSeq += 1;
    ps.q = {
        id: match.questionSeq,
        idx,
        term: entry.term,
        definition: entry.definition,
        inputMode,
        choices: inputMode === 'choice' ? buildChoices(entry.term, match.deck.map((d) => d.term), match.level) : null,
        startedAt: now,
        endsAt: now + match.questionMs,
        number: (match.stats[id]?.answered || 0) + 1,
    };
    ps.mode = 'answering';
    ps.nextAt = null;
    ps.wrong = null;
    return ps.q;
}

function startBattle(match, now) {
    match.phase = 'battle';
    match.phaseEndsAt = null;
    match.gameEndsAt = now + match.gameMs;
    const dealt = [];
    for (const id of match.playerOrder) {
        dealQuestion(match, id, now);
        dealt.push(id);
    }
    return dealt;
}

function enterEnding(match, now, { winner, reason }) {
    match.phase = 'ending';
    match.phaseEndsAt = now + (match.timing.endHoldMs ?? 4_400);
    match.result = {
        winner,
        reason,
        hp: { red: match.teams.red.hp, blue: match.teams.blue.hp },
        points: teamPointsSnapshot(match),
        wins: teamWinsSnapshot(match),
        endedAt: now,
    };
    for (const id of match.playerOrder) {
        const ps = match.players[id];
        ps.mode = 'done';
        ps.q = null;
        ps.nextAt = null;
    }
    // Open challenges can no longer change the result.
    const dropped = match.reviews.map((r) => r.id);
    match.reviews = [];
    for (const id of match.playerOrder) match.players[id].reviewId = null;
    return dropped;
}

function pushShot(match, shot) {
    match.shots.push(shot);
    const keep = match.timing.shotLog ?? 24;
    if (match.shots.length > keep) match.shots.splice(0, match.shots.length - keep);
}

/**
 * Fire one shot for `playerId` right now, from an answer that took `ms` (force curve by
 * `inputMode`). Applies damage, points, WIN + rebuild. Returns the shot record.
 */
function fireShot(match, playerId, ms, inputMode, now, { retro = false } = {}) {
    const id = String(playerId);
    const team = match.playerTeam[id];
    const s = match.stats[id];
    match.shotSeq += 1;
    const base = {
        seq: match.shotSeq,
        firedAt: now,
        landsAt: now + (match.timing.flightMs ?? 950),
        team,
        shooterId: id,
        nickname: match.nicknames[id] || '',
        ms: Math.round(ms),
        inputMode: normalizeInputMode(inputMode),
        retro: Boolean(retro),
        pointsBefore: teamPointsSnapshot(match),
        winsBefore: teamWinsSnapshot(match),
    };
    if (match.suddenDeath) {
        const target = otherTeam(team);
        const before = match.teams[target].hp;
        const shot = {
            ...base, target, friendly: false, tier: 'fast', force: 1, outcome: 'hit', storm: false, gust: null,
            damage: before, hpBefore: before, hpAfter: 0, final: true, lastShot: true, fortDown: target,
        };
        match.teams[target].hp = 0;
        match.teams[team].fortKills += 1;
        addTeamPoints(match, team, CANNON_FORT_KILL_BONUS);
        if (s) { s.shots += 1; s.hits += 1; s.damage += before; }
        shot.pointsAfter = teamPointsSnapshot(match);
        shot.winsAfter = teamWinsSnapshot(match);
        shot.label = shotLabel(shot);
        shot.detail = shotDetail(shot);
        pushShot(match, shot);
        enterEnding(match, now, { winner: team, reason: 'sudden' });
        return shot;
    }
    const storm = isStormActive(match, now);
    const gust = storm ? currentGust(match, now) : null;
    const r = resolveShot({
        ms,
        questionMs: match.questionMs,
        teamSize: match.teams[team].memberIds.length,
        storm,
        gust: gust ?? 1,
        inputMode,
        rng: match.rng,
    });
    const friendly = Boolean(r.friendly || r.outcome === 'blown' || r.outcome === 'own');
    const target = friendly ? team : otherTeam(team);
    const fort = match.teams[target];
    const shielded = fort.rebuildUntil != null && now < fort.rebuildUntil && r.damage > 0;
    const before = fort.hp;
    const damage = shielded ? 0 : Math.min(before, r.damage);
    const after = Math.max(0, Math.round((before - damage) * 10) / 10);
    const shot = {
        ...base,
        target,
        friendly,
        tier: r.tier,
        force: r.force,
        outcome: shielded ? 'shield' : r.outcome,
        storm,
        gust,
        damage: Math.round(damage * 10) / 10,
        hpBefore: before,
        hpAfter: after,
        final: false,
        lastShot: false,
        fortDown: null,
        rebuildAt: null,
    };
    fort.hp = after;
    if (s) {
        s.shots += 1;
        if (!shielded && (r.outcome === 'hit' || r.outcome === 'lucky')) s.hits += 1;
    }
    const enemyHit = shot.damage > 0 && !friendly;
    if (enemyHit) {
        if (s) s.damage = Math.round((s.damage + shot.damage) * 10) / 10;
        addTeamPoints(match, team, Math.round(shot.damage * CANNON_POINTS_PER_DAMAGE));
        match.teams[team].damageDealt = Math.round(((match.teams[team].damageDealt || 0) + shot.damage) * 10) / 10;
    }
    if (after <= 0) {
        // Fort destroyed: 1 WIN for the other side (an own-fort sink credits the opponents).
        const killer = otherTeam(target);
        match.teams[killer].fortKills += 1;
        addTeamPoints(match, killer, CANNON_FORT_KILL_BONUS);
        shot.final = true;
        shot.fortDown = target;
        shot.rebuildAt = now + (match.timing.flightMs ?? 950) + (match.timing.rebuildMs ?? 3_200) - 600;
        fort.hp = CANNON_MAX_HP;
        fort.rebuildUntil = shot.rebuildAt;
    }
    match.teams[team].shots = (match.teams[team].shots || 0) + 1;
    shot.pointsAfter = teamPointsSnapshot(match);
    shot.winsAfter = teamWinsSnapshot(match);
    shot.label = shotLabel(shot);
    shot.detail = shotDetail(shot);
    pushShot(match, shot);
    return shot;
}

function resultPayload(match, id, extra = {}) {
    const team = match.playerTeam[id];
    return {
        gameFormat: CANNON_FORMAT,
        cannon: true,
        reset: false,
        won: false,
        progress: match.stats[id]?.correct || 0,
        team,
        teamName: CANNON_TEAM_NAMES[team],
        suddenDeath: Boolean(match.suddenDeath),
        ...extra,
    };
}

function checkRate(match, ps, now) {
    const win = match.timing.rateWindowMs ?? 2_000;
    ps.submits = ps.submits.filter((t) => now - t < win);
    if (ps.submits.length >= (match.timing.rateMax ?? 4)) {
        throw new Error('Slow down! One answer at a time.');
    }
    ps.submits.push(now);
}

/**
 * A player answers their current question. Correct → immediate shot.
 * Returns { result, shot, ended } (ended = this answer decided the game).
 */
export function submitCannonAnswer(match, playerId, rawText, questionId = null, now = Date.now()) {
    if (!match || (match.phase !== 'battle')) throw new Error('Answering is closed.');
    const id = String(playerId);
    const ps = match.players[id];
    if (!ps) throw new Error('Player not found.');
    if (ps.mode !== 'answering' || !ps.q) throw new Error('Wait for your next question.');
    if (questionId != null && Number(questionId) !== ps.q.id) throw new Error('That question is over.');
    const text = sanitizeAnswerText(rawText);
    if (!text) throw new Error(ps.q.inputMode === 'choice' ? 'Choose an answer first.' : 'Type an answer first.');
    if (ps.q.inputMode === 'choice' && !(ps.q.choices || []).some((c) => matchesTermAnswer(text, c))) {
        throw new Error('Invalid choice.');
    }
    checkRate(match, ps, now);
    const q = ps.q;
    const ms = Math.max(0, Math.min(match.questionMs, now - q.startedAt));
    const correct = matchesTermAnswer(text, q.term);
    const s = match.stats[id];
    s.answered += 1;
    const tierInfo = speedTier(ms, match.questionMs, q.inputMode);
    const common = {
        questionId: q.id,
        correctTerm: q.term,
        definition: q.definition,
        answerText: text,
        inputMode: q.inputMode,
        ms,
    };
    if (correct) {
        s.correct += 1;
        s.totalMs += ms;
        s.streak += 1;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        addTeamPoints(match, match.playerTeam[id], CANNON_POINTS_CORRECT);
        const shot = fireShot(match, id, ms, q.inputMode, now);
        const ended = match.phase !== 'battle';
        if (!ended) {
            ps.mode = 'feedback';
            ps.nextAt = now + match.timing.feedbackCorrectMs;
        }
        ps.q = ended ? null : q;
        ps.last = { correct: true, shotSeq: shot.seq, at: now };
        return {
            result: resultPayload(match, id, {
                ...common, correct: true, challengeable: false, timedOut: false, eligible: true,
                tier: tierInfo.tier, force: tierInfo.force, shot,
                nextAt: ps.nextAt,
            }),
            shot,
            ended,
        };
    }
    s.streak = 0;
    const canChallenge = q.inputMode === 'typed' && !ps.reviewId;
    ps.wrong = { questionId: q.id, ms, inputMode: q.inputMode, term: q.term, definition: q.definition, answerText: text };
    ps.mode = canChallenge ? 'prompt' : 'feedback';
    ps.nextAt = now + (canChallenge ? match.timing.promptMs : match.timing.feedbackWrongMs);
    ps.last = { correct: false, at: now };
    return {
        result: resultPayload(match, id, {
            ...common, correct: false, challengeable: canChallenge, timedOut: false, eligible: false,
            tier: null, force: null, nextAt: ps.nextAt,
        }),
        shot: null,
        ended: false,
    };
}

/**
 * Wrong typed answer → the player challenges. Creates a host review entry and the player
 * moves straight on to the next question (the game never pauses).
 */
export function challengeCannonAnswer(match, playerId, now = Date.now()) {
    const id = String(playerId);
    const ps = match?.players?.[id];
    if (!ps || match.phase !== 'battle' || ps.mode !== 'prompt' || !ps.wrong) {
        throw new Error('There is no answer to challenge.');
    }
    if (ps.reviewId) throw new Error('Your last challenge is still being checked.');
    match.reviewSeq += 1;
    const review = {
        id: `wc-${match.seed}-${match.reviewSeq}`,
        playerId: id,
        nickname: match.nicknames[id],
        team: match.playerTeam[id],
        createdAt: now,
        ...ps.wrong,
    };
    match.reviews.push(review);
    ps.reviewId = review.id;
    ps.wrong = null;
    dealQuestion(match, id, now);
    return review;
}

/** Player taps Continue (or the prompt timed out): next question now. */
export function skipCannonPrompt(match, playerId, now = Date.now()) {
    const id = String(playerId);
    const ps = match?.players?.[id];
    if (!ps || match.phase !== 'battle' || ps.mode !== 'prompt') throw new Error('No pending answer.');
    ps.wrong = null;
    dealQuestion(match, id, now);
    return ps.q;
}

/**
 * Host decides a challenge. Accept → retroactive shot at the force earned at answer time.
 * Returns { review, result, shot, ended }.
 */
export function settleCannonReview(match, reviewId, accept, now = Date.now()) {
    const at = (match?.reviews || []).findIndex((r) => r.id === reviewId);
    if (at < 0) throw new Error('Challenge not found.');
    const [review] = match.reviews.splice(at, 1);
    const ps = match.players[review.playerId];
    if (ps && ps.reviewId === review.id) ps.reviewId = null;
    let shot = null;
    if (accept && match.phase === 'battle') {
        const s = match.stats[review.playerId];
        if (s) {
            s.correct += 1;
            s.totalMs += review.ms;
        }
        addTeamPoints(match, review.team, CANNON_POINTS_CORRECT);
        shot = fireShot(match, review.playerId, review.ms, review.inputMode, now, { retro: true });
    }
    const tierInfo = speedTier(review.ms, match.questionMs, review.inputMode);
    return {
        review,
        shot,
        ended: Boolean(shot && match.phase !== 'battle'),
        result: resultPayload(match, review.playerId, {
            questionId: review.questionId,
            correct: Boolean(accept),
            challengeable: false,
            challengeAccepted: Boolean(accept),
            challengeDeclined: !accept,
            correctTerm: review.term,
            definition: review.definition,
            answerText: review.answerText,
            ms: review.ms,
            tier: accept ? tierInfo.tier : null,
            force: accept ? tierInfo.force : null,
            shot,
        }),
    };
}

/**
 * Advance timers. Returns what happened so the server can notify sockets:
 * { changed, dealt: [playerIds needing their new question], timeouts: [{playerId, result}],
 *   phase, finished, dropped: [review ids] }
 */
export function tickCannon(match, now = Date.now()) {
    const out = { changed: false, dealt: [], timeouts: [], phase: match?.phase || null, finished: false, dropped: [] };
    if (!match) return out;
    if (match.phase === 'intro') {
        if (match.phaseEndsAt != null && now >= match.phaseEndsAt) {
            out.dealt = startBattle(match, now);
            out.changed = true;
        }
        out.phase = match.phase;
        return out;
    }
    if (match.phase === 'ending') {
        if (now >= match.phaseEndsAt) {
            match.phase = 'finished';
            match.phaseEndsAt = null;
            out.changed = true;
            out.finished = true;
        }
        out.phase = match.phase;
        return out;
    }
    if (match.phase !== 'battle') return out;
    // Game clock.
    if (!match.suddenDeath && now >= match.gameEndsAt) {
        const winner = matchLeader(match);
        out.changed = true;
        if (winner) {
            out.dropped = enterEnding(match, now, { winner, reason: 'time' });
            out.phase = match.phase;
            return out;
        }
        match.suddenDeath = true;
        match.suddenEndsAt = now + (match.timing.suddenMs ?? 40_000);
    } else if (match.suddenDeath && now >= match.suddenEndsAt) {
        out.changed = true;
        out.dropped = enterEnding(match, now, { winner: null, reason: 'draw' });
        out.phase = match.phase;
        return out;
    }
    for (const id of match.playerOrder) {
        const ps = match.players[id];
        if (ps.mode === 'answering' && ps.q && now >= ps.q.endsAt) {
            // Time ran out: counts as wrong (never challengeable), show the answer briefly.
            const q = ps.q;
            match.stats[id].answered += 1;
            match.stats[id].streak = 0;
            ps.mode = 'feedback';
            ps.nextAt = now + match.timing.feedbackWrongMs;
            ps.last = { correct: false, timedOut: true, at: now };
            out.timeouts.push({
                playerId: id,
                result: resultPayload(match, id, {
                    questionId: q.id, correct: false, challengeable: false, timedOut: true, eligible: false,
                    correctTerm: q.term, definition: q.definition, answerText: '', inputMode: q.inputMode,
                    ms: match.questionMs, tier: null, force: null, nextAt: ps.nextAt,
                }),
            });
            out.changed = true;
        } else if ((ps.mode === 'feedback' || ps.mode === 'prompt') && ps.nextAt != null && now >= ps.nextAt) {
            ps.wrong = null;
            dealQuestion(match, id, now);
            out.dealt.push(id);
            out.changed = true;
        }
    }
    out.phase = match.phase;
    return out;
}

/** Host ends the game: most WINS, then most points; equal on both is a draw. */
export function finishCannonEarly(match) {
    if (!match) return;
    if (!match.result) {
        const winner = matchLeader(match);
        match.result = {
            winner,
            reason: winner ? 'ended' : 'draw',
            hp: { red: match.teams.red.hp, blue: match.teams.blue.hp },
            points: teamPointsSnapshot(match),
            wins: teamWinsSnapshot(match),
        };
    }
    match.reviews = [];
    match.phase = 'finished';
    match.phaseEndsAt = null;
}

/** Host Skip: skips the intro, or the end hold. Battle has nothing to skip. */
export function hostSkipCannon(match, now = Date.now()) {
    if (!match) throw new Error('No cannon match.');
    if (match.phase === 'intro') {
        const dealt = startBattle(match, now);
        return { phase: match.phase, dealt };
    }
    if (match.phase === 'ending') {
        match.phase = 'finished';
        match.phaseEndsAt = null;
        return { phase: 'finished', dealt: [], finished: true };
    }
    return { phase: match.phase, dealt: [] };
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
    timing = CANNON_FLOW,
    introMs = CANNON_INTRO_MS,
}) {
    if (!Array.isArray(deck) || deck.length < 1) throw new Error('No words in this list.');
    const red = (teams?.red || []).map((p) => ({ id: String(p.id), nickname: String(p.nickname || 'Player') }));
    const blue = (teams?.blue || []).map((p) => ({ id: String(p.id), nickname: String(p.nickname || 'Player') }));
    if (!red.length || !blue.length) throw new Error('Both Red and Blue need at least one player.');
    const mode = ['recognise', 'realise', 'randomise'].includes(answerMode) ? answerMode : 'randomise';
    const matchSeed = seed == null ? Math.floor(Math.random() * 2 ** 31) : Number(seed) >>> 0;
    const mkTeam = (id, list) => ({
        id, name: CANNON_TEAM_NAMES[id], memberIds: list.map((p) => p.id),
        hp: CANNON_MAX_HP, points: 0, fortKills: 0, damageDealt: 0, shots: 0, rebuildUntil: null,
    });
    const match = {
        format: CANNON_FORMAT,
        seed: matchSeed,
        rng: rng || mulberry32(matchSeed),
        phase: 'intro',
        phaseEndsAt: now + Math.max(0, introMs),
        startedAt: now,
        deck,
        answerMode: mode,
        level: level || 'intermediate',
        questionMs: Number(questionMs) > 0 ? Math.round(Number(questionMs)) : CANNON_QUESTION_MS,
        gameMs: Number(gameMs) > 0 ? Math.round(Number(gameMs)) : normalizeGameMinutes(gameMinutes) * 60_000,
        gameEndsAt: null,
        timing: { ...CANNON_FLOW, ...(timing || {}) },
        teams: { red: mkTeam('red', red), blue: mkTeam('blue', blue) },
        playerOrder: [...red, ...blue].map((p) => p.id),
        playerTeam: {},
        nicknames: {},
        stats: {},
        players: {},
        questionSeq: 0,
        shotSeq: 0,
        shots: [],
        reviews: [],
        reviewSeq: 0,
        gust: null,
        gustUntil: null,
        suddenDeath: false,
        suddenEndsAt: null,
        result: null,
    };
    for (const p of red) match.playerTeam[p.id] = 'red';
    for (const p of blue) match.playerTeam[p.id] = 'blue';
    for (const p of [...red, ...blue]) {
        match.nicknames[p.id] = p.nickname;
        match.stats[p.id] = blankStats();
        match.players[p.id] = blankPlayerState();
    }
    if (!(introMs > 0)) startBattle(match, now);
    return match;
}

export function renameCannonPlayer(match, playerId, nickname) {
    if (!match || nickname == null) return;
    const id = String(playerId);
    if (!match.nicknames[id]) return;
    match.nicknames[id] = String(nickname);
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
            damage: Math.round(s.damage),
            avgMs: s.correct ? Math.round(s.totalMs / s.correct) : null,
            bestStreak: s.bestStreak || 0,
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

function teamSummary(match, teamId) {
    const t = match.teams[teamId];
    return {
        hp: Math.round(t.hp),
        points: t.points || 0,
        fortKills: t.fortKills || 0,
        damageDealt: Math.round(t.damageDealt || 0),
    };
}

export function cannonWinners(match) {
    const points = teamPointsSnapshot(match);
    const result = match?.result || { winner: matchLeader(match), reason: null, points };
    const winner = result.winner || null;
    return {
        winner,
        reason: result.reason || null,
        winnerId: winner,
        winnerNickname: winner ? `${CANNON_TEAM_NAMES[winner]}` : "It's a draw",
        hp: { red: Math.round(match.teams.red.hp), blue: Math.round(match.teams.blue.hp) },
        points: result.points || points,
        wins: teamWinsSnapshot(match),
        teams: { red: teamSummary(match, 'red'), blue: teamSummary(match, 'blue') },
        mvp: cannonMvp(match),
        players: cannonPlayerRows(match),
    };
}

function statusFor(match, id) {
    if (match.phase === 'intro') return 'ready';
    const ps = match.players[id];
    if (!ps) return 'out';
    if (ps.mode === 'prompt') return 'deciding';
    if (ps.mode === 'feedback') return ps.last?.correct ? 'fired' : 'missed';
    if (ps.mode === 'answering') return 'answering';
    return 'done';
}

/** The player's current question (null when between questions). */
export function cannonQuestionPayload(match, playerId) {
    if (!match || match.phase !== 'battle') return null;
    const ps = match.players?.[String(playerId)];
    if (!ps || ps.mode !== 'answering' || !ps.q) return null;
    const q = ps.q;
    return {
        progress: 0,
        termsToWin: 0,
        termIndex: q.number - 1,
        questionId: q.id,
        definition: q.definition,
        inputMode: q.inputMode,
        answerMode: match.answerMode,
        gameFormat: CANNON_FORMAT,
        caseSensitive: false,
        round: q.number,
        startedAt: q.startedAt,
        endsAt: q.endsAt,
        timeLimitSec: Math.round(match.questionMs / 1000),
        suddenDeath: Boolean(match.suddenDeath),
        ...(q.inputMode === 'choice' ? { choices: q.choices } : {}),
    };
}

function teamLiveStats(match, teamId) {
    const out = { answered: 0, correct: 0, shots: 0, hits: 0, damage: 0, accuracy: 0, perMin: 0 };
    for (const id of match.teams[teamId].memberIds) {
        const s = match.stats[id];
        out.answered += s.answered;
        out.correct += s.correct;
        out.shots += s.shots;
        out.hits += s.hits;
    }
    out.damage = Math.round(match.teams[teamId].damageDealt || 0);
    out.accuracy = out.answered ? Math.round((out.correct / out.answered) * 100) : 0;
    return out;
}

export function cannonPublicView(match, { playerId = null, forHost = false, connected = null, now = Date.now() } = {}) {
    if (!match) return null;
    const teams = {};
    const elapsedMin = match.gameEndsAt ? Math.max(0.25, (Math.min(now, match.result?.endedAt ?? now) - (match.gameEndsAt - match.gameMs)) / 60_000) : 0;
    for (const teamId of CANNON_TEAM_IDS) {
        const team = match.teams[teamId];
        const stats = teamLiveStats(match, teamId);
        stats.perMin = elapsedMin ? Math.round((stats.shots / elapsedMin) * 10) / 10 : 0;
        teams[teamId] = {
            id: teamId,
            name: team.name,
            hp: team.hp,
            maxHp: CANNON_MAX_HP,
            points: team.points || 0,
            fortKills: team.fortKills || 0,
            damageDealt: Math.round(team.damageDealt || 0),
            slots: teamSlots(team.memberIds.length),
            rebuildUntil: team.rebuildUntil,
            stats,
            members: team.memberIds.map((id) => ({
                id,
                nickname: match.nicknames[id],
                connected: connected ? connected[id] !== false : true,
                status: statusFor(match, id),
                correct: match.stats[id]?.correct || 0,
                answered: match.stats[id]?.answered || 0,
                hits: match.stats[id]?.hits || 0,
                streak: match.stats[id]?.streak || 0,
            })),
        };
    }
    const view = {
        gameFormat: CANNON_FORMAT,
        phase: match.phase,
        serverNow: now,
        phaseEndsAt: match.phaseEndsAt,
        questionMs: match.questionMs,
        playerCount: match.playerOrder.length,
        teams,
        clock: {
            gameMs: match.gameMs,
            gameEndsAt: match.gameEndsAt,
            pausedAt: null,
            timeLeftMs: cannonTimeLeft(match, now),
            stormMs: Math.min(CANNON_STORM_MS, match.gameMs),
        },
        storm: isStormActive(match, now),
        gust: isStormActive(match, now) ? match.gust : null,
        suddenDeath: Boolean(match.suddenDeath),
        suddenEndsAt: match.suddenEndsAt,
        shotSeq: match.shotSeq,
        // Host animates every shot; phones only need their own team's recent shots for the ticker.
        shots: forHost ? match.shots.slice() : match.shots.slice(-6),
        reviews: forHost ? match.reviews.map((r) => ({ id: r.id, playerId: r.playerId, nickname: r.nickname, team: r.team })) : [],
        result: (match.phase === 'ending' || match.phase === 'finished') ? cannonWinners(match) : null,
        you: null,
    };
    const id = playerId != null ? String(playerId) : null;
    if (id && match.players[id]) {
        const ps = match.players[id];
        const team = match.playerTeam[id];
        view.you = {
            id,
            team,
            teamName: CANNON_TEAM_NAMES[team],
            mode: ps.mode,
            status: statusFor(match, id),
            questionId: ps.mode === 'answering' ? ps.q?.id ?? null : null,
            startedAt: ps.mode === 'answering' ? ps.q?.startedAt ?? null : null,
            endsAt: ps.mode === 'answering' ? ps.q?.endsAt ?? null : null,
            nextAt: ps.nextAt,
            reviewPending: Boolean(ps.reviewId),
            stats: { ...(match.stats[id] || blankStats()) },
        };
    }
    return view;
}

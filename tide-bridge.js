/**
 * The Bridge (internal id `tide-bridge`) — co-op Live Spark match: six rounds, six bridges, one rising tide each.
 *
 * Game script (design document, see README of this module's constants below):
 *   - The class works together (no teams) across ROUND_COUNT = 6 rounds of rising danger. Each round has its own
 *     bridge (1..N spans) and its own Round Tide Timer; a separate Global Match Clock (3/5/8/10 min) ends the match.
 *   - Round loop: Vocab Span ("Lay the next stone!") -> short pause/celebration -> Shore Challenge ("Mid-Bridge
 *     Obstacle!", one per round, after the middle span, non-vocab bank) -> ... -> Bridge cleared transition -> next round.
 *   - Co-op rule: every player gets their own random vocab card from the deck; each player's FIRST correct answer in a
 *     span counts once toward the shared counter (needed = target, or the player count when fewer players than the
 *     target). Wrong answers deduct nothing.
 *   - Round tide: starts when a round's first span starts, keeps rising through the shore challenge, is PAUSED during
 *     the short pause and during the between-round transition. If it reaches 100% before the bridge is complete, the
 *     round fails ("The tide took the bridge!") and the match ENDS. If the global clock hits zero at any moment the
 *     match ends immediately; the round in progress does not count.
 *   - Medal by bridges completed: 0-2 Bronze, 3-4 Silver, 5-6 Gold.
 *
 * Every tunable number below is a named constant. All time-dependent functions take an explicit `now` so the state
 * machine can be simulated headlessly (see tide-bridge.test.js).
 */

import { buildChoices, matchesTermAnswer, sanitizeAnswerText } from './vocab-quiz-utils.js';
import { normalizeGameMinutes, CANNON_DEFAULT_MINUTES, CANNON_GAME_MINUTES } from './word-cannon.js';

export const TIDE_FORMAT = 'tide-bridge';
export { normalizeGameMinutes, CANNON_DEFAULT_MINUTES as TIDE_DEFAULT_MINUTES, CANNON_GAME_MINUTES as TIDE_GAME_MINUTES };

/* ----------------------------------------------------------------------------------------------- constants */

export const ROUND_COUNT = 6;

/** Short pause + celebration after a span (or the shore challenge) is cleared. Round tide is PAUSED. */
export const TIDE_BETWEEN_MS = 2_500;
/** "Bridge cleared! Crossing to chasm N+1" (also the final victory beat). Round tide is PAUSED. */
export const TIDE_TRANSITION_MS = 3_500;
/** "The tide took the bridge!" moment before the match ends. */
export const TIDE_FAIL_MS = 3_000;
export const TIDE_DEFAULT_QUESTION_MS = 20_000;

/** Round names / bridge themes (document table). `theme` is the visual id used by tide-bridge-scene.js. */
export const ROUNDS = [
    { n: 1, name: 'Gentle Start', bridge: 'Wooden Footbridge', theme: 'footbridge', pace: 'Slow tide' },
    { n: 2, name: 'Warming Up', bridge: 'Cobblestone Arch', theme: 'arch', pace: 'Moderate tide' },
    { n: 3, name: 'Speed Test', bridge: 'High Stone Viaduct', theme: 'viaduct', pace: 'Fast tide' },
    { n: 4, name: 'Pressure On', bridge: 'Raging Rapids Crossing', theme: 'rapids', pace: 'Very fast tide' },
    { n: 5, name: 'Storm Surge', bridge: 'Iron Cliff Span', theme: 'storm', pace: 'Aggressive tide' },
    { n: 6, name: 'Final Escape', bridge: 'The Grand Citadel Bridge', theme: 'citadel', pace: 'Relentless tide' },
];

/** Correct answers needed per vocab span, R1..R6 (capped by the player count when < target). */
export const ROUND_TARGETS = [2, 3, 4, 4, 5, 5];

/** Spans per bridge R1..R6 by Overall Match Clock (minutes). Shorter matches get shorter bridges. */
export const SPANS_BY_MINUTES = {
    10: [2, 3, 3, 4, 4, 5],
    8: [2, 3, 3, 3, 4, 4],
    5: [2, 2, 3, 3, 3, 4],
    3: [1, 1, 2, 2, 2, 2],
};

/** Base round-tide budget per span in seconds, R1..R6 (shrinks every round). */
export const TIDE_PER_SPAN_SECONDS = [54, 44, 37, 31, 26, 22];
/** Extra tide seconds for the Shore Challenge, R1..R6 (only added when the round has one). */
export const TIDE_SHORE_ALLOWANCE_SECONDS = [0, 24, 22, 20, 20, 18];
/** Each round's tide limit is at most this fraction of the previous round's, so the gauge ALWAYS fills faster. */
export const TIDE_SHRINK_FACTOR = 0.94;

/** Random Mix: probability that a vocab card is typed (else multiple choice), R1..R6. Typed-only / MC-only ignore it. */
export const MIX_TYPED_PROBABILITY = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

/** Seconds per wave cycle on the host art, R1..R6 (smaller = faster water). */
export const ROUND_WAVE_SECONDS = [9, 7.5, 6, 4, 3, 2.4];

/** Shore challenge: shore difficulty by round (R1 never has one). */
export const SHORE_LEVEL_BY_ROUND = [null, 'easy', 'normal', 'normal', 'hard', 'hard'];
/** R2 only gets a shore challenge when the bridge has at least this many spans. */
export const SHORE_MIN_SPANS_R2 = 3;
/** Rounds 3..6 get a shore challenge when the bridge has at least this many spans. */
export const SHORE_MIN_SPANS = 2;

/** Medals by bridges (rounds) completed. */
export const TIDE_TIERS = {
    bronze: { id: 'bronze', label: 'Swept Back to Shore', title: 'Swept Back to Shore', min: 0, max: 2 },
    silver: { id: 'silver', label: 'Mid-Channel Explorers', title: 'Mid-Channel Explorers', min: 3, max: 4 },
    gold: { id: 'gold', label: 'Reached the Far Cliff', title: 'Reached the Far Cliff', min: 5, max: 6 },
};

/**
 * Built-in shore bank (12-20 items) — NOT from the vocab deck. Tagged easy / normal / hard.
 * R2 draws `easy`, R3-R4 `normal`, R5-R6 `hard`; shuffled per match, no repeats while the pool lasts.
 */
export const SHORE_BREAKERS = [
    // easy
    { id: 'e-math1', level: 'easy', prompt: 'What is 7 + 5?', answer: '12', alts: ['twelve'] },
    { id: 'e-tf1', level: 'easy', prompt: 'True or false: The sun rises in the west.', answer: 'false', alts: ['f', 'no'] },
    { id: 'e-tf2', level: 'easy', prompt: 'True or false: A triangle has 3 sides.', answer: 'true', alts: ['t', 'yes'] },
    { id: 'e-color1', level: 'easy', prompt: 'Type the colour of grass (one word).', answer: 'green', alts: [] },
    { id: 'e-emoji1', level: 'easy', prompt: 'Type the word for 🐱', answer: 'cat', alts: ['kitten'] },
    { id: 'e-emoji2', level: 'easy', prompt: 'Type the word for 🐶', answer: 'dog', alts: ['puppy'] },
    { id: 'e-count1', level: 'easy', prompt: 'How many days in a week?', answer: '7', alts: ['seven'] },
    // normal
    { id: 'n-math1', level: 'normal', prompt: 'What is 9 × 3?', answer: '27', alts: ['twenty-seven', 'twenty seven'] },
    { id: 'n-math2', level: 'normal', prompt: 'What is 100 − 37?', answer: '63', alts: ['sixty-three', 'sixty three'] },
    { id: 'n-math3', level: 'normal', prompt: 'How many minutes in 2 hours?', answer: '120', alts: ['one hundred twenty', 'one hundred and twenty'] },
    { id: 'n-color1', level: 'normal', prompt: 'Type the colour of a clear daytime sky.', answer: 'blue', alts: [] },
    { id: 'n-back1', level: 'normal', prompt: 'Spell STAR backwards.', answer: 'rats', alts: [] },
    { id: 'n-back2', level: 'normal', prompt: 'Spell LIVE backwards.', answer: 'evil', alts: [] },
    { id: 'n-silly1', level: 'normal', prompt: 'Type exactly: splash splash', answer: 'splash splash', alts: [] },
    // hard (bigger maths, longer reversals, colour riddle)
    { id: 'h-math1', level: 'hard', prompt: 'What is 12 × 8?', answer: '96', alts: ['ninety-six', 'ninety six'] },
    { id: 'h-math2', level: 'hard', prompt: 'What is 245 − 78?', answer: '167', alts: [] },
    { id: 'h-back1', level: 'hard', prompt: 'Spell BRIDGE backwards.', answer: 'egdirb', alts: [] },
    { id: 'h-back2', level: 'hard', prompt: 'Type this backwards: tide in', answer: 'ni edit', alts: ['niedit'] },
    { id: 'h-back3', level: 'hard', prompt: 'Spell OCEAN backwards.', answer: 'naeco', alts: [] },
    { id: 'h-riddle1', level: 'hard', prompt: 'Mix 🔵 and 🟡 — what colour do you get?', answer: 'green', alts: [] },
];

function mulberry32(seed) {
    let t = seed >>> 0;
    return function rng() {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function normalizeAns(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchesBreaker(raw, item) {
    const v = normalizeAns(raw);
    if (!v) return false;
    const ok = [item.answer, ...(item.alts || [])].map(normalizeAns).filter(Boolean);
    return ok.some((a) => a === v);
}


/* ----------------------------------------------------------------------------------------------- round tables */

function clampRound(round) {
    return Math.max(1, Math.min(ROUND_COUNT, Math.floor(Number(round) || 1)));
}

export function spansForRound(gameMinutes, round) {
    const m = normalizeGameMinutes(gameMinutes);
    const table = SPANS_BY_MINUTES[m] || SPANS_BY_MINUTES[5];
    return table[clampRound(round) - 1];
}

export function totalSpans(gameMinutes) {
    const m = normalizeGameMinutes(gameMinutes);
    return (SPANS_BY_MINUTES[m] || SPANS_BY_MINUTES[5]).reduce((a, b) => a + b, 0);
}

/** One shore challenge per round (R1 never; R2 only with >= 3 spans; R3-R6 with >= 2 spans). */
export function roundHasShore(round, spans) {
    const r = clampRound(round);
    if (r === 1) return false;
    if (r === 2) return spans >= SHORE_MIN_SPANS_R2;
    return spans >= SHORE_MIN_SPANS;
}

/** The shore challenge comes after this many spans of the bridge are laid (the middle span). */
export function shoreAfterSpans(spans) {
    return Math.ceil(spans / 2);
}

/** Needed correct answers for a vocab span: round target, or the player count when fewer players than the target. */
export function neededCorrectForRound(round, playerCount) {
    const target = ROUND_TARGETS[clampRound(round) - 1];
    return Math.max(1, Math.min(target, Math.max(1, Number(playerCount) || 1)));
}

/** Shore target = one lower than the round's vocab target (min 2), also capped by the player count. */
export function shoreNeededForRound(round, playerCount) {
    const target = Math.max(2, ROUND_TARGETS[clampRound(round) - 1] - 1);
    return Math.max(1, Math.min(target, Math.max(1, Number(playerCount) || 1)));
}

/** Kept for compatibility: the old flat co-op rule (3, or the player count if fewer). */
export function neededCorrectForPlayers(n) {
    const count = Math.max(1, Number(n) || 1);
    return count >= 3 ? 3 : count;
}

/**
 * Round tide limit in ms. Derived from a per-span budget x spans (+ shore allowance), then forced to be at most
 * TIDE_SHRINK_FACTOR x the previous round's limit, so the tide rises visibly faster every round.
 */
export function tideLimitMs(gameMinutes, round) {
    const r = clampRound(round);
    let prev = Infinity;
    let limit = 0;
    for (let i = 1; i <= r; i++) {
        const spans = spansForRound(gameMinutes, i);
        const derived = spans * TIDE_PER_SPAN_SECONDS[i - 1] + (roundHasShore(i, spans) ? TIDE_SHORE_ALLOWANCE_SECONDS[i - 1] : 0);
        limit = Math.min(derived, Math.floor(prev * TIDE_SHRINK_FACTOR));
        prev = limit;
    }
    return limit * 1000;
}

export function typedProbability(round) {
    return MIX_TYPED_PROBABILITY[clampRound(round) - 1];
}

/** Medal by bridges completed (0-2 bronze, 3-4 silver, 5-6 gold). Second argument kept for old callers, ignored. */
export function tideTier(roundsCompleted) {
    const c = Math.max(0, Math.min(ROUND_COUNT, Math.floor(Number(roundsCompleted) || 0)));
    if (c >= TIDE_TIERS.gold.min) return { id: 'gold', label: TIDE_TIERS.gold.label, title: TIDE_TIERS.gold.title };
    if (c >= TIDE_TIERS.silver.min) return { id: 'silver', label: TIDE_TIERS.silver.label, title: TIDE_TIERS.silver.title };
    return { id: 'bronze', label: TIDE_TIERS.bronze.label, title: TIDE_TIERS.bronze.title };
}

/** Static description of one round for the clients (names, bridge, targets, tide, wave speed). */
export function roundConfig(gameMinutes, round, playerCount = 3) {
    const r = clampRound(round);
    const spans = spansForRound(gameMinutes, r);
    const hasShore = roundHasShore(r, spans);
    const meta = ROUNDS[r - 1];
    return {
        round: r,
        name: meta.name,
        bridge: meta.bridge,
        theme: meta.theme,
        pace: meta.pace,
        spans,
        target: neededCorrectForRound(r, playerCount),
        hasShore,
        shoreAfter: hasShore ? shoreAfterSpans(spans) : null,
        shoreTarget: hasShore ? shoreNeededForRound(r, playerCount) : null,
        shoreLevel: hasShore ? SHORE_LEVEL_BY_ROUND[r - 1] : null,
        tideLimitMs: tideLimitMs(gameMinutes, r),
        waveSeconds: ROUND_WAVE_SECONDS[r - 1],
    };
}

function pickInputMode(answerMode, rng, round = 1) {
    const mode = String(answerMode || 'recognise');
    if (mode === 'realise') return 'typed';
    if (mode === 'randomise') return rng() < typedProbability(round) ? 'typed' : 'choice';
    return 'choice';
}

/* ----------------------------------------------------------------------------------------------- tide timer */

function tideElapsed(match, now) {
    const t = match.tide;
    return t.elapsedMs + (t.runningSince != null ? Math.max(0, now - t.runningSince) : 0);
}

function pauseTide(match, now) {
    const t = match.tide;
    if (t.runningSince != null) {
        t.elapsedMs += Math.max(0, now - t.runningSince);
        t.runningSince = null;
    }
}

function resumeTide(match, now) {
    if (match.tide.runningSince == null) match.tide.runningSince = now;
}

export function tideRatioNow(match, now = Date.now()) {
    if (!match?.tide) return 0;
    return Math.min(1, Math.max(0, tideElapsed(match, now) / Math.max(1, match.tide.limitMs)));
}

/* ----------------------------------------------------------------------------------------------- match */

/**
 * @param {{ players: {id:string,nickname:string}[], deck: {term:string,definition:string}[], answerMode?: string, level?: string, gameMinutes?: number, questionMs?: number, seed?: number|null, now?: number }} opts
 */
export function createTideMatch(opts) {
    const players = (opts.players || []).map((p) => ({
        id: String(p.id),
        nickname: String(p.nickname || 'Player'),
    }));
    if (players.length < 2) throw new Error('The Bridge needs at least 2 players.');
    const deck = (opts.deck || [])
        .map((e) => ({ term: String(e.term || '').trim(), definition: String(e.definition || '').trim() }))
        .filter((e) => e.term && e.definition);
    if (deck.length < 12) throw new Error('The Bridge needs at least 12 terms.');

    const seed = Number.isFinite(opts.seed) ? Number(opts.seed) : (Date.now() ^ (Math.random() * 1e9));
    const rng = mulberry32(seed >>> 0);
    const gameMinutes = normalizeGameMinutes(opts.gameMinutes);
    const now = Number.isFinite(opts.now) ? Number(opts.now) : Date.now();

    // per-level shuffled shore queues (no repeats within a match while a level's pool lasts)
    const shoreQueues = {};
    for (const level of ['easy', 'normal', 'hard']) {
        shoreQueues[level] = shuffleInPlace(SHORE_BREAKERS.filter((b) => b.level === level).map((b) => b.id), rng);
    }

    const match = {
        format: TIDE_FORMAT,
        seed,
        rng,
        deck,
        answerMode: opts.answerMode || 'recognise',
        level: opts.level || '',
        gameMinutes,
        questionMs: Math.max(5_000, Number(opts.questionMs) || TIDE_DEFAULT_QUESTION_MS),
        startedAt: now,
        endsAt: now + gameMinutes * 60_000,
        phase: 'vocab', // vocab | breaker | between | roundTransition | finished
        phaseEndsAt: null,
        round: 1,
        roundsCompleted: 0,
        failedRound: null,
        endReason: null, // clock | tide | victory | host
        roundResults: Array.from({ length: ROUND_COUNT }, () => 'pending'),
        spansLaid: 0, // total spans cleared in the match (== `cleared`)
        cleared: 0,
        roundIndex: 0, // 0-based round, kept for old clients
        spansInRound: 0,
        spanIndex: 0, // spans cleared in the current round
        hasShore: false,
        shoreAfter: null,
        shoreDone: false,
        betweenNext: 'vocab', // vocab | breaker (what follows the pause) 
        transition: null, // { kind: 'cleared' | 'victory' | 'failed', from, to }
        tide: { limitMs: 0, elapsedMs: 0, runningSince: null },
        neededCorrect: 0,
        gotCorrect: 0,
        correctPlayerIds: new Set(),
        players: Object.fromEntries(players.map((p) => [p.id, { ...p, correctTotal: 0, locked: false }])),
        playerOrder: players.map((p) => p.id),
        assignments: {}, // playerId -> { termIndex, questionId, inputMode, choices?, entry }
        shoreQueues,
        shoreUsed: [],
        breaker: null, // current shore item + questionId
        finished: false,
        tier: null,
    };

    startRound(match, 1, now);
    return match;
}

function playerCount(match) {
    return Object.keys(match.players).length;
}

function nextQuestionId(match) {
    return `tb-${match.round}-${match.spansLaid}-${Math.floor(match.rng() * 1e9)}`;
}

/** Begin round `round`: reset the bridge, restart the round tide, deal the first span. */
export function startRound(match, round, now = Date.now()) {
    const r = clampRound(round);
    match.round = r;
    match.roundIndex = r - 1;
    match.spansInRound = spansForRound(match.gameMinutes, r);
    match.spanIndex = 0;
    match.hasShore = roundHasShore(r, match.spansInRound);
    match.shoreAfter = match.hasShore ? shoreAfterSpans(match.spansInRound) : null;
    match.shoreDone = false;
    match.transition = null;
    match.tide = { limitMs: tideLimitMs(match.gameMinutes, r), elapsedMs: 0, runningSince: now };
    dealVocabRound(match, now);
}

export function dealVocabRound(match, now = Date.now()) {
    match.phase = 'vocab';
    match.phaseEndsAt = null;
    match.gotCorrect = 0;
    match.correctPlayerIds = new Set();
    match.neededCorrect = neededCorrectForRound(match.round, playerCount(match));
    match.assignments = {};
    match.breaker = null;
    resumeTide(match, now);

    const deckLen = match.deck.length;
    const used = new Set();
    const ids = [...match.playerOrder];
    shuffleInPlace(ids, match.rng);

    for (const pid of ids) {
        const ps = match.players[pid];
        if (!ps) continue;
        ps.locked = false;
        let termIndex;
        if (used.size < deckLen) {
            let guard = 0;
            do {
                termIndex = Math.floor(match.rng() * deckLen);
                guard += 1;
            } while (used.has(termIndex) && guard < deckLen * 4);
            used.add(termIndex);
        } else {
            termIndex = Math.floor(match.rng() * deckLen);
        }
        const entry = match.deck[termIndex];
        const inputMode = pickInputMode(match.answerMode, match.rng, match.round);
        const questionId = nextQuestionId(match);
        const assignment = {
            termIndex,
            questionId,
            inputMode,
            entry: { term: entry.term, definition: entry.definition },
            choices: null,
        };
        if (inputMode === 'choice') {
            assignment.choices = buildChoices(entry.term, match.deck.map((d) => d.term), match.rng);
        }
        match.assignments[pid] = assignment;
    }
}

/** Pick the next shore item for this round's level; avoids repeats, falls back to other levels, then recycles. */
function pickShoreItem(match) {
    const want = SHORE_LEVEL_BY_ROUND[clampRound(match.round) - 1] || 'normal';
    const order = [want, ...['normal', 'easy', 'hard'].filter((l) => l !== want)];
    for (const level of order) {
        const q = match.shoreQueues[level];
        while (q.length) {
            const id = q.shift();
            if (!match.shoreUsed.includes(id)) {
                match.shoreUsed.push(id);
                return SHORE_BREAKERS.find((b) => b.id === id);
            }
        }
    }
    // everything used (cannot happen with <= 5 shores and 20 items): recycle
    match.shoreUsed = [];
    const pool = SHORE_BREAKERS.filter((b) => b.level === want);
    return pool[Math.floor(match.rng() * pool.length)] || SHORE_BREAKERS[0];
}

export function startBreaker(match, now = Date.now()) {
    match.phase = 'breaker';
    match.phaseEndsAt = null;
    match.gotCorrect = 0;
    match.correctPlayerIds = new Set();
    match.neededCorrect = shoreNeededForRound(match.round, playerCount(match));
    match.assignments = {};
    resumeTide(match, now);

    for (const pid of match.playerOrder) {
        if (match.players[pid]) match.players[pid].locked = false;
    }
    const item = pickShoreItem(match);
    match.breaker = {
        id: item.id,
        level: item.level,
        prompt: item.prompt,
        answer: item.answer,
        alts: item.alts || [],
        questionId: nextQuestionId(match),
    };
}

/** Short pause + celebration (round tide PAUSED). `nextPhase` is what follows: 'breaker' | 'vocab'. */
export function beginBetween(match, nextPhase, now = Date.now()) {
    pauseTide(match, now);
    match.phase = 'between';
    match.betweenNext = nextPhase;
    match.phaseEndsAt = now + TIDE_BETWEEN_MS;
    match.assignments = {};
    match.breaker = null;
}

function beginTransition(match, kind, now) {
    pauseTide(match, now);
    match.phase = 'roundTransition';
    match.assignments = {};
    match.breaker = null;
    match.transition = { kind, from: match.round, to: kind === 'cleared' ? Math.min(ROUND_COUNT, match.round + 1) : match.round };
    match.phaseEndsAt = now + (kind === 'failed' ? TIDE_FAIL_MS : TIDE_TRANSITION_MS);
}

/** A span (vocab) or the shore challenge was just cleared by the shared counter. */
export function clearRound(match, now = Date.now()) {
    if (match.phase === 'breaker') {
        match.shoreDone = true;
        beginBetween(match, 'vocab', now);
        return;
    }
    // vocab span laid
    match.spansLaid += 1;
    match.cleared = match.spansLaid;
    match.spanIndex += 1;
    if (match.spanIndex >= match.spansInRound) {
        // the bridge is complete
        match.roundsCompleted += 1;
        match.roundResults[match.round - 1] = 'done';
        beginTransition(match, match.round >= ROUND_COUNT ? 'victory' : 'cleared', now);
        return;
    }
    const shoreNext = match.hasShore && !match.shoreDone && match.spanIndex >= match.shoreAfter;
    beginBetween(match, shoreNext ? 'breaker' : 'vocab', now);
}

export function finishTideMatch(match, now = Date.now(), reason = 'clock') {
    if (match.finished) return match.tier;
    match.finished = true;
    match.phase = 'finished';
    match.phaseEndsAt = null;
    match.endsAt = Math.min(match.endsAt, now);
    match.endReason = reason;
    pauseTide(match, now);
    match.tier = tideTier(match.roundsCompleted);
    // the round that was in progress does not count
    for (let i = 0; i < ROUND_COUNT; i++) {
        if (match.roundResults[i] === 'pending' && i + 1 === match.round && match.failedRound !== i + 1) match.roundResults[i] = 'incomplete';
    }
    return match.tier;
}

/** True when the active round's tide has reached 100% before its bridge is complete (vocab / breaker only). */
function tideFailed(match, now) {
    if (match.phase !== 'vocab' && match.phase !== 'breaker') return false;
    return tideElapsed(match, now) >= match.tide.limitMs;
}

function failRound(match, now) {
    match.failedRound = match.round;
    match.roundResults[match.round - 1] = 'failed';
    match.tide.elapsedMs = match.tide.limitMs;
    match.tide.runningSince = null;
    beginTransition(match, 'failed', now);
}

export function tickTide(match, now = Date.now()) {
    if (match.finished) return { changed: false, finished: true, dealt: [] };

    // Global match clock: ends the match immediately, whatever the round is doing.
    if (now >= match.endsAt) {
        finishTideMatch(match, now, 'clock');
        return { changed: true, finished: true, dealt: [] };
    }

    if (tideFailed(match, now)) {
        failRound(match, now);
        return { changed: true, finished: false, dealt: [], tideFailed: true };
    }

    if ((match.phase === 'between' || match.phase === 'roundTransition') && match.phaseEndsAt != null && now >= match.phaseEndsAt) {
        if (match.phase === 'roundTransition') {
            const kind = match.transition?.kind;
            if (kind === 'failed') {
                finishTideMatch(match, now, 'tide');
                return { changed: true, finished: true, dealt: [] };
            }
            if (kind === 'victory') {
                finishTideMatch(match, now, 'victory');
                return { changed: true, finished: true, dealt: [] };
            }
            startRound(match, match.round + 1, now);
            return { changed: true, finished: false, dealt: [...match.playerOrder], newRound: true };
        }
        if (match.betweenNext === 'breaker') startBreaker(match, now);
        else dealVocabRound(match, now);
        return { changed: true, finished: false, dealt: [...match.playerOrder] };
    }

    return { changed: false, finished: false, dealt: [] };
}

function roundExtras(match) {
    return {
        round: match.round,
        rounds: ROUND_COUNT,
        spanNumber: Math.min(match.spansInRound, match.spanIndex + 1),
        spansInRound: match.spansInRound,
        roundsCompleted: match.roundsCompleted,
        roundIndex: match.roundIndex,
    };
}

export function tideQuestionPayload(match, playerId) {
    if (!match || match.finished) return null;
    if (match.phase === 'between' || match.phase === 'roundTransition' || match.phase === 'finished') return null;

    if (match.phase === 'breaker' && match.breaker) {
        return {
            tide: true,
            gameFormat: TIDE_FORMAT,
            phase: 'breaker',
            questionId: match.breaker.questionId,
            definition: match.breaker.prompt,
            prompt: match.breaker.prompt,
            inputMode: 'typed',
            answerMode: 'realise',
            caseSensitive: false,
            progress: match.cleared,
            gotCorrect: match.gotCorrect,
            neededCorrect: match.neededCorrect,
            endsAt: match.endsAt,
            ...roundExtras(match),
        };
    }

    if (match.phase === 'vocab') {
        const a = match.assignments[playerId];
        if (!a) return null;
        const ps = match.players[playerId];
        if (ps?.locked) return null;
        const payload = {
            tide: true,
            gameFormat: TIDE_FORMAT,
            phase: 'vocab',
            questionId: a.questionId,
            definition: a.entry.definition,
            inputMode: a.inputMode,
            answerMode: match.answerMode,
            caseSensitive: false,
            progress: match.cleared,
            gotCorrect: match.gotCorrect,
            neededCorrect: match.neededCorrect,
            endsAt: match.endsAt,
            termIndex: a.termIndex,
            ...roundExtras(match),
        };
        if (a.inputMode === 'choice' && a.choices) payload.choices = a.choices;
        return payload;
    }
    return null;
}

function resultBase(match) {
    return {
        tide: true,
        gameFormat: TIDE_FORMAT,
        phase: match.phase,
        progress: match.cleared,
        gotCorrect: match.gotCorrect,
        neededCorrect: match.neededCorrect,
        endsAt: match.endsAt,
        ...roundExtras(match),
    };
}

export function submitTideAnswer(match, playerId, rawText, questionId, now = Date.now()) {
    if (match.finished || now >= match.endsAt) {
        finishTideMatch(match, now, 'clock');
        return { result: { correct: false, finished: true, tide: true, gameFormat: TIDE_FORMAT }, cleared: false };
    }
    if (tideFailed(match, now)) {
        failRound(match, now);
        return { result: { correct: false, tideFailed: true, tide: true, gameFormat: TIDE_FORMAT }, cleared: false };
    }
    if (match.phase === 'between' || match.phase === 'roundTransition') {
        throw new Error('Wait for the next challenge.');
    }
    const ps = match.players[playerId];
    if (!ps) throw new Error('Player not found.');
    if (ps.locked) throw new Error('Already answered this round.');

    const answerText = sanitizeAnswerText(rawText);
    if (!answerText) throw new Error('Type an answer first.');

    let correct = false;
    let correctTerm = '';
    let challengeable = false;
    let entry = null;

    if (match.phase === 'breaker') {
        if (!match.breaker) throw new Error('No shore challenge.');
        if (questionId != null && String(questionId) !== String(match.breaker.questionId)) {
            throw new Error('That challenge expired.');
        }
        correct = matchesBreaker(answerText, match.breaker);
        correctTerm = match.breaker.answer;
        // Breakers: no host challenge queue
    } else if (match.phase === 'vocab') {
        const a = match.assignments[playerId];
        if (!a) throw new Error('No question assigned.');
        if (questionId != null && String(questionId) !== String(a.questionId)) {
            throw new Error('That question expired.');
        }
        entry = a.entry;
        correct = matchesTermAnswer(answerText, entry.term);
        correctTerm = entry.term;
        if (!correct && a.inputMode === 'typed') challengeable = true;
    } else {
        throw new Error('Cannot answer now.');
    }

    if (correct) {
        ps.locked = true;
        if (!match.correctPlayerIds.has(playerId)) {
            match.correctPlayerIds.add(playerId);
            match.gotCorrect = match.correctPlayerIds.size;
            ps.correctTotal += 1;
        }
        const wasPhase = match.phase;
        const got = match.gotCorrect;
        const need = match.neededCorrect;
        let cleared = false;
        let roundCleared = false;
        if (match.gotCorrect >= match.neededCorrect) {
            const before = match.roundsCompleted;
            clearRound(match, now);
            cleared = true;
            roundCleared = match.roundsCompleted > before;
        }
        return {
            result: {
                ...resultBase(match),
                correct: true,
                wasPhase,
                gotCorrect: cleared ? need : got,
                cleared,
                roundCleared,
                won: false,
            },
            cleared,
        };
    }

    // Wrong (nothing is deducted). The player may try again straight away.
    if (challengeable) {
        return {
            result: {
                ...resultBase(match),
                correct: false,
                reset: false,
                challengeable: true,
                phase: 'vocab',
                correctTerm,
                answerText,
                definition: entry?.definition || '',
                questionId: match.assignments[playerId]?.questionId,
            },
            cleared: false,
            pendingChallenge: { entry, answerText },
        };
    }

    return {
        result: {
            ...resultBase(match),
            correct: false,
            reset: false,
            challengeable: false,
            correctTerm: match.phase === 'breaker' ? '' : correctTerm,
        },
        cleared: false,
    };
}

/** Host accepted a typed vocab challenge as correct. */
export function settleTideChallenge(match, playerId, accepted, now = Date.now()) {
    const notCounted = (stale) => ({ cleared: false, result: { correct: false, accepted: false, stale: Boolean(stale), tide: true, gameFormat: TIDE_FORMAT } });
    if (!accepted) {
        const ps = match.players[playerId];
        if (ps && match.phase === 'vocab') ps.locked = false;
        return notCounted(false);
    }
    if (match.finished || match.phase !== 'vocab') return notCounted(true);
    const ps = match.players[playerId];
    if (!ps) return notCounted(true);
    ps.locked = true;
    if (!match.correctPlayerIds.has(playerId)) {
        match.correctPlayerIds.add(playerId);
        match.gotCorrect = match.correctPlayerIds.size;
        ps.correctTotal += 1;
    }
    const got = match.gotCorrect;
    const need = match.neededCorrect;
    let cleared = false;
    let roundCleared = false;
    if (match.gotCorrect >= match.neededCorrect) {
        const before = match.roundsCompleted;
        clearRound(match, now);
        cleared = true;
        roundCleared = match.roundsCompleted > before;
    }
    if (now >= match.endsAt) finishTideMatch(match, now, 'clock');
    return {
        cleared,
        result: {
            ...resultBase(match),
            correct: true,
            accepted: true,
            gotCorrect: cleared ? need : got,
            cleared,
            roundCleared,
        },
    };
}

export function renameTidePlayer(match, playerId, nickname) {
    const ps = match.players?.[playerId];
    if (ps && nickname) ps.nickname = String(nickname);
}

export function tidePublicView(match, { now = Date.now() } = {}) {
    if (!match) return null;
    const remainingMs = Math.max(0, match.endsAt - now);
    const totalMs = match.gameMinutes * 60_000;
    const clockRatio = Math.min(1, Math.max(0, 1 - remainingMs / totalMs));
    const tideRatio = match.finished && match.endReason === 'tide' ? 1 : tideRatioNow(match, now);
    const cfg = roundConfig(match.gameMinutes, match.round, playerCount(match));
    const tideRunning = match.tide.runningSince != null && !match.finished;
    const elapsed = Math.min(match.tide.limitMs, tideElapsed(match, now));
    const roundResults = match.roundResults.map((r, i) => (i + 1 === match.round && !match.finished && r === 'pending' ? 'current' : r));

    return {
        gameFormat: TIDE_FORMAT,
        tide: true,
        phase: match.phase,
        phaseEndsAt: match.phaseEndsAt,
        endsAt: match.endsAt,
        remainingMs,
        clockRatio,
        tideRatio, // ROUND tide (0..1)
        tideLimitMs: match.tide.limitMs,
        tideElapsedMs: elapsed,
        tideRemainingMs: Math.max(0, match.tide.limitMs - elapsed),
        tideRunning,
        waveSeconds: cfg.waveSeconds,
        bridgeRatio: match.spansInRound ? Math.min(1, match.spanIndex / match.spansInRound) : 0,
        // round / bridge
        round: match.round,
        rounds: ROUND_COUNT,
        roundName: cfg.name,
        roundBridge: cfg.bridge,
        roundTheme: cfg.theme,
        roundPace: cfg.pace,
        roundIndex: match.roundIndex,
        roundsCompleted: match.roundsCompleted,
        roundResults,
        failedRound: match.failedRound,
        endReason: match.endReason,
        spansInRound: match.spansInRound,
        spanIndex: match.spanIndex, // spans cleared in this round
        spanNumber: Math.min(match.spansInRound, match.spanIndex + 1),
        hasShore: match.hasShore,
        shoreAfter: match.shoreAfter,
        shoreDone: match.shoreDone,
        totalSpans: totalSpans(match.gameMinutes),
        cleared: match.spansLaid, // spans laid in the whole match
        spansLaid: match.spansLaid,
        transition: match.transition ? { ...match.transition } : null,
        // shared counter
        gotCorrect: match.gotCorrect,
        neededCorrect: match.neededCorrect,
        gameMinutes: match.gameMinutes,
        finished: match.finished,
        tier: match.tier,
        breakerPrompt: match.phase === 'breaker' && match.breaker ? match.breaker.prompt : null,
        players: match.playerOrder.map((id) => {
            const p = match.players[id];
            return {
                id,
                nickname: p?.nickname || 'Player',
                correctTotal: p?.correctTotal || 0,
                locked: Boolean(p?.locked),
                contributed: match.correctPlayerIds.has(id),
            };
        }),
    };
}

export function tideWinners(match) {
    const tier = match.tier || tideTier(match.roundsCompleted);
    const ranking = match.playerOrder
        .map((id) => {
            const p = match.players[id];
            return { id, nickname: p?.nickname || 'Player', correct: p?.correctTotal || 0 };
        })
        .sort((a, b) => b.correct - a.correct || String(a.nickname).localeCompare(String(b.nickname)));
    return {
        winnerId: null,
        winnerNickname: tier.title,
        coop: true,
        tier,
        cleared: match.spansLaid,
        roundsCompleted: match.roundsCompleted,
        failedRound: match.failedRound,
        endReason: match.endReason,
        totalSpans: totalSpans(match.gameMinutes),
        players: ranking.map((row, i) => ({ ...row, rank: i + 1, progress: row.correct })),
    };
}

export function finishTideEarly(match) {
    return finishTideMatch(match, Date.now(), 'host');
}

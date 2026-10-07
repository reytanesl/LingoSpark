/**
 * Lucky Lanterns — round scoring and match flow for Live Spark.
 *
 * Individual players answer a shared question, then (if correct) pick a lantern.
 * No-pick and wrong answers score 0 for the round. Scores never go below 0.
 *
 * Lanterns (base = 100):
 * - safe:    +100
 * - risk:    coin flip, +200 or +0. A shield turns a bust into +100 and is used up.
 * - mystery: one card from MYSTERY_POOL (weights are configurable)
 * - allin:   final round only. Coin flip: double your score, or drop it to 0.
 *            A shield keeps the score instead of zeroing it, and is used up.
 *
 * Mystery cards:
 * - plus150 / plus50: flat bonuses
 * - steal100: take up to 100 from the player directly above (by current rank).
 *   A shield on that player blocks it (they keep the points, shield is used,
 *   the thief gets +50). If nobody is above, or they have 0, the thief gets +50.
 * - swapLeader: trade scores with the leader. Only one swap lands per round;
 *   extra swap cards, or a swap when you already lead, become +100.
 * - shield: immune to the next bust (risk 0 or ALL IN 0) and the next steal.
 *
 * ALL IN locks that player's score out of steals and swaps, so the bet is the
 * score they chose to risk. A shield earned this round protects later rounds,
 * not the card that granted it.
 *
 * Challenge timing (callers): the pick timer does not start while a typed
 * answer is still on the Challenge / Continue prompt or waiting for the host.
 * That way a review never eats the pick window.
 */

import { buildChoices, matchesTermAnswer, sanitizeAnswerText } from './vocab-quiz-utils.js';

export const LANTERN_BASE = 100;
export const LANTERN_DEFAULT_ROUNDS = 10;
export const LANTERN_MIN_ROUNDS = 3;
export const LANTERN_MAX_ROUNDS = 20;
export const LANTERN_QUESTION_MS = 20_000; // default answer time; a room can override it (questionMs)
export const LANTERN_REVIEW_MS = 12_000;
export const LANTERN_PICK_MS = 12_000;
/** Pre-game how-to (lanterns + ALL IN). Host Skip ends it early. */
export const LANTERN_INTRO_MS = 14_000;
/** How long the score summary stays after the leaderboard moves. */
export const LANTERN_RESULT_HOLD_MS = 3_800;

export const LANTERN_AVATARS = ['🐼', '🐢', '🦊', '🐧', '🐰', '🐯', '🐸', '🦉', '🐨', '🦁', '🐵', '🦄', '🐻', '🐤'];

/** Weighted mystery deck. Edit weights here; they do not need to sum to 100. */
export const MYSTERY_POOL = [
    { id: 'plus150', weight: 30 },
    { id: 'plus50', weight: 25 },
    { id: 'steal100', weight: 20 },
    { id: 'shield', weight: 18 },
    { id: 'swapLeader', weight: 7 },
];

const PICKS = new Set(['safe', 'risk', 'mystery', 'allin']);

export function normalizeLanternRounds(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return LANTERN_DEFAULT_ROUNDS;
    return Math.max(LANTERN_MIN_ROUNDS, Math.min(LANTERN_MAX_ROUNDS, Math.round(n)));
}

export function clampLanternScore(value) {
    const n = Math.floor(Number(value) || 0);
    return n > 0 ? n : 0;
}

export function pickWeighted(pool, rng) {
    const items = (pool || []).filter((item) => item && item.weight > 0);
    if (!items.length) return 'plus50';
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = rng() * total;
    for (const item of items) {
        roll -= item.weight;
        if (roll < 0) return item.id;
    }
    return items[items.length - 1].id;
}

function byName(a, b) {
    return String(a.nickname || '').localeCompare(String(b.nickname || ''))
        || String(a.id).localeCompare(String(b.id));
}

function rankRows(people) {
    const sorted = [...people].sort((a, b) => b.score - a.score || byName(a, b));
    let rank = 0;
    let seen = 0;
    let prev = null;
    return sorted.map((p) => {
        seen += 1;
        if (prev == null || p.score !== prev) rank = seen;
        prev = p.score;
        return { ...p, rank };
    });
}

/** Players sitting out an ALL IN bet are not steal or swap targets. */
function boardPlayers(people, locked) {
    return people.filter((p) => !locked.has(p.id));
}

function playerAbove(people, locked, playerId) {
    const rows = rankRows(boardPlayers(people, locked));
    const idx = rows.findIndex((p) => p.id === playerId);
    if (idx <= 0) return null;
    const aboveId = rows[idx - 1].id;
    return people.find((p) => p.id === aboveId) || null;
}

function leaderAmong(people, locked, selfId) {
    const rows = rankRows(boardPlayers(people, locked).filter((p) => p.id !== selfId));
    if (!rows.length) return null;
    const self = people.find((p) => p.id === selfId);
    const top = rows[0];
    if (self && self.score > top.score) return null;
    if (self && self.score === top.score && byName(self, top) <= 0) return null;
    return people.find((p) => p.id === top.id) || null;
}

function addStep(steps, player, fields) {
    steps.push({
        playerId: player.id,
        nickname: player.nickname,
        scoreAfter: player.score,
        shieldAfter: player.shield,
        savedByShield: false,
        delta: 0,
        sub: 0,
        ...fields,
    });
}

/**
 * Resolve one round of lantern picks.
 * @param {Array<{id, nickname, score, shield, eligible, pick}>} players
 * @param {{ rng?: () => number, pool?: Array<{id: string, weight: number}>, base?: number }} [options]
 */
export function resolveLanternRound(players, options = {}) {
    const rng = options.rng || Math.random;
    const pool = options.pool || MYSTERY_POOL;
    const base = options.base ?? LANTERN_BASE;

    const people = (players || []).map((p) => ({
        id: String(p.id),
        nickname: String(p.nickname || 'Player'),
        score: clampLanternScore(p.score),
        shield: Boolean(p.shield),
        eligible: Boolean(p.eligible),
        pick: PICKS.has(p.pick) && p.eligible ? p.pick : null,
        outcome: !p.eligible ? 'wrong' : (PICKS.has(p.pick) ? 'played' : 'nopick'),
    }));

    const locked = new Set(people.filter((p) => p.pick === 'allin').map((p) => p.id));
    const order = [...people].sort(byName);
    const rolls = new Map();

    for (const p of order) {
        if (!p.pick) {
            rolls.set(p.id, { kind: 'none' });
            continue;
        }
        if (p.pick === 'safe') rolls.set(p.id, { kind: 'safe' });
        else if (p.pick === 'risk') rolls.set(p.id, { kind: 'risk', win: rng() < 0.5 });
        else if (p.pick === 'allin') rolls.set(p.id, { kind: 'allin', win: rng() < 0.5 });
        else rolls.set(p.id, { kind: 'mystery', card: pickWeighted(pool, rng) });
    }

    const steps = [];
    let swapUsed = false;

    for (const p of order) {
        if (rolls.get(p.id)?.card !== 'swapLeader') continue;
        const scoreBefore = p.score;
        if (swapUsed) {
            p.score = clampLanternScore(p.score + base);
            addStep(steps, p, {
                group: 'mystery', sub: 2, pick: 'mystery', card: 'swapLeader', tone: 'neutral',
                title: '+100', detail: 'Another swap already happened, so this one pays +100.',
                delta: p.score - scoreBefore, scoreBefore,
            });
            continue;
        }
        const leader = leaderAmong(people, locked, p.id);
        if (!leader) {
            p.score = clampLanternScore(p.score + base);
            swapUsed = true;
            addStep(steps, p, {
                group: 'mystery', sub: 2, pick: 'mystery', card: 'swapLeader', tone: 'neutral',
                title: '+100', detail: 'You already lead, so the swap becomes +100.',
                delta: p.score - scoreBefore, scoreBefore,
            });
            continue;
        }
        const leaderBefore = leader.score;
        const mine = p.score;
        p.score = leaderBefore;
        leader.score = mine;
        swapUsed = true;
        addStep(steps, p, {
            group: 'mystery', sub: 0, pick: 'mystery', card: 'swapLeader', tone: 'magic',
            title: 'Swap!', detail: `Swapped scores with ${leader.nickname}.`,
            delta: p.score - mine, scoreBefore: mine,
            otherId: leader.id, otherNickname: leader.nickname,
            otherScoreBefore: leaderBefore, otherScoreAfter: leader.score,
        });
    }

    for (const p of order) {
        if (rolls.get(p.id)?.card !== 'steal100') continue;
        const scoreBefore = p.score;
        const above = playerAbove(people, locked, p.id);
        if (!above) {
            p.score = clampLanternScore(p.score + 50);
            addStep(steps, p, {
                group: 'mystery', sub: 1, pick: 'mystery', card: 'steal100', tone: 'neutral',
                title: '+50', detail: 'Nobody is above you, so the steal pays +50.',
                delta: p.score - scoreBefore, scoreBefore,
            });
            continue;
        }
        if (above.shield) {
            above.shield = false;
            p.score = clampLanternScore(p.score + 50);
            addStep(steps, p, {
                group: 'mystery', sub: 1, pick: 'mystery', card: 'steal100', tone: 'neutral',
                title: 'Blocked', detail: `${above.nickname}'s shield blocked the steal. You get +50.`,
                delta: p.score - scoreBefore, scoreBefore,
                otherId: above.id, otherNickname: above.nickname, blocked: true,
            });
            continue;
        }
        const taken = Math.min(100, above.score);
        if (taken <= 0) {
            p.score = clampLanternScore(p.score + 50);
            addStep(steps, p, {
                group: 'mystery', sub: 1, pick: 'mystery', card: 'steal100', tone: 'neutral',
                title: '+50', detail: `${above.nickname} had no points to take, so you get +50.`,
                delta: p.score - scoreBefore, scoreBefore,
                otherId: above.id, otherNickname: above.nickname, stolen: 0,
            });
            continue;
        }
        const aboveBefore = above.score;
        above.score = clampLanternScore(above.score - taken);
        p.score = clampLanternScore(p.score + taken);
        addStep(steps, p, {
            group: 'mystery', sub: 1, pick: 'mystery', card: 'steal100', tone: 'magic',
            title: `+${taken}`, detail: `Took ${taken} from ${above.nickname}.`,
            delta: taken, scoreBefore,
            otherId: above.id, otherNickname: above.nickname,
            otherScoreBefore: aboveBefore, otherScoreAfter: above.score, stolen: taken,
        });
    }

    for (const p of order) {
        if (rolls.get(p.id)?.kind !== 'safe') continue;
        const scoreBefore = p.score;
        p.score = clampLanternScore(p.score + base);
        addStep(steps, p, {
            group: 'safe', pick: 'safe', tone: 'win', title: `+${base}`,
            detail: `Safe lantern. +${base}.`, delta: base, scoreBefore,
        });
    }

    for (const p of order) {
        const roll = rolls.get(p.id);
        if (roll?.kind !== 'risk') continue;
        const scoreBefore = p.score;
        if (roll.win) {
            p.score = clampLanternScore(p.score + base * 2);
            addStep(steps, p, {
                group: 'risk', pick: 'risk', tone: 'win', title: `+${base * 2}`,
                detail: `The coin landed double. +${base * 2}.`, delta: base * 2, scoreBefore, coin: 'double',
            });
        } else if (p.shield) {
            p.shield = false;
            p.score = clampLanternScore(p.score + base);
            addStep(steps, p, {
                group: 'risk', pick: 'risk', tone: 'neutral', title: `+${base}`,
                detail: `Bust! Your shield turned it into +${base}.`, delta: base, scoreBefore,
                coin: 'bust', savedByShield: true,
            });
        } else {
            addStep(steps, p, {
                group: 'risk', pick: 'risk', tone: 'bust', title: '0',
                detail: 'The coin landed on 0.', delta: 0, scoreBefore, coin: 'bust',
            });
        }
    }

    for (const p of order) {
        const card = rolls.get(p.id)?.card;
        const scoreBefore = p.score;
        if (card === 'plus150') {
            p.score = clampLanternScore(p.score + 150);
            addStep(steps, p, {
                group: 'mystery', sub: 2, pick: 'mystery', card, tone: 'win', title: '+150',
                detail: 'Mystery bonus. +150.', delta: 150, scoreBefore,
            });
        } else if (card === 'plus50') {
            p.score = clampLanternScore(p.score + 50);
            addStep(steps, p, {
                group: 'mystery', sub: 2, pick: 'mystery', card, tone: 'neutral', title: '+50',
                detail: 'Mystery bonus. +50.', delta: 50, scoreBefore,
            });
        } else if (card === 'shield') {
            const had = p.shield;
            p.shield = true;
            addStep(steps, p, {
                group: 'mystery', sub: 2, pick: 'mystery', card, tone: 'magic', title: 'Shield',
                detail: had
                    ? 'Your shield is refreshed for the next bust.'
                    : 'Shield! The next bust or steal cannot hurt you.',
                delta: 0, scoreBefore,
            });
        }
    }

    for (const p of order) {
        const roll = rolls.get(p.id);
        if (roll?.kind !== 'allin') continue;
        const scoreBefore = p.score;
        if (roll.win) {
            p.score = clampLanternScore(scoreBefore * 2);
            addStep(steps, p, {
                group: 'allin', pick: 'allin', tone: 'win', title: 'x2',
                detail: `ALL IN doubled ${scoreBefore} to ${p.score}.`,
                delta: p.score - scoreBefore, scoreBefore, coin: 'double',
            });
        } else if (p.shield) {
            p.shield = false;
            addStep(steps, p, {
                group: 'allin', pick: 'allin', tone: 'neutral', title: 'Saved',
                detail: 'ALL IN busted, but your shield kept your score.',
                delta: 0, scoreBefore, coin: 'bust', savedByShield: true,
            });
        } else {
            p.score = 0;
            addStep(steps, p, {
                group: 'allin', pick: 'allin', tone: 'bust', title: '0',
                detail: `ALL IN busted. ${scoreBefore} points are gone.`,
                delta: -scoreBefore, scoreBefore, coin: 'bust',
            });
        }
    }

    const groupOrder = { safe: 0, risk: 1, mystery: 2, allin: 3 };
    steps.sort((a, b) => (groupOrder[a.group] - groupOrder[b.group]) || (a.sub - b.sub) || byName(a, b));

    const beats = buildRevealBeats(steps);
    const leaderboard = rankRows(people.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        shield: p.shield,
        pick: p.pick,
        outcome: p.outcome,
    })));

    return { players: leaderboard, steps, beats, holdMs: beats.holdMs, leaderboard };
}

/** Timing shared by the server hold and the host animation. */
export function buildRevealBeats(steps) {
    const list = steps || [];
    const beats = [];
    let at = 500;
    const safes = list.filter((s) => s.group === 'safe');
    const rest = list.filter((s) => s.group !== 'safe');
    if (safes.length) {
        beats.push({ at, sfx: 'safe', stepIndexes: safes.map((s) => list.indexOf(s)) });
        at += 1500;
    }
    for (const step of rest) {
        const sfx = step.group === 'risk'
            ? (step.coin === 'bust' && !step.savedByShield ? 'bust' : 'coin')
            : step.group === 'allin'
                ? 'drumroll'
                : 'mystery';
        beats.push({ at, sfx, stepIndexes: [list.indexOf(step)] });
        at += step.group === 'allin' ? 2800 : 1700;
    }
    // Leaderboard / personal result appear shortly after the last beat, then linger
    // so players can read their points before the next round.
    const leadIn = 200;
    const holdMs = list.length ? at + leadIn + LANTERN_RESULT_HOLD_MS : 2_400 + LANTERN_RESULT_HOLD_MS;
    return { beats, holdMs, leaderboardAt: Math.max(0, holdMs - LANTERN_RESULT_HOLD_MS) };
}

export function personalLanternResult(resolved, playerId) {
    const id = String(playerId);
    const row = (resolved?.leaderboard || []).find((p) => p.id === id);
    const step = (resolved?.steps || []).find((s) => s.playerId === id);
    if (step) {
        return {
            ...step,
            rank: row?.rank ?? null,
            finalScore: row?.score ?? step.scoreAfter,
        };
    }
    const outcome = row?.outcome || 'wrong';
    return {
        playerId: id,
        nickname: row?.nickname || '',
        group: 'none',
        tone: 'neutral',
        title: '0',
        detail: outcome === 'nopick'
            ? 'No lantern picked in time — 0 points this round.'
            : 'No lantern this round.',
        delta: 0,
        rank: row?.rank ?? null,
        finalScore: row?.score ?? 0,
        outcome,
    };
}

function resolveInputMode(answerMode, rng) {
    if (answerMode === 'recognise') return 'choice';
    if (answerMode === 'realise') return 'typed';
    return rng() < 0.5 ? 'choice' : 'typed';
}

function blankAnswer() {
    return { submitted: false, correct: false, eligible: false, answerText: '', decision: null };
}

function beginRound(match, now) {
    match.phase = 'question';
    match.questionId += 1;
    match.reveal = null;
    match.picks = {};
    match.answers = {};
    match.isFinal = match.roundIndex >= match.rounds - 1;
    for (const id of match.playerOrder) match.answers[id] = blankAnswer();
    const entry = match.deck[match.cursor % match.deck.length];
    match.cursor += 1;
    match.entry = { term: entry.term, definition: entry.definition };
    match.inputMode = resolveInputMode(match.answerMode, match.rng);
    match.choices = match.inputMode === 'choice'
        ? buildChoices(entry.term, match.deck.map((d) => d.term), match.level)
        : null;
    match.phaseEndsAt = now + (match.questionMs || LANTERN_QUESTION_MS);
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

function startPicking(match, now) {
    match.phase = 'picking';
    match.phaseEndsAt = now + LANTERN_PICK_MS;
    match.picks = {};
    return 'picking';
}

function syncPhase(match, now) {
    if (match.phase !== 'question' && match.phase !== 'review') return match.phase;
    if (match.phase === 'question' && !allSubmitted(match)) return 'question';
    if (openPrompt(match) || openPending(match)) {
        const entered = match.phase !== 'review';
        match.phase = 'review';
        if (openPrompt(match)) {
            if (entered || match.phaseEndsAt == null) match.phaseEndsAt = now + LANTERN_REVIEW_MS;
        } else {
            match.phaseEndsAt = null;
        }
        return 'review';
    }
    return startPicking(match, now);
}

export function createLanternMatch({
    players,
    deck,
    rounds = LANTERN_DEFAULT_ROUNDS,
    answerMode = 'randomise',
    level = 'intermediate',
    questionMs = LANTERN_QUESTION_MS,
    introMs = LANTERN_INTRO_MS,
    now = Date.now(),
    rng = Math.random,
}) {
    const list = (players || []).map((p) => ({ id: String(p.id), nickname: String(p.nickname || 'Player') }));
    if (list.length < 2) throw new Error('At least 2 players are required.');
    if (!Array.isArray(deck) || deck.length < 1) throw new Error('No words in this list.');
    const mode = ['recognise', 'realise', 'randomise'].includes(answerMode) ? answerMode : 'randomise';
    const match = {
        rounds: normalizeLanternRounds(rounds),
        roundIndex: 0,
        phase: 'intro',
        questionId: 0,
        cursor: 0,
        deck,
        answerMode: mode,
        level: level || 'intermediate',
        questionMs: Number(questionMs) > 0 ? Math.round(Number(questionMs)) : LANTERN_QUESTION_MS,
        phaseEndsAt: null,
        reveal: null,
        revealSeq: 0,
        isFinal: false,
        playerOrder: list.map((p) => p.id),
        nicknames: {},
        avatars: {},
        scores: {},
        shields: {},
        answers: {},
        picks: {},
        entry: null,
        inputMode: 'typed',
        choices: null,
        rng,
    };
    list.forEach((p, i) => {
        match.nicknames[p.id] = p.nickname;
        match.avatars[p.id] = LANTERN_AVATARS[i % LANTERN_AVATARS.length];
        match.scores[p.id] = 0;
        match.shields[p.id] = false;
    });
    const intro = Number(introMs);
    if (intro > 0) {
        match.phase = 'intro';
        match.phaseEndsAt = now + Math.round(intro);
    } else {
        beginRound(match, now);
    }
    return match;
}

export function renameLanternPlayer(match, playerId, nickname) {
    if (!match || nickname == null) return;
    const id = String(playerId);
    if (!match.nicknames[id]) return;
    match.nicknames[id] = String(nickname);
}

function resultPayload(match, playerId, answer) {
    const row = leaderboardRows(match).find((p) => p.id === String(playerId));
    return {
        correct: Boolean(answer.correct),
        reset: false,
        challengeable: answer.decision === 'prompt',
        progress: match.scores[playerId] || 0,
        won: false,
        correctTerm: match.entry?.term || '',
        answerText: answer.answerText || '',
        definition: match.entry?.definition || '',
        gameFormat: 'lucky-lanterns',
        lantern: true,
        eligible: Boolean(answer.eligible),
        questionId: match.questionId,
        round: match.roundIndex + 1,
        rounds: match.rounds,
        rank: row?.rank ?? null,
    };
}

export function submitLanternAnswer(match, playerId, rawText, now = Date.now()) {
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
    if (correct) {
        answer.eligible = true;
        answer.decision = 'correct';
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

export function markLanternChallengePending(match, playerId, now = Date.now()) {
    const answer = match?.answers?.[String(playerId)];
    if (!answer || answer.decision !== 'prompt') throw new Error('There is no answer to challenge.');
    answer.decision = 'pending';
    return syncPhase(match, now);
}

export function settleLanternChallenge(match, playerId, accept, now = Date.now()) {
    const answer = match?.answers?.[String(playerId)];
    if (!answer || answer.decision !== 'pending') throw new Error('Challenge state mismatch.');
    if (accept) {
        answer.decision = 'accepted';
        answer.eligible = true;
        answer.correct = true;
    } else {
        answer.decision = 'declined';
        answer.eligible = false;
        answer.correct = false;
    }
    const phase = syncPhase(match, now);
    return { phase, result: { ...resultPayload(match, String(playerId), answer), challengeAccepted: Boolean(accept), challengeDeclined: !accept } };
}

export function skipLanternPrompt(match, playerId, now = Date.now()) {
    const answer = match?.answers?.[String(playerId)];
    if (!answer || answer.decision !== 'prompt') throw new Error('No pending answer.');
    if (answer.decision === 'pending') throw new Error('Waiting for teacher review.');
    answer.decision = 'skipped';
    answer.eligible = false;
    const phase = syncPhase(match, now);
    return { phase, result: { ...resultPayload(match, String(playerId), answer), challengeDeclined: true } };
}

export function closeLanternAnswering(match, now = Date.now()) {
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

export function expireLanternReview(match, now = Date.now()) {
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
        match.phaseEndsAt = null;
        return { phase: 'review', skipped };
    }
    return { phase: startPicking(match, now), skipped };
}

export function forceLanternReview(match, now = Date.now()) {
    if (!match) throw new Error('No lantern match.');
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
    startPicking(match, now);
    return { phase: 'picking', declined, skipped };
}

export function pickLantern(match, playerId, choice, now = Date.now()) {
    if (!match || match.phase !== 'picking') throw new Error('Lantern picking is not open.');
    const id = String(playerId);
    const answer = match.answers[id];
    if (!answer?.eligible) throw new Error('Only a correct answer earns a lantern.');
    const c = String(choice || '').toLowerCase();
    const allowed = match.isFinal ? ['safe', 'risk', 'mystery', 'allin'] : ['safe', 'risk', 'mystery'];
    if (!allowed.includes(c)) throw new Error('Choose a lantern.');
    match.picks[id] = c;
    const ready = match.playerOrder.every((pid) => !match.answers[pid].eligible || match.picks[pid]);
    if (ready) return closeLanternPicks(match, now);
    return 'picking';
}

export function closeLanternPicks(match, now = Date.now()) {
    if (!match || (match.phase !== 'picking' && match.phase !== 'reveal')) {
        throw new Error('Picking is not open.');
    }
    if (match.phase === 'reveal') return 'reveal';
    const entering = match.playerOrder.map((id) => ({
        id,
        nickname: match.nicknames[id],
        score: match.scores[id] || 0,
        shield: Boolean(match.shields[id]),
        eligible: Boolean(match.answers[id]?.eligible),
        pick: match.picks[id] || null,
    }));
    const resolved = resolveLanternRound(entering, { rng: match.rng });
    for (const row of resolved.leaderboard) {
        match.scores[row.id] = row.score;
        match.shields[row.id] = row.shield;
    }
    match.revealSeq += 1;
    match.reveal = {
        seq: match.revealSeq,
        steps: resolved.steps,
        beats: resolved.beats.beats,
        holdMs: resolved.holdMs,
        leaderboardAt: resolved.beats.leaderboardAt,
        entering,
        answerTerm: match.entry?.term || '',
        definition: match.entry?.definition || '',
    };
    match.phase = 'reveal';
    match.phaseEndsAt = now + resolved.holdMs;
    return 'reveal';
}

export function advanceLantern(match, now = Date.now()) {
    if (!match) return null;
    if (match.phase === 'intro') {
        beginRound(match, now);
        return 'question';
    }
    if (match.phase !== 'reveal') return match.phase;
    if (match.roundIndex >= match.rounds - 1) {
        match.phase = 'finished';
        match.phaseEndsAt = null;
        return 'finished';
    }
    match.roundIndex += 1;
    beginRound(match, now);
    return 'question';
}

export function finishLanternEarly(match) {
    if (!match) return;
    match.phase = 'finished';
    match.phaseEndsAt = null;
}

export function leaderboardRows(match) {
    if (!match) return [];
    return rankRows(match.playerOrder.map((id) => ({
        id,
        nickname: match.nicknames[id],
        score: match.scores[id] || 0,
        shield: Boolean(match.shields[id]),
        avatar: match.avatars[id] || '🏮',
    })));
}

export function lanternWinners(match) {
    const rows = leaderboardRows(match);
    if (!rows.length) {
        return { winnerId: null, winnerNickname: null, tiedIds: [], players: [] };
    }
    const top = rows[0].score;
    const tied = rows.filter((row) => row.score === top);
    const winnerNickname = tied.length > 1
        ? (top === 0 ? 'It\'s a tie' : tied.map((row) => row.nickname).join(' & '))
        : tied[0].nickname;
    return {
        winnerId: tied[0].id,
        winnerNickname,
        tiedIds: tied.map((row) => row.id),
        players: rows,
    };
}

function statusFor(match, id) {
    const answer = match.answers[id];
    const decision = answer?.decision;
    if (!answer?.submitted) return 'answering';
    if (decision === 'prompt') return 'deciding';
    if (decision === 'pending') return 'challenging';
    if (answer.eligible && match.picks[id]) return 'picked';
    if (answer.eligible && match.phase === 'picking') return 'picking';
    if (answer.eligible) return 'ready';
    return 'out';
}

export function lanternQuestionPayload(match) {
    if (!match || match.phase !== 'question') return null;
    return {
        progress: 0,
        termsToWin: match.rounds,
        termIndex: match.roundIndex,
        questionId: match.questionId,
        definition: match.entry.definition,
        inputMode: match.inputMode,
        answerMode: match.answerMode,
        gameFormat: 'lucky-lanterns',
        caseSensitive: false,
        round: match.roundIndex + 1,
        rounds: match.rounds,
        endsAt: match.phaseEndsAt,
        timeLimitSec: Math.round((match.questionMs || LANTERN_QUESTION_MS) / 1000),
        isFinal: Boolean(match.isFinal),
        ...(match.inputMode === 'choice' ? { choices: match.choices } : {}),
    };
}

export function lanternPublicView(match, { playerId = null, forHost = false, connected = null } = {}) {
    if (!match) return null;
    const finalBoard = leaderboardRows(match).map((row) => ({
        ...row,
        connected: connected ? connected[row.id] !== false : true,
        eligible: Boolean(match.answers[row.id]?.eligible),
        picked: Boolean(match.picks[row.id]),
        status: statusFor(match, row.id),
    }));
    const enteringScores = new Map((match.reveal?.entering || []).map((row) => [row.id, row.score]));
    const showEntering = match.phase === 'reveal' && enteringScores.size > 0;
    const leaderboard = finalBoard.map((row) => (
        showEntering ? { ...row, score: enteringScores.has(row.id) ? enteringScores.get(row.id) : row.score, finalScore: row.score } : row
    ));
    if (showEntering) {
        const reranked = rankRows(leaderboard);
        for (const row of leaderboard) {
            const ranked = reranked.find((item) => item.id === row.id);
            row.rank = ranked?.rank ?? row.rank;
        }
        leaderboard.sort((a, b) => a.rank - b.rank || byName(a, b));
    }

    const answeredCount = match.playerOrder.filter((id) => match.answers[id]?.submitted).length;
    const correctCount = match.playerOrder.filter((id) => match.answers[id]?.eligible).length;
    const view = {
        gameFormat: 'lucky-lanterns',
        phase: match.phase,
        round: match.roundIndex + 1,
        rounds: match.rounds,
        isFinal: Boolean(match.isFinal),
        phaseEndsAt: match.phaseEndsAt,
        questionMs: match.questionMs || LANTERN_QUESTION_MS,
        questionId: match.questionId,
        inputMode: match.inputMode,
        // Same options every phone already gets; lets the projector draw the answer tiles.
        choices: match.inputMode === 'choice' && Array.isArray(match.choices) ? [...match.choices] : null,
        definition: match.phase === 'finished' ? (match.entry?.definition || '') : (match.entry?.definition || ''),
        answeredCount,
        playerCount: match.playerOrder.length,
        correctCount: (forHost || match.phase !== 'question') ? correctCount : null,
        leaderboard,
        finalLeaderboard: showEntering ? finalBoard : null,
        pickedIds: Object.keys(match.picks || {}),
        reveal: (match.phase === 'reveal' || match.phase === 'finished') && match.reveal
            ? {
                seq: match.reveal.seq,
                steps: match.reveal.steps,
                beats: match.reveal.beats,
                holdMs: match.reveal.holdMs,
                leaderboardAt: match.reveal.leaderboardAt,
                answerTerm: match.reveal.answerTerm,
                definition: match.reveal.definition,
            }
            : null,
        you: null,
    };
    if (forHost && match.phase !== 'reveal' && match.phase !== 'finished') {
        view.correctTerm = match.entry?.term || '';
    }
    if (playerId != null && match.answers[String(playerId)]) {
        const id = String(playerId);
        const row = finalBoard.find((item) => item.id === id);
        const shown = leaderboard.find((item) => item.id === id);
        const result = (match.phase === 'reveal' || match.phase === 'finished') && match.reveal
            ? personalLanternResult({ leaderboard: finalBoard, steps: match.reveal.steps }, id)
            : null;
        view.you = {
            id,
            score: shown?.score ?? 0,
            finalScore: row?.score ?? 0,
            rank: shown?.rank ?? row?.rank ?? null,
            finalRank: row?.rank ?? null,
            shield: Boolean(match.shields[id]),
            eligible: Boolean(match.answers[id]?.eligible),
            pick: match.picks[id] || null,
            decision: match.answers[id]?.decision || null,
            status: statusFor(match, id),
            result,
        };
    }
    return view;
}

export function hostSkipLantern(match, now = Date.now()) {
    if (!match) throw new Error('No lantern match.');
    if (match.phase === 'intro') return { phase: advanceLantern(match, now), declined: [], skipped: [] };
    if (match.phase === 'question') return { phase: closeLanternAnswering(match, now), declined: [], skipped: [] };
    if (match.phase === 'review') return forceLanternReview(match, now);
    if (match.phase === 'picking') return { phase: closeLanternPicks(match, now), declined: [], skipped: [] };
    if (match.phase === 'reveal') return { phase: advanceLantern(match, now), declined: [], skipped: [] };
    return { phase: match.phase, declined: [], skipped: [] };
}

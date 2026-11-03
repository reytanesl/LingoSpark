/**
 * Stamp Rush — Live Spark race: shared 12-stamp vocab tray, 12 personal cloze rounds,
 * speed-scaled points, host postcard piles.
 */

import { matchesTermAnswer, sanitizeAnswerText } from './vocab-quiz-utils.js';

export const STAMP_FORMAT = 'stamp-rush';
export const STAMP_BOX_SIZE = 12;
export const STAMP_ROUNDS = 12;
export const STAMP_BASE_POINTS = 100;
export const STAMP_STREAK_BONUS = 10;
/** Speed tiers: answer within these ms → multiplier on base points. */
export const STAMP_SPEED_TIERS = [
    { withinMs: 3_000, mult: 1.5 },
    { withinMs: 6_000, mult: 1.25 },
    { withinMs: 12_000, mult: 1.0 },
];
export const STAMP_SLOW_MULT = 0.75;
export const STAMP_MIN_PLAYERS = 1;

function mulberry32(a) {
    return function rng() {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function normalizeDeck(deck) {
    const out = [];
    const seen = new Set();
    for (const raw of deck || []) {
        const term = String(raw?.term || '').trim();
        const definition = String(raw?.definition || '').trim();
        if (!term || !definition) continue;
        const key = term.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ term, definition });
    }
    return out;
}

function pickInputMode(answerMode, rng) {
    const mode = String(answerMode || 'recognise');
    if (mode === 'realise') return 'typed';
    if (mode === 'recognise') return 'choice';
    return rng() < 0.5 ? 'typed' : 'choice';
}

/** Postcard cloze frames — blank is always the target term; hint is the definition. */
const CLOZE_FRAMES = [
    (hint) => ({ lead: 'Dear friend,', body: `I wanted to tell you about _____.`, hint }),
    (hint) => ({ lead: 'Quick note!', body: `Don't forget about _____ today.`, hint }),
    (hint) => ({ lead: 'Class postcard', body: `Today we practised _____.`, hint }),
    (hint) => ({ lead: 'Hello!', body: `Can you explain _____ to me?`, hint }),
    (hint) => ({ lead: 'Hi there,', body: `I'm still learning _____.`, hint }),
    (hint) => ({ lead: 'Memo', body: `Please stamp _____ on this card.`, hint }),
    (hint) => ({ lead: 'Travel note', body: `We talked about _____ on the way.`, hint }),
    (hint) => ({ lead: 'Reminder', body: `Use _____ in your next sentence.`, hint }),
];

function buildCloze(entry, frameIndex) {
    const frame = CLOZE_FRAMES[frameIndex % CLOZE_FRAMES.length](entry.definition);
    return {
        lead: frame.lead,
        body: frame.body,
        hint: frame.hint,
        prompt: `${frame.lead}\n\n${frame.body}`,
        answer: entry.term,
    };
}

function speedMult(elapsedMs) {
    const ms = Math.max(0, Number(elapsedMs) || 0);
    for (const t of STAMP_SPEED_TIERS) {
        if (ms <= t.withinMs) return t.mult;
    }
    return STAMP_SLOW_MULT;
}

function scoreCorrect(elapsedMs, streak) {
    const mult = speedMult(elapsedMs);
    const base = Math.round(STAMP_BASE_POINTS * mult);
    const streakBonus = Math.max(0, (streak - 1)) * STAMP_STREAK_BONUS;
    return { points: base + streakBonus, mult, base, streakBonus };
}

function dealPlayerQueue(box, rng) {
    // Unique order of the 12 stamps + rotating cloze frames per round.
    const order = shuffle(box.map((_, i) => i), rng);
    const frameOffset = Math.floor(rng() * CLOZE_FRAMES.length);
    return order.map((boxIndex, round) => {
        const entry = box[boxIndex];
        const cloze = buildCloze(entry, frameOffset + round);
        return {
            round: round + 1,
            boxIndex,
            term: entry.term,
            definition: entry.definition,
            ...cloze,
        };
    });
}

function qid(rng) {
    return `sr-${Math.floor(rng() * 1e9).toString(36)}`;
}

function advancePlayerQuestion(match, playerId, now) {
    const p = match.players[playerId];
    if (!p || p.finished) return null;
    const next = p.queue[p.roundIndex];
    if (!next) {
        p.finished = true;
        p.locked = true;
        p.current = null;
        return null;
    }
    const inputMode = pickInputMode(match.answerMode, match.rng);
    // Recognise = tap any of the shared 12 stamps (full tray). Realise = type.
    p.current = {
        questionId: qid(match.rng),
        round: next.round,
        boxIndex: next.boxIndex,
        term: next.term,
        definition: next.definition,
        lead: next.lead,
        body: next.body,
        hint: next.hint,
        prompt: next.prompt,
        answer: next.answer,
        inputMode,
        choices: inputMode === 'choice' ? match.box.map((b) => b.term) : null,
        dealtAt: now,
    };
    p.locked = false;
    return p.current;
}

/**
 * @param {{ players: {id:string,nickname:string}[], deck: any[], answerMode?: string, seed?: number }} opts
 */
export function createStampMatch(opts) {
    const playersIn = Array.isArray(opts.players) ? opts.players : [];
    if (playersIn.length < STAMP_MIN_PLAYERS) {
        throw new Error('Stamp Rush needs at least 1 player.');
    }
    const deck = normalizeDeck(opts.deck);
    if (deck.length < STAMP_BOX_SIZE) {
        throw new Error(`Stamp Rush needs at least ${STAMP_BOX_SIZE} terms.`);
    }
    const seed = Number.isFinite(opts.seed) ? Number(opts.seed) : Math.floor(Math.random() * 1e9);
    const rng = mulberry32(seed);
    const box = shuffle(deck, rng).slice(0, STAMP_BOX_SIZE);
    const now = Date.now();
    const players = {};
    const playerOrder = [];
    for (const raw of playersIn) {
        const id = String(raw.id);
        playerOrder.push(id);
        players[id] = {
            id,
            nickname: String(raw.nickname || 'Player').slice(0, 24),
            points: 0,
            stamps: 0,
            streak: 0,
            roundIndex: 0,
            finished: false,
            locked: false,
            lastGain: 0,
            lastMult: 1,
            queue: dealPlayerQueue(box, rng),
            current: null,
        };
    }
    const match = {
        format: STAMP_FORMAT,
        seed,
        rng,
        box,
        deck,
        answerMode: opts.answerMode || 'recognise',
        startedAt: now,
        finished: false,
        finishedAt: null,
        players,
        playerOrder,
    };
    for (const id of playerOrder) advancePlayerQuestion(match, id, now);
    return match;
}

export function stampQuestionPayload(match, playerId) {
    const p = match?.players?.[playerId];
    if (!p?.current || match.finished) return null;
    const c = p.current;
    return {
        stamp: true,
        gameFormat: STAMP_FORMAT,
        questionId: c.questionId,
        round: c.round,
        roundsTotal: STAMP_ROUNDS,
        lead: c.lead,
        body: c.body,
        hint: c.hint,
        prompt: c.prompt,
        definition: c.definition,
        inputMode: c.inputMode,
        answerMode: c.inputMode === 'typed' ? 'realise' : 'recognise',
        choices: c.choices || null,
        box: match.box.map((b) => b.term),
        points: p.points,
        stamps: p.stamps,
        streak: p.streak,
    };
}

export function submitStampAnswer(match, playerId, answer, questionId, now = Date.now()) {
    if (!match || match.finished) {
        return { ok: false, error: 'Stamp Rush has finished.', result: { correct: false, stamp: true, gameFormat: STAMP_FORMAT } };
    }
    const p = match.players[playerId];
    if (!p) return { ok: false, error: 'Player not found.', result: { correct: false, stamp: true } };
    if (p.finished) {
        return {
            ok: true,
            result: {
                correct: false, finished: true, stamp: true, gameFormat: STAMP_FORMAT,
                message: 'You already stamped every postcard!',
                points: p.points, stamps: p.stamps,
            },
        };
    }
    const c = p.current;
    if (!c) return { ok: false, error: 'No question.', result: { correct: false, stamp: true } };
    if (questionId && c.questionId && questionId !== c.questionId) {
        return { ok: false, error: 'That stamp card expired.', result: { correct: false, stamp: true, expired: true } };
    }
    if (p.locked) {
        return { ok: true, result: { correct: false, locked: true, stamp: true, gameFormat: STAMP_FORMAT } };
    }

    const text = sanitizeAnswerText(answer);
    const correct = matchesTermAnswer(text, c.term);
    const elapsed = Math.max(0, now - (c.dealtAt || now));

    if (!correct) {
        p.streak = 0;
        p.lastGain = 0;
        p.locked = false; // can retry same card? Plan: wrong = no gain. Allow retry same round.
        const challengeable = c.inputMode === 'typed';
        return {
            ok: true,
            result: {
                correct: false,
                stamp: true,
                gameFormat: STAMP_FORMAT,
                questionId: c.questionId,
                answer: c.term,
                message: 'Wrong stamp — try again!',
                points: p.points,
                stamps: p.stamps,
                streak: 0,
                challengeable,
                pendingChallenge: challengeable ? { entry: { term: c.term, definition: c.definition }, answerText: text } : null,
            },
            nextQuestion: false,
        };
    }

    p.streak += 1;
    const scored = scoreCorrect(elapsed, p.streak);
    p.points += scored.points;
    p.stamps += 1;
    p.lastGain = scored.points;
    p.lastMult = scored.mult;
    p.roundIndex += 1;
    p.locked = true;

    const finishedNow = p.roundIndex >= STAMP_ROUNDS;
    if (finishedNow) {
        p.finished = true;
        p.current = null;
    } else {
        advancePlayerQuestion(match, playerId, now);
    }

    const allDone = match.playerOrder.every((id) => match.players[id]?.finished);
    if (allDone) finishStampMatch(match, now);

    return {
        ok: true,
        cleared: true,
        matchFinished: match.finished,
        result: {
            correct: true,
            stamp: true,
            gameFormat: STAMP_FORMAT,
            questionId: c.questionId,
            answer: c.term,
            message: finishedNow ? 'All 12 postcards stamped!' : 'Stamped!',
            points: p.points,
            stamps: p.stamps,
            streak: p.streak,
            gain: scored.points,
            mult: scored.mult,
            finished: finishedNow,
        },
        nextQuestion: !finishedNow && !match.finished,
    };
}

export function settleStampChallenge(match, playerId, accept, now = Date.now()) {
    const p = match?.players?.[playerId];
    if (!p?.current || match.finished) {
        return { result: { correct: false, stamp: true }, cleared: false };
    }
    if (!accept) {
        return {
            result: {
                correct: false, stamp: true, gameFormat: STAMP_FORMAT,
                message: 'Teacher said not this time — try again!',
                points: p.points, stamps: p.stamps,
            },
            cleared: false,
        };
    }
    // Treat as correct with elapsed from deal.
    const out = submitStampAnswer(match, playerId, p.current.term, p.current.questionId, now);
    return { result: out.result, cleared: Boolean(out.cleared), matchFinished: out.matchFinished };
}

export function finishStampMatch(match, now = Date.now()) {
    if (!match || match.finished) return match;
    match.finished = true;
    match.finishedAt = now;
    for (const p of Object.values(match.players)) {
        p.locked = true;
    }
    return match;
}

export function finishStampEarly(match, now = Date.now()) {
    return finishStampMatch(match, now);
}

export function stampWinners(match) {
    const ranking = (match?.playerOrder || [])
        .map((id) => match.players[id])
        .filter(Boolean)
        .sort((a, b) => (b.points - a.points) || (b.stamps - a.stamps) || a.nickname.localeCompare(b.nickname))
        .map((p, i) => ({
            id: p.id,
            nickname: p.nickname,
            points: p.points,
            stamps: p.stamps,
            finished: p.finished,
            rank: i + 1,
        }));
    const top = ranking[0] || null;
    return {
        winnerId: top?.id || null,
        winnerNickname: top ? `${top.nickname} · ${top.points} pts` : 'Stamp Rush',
        ranking,
    };
}

export function renameStampPlayer(match, playerId, nickname) {
    const p = match?.players?.[playerId];
    if (p) p.nickname = String(nickname || p.nickname).slice(0, 24);
}

export function stampPublicView(match, { now = Date.now() } = {}) {
    if (!match) return null;
    const winners = stampWinners(match);
    return {
        stamp: true,
        gameFormat: STAMP_FORMAT,
        finished: Boolean(match.finished),
        startedAt: match.startedAt,
        box: match.box.map((b) => b.term),
        roundsTotal: STAMP_ROUNDS,
        players: (match.playerOrder || []).map((id) => {
            const p = match.players[id];
            return {
                id,
                nickname: p.nickname,
                points: p.points,
                stamps: p.stamps,
                streak: p.streak,
                finished: p.finished,
                lastGain: p.lastGain,
                lastMult: p.lastMult,
                round: Math.min(STAMP_ROUNDS, p.roundIndex + (p.finished ? 0 : 1)),
            };
        }),
        ranking: winners.ranking,
        winnerNickname: winners.winnerNickname,
        now,
    };
}

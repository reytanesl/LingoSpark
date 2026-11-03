/**
 * Stamp Rush — Live Spark race: shared 12-stamp vocab tray, 12 personal cloze rounds,
 * speed-scaled points, host postcard piles. Cloze text comes from AI (stamp-rush-prompts.js)
 * with local fallbacks; realise mode is word-formation (changed form).
 */

import { matchesTermAnswer, sanitizeAnswerText } from './vocab-quiz-utils.js';
import {
    fallbackRecognise,
    fallbackRealise,
    stampClozePackFromReply,
} from './stamp-rush-prompts.js';

export const STAMP_FORMAT = 'stamp-rush';
export const STAMP_BOX_SIZE = 12;
export const STAMP_ROUNDS = 12;
export const STAMP_BASE_POINTS = 100;
export const STAMP_STREAK_BONUS = 10;
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

export function normalizeStampDeck(deck) {
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

/** Pick the shared 12-stamp box (deterministic for a seed). */
export function pickStampBox(deck, seed = Math.floor(Math.random() * 1e9)) {
    const rng = mulberry32(Number(seed) || 1);
    const normalized = normalizeStampDeck(deck);
    if (normalized.length < STAMP_BOX_SIZE) {
        throw new Error(`Stamp Rush needs at least ${STAMP_BOX_SIZE} terms.`);
    }
    return { box: shuffle(normalized, rng).slice(0, STAMP_BOX_SIZE), seed: Number(seed) || 1, rng };
}

function pickInputMode(answerMode, rng) {
    const mode = String(answerMode || 'recognise');
    if (mode === 'realise') return 'typed';
    if (mode === 'recognise') return 'choice';
    return rng() < 0.5 ? 'typed' : 'choice';
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

function clozeFor(entry, clozePack, variantIndex, typed) {
    const list = clozePack?.[entry.term.toLowerCase()] || [];
    const variant = list[variantIndex % Math.max(1, list.length)] || null;
    if (typed) {
        const r = variant?.realise || fallbackRealise(entry.term, entry.definition, variantIndex);
        return {
            lead: r.lead || 'Word formation',
            body: r.body || r.sentence,
            hint: r.hint || entry.definition,
            prompt: r.prompt || r.sentence,
            sentence: r.sentence || r.body,
            cue: r.cue || entry.term.toUpperCase(),
            answer: r.answer,
            formation: true,
        };
    }
    const r = variant?.recognise || fallbackRecognise(entry.term, entry.definition, variantIndex);
    return {
        lead: r.lead || 'Postcard',
        body: r.body || r.sentence,
        hint: r.hint || entry.definition,
        prompt: r.prompt || r.sentence,
        sentence: r.sentence || r.body,
        cue: null,
        answer: entry.term,
        formation: false,
    };
}

function dealPlayerQueue(box, clozePack, rng, variantIndex) {
    const order = shuffle(box.map((_, i) => i), rng);
    return order.map((boxIndex, round) => {
        const entry = box[boxIndex];
        // Mode is chosen when dealt; store both flavours so randomise can pick per card.
        const rec = clozeFor(entry, clozePack, variantIndex, false);
        const real = clozeFor(entry, clozePack, variantIndex, true);
        return {
            round: round + 1,
            boxIndex,
            term: entry.term,
            definition: entry.definition,
            variantIndex,
            recognise: rec,
            realise: real,
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
    const card = inputMode === 'typed' ? next.realise : next.recognise;
    p.current = {
        questionId: qid(match.rng),
        round: next.round,
        boxIndex: next.boxIndex,
        term: next.term,
        definition: next.definition,
        lead: card.lead,
        body: card.body,
        hint: card.hint,
        prompt: card.prompt,
        sentence: card.sentence,
        cue: card.cue || null,
        answer: card.answer,
        formation: Boolean(card.formation),
        inputMode,
        choices: inputMode === 'choice' ? match.box.map((b) => b.term) : null,
        dealtAt: now,
    };
    p.locked = false;
    return p.current;
}

/**
 * @param {{ players: {id:string,nickname:string}[], deck?: any[], box?: any[], clozePack?: object, answerMode?: string, seed?: number }} opts
 */
export function createStampMatch(opts) {
    const playersIn = Array.isArray(opts.players) ? opts.players : [];
    if (playersIn.length < STAMP_MIN_PLAYERS) {
        throw new Error('Stamp Rush needs at least 1 player.');
    }
    let box = Array.isArray(opts.box) && opts.box.length >= STAMP_BOX_SIZE
        ? opts.box.slice(0, STAMP_BOX_SIZE)
        : null;
    const seed = Number.isFinite(opts.seed) ? Number(opts.seed) : Math.floor(Math.random() * 1e9);
    const rng = mulberry32(seed);
    if (!box) {
        const picked = pickStampBox(opts.deck, seed);
        box = picked.box;
    }
    let clozePack = opts.clozePack;
    if (!clozePack || typeof clozePack !== 'object') {
        clozePack = stampClozePackFromReply(null, box, Math.max(2, playersIn.length));
    }
    const now = Date.now();
    const players = {};
    const playerOrder = [];
    playersIn.forEach((raw, idx) => {
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
            queue: dealPlayerQueue(box, clozePack, rng, idx),
            current: null,
        };
    });
    const match = {
        format: STAMP_FORMAT,
        seed,
        rng,
        box,
        clozePack,
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
        sentence: c.sentence || c.body,
        cue: c.cue,
        formation: Boolean(c.formation),
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

function expectedAnswer(current) {
    return current?.formation ? current.answer : current?.term;
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
    const expected = expectedAnswer(c);
    // Word formation: typing the unchanged cue/base term never counts.
    if (c.formation && text && (
        text.toLowerCase() === String(c.term || '').toLowerCase()
        || text.toLowerCase() === String(c.cue || '').toLowerCase()
    )) {
        p.streak = 0;
        p.lastGain = 0;
        return {
            ok: true,
            result: {
                correct: false,
                stamp: true,
                gameFormat: STAMP_FORMAT,
                questionId: c.questionId,
                answer: expected,
                cue: c.cue,
                formation: true,
                message: 'Change the form — do not type the word as given!',
                points: p.points,
                stamps: p.stamps,
                streak: 0,
                challengeable: true,
                pendingChallenge: { entry: { term: expected, definition: c.definition }, answerText: text },
            },
            nextQuestion: false,
        };
    }

    const correct = matchesTermAnswer(text, expected);
    const elapsed = Math.max(0, now - (c.dealtAt || now));

    if (!correct) {
        p.streak = 0;
        p.lastGain = 0;
        p.locked = false;
        const challengeable = c.inputMode === 'typed';
        return {
            ok: true,
            result: {
                correct: false,
                stamp: true,
                gameFormat: STAMP_FORMAT,
                questionId: c.questionId,
                answer: expected,
                cue: c.cue,
                formation: Boolean(c.formation),
                message: c.formation ? 'Wrong form — try again!' : 'Wrong stamp — try again!',
                points: p.points,
                stamps: p.stamps,
                streak: 0,
                challengeable,
                pendingChallenge: challengeable ? { entry: { term: expected, definition: c.definition }, answerText: text } : null,
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
            answer: expected,
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
    const expected = expectedAnswer(p.current);
    const out = submitStampAnswer(match, playerId, expected, p.current.questionId, now);
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

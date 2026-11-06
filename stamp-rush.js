/**
 * Stamp Rush — Live Spark race: shared 12-stamp tray from a host-pasted list,
 * 12 personal rounds, speed-scaled points, host postcard piles.
 * Layout (one per line):
 *   2-col: answer <TAB| - | = | : > question
 *   3-col: cue <sep> answer <sep> question  → Realise becomes word formation
 * Recognise = tap stamp (answer); Realise = type answer (or changed form when cue given).
 */

import { matchesTermAnswer, sanitizeAnswerText } from './vocab-quiz-utils.js';

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
        const cueRaw = String(raw?.cue || '').trim();
        const cue = cueRaw && cueRaw.toLowerCase() !== key ? cueRaw : null;
        out.push({ term, definition, cue });
    }
    return out;
}

const STAMP_SEP = /\s*=\s*|\s*:\s*|\s+-\s+/g;

/**
 * Split one paste line into 2-col (answer, question) or 3-col (cue, answer, question).
 * Separators: tab (preferred), or spaced " - " / " = " / " : ".
 */
export function splitStampLine(line) {
    const text = String(line || '').trim();
    if (!text) return null;
    if (/\t/.test(text)) {
        const parts = text.split(/\t+/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 3) {
            return { cue: parts[0], term: parts[1], definition: parts.slice(2).join(' ') };
        }
        if (parts.length === 2) {
            return { cue: null, term: parts[0], definition: parts[1] };
        }
        return null;
    }
    const idxs = [];
    STAMP_SEP.lastIndex = 0;
    let m;
    while ((m = STAMP_SEP.exec(text))) {
        idxs.push({ start: m.index, end: m.index + m[0].length });
    }
    if (idxs.length >= 2) {
        const cue = text.slice(0, idxs[0].start).trim();
        const term = text.slice(idxs[0].end, idxs[1].start).trim();
        const definition = text.slice(idxs[1].end).trim();
        if (cue && term && definition) return { cue, term, definition };
    }
    if (idxs.length >= 1) {
        const term = text.slice(0, idxs[0].start).trim();
        const definition = text.slice(idxs[0].end).trim();
        if (term && definition) return { cue: null, term, definition };
    }
    return null;
}

/**
 * Parse host paste. Unique by answer (term).
 * Returns { term: answer, definition: question, cue: base|null }.
 */
export function parseStampQuestionList(text) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const line of lines) {
        const pair = splitStampLine(line);
        if (!pair?.term || !pair?.definition) continue;
        const key = pair.term.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const cue = pair.cue && pair.cue.toLowerCase() !== key ? pair.cue : null;
        out.push({ term: pair.term, definition: pair.definition, cue });
    }
    return out;
}

/** Build cloze pack: 3-col lines enable word-formation on Realise. */
export function clozePackFromManualDeck(box) {
    const out = {};
    for (const entry of box || []) {
        const sentence = String(entry.definition || '').trim() || `___`;
        const cue = entry.cue || null;
        const formation = Boolean(cue);
        const recognise = {
            sentence,
            lead: 'Postcard',
            body: sentence,
            hint: '',
            prompt: sentence,
            answer: entry.term,
            cue: null,
            formation: false,
        };
        const realise = formation
            ? {
                sentence,
                lead: 'Word formation',
                body: sentence,
                hint: 'Change the form of the cue word to fill the gap.',
                prompt: sentence,
                answer: entry.term,
                cue,
                formation: true,
            }
            : {
                ...recognise,
                lead: 'Type the answer',
            };
        out[entry.term.toLowerCase()] = [{ recognise, realise }];
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
    const sentence = String(entry.definition || '').trim() || '___';
    const cue = entry.cue || null;
    const formation = typed && Boolean(cue);
    const fallback = {
        lead: typed ? (formation ? 'Word formation' : 'Type the answer') : 'Postcard',
        body: sentence,
        hint: formation ? 'Change the form of the cue word to fill the gap.' : '',
        prompt: sentence,
        sentence,
        cue: formation ? cue : null,
        answer: entry.term,
        formation,
    };
    const r = typed ? (variant?.realise || fallback) : (variant?.recognise || fallback);
    return {
        lead: r.lead || fallback.lead,
        body: r.body || r.sentence || fallback.body,
        hint: r.hint || '',
        prompt: r.prompt || r.sentence || fallback.prompt,
        sentence: r.sentence || r.body || fallback.sentence,
        cue: typed ? (r.cue || fallback.cue) : null,
        answer: r.answer || entry.term,
        formation: typed ? Boolean(r.formation || fallback.formation) : false,
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

function usedSet(player) {
    return new Set((player?.usedTerms || []).map((t) => String(t).toLowerCase()));
}

/** Stamps still available for this player (base terms not yet stamped correctly). */
export function remainingStampsFor(match, playerId) {
    const p = match?.players?.[playerId];
    if (!p || !match?.box) return [];
    const used = usedSet(p);
    return match.box.map((b) => b.term).filter((t) => !used.has(t.toLowerCase()));
}

/** Host tray: stamps still needed by at least one unfinished player. */
export function remainingStampsHost(match) {
    if (!match?.box) return [];
    const active = (match.playerOrder || [])
        .map((id) => match.players[id])
        .filter((p) => p && !p.finished);
    if (!active.length) return [];
    return match.box.map((b) => b.term).filter((term) => {
        const key = term.toLowerCase();
        return active.some((p) => !usedSet(p).has(key));
    });
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
    const remaining = remainingStampsFor(match, playerId);
    // Ensure the current term is still offered (should already be in remaining).
    const choices = inputMode === 'choice'
        ? (remaining.includes(next.term) ? remaining : [next.term, ...remaining])
        : null;
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
        choices,
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
        clozePack = clozePackFromManualDeck(box);
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
            usedTerms: [],
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
        remaining: remainingStampsFor(match, playerId),
        used: [...(p.usedTerms || [])],
        points: p.points,
        stamps: p.stamps,
        streak: p.streak,
    };
}

function expectedAnswer(current) {
    return current?.answer || current?.term;
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
    // Word formation: typing the unchanged cue never counts.
    if (c.formation && text && c.cue && text.toLowerCase() === String(c.cue).toLowerCase()) {
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
                cue: c.cue || null,
                formation: Boolean(c.formation),
                message: c.formation
                    ? 'Wrong form — try again!'
                    : (c.inputMode === 'typed' ? 'Wrong answer — try again!' : 'Wrong stamp — try again!'),
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
    if (!Array.isArray(p.usedTerms)) p.usedTerms = [];
    if (!usedSet(p).has(String(c.term).toLowerCase())) p.usedTerms.push(c.term);
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
            usedTerm: c.term,
            remaining: remainingStampsFor(match, playerId),
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
        remaining: remainingStampsHost(match),
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
                used: [...(p.usedTerms || [])],
                remaining: remainingStampsFor(match, id),
                round: Math.min(STAMP_ROUNDS, p.roundIndex + (p.finished ? 0 : 1)),
            };
        }),
        ranking: winners.ranking,
        winnerNickname: winners.winnerNickname,
        now,
    };
}

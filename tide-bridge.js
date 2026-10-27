/**
 * Tide Bridge — co-op Live Spark match: build a bridge before the tide returns.
 *
 * Match clock ends the game (not first-to-N). Vocab spans deal each player a
 * random term from the full deck; correct answers feed a shared clear counter.
 * Between spans: shared shore mini-challenges (not from the glossary).
 */

import { buildChoices, matchesTermAnswer, sanitizeAnswerText } from './vocab-quiz-utils.js';
import { normalizeGameMinutes, CANNON_DEFAULT_MINUTES, CANNON_GAME_MINUTES } from './word-cannon.js';

export const TIDE_FORMAT = 'tide-bridge';
export { normalizeGameMinutes, CANNON_DEFAULT_MINUTES as TIDE_DEFAULT_MINUTES, CANNON_GAME_MINUTES as TIDE_GAME_MINUTES };

export const TIDE_BETWEEN_MS = 3_000;
export const TIDE_DEFAULT_QUESTION_MS = 20_000;

/** Built-in shore breakers — not from the vocab deck. */
export const SHORE_BREAKERS = [
    { id: 'math1', prompt: 'What is 7 + 5?', answer: '12', alts: ['twelve'] },
    { id: 'math2', prompt: 'What is 9 × 3?', answer: '27', alts: ['twenty-seven', 'twenty seven'] },
    { id: 'math3', prompt: 'What is 100 − 37?', answer: '63', alts: ['sixty-three', 'sixty three'] },
    { id: 'math4', prompt: 'How many minutes in 2 hours?', answer: '120', alts: ['one hundred twenty', 'one hundred and twenty'] },
    { id: 'tf1', prompt: 'True or false: The sun rises in the west.', answer: 'false', alts: ['f', 'no'] },
    { id: 'tf2', prompt: 'True or false: A triangle has 3 sides.', answer: 'true', alts: ['t', 'yes'] },
    { id: 'tf3', prompt: 'True or false: There are 12 months in a year.', answer: 'true', alts: ['t', 'yes'] },
    { id: 'color1', prompt: 'Type the colour of grass (one word).', answer: 'green', alts: [] },
    { id: 'color2', prompt: 'Type the colour of a clear daytime sky.', answer: 'blue', alts: [] },
    { id: 'emoji1', prompt: 'Type the word for 🐱', answer: 'cat', alts: ['kitten'] },
    { id: 'emoji2', prompt: 'Type the word for 🐶', answer: 'dog', alts: ['puppy'] },
    { id: 'back1', prompt: 'Spell STAR backwards.', answer: 'rats', alts: [] },
    { id: 'back2', prompt: 'Spell LIVE backwards.', answer: 'evil', alts: [] },
    { id: 'back3', prompt: 'Spell STOP backwards.', answer: 'pots', alts: [] },
    { id: 'silly1', prompt: 'Type exactly: splash splash', answer: 'splash splash', alts: [] },
    { id: 'silly2', prompt: 'Type exactly: tide in', answer: 'tide in', alts: [] },
    { id: 'count1', prompt: 'How many letters in BRIDGE?', answer: '6', alts: ['six'] },
    { id: 'count2', prompt: 'How many days in a week?', answer: '7', alts: ['seven'] },
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

export function neededCorrectForPlayers(n) {
    const count = Math.max(1, Number(n) || 1);
    return count >= 3 ? 3 : count;
}

export function tideTier(roundsCleared, gameMinutes) {
    const c = Math.max(0, Number(roundsCleared) || 0);
    const m = normalizeGameMinutes(gameMinutes);
    // Tuned bands from the plan
    const bands = {
        3: [3, 6],
        5: [5, 9],
        8: [8, 13],
        10: [10, 16],
    };
    const [bronzeMax, silverMax] = bands[m] || bands[5];
    if (c <= bronzeMax) {
        return { id: 'bronze', label: 'Swept back to shore', title: 'Swept back to shore' };
    }
    if (c <= silverMax) {
        return { id: 'silver', label: 'Mid-channel', title: 'Mid-channel' };
    }
    return { id: 'gold', label: 'Reached the far cliff', title: 'Reached the far cliff' };
}

function pickInputMode(answerMode, rng) {
    const mode = String(answerMode || 'recognise');
    if (mode === 'realise') return 'typed';
    if (mode === 'randomise') return rng() < 0.5 ? 'choice' : 'typed';
    return 'choice';
}

/**
 * @param {{ players: {id:string,nickname:string}[], deck: {term:string,definition:string}[], answerMode?: string, level?: string, gameMinutes?: number, questionMs?: number, seed?: number|null }} opts
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
    const now = Date.now();
    const breakerOrder = shuffleInPlace(SHORE_BREAKERS.map((b) => b.id), rng);

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
        phase: 'vocab', // vocab | breaker | between | finished
        phaseEndsAt: null,
        roundIndex: 0,
        cleared: 0,
        neededCorrect: neededCorrectForPlayers(players.length),
        gotCorrect: 0,
        correctPlayerIds: new Set(),
        players: Object.fromEntries(players.map((p) => [p.id, { ...p, correctTotal: 0, locked: false }])),
        playerOrder: players.map((p) => p.id),
        assignments: {}, // playerId -> { termIndex, questionId, inputMode, choices?, entry }
        breakerIndex: 0,
        breakerOrder,
        breaker: null, // current shore item + questionId
        betweenNext: 'breaker',
        finished: false,
        tier: null,
    };

    dealVocabRound(match);
    return match;
}

function nextQuestionId(match) {
    return `tb-${match.roundIndex}-${Math.floor(match.rng() * 1e9)}`;
}

export function dealVocabRound(match) {
    match.phase = 'vocab';
    match.phaseEndsAt = null;
    match.gotCorrect = 0;
    match.correctPlayerIds = new Set();
    match.neededCorrect = neededCorrectForPlayers(Object.keys(match.players).length);
    match.assignments = {};
    match.breaker = null;

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
        const inputMode = pickInputMode(match.answerMode, match.rng);
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

export function startBreaker(match) {
    match.phase = 'breaker';
    match.phaseEndsAt = null;
    match.gotCorrect = 0;
    match.correctPlayerIds = new Set();
    match.neededCorrect = neededCorrectForPlayers(Object.keys(match.players).length);
    match.assignments = {};

    for (const pid of match.playerOrder) {
        if (match.players[pid]) match.players[pid].locked = false;
    }

    const id = match.breakerOrder[match.breakerIndex % match.breakerOrder.length];
    match.breakerIndex += 1;
    const item = SHORE_BREAKERS.find((b) => b.id === id) || SHORE_BREAKERS[0];
    match.breaker = {
        id: item.id,
        prompt: item.prompt,
        answer: item.answer,
        alts: item.alts || [],
        questionId: nextQuestionId(match),
    };
}

export function beginBetween(match, nextPhase) {
    match.phase = 'between';
    match.betweenNext = nextPhase; // 'breaker' | 'vocab'
    match.phaseEndsAt = Date.now() + TIDE_BETWEEN_MS;
    match.assignments = {};
    match.breaker = null;
}

export function clearRound(match) {
    match.cleared += 1;
    match.roundIndex += 1;
    if (match.phase === 'vocab') {
        beginBetween(match, 'breaker');
    } else if (match.phase === 'breaker') {
        beginBetween(match, 'vocab');
    }
}

export function finishTideMatch(match, now = Date.now()) {
    if (match.finished) return match.tier;
    match.finished = true;
    match.phase = 'finished';
    match.phaseEndsAt = null;
    match.endsAt = Math.min(match.endsAt, now);
    match.tier = tideTier(match.cleared, match.gameMinutes);
    return match.tier;
}

export function tickTide(match, now = Date.now()) {
    if (match.finished) return { changed: false, finished: true, dealt: [] };

    if (now >= match.endsAt) {
        finishTideMatch(match, now);
        return { changed: true, finished: true, dealt: [] };
    }

    if (match.phase === 'between' && match.phaseEndsAt != null && now >= match.phaseEndsAt) {
        if (match.betweenNext === 'breaker') startBreaker(match);
        else {
            dealVocabRound(match);
        }
        return { changed: true, finished: false, dealt: [...match.playerOrder] };
    }

    return { changed: false, finished: false, dealt: [] };
}

export function tideQuestionPayload(match, playerId) {
    if (!match || match.finished) return null;
    if (match.phase === 'between' || match.phase === 'finished') return null;

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
            roundIndex: match.roundIndex,
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
            roundIndex: match.roundIndex,
            termIndex: a.termIndex,
        };
        if (a.inputMode === 'choice' && a.choices) payload.choices = a.choices;
        return payload;
    }
    return null;
}

export function submitTideAnswer(match, playerId, rawText, questionId, now = Date.now()) {
    if (match.finished || now >= match.endsAt) {
        finishTideMatch(match, now);
        return { result: { correct: false, finished: true, tide: true, gameFormat: TIDE_FORMAT }, cleared: false };
    }
    if (match.phase === 'between') {
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
        let cleared = false;
        if (match.gotCorrect >= match.neededCorrect) {
            clearRound(match);
            cleared = true;
        }
        return {
            result: {
                correct: true,
                tide: true,
                gameFormat: TIDE_FORMAT,
                phase: match.phase,
                progress: match.cleared,
                gotCorrect: match.gotCorrect,
                neededCorrect: match.neededCorrect,
                cleared,
                won: false,
                endsAt: match.endsAt,
            },
            cleared,
        };
    }

    // Wrong
    if (challengeable) {
        return {
            result: {
                correct: false,
                reset: false,
                challengeable: true,
                tide: true,
                gameFormat: TIDE_FORMAT,
                phase: 'vocab',
                progress: match.cleared,
                gotCorrect: match.gotCorrect,
                neededCorrect: match.neededCorrect,
                correctTerm,
                answerText,
                definition: entry?.definition || '',
                questionId: match.assignments[playerId]?.questionId,
                endsAt: match.endsAt,
            },
            cleared: false,
            pendingChallenge: { entry, answerText },
        };
    }

    // Wrong MC or breaker — stay unlocked so they can try again? Plan says wrong doesn't wipe.
    // For MC wrong: allow retry on same assignment (don't lock). For breaker wrong: allow retry.
    return {
        result: {
            correct: false,
            reset: false,
            challengeable: false,
            tide: true,
            gameFormat: TIDE_FORMAT,
            phase: match.phase,
            progress: match.cleared,
            gotCorrect: match.gotCorrect,
            neededCorrect: match.neededCorrect,
            correctTerm: match.phase === 'breaker' ? '' : correctTerm,
            endsAt: match.endsAt,
        },
        cleared: false,
    };
}

/** Host accepted a typed vocab challenge as correct. */
export function settleTideChallenge(match, playerId, accepted, now = Date.now()) {
    if (!accepted) {
        const ps = match.players[playerId];
        if (ps) ps.locked = false;
        return { cleared: false, result: { correct: false, tide: true } };
    }
    if (match.finished || match.phase !== 'vocab') {
        return { cleared: false, result: { correct: false, tide: true } };
    }
    const ps = match.players[playerId];
    if (!ps) return { cleared: false, result: { correct: false, tide: true } };
    ps.locked = true;
    if (!match.correctPlayerIds.has(playerId)) {
        match.correctPlayerIds.add(playerId);
        match.gotCorrect = match.correctPlayerIds.size;
        ps.correctTotal += 1;
    }
    let cleared = false;
    if (match.gotCorrect >= match.neededCorrect) {
        clearRound(match);
        cleared = true;
    }
    if (now >= match.endsAt) finishTideMatch(match, now);
    return {
        cleared,
        result: {
            correct: true,
            tide: true,
            gameFormat: TIDE_FORMAT,
            progress: match.cleared,
            gotCorrect: match.gotCorrect,
            neededCorrect: match.neededCorrect,
            cleared,
            endsAt: match.endsAt,
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
    const tideRatio = Math.min(1, Math.max(0, 1 - remainingMs / totalMs));
    const bridgeRatio = Math.min(1, match.cleared / 20);

    return {
        gameFormat: TIDE_FORMAT,
        tide: true,
        phase: match.phase,
        phaseEndsAt: match.phaseEndsAt,
        endsAt: match.endsAt,
        remainingMs,
        tideRatio,
        bridgeRatio,
        cleared: match.cleared,
        roundIndex: match.roundIndex,
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
    const tier = match.tier || tideTier(match.cleared, match.gameMinutes);
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
        cleared: match.cleared,
        players: ranking.map((row, i) => ({ ...row, rank: i + 1, progress: row.correct })),
    };
}

export function finishTideEarly(match) {
    return finishTideMatch(match, Date.now());
}

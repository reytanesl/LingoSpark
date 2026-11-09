/**
 * Word Board — Scrabble-style classroom engine.
 * Teacher pastes a word list; only those words score on the shared board.
 */

export const BOARD_SIZE = 15;
export const RACK_SIZE = 7;
export const CENTER = 7;

/** Classic English Scrabble letter values. */
export const LETTER_VALUES = {
    A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
    K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
    U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10, _: 0,
};

/** Premium squares: TW / DW / TL / DL (center is DW). */
export const PREMIUMS = (() => {
    const g = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    const set = (r, c, v) => { g[r][c] = v; };
    const tw = [[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]];
    const dw = [
        [1, 1], [2, 2], [3, 3], [4, 4], [1, 13], [2, 12], [3, 11], [4, 10],
        [13, 1], [12, 2], [11, 3], [10, 4], [13, 13], [12, 12], [11, 11], [10, 10],
        [7, 7],
    ];
    const tl = [
        [1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13],
        [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9],
    ];
    const dl = [
        [0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14],
        [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11],
        [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14],
        [12, 6], [12, 8], [14, 3], [14, 11],
    ];
    tw.forEach(([r, c]) => set(r, c, 'TW'));
    dw.forEach(([r, c]) => set(r, c, 'DW'));
    tl.forEach(([r, c]) => set(r, c, 'TL'));
    dl.forEach(([r, c]) => set(r, c, 'DL'));
    return g;
})();

export function normalizeWord(raw) {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, '');
}

/**
 * Parse pasted list: one word per line, or comma / semicolon separated.
 * Keeps unique words of length 2–15 (letters only).
 */
export function parseWordList(text) {
    const chunks = String(text || '')
        .split(/[\n,;]+/)
        .map((s) => normalizeWord(s))
        .filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const w of chunks) {
        if (w.length < 2 || w.length > BOARD_SIZE) continue;
        if (seen.has(w)) continue;
        seen.add(w);
        out.push(w);
    }
    return out;
}

export function emptyBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function mulberry32(seed) {
    let a = Number(seed) || 1;
    return function rng() {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
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

/**
 * Build a tile bag from the word list so every listed word is formable in principle.
 * Scales counts for longer play and adds two blanks.
 */
export function buildBagFromWords(words, seed = Date.now()) {
    const counts = Object.create(null);
    for (const w of words || []) {
        for (const ch of w) {
            if (ch < 'A' || ch > 'Z') continue;
            counts[ch] = (counts[ch] || 0) + 1;
        }
    }
    const letters = Object.keys(counts);
    if (!letters.length) return [];
    // Enough tiles to cover the list once, then ~1.5× more for shared play.
    const bag = [];
    for (const ch of letters) {
        const n = Math.max(2, Math.ceil(counts[ch] * 1.5));
        for (let i = 0; i < n; i++) bag.push(ch);
    }
    bag.push('_', '_');
    return shuffle(bag, mulberry32(seed));
}

export function drawTiles(bag, n) {
    const drawn = [];
    while (drawn.length < n && bag.length) drawn.push(bag.pop());
    return drawn;
}

function countRackLetters(tiles) {
    const m = Object.create(null);
    let blanks = 0;
    for (const t of tiles || []) {
        const ch = String(t || '').toUpperCase();
        if (!ch) continue;
        if (ch === '_') blanks += 1;
        else m[ch] = (m[ch] || 0) + 1;
    }
    return { m, blanks };
}

/** True if rack letters (blanks wild) can spell `word`. */
export function rackCanSpell(rack, word) {
    const w = normalizeWord(word);
    if (!w) return false;
    const { m, blanks } = countRackLetters(rack);
    const have = { ...m };
    let left = blanks;
    for (const ch of w) {
        if (have[ch] > 0) have[ch] -= 1;
        else if (left > 0) left -= 1;
        else return false;
    }
    return true;
}

/** True if rack can spell at least one word in the list. */
export function rackCanFormAny(rack, words) {
    for (const w of words || []) {
        if (rackCanSpell(rack, w)) return true;
    }
    return false;
}

function takeLetterFromBag(bag, letter) {
    const i = bag.lastIndexOf(letter);
    if (i < 0) return false;
    bag.splice(i, 1);
    return true;
}

/** Can we assemble `word` using kept tiles + whatever is still in the bag? */
function canAssembleFromKeptAndBag(kept, bag, word) {
    return rackCanSpell([...(kept || []), ...(bag || [])], word);
}

function remainingCandidates(words, found) {
    const foundSet = found instanceof Set ? found : new Set(found || []);
    return (words || [])
        .map((w) => normalizeWord(w))
        .filter((w) => w && !foundSet.has(w) && w.length <= RACK_SIZE)
        .sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/**
 * Draw/refill a rack so it can always spell at least one remaining list word
 * (length ≤ 7), whenever the bag + kept tiles still allow it.
 */
export function refillRack(rack, bag, words = null, opts = {}) {
    let kept = (rack || []).filter((t) => t != null);
    let need = RACK_SIZE - kept.length;

    const candidates = remainingCandidates(words, opts.found);
    if (!candidates.length) {
        if (need > 0) return kept.concat(drawTiles(bag, need));
        return kept.slice(0, RACK_SIZE);
    }

    // Already full and already playable — leave it.
    if (need <= 0 && rackCanFormAny(kept, candidates)) {
        return kept.slice(0, RACK_SIZE);
    }

    // Prefer a word we can finish without discarding kept tiles.
    let target = candidates.find((w) => canAssembleFromKeptAndBag(kept, bag, w)) || null;

    // If kept tiles block every word (or the full rack is dead), recycle into the bag.
    let base = kept;
    if (!target) {
        bag.push(...kept);
        base = [];
        need = RACK_SIZE;
        target = candidates.find((w) => canAssembleFromKeptAndBag([], bag, w)) || null;
        if (!target) {
            // Bag too thin — best effort random draw from whatever is left.
            return drawTiles(bag, RACK_SIZE);
        }
    } else if (need <= 0) {
        // Playable enough via bag+kept math but rack is full — keep as-is.
        return kept.slice(0, RACK_SIZE);
    }

    const drawn = [];
    const have = countRackLetters(base).m;
    const needCounts = Object.create(null);
    for (const ch of target) needCounts[ch] = (needCounts[ch] || 0) + 1;
    for (const ch of Object.keys(needCounts)) {
        let still = needCounts[ch] - (have[ch] || 0);
        while (still > 0 && drawn.length < need) {
            if (takeLetterFromBag(bag, ch)) {
                drawn.push(ch);
                still -= 1;
            } else {
                // Use a blank if the exact letter ran out.
                if (takeLetterFromBag(bag, '_')) {
                    drawn.push('_');
                    still -= 1;
                } else break;
            }
        }
    }
    while (drawn.length < need && bag.length) drawn.push(bag.pop());

    let out = base.concat(drawn);
    if (out.length > RACK_SIZE) out = out.slice(0, RACK_SIZE);

    if (rackCanSpell(out, target)) return out;

    // Last resort: rebuild purely around the target word.
    bag.push(...out);
    const forced = [];
    for (const ch of target) {
        if (forced.length >= RACK_SIZE) break;
        if (takeLetterFromBag(bag, ch)) forced.push(ch);
        else if (takeLetterFromBag(bag, '_')) forced.push('_');
    }
    while (forced.length < RACK_SIZE && bag.length) forced.push(bag.pop());
    return forced;
}

export function letterScore(ch) {
    const c = ch === '_' ? '_' : String(ch || '').toUpperCase();
    return LETTER_VALUES[c] ?? 0;
}

function inBounds(r, c) {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function boardHasAny(board) {
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c]) return true;
        }
    }
    return false;
}

/**
 * placements: [{row, col, letter, blankAs?}] — new tiles only.
 * Returns { ok, error, words, score, placements } where words are formed strings.
 */
export function evaluatePlacement(board, placements, wordSet) {
    if (!Array.isArray(placements) || !placements.length) {
        return { ok: false, error: 'Place at least one tile.' };
    }
    const set = wordSet instanceof Set
        ? wordSet
        : new Set((wordSet || []).map((w) => normalizeWord(w)));

    const occupied = new Set();
    for (const p of placements) {
        if (!inBounds(p.row, p.col)) return { ok: false, error: 'Tile off the board.' };
        const key = `${p.row},${p.col}`;
        if (occupied.has(key)) return { ok: false, error: 'Two tiles on the same square.' };
        occupied.add(key);
        if (board[p.row][p.col]) return { ok: false, error: 'That square is already taken.' };
        const letter = String(p.letter || '').toUpperCase();
        if (letter === '_') {
            const as = normalizeWord(p.blankAs || '').slice(0, 1);
            if (!as) return { ok: false, error: 'Choose a letter for each blank.' };
        } else if (!/^[A-Z]$/.test(letter)) {
            return { ok: false, error: 'Invalid tile.' };
        }
    }

    const rows = [...new Set(placements.map((p) => p.row))];
    const cols = [...new Set(placements.map((p) => p.col))];
    const sameRow = rows.length === 1;
    const sameCol = cols.length === 1;
    if (!sameRow && !sameCol) {
        return { ok: false, error: 'Tiles must be in one row or one column.' };
    }

    // Contiguous along the play line (including existing letters bridging gaps).
    const temp = board.map((row) => row.slice());
    const isNew = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
    for (const p of placements) {
        const letter = String(p.letter).toUpperCase();
        const ch = letter === '_' ? normalizeWord(p.blankAs).slice(0, 1) : letter;
        temp[p.row][p.col] = { letter: ch, blank: letter === '_', fresh: true };
        isNew[p.row][p.col] = true;
    }

    const mainIsRow = sameRow;
    const fixed = mainIsRow ? rows[0] : cols[0];
    const coords = placements.map((p) => (mainIsRow ? p.col : p.row)).sort((a, b) => a - b);
    const min = coords[0];
    const max = coords[coords.length - 1];
    for (let i = min; i <= max; i++) {
        const r = mainIsRow ? fixed : i;
        const c = mainIsRow ? i : fixed;
        if (!temp[r][c]) {
            return { ok: false, error: 'Tiles must form one continuous word (no gaps).' };
        }
    }

    const firstMove = !boardHasAny(board);
    if (firstMove) {
        if (!placements.some((p) => p.row === CENTER && p.col === CENTER)) {
            return { ok: false, error: 'First word must cover the centre star.' };
        }
    } else {
        const touches = placements.some((p) => {
            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
            return dirs.some(([dr, dc]) => {
                const r = p.row + dr;
                const c = p.col + dc;
                return inBounds(r, c) && board[r][c];
            });
        });
        if (!touches) return { ok: false, error: 'New tiles must touch an existing word.' };
    }

    function readWord(r0, c0, vertical) {
        let r = r0;
        let c = c0;
        while (inBounds(vertical ? r - 1 : r, vertical ? c : c - 1)
            && temp[vertical ? r - 1 : r][vertical ? c : c - 1]) {
            if (vertical) r -= 1; else c -= 1;
        }
        const cells = [];
        while (inBounds(r, c) && temp[r][c]) {
            cells.push({ row: r, col: c, tile: temp[r][c], isNew: isNew[r][c] });
            if (vertical) r += 1; else c += 1;
        }
        return cells;
    }

    const mainCells = readWord(
        mainIsRow ? fixed : min,
        mainIsRow ? min : fixed,
        !mainIsRow,
    );
    const formed = [];
    const pushWord = (cells) => {
        if (cells.length < 2) return;
        const word = cells.map((x) => x.tile.letter).join('');
        formed.push({ word, cells });
    };
    pushWord(mainCells);

    for (const p of placements) {
        const cross = readWord(p.row, p.col, mainIsRow);
        if (cross.length >= 2) pushWord(cross);
    }

    // Deduplicate identical cell spans.
    const uniq = [];
    const seenSpans = new Set();
    for (const w of formed) {
        const key = w.cells.map((c) => `${c.row},${c.col}`).join('|');
        if (seenSpans.has(key)) continue;
        seenSpans.add(key);
        uniq.push(w);
    }

    for (const w of uniq) {
        if (!set.has(w.word)) {
            return { ok: false, error: `“${w.word}” is not on your word list.` };
        }
    }

    let score = 0;
    for (const w of uniq) {
        let wordScore = 0;
        let wordMult = 1;
        for (const cell of w.cells) {
            const base = letterScore(cell.tile.blank ? '_' : cell.tile.letter);
            let lm = 1;
            if (cell.isNew) {
                const prem = PREMIUMS[cell.row][cell.col];
                if (prem === 'DL') lm = 2;
                if (prem === 'TL') lm = 3;
                if (prem === 'DW') wordMult *= 2;
                if (prem === 'TW') wordMult *= 3;
            }
            wordScore += base * lm;
        }
        score += wordScore * wordMult;
    }
    if (placements.length === RACK_SIZE) score += 50; // bingo

    return {
        ok: true,
        error: null,
        words: uniq.map((w) => w.word),
        score,
        placements: placements.map((p) => {
            const letter = String(p.letter).toUpperCase();
            const ch = letter === '_' ? normalizeWord(p.blankAs).slice(0, 1) : letter;
            return { row: p.row, col: p.col, letter: ch, blank: letter === '_', fromBlank: letter === '_' };
        }),
    };
}

export function applyPlacement(board, evaluatedPlacements) {
    const next = board.map((row) => row.slice());
    for (const p of evaluatedPlacements) {
        next[p.row][p.col] = {
            letter: p.letter,
            blank: Boolean(p.blank || p.fromBlank),
        };
    }
    return next;
}

export function createMatch({
    words,
    teamNames = ['Team 1', 'Team 2'],
    timerSec = 0,
    seed = Date.now(),
} = {}) {
    const list = parseWordList(Array.isArray(words) ? words.join('\n') : words);
    if (list.length < 5) {
        throw new Error('Paste at least 5 unique words (2–15 letters each).');
    }
    const names = (teamNames || []).map((n) => String(n || '').trim().slice(0, 24)).filter(Boolean);
    if (names.length < 2 || names.length > 4) {
        throw new Error('Choose 2–4 teams.');
    }
    const bag = buildBagFromWords(list, seed);
    const found = new Set();
    const teams = names.map((name, i) => ({
        id: `t${i}`,
        name,
        score: 0,
        rack: refillRack([], bag, list, { found }),
        wordsPlayed: [],
    }));
    // Opening racks must each be able to open with a list word.
    for (const team of teams) {
        if (!rackCanFormAny(team.rack, list)) {
            bag.push(...team.rack);
            team.rack = refillRack([], bag, list, { found });
        }
    }
    return {
        words: list,
        wordSet: new Set(list),
        found,
        board: emptyBoard(),
        bag,
        teams,
        turn: 0,
        timerSec: Math.max(0, Number(timerSec) || 0),
        seed,
        moves: [],
        finished: false,
        winnerId: null,
    };
}

export function currentTeam(match) {
    return match?.teams?.[match.turn % match.teams.length] || null;
}

export function playMove(match, placements) {
    if (!match || match.finished) return { ok: false, error: 'Game over.' };
    const team = currentTeam(match);
    if (!team) return { ok: false, error: 'No team.' };

    // Ensure rack can supply the letters (blanks = '_').
    const rackCopy = team.rack.slice();
    for (const p of placements) {
        const want = String(p.letter).toUpperCase();
        const idx = rackCopy.findIndex((t) => t === want);
        if (idx < 0) return { ok: false, error: `You do not have “${want === '_' ? 'blank' : want}” on your rack.` };
        rackCopy.splice(idx, 1);
    }

    const result = evaluatePlacement(match.board, placements, match.wordSet);
    if (!result.ok) return result;

    match.board = applyPlacement(match.board, result.placements);
    team.score += result.score;
    for (const w of result.words) {
        team.wordsPlayed.push(w);
        match.found.add(w);
    }
    team.rack = refillRack(rackCopy, match.bag, match.words, { found: match.found });
    match.moves.push({
        teamId: team.id,
        words: result.words,
        score: result.score,
    });
    match.turn += 1;

    if (match.found.size >= match.words.length) {
        finishMatch(match);
    }
    return { ok: true, result, team, matchFinished: match.finished };
}

export function passTurn(match) {
    if (!match || match.finished) return { ok: false, error: 'Game over.' };
    match.turn += 1;
    match.moves.push({ teamId: currentTeam(match)?.id, pass: true, score: 0 });
    return { ok: true };
}

export function exchangeTiles(match, indices) {
    if (!match || match.finished) return { ok: false, error: 'Game over.' };
    if (match.bag.length < 1) return { ok: false, error: 'Bag is empty — cannot exchange.' };
    const team = currentTeam(match);
    const idxs = [...new Set((indices || []).map(Number))].filter((i) => i >= 0 && i < team.rack.length);
    if (!idxs.length) return { ok: false, error: 'Select tiles to exchange.' };
    const returning = idxs.map((i) => team.rack[i]);
    const kept = team.rack.filter((_, i) => !idxs.includes(i));
    match.bag.push(...returning);
    match.bag = shuffle(match.bag, mulberry32(Date.now() + match.turn));
    team.rack = refillRack(kept, match.bag, match.words, { found: match.found });
    match.turn += 1;
    match.moves.push({ teamId: team.id, exchange: returning.length, score: 0 });
    return { ok: true };
}

export function finishMatch(match) {
    if (!match || match.finished) return match;
    match.finished = true;
    let best = -1;
    let winner = null;
    for (const t of match.teams) {
        if (t.score > best) {
            best = t.score;
            winner = t;
        }
    }
    match.winnerId = winner?.id || null;
    return match;
}

export function publicSummary(match) {
    if (!match) return null;
    return {
        turn: match.turn,
        timerSec: match.timerSec,
        bagLeft: match.bag.length,
        wordsTotal: match.words.length,
        wordsFound: match.found.size,
        finished: match.finished,
        winnerId: match.winnerId,
        currentTeamId: currentTeam(match)?.id,
        teams: match.teams.map((t) => ({
            id: t.id,
            name: t.name,
            score: t.score,
            rackCount: t.rack.length,
            wordsPlayed: t.wordsPlayed.slice(),
        })),
    };
}

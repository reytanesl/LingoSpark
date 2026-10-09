/* Penalty Match — rules (pure, unit-tested).
   Two words flash up together; tap MATCH when they are a real term/definition pair
   before the bar runs out. Wrong taps and missed pairs cost points; first to 100 wins.
   Classic script: sets globalThis.PenaltyMatchCore (also importable from node for tests). */
(function (root) {
    'use strict';

    const SCORING = { match: 10, wrong: -5, miss: -2, target: 100 };
    const MATCH_CHANCE = 0.4;
    const SPEEDS = { slow: 4000, medium: 2500, fast: 1500 };
    const MIN_PAIRS = 4;
    /** Extra reading time for longer pairs (built-in definitions): 40 ms per character over 24, at most 4 s. */
    const READ_FREE_CHARS = 24;
    const READ_MS_PER_CHAR = 40;
    const READ_MAX_BONUS = 4000;

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /** Same separators as the LingoSpark glossary box: tab, " = ", " : ", " - " (hyphens inside words stay). */
    function splitPair(line) {
        const m = String(line).match(/^(.+?)(?:\t+|\s*=\s*|\s*:\s*|\s+-\s+)(.+)$/);
        if (!m) return null;
        const term = m[1].trim();
        const definition = m[2].trim();
        return term && definition ? { term, definition } : null;
    }

    /** "Term = Definition" lines, or the term on one line and its meaning on the next (the original game's format). */
    function parseList(raw) {
        const lines = String(raw || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const out = [];
        for (let i = 0; i < lines.length; i++) {
            const pair = splitPair(lines[i]);
            if (pair) out.push(pair);
            else if (i + 1 < lines.length && !splitPair(lines[i + 1])) { out.push({ term: lines[i], definition: lines[i + 1] }); i++; }
        }
        return cleanItems(out);
    }

    /** Trim, drop incomplete rows and duplicate terms (first one wins). Accepts {term, definition} or {term, def}. */
    function cleanItems(items) {
        const seen = new Set();
        const out = [];
        for (const it of items || []) {
            const term = String((it && it.term) || '').trim().slice(0, 200);
            const definition = String((it && (it.definition ?? it.def)) || '').trim().slice(0, 500);
            const key = term.toLowerCase();
            if (!term || !definition || seen.has(key)) continue;
            seen.add(key);
            out.push({ term, definition });
        }
        return out;
    }

    /** Pairs with at least two different meanings are needed, otherwise every "wrong" pair would really match. */
    function distinctMeanings(items) {
        return new Set((items || []).map((it) => it.definition.toLowerCase())).size;
    }

    function shuffle(list, rng) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    /** Random sample (used for the big built-in banks so the end-of-game review stays short). */
    function sample(list, n, rng) {
        return shuffle(list, rng).slice(0, Math.max(0, n));
    }

    function roundDuration(speedMs, top, bottom) {
        const chars = String(top || '').length + String(bottom || '').length;
        const bonus = Math.min(READ_MAX_BONUS, Math.max(0, chars - READ_FREE_CHARS) * READ_MS_PER_CHAR);
        return Math.round(Number(speedMs) || SPEEDS.medium) + bonus;
    }

    function createGame({ items, speedMs = SPEEDS.medium, rng = Math.random, matchChance = MATCH_CHANCE, target = SCORING.target } = {}) {
        const list = cleanItems(items);
        if (list.length < 2 || distinctMeanings(list) < 2) throw new Error('Need at least 2 pairs with different meanings');
        return {
            items: list, speedMs, rng, matchChance, target,
            deck: [], score: 0, round: 0, current: null, finished: false,
            stats: { correct: 0, wrong: 0, missed: 0, passed: 0 },
            log: new Map(),   // term -> { item, seen, correct, wrong, missed }
            startedAt: null, endedAt: null,
        };
    }

    function logFor(game, item) {
        let e = game.log.get(item.term);
        if (!e) { e = { term: item.term, definition: item.definition, seen: 0, correct: 0, wrong: 0, missed: 0 }; game.log.set(item.term, e); }
        return e;
    }

    /** Deal the next pair: base item from a shuffled deck (no quick repeats); 40% real pairs, otherwise a different meaning. */
    function nextPair(game, now = Date.now()) {
        if (game.finished) return null;
        if (game.startedAt == null) game.startedAt = now;
        if (!game.deck.length) game.deck = shuffle(game.items, game.rng);
        const base = game.deck.pop();
        const isMatch = game.rng() < game.matchChance;
        let shownDef = base.definition;
        let decoy = null;
        if (!isMatch) {
            const others = game.items.filter((it) => it.definition.toLowerCase() !== base.definition.toLowerCase());
            decoy = others[Math.floor(game.rng() * others.length)];
            shownDef = decoy.definition;
        }
        const swap = game.rng() < 0.5;
        const top = swap ? shownDef : base.term;
        const bottom = swap ? base.term : shownDef;
        game.round += 1;
        game.current = { round: game.round, base, decoy, isMatch, top, bottom, termOnTop: !swap, durationMs: roundDuration(game.speedMs, top, bottom), resolved: false };
        logFor(game, base).seen += 1;
        return game.current;
    }

    /**
     * Resolve the current pair. action: 'tap' (player hit MATCH) or 'timeout' (bar ran out).
     *  tap + real pair  -> correct (+10)      tap + wrong pair  -> wrong (-5)
     *  timeout + real   -> missed (-2)        timeout + wrong   -> passed (0, the right call)
     * Score never drops below 0. Reaching the target ends the game.
     */
    function resolve(game, action, now = Date.now()) {
        const cur = game.current;
        if (!cur || cur.resolved || game.finished) return null;
        cur.resolved = true;
        let outcome;
        if (action === 'tap') outcome = cur.isMatch ? 'correct' : 'wrong';
        else outcome = cur.isMatch ? 'missed' : 'passed';
        const delta = { correct: SCORING.match, wrong: SCORING.wrong, missed: SCORING.miss, passed: 0 }[outcome];
        const before = game.score;
        game.score = Math.max(0, game.score + delta);
        game.stats[outcome] += 1;
        const e = logFor(game, cur.base);
        if (outcome === 'correct') e.correct += 1;
        if (outcome === 'missed') e.missed += 1;
        if (outcome === 'wrong') e.wrong += 1;
        if (game.score >= game.target) finish(game, now);
        return { outcome, delta: game.score - before, points: delta, score: game.score, finished: game.finished, pair: cur };
    }

    function finish(game, now = Date.now()) {
        if (game.finished) return;
        game.finished = true;
        game.endedAt = now;
    }

    function accuracy(stats) {
        const decisions = stats.correct + stats.wrong + stats.missed + stats.passed;
        return decisions ? Math.round(((stats.correct + stats.passed) / decisions) * 100) : 0;
    }

    /** 3 stars: reached 100 with >= 90% right calls; 2: >= 75%; 1: reached the target. 0 if stopped early. */
    function stars(game) {
        if (game.score < game.target) return 0;
        const acc = accuracy(game.stats);
        return acc >= 90 ? 3 : acc >= 75 ? 2 : 1;
    }

    function summary(game) {
        const review = Array.from(game.log.values())
            .map((e) => ({ ...e, trouble: e.wrong + e.missed }))
            .sort((a, b) => b.trouble - a.trouble || b.seen - a.seen || a.term.localeCompare(b.term));
        return {
            score: game.score, target: game.target, reached: game.score >= game.target,
            rounds: game.round, stats: { ...game.stats }, accuracy: accuracy(game.stats), stars: stars(game),
            durationMs: game.startedAt != null ? Math.max(0, (game.endedAt ?? Date.now()) - game.startedAt) : 0,
            review,
        };
    }

    root.PenaltyMatchCore = {
        SCORING, MATCH_CHANCE, SPEEDS, MIN_PAIRS,
        mulberry32, splitPair, parseList, cleanItems, distinctMeanings, shuffle, sample,
        roundDuration, createGame, nextPair, resolve, finish, accuracy, stars, summary,
    };
})(typeof window !== 'undefined' ? window : globalThis);

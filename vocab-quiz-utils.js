import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

function loadJsonFile(name) {
    const raw = fs.readFileSync(path.join(DATA_DIR, name), 'utf8');
    return JSON.parse(raw);
}

function rowsToDeck(rows) {
    const seen = new Set();
    const deck = [];
    for (const row of rows) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const term = String(row[0] || '').trim();
        const definition = String(row[1] || '').trim();
        if (!term || !definition) continue;
        const key = term.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deck.push({ term, definition });
    }
    return deck;
}

const BUILTIN_FILES = {
    beginner: ['auction-beginner.json'],
    easy: ['auction-easy-1.json', 'auction-easy-2.json', 'auction-easy-fill.json'],
    intermediate: [
        'auction-int-1.json',
        'auction-int-2.json',
        'auction-int-3.json',
        'auction-int-4.json',
        'auction-int-fill.json',
    ],
    advanced: ['auction-adv-1.json', 'auction-adv-2.json', 'auction-adv-fill.json'],
};

export function loadBuiltinDeck(level = 'intermediate') {
    const key = BUILTIN_FILES[level] ? level : 'intermediate';
    const files = BUILTIN_FILES[key];
    const rows = files.flatMap((f) => loadJsonFile(f));
    return rowsToDeck(rows);
}

export function parseGlossaryTerms(text) {
    const lines = String(text || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const parsed = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const sepMatch = line.match(/(=|-|:|\t)/);
        if (sepMatch) {
            const sep = sepMatch[0];
            const parts = line.split(sep);
            const term = parts[0].trim();
            const definition = parts.slice(1).join(sep).trim();
            if (term && definition) parsed.push({ term, definition });
        } else if (i + 1 < lines.length) {
            parsed.push({ term: line, definition: lines[i + 1].trim() });
            i++;
        }
    }
    const unique = new Map();
    for (const item of parsed) {
        const k = item.term.toLowerCase();
        if (!unique.has(k)) unique.set(k, item);
    }
    return Array.from(unique.values());
}

export function distractorSimilarity(correct, candidate) {
    const a = String(correct || '').toLowerCase();
    const b = String(candidate || '').toLowerCase();
    if (!a || !b) return 0;
    let score = 0;
    const lenDiff = Math.abs(a.length - b.length);
    score += Math.max(0, 6 - lenDiff);
    if (a[0] === b[0]) score += 4;
    if (a.slice(-2) === b.slice(-2)) score += 3;
    if (a.slice(0, 3) === b.slice(0, 3) && a.length >= 3) score += 5;
    const setA = new Set(a);
    let shared = 0;
    for (const ch of b) if (setA.has(ch)) shared++;
    score += Math.min(5, Math.round((shared / Math.max(a.length, b.length)) * 8));
    let i = 0;
    let j = 0;
    let lcs = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            lcs++;
            i++;
            j++;
        } else if (a.length - i > b.length - j) i++;
        else j++;
    }
    score += Math.min(6, lcs);
    return score;
}

export function buildChoices(correctWord, pool, level = 'intermediate') {
    const candidates = pool.filter((w) => w.toLowerCase() !== correctWord.toLowerCase());
    const scored = candidates.map((w) => ({
        w,
        sim: distractorSimilarity(correctWord, w),
        jitter: Math.random() * 1.5,
    }));

    let ordered;
    if (level === 'beginner' || level === 'easy') {
        ordered = scored.sort((a, b) => a.sim + a.jitter - (b.sim + b.jitter));
    } else if (level === 'advanced') {
        ordered = scored.sort((a, b) => b.sim + b.jitter - (a.sim + a.jitter));
    } else {
        ordered = scored.sort((a, b) => {
            const midA = Math.abs(a.sim - 10) - a.jitter;
            const midB = Math.abs(b.sim - 10) - b.jitter;
            return midA - midB;
        });
    }

    const distractors = ordered.slice(0, 3).map((x) => x.w);
    while (distractors.length < 3) distractors.push('—');

    const choices = [correctWord, ...distractors];
    for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return choices;
}

export function buildRound(deck, level, usedTerms = new Set()) {
    const available = deck.filter((d) => !usedTerms.has(d.term.toLowerCase()));
    const pool = available.length >= 4 ? available : deck;
    if (pool.length < 4) return null;

    const entry = pool[Math.floor(Math.random() * pool.length)];
    const termPool = deck.map((d) => d.term);
    const choices = buildChoices(entry.term, termPool, level);
    const correctIndex = choices.findIndex(
        (c) => c.toLowerCase() === entry.term.toLowerCase()
    );

    return {
        term: entry.term,
        definition: entry.definition,
        choices,
        correctIndex: correctIndex >= 0 ? correctIndex : 0,
    };
}

export function calcScore(correct, timeLeftMs, timerSec) {
    if (!correct) return 0;
    const timeLeftSec = timeLeftMs / 1000;
    return 1000 + Math.max(0, Math.floor((timeLeftSec / timerSec) * 500));
}

/** Accept any comma- or slash-separated synonym in an expected term. */
export function termSynonymParts(text) {
    return String(text || '')
        .split(/\s*[,/]\s*|\s+\/\s+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

export function matchesTermAnswer(input, expectedTerm) {
    const guess = String(input || '').trim().toLowerCase();
    if (!guess) return false;
    const parts = termSynonymParts(expectedTerm);
    if (!parts.length) return guess === String(expectedTerm || '').trim().toLowerCase();
    return parts.includes(guess);
}

export function sanitizeAnswerText(raw) {
    return String(raw || '')
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 120);
}

export function shuffleDeck(deck, questionCount) {
    const copy = [...deck];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.min(questionCount, copy.length));
}

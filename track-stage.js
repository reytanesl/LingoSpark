/* Fresh per-stage Track generation (prompt version tg7): POST /api/study/track-stage.
   The app asks for ONE stage (5-6 questions; recap / daily sizes too) right after the previous stage and sends the learner's per-word
   SRS state. The site picks words (spread over the whole set, due / weak words weighted up exponentially, mastered words rarely, a cap per word),
   picks task types (varied, no typed tasks at A1, sentence-gap choice most frequent), writes the items with the AI, validates them with the
   existing validators and the clarity judge, and answers. Nothing is read from the question bank. If the AI fails, a deterministic stage
   built from the set's own words is served instead. See /workspace/track-hint-contract.md ("track-stage"). */
import crypto from 'node:crypto';
import {
    PROMPT_VERSION, LEVELS, TYPE_STEP, LIMITS, BRIDGE_HEADERS,
    validateTrackRequest, typesForLevel, buildTrackPrompt, buildItem, finalCheck, reshuffleOptions, planCalls,
    itemText, jaccard, NEAR_DUPLICATE, norm, answerLangOf, slotsFor, slotType, scrambleWordOf, pickTermVariant, termTokens,
    verifyBridgeRequest, createNonceStore,
} from './track-ai.js';
import {
    SENTENCE_PICK, isSentenceTerm, buildSentencePick, ruleSentencePick, sentencePickFingerprints, buildSentencePickPrompt, SENTENCE_PICK_KINDS,
} from './track-sentence-pick.js';

export const STAGE_PATH = '/api/study/track-stage';
export const STAGE_KINDS = ['station', 'recap', 'daily', 'boss'];
const DEFAULT_SIZE = { station: 6, recap: 10, daily: 8, boss: 1 };

export const STAGE_LIMITS = {
    maxBodyBytes: 96 * 1024,
    minSize: 1, maxSize: 14,
    maxProgress: 60, maxRecentFps: 400, maxRecentTexts: 40, maxFocus: 40,
    defaultBudgetMs: 40_000, minBudgetMs: 5_000, maxBudgetMs: 70_000,
    callWeight: 300, // approx. output tokens per generation call: a 6-question stage (+ spares) is cut into ~2 parallel calls
    perCallTimeoutMs: 28_000,
    judgeBatch: 8, judgeTimeoutMs: 16_000, judgeReserveMs: 13_000, // the judge call is kept this much of the budget
    retryMinMs: 17_000, retryMinNoJudgeMs: 10_000, // a 2nd round only starts when this much budget is left
    maxRounds: 2,
    spares: 2, // extra items generated and judged so that a rejected one is replaced without another round
    maxPerWord: 2,
    globalCallConcurrency: 10,
    userMax: 40, userWindowMs: 60 * 60_000, userConcurrent: 2, globalConcurrent: 8,
    memoryKeys: 3000, memoryFps: 300, memoryTexts: 40, memoryItems: 30, memoryTtlMs: 24 * 3600_000,
};

/** Types that need typing (or typing-like input) and never appear at A1. letterScramble asks to "write" the word, so it is out too. */
export const A1_TYPED = new Set(['translateType', 'dictation', 'wordFormation', 'keyTransform', 'letterScramble']);

/** Share of each task slot per level (relative weights). sentenceGap (choice with the Polish word in brackets) is the most frequent type everywhere. */
export const SLOT_MIX = {
    A1: { sentenceGap: 44, gapTranslate: 10, 'meaningPick:pl-en': 14, 'meaningPick:en-pl': 12, listenPick: 12, sentenceOrder: 8 },
    A2: { sentenceGap: 34, gapTranslate: 12, collocationPick: 8, 'meaningPick:pl-en': 9, 'meaningPick:en-pl': 8, listenPick: 6, contextTrueFalse: 4, sentenceOrder: 7, letterScramble: 4, translateType: 5, dictation: 3 },
    B1: { sentenceGap: 28, gapTranslate: 8, collocationPick: 10, 'meaningPick:pl-en': 5, 'meaningPick:en-pl': 6, listenPick: 3, contextTrueFalse: 7, sentenceOrder: 6, letterScramble: 2, translateType: 8, dictation: 5, wordFormation: 8, keyTransform: 4 },
    B2: { sentenceGap: 26, gapTranslate: 7, collocationPick: 10, 'meaningPick:pl-en': 4, 'meaningPick:en-pl': 5, listenPick: 2, contextTrueFalse: 7, sentenceOrder: 5, letterScramble: 1, translateType: 8, dictation: 4, wordFormation: 10, keyTransform: 8 },
    C1: { sentenceGap: 24, gapTranslate: 6, collocationPick: 10, 'meaningPick:pl-en': 3, 'meaningPick:en-pl': 4, listenPick: 2, contextTrueFalse: 8, sentenceOrder: 5, letterScramble: 1, translateType: 8, dictation: 4, wordFormation: 11, keyTransform: 11 },
};

const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const H = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
const DAY = 24 * 3600_000;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

class TimeoutError extends Error { constructor(m) { super(m); this.name = 'TimeoutError'; } }
const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms} ms`)), Math.max(1, ms));
    t.unref?.();
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

// ---------------------------------------------------------------- request validation

const toMs = (x) => {
    if (x == null || x === '' || x === false) return null;
    if (typeof x === 'number' && Number.isFinite(x)) return x;
    if (typeof x === 'string') { const t = Date.parse(x); return Number.isFinite(t) ? t : null; }
    return null;
};

/** Returns { ok, value } or { ok:false, error, code, status? }. Terms/set/level/userRef are validated by the track-generate rules. */
export function validateStageRequest(body) {
    const bad = (error, code = 'bad_request') => ({ ok: false, error, code });
    if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('JSON body required.');
    const base = validateTrackRequest({ setId: body.setId, level: body.level, terms: body.terms, userRef: body.userRef, ...(body.types != null ? { types: body.types } : {}) });
    if (!base.ok) return base;
    const { setId, level, terms, userRef, types } = base.value;
    let kind = 'station';
    if (body.kind != null) {
        if (!STAGE_KINDS.includes(body.kind)) return bad(`kind must be one of ${STAGE_KINDS.join(', ')}.`, 'bad_stage');
        kind = body.kind;
    }
    let stageIndex = 0;
    if (body.stageIndex != null) {
        const n = Number(body.stageIndex);
        if (!Number.isInteger(n) || n < 0 || n > 100000) return bad('stageIndex must be an integer 0–100000.', 'bad_stage');
        stageIndex = n;
    }
    let size = DEFAULT_SIZE[kind];
    if (body.size != null) {
        const n = Number(body.size);
        if (!Number.isInteger(n) || n < STAGE_LIMITS.minSize || n > STAGE_LIMITS.maxSize) return bad(`size must be an integer ${STAGE_LIMITS.minSize}–${STAGE_LIMITS.maxSize}.`, 'bad_size');
        size = n;
    }
    const ids = new Set(terms.map((t) => t.id));
    const progress = [];
    if (body.progress != null) {
        if (!Array.isArray(body.progress) || body.progress.length > STAGE_LIMITS.maxProgress) return bad(`progress must be an array of at most ${STAGE_LIMITS.maxProgress} entries.`, 'bad_progress');
        const seen = new Set();
        for (const p of body.progress) {
            if (!p || typeof p !== 'object' || Array.isArray(p)) return bad('Every progress entry must be an object { termId, ... }.', 'bad_progress');
            const rawId = p.termId ?? p.id;
            if (!(typeof rawId === 'string' || typeof rawId === 'number')) return bad('Every progress entry needs a termId.', 'bad_progress');
            const termId = clean(rawId);
            if (!ids.has(termId) || seen.has(termId)) continue; // other sets' words / duplicates are ignored
            seen.add(termId);
            const num = (x, lo, hi) => (x == null || x === '' || !Number.isFinite(Number(x)) ? undefined : clamp(Number(x), lo, hi));
            const entry = { termId };
            const strength = num(p.strength, 0, 1); if (strength !== undefined) entry.strength = strength;
            const intervalDays = num(p.intervalDays, 0, 3650); if (intervalDays !== undefined) entry.intervalDays = intervalDays;
            const wrongCount = num(p.wrongCount, 0, 999); if (wrongCount !== undefined) entry.wrongCount = Math.floor(wrongCount);
            const correctCount = num(p.correctCount, 0, 9999); if (correctCount !== undefined) entry.correctCount = Math.floor(correctCount);
            const ladderStep = num(p.ladderStep, 0, 3); if (ladderStep !== undefined) entry.ladderStep = Math.floor(ladderStep);
            const overdueDays = num(p.overdueDays, 0, 3650); if (overdueDays !== undefined) entry.overdueDays = overdueDays;
            if (typeof p.due === 'boolean') entry.due = p.due; else { const t = toMs(p.due); if (t != null) entry.dueAt = t; }
            if (typeof p.lastWrong === 'boolean') entry.lastWrongFlag = p.lastWrong; else { const t = toMs(p.lastWrong); if (t != null) entry.lastWrongAt = t; }
            const seenAt = toMs(p.lastSeenAt); if (seenAt != null) entry.lastSeenAt = seenAt;
            progress.push(entry);
        }
    }
    const strList = (x, max, maxLen, label, code) => {
        if (x == null) return { ok: true, list: [] };
        if (!Array.isArray(x)) return { ok: false, error: `${label} must be an array of strings.`, code };
        return { ok: true, list: x.filter((s) => typeof s === 'string' || typeof s === 'number').map((s) => clean(s).slice(0, maxLen)).filter(Boolean).slice(-max) };
    };
    const fps = strList(body.recentFingerprints, STAGE_LIMITS.maxRecentFps, 64, 'recentFingerprints', 'bad_recent');
    if (!fps.ok) return bad(fps.error, fps.code);
    const texts = strList(body.recentTexts, STAGE_LIMITS.maxRecentTexts, 160, 'recentTexts', 'bad_recent');
    if (!texts.ok) return bad(texts.error, texts.code);
    const focus = strList(body.focusTermIds, STAGE_LIMITS.maxFocus, 64, 'focusTermIds', 'bad_focus');
    if (!focus.ok) return bad(focus.error, focus.code);
    const focusTermIds = [...new Set(focus.list.filter((x) => ids.has(x)))];
    let budgetMs;
    if (body.budgetMs != null) {
        const n = Number(body.budgetMs);
        if (!Number.isFinite(n) || n < STAGE_LIMITS.minBudgetMs || n > STAGE_LIMITS.maxBudgetMs) return bad(`budgetMs must be ${STAGE_LIMITS.minBudgetMs}–${STAGE_LIMITS.maxBudgetMs}.`, 'bad_budget');
        budgetMs = Math.round(n);
    }
    let judge = true;
    if (body.judge != null) {
        if (typeof body.judge !== 'boolean') return bad('judge must be true or false.');
        judge = body.judge;
    }
    return {
        ok: true,
        value: {
            setId, level, terms, userRef, kind, stageIndex, size, progress, recentFingerprints: fps.list, recentTexts: texts.list, focusTermIds, judge,
            ...(budgetMs ? { budgetMs } : {}), ...(body.types != null ? { types } : {}),
        },
    };
}

// ---------------------------------------------------------------- fingerprints

const WORD_LEVEL = new Set(['meaningPick', 'listenPick', 'letterScramble']);
/** Items whose text is the set word itself (it has to come back in the SRS): never dropped as "already seen sentence", no frame / text memory. */
const REPEATABLE = new Set([...WORD_LEVEL, SENTENCE_PICK]);
const sentenceKey = (item) => norm(itemText(item)).replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();

/** `fp` = sentence + type (word-level tasks: type + direction + word). `textFp` = the sentence alone (any type). The app stores both strings of every item it saw. */
export function fingerprintsOf(item) {
    if (item.type === SENTENCE_PICK) return sentencePickFingerprints(item);
    if (WORD_LEVEL.has(item.type)) {
        const fp = H(`w|${item.type}${item.direction ? `:${item.direction}` : ''}|${item.lexiconId}`);
        return { fp, textFp: fp };
    }
    const text = sentenceKey(item);
    return { fp: H(`${item.type}|${text}`), textFp: H(`s|${text}`) };
}

const frameOf = (item) => (REPEATABLE.has(item.type) ? '' : sentenceKey(item).split(' ').slice(0, 3).join(' '));

// ---------------------------------------------------------------- word weights (SRS)

/** Strength 0..1 from the learner's SRS interval (days): doubling intervals add equal steps, 60 days ~ mastered. */
export function strengthFromInterval(days) { return clamp(Math.log(1 + Math.max(0, days)) / Math.log(61), 0, 1); }

/**
 * Weight of one word for this stage. Exponential in weakness (exp(2.2 * (1 - strength))): a brand-new / failed word is ~9x as likely as a mastered one;
 * due words are boosted by how overdue they are, a recent mistake adds more, mastered words that are not due are cut to ~0.2x.
 */
export function termWeight(prog, nowMs) {
    const known = prog && (prog.strength != null || prog.intervalDays != null || prog.correctCount > 0 || prog.wrongCount > 0 || prog.ladderStep != null);
    if (!known) return { w: 4, state: 'new', strength: 0, ladder: 0 };
    let strength = prog.strength != null ? prog.strength : (prog.intervalDays != null ? strengthFromInterval(prog.intervalDays) : 0.25);
    const total = (prog.correctCount || 0) + (prog.wrongCount || 0);
    if (prog.strength == null && prog.intervalDays == null && total) strength = clamp((prog.correctCount || 0) / total * 0.6, 0.05, 0.6);
    let w = Math.exp(2.2 * (1 - strength));
    const interval = Math.max(1, prog.intervalDays || 1);
    let overdue = prog.overdueDays != null ? prog.overdueDays : (prog.dueAt != null ? (nowMs - prog.dueAt) / DAY : 0);
    const due = prog.due === true || (prog.dueAt != null && prog.dueAt <= nowMs) || (prog.overdueDays != null && prog.overdueDays > 0);
    if (due) { overdue = Math.max(0, overdue); w *= 1.6 + 0.5 * Math.min(overdue / interval, 4); }
    const wrongRecently = prog.lastWrongFlag === true || (prog.lastWrongAt != null && nowMs - prog.lastWrongAt < 2 * DAY);
    if (wrongRecently) w *= 1.6;
    if ((prog.wrongCount || 0) >= 2) w *= 1.25;
    const mastered = strength >= 0.85 && !due && !wrongRecently;
    if (mastered) w *= 0.2;
    if (prog.lastSeenAt != null && nowMs - prog.lastSeenAt < 20 * 60_000) w *= 0.55; // just practised: let the others in
    const state = mastered ? 'mastered' : (wrongRecently || (prog.wrongCount || 0) >= 2 || strength < 0.3) ? 'weak' : due ? 'due' : 'learning';
    return { w: Math.max(0.05, w), state, strength, ladder: prog.ladderStep ?? (strength < 0.3 ? 0 : strength < 0.6 ? 1 : strength < 0.85 ? 2 : 3) };
}

/** Weighted sampling without replacement (Efraimidis-Spirakis). */
export function weightedSample(items, weightOf, k, rand = Math.random) {
    return items
        .map((it) => ({ it, key: Math.pow(Math.max(1e-9, rand()), 1 / Math.max(1e-6, weightOf(it))) }))
        .sort((a, b) => b.key - a.key).slice(0, k).map((x) => x.it);
}

// ---------------------------------------------------------------- planning

/** Polish-answer items form the first block of a stage (site rule), so a stage holds only a few of them. */
const PL_ANSWER_CAP = (size) => Math.max(1, Math.ceil(size / 6));

export function allowedSlots(level, types) {
    const set = new Set(types && types.length ? types : typesForLevel(level));
    const out = [];
    for (const [slot, w] of Object.entries(SLOT_MIX[level] || SLOT_MIX.B1)) {
        const ty = slotType(slot);
        if (!set.has(ty) || !typesForLevel(level).includes(ty)) continue;
        if (level === 'A1' && A1_TYPED.has(ty)) continue;
        if (w > 0) out.push(slot);
    }
    return out;
}

/**
 * planStage -> { entries: [{ term, slot, spare, state }], meta }. `size` real entries + `spares` extra ones (other words where possible).
 * Words: spread over the set (all different when the set has >= size words; a due / weak word of a station may get a 2nd item; max `maxPerWord`),
 * recap / daily rounds mix as many different words as the set has. Slots: the level mix, bent by each word's ladder step, never the same
 * slot more than ceil(size/2) times, a word's two items always of different slots, a word-level task the learner saw recently is down-weighted.
 */
export function planStage({ level, terms, progress = [], size, kind = 'station', types, recent = new Set(), focusIds = [], nowMs = Date.now(), rand = Math.random, spares = STAGE_LIMITS.spares, avoidSlots = new Map() }) {
    const byId = new Map(progress.map((p) => [p.termId, p]));
    const info = new Map(terms.map((t) => [t.id, termWeight(byId.get(t.id), nowMs)]));
    const slots = allowedSlots(level, types);
    if (!slots.length) return { entries: [], meta: { distinctTerms: 0, maxPerWord: 0, words: [] } };
    const mix = SLOT_MIX[level] || SLOT_MIX.B1;
    const nTerms = terms.length;
    const mixKinds = kind === 'recap' || kind === 'daily';
    let pool = terms;
    if (focusIds.length) {
        const focus = terms.filter((t) => focusIds.includes(t.id));
        const want = Math.min(nTerms, mixKinds ? Math.max(size, 5) : Math.max(size, 4));
        if (focus.length >= want) pool = focus;
        else pool = [...focus, ...weightedSample(terms.filter((t) => !focusIds.includes(t.id)), (t) => info.get(t.id).w * 0.6, want - focus.length, rand)];
    }
    const poolDistinct = pool.length;
    // how many items per word: all words different when there are enough (a station may double one due / weak word)
    const maxPerWord = nTerms >= size ? (mixKinds ? 1 : STAGE_LIMITS.maxPerWord) : Math.max(1, Math.ceil(size / nTerms));
    const weightOf = (t) => info.get(t.id).w;
    const entries = []; const perWord = new Map(); const slotUse = new Map();
    const slotCapReal = Math.max(2, Math.ceil(size / 2)); const slotCapSpare = Math.max(2, Math.ceil((size + spares) / 2));
    const typeUse = new Map();
    const chooseSlot = (term, taken, spare) => {
        // Karol's rule: a sentence / question term is always practised as "Wybierz poprawne zdanie:" (two alternatives, one with a mistake)
        if (isSentenceTerm(term)) return taken.has(SENTENCE_PICK) ? null : SENTENCE_PICK;
        const inf = info.get(term.id);
        let cand = slots.filter((sl) => !taken.has(sl) && !(slotType(sl) === 'letterScramble' && !scrambleWordOf(term))
            && !(slotType(sl) === 'sentenceOrder' && termTokens(term.en).length > 3));
        if (!cand.length) return null;
        // a word is only given tasks one ladder step above where it stands (new words: recognise / assemble, never typed)
        const ready = cand.filter((sl) => kind === 'boss' || (TYPE_STEP[slotType(sl)] ?? 1) <= inf.ladder + 1);
        if (ready.length) cand = ready;
        const ranked = cand.map((sl) => {
            const ty = slotType(sl);
            const step = TYPE_STEP[ty] ?? 1;
            let w = mix[sl];
            if (step === inf.ladder) w *= 1.5;
            else if (step < inf.ladder) w *= 0.75;
            if (kind === 'boss') w *= 1 + step;
            if (inf.state === 'weak' && step === 0) w *= 1.4;
            w *= Math.pow(sl === 'sentenceGap' ? 0.8 : 0.4, slotUse.get(sl) || 0); // the gap-choice task may repeat; others rarely do
            w *= Math.pow(0.6, typeUse.get(ty) || 0);
            if (WORD_LEVEL.has(ty) && recent.has(H(`w|${ty}${sl.includes(':') ? `:${sl.split(':')[1]}` : ''}|${term.id}`))) w *= 0.15;
            if (slotUse.get(sl) >= (spare ? slotCapSpare : slotCapReal)) w *= 0.02;
            if (sl === 'meaningPick:en-pl' && (slotUse.get(sl) || 0) >= PL_ANSWER_CAP(size)) w *= 0.001; // Polish-answer tasks sit together at the start: keep that block short
            return { sl, w };
        });
        return weightedSample(ranked, (r) => r.w, 1, rand)[0].sl;
    };
    const add = (term, spare) => {
        const taken = new Set([...entries.filter((e) => e.term.id === term.id).map((e) => e.slot), ...(avoidSlots.get(term.id) || [])]);
        const sl = chooseSlot(term, taken, spare);
        if (!sl) return false;
        entries.push({ term, slot: sl, spare, state: info.get(term.id).state });
        perWord.set(term.id, (perWord.get(term.id) || 0) + 1);
        slotUse.set(sl, (slotUse.get(sl) || 0) + 1);
        typeUse.set(slotType(sl), (typeUse.get(slotType(sl)) || 0) + 1);
        return true;
    };
    // station: when a chosen word is due / weak, it is practised twice (second item = a different task); every other word appears once
    const wantDouble = kind === 'station' && nTerms > size && size >= 5;
    const chosen = weightedSample(pool, weightOf, Math.min(size - (wantDouble ? 1 : 0), poolDistinct), rand);
    for (const t of chosen) add(t, false);
    if (wantDouble) {
        const hot = chosen.filter((t) => ['weak', 'due'].includes(info.get(t.id).state)).sort((a, b) => weightOf(b) - weightOf(a))[0];
        if (hot) add(hot, false);
    }
    // top up to `size` real entries: second item for the hottest word first, then more words of the rest of the set
    let guard = 0;
    while (entries.filter((e) => !e.spare).length < size && guard++ < 60) {
        const open = terms.filter((t) => (perWord.get(t.id) || 0) < maxPerWord);
        const fresh = open.filter((t) => !perWord.has(t.id));
        const from = fresh.length && entries.filter((e) => !e.spare).length < Math.min(size, nTerms) ? fresh : open;
        if (!from.length) break;
        const t = weightedSample(from, weightOf, 1, rand)[0];
        if (!add(t, false)) { perWord.set(t.id, maxPerWord); }
    }
    // spares: other words first (a rejected item is replaced by a different word), then second items
    guard = 0;
    while (entries.length < size + spares && guard++ < 60) {
        const open = terms.filter((t) => (perWord.get(t.id) || 0) < maxPerWord);
        const fresh = open.filter((t) => !perWord.has(t.id));
        const from = fresh.length ? fresh : open;
        if (!from.length) break;
        const t = weightedSample(from, weightOf, 1, rand)[0];
        if (!add(t, true)) perWord.set(t.id, maxPerWord);
    }
    const states = {};
    for (const e of entries.filter((x) => !x.spare)) states[e.state] = (states[e.state] || 0) + 1;
    return {
        entries,
        meta: {
            distinctTerms: new Set(entries.filter((e) => !e.spare).map((e) => e.term.id)).size, maxPerWord,
            states, words: entries.filter((e) => !e.spare).map((e) => ({ termId: e.term.id, slot: e.slot, state: e.state })),
        },
    };
}

/** Order a stage: Polish-answer items first (site rule), then English-answer ones; inside a block no two equal types in a row (same word never adjacent) where possible. */
export function orderStage(items, rand = Math.random) {
    if (items.length < 3) return items.slice().sort((a, b) => (answerLangOf(a) === 'pl' ? 0 : 1) - (answerLangOf(b) === 'pl' ? 0 : 1));
    const pl = items.filter((i) => answerLangOf(i) === 'pl');
    const en = items.filter((i) => answerLangOf(i) !== 'pl');
    const slotKey = (i) => `${i.type}${i.direction ? `:${i.direction}` : ''}`;
    const cost = (list) => {
        let c = 0;
        for (let k = 1; k < list.length; k++) {
            const a = list[k - 1]; const b = list[k];
            if (slotKey(a) === slotKey(b)) c += 3; else if (a.type === b.type) c += 2;
            if (a.lexiconId === b.lexiconId) c += 4;
        }
        return c;
    };
    const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    let best = [...pl, ...en]; let bestCost = cost(best);
    for (let n = 0; n < 300 && bestCost > 0; n++) {
        const cand = [...shuffle(pl), ...shuffle(en)];
        const c = cost(cand);
        if (c < bestCost) { best = cand; bestCost = c; }
    }
    return best;
}

// ---------------------------------------------------------------- deterministic fallback (no AI, no sentences)

const BASIC_PAIRS = [['apple', 'jabłko'], ['house', 'dom'], ['dog', 'pies'], ['water', 'woda'], ['book', 'książka'], ['table', 'stół'], ['milk', 'mleko'], ['car', 'samochód'],
    ['tree', 'drzewo'], ['bread', 'chleb'], ['window', 'okno'], ['chair', 'krzesło'], ['school', 'szkoła'], ['friend', 'przyjaciel'], ['cat', 'kot'], ['door', 'drzwi']];

const optionPool = (term, terms, field, answer) => {
    const out = []; const seen = new Set([norm(answer)]);
    const push = (v) => { const c = clean(v); if (c && !seen.has(norm(c)) && c.length <= 40) { seen.add(norm(c)); out.push(c); } };
    for (const t of terms) if (t.id !== term.id) push(pickTermVariant(t[field]));
    for (const [en, pl] of BASIC_PAIRS) push(field === 'en' ? en : pl);
    return out;
};

/** meaningPick / listenPick (and letterScramble from A2) built from the set's own words, validated by the normal builders. null when it cannot be built. */
export function templateItem(term, slot, terms, level, rand = Math.random, { avoidWrong = [] } = {}) {
    const ty = slotType(slot);
    if (ty === SENTENCE_PICK) return ruleSentencePick(term, level, rand, { avoidWrong });
    let raw;
    if (ty === 'meaningPick') {
        const direction = slot.split(':')[1];
        const answerForPool = direction === 'pl-en' ? pickTermVariant(term.en) : pickTermVariant(term.pl);
        const pool = optionPool(term, terms, direction === 'pl-en' ? 'en' : 'pl', answerForPool);
        raw = { type: 'meaningPick', direction, distractors: weightedSample(pool.slice(0, 12), () => 1, 3, rand) };
    } else if (ty === 'listenPick') {
        const pool = optionPool(term, terms, 'en', pickTermVariant(term.en));
        raw = { type: 'listenPick', distractors: weightedSample(pool.slice(0, 12), () => 1, 3, rand) };
    } else if (ty === 'letterScramble') {
        const w = scrambleWordOf(term);
        if (!w) return null;
        raw = { type: 'letterScramble', answer: w, variantUsed: w, hint: pickTermVariant(term.pl) };
    } else return null;
    const built = buildItem({ termId: term.id, ...raw }, term, level, terms);
    if (!built.ok || finalCheck(built.item, term)) return null;
    return reshuffleOptions(built.item, term, terms, rand, level);
}

// ---------------------------------------------------------------- per-learner short memory (only a safety net; the app sends its own)

export function createStageMemory({ limits = STAGE_LIMITS, now = () => Date.now() } = {}) {
    const map = new Map();
    const get = (key) => {
        const e = map.get(key);
        if (!e) return null;
        if (now() - e.at > limits.memoryTtlMs) { map.delete(key); return null; }
        return e;
    };
    return {
        recentFps: (key) => get(key)?.fps || [],
        recentTexts: (key) => get(key)?.texts || [],
        items: (key) => get(key)?.items || [],
        remember(key, served) {
            const e = get(key) || { fps: [], texts: [], items: [], at: now() };
            for (const it of served) {
                e.fps.push(it.fp, it.textFp);
                if (!REPEATABLE.has(it.type)) e.texts.push(sentenceKey(it).slice(0, 160));
                if (it.source === 'ai') e.items.push(it);
            }
            e.fps = e.fps.slice(-limits.memoryFps); e.texts = e.texts.slice(-limits.memoryTexts); e.items = e.items.slice(-limits.memoryItems);
            e.at = now();
            map.delete(key); map.set(key, e);
            while (map.size > limits.memoryKeys) map.delete(map.keys().next().value);
        },
        size: () => map.size,
    };
}

// ---------------------------------------------------------------- generator

function createSemaphore(max) {
    let free = max; const q = [];
    return {
        acquire: () => new Promise((resolve) => { q.push(resolve); while (free > 0 && q.length) { free--; q.shift()(); } }),
        release: () => { free++; while (free > 0 && q.length) { free--; q.shift()(); } },
    };
}

const STAGE_NOTES = (level, recentTexts) => [
    'STAGE VARIETY (this is one short stage of 5-8 items for ONE learner; the items must feel different from each other):',
    '- Use a different sentence frame, subject and situation in every item: vary the subject (I, you, he, she, we, my mum, the boy, our teacher ...), the verb and the nouns around the target; never start two items with the same two words.',
    level === 'A1' || level === 'A2'
        ? '- At A1/A2 the short frame is fine, but do not repeat "I have a red ___" again and again: change the subject, the colour/size/adjective and the verb (have, like, want, wear, see, is/are).'
        : '- Vary the topic, the grammar frame and the clue type between items.',
    '- Write only the wanted items; they come from different words of one set.',
    ...(recentTexts.length ? ['ALREADY SHOWN TO THIS LEARNER (do NOT write these or close paraphrases):', ...recentTexts.slice(-20).map((t) => `- ${JSON.stringify(t)}`)] : []),
];

export function createStageGenerator({
    runPrompt, judge = null, budget = null, isConfigured = () => true, limits = STAGE_LIMITS, now = () => Date.now(), rand = Math.random,
    log = () => {}, memory = createStageMemory({ limits, now }),
} = {}) {
    const sem = createSemaphore(limits.globalCallConcurrency);

    async function capped() {
        if (!budget) return false;
        try { const cap = Number(budget.dailyCalls) || 0; return cap > 0 && (await budget.callsToday()) >= cap; } catch (e) { log(`stage budget read failed: ${e?.message || e}`); return false; }
    }
    const count = async (n) => { if (budget?.addCalls && n > 0) await budget.addCalls(n).catch((e) => log(`stage budget write failed: ${e?.message || e}`)); };

    /** Validate one raw AI item against the wanted (term, slot) entries; pushes a candidate or a rejection reason. */
    function acceptRaw(raw, ctx) {
        const { level, terms, wantsByTerm, cands, recent, recentTexts, rejects, stats } = ctx;
        const termId = String(raw?.termId ?? '');
        const term = terms.find((t) => t.id === termId);
        const need = wantsByTerm.get(termId);
        if (!term || !need) return;
        const built = buildItem(raw, term, level, terms);
        if (!built.ok) { rejects.push({ termId, reason: built.reason }); stats.rejected.validator++; return; }
        const entry = need.find((e) => e.slot === built.slot && !e.done);
        if (!entry) return; // not wanted (or already served by an earlier item)
        if (level === 'A1' && A1_TYPED.has(built.item.type)) { stats.rejected.validator++; return; }
        const fc = finalCheck(built.item, term);
        if (fc) { rejects.push({ termId, reason: fc }); stats.rejected.validator++; return; }
        const finished = reshuffleOptions(built.item, term, terms, rand, level);
        if (!finished) { rejects.push({ termId, reason: 'item not usable' }); stats.rejected.validator++; return; }
        finished.lexiconId = term.id;
        const fp = fingerprintsOf(finished);
        if (!WORD_LEVEL.has(finished.type) && (recent.has(fp.fp) || recent.has(fp.textFp))) { stats.rejected.duplicate++; return; }
        const text = sentenceKey(finished);
        if (!WORD_LEVEL.has(finished.type) && (recentTexts.some((t) => jaccard(t, text) >= NEAR_DUPLICATE) || cands.some((c) => !WORD_LEVEL.has(c.item.type) && jaccard(sentenceKey(c.item), text) >= NEAR_DUPLICATE))) {
            stats.rejected.duplicate++; return;
        }
        entry.done = true;
        cands.push({ entry, term, slot: entry.slot, item: finished, spare: entry.spare, ok: true, judged: false, ...fp });
    }

    /** One AI wrong copy for a sentence term -> a sentencePick candidate (validated in track-sentence-pick.js). */
    function acceptSentencePick(raw, ctx) {
        const { level, terms, wantsByTerm, cands, recent, rejects, stats } = ctx;
        const termId = String(raw?.termId ?? '');
        const term = terms.find((t) => t.id === termId);
        const entry = (wantsByTerm.get(termId) || []).find((e) => e.slot === SENTENCE_PICK && !e.done);
        if (!term || !entry) return;
        const built = buildSentencePick(raw, term, level, rand, { source: 'ai' });
        if (!built.ok) { rejects.push({ termId, reason: built.reason }); stats.rejected.validator++; return; }
        const fp = fingerprintsOf(built.item);
        if (recent.has(fp.fp)) { stats.rejected.duplicate++; return; } // this exact pair was shown lately: a rule-built one with another mistake replaces it
        entry.done = true;
        cands.push({ entry, term, slot: SENTENCE_PICK, item: built.item, spare: entry.spare, ok: true, judged: false, ...fp });
    }

    /** Every wanted sentencePick that has no usable candidate gets a rule-built one (another mistake than the ones already tried). */
    function fillSentencePicks(ctx, { skipJudge = false } = {}) {
        for (const list of ctx.wantsByTerm.values()) {
            for (const entry of list) {
                if (entry.slot !== SENTENCE_PICK) continue;
                const mine = ctx.cands.filter((c) => c.entry === entry);
                if (mine.some((c) => c.ok)) continue;
                const avoidWrong = mine.map((c) => c.item.wrongOption);
                let item = ruleSentencePick(entry.term, ctx.level, rand, { avoidWrong });
                if (item && ctx.recent.has(fingerprintsOf(item).fp)) item = ruleSentencePick(entry.term, ctx.level, rand, { avoidWrong: [...avoidWrong, item.wrongOption] }) || item;
                if (!item) continue;
                entry.done = true;
                ctx.stats.ruleSentencePicks = (ctx.stats.ruleSentencePicks || 0) + 1;
                ctx.cands.push({ entry, term: entry.term, slot: SENTENCE_PICK, item, spare: entry.spare, ok: true, judged: false, skipJudge, ...fingerprintsOf(item) });
            }
        }
    }

    async function genRound(ctx, entries, deadlineAt, round) {
        const { level, terms, stats, recentTexts } = ctx;
        const wantsByTerm = new Map();
        for (const e of entries) { const arr = wantsByTerm.get(e.term.id) || []; arr.push({ slot: e.slot, spare: e.spare, term: e.term }); wantsByTerm.set(e.term.id, arr); }
        ctx.wantsByTerm = wantsByTerm;
        const jobs = [...wantsByTerm.entries()].map(([id, list]) => ({ term: list[0].term, slots: new Set(list.map((x) => x.slot).filter((sl) => sl !== SENTENCE_PICK)), avoid: [] }))
            .filter((j) => j.slots.size);
        const calls = jobs.length ? planCalls(jobs, limits.callWeight) : [];
        const notes = STAGE_NOTES(level, recentTexts);
        // sentence / question terms: one small call of their own (the wrong copy with one typical mistake), in parallel with the others
        const spJobs = [...wantsByTerm.values()].flatMap((list) => list.filter((x) => x.slot === SENTENCE_PICK)).map((x) => x.term)
            .filter((t, i, arr) => arr.findIndex((u) => u.id === t.id) === i)
            .map((term, i) => ({ term, preferKind: SENTENCE_PICK_KINDS[(i + Math.floor(rand() * SENTENCE_PICK_KINDS.length)) % SENTENCE_PICK_KINDS.length] }));
        const spCall = spJobs.length ? (async () => {
            await sem.acquire();
            const t0 = now();
            let called = false;
            try {
                const remaining = deadlineAt - now();
                if (remaining < 2500) { stats.timedOut = true; return; }
                called = true; stats.aiCalls++; stats.genCalls++;
                const raw = await withTimeout(runPrompt(buildSentencePickPrompt({ level, jobs: spJobs }), `stage-${level}-r${round}-sentencePick-${spJobs.length}`), Math.min(limits.perCallTimeoutMs, remaining), 'AI call');
                log(`stage sentencePick call round ${round} ${now() - t0}ms`);
                for (const r of Array.isArray(raw?.items) ? raw.items : []) acceptSentencePick(r, ctx);
            } catch (e) {
                if (e instanceof TimeoutError) stats.timedOut = true; else stats.aiErrors++;
                log(`stage sentencePick call failed after ${now() - t0}ms: ${e?.message || e}`);
            } finally { sem.release(); if (called) await count(1); }
        })() : null;
        await Promise.all([...(spCall ? [spCall] : []), ...calls.map(async (parts, idx) => {
            const batchTerms = parts.map((p) => p.term);
            const wants = new Map(parts.map((p) => [p.term.id, p.slots]));
            const prompt = buildTrackPrompt({ level, terms: batchTerms, setTerms: terms, wants, feedback: [], avoid: new Map(), notes });
            await sem.acquire();
            const t0 = now();
            let called = false;
            try {
                const remaining = deadlineAt - now();
                if (remaining < 2500) { stats.timedOut = true; return; }
                called = true; stats.aiCalls++; stats.genCalls++;
                const raw = await withTimeout(runPrompt(prompt, `stage-${level}-r${round}-${parts.length}t`), Math.min(limits.perCallTimeoutMs, remaining), 'AI call');
                log(`stage gen call ${idx} round ${round} ${now() - t0}ms`);
                for (const r of Array.isArray(raw?.items) ? raw.items : []) acceptRaw(r, ctx);
            } catch (e) {
                if (e instanceof TimeoutError) stats.timedOut = true; else stats.aiErrors++;
                log(`stage gen call ${idx} failed after ${now() - t0}ms: ${e?.message || e}`);
            } finally { sem.release(); if (called) await count(1); }
        })]);
    }

    async function judgeRound(ctx, deadlineAt) {
        const { level, stats, cands } = ctx;
        if (!judge || typeof judge.judgeRows !== 'function') return;
        const todo = cands.filter((c) => c.ok && !c.judged && !c.skipJudge);
        if (!todo.length) return;
        const chunks = [];
        for (let i = 0; i < todo.length; i += limits.judgeBatch) chunks.push(todo.slice(i, i + limits.judgeBatch));
        await Promise.all(chunks.map(async (chunk) => {
            const remaining = Math.min(limits.judgeTimeoutMs, deadlineAt - now() - 300);
            if (remaining < 2000) { chunk.forEach((c) => { c.skipJudge = true; }); return; }
            const rows = chunk.map((c, i) => ({ entry: { id: `st${i}`, item: c.item }, term: c.term }));
            try {
                const res = await withTimeout(Promise.resolve(judge.judgeRows(level, rows)), remaining, 'clarity judge');
                const calls = Number.isFinite(res?.calls) ? res.calls : 1;
                stats.judgeCalls += calls; stats.aiCalls += calls;
            } catch (e) { log(`stage judge failed: ${e?.message || e}`); chunk.forEach((c) => { c.skipJudge = true; }); return; }
            for (const c of chunk) {
                const v = c.item.clarity;
                if (!v) { c.skipJudge = true; continue; }
                c.judged = true;
                if (v.verdict === 'unclear') { c.ok = false; stats.rejected.judge++; ctx.rejects.push({ termId: c.term.id, reason: v.note || (v.issues || []).join(',') || 'unclear' }); }
            }
        }));
    }

    /** Pick `size` candidates: real plan entries first, then spares; at most `maxPerWord` per word, slots and sentence frames kept varied. */
    function selectFinal(cands, size, maxPerWord) {
        const ok = cands.filter((c) => c.ok).sort((a, b) => (a.spare - b.spare));
        const picked = []; const perWord = new Map(); const perSlot = new Map(); const perFrame = new Map();
        const slotCap = Math.max(2, Math.ceil(size / 2));
        for (const pass of [0, 1]) {
            for (const c of ok) {
                if (picked.length >= size) break;
                if (picked.includes(c)) continue;
                if ((perWord.get(c.term.id) || 0) >= maxPerWord) continue;
                if (c.slot === 'meaningPick:en-pl' && (perSlot.get(c.slot) || 0) >= PL_ANSWER_CAP(size)) continue;
                const fr = frameOf(c.item);
                if (pass === 0 && ((perSlot.get(c.slot) || 0) >= slotCap || (fr && (perFrame.get(fr) || 0) >= 1))) continue;
                picked.push(c);
                perWord.set(c.term.id, (perWord.get(c.term.id) || 0) + 1);
                perSlot.set(c.slot, (perSlot.get(c.slot) || 0) + 1);
                if (fr) perFrame.set(fr, (perFrame.get(fr) || 0) + 1);
            }
        }
        return picked;
    }

    async function generate(v, key = 'anon') {
        const started = now();
        const budgetMs = v.budgetMs || limits.defaultBudgetMs;
        const deadlineAt = started + budgetMs;
        const level = v.level;
        const stats = { aiCalls: 0, genCalls: 0, judgeCalls: 0, aiErrors: 0, timedOut: false, rejected: { validator: 0, judge: 0, duplicate: 0 } };
        const memKey = `${key}|${v.setId}`;
        const recent = new Set([...v.recentFingerprints, ...memory.recentFps(memKey)]);
        const recentTexts = [...new Set([...v.recentTexts.map((t) => norm(t)), ...memory.recentTexts(memKey)])].slice(-limits.memoryTexts);
        const nowMs = now();
        const plan = planStage({ level, terms: v.terms, progress: v.progress, size: v.size, kind: v.kind, types: v.types, recent, focusIds: v.focusTermIds, nowMs, rand });
        const planned = plan.entries.filter((e) => !e.spare).length;
        const ctx = { level, terms: v.terms, cands: [], recent, recentTexts, rejects: [], stats, wantsByTerm: new Map() };
        const aiConfigured = Boolean(runPrompt) && isConfigured();
        const capReached = aiConfigured ? await capped() : false;
        let aiOn = aiConfigured && !capReached && plan.entries.length > 0;
        let rounds = 0;
        const useJudge = Boolean(judge) && v.judge !== false;
        let final = [];
        if (aiOn) {
            let entries = plan.entries;
            for (let round = 0; round < limits.maxRounds; round++) {
                const remaining = deadlineAt - now();
                if (round > 0 && remaining < (useJudge ? limits.retryMinMs : limits.retryMinNoJudgeMs)) break;
                rounds++;
                const genDeadline = deadlineAt - (useJudge ? limits.judgeReserveMs : 1200);
                await genRound(ctx, entries, Math.max(genDeadline, now() + 4000), round);
                fillSentencePicks(ctx); // AI copy missing / invalid -> rule-built copy (judged with the rest)
                if (useJudge) await judgeRound(ctx, deadlineAt);
                fillSentencePicks(ctx, { skipJudge: true }); // the judge found the wrong copy acceptable English -> another, rule-built mistake
                final = selectFinal(ctx.cands, v.size, plan.meta.maxPerWord);
                if (final.length >= v.size) break;
                // round 2: what is still missing, as other words / task types than the ones that just failed
                const have = new Set(ctx.cands.filter((c) => c.ok).map((c) => `${c.term.id}|${c.slot}`));
                const failedSlots = new Map();
                for (const e of plan.entries) if (!have.has(`${e.term.id}|${e.slot}`)) failedSlots.set(e.term.id, [...(failedSlots.get(e.term.id) || []), e.slot]);
                const missing = v.size - final.length;
                const pickedTerms = new Map(); final.forEach((c) => pickedTerms.set(c.term.id, (pickedTerms.get(c.term.id) || 0) + 1));
                const replan = planStage({
                    level, terms: v.terms.filter((t) => (pickedTerms.get(t.id) || 0) < plan.meta.maxPerWord), progress: v.progress, size: missing, kind: 'recap', types: v.types, recent, focusIds: [], nowMs, rand, spares: 1,
                    avoidSlots: new Map([...failedSlots].map(([id, list]) => [id, new Set(list)])),
                });
                entries = replan.entries;
                if (!entries.length) break;
            }
        }
        const ruleBuilt = (c) => c.item.type === SENTENCE_PICK && c.item.variantSource === 'rule';
        const sources = { ai: final.filter((c) => !ruleBuilt(c)).length, template: final.filter(ruleBuilt).length, reuse: 0 };
        let outItems = final.map((c) => ({ ...c.item, source: ruleBuilt(c) ? 'template' : 'ai', judged: c.judged, fp: c.fp, textFp: c.textFp }));
        let fallback = null;
        // fallback 1: the set's own words as meaningPick / listenPick (no sentences, always valid)
        if (outItems.length < v.size) {
            fallback = !aiConfigured ? 'ai_not_configured' : capReached ? 'daily_cap_reached' : stats.aiErrors && stats.aiErrors >= stats.genCalls ? 'ai_failed' : stats.timedOut && !outItems.length ? 'ai_timeout' : 'partial';
            const used = new Map(outItems.map((i) => [i.lexiconId, 0]));
            outItems.forEach((i) => used.set(i.lexiconId, (used.get(i.lexiconId) || 0) + 1));
            const info = new Map(v.terms.map((t) => [t.id, termWeight(v.progress.find((p) => p.termId === t.id), nowMs)]));
            const slotPref = level === 'A1' ? ['meaningPick:pl-en', 'listenPick', 'meaningPick:en-pl'] : ['meaningPick:pl-en', 'listenPick', 'meaningPick:en-pl', 'letterScramble'];
            const allowed = new Set(allowedSlots(level, v.types));
            const prefs = slotPref.filter((s) => allowed.has(s)).length ? slotPref.filter((s) => allowed.has(s)) : slotPref;
            const cap = plan.meta.maxPerWord || 2;
            let guard = 0;
            while (outItems.length < v.size && guard++ < v.size * 8) {
                const open = v.terms.filter((t) => (used.get(t.id) || 0) < cap);
                if (!open.length) break;
                const fresh = open.filter((t) => !used.has(t.id) || !used.get(t.id));
                const t = weightedSample(fresh.length ? fresh : open, (x) => info.get(x.id).w, 1, rand)[0];
                const rot = outItems.length % prefs.length;
                const sentence = isSentenceTerm(t);
                const order = sentence ? [SENTENCE_PICK] : [...prefs.slice(rot), ...prefs.slice(0, rot)]; // rotate the task types so the plain stage still varies
                let made = null; let backup = null;
                for (const sl of order) {
                    if (!sentence && outItems.some((i) => i.lexiconId === t.id && `${i.type}${i.direction ? `:${i.direction}` : ''}` === sl)) continue;
                    if (sl === 'meaningPick:en-pl' && outItems.filter((i) => i.type === 'meaningPick' && i.direction === 'en-pl').length >= PL_ANSWER_CAP(v.size)) continue;
                    const it = templateItem(t, sl, v.terms, level, rand, { avoidWrong: outItems.filter((i) => i.lexiconId === t.id && i.type === SENTENCE_PICK).map((i) => i.wrongOption) });
                    if (!it) continue;
                    it.lexiconId = t.id;
                    const fp = fingerprintsOf(it);
                    const cand = { ...it, source: 'template', judged: false, fp: fp.fp, textFp: fp.textFp };
                    if (recent.has(fp.fp)) { backup = backup || cand; continue; } // seen recently: prefer another type of the same word
                    made = cand; break;
                }
                made = made || backup;
                if (made) { outItems.push(made); sources.template++; used.set(t.id, (used.get(t.id) || 0) + 1); } else used.set(t.id, cap);
            }
            // fallback 2 (last resort): this learner's earlier fresh items of this set (kept only for this process's memory)
            if (outItems.length < v.size) {
                const have = new Set(outItems.map((i) => i.fp));
                const ids = new Set(v.terms.map((t) => t.id));
                for (const it of memory.items(memKey).slice().reverse()) {
                    if (outItems.length >= v.size) break;
                    if (!ids.has(it.lexiconId) || have.has(it.fp) || (level === 'A1' && A1_TYPED.has(it.type))) continue;
                    outItems.push({ ...it, source: 'reuse', judged: it.judged });
                    have.add(it.fp); sources.reuse++;
                }
            }
        }
        const ordered = orderStage(outItems, rand).slice(0, v.size).map((it, n) => {
            const out = { ...it };
            delete out.clarity;
            out.id = `st${v.stageIndex}-${n + 1}-${out.lexiconId}-${slotType(out.type)}${out.direction ? `-${out.direction}` : ''}`;
            return out;
        });
        memory.remember(memKey, ordered);
        const termIds = [...new Set(ordered.map((i) => i.lexiconId))];
        const elapsedMs = now() - started;
        log(`stage ${level} ${v.kind}#${v.stageIndex} size ${v.size}: ${ordered.length} items (${sources.ai} ai, ${sources.template} template, ${sources.reuse} reuse), ${stats.genCalls} gen + ${stats.judgeCalls} judge calls, ${rounds} round(s), ${elapsedMs}ms${fallback ? ` fallback=${fallback}` : ''}`);
        return {
            items: ordered,
            meta: {
                setId: v.setId, level, promptVersion: PROMPT_VERSION, kind: v.kind, stageIndex: v.stageIndex, size: v.size, returned: ordered.length,
                source: sources, fallback, aiConfigured, dailyCapReached: capReached,
                aiCalls: stats.aiCalls, genCalls: stats.genCalls, judgeCalls: stats.judgeCalls, aiErrors: stats.aiErrors, rounds,
                judged: ordered.filter((i) => i.judged).length, rejected: stats.rejected, timedOut: stats.timedOut,
                sentencePick: { served: ordered.filter((i) => i.type === SENTENCE_PICK).length, ruleBuilt: ordered.filter((i) => i.type === SENTENCE_PICK && i.variantSource === 'rule').length },
                distinctTerms: termIds.length, termIds, maxPerWord: plan.meta.maxPerWord, plan: { states: plan.meta.states, planned },
                budgetMs, elapsedMs,
            },
        };
    }
    generate.memory = memory;
    return generate;
}

// ---------------------------------------------------------------- limiter + express handler

export function createStageLimiter({ now = () => Date.now(), limits = STAGE_LIMITS } = {}) {
    const hits = new Map(); const busy = new Map(); let running = 0;
    return {
        check(key) {
            const t = now();
            const list = (hits.get(key) || []).filter((x) => t - x < limits.userWindowMs);
            if (list.length) hits.set(key, list); else hits.delete(key);
            if ((busy.get(key) || 0) >= limits.userConcurrent) return { ok: false, code: 'busy', error: 'Stages for this learner are already being generated.', retryAfterSec: 5 };
            if (running >= limits.globalConcurrent) return { ok: false, code: 'server_busy', error: 'The generator is busy. Try again shortly.', retryAfterSec: 8 };
            if (list.length >= limits.userMax) return { ok: false, code: 'rate_limited', error: 'Too many stage requests. Slow down.', retryAfterSec: Math.ceil((limits.userWindowMs - (t - list[0])) / 1000) };
            return { ok: true };
        },
        start(key) { const t = now(); busy.set(key, (busy.get(key) || 0) + 1); running++; hits.set(key, [...(hits.get(key) || []), t]); },
        finish(key) { const n = (busy.get(key) || 1) - 1; if (n > 0) busy.set(key, n); else busy.delete(key); running = Math.max(0, running - 1); },
        stats: () => ({ running }),
    };
}

/** Auth like track-generate: signed bridge headers (server to server) or a study session / Bearer session. Mount after the route's express.json({ verify }) that sets req.rawBody. */
export function createTrackStageHandler({
    generate, getSecret = () => (process.env.STUDY_BRIDGE_SECRET || '').trim(), limiter = createStageLimiter(), nonces = createNonceStore(), now = () => Date.now(), path = STAGE_PATH,
} = {}) {
    const inflight = new Map(); // identical in-flight request (same learner, set, stage, size) shares one run
    return async function trackStage(req, res) {
        const err = (status, code, error, extra = {}) => res.status(status).json({ error, code, ...extra });
        let principal;
        if (req.headers[BRIDGE_HEADERS.signature]) {
            const v = verifyBridgeRequest(req, { secret: getSecret(), nonces, now, path });
            if (!v.ok) return err(v.status, v.code, v.error);
            principal = 'app';
        } else if (req.isAuthenticated?.() && req.user) principal = `user:${req.user.id}`;
        else return err(401, 'auth_required', 'Sign in or send a signed bridge request.');
        const checked = validateStageRequest(req.body);
        if (!checked.ok) return err(400, checked.code, checked.error);
        const v = checked.value;
        const key = principal === 'app' ? (v.userRef ? `app:${v.userRef}` : 'app') : principal;
        const same = `${key}|${v.setId}|${v.level}|${v.kind}|${v.stageIndex}|${v.size}`;
        try {
            let run = inflight.get(same);
            if (!run) {
                const gate = limiter.check(key);
                if (!gate.ok) {
                    res.set('Retry-After', String(gate.retryAfterSec));
                    return err(429, gate.code, gate.error, { retryAfterSec: gate.retryAfterSec });
                }
                limiter.start(key);
                run = generate(v, key).finally(() => { limiter.finish(key); inflight.delete(same); });
                inflight.set(same, run);
            }
            const out = await run;
            return res.json({ items: out.items, meta: out.meta });
        } catch (e) {
            console.error('track-stage failed:', e?.message || e);
            return err(500, 'internal', 'Stage generation failed.');
        }
    };
}

export { LEVELS };

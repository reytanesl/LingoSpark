/* AI exercise generation for the LingoSpark mobile app's "Track" (POST /api/study/track-generate).
   Server-side only (imported by server.js and the tests, never served). The app server (or a signed-in
   study user) sends a word set + CEFR level; the Cursor AI runner (server.js passes runVisionJsonPrompt,
   CURSOR_API_KEY) writes the exercises; everything the model returns is validated here before it is
   sent back. There are NO template fallbacks: an exercise that cannot be validated is dropped.
   Contract (summary):
     auth     : HMAC-signed server-to-server headers (STUDY_BRIDGE_SECRET) OR a study session cookie
     bank     : validated items stored per TERM (en+pl) + level, shared by all sets (Postgres track_ai_bank + memory)
     limits   : see LIMITS */
import crypto from 'node:crypto';
import { isBasicEn, basicPl, BASIC_EN_PHRASES } from './track-basic-en.js';

export const PROMPT_VERSION = 'tg2';
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
export const ALL_TYPES = [
    'letterScramble', 'meaningPick', 'sentenceGap', 'gapTranslate', 'sentenceOrder', 'translateType',
    'listenPick', 'dictation', 'contextTrueFalse', 'collocationPick', 'wordFormation', 'keyTransform',
];
/** Types that exist from a given level upward. */
const MIN_LEVEL = { contextTrueFalse: 'A2', collocationPick: 'A2', wordFormation: 'B1', keyTransform: 'B1' };
export const MEANING_DIRECTIONS = ['pl-en', 'en-pl'];
const SKILL = {
    letterScramble: 'recall', meaningPick: 'recognition', sentenceGap: 'recall', gapTranslate: 'recall',
    sentenceOrder: 'production', translateType: 'production', listenPick: 'listening', dictation: 'listening',
    contextTrueFalse: 'discourse', collocationPick: 'recognition', wordFormation: 'production', keyTransform: 'production',
};

export const LIMITS = {
    maxBodyBytes: 64 * 1024,
    maxTerms: 40,
    maxEnChars: 60,
    maxPlChars: 100,
    maxIdChars: 64,
    maxSetIdChars: 80,
    maxAttempts: 3, // 1 try + 2 retries per batch for invalid / missing items
    perCallTimeoutMs: 70_000,
    deadlineMs: 85_000, // hard cap for a request (Render/Cloudflare cut at ~100 s); also the largest `budgetMs` a client may ask for
    warmupMin: 3, warmupMax: 6, warmupDefault: 4, // warm-up station size (mode "warmup")
    budgetMs: 9_000, // default foreground budget: answer with what is validated by then, the rest keeps going into the bank
    minBudgetMs: 1_500,
    retryMinRemainingMs: 4_500, // a retry only holds the response if at least this much of the budget is left
    jobDeadlineMs: 70_000, // calls that outlive the response may run this long (from the request start) and still fill the bank
    callWeight: 500, // approx. output tokens per AI call (one call = a small slice of one term, or several small slices)
    callConcurrency: 12, // parallel AI calls per request
    globalCallConcurrency: 16, // parallel AI calls in the whole process (foreground first, background gets the rest)
    bgCallConcurrency: 3, // parallel AI calls of one background growth run
    promptSetTerms: 16, // max words listed as "whole set" (distractor source) in one prompt
    userMax: 10, userWindowMs: 10 * 60_000, // generation requests that reach the AI, per user
    globalMax: 120, globalWindowMs: 60 * 60_000,
    globalConcurrent: 4,
    bgMax: 40, // background bank-growth runs per hour
    bgDeadlineMs: 80_000,
    growTerms: 6, // terms per background run
    growProbability: 0.15, // chance to add one more item to a slot that already reached the target
    failCooldownMs: 30 * 60_000,
    signatureSkewMs: 60_000,
    nonceTtlMs: 5 * 60_000,
    cacheMax: 4000, cacheTtlMs: 7 * 24 * 3600_000, // generic LRU defaults
};

/** Sentence length (words) per level. */
const SENT_WORDS = { A1: [4, 7], A2: [5, 9], B1: [6, 11], B2: [7, 13], C1: [8, 15] };
const LEVEL_NOTES = {
    A1: 'A1: present simple, to be, have got, there is/are, imperatives; only the most common words around the target; very short, concrete, everyday sentences (about 4–7 words); at most one set word per sentence; no extra adjectives when a simple frame works (We have got a tracksuit, not We need a warm tracksuit).',
    A2: 'A2: past simple, present continuous, going to, can/must/should, comparatives; only very common everyday words around the target; short, clear sentences (about 5–9 words); at most one set word per sentence; prefer simple frames (have got, be) over extra adjectives and harder verbs.',
    B1: 'B1: present perfect, first/second conditional, simple passive, used to, relative clauses; everyday-to-general vocabulary; clear connected sentences.',
    B2: 'B2: passive in several tenses, reported speech, third conditional, wish/if only, modal perfects, linking devices; fairly abstract vocabulary allowed around the target.',
    C1: 'C1: inversion, mixed conditionals, cleft sentences, nuance, idiom and register; less frequent vocabulary around the target; longer, more complex sentences.',
};

// ---------------------------------------------------------------- text helpers

const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
export const norm = (s) => clean(s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
const words = (s) => norm(s).match(/[a-z]+(?:'[a-z]+)?/g) || [];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isStr = (v, min = 1, max = 400) => typeof v === 'string' && clean(v).length >= min && clean(v).length <= max;
const wordCount = (s) => clean(s).split(' ').filter(Boolean).length;
const GAP = '___';
const countGaps = (s) => (String(s).match(/_{3,}/g) || []).length;

function hashTerm(t) {
    return crypto.createHash('sha1').update(`${t.id}\u0001${norm(t.en)}\u0001${norm(t.pl)}`).digest('hex').slice(0, 16);
}

function rngFrom(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

// ---------------------------------------------------------------- term-form matching

const PLACEHOLDERS = new Set(['sb', 'sth', 'somebody', 'something', 'someone', "one's", 'oneself', 'yourself', 'sb.', 'sth.']);
const IRREGULAR = {
    be: 'am is are was were been being', have: 'has had having', do: 'does did done doing', go: 'goes went gone going',
    get: 'got gotten getting', give: 'gave given giving', take: 'took taken taking', make: 'made making', come: 'came coming',
    see: 'saw seen seeing', know: 'knew known knowing', think: 'thought thinking', say: 'said saying', tell: 'told telling',
    find: 'found finding', bring: 'brought bringing', buy: 'bought buying', catch: 'caught catching', teach: 'taught teaching',
    run: 'ran running', write: 'wrote written writing', read: 'reading', eat: 'ate eaten eating', drink: 'drank drunk drinking',
    sit: 'sat sitting', stand: 'stood standing', speak: 'spoke spoken speaking', break: 'broke broken breaking',
    choose: 'chose chosen choosing', fall: 'fell fallen falling', feel: 'felt feeling', keep: 'kept keeping', leave: 'left leaving',
    lose: 'lost losing', meet: 'met meeting', pay: 'paid paying', put: 'putting', send: 'sent sending', sleep: 'slept sleeping',
    spend: 'spent spending', swim: 'swam swum swimming', throw: 'threw thrown throwing', wear: 'wore worn wearing', win: 'won winning',
    begin: 'began begun beginning', build: 'built building', draw: 'drew drawn drawing', drive: 'drove driven driving', fly: 'flew flown flying',
    forget: 'forgot forgotten forgetting', grow: 'grew grown growing', hold: 'held holding', hide: 'hid hidden hiding', hear: 'heard hearing',
    lead: 'led leading', let: 'letting', ride: 'rode ridden riding', rise: 'rose risen rising', sell: 'sold selling', set: 'setting',
    sing: 'sang sung singing', steal: 'stole stolen stealing', understand: 'understood understanding', wake: 'woke woken waking',
    cut: 'cutting', hit: 'hitting', lay: 'laid laying', lend: 'lent lending', mean: 'meant meaning', sweep: 'swept sweeping',
    sink: 'sank sunk sinking', seek: 'sought seeking', shake: 'shook shaken shaking', shoot: 'shot shooting', tear: 'tore torn tearing',
    fight: 'fought fighting', freeze: 'froze frozen freezing', hang: 'hung hanging', bite: 'bit bitten biting', blow: 'blew blown blowing',
    man: 'men', woman: 'women', child: 'children', foot: 'feet', tooth: 'teeth', mouse: 'mice', person: 'people', knife: 'knives',
    life: 'lives', leaf: 'leaves', good: 'better best', bad: 'worse worst', well: 'better best',
};
const IRR_LOOKUP = (() => {
    const m = new Map();
    for (const [base, forms] of Object.entries(IRREGULAR)) for (const f of forms.split(' ')) { m.set(f, base); }
    return m;
})();

export function termTokens(en) {
    let t = norm(en).replace(/\([^)]*\)/g, ' ').replace(/^to\s+/, '');
    return (t.match(/[a-z]+(?:'[a-z]+)?/g) || []).filter((w) => !PLACEHOLDERS.has(w));
}

function tokenMatches(form, base) {
    if (form === base) return true;
    if (form.length <= 3 || base.length <= 3) {
        if (IRR_LOOKUP.get(form) === base || IRR_LOOKUP.get(base) === form) return true;
        // short words: allow simple inflection only for words >= 3 letters (net -> nets)
        return base.length === 3 && form.length <= 5 && form.startsWith(base);
    }
    if (IRR_LOOKUP.get(form) === base || IRR_LOOKUP.get(base) === form) return true;
    const root = IRR_LOOKUP.get(form);
    if (root && (root === base || tokenMatches(root, base))) return true;
    let p = 0;
    const max = Math.min(form.length, base.length);
    while (p < max && form[p] === base[p]) p++;
    return p >= Math.max(3, Math.min(form.length, base.length) - 2);
}

/** Does `text` contain some form of the term (inflected, separable phrasal verb allowed)? */
export function findTermForm(text, termEn) {
    const tt = termTokens(termEn);
    if (!tt.length) return false;
    const ws = words(text);
    for (let i = 0; i < ws.length; i++) {
        if (!tokenMatches(ws[i], tt[0])) continue;
        let k = 1;
        let j = i + 1;
        const limit = Math.min(ws.length, i + tt.length + 3);
        while (k < tt.length && j < limit) { if (tokenMatches(ws[j], tt[k])) k++; j++; }
        if (k === tt.length) return true;
    }
    return false;
}

function hasWord(text, w) {
    const x = norm(w);
    if (!x) return false;
    return new RegExp(`(^|[^a-z'])${escRe(x)}($|[^a-z'])`, 'i').test(norm(text));
}

/** Replace the first whole-word occurrence of `answer` in `sentence` with ___ ; null if absent or sentence-initial. */
export function makeTemplate(sentence, answer) {
    const s = clean(sentence);
    const a = clean(answer);
    if (!a) return null;
    const re = new RegExp(`(^|[^A-Za-z'])(${escRe(a)})(?=$|[^A-Za-z'])`, 'i');
    const m = re.exec(s);
    if (!m) return null;
    const idx = m.index + m[1].length;
    if (idx === 0) return null;
    return s.slice(0, idx) + GAP + s.slice(idx + m[2].length);
}

// ---------------------------------------------------------------- request validation

export function typesForLevel(level) {
    const li = LEVELS.indexOf(level);
    return ALL_TYPES.filter((t) => !MIN_LEVEL[t] || LEVELS.indexOf(MIN_LEVEL[t]) <= li);
}

/** Returns { ok, value } or { ok:false, error, code }. */
export function validateTrackRequest(body) {
    const bad = (error, code = 'bad_request') => ({ ok: false, error, code });
    if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('JSON body required.');
    const rawSet = body.setId;
    if (!(typeof rawSet === 'string' || typeof rawSet === 'number')) return bad('setId is required.');
    const setId = clean(rawSet);
    if (!setId || setId.length > LIMITS.maxSetIdChars) return bad(`setId must be 1–${LIMITS.maxSetIdChars} characters.`);
    const level = String(body.level || '').toUpperCase();
    if (!LEVELS.includes(level)) return bad(`level must be one of ${LEVELS.join(', ')}.`, 'bad_level');
    if (!Array.isArray(body.terms) || !body.terms.length) return bad('terms must be a non-empty array.');
    if (body.terms.length > LIMITS.maxTerms) return bad(`At most ${LIMITS.maxTerms} terms per request.`, 'too_many_terms');
    const terms = [];
    const seen = new Set();
    for (const t of body.terms) {
        if (!t || typeof t !== 'object') return bad('Every term must be an object { id, en, pl }.');
        if (!(typeof t.id === 'string' || typeof t.id === 'number')) return bad('Every term needs an id.');
        const id = clean(t.id);
        const en = clean(t.en);
        const pl = clean(t.pl);
        if (!id || id.length > LIMITS.maxIdChars) return bad(`term id must be 1–${LIMITS.maxIdChars} characters.`);
        if (seen.has(id)) return bad(`Duplicate term id "${id}".`);
        seen.add(id);
        if (!en || en.length > LIMITS.maxEnChars) return bad(`term.en must be 1–${LIMITS.maxEnChars} characters.`, 'term_too_long');
        if (!pl || pl.length > LIMITS.maxPlChars) return bad(`term.pl must be 1–${LIMITS.maxPlChars} characters.`, 'term_too_long');
        if (!termTokens(en).length) return bad(`term.en "${en}" has no English words.`);
        const pos = t.pos == null ? '' : clean(t.pos).toLowerCase();
        if (pos.length > 24) return bad('term.pos is too long.');
        terms.push({ id, en, pl, pos });
    }
    let types = typesForLevel(level);
    if (body.types != null) {
        if (!Array.isArray(body.types) || body.types.length > ALL_TYPES.length) return bad('types must be an array of exercise type names.');
        for (const x of body.types) if (!ALL_TYPES.includes(x)) return bad(`Unknown exercise type "${String(x).slice(0, 40)}".`, 'bad_type');
        const allowed = typesForLevel(level);
        types = [...new Set(body.types)].filter((x) => allowed.includes(x));
        if (!types.length) return bad(`None of the requested types exist at level ${level}.`, 'bad_type');
    }
    types = ALL_TYPES.filter((x) => types.includes(x)); // canonical order
    let userRef = '';
    if (body.userRef != null) {
        userRef = clean(body.userRef);
        if (userRef.length > 64) return bad('userRef is too long.');
    }
    let budgetMs;
    if (body.budgetMs != null) {
        const n = Number(body.budgetMs);
        if (!Number.isFinite(n) || n < LIMITS.minBudgetMs || n > LIMITS.deadlineMs) return bad(`budgetMs must be ${LIMITS.minBudgetMs}–${LIMITS.deadlineMs} (milliseconds the server may spend before answering).`);
        budgetMs = Math.round(n);
    }
    // additive: mode "warmup" = answer with a small first station (3–6 questions, default 4) as fast as possible and
    // queue the whole set for background generation; default "full" is the original behaviour
    let mode;
    let warmupSize;
    if (body.mode != null) {
        if (body.mode !== 'warmup' && body.mode !== 'full') return bad('mode must be "warmup" or "full".');
        mode = body.mode;
    }
    if (body.warmupSize != null) {
        const n = Number(body.warmupSize);
        if (!Number.isInteger(n) || n < LIMITS.warmupMin || n > LIMITS.warmupMax) return bad(`warmupSize must be an integer ${LIMITS.warmupMin}–${LIMITS.warmupMax}.`);
        warmupSize = n;
    }
    return { ok: true, value: { setId, level, terms, types, userRef, ...(budgetMs ? { budgetMs } : {}), ...(mode && mode !== 'full' ? { mode } : {}), ...(warmupSize ? { warmupSize } : {}) } };
}

// ---------------------------------------------------------------- prompt

const slotsFor = (type) => (type === 'meaningPick' ? MEANING_DIRECTIONS.map((d) => `meaningPick:${d}`) : [type]);
const slotType = (slot) => slot.split(':')[0];

const TYPE_SPECS = {
    sentenceGap: '{"termId","type":"sentenceGap","sentence":full English sentence using the target in a form that fits the grammar AND carrying a clear clue (a defining detail, a typical collocation or situation) so that ONLY the target fits the gap; never a generic frame like "There is a ___ here" / "I like ___" / "This is my ___","answer":the exact words of the target as written in the sentence (NOT at the very start of the sentence),"distractors":[3 wrong options of the same word class and form that cannot fit the sentence]}',
    gapTranslate: '{"termId","type":"gapTranslate","sentence":full English sentence (no gap marks) using the target in a form that fits the grammar, with a clear clue so that ONLY the target fits the gap (never a generic frame like "There is a ___ here"),"answer":the exact words of the target as written in the sentence (NOT at the very start of the sentence),"distractors":[3 wrong options of the same word class and form that cannot fit the sentence],"plTranslation":natural Polish translation of the WHOLE sentence (always required, a non-empty string)} (use a different sentence than the sentenceGap item of the same term)',
    sentenceOrder: '{"termId","type":"sentenceOrder","sentence":one sentence with the target (punctuation attached to the last word),"plTranslation":Polish translation as a hint}',
    meaningPick: '{"termId","type":"meaningPick","direction":"pl-en" or "en-pl","distractors":[3 wrong options in the ANSWER language: other terms of the set when sensible]} (the question is the term itself; the answer is its translation exactly as listed in the term)',
    collocationPick: '{"termId","type":"collocationPick","phrase":a natural 2–6 word collocation/chunk containing the target (target NOT first),"answer":the target as written in the phrase,"distractors":[3 words that do NOT collocate here (clearly wrong in this exact phrase, but the same word class)]}',
    contextTrueFalse: '{"termId","type":"contextTrueFalse","passage":2–3 connected sentences using the target with enough concrete detail that the statement can be judged without guessing,"statement":one sentence about the passage that is clearly true or clearly false,"correctTrue":boolean}',
    letterScramble: '{"termId","type":"letterScramble","answer":the English term exactly as listed (single word only),"clue":short Polish or English clue that does not contain the answer (also accepted under the key "hint" if it is a string)}',
    translateType: '{"termId","type":"translateType","source":Polish sentence,"answer":the natural English translation containing the target,"answers":[0–3 other acceptable English translations that also contain the target]}',
    dictation: '{"termId","type":"dictation","sentence":one English sentence with the target, easy to pronounce}',
    listenPick: '{"termId","type":"listenPick","distractors":[3 English words/phrases that sound or look similar or are in the same topic; other terms of the set when sensible]} (the learner hears the term itself)',
    wordFormation: '{"termId","type":"wordFormation","stem":UPPERCASE base word,"sentence":full sentence containing the correctly formed derived word,"answer":the derived word exactly as in the sentence (differs from the stem, NOT at the very start)}',
    keyTransform: '{"termId","type":"keyTransform","sourceSentence":original sentence,"keyWord":UPPERCASE word that must be used UNCHANGED in the answer,"template":second sentence with ONE gap ___ that must be filled with 2–5 words INCLUDING the key word (key word not outside the gap),"answer":the 2–5 words,"answers":[the answer plus up to 2 other correct 2–5 word solutions with the key word]} (same meaning as the source sentence; the target term appears in the source or in the completed sentence)',
};

/** Keep prompts small for big sets: the targets plus the words around them, at most LIMITS.promptSetTerms. */
function capSetTerms(setTerms, targets, max = LIMITS.promptSetTerms) {
    if (setTerms.length <= max) return setTerms;
    const ids = new Set(targets.map((t) => t.id));
    const at = Math.max(0, setTerms.findIndex((t) => ids.has(t.id)));
    const picked = new Set(setTerms.filter((t) => ids.has(t.id)).map((t) => t.id));
    for (let d = 1; picked.size < max && d < setTerms.length; d++) for (const i of [at + d, at - d]) if (setTerms[i] && picked.size < max) picked.add(setTerms[i].id);
    return setTerms.filter((t) => picked.has(t.id));
}

export function buildTrackPrompt({ level, terms, setTerms, wants, feedback = [], avoid = new Map() }) {
    const [lo, hi] = SENT_WORDS[level];
    const lines = terms.map((t) => {
        const ts = wants.get(t.id);
        const slots = [...ts].join(', ');
        return `- termId ${JSON.stringify(t.id)}: en ${JSON.stringify(t.en)} | pl ${JSON.stringify(t.pl)}${t.pos ? ` | pos ${t.pos}` : ''} → wanted: ${slots}`;
    });
    const typeNames = [...new Set([...wants.values()].flatMap((s) => [...s].map(slotType)))].sort((a, b) => ALL_TYPES.indexOf(a) - ALL_TYPES.indexOf(b));
    return [
        'You write language-learning exercises for a mobile vocabulary app. Learners are Polish speakers learning English.',
        `CEFR level of the exercises: ${level}. ${LEVEL_NOTES[level]}`,
        `Sentences you write: ${lo}–${hi} words, natural, one clear meaning, no names of real people, no offensive content. Vocabulary and grammar around the target must be at or below ${level}; only the target itself may be harder.`,
        '',
        'TARGET TERMS (write exercises ONLY for these; every item needs the termId):',
        ...lines,
        '',
        `WHOLE SET (use these English/Polish words as distractors when they fit the type): ${capSetTerms(setTerms, terms).map((t) => `${t.en} = ${t.pl}`).join('; ')}`,
        ...(avoid.size ? ['', 'ALREADY WRITTEN (write something clearly DIFFERENT: another situation, other words around the target, not a paraphrase):', ...[...avoid].flatMap(([termId, list]) => list.map((a) => `- termId ${JSON.stringify(termId)} ${a.slot}: ${JSON.stringify(a.text.slice(0, 140))}`))] : []),
        '',
        'ITEM FORMATS (JSON objects inside "items"):',
        ...typeNames.map((t) => `- ${TYPE_SPECS[t]}`),
        '',
        'RULES:',
        '- Write one item for every wanted type of every term. For meaningPick write one item per wanted direction.',
        '- Only wordFormation, keyTransform, collocationPick and letterScramble may be skipped: if one of them makes no sense for a term (for example wordFormation for a phrasal verb, a keyTransform that would be forced), do NOT force it, add {"termId","type","reason"} to "skipped" instead. All other types must always be written.',
        '- The target must really be tested: the sentence/answer must contain the target term (inflected if the grammar needs it).',
        '- Never reveal the answer in the question text, the hint, the other options or the Polish instruction. Exactly one option may be correct; distractors must be clearly wrong in context but plausible (same word class/form).',
        '- Options must be distinct. No duplicate sentences across items of one term.',
        '- UNIQUE ANSWER for every gap/choice item (sentenceGap, gapTranslate, collocationPick): the sentence must contain enough context (a defining clue, a collocation, a cause/effect or a meaning cue) that ONLY the target fits; every distractor must be clearly wrong in that sentence (grammatically or semantically) while looking plausible. If two options could both fit, rewrite the sentence or change the distractor. NEVER write generic sentences such as "There is a ___ here.", "I like ___.", "This is my ___.", "It is a ___." — these have no single answer.',
        '- SELF-CONTAINED CONTEXT: the learner must be able to choose the answer from the sentence alone, with no picture and no previous sentence. The sentence itself must name the facts that make the target the only fit. Do not write sentences that point at something unnamed (e.g. "Your belt is long and ___ short") — the second referent is missing, so "this is" / "that is" / "these are" are all guesswork.',
        '- DEMONSTRATIVES and PRONOUN + BE (this/that/these/those, this is/that is/these are/those are, it is/they are): disambiguate with an explicit cue in the same sentence. Put a singular or plural noun right after the gap so number is obvious ("Look, ___ my shoes here." not "... and ___ short"). For this vs that or these vs those, add a distance cue (here / over there). Never put this is and that is (or these are and those are) together as options unless the sentence has such a cue. Distractors must be wrong for a reason visible in the sentence (number or distance). Do not use ungrammatical junk such as "these is" / "this are" as the only way to make the answer unique.',
        ...(level === 'A1' || level === 'A2' ? [
            `- A1/A2 VOCABULARY: introduce new words gradually. Besides the single target term, use ONLY very common words (be, have got, pronouns, articles, simple verbs and everyday nouns). Do not add other words from the set, and do not add unnecessary adjectives or harder verbs. Prefer the simplest frame that works: "We have got a tracksuit." not "We need a warm tracksuit." Keep sentences short (about ${lo}–${hi} words). At most ONE word from the set in each sentence.`,
            '- EXCEPTION for sentenceGap, gapTranslate and collocationPick: the UNIQUE ANSWER rule still applies — never write a generic frame such as "We have got a ___." / "There is a ___ here." Give a short defining clue, but the clue itself must use only those same basic words (e.g. "The boy wears this tracksuit at school.").',
        ] : []),
        '- HINT: every item should also include "hint":{"translation":"<the other language of the shown word or sentence>","segments":[{"text":"<segment>","translation":"<other language>"}]}. Segments in order, joined with single spaces, must equal the word or sentence shown to the learner (for gap items: the full sentence with the target filled in; punctuation may stay on the last segment). A multi-word set term is ONE segment (e.g. "bluzka bez rękawów", "step out of"), never split. letterScramble, listenPick and meaningPick have one segment — the word itself. translation is Polish when the shown text is English, and English when the shown text is Polish. This hint is help for the learner, so it may contain the answer.',
        '- Use the term\'s given English form and Polish meaning; do not change the meaning of the term.',
        ...(feedback.length ? ['', 'PREVIOUS ATTEMPT — these items were rejected, write them again and fix the problem:', ...feedback.map((f) => `- termId ${JSON.stringify(f.termId)} ${f.slot}: ${f.reason}`)] : []),
        '',
        'Return ONLY valid JSON of the form {"items":[...],"skipped":[...]}. No markdown, no commentary.',
    ].join('\n');
}

// ---------------------------------------------------------------- item validation / building

const REASON = (m) => ({ ok: false, reason: m });

/** "gap-translate", "Gap_Translate", "gaptranslate" -> "gapTranslate" (models drift on the casing of a type name). */
const TYPE_BY_FLAT = new Map(ALL_TYPES.map((t) => [t.toLowerCase(), t]));
export const canonType = (t) => TYPE_BY_FLAT.get(String(t ?? '').toLowerCase().replace(/[^a-z]/g, '')) || t;
/** The Polish translation of a gap sentence: the documented key, or a near-miss key the model may use. */
const plTranslationOf = (raw) => raw.plTranslation ?? raw.translation ?? raw.plSentence ?? raw.polishTranslation ?? raw.polish ?? raw.pl;

function checkOptions(options, answer) {
    if (!Array.isArray(options) || options.length !== 4) return 'needs exactly 4 options';
    const ns = options.map((o) => norm(o));
    if (ns.some((o) => !o || o.length > 80)) return 'empty or too long option';
    if (new Set(ns).size !== 4) return 'options are not distinct';
    if (!ns.includes(norm(answer))) return 'options do not include the answer';
    return '';
}

function buildOptions(answer, distractors, rng) {
    const ds = (Array.isArray(distractors) ? distractors : []).map(clean).filter(Boolean);
    const uniq = [];
    for (const d of ds) if (norm(d) !== norm(answer) && !uniq.some((u) => norm(u) === norm(d))) uniq.push(d);
    if (uniq.length < 3) return null;
    return shuffled([clean(answer), ...uniq.slice(0, 3)], rng);
}


// ---------------------------------------------------------------- gap uniqueness (generic frames)

const GAP_STOPWORDS = new Set(('a an the is are am was were be been being do does did have has had will would can could shall should may might must i you he she it we they me him her us them my your his its our their ' +
    'this that these those there here to of in on at for with and or but so as by from into about very too not no some any one then now just also').split(' '));
/** Frames with no clue about the missing word: "There is a ___ here.", "This is my ___.", "I like ___.", "It's a ___ today." */
const GENERIC_GAP_FRAME = new RegExp(
    '^(?:' +
    '(?:there|here)\\s+(?:is|are|was|were)(?:\\s+(?:a|an|the|some|one|my|your))?|' +
    '(?:this|that|it|he|she)(?:\\s+(?:is|was)|\\\'s)(?:\\s+(?:a|an|the|my|your|his|her|our|their))?|' +
    '(?:i|we|you|they)(?:\\s+(?:like|love|have|had|see|saw|want|need|got|have\\s+got|can\\s+see|don\\\'t\\s+like))(?:\\s+(?:a|an|the|some|my|your|our))?|' +
    '(?:look\\s+at|give\\s+me|show\\s+me|i\\s+am\\s+looking\\s+for)(?:\\s+(?:a|an|the|this|that|my|your))?' +
    ')\\s+___(?:\\s+(?:here|there|today|now|too|again|please|everywhere))*$', 'i');
/** '' when a gap template has enough context to single out one answer, else the reason it is too generic. */
export function genericGapReason(template) {
    const t = clean(template);
    if (countGaps(t) !== 1) return '';
    const bare = t.replace(/[.!?…]+$/g, '').replace(/[\u2018\u2019]/g, "'").replace(/\s*[,;:]\s*/g, ' ').trim();
    if (GENERIC_GAP_FRAME.test(bare)) return 'generic sentence frame: several options fit the gap; add a clue so only the target fits';
    const rest = bare.replace(GAP, ' ').split(/\s+/).map((w) => w.toLowerCase().replace(/[^a-z']/g, '')).filter(Boolean);
    if (rest.length < 4) return `gap sentence is too short (${rest.length} words besides the gap): add context so only the target fits`;
    if (rest.filter((w) => !GAP_STOPWORDS.has(w)).length < 3) return 'gap sentence has too few meaningful words around the gap: add a defining clue or collocation so only the target fits';
    return '';
}

/** this/that/these/those and pronoun+be chunks (this is, these are, it is, they are, …). */
const DET_HEAD = { this: { num: 'sg', dist: 'near' }, that: { num: 'sg', dist: 'far' }, these: { num: 'pl', dist: 'near' }, those: { num: 'pl', dist: 'far' } };
const PRON_HEAD = { it: { num: 'sg' }, they: { num: 'pl' }, he: { num: 'sg' }, she: { num: 'sg' } };
const BE_SG = new Set(['is', 'was']);
const BE_PL = new Set(['are', 'were']);
const BE_ANY = new Set(['is', 'are', 'was', 'were']);
const DEICTIC_ADJ = new Set(('long short big small little large new old young warm cold hot cool nice good bad fine great pretty clean dirty heavy light dark bright soft hard easy difficult fast slow strong weak tall high low full empty busy free early late ready right wrong happy sad tired hungry thirsty red blue green yellow black white brown pink orange grey gray thick thin').split(' '));
const DEICTIC_PL_NOUNS = new Set(('trousers jeans shorts pants scissors people children men women feet teeth mice glasses clothes police shoes trainers socks gloves boots pyjamas pajamas stairs goods surroundings leftovers').split(' '));
const DEICTIC_DET = new Set('a an the my your his her its our their this that these those'.split(' '));
const SINGULAR_S = new Set('this that his hers ours yours theirs its news maths physics bus glass class grass miss dress'.split(' '));

/** Parse a choice like "these are" / "this" / "it's" / "they are". Null if it is not a deictic/pronoun(+be) chunk. */
export function parseDeicticOption(option) {
    const raw = norm(option);
    if (!raw) return null;
    const s = raw.replace(/[.,!?]+$/g, '').replace(/\b(it|that|this|he|she|there)'s\b/g, '$1 is');
    const parts = s.split(/\s+/).filter(Boolean);
    if (!parts.length || parts.length > 2) return null;
    const head = parts[0];
    const second = parts[1] || '';
    const be = BE_ANY.has(second) ? second : '';
    if (second && !be) return null;
    const beNum = be ? (BE_SG.has(be) ? 'sg' : 'pl') : null;
    if (DET_HEAD[head]) {
        const meta = DET_HEAD[head];
        return { kind: 'det', head, num: meta.num, dist: meta.dist, be, grammatical: !beNum || beNum === meta.num };
    }
    if (PRON_HEAD[head]) {
        const meta = PRON_HEAD[head];
        return { kind: 'pron', head, num: meta.num, dist: null, be, grammatical: !beNum || beNum === meta.num };
    }
    return null;
}

function deicticCues(template) {
    const t = clean(template);
    const at = t.indexOf(GAP);
    if (at < 0) return { num: '', dist: '' };
    const after = t.slice(at + GAP.length);
    const before = t.slice(0, at);
    const afterToks = words(after);
    const nearRe = /\b(?:right\s+)?here\b|\bover\s+here\b|\bnear\s+(?:me|us|here)\b|\bnext\s+to\s+me\b/i;
    const farRe = /\bover\s+there\b|\bright\s+there\b|\bfar\s+away\b|\bin\s+the\s+distance\b/i;
    // a bare "there" after the gap is a far cue; before the gap only "over/right there" counts (not existential "there is")
    let dist = '';
    if (nearRe.test(after) || nearRe.test(before)) dist = 'near';
    const far = farRe.test(after) || farRe.test(before) || /(?:^|[\s,;:—-])there(?:$|[\s,;:.!?])/i.test(after);
    if (far) dist = dist === 'near' ? '' : 'far';
    // a pointing "here" / "there" immediately before the gap (Look there, ___ …) — not existential "there is/are"
    const tail = words(before);
    const last = tail[tail.length - 1] || '';
    const prev = tail[tail.length - 2] || '';
    if (last === 'here' || (prev === 'here' && last === 'then')) dist = (dist === 'far') ? '' : 'near';
    if (last === 'there' && prev !== 'is' && prev !== 'are' && prev !== 'was' && prev !== 'were') dist = (dist === 'near') ? '' : 'far';

    let k = 0;
    while (k < afterToks.length && ['over', 'right', 'here', 'there', 'away', 'far'].includes(afterToks[k])) k++;
    let det = '';
    while (k < afterToks.length && DEICTIC_DET.has(afterToks[k])) { det = afterToks[k]; k++; }
    while (k < afterToks.length && DEICTIC_ADJ.has(afterToks[k])) k++;
    let num = '';
    if (k < afterToks.length && BE_ANY.has(afterToks[k])) {
        num = BE_SG.has(afterToks[k]) ? 'sg' : 'pl';
    } else if (k < afterToks.length) {
        const n = afterToks[k];
        const next = afterToks[k + 1] || '';
        const isNoun = !DEICTIC_ADJ.has(n) && !BE_ANY.has(n) && !GAP_STOPWORDS.has(n) && (
            DEICTIC_PL_NOUNS.has(n)
            || BE_ANY.has(next)
            || det === 'a' || det === 'an' || DEICTIC_DET.has(det)
            || (/(?:s|es|ies)$/.test(n) && n.length > 3)
        );
        if (isNoun) {
            const plural = DEICTIC_PL_NOUNS.has(n) || (/(?:s|es|ies)$/.test(n) && n.length > 3 && !SINGULAR_S.has(n));
            num = plural ? 'pl' : 'sg';
        }
    }
    return { num, dist };
}

/**
 * '' when a demonstrative / pronoun+be gap is uniquely determined by a number or distance cue,
 * else the reason the sentence is guesswork (Karol's "Your belt is long and ___ short" case).
 * Items whose answer is not a deictic/pronoun chunk are left alone.
 */
export function demonstrativeGapReason(template, answer, options) {
    const ans = parseDeicticOption(answer);
    if (!ans) return '';
    if (countGaps(template || '') !== 1) return '';
    const cues = deicticCues(template);
    const opts = Array.isArray(options) && options.length ? options : [answer];
    const fits = (meta) => {
        if (!meta || !meta.grammatical) return false;
        if (cues.num && meta.num && cues.num !== meta.num) return false;
        if (cues.dist && meta.dist && cues.dist !== meta.dist) return false;
        return true;
    };
    if (!cues.num && !cues.dist) {
        return 'demonstrative/pronoun gap has no disambiguating cue: add a noun for number, or here/over there for distance, so the sentence alone makes only one option correct';
    }
    if (!fits(ans)) {
        return 'demonstrative/pronoun answer does not match the number or distance cue in the sentence';
    }
    const others = opts.filter((o) => norm(o) !== norm(answer) && fits(parseDeicticOption(o)));
    if (others.length) {
        return 'this/that/these/those (or pronoun + be) options are not uniquely determined by the sentence; add a number or distance cue, or change the distractors';
    }
    return '';
}

/** Types whose English sentence is checked for A1/A2 vocabulary load. */
const VOCAB_TYPES = new Set(['sentenceGap', 'gapTranslate', 'sentenceOrder', 'dictation', 'translateType', 'collocationPick']);
/** Extra non-list, non-basic content words allowed in an A1/A2 sentence (0 = only basic words + the target). */
export const VOCAB_EXTRA_MAX = { A1: 0, A2: 1 };

const CORE_WORD = (s) => clean(s).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** English sentence (target filled in) for vocabulary checks on a built item. */
export function englishTextOf(item) {
    if (!item) return '';
    switch (item.type) {
        case 'sentenceGap': case 'gapTranslate': case 'collocationPick': case 'wordFormation':
            return typeof item.template === 'string' ? clean(item.template).replace(GAP, clean(item.answer || '')) : '';
        case 'sentenceOrder':
            return Array.isArray(item.correctOrder) ? item.correctOrder.join(' ') : '';
        case 'dictation':
            return clean(item.speak || item.answer || '');
        case 'translateType':
            return clean(item.answer || '');
        case 'keyTransform':
            return clean(item.sourceSentence || '');
        default:
            return '';
    }
}

function allowsTermToken(tok, term) {
    if (!term) return false;
    return termTokens(term.en).some((base) => tokenMatches(tok, base));
}

/** '' when an A1/A2 English sentence only uses basic words + the target; else the reason to reject it. */
export function simpleVocabReason(text, level, term, setTerms = []) {
    if (level !== 'A1' && level !== 'A2') return '';
    const s = clean(text);
    if (!s) return '';
    const [lo, hi] = SENT_WORDS[level];
    const n = wordCount(s);
    if (n > hi + 2) return `${level} sentence has ${n} words; keep it to about ${lo}–${hi} words`;
    const others = (setTerms || []).filter((t) => t && t.en && (!term || norm(t.en) !== norm(term.en)));
    for (const t of others) {
        if (findTermForm(s, t.en)) return `sentence uses another set word ("${t.en}") besides the target; use only the target word from the list`;
    }
    const extra = [];
    for (const w of words(s)) {
        if (isBasicEn(w) || allowsTermToken(w, term)) continue;
        if (!extra.includes(w)) extra.push(w);
    }
    const max = VOCAB_EXTRA_MAX[level] ?? 0;
    if (extra.length > max) return `${level} sentence has too many new words (${extra.slice(0, 6).join(', ')}); use only very common words around the target`;
    return '';
}

/** A banked item that must no longer be served (generic gaps, or an A1/A2 sentence that is too hard). */
export function bankedItemBad(item, level, term, setTerms) {
    if (!item) return false;
    if ((item.type === 'sentenceGap' || item.type === 'gapTranslate' || item.type === 'collocationPick') && typeof item.template === 'string') {
        if ((item.type === 'sentenceGap' || item.type === 'gapTranslate') && genericGapReason(item.template)) return true;
        if (demonstrativeGapReason(item.template, item.answer, item.options)) return true;
    }
    if ((level === 'A1' || level === 'A2') && VOCAB_TYPES.has(item.type)) {
        const text = englishTextOf(item);
        if (text && simpleVocabReason(text, level, term, setTerms)) return true;
    }
    return false;
}

/** The word or sentence the learner sees (gap items: full sentence with the target filled in). */
export function shownText(item) {
    if (!item) return '';
    switch (item.type) {
        case 'letterScramble': return clean(item.answer || '');
        case 'meaningPick': return clean(item.question || '');
        case 'listenPick': return clean(item.speak || item.answer || '');
        case 'sentenceOrder': return Array.isArray(item.correctOrder) ? item.correctOrder.join(' ') : '';
        case 'translateType': return clean(item.source || '');
        case 'dictation': return clean(item.speak || item.answer || '');
        case 'sentenceGap': case 'gapTranslate': case 'collocationPick': case 'wordFormation':
            return typeof item.template === 'string' ? clean(item.template).replace(GAP, clean(item.answer || '')) : '';
        case 'contextTrueFalse': return clean(item.passage || '');
        case 'keyTransform': return clean(item.sourceSentence || '');
        default: return clean(item.answer || '');
    }
}

const shownIsPolish = (item) => item.type === 'translateType' || (item.type === 'meaningPick' && item.direction === 'pl-en');

function segmentCovers(segText, termText) {
    const core = CORE_WORD(segText);
    if (!core || !termText) return false;
    if (norm(core) === norm(termText)) return true;
    return findTermForm(core, termText);
}

/** '' when hintHelp is well-formed for this item, else the reason it is invalid. */
export function hintReason(hint, item, term, setTerms = []) {
    if (!hint || typeof hint !== 'object') return 'hint missing';
    if (!isStr(hint.translation, 1, 400)) return 'hint.translation missing';
    if (!Array.isArray(hint.segments) || !hint.segments.length) return 'hint.segments missing';
    const segs = hint.segments.map((x) => ({ text: clean(x?.text), translation: clean(x?.translation) }));
    if (segs.some((x) => !x.text || !x.translation)) return 'hint segment is missing text or translation';
    const shown = shownText(item);
    if (shown && segs.map((x) => x.text).join(' ') !== shown) return 'hint segments do not rejoin the shown text';
    const terms = [...(setTerms || [])];
    if (term && !terms.some((t) => t && term && (t.id === term.id || (t.en && norm(t.en) === norm(term.en))))) terms.push(term);
    const pl = shownIsPolish(item);
    for (const t of terms) {
        const needle = pl ? t.pl : t.en;
        if (!needle) continue;
        const appears = findTermForm(shown, needle) || (pl && new RegExp(`(^|[^\\p{L}])${escRe(norm(needle))}($|[^\\p{L}])`, 'iu').test(norm(shown)));
        if (!appears) continue;
        if (!segs.some((x) => segmentCovers(x.text, needle))) return `set term "${needle}" must be a single hint segment`;
    }
    return '';
}

const POLISH_BASIC = {
    ta: 'this', ten: 'this', to: 'it', te: 'these', taż: 'this',
    jest: 'is', są: 'are', być: 'be', ma: 'has', mają: 'have', mam: 'I have', mamy: 'we have', masz: 'you have',
    nowa: 'new', nowy: 'new', nowe: 'new', nowi: 'new',
    i: 'and', w: 'in', na: 'on', z: 'with', do: 'to', nie: 'not', o: 'about', od: 'from', po: 'after',
    jestem: 'I am', jesteś: 'you are', jesteśmy: 'we are',
    tu: 'here', tutaj: 'here', tam: 'there', już: 'already', też: 'too', bardzo: 'very',
    mój: 'my', moja: 'my', moje: 'my', twój: 'your', twoja: 'your', twoje: 'your',
    ten: 'this', ta: 'this', to: 'this',
};

export function segmentByTerms(text, terms, langPl) {
    const tokens = clean(text).split(' ').filter(Boolean);
    const phrases = (terms || []).map((t) => clean(langPl ? t.pl : t.en)).filter(Boolean);
    if (!langPl) phrases.push(...BASIC_EN_PHRASES);
    phrases.sort((a, b) => wordCount(b) - wordCount(a) || b.length - a.length);
    const segs = [];
    let i = 0;
    while (i < tokens.length) {
        let took = 0;
        for (const ph of phrases) {
            const pw = ph.split(' ').filter(Boolean);
            if (!pw.length || i + pw.length > tokens.length) continue;
            const slice = tokens.slice(i, i + pw.length);
            const ok = pw.every((p, k) => {
                const core = CORE_WORD(slice[k]);
                return norm(core) === norm(p) || tokenMatches(norm(core), norm(p));
            });
            if (ok) { segs.push(slice.join(' ')); took = pw.length; break; }
        }
        if (took) i += took;
        else { segs.push(tokens[i]); i++; }
    }
    return segs;
}

/** Deterministic hint from the term list + basic glossary. Null if a segment cannot be translated. */
export function cheapHint(item, term, setTerms = []) {
    const shown = shownText(item);
    if (!shown) return null;
    const pl = shownIsPolish(item);
    const terms = [...(setTerms || [])];
    if (term && !terms.some((t) => t && (t.id === term.id || (t.en && term.en && norm(t.en) === norm(term.en))))) terms.push(term);
    let translation = clean(item.plTranslation || '');
    if (!translation) {
        if (item.type === 'translateType' || item.type === 'meaningPick') translation = clean(item.answer || '');
        else if (term && (item.type === 'letterScramble' || item.type === 'listenPick')) translation = pl ? clean(term.en) : clean(term.pl);
    }
    const parts = segmentByTerms(shown, terms, pl);
    const segs = [];
    for (const text of parts) {
        const core = CORE_WORD(text);
        const hit = terms.find((t) => segmentCovers(text, pl ? t.pl : t.en));
        let tr = '';
        if (hit) tr = clean(pl ? hit.en : hit.pl);
        else if (!pl) tr = basicPl(core);
        else tr = POLISH_BASIC[norm(core)] || '';
        if (!tr) return null;
        segs.push({ text, translation: tr });
    }
    if (!translation) translation = segs.map((x) => x.translation).join(' ');
    const hint = { translation, segments: segs };
    return hintReason(hint, item, term, terms) ? null : hint;
}

function rawHintObject(raw) {
    const h = raw?.hint;
    if (h && typeof h === 'object' && !Array.isArray(h)) return h;
    const alt = raw?.hintHelp || raw?.help;
    return alt && typeof alt === 'object' && !Array.isArray(alt) ? alt : null;
}

function withHint(result, raw, term, setTerms) {
    if (!result?.ok) return result;
    const parsed = rawHintObject(raw);
    let hint = null;
    if (parsed) {
        const candidate = {
            translation: clean(parsed.translation),
            segments: Array.isArray(parsed.segments) ? parsed.segments.map((x) => ({ text: clean(x?.text), translation: clean(x?.translation) })) : [],
        };
        if (!hintReason(candidate, result.item, term, setTerms)) hint = candidate;
    }
    if (!hint) hint = cheapHint(result.item, term, setTerms);
    if (hint) result.item.hintHelp = hint;
    return result;
}

/** The prompt shown to the learner never contains the answer. */
function promptLeaks(prompt, answer) {
    const a = norm(answer);
    return a.length >= 3 && hasWord(prompt, a);
}

/**
 * Validate one raw model item for a term and turn it into the app's shape.
 * Returns { ok:true, slot, item } or { ok:false, reason }.
 */
export function buildItem(raw, term, level, setTerms = []) {
    if (!raw || typeof raw !== 'object') return REASON('not an object');
    const type = canonType(raw.type);
    if (!ALL_TYPES.includes(type)) return REASON('unknown type');
    const [lo, hi] = SENT_WORDS[level];
    const rng = rngFrom(`${term.id}|${type}|${raw.direction || ''}|${norm(raw.sentence || raw.phrase || raw.stem || '')}`);
    const base = { type, lexiconId: term.id, skill: SKILL[type] };
    const tag = (slot, item) => withHint({ ok: true, slot, item: { id: `ai-${term.id}-${slot.replace(':', '-')}`, ...base, ...item } }, raw, term, setTerms);
    const sentenceOk = (s, label = 'sentence') => {
        if (!isStr(s, 6, 220)) return `${label} missing or too long`;
        if (countGaps(s)) return `${label} must not contain a gap`;
        const n = wordCount(s);
        if (n < 3 || n > hi + 2) return `${label} has ${n} words; ${level} sentences should be at most ${hi} words`;
        const vr = simpleVocabReason(s, level, term, setTerms);
        if (vr) return vr;
        return '';
    };

    switch (type) {
        case 'sentenceGap':
        case 'gapTranslate': {
            const e = sentenceOk(raw.sentence);
            if (e) return REASON(e);
            if (!isStr(raw.answer, 1, 60)) return REASON('answer missing');
            if (!findTermForm(raw.answer, term.en)) return REASON('answer is not a form of the target term');
            const template = makeTemplate(raw.sentence, raw.answer);
            if (!template) return REASON('answer not found inside the sentence (or gap at sentence start)');
            if (countGaps(template) !== 1) return REASON('template needs exactly one gap');
            if (hasWord(template.replace(GAP, ' '), raw.answer)) return REASON('answer also appears outside the gap (leak)');
            const generic = genericGapReason(template);
            if (generic) return REASON(generic);
            const options = buildOptions(raw.answer, raw.distractors, rng);
            if (!options) return REASON('needs 3 distinct distractors');
            const oe = checkOptions(options, raw.answer);
            if (oe) return REASON(oe);
            const deictic = demonstrativeGapReason(template, raw.answer, options);
            if (deictic) return REASON(deictic);
            const prompt = type === 'gapTranslate' ? 'Fill the gap. Use the Polish translation to help.' : 'Choose the word that fits the gap.';
            const item = { prompt, template, answer: clean(raw.answer), options };
            if (type === 'gapTranslate') {
                const pl = plTranslationOf(raw);
                if (!isStr(pl, 4, 260)) return REASON('plTranslation missing: add "plTranslation" (Polish translation of the whole sentence)');
                item.plTranslation = clean(pl);
            }
            return tag(type, item);
        }
        case 'sentenceOrder': {
            const e = sentenceOk(raw.sentence);
            if (e) return REASON(e);
            if (!findTermForm(raw.sentence, term.en)) return REASON('sentence does not contain the target term');
            const correct = clean(raw.sentence).split(' ');
            if (correct.length < 4 || correct.length > 15) return REASON('sentence must have 4–15 words to order');
            let tokens = shuffled(correct, rng);
            for (let i = 0; i < 5 && tokens.every((t, k) => t === correct[k]); i++) tokens = shuffled(correct, rng);
            if (tokens.every((t, k) => t === correct[k])) return REASON('cannot shuffle sentence');
            const item = { prompt: 'Put the words in order.', tokens, correctOrder: correct };
            const plHint = plTranslationOf(raw);
            if (isStr(plHint, 2, 260)) item.plTranslation = clean(plHint);
            return tag('sentenceOrder', item);
        }
        case 'meaningPick': {
            const direction = raw.direction;
            if (!MEANING_DIRECTIONS.includes(direction)) return REASON('direction must be pl-en or en-pl');
            const answer = direction === 'pl-en' ? term.en : term.pl;
            const question = direction === 'pl-en' ? term.pl : term.en;
            const options = buildOptions(answer, raw.distractors, rng);
            if (!options) return REASON('needs 3 distinct distractors');
            const oe = checkOptions(options, answer);
            if (oe) return REASON(oe);
            if (options.some((o) => o.length > 80)) return REASON('option too long');
            return tag(`meaningPick:${direction}`, {
                prompt: meaningPrompt(direction, question),
                direction, question, answer, options, correctIndex: options.findIndex((o) => norm(o) === norm(answer)),
            });
        }
        case 'collocationPick': {
            if (!isStr(raw.phrase, 5, 80)) return REASON('phrase missing or too long');
            const n = wordCount(raw.phrase);
            if (n < 2 || n > 7) return REASON('phrase must have 2–6 words');
            const vr = simpleVocabReason(raw.phrase, level, term, setTerms);
            if (vr) return REASON(vr);
            if (!isStr(raw.answer, 1, 60) || !findTermForm(raw.answer, term.en)) return REASON('answer is not a form of the target term');
            const template = makeTemplate(raw.phrase, raw.answer);
            if (!template) return REASON('answer not inside the phrase (or phrase starts with it)');
            if (hasWord(template.replace(GAP, ' '), raw.answer)) return REASON('answer also appears outside the gap (leak)');
            const options = buildOptions(raw.answer, raw.distractors, rng);
            if (!options) return REASON('needs 3 distinct distractors');
            const oe = checkOptions(options, raw.answer);
            if (oe) return REASON(oe);
            const deictic = demonstrativeGapReason(template, raw.answer, options);
            if (deictic) return REASON(deictic);
            return tag('collocationPick', {
                prompt: 'Which word goes with it?', template, answer: clean(raw.answer), options,
                correctIndex: options.findIndex((o) => norm(o) === norm(raw.answer)),
            });
        }
        case 'contextTrueFalse': {
            if (!isStr(raw.passage, 20, 420)) return REASON('passage missing or too long');
            if (!isStr(raw.statement, 8, 200)) return REASON('statement missing or too long');
            if (typeof raw.correctTrue !== 'boolean') return REASON('correctTrue must be boolean');
            if (countGaps(raw.passage) || countGaps(raw.statement)) return REASON('no gaps allowed');
            if (!findTermForm(raw.passage, term.en)) return REASON('passage does not contain the target term');
            if (norm(raw.passage).includes(norm(raw.statement))) return REASON('statement just repeats the passage');
            return tag('contextTrueFalse', {
                prompt: 'Read and decide: true or false?', passage: clean(raw.passage), statement: clean(raw.statement), correctTrue: raw.correctTrue,
            });
        }
        case 'letterScramble': {
            const w = norm(term.en);
            if (!/^[a-z]{3,14}$/.test(w)) return REASON('letterScramble needs a single-word term of 3–14 letters');
            if (norm(raw.answer) !== w) return REASON('answer must equal the term');
            const clue = typeof raw.clue === 'string' ? raw.clue : (typeof raw.hint === 'string' ? raw.hint : '');
            if (!isStr(clue, 2, 80)) return REASON('hint missing');
            if (hasWord(clue, w)) return REASON('hint reveals the answer');
            const chars = w.split('');
            let letters = shuffled(chars, rng);
            for (let i = 0; i < 6 && letters.join('') === w; i++) letters = shuffled(chars, rng);
            if (letters.join('') === w) return REASON('cannot scramble term');
            return tag('letterScramble', { prompt: 'Unscramble the word.', hint: clean(clue), clue: clean(clue), letters, answer: clean(term.en) });
        }
        case 'translateType': {
            if (!isStr(raw.source, 4, 200)) return REASON('source (Polish sentence) missing');
            const e = sentenceOk(raw.answer, 'answer');
            if (e) return REASON(e);
            if (!findTermForm(raw.answer, term.en)) return REASON('answer does not contain the target term');
            const alts = [];
            for (const a of Array.isArray(raw.answers) ? raw.answers : []) {
                if (!isStr(a, 4, 220) || countGaps(a)) continue;
                if (!findTermForm(a, term.en)) continue;
                if (norm(a) === norm(raw.answer) || alts.some((x) => norm(x) === norm(a))) continue;
                alts.push(clean(a));
            }
            return tag('translateType', {
                prompt: 'Translate into English.', source: clean(raw.source), answer: clean(raw.answer), answers: [clean(raw.answer), ...alts.slice(0, 3)],
            });
        }
        case 'dictation': {
            const e = sentenceOk(raw.sentence);
            if (e) return REASON(e);
            if (!findTermForm(raw.sentence, term.en)) return REASON('sentence does not contain the target term');
            return tag('dictation', { prompt: 'Listen and type what you hear.', speak: clean(raw.sentence), answer: clean(raw.sentence) });
        }
        case 'listenPick': {
            const options = buildOptions(term.en, raw.distractors, rng);
            if (!options) return REASON('needs 3 distinct distractors');
            const oe = checkOptions(options, term.en);
            if (oe) return REASON(oe);
            return tag('listenPick', {
                prompt: 'Listen and pick the word you hear.', speak: clean(term.en), options, answer: clean(term.en),
                correctIndex: options.findIndex((o) => norm(o) === norm(term.en)),
            });
        }
        case 'wordFormation': {
            const stem = clean(raw.stem).toUpperCase();
            if (!/^[A-Z][A-Z' -]{1,24}$/.test(stem)) return REASON('stem must be an uppercase word');
            const e = sentenceOk(raw.sentence);
            if (e) return REASON(e);
            if (!isStr(raw.answer, 2, 30) || /\s/.test(clean(raw.answer))) return REASON('answer must be one word');
            const a = norm(raw.answer);
            const s = stem.toLowerCase();
            if (a === s) return REASON('answer equals the stem');
            const keep = s.slice(0, Math.max(3, s.length - 2));
            if (!a.includes(keep)) return REASON('answer is not derived from the stem');
            const template = makeTemplate(raw.sentence, raw.answer);
            if (!template) return REASON('answer not found in the sentence (or gap at sentence start)');
            if (hasWord(template.replace(GAP, ' '), raw.answer)) return REASON('answer also appears outside the gap (leak)');
            const related = termTokens(term.en).some((tk) => tokenMatches(a, tk) || tokenMatches(s, tk) || (tk.length >= 4 && (a.includes(tk.slice(0, Math.max(3, tk.length - 2))) || tk.includes(s.slice(0, Math.max(3, s.length - 2))))));
            if (!related) return REASON('derived word is not related to the target term');
            return tag('wordFormation', {
                prompt: 'Use the word in capitals to form a word that fits the gap.', stem, template, answer: clean(raw.answer),
            });
        }
        case 'keyTransform': {
            if (!isStr(raw.sourceSentence, 10, 220) || countGaps(raw.sourceSentence)) return REASON('sourceSentence missing');
            const key = clean(raw.keyWord).toUpperCase();
            if (!/^[A-Z][A-Z'-]{0,20}$/.test(key)) return REASON('keyWord must be one uppercase word');
            if (!isStr(raw.template, 8, 220) || countGaps(raw.template) !== 1) return REASON('template needs exactly one gap');
            const nAns = (s) => wordCount(s);
            const ok2to5 = (s) => isStr(s, 2, 60) && nAns(s) >= 2 && nAns(s) <= 5 && hasWord(s, key.toLowerCase());
            if (!ok2to5(raw.answer)) return REASON('answer must be 2–5 words including the key word');
            if (hasWord(raw.template.replace(GAP, ' '), key.toLowerCase())) return REASON('key word appears outside the gap');
            const filled = clean(raw.template).replace(/_{3,}/, clean(raw.answer));
            if (norm(filled).replace(/[.!?]+$/, '') === norm(raw.sourceSentence).replace(/[.!?]+$/, '')) return REASON('completed sentence is identical to the source sentence');
            if (!findTermForm(raw.sourceSentence, term.en) && !findTermForm(filled, term.en)) return REASON('target term does not appear in the exercise');
            if (hasWord(raw.template.replace(GAP, ' '), raw.answer)) return REASON('answer leaks in the template');
            const answers = [clean(raw.answer)];
            for (const a of Array.isArray(raw.answers) ? raw.answers : []) {
                if (ok2to5(a) && !answers.some((x) => norm(x) === norm(a))) answers.push(clean(a));
            }
            return tag('keyTransform', {
                prompt: 'Finish the second sentence so it means the same. Use 2–5 words including the key word.',
                sourceSentence: clean(raw.sourceSentence), keyWord: key, template: clean(raw.template), answer: answers[0], answers: answers.slice(0, 3),
            });
        }
        default:
            return REASON('unsupported type');
    }
}

/** Final safety net on a built item: no gap answer leaks into prompt; required fields. */
function finalCheck(item) {
    // a meaningPick prompt quotes the question word on purpose; only the ANSWER must not show up around it
    const shown = item.type === 'meaningPick' && item.question ? String(item.prompt || '').split(String(item.question)).join(' ') : item.prompt;
    if (item.answer && promptLeaks(shown, item.answer)) return 'answer appears in the prompt';
    return '';
}

// ---------------------------------------------------------------- cache, limiter, auth

export function createLruCache({ max = LIMITS.cacheMax, ttlMs = LIMITS.cacheTtlMs, now = () => Date.now() } = {}) {
    const m = new Map();
    return {
        get(k) {
            const e = m.get(k);
            if (!e) return undefined;
            if (now() - e.t > ttlMs) { m.delete(k); return undefined; }
            m.delete(k); m.set(k, e);
            return e.v;
        },
        set(k, v) {
            m.delete(k); m.set(k, { v, t: now() });
            while (m.size > max) m.delete(m.keys().next().value);
        },
        get size() { return m.size; },
    };
}

// ---------------------------------------------------------------- the question bank

/** Bank entries written by these prompt versions may be served; bump PROMPT_VERSION and drop a version here to retire it. */
export const BANK_COMPATIBLE_VERSIONS = new Set(['tg1', 'tg2']);
/** Only these may be recorded as "makes no sense for this term" (a permanent skip in the bank). */
export const SKIPPABLE_TYPES = new Set(['wordFormation', 'keyTransform', 'collocationPick', 'letterScramble']);
/** How many different items per (term, level, slot) the bank is grown to, and its hard cap. */
export const BANK_TARGET = 3;
const SLOT_MAX = { letterScramble: 1, meaningPick: 3, listenPick: 3 };
const slotMax = (slot) => SLOT_MAX[slotType(slot)] ?? 8;
const slotTarget = (slot) => Math.min(BANK_TARGET, slotMax(slot));

/** Term identity in the bank: normalised English form + normalised Polish meaning (homonyms stay apart). */
export function termKeyOf(term) {
    return `${norm(term.en).replace(/\s+/g, ' ')}|${norm(term.pl).replace(/\s+/g, ' ')}`;
}

/** Text used to detect repeated / near-identical items. */
export function itemText(item) {
    const fill = (t, a) => String(t || '').replace(/_{3,}/, a || '');
    switch (item.type) {
        case 'sentenceGap': case 'gapTranslate': case 'collocationPick': case 'wordFormation': return fill(item.template, item.answer);
        case 'sentenceOrder': return (item.correctOrder || []).join(' ');
        case 'contextTrueFalse': return `${item.passage} ${item.statement}`;
        case 'translateType': case 'dictation': case 'letterScramble': return String(item.answer || '');
        case 'keyTransform': return `${item.sourceSentence} ${item.answer}`;
        case 'meaningPick': case 'listenPick': return `${item.direction || ''} ${[...(item.options || [])].map(norm).sort().join(' ')}`;
        default: return JSON.stringify(item);
    }
}
function jaccard(a, b) {
    const A = new Set(words(a)); const B = new Set(words(b));
    if (!A.size || !B.size) return 0;
    let i = 0; for (const w of A) if (B.has(w)) i++;
    return i / (A.size + B.size - i);
}
const fingerprint = (slot, text) => crypto.createHash('sha1').update(`${slot}\u0001${norm(text)}`).digest('hex').slice(0, 20);
export const NEAR_DUPLICATE = 0.8;

/** Postgres persistence for the bank (table created lazily). Every failure is swallowed: the in-memory bank still works. */
export function createPgBankStore({ getPool } = {}) {
    let ready = null;
    const ensure = () => (ready ||= (async () => {
        const q = (sql) => getPool().query(sql);
        await q(`CREATE TABLE IF NOT EXISTS track_ai_bank (
            id BIGSERIAL PRIMARY KEY, term_key TEXT NOT NULL, en TEXT NOT NULL, pl TEXT NOT NULL, level TEXT NOT NULL,
            type TEXT NOT NULL, slot TEXT NOT NULL, fp TEXT NOT NULL, item JSONB NOT NULL, prompt_version TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), served_count INTEGER NOT NULL DEFAULT 0, last_served_at TIMESTAMPTZ,
            UNIQUE (term_key, level, fp))`);
        await q('CREATE INDEX IF NOT EXISTS track_ai_bank_term_idx ON track_ai_bank (term_key, level)');
    })().catch((e) => { ready = null; throw e; }));
    return {
        async loadTerm(termKey, level) {
            try {
                await ensure();
                const r = await getPool().query('SELECT id, slot, type, fp, item, prompt_version, served_count, last_served_at FROM track_ai_bank WHERE term_key = $1 AND level = $2', [termKey, level]);
                return r.rows.map((x) => ({ id: String(x.id), slot: x.slot, type: x.type, fp: x.fp, item: x.item, promptVersion: x.prompt_version, servedCount: x.served_count, lastServedAt: x.last_served_at ? new Date(x.last_served_at).getTime() : 0 }));
            } catch (e) { console.warn('[track-ai] bank load failed:', e.message); return null; }
        },
        /** Inserts one row; returns its id, or null when it already exists (or on error). */
        async insert(row) {
            try {
                await ensure();
                const r = await getPool().query(
                    'INSERT INTO track_ai_bank (term_key, en, pl, level, type, slot, fp, item, prompt_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (term_key, level, fp) DO NOTHING RETURNING id',
                    [row.termKey, row.en, row.pl, row.level, row.type, row.slot, row.fp, JSON.stringify(row.item), row.promptVersion]);
                return r.rows[0] ? String(r.rows[0].id) : null;
            } catch (e) { console.warn('[track-ai] bank insert failed:', e.message); return undefined; }
        },
        async markServed(ids) {
            if (!ids.length) return;
            try {
                await ensure();
                await getPool().query('UPDATE track_ai_bank SET served_count = served_count + 1, last_served_at = NOW() WHERE id = ANY($1::bigint[])', [ids.filter((i) => /^\d+$/.test(i))]);
            } catch (e) { console.warn('[track-ai] bank markServed failed:', e.message); }
        },
    };
}

/**
 * Growing question bank keyed by TERM (en+pl) + CEFR level, independent of any word set.
 * Entries: { id, slot, type, fp, item, promptVersion, servedCount, lastServedAt, skipped? }.
 * `item` never carries id/lexiconId (rewritten per requesting set when served).
 */
export function createBank({ store = null, now = () => Date.now(), maxTerms = 5000, ttlMs = 10 * 60_000 } = {}) {
    const mem = createLruCache({ max: maxTerms, ttlMs, now });
    let seq = 0;
    return {
        async entries(termKey, level) {
            const k = `${level}|${termKey}`;
            let list = mem.get(k);
            if (list) return list;
            list = store ? ((await store.loadTerm(termKey, level)) || []) : [];
            for (const e of list) if (e.item && e.item.skipped === true) e.skipped = true;
            const again = mem.get(k); // another request may have loaded it meanwhile
            if (again) return again;
            mem.set(k, list);
            return list;
        },
        /** Add validated items; exact and near-duplicates are refused. Returns the entries actually added. */
        async add(term, level, newOnes) {
            const termKey = termKeyOf(term);
            const list = await this.entries(termKey, level);
            const added = [];
            for (const n of newOnes) {
                const slot = n.slot;
                const skipped = Boolean(n.skipped);
                const text = skipped ? 'skip' : itemText(n.item);
                const fp = skipped ? `skip|${slot}` : fingerprint(slot, text);
                const same = list.filter((e) => e.slot === slot);
                if (same.some((e) => e.fp === fp)) continue;
                if (skipped && same.length) continue;
                if (!skipped && same.filter((e) => !e.skipped && !bankedItemBad(e.item, level, term)).length >= slotMax(slot)) continue;
                if (!skipped && same.some((e) => !e.skipped && n.item.type !== 'meaningPick' && n.item.type !== 'listenPick' && jaccard(itemText(e.item), text) >= NEAR_DUPLICATE)) continue;
                const { id: _i, lexiconId: _l, ...bare } = n.item || {};
                const entry = { id: `m${++seq}`, slot, type: slotType(slot), fp, item: bare, promptVersion: n.promptVersion || PROMPT_VERSION, servedCount: 0, lastServedAt: 0, ...(skipped ? { skipped: true } : {}) };
                if (store) {
                    const id = await store.insert({ termKey, en: term.en, pl: term.pl, level, type: entry.type, slot, fp, item: skipped ? { skipped: true } : entry.item, promptVersion: entry.promptVersion });
                    if (id === null) continue; // already stored by another instance
                    if (id) entry.id = id;
                }
                list.push(entry);
                added.push(entry);
            }
            return added;
        },
        markServed(entries) {
            const t = now();
            for (const e of entries) { e.servedCount++; e.lastServedAt = t; }
            if (store) store.markServed(entries.map((e) => e.id)).catch(() => {});
        },
    };
}

/** Compatible, non-skip entries per slot. */
const usable = (list, slot, level, term, setTerms) => list.filter((e) => e.slot === slot && !e.skipped && BANK_COMPATIBLE_VERSIONS.has(e.promptVersion) && !bankedItemBad(e.item, level, term, setTerms)); // generic / too-hard A1-A2 sentences count as missing -> regenerated
const isSkipped = (list, slot) => list.some((e) => e.slot === slot && e.skipped && BANK_COMPATIBLE_VERSIONS.has(e.promptVersion));

/** Least-served first, then least recently served, random tie-break. */
export function pickLeastServed(entries, rand = Math.random) {
    return entries.slice().sort((a, b) => (a.servedCount - b.servedCount) || ((a.lastServedAt || 0) - (b.lastServedAt || 0)) || (rand() - 0.5))[0];
}

/** Sliding-window per-key + global limiter, one concurrent job per key, bounded global concurrency. */
export function createTrackLimiter({ now = () => Date.now(), limits = LIMITS } = {}) {
    const hits = new Map();
    const cheap = new Map();
    const busy = new Set();
    let globalHits = [];
    let bgHits = [];
    let running = 0;
    return {
        check(key) {
            const t = now();
            globalHits = globalHits.filter((x) => t - x < limits.globalWindowMs);
            const list = (hits.get(key) || []).filter((x) => t - x < limits.userWindowMs);
            if (list.length) hits.set(key, list); else hits.delete(key);
            if (busy.has(key)) return { ok: false, code: 'busy', error: 'A generation for this user is already running.', retryAfterSec: 5 };
            if (running >= limits.globalConcurrent) return { ok: false, code: 'server_busy', error: 'The generator is busy. Try again shortly.', retryAfterSec: 10 };
            if (list.length >= limits.userMax) return { ok: false, code: 'rate_limited', error: 'Too many generation requests. Slow down.', retryAfterSec: Math.ceil((limits.userWindowMs - (t - list[0])) / 1000) };
            if (globalHits.length >= limits.globalMax) return { ok: false, code: 'rate_limited_global', error: 'The generator is over its hourly capacity.', retryAfterSec: Math.ceil((limits.globalWindowMs - (t - globalHits[0])) / 1000) };
            return { ok: true };
        },
        /** Bank-only requests (no AI work): a much looser per-user window; never blocked by `busy`/`running`. */
        checkCheap(key) {
            const t = now();
            const list = (cheap.get(key) || []).filter((x) => t - x < limits.userWindowMs);
            if (list.length >= (limits.cheapMax ?? 120)) { cheap.set(key, list); return { ok: false, code: 'rate_limited', error: 'Too many requests. Slow down.', retryAfterSec: Math.ceil((limits.userWindowMs - (t - list[0])) / 1000) }; }
            list.push(t); cheap.set(key, list);
            if (cheap.size > 5000) for (const k of cheap.keys()) { cheap.delete(k); if (cheap.size <= 4000) break; }
            return { ok: true };
        },
        start(key) { const t = now(); busy.add(key); running++; globalHits.push(t); hits.set(key, [...(hits.get(key) || []), t]); },
        finish(key) { busy.delete(key); running = Math.max(0, running - 1); },
        /** Background bank growth: bounded per hour, and always leaves one slot free for real requests. */
        tryStartBackground() {
            const t = now();
            bgHits = bgHits.filter((x) => t - x < limits.globalWindowMs);
            if (bgHits.length >= limits.bgMax || running >= limits.globalConcurrent - 1) return false;
            bgHits.push(t); running++;
            return true;
        },
        finishBackground() { running = Math.max(0, running - 1); },
        stats() { return { running, global: globalHits.length, background: bgHits.length }; },
    };
}

export const BRIDGE_HEADERS = { timestamp: 'x-bridge-timestamp', nonce: 'x-bridge-nonce', signature: 'x-bridge-signature' };

export function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** String the app server signs. Body hash = SHA-256 hex of the exact request body bytes. */
export function bridgeSigningString({ timestamp, nonce, method, path, rawBody }) {
    const bodyHash = crypto.createHash('sha256').update(rawBody || Buffer.alloc(0)).digest('hex');
    return ['v1', String(timestamp), String(nonce), String(method).toUpperCase(), path, bodyHash].join('\n');
}
export function signBridgeRequest({ secret, timestamp, nonce, method = 'POST', path, rawBody }) {
    return `v1=${b64url(crypto.createHmac('sha256', secret).update(bridgeSigningString({ timestamp, nonce, method, path, rawBody })).digest())}`;
}

export function createNonceStore({ now = () => Date.now(), ttlMs = LIMITS.nonceTtlMs, max = 20000 } = {}) {
    const m = new Map();
    return {
        /** true if fresh (and remembers it), false if replayed. */
        use(nonce) {
            const t = now();
            for (const [k, v] of m) { if (t - v > ttlMs) m.delete(k); else break; }
            if (m.has(nonce)) return false;
            m.set(nonce, t);
            while (m.size > max) m.delete(m.keys().next().value);
            return true;
        },
    };
}

/** { ok:true } or { ok:false, status, code, error }. */
export function verifyBridgeRequest(req, { secret, nonces, now = () => Date.now(), path }) {
    if (!secret || secret.length < 16) return { ok: false, status: 503, code: 'bridge_not_configured', error: 'STUDY_BRIDGE_SECRET is not configured on lingospark.study.' };
    const h = (n) => String(req.headers[n] || '');
    const ts = h(BRIDGE_HEADERS.timestamp);
    const nonce = h(BRIDGE_HEADERS.nonce);
    const sig = h(BRIDGE_HEADERS.signature);
    if (!/^\d{10,16}$/.test(ts) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !/^v1=[A-Za-z0-9_-]{43}$/.test(sig)) {
        return { ok: false, status: 401, code: 'bad_signature_headers', error: 'Missing or malformed bridge signature headers.' };
    }
    if (Math.abs(now() - Number(ts)) > LIMITS.signatureSkewMs) return { ok: false, status: 401, code: 'stale_timestamp', error: 'Request timestamp is outside the allowed window.' };
    if (!Buffer.isBuffer(req.rawBody)) return { ok: false, status: 400, code: 'bad_request', error: 'Send the body as application/json.' };
    const expected = signBridgeRequest({ secret, timestamp: ts, nonce, method: req.method, path, rawBody: req.rawBody });
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, status: 401, code: 'bad_signature', error: 'Bridge signature does not match.' };
    if (!nonces.use(nonce)) return { ok: false, status: 401, code: 'replayed_nonce', error: 'This nonce was already used.' };
    return { ok: true };
}

// ---------------------------------------------------------------- generator

class TimeoutError extends Error { constructor(m) { super(m); this.name = 'TimeoutError'; } }
const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms} ms`)), Math.max(1, ms));
    t.unref?.();
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

const SKIP_SLOTS = (type) => slotsFor(type);

function meaningPrompt(direction, question) {
    const q = clean(question || '');
    if (direction === 'pl-en') return q ? `English word for "${q}"` : 'English word for this?';
    return q ? `What does "${q}" mean in Polish?` : 'What does it mean in Polish?';
}

/** Pick distractors from the other terms of the requesting set when that keeps the item valid. */
function reshuffleOptions(item, term, setTerms, rand, level) {
    if (bankedItemBad(item, level, term, setTerms)) return null; // generic or too-hard A1/A2 banked item: treated as missing
    const out = { ...item };
    if (out.type === 'meaningPick') out.prompt = meaningPrompt(out.direction, out.question); // banked items keep old wording
    if (!out.hintHelp || hintReason(out.hintHelp, out, term, setTerms)) {
        const cheap = cheapHint(out, term, setTerms);
        if (cheap) out.hintHelp = cheap;
        else delete out.hintHelp;
    }
    if (!Array.isArray(out.options)) return out;
    const answer = out.answer;
    let options = out.options.slice();
    if (out.type === 'meaningPick' || out.type === 'listenPick') {
        const field = out.type === 'meaningPick' && out.direction === 'en-pl' ? 'pl' : 'en';
        const wc = wordCount(answer);
        const pool = setTerms.filter((t) => t.id !== term.id).map((t) => clean(t[field]))
            .filter((v) => v && norm(v) !== norm(answer) && Math.abs(wordCount(v) - wc) <= 1);
        const uniq = [...new Map(pool.map((v) => [norm(v), v])).values()];
        if (uniq.length >= 3 && rand() < 0.5) {
            const picked = shuffled(uniq, rand).slice(0, 3);
            const swapped = [answer, ...picked];
            if (!checkOptions(swapped, answer)) options = swapped;
        }
    }
    if (checkOptions(options, answer)) return null; // stored options are broken: unusable
    options = shuffled(options, rand);
    out.options = options;
    if ('correctIndex' in out) out.correctIndex = options.findIndex((o) => norm(o) === norm(answer));
    return out;
}

/**
 * createTrackGenerator({ runPrompt, bank }) -> generate(request) -> { items, meta, growPlan, grow }.
 * runPrompt(prompt, label) must resolve to parsed JSON ({items:[],skipped:[]}).
 * Items come from the term-keyed bank; the AI is only called for slots the bank cannot serve
 * (foreground) or, after the response, to grow the bank (grow()).
 */
/** Rough output size (tokens) of one slot; used to cut a term's work into small, parallel AI calls. */
const SLOT_WEIGHT = {
    letterScramble: 30, 'meaningPick:pl-en': 55, 'meaningPick:en-pl': 55, sentenceGap: 70, gapTranslate: 100, sentenceOrder: 80,
    translateType: 100, listenPick: 55, dictation: 45, contextTrueFalse: 140, collocationPick: 55, wordFormation: 70, keyTransform: 140,
};
const weightOf = (slot) => SLOT_WEIGHT[slot] ?? 90;

/**
 * Warm-up station: one easy item per term for the first few terms, mixed types, tiny output (meaningPick/listenPick only need
 * distractors). Each row lists the slots to try for that position, best first; banked ones are preferred over generating.
 */
const WARMUP_PREFS = [
    ['meaningPick:pl-en', 'listenPick', 'meaningPick:en-pl'],
    ['sentenceGap', 'meaningPick:en-pl', 'listenPick'],
    ['listenPick', 'meaningPick:pl-en', 'sentenceGap'],
    ['meaningPick:en-pl', 'sentenceGap', 'meaningPick:pl-en'],
    ['meaningPick:pl-en', 'sentenceGap', 'listenPick'],
    ['listenPick', 'meaningPick:en-pl', 'sentenceGap'],
];
export function planWarmup({ terms, size, lists, has }) {
    const plan = []; const used = new Set();
    for (let j = 0; j < size; j++) {
        const term = terms[j % terms.length];
        const prefs = WARMUP_PREFS[j % WARMUP_PREFS.length].filter((sl) => !used.has(`${term.id}|${sl}`));
        const banked = prefs.find((sl) => has(lists.get(term.id), sl, term));
        const slot = banked || prefs[0];
        if (!slot) continue;
        used.add(`${term.id}|${slot}`);
        plan.push({ term, slot, banked: Boolean(banked) });
    }
    return plan;
}

/** A counting semaphore with two priorities (foreground requests before background growth). */
function createSemaphore(max) {
    let free = max;
    const queues = { hi: [], lo: [] };
    const pump = () => {
        while (free > 0) {
            const next = queues.hi.shift() || queues.lo.shift();
            if (!next) return;
            free--; next();
        }
    };
    return {
        acquire(prio = 'hi') { return new Promise((resolve) => { queues[prio === 'lo' ? 'lo' : 'hi'].push(resolve); pump(); }); },
        release() { free++; pump(); },
    };
}

/**
 * Cut jobs ([{ term, slots:Set, avoid }]) into AI calls of about `callWeight` output tokens each, in term order:
 * a term with many slots becomes several parallel calls, terms with few slots share one call.
 */
export function planCalls(jobs, callWeight = LIMITS.callWeight) {
    const calls = [];
    let cur = null;
    const flush = () => { if (cur && cur.parts.size) calls.push([...cur.parts.values()]); cur = null; };
    for (const job of jobs) {
        const slots = [...job.slots].sort((x, y) => weightOf(y) - weightOf(x));
        const total = slots.reduce((n, sl) => n + weightOf(sl), 0);
        const nChunks = Math.max(1, Math.ceil(total / callWeight - 0.2));
        const chunks = Array.from({ length: nChunks }, () => ({ slots: [], w: 0 }));
        for (const sl of slots) { chunks.sort((x, y) => x.w - y.w); chunks[0].slots.push(sl); chunks[0].w += weightOf(sl); }
        chunks.sort((x, y) => y.w - x.w);
        for (const ch of chunks) {
            if (!ch.slots.length) continue;
            if (cur && cur.w + ch.w > callWeight * 1.25) flush();
            cur = cur || { w: 0, parts: new Map() };
            const part = cur.parts.get(job.term.id) || { term: job.term, slots: new Set(), avoid: [] };
            ch.slots.forEach((sl) => part.slots.add(sl));
            part.avoid = job.avoid.filter((a) => part.slots.has(a.slot));
            cur.parts.set(job.term.id, part);
            cur.w += ch.w;
        }
    }
    flush();
    return calls;
}

export function createTrackGenerator({ runPrompt, bank = createBank(), limits = LIMITS, now = () => Date.now(), log = () => {}, rand = Math.random, onTopUp = null } = {}) {
    const cooldown = new Map(); // `${level}|${termKey}|${slot}` -> failed-at
    const cool = (level, term, slot) => { const t = cooldown.get(`${level}|${termKeyOf(term)}|${slot}`); return t && now() - t < limits.failCooldownMs; };
    const sem = createSemaphore(limits.globalCallConcurrency ?? 12);
    const inflight = new Map(); // `${level}|${termKey}|${slot}` -> promise that settles once that call stored its first pass
    const flightKey = (level, term, slot) => `${level}|${termKeyOf(term)}|${slot}`;
    let fgActive = 0; // foreground generate() requests currently running (the prewarm worker yields to them)

    /**
     * One AI call (plus retries for what failed validation). `onFirstPass(stillNeeded)` fires after the first answer
     * has been processed; retries continue after the response has gone out (they only fill the bank then).
     */
    async function runBatch({ level, batch, setTerms, slotsByTerm, avoid, jobDeadlineAt, stats, prio, onFirstPass, counters }) {
        const found = new Map(batch.map((t) => [t.id, new Map()])); // termId -> slot -> built item
        const skipped = new Set(); // `${termId}|${slot}`
        let feedback = [];
        const wants = slotsByTerm;
        for (let attempt = 0; attempt < limits.maxAttempts; attempt++) {
            const need = new Map();
            for (const t of batch) {
                const sl = new Set([...wants.get(t.id)].filter((x) => !found.get(t.id).has(x) && !skipped.has(`${t.id}|${x}`)));
                if (sl.size) need.set(t.id, sl);
            }
            if (!need.size) break;
            if (jobDeadlineAt - now() < 2000) { stats.timedOut = true; break; }
            const prompt = buildTrackPrompt({ level, terms: batch.filter((t) => need.has(t.id)), setTerms, wants: need, feedback, avoid });
            const nSlots = [...need.values()].reduce((n, x) => n + x.size, 0);
            let raw;
            await sem.acquire(prio);
            const t0 = now();
            try {
                if (jobDeadlineAt - now() < 2000) { stats.timedOut = true; break; }
                stats.aiCalls++;
                raw = await withTimeout(runPrompt(prompt, `track-${level}-${need.size}t${nSlots}s${attempt ? `-r${attempt}` : ''}`), Math.min(limits.perCallTimeoutMs, jobDeadlineAt - now()), 'AI call');
                log(`call ${need.size}t/${nSlots}s attempt ${attempt} ${now() - t0}ms`);
            } catch (e) {
                if (e instanceof TimeoutError) stats.timedOut = true; else stats.aiErrors++;
                log(`track call attempt ${attempt} failed after ${now() - t0}ms: ${e.message}`);
                feedback = [];
                if (attempt === 0) onFirstPass?.(true);
                continue;
            } finally { sem.release(); }
            feedback = [];
            for (const sk of Array.isArray(raw?.skipped) ? raw.skipped : []) {
                const termId = String(sk?.termId ?? '');
                if (sk && need.has(termId) && SKIPPABLE_TYPES.has(sk.type)) SKIP_SLOTS(sk.type).forEach((sl) => skipped.add(`${termId}|${sl}`));
            }
            for (const r of Array.isArray(raw?.items) ? raw.items : []) {
                const termId = String(r?.termId ?? '');
                const term = batch.find((t) => t.id === termId);
                if (!term || !need.has(termId)) continue;
                const built = buildItem(r, term, level, setTerms);
                const rType = canonType(r?.type);
                const slot = built.slot || (rType === 'meaningPick' ? `meaningPick:${r.direction}` : rType);
                if (!built.ok) { feedback.push({ termId, slot, reason: built.reason }); log(`rejected ${level} "${term.en}" ${slot}: ${built.reason}`); continue; }
                if (!need.get(termId).has(built.slot)) continue;
                const fc = finalCheck(built.item);
                if (fc) { feedback.push({ termId, slot, reason: fc }); continue; }
                const prior = avoid.get(termId) || [];
                if (prior.some((a) => a.slot === built.slot && jaccard(a.text, itemText(built.item)) >= NEAR_DUPLICATE)) {
                    feedback.push({ termId, slot, reason: 'too similar to an item that already exists; write a different one' });
                    continue;
                }
                if (!found.get(termId).has(built.slot)) found.get(termId).set(built.slot, built.item);
            }
            // a wanted item the model simply did not write gets feedback too (otherwise the retry repeats the same prompt)
            for (const [termId, slots] of need) {
                for (const sl of slots) {
                    if (found.get(termId).has(sl) || skipped.has(`${termId}|${sl}`) || feedback.some((f) => f.termId === termId && f.slot === sl)) continue;
                    feedback.push({ termId, slot: sl, reason: `missing: no valid "${slotType(sl)}" item was returned for this term${sl.includes(':') ? ` (direction ${sl.split(':')[1]})` : ''}; write it with exactly the fields of its format` });
                    log(`missing ${level} "${batch.find((t) => t.id === termId)?.en}" ${sl}`);
                }
            }
            if (attempt === 0) {
                // store the first pass right away so the response (and other requests) can already use it
                counters.newItems += await storeResults({ level, batch, wants, found, skipped, final: false });
                const missing = batch.some((t) => [...wants.get(t.id)].some((x) => !found.get(t.id).has(x) && !skipped.has(`${t.id}|${x}`)));
                onFirstPass?.(missing);
            }
        }
        return { found, skipped };
    }

    /** Write what validated into the bank (idempotent: dedupe keeps repeated adds harmless). */
    const stored = new WeakMap(); // found-map -> Set of `${termId}|${slot}` already written
    async function storeResults({ level, batch, wants, found, skipped, final }) {
        const done = stored.get(found) || new Set();
        stored.set(found, done);
        let added = 0;
        for (const term of batch) {
            const adds = [];
            for (const [slot, item] of found.get(term.id)) { if (!done.has(`${term.id}|${slot}`)) { done.add(`${term.id}|${slot}`); adds.push({ slot, item }); } }
            for (const sk of skipped) {
                const i = sk.indexOf('|');
                if (sk.slice(0, i) === term.id && !done.has(sk)) { done.add(sk); adds.push({ slot: sk.slice(i + 1), skipped: true }); }
            }
            if (adds.length) added += (await bank.add(term, level, adds)).filter((e) => !e.skipped).length;
            if (final) {
                for (const slot of wants.get(term.id)) {
                    if (!found.get(term.id).has(slot) && !skipped.has(`${term.id}|${slot}`)) cooldown.set(`${level}|${termKeyOf(term)}|${slot}`, now());
                }
            }
        }
        return added;
    }

    /**
     * Cut jobs into small AI calls and run them in parallel (request order, `callConcurrency` at a time).
     * Returns at once: `fg` resolves when every call has had its first pass (a retry that could not finish inside the
     * foreground budget no longer holds it back), `all` when every call and retry has ended. Calls are never
     * cancelled: whatever finishes after the response still lands in the bank.
     */
    function fill({ level, jobs, setTerms, fgDeadlineAt = null, jobDeadlineAt, stats, prio = 'hi', concurrency = limits.callConcurrency ?? 12, callWeight = limits.callWeight ?? LIMITS.callWeight }) {
        const calls = planCalls(jobs, callWeight);
        const counters = { newItems: 0, open: calls.length };
        const gates = calls.map(() => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; });
        let next = 0;
        const worker = async () => {
            while (next < calls.length) {
                const idx = next++;
                const parts = calls[idx];
                const batch = parts.map((p) => p.term);
                const avoid = new Map(parts.filter((p) => p.avoid.length).map((p) => [p.term.id, p.avoid]));
                const slotsByTerm = new Map(parts.map((p) => [p.term.id, p.slots]));
                let flightDone; const flight = new Promise((r) => { flightDone = r; });
                const keys = parts.flatMap((p) => [...p.slots].map((sl) => flightKey(level, p.term, sl)));
                keys.forEach((k) => { if (!inflight.has(k)) inflight.set(k, flight); });
                const onFirstPass = (stillNeeded) => {
                    flightDone();
                    if (!stillNeeded || fgDeadlineAt == null || fgDeadlineAt - now() < limits.retryMinRemainingMs) gates[idx].resolve();
                };
                try {
                    const { found, skipped } = await runBatch({ level, batch, setTerms, slotsByTerm, avoid, jobDeadlineAt, stats, prio, onFirstPass, counters });
                    counters.newItems += await storeResults({ level, batch, wants: slotsByTerm, found, skipped, final: true });
                } catch (e) {
                    log(`track call crashed: ${e?.message || e}`);
                } finally { counters.open--; gates[idx].resolve(); flightDone(); keys.forEach((k) => { if (inflight.get(k) === flight) inflight.delete(k); }); }
            }
        };
        const all = Promise.all(Array.from({ length: Math.min(concurrency, calls.length) }, worker));
        return { fg: Promise.all(gates.map((g) => g.promise)), all, calls: calls.length, counters };
    }

    const wantedSlots = (term, types) => {
        const out = [];
        for (const ty of types) {
            if (ty === 'letterScramble' && !/^[a-z]{3,14}$/.test(norm(term.en))) continue; // a phrase cannot be scrambled
            out.push(...slotsFor(ty));
        }
        return out;
    };

    /** Bank state of one term: which wanted slots are served (usable or remembered as skipped), in flight, or cooling down. */
    function termState(level, term, list, wanted, setTerms) {
        const have = []; const missing = [];
        for (const sl of wanted) (usable(list, sl, level, term, setTerms).length || isSkipped(list, sl) ? have : missing).push(sl);
        const open = missing.filter((sl) => !cool(level, term, sl));
        const ratio = wanted.length ? have.length / wanted.length : 1;
        // "sufficient": enough of the term's task types are banked to serve a station without waiting for the AI
        const sufficient = !wanted.length || ratio >= (limits.fgSufficientRatio ?? 0.7) || !open.length;
        return { have, missing, open, sufficient, ready: !missing.length };
    }
    const metaReady = (level, terms, lists, slotsOf) => {
        const ready = {};
        for (const term of terms) {
            const st = termState(level, term, lists.get(term.id), slotsOf.get(term.id), terms);
            ready[term.id] = {
                ready: st.ready, have: st.have.length, want: slotsOf.get(term.id).length,
                pending: st.missing.some((sl) => inflight.has(flightKey(level, term, sl))),
            };
        }
        return ready;
    };

    /** Bank-only look (no AI): can this request be answered at once? */
    async function readiness({ level, terms, types }) {
        const lists = new Map(); const slotsOf = new Map();
        for (const term of terms) { lists.set(term.id, await bank.entries(termKeyOf(term), level)); slotsOf.set(term.id, wantedSlots(term, types)); }
        const ready = metaReady(level, terms, lists, slotsOf);
        const allSufficient = terms.every((t) => termState(level, t, lists.get(t.id), slotsOf.get(t.id), terms).sufficient);
        const readyCount = terms.filter((t) => ready[t.id].ready).length;
        return { allSufficient, allReady: readyCount === terms.length, readyCount, ready };
    }

    /**
     * Fill the bank for `terms` at `level` until every wanted slot is served or skipped (no response, no time budget).
     * Used by the prewarm worker (low priority, own call weight). Returns what is still missing per term id.
     */
    async function prewarm({ level, terms, types = typesForLevel(level), concurrency = limits.bgCallConcurrency ?? 3, callWeight = limits.prewarmCallWeight ?? limits.callWeight ?? LIMITS.callWeight, prio = 'lo' }) {
        const stats = { aiCalls: 0, aiErrors: 0, timedOut: false };
        const jobs = []; let waiting = [];
        for (const term of terms) {
            const list = await bank.entries(termKeyOf(term), level);
            const want = wantedSlots(term, types);
            const st = termState(level, term, list, want, terms);
            const todo = st.missing.filter((sl) => { const f = inflight.get(flightKey(level, term, sl)); if (f) waiting.push(f); return !f; });
            if (todo.length) jobs.push({ term, slots: new Set(todo), avoid: [] });
        }
        let added = 0;
        if (jobs.length) {
            const run = fill({ level, jobs, setTerms: terms, jobDeadlineAt: now() + (limits.prewarmDeadlineMs ?? 150_000), stats, prio, concurrency, callWeight });
            await run.all.catch(() => {});
            added = run.counters.newItems;
        }
        await Promise.all(waiting);
        const left = {}; let done = 0;
        for (const term of terms) {
            const st = termState(level, term, await bank.entries(termKeyOf(term), level), wantedSlots(term, types), terms);
            if (st.ready) done++; else left[term.id] = st.missing;
        }
        return { aiCalls: stats.aiCalls, aiErrors: stats.aiErrors, added, ready: done, total: terms.length, missing: left };
    }

    async function generate(v) {
        // a warm-up request is the same learner as the background job it starts: it must not make the worker yield
        if (v.mode === 'warmup') return generateWarmup(v);
        fgActive++;
        try { return await generateInner(v); } finally { fgActive--; }
    }

    /** Which warm-up items would be served, and are they all banked already? (bank only, no AI) */
    async function warmupPlanFor({ level, terms, warmupSize }) {
        const size = Math.min(limits.warmupMax ?? 6, Math.max(limits.warmupMin ?? 3, warmupSize || limits.warmupDefault || 4));
        const lists = new Map();
        await Promise.all(terms.map(async (t) => lists.set(t.id, await bank.entries(termKeyOf(t), level))));
        const plan = planWarmup({ terms, size, lists, has: (list, sl, term) => usable(list, sl, level, term, terms).length > 0 });
        return { size, lists, plan };
    }
    async function warmupReadiness(v) {
        const { plan } = await warmupPlanFor(v);
        return { banked: plan.length > 0 && plan.every((p) => p.banked), plan: plan.length };
    }

    /**
     * mode "warmup": a small first station (default 4 easy items over the first terms) as fast as possible, and the whole set
     * queued for background generation at the same moment. Bank first; whatever is not banked is ONE small AI call.
     */
    async function generateWarmup({ setId, level, terms, budgetMs, warmupSize }) {
        const started = now();
        const budget = Math.min(limits.deadlineMs, Math.max(limits.minBudgetMs ?? 1500, budgetMs || limits.budgetMs || limits.deadlineMs));
        const fgDeadlineAt = started + budget;
        const jobDeadlineAt = started + Math.max(limits.jobDeadlineMs ?? limits.deadlineMs, budget);
        const stats = { aiCalls: 0, aiErrors: 0, timedOut: false };
        const { size, lists, plan } = await warmupPlanFor({ level, terms, warmupSize });
        const allTypes = typesForLevel(level);
        const slotsOf = new Map(terms.map((t) => [t.id, wantedSlots(t, allTypes)]));
        // (b) the rest of the set goes to the background queue right now, in set order
        const gapTerms = terms.filter((t) => !termState(level, t, lists.get(t.id), slotsOf.get(t.id), terms).ready);
        if (gapTerms.length && onTopUp) { try { onTopUp({ level, terms: gapTerms }); } catch (e) { log(`warm-up queue hook failed: ${e?.message || e}`); } }
        // (a) warm-up items the bank cannot serve: one small call for all of them (mixed easy types, tiny output)
        const jobs = []; const waitFor = [];
        const byTerm = new Map();
        for (const p of plan) {
            if (p.banked) continue;
            const f = inflight.get(flightKey(level, p.term, p.slot));
            if (f) { waitFor.push(f); continue; }
            if (!byTerm.has(p.term.id)) { const job = { term: p.term, slots: new Set(), avoid: [] }; byTerm.set(p.term.id, job); jobs.push(job); }
            byTerm.get(p.term.id).slots.add(p.slot);
        }
        let newItems = 0; let pendingCalls = 0;
        if (jobs.length || waitFor.length) {
            const run = jobs.length ? fill({ level, jobs, setTerms: terms, fgDeadlineAt, jobDeadlineAt, stats, concurrency: 1, callWeight: 1e9 }) : { fg: Promise.resolve(), all: Promise.resolve(), counters: { newItems: 0, open: 0 } };
            let timer;
            const onTime = new Promise((resolve) => { timer = setTimeout(() => resolve('budget'), Math.max(1, fgDeadlineAt - now())); });
            const outcome = await Promise.race([Promise.all([run.fg, ...waitFor]).then(() => 'done'), onTime]);
            clearTimeout(timer);
            run.all.catch(() => {});
            if (outcome === 'budget') stats.timedOut = true;
            newItems = run.counters.newItems;
            pendingCalls = run.counters.open;
        }
        // serve: the planned slot, else another easy slot of the same term that is banked
        const items = []; const served = []; const dropped = []; const used = new Set();
        let fromBank = 0;
        for (const p of plan) {
            const list = await bank.entries(termKeyOf(p.term), level);
            const tryOrder = [p.slot, ...WARMUP_PREFS.flat().filter((sl, i, a) => a.indexOf(sl) === i && sl !== p.slot)];
            let hit = null;
            for (const slot of tryOrder) {
                if (used.has(`${p.term.id}|${slot}`)) continue;
                for (const c of usable(list, slot, level, p.term, terms).slice().sort((a, b) => (a.servedCount - b.servedCount) || ((a.lastServedAt || 0) - (b.lastServedAt || 0)) || (rand() - 0.5))) {
                    const finished = reshuffleOptions(c.item, p.term, terms, rand, level);
                    if (finished) { hit = { slot, entry: c, finished }; break; }
                }
                if (hit) break;
            }
            if (!hit) { dropped.push({ lexiconId: p.term.id, type: p.slot }); continue; }
            used.add(`${p.term.id}|${hit.slot}`);
            served.push(hit.entry);
            if (p.banked && hit.slot === p.slot) fromBank++;
            items.push({ ...hit.finished, id: `ai-${p.term.id}-${hit.slot.replace(':', '-')}-${hit.entry.id}`, lexiconId: p.term.id });
        }
        bank.markServed(served);
        const ready = metaReady(level, terms, lists, slotsOf);
        return {
            items,
            meta: {
                setId, level, promptVersion: PROMPT_VERSION, types: [...new Set(items.map((i) => i.type))],
                requestedTerms: terms.length, bankHits: fromBank, newItems,
                aiCalls: stats.aiCalls, growthScheduled: 0,
                dropped, missingTerms: [...new Set(plan.map((p) => p.term.id))].filter((id) => !items.some((i) => i.lexiconId === id)),
                timedOut: stats.timedOut, pendingCalls, budgetMs: budget, elapsedMs: now() - started,
                ready, allReady: terms.every((t) => ready[t.id].ready), topUpQueued: gapTerms.length,
                mode: 'warmup',
                warmup: { size, requested: plan.length, returned: items.length, fromBank, generated: items.length - fromBank, queuedTerms: gapTerms.length },
            },
            stats, growPlan: [], grow: async () => ({ added: 0, aiCalls: 0 }),
        };
    }

    async function generateInner({ setId, level, terms, types, budgetMs }) {
        const started = now();
        // Answer after `budgetMs` at the latest (default ~9 s) with everything validated by then; AI calls still running
        // keep going and fill the bank, so a second request is served from it.
        const budget = Math.min(limits.deadlineMs, Math.max(limits.minBudgetMs ?? 1500, budgetMs || limits.budgetMs || limits.deadlineMs));
        const fgDeadlineAt = started + budget;
        const jobDeadlineAt = started + Math.max(limits.jobDeadlineMs ?? limits.deadlineMs, budget);
        const stats = { aiCalls: 0, aiErrors: 0, timedOut: false };
        const lists = new Map();
        const slotsOf = new Map();
        for (const term of terms) {
            lists.set(term.id, await bank.entries(termKeyOf(term), level));
            slotsOf.set(term.id, wantedSlots(term, types));
        }
        // 1. foreground: only terms that are NOT sufficiently banked wait for the AI (their missing slots, nothing already in flight).
        //    Terms with most task types banked are answered at once; their gaps are topped up in the background.
        const jobs = [];
        const waitFor = [];
        const topUp = [];
        let bankHits = 0;
        for (const term of terms) {
            const st = termState(level, term, lists.get(term.id), slotsOf.get(term.id), terms);
            if (st.sufficient) {
                bankHits++;
                if (st.missing.length) topUp.push(term);
                continue;
            }
            const todo = st.open.filter((sl) => { const f = inflight.get(flightKey(level, term, sl)); if (f) waitFor.push(f); return !f; });
            if (todo.length) jobs.push({ term, slots: new Set(todo), avoid: [] });
        }
        let newItems = 0;
        let pendingCalls = 0;
        if (jobs.length || waitFor.length) {
            const run = jobs.length ? fill({ level, jobs, setTerms: terms, fgDeadlineAt, jobDeadlineAt, stats }) : { fg: Promise.resolve(), all: Promise.resolve(), counters: { newItems: 0, open: 0 } };
            let timer;
            const onTime = new Promise((resolve) => { timer = setTimeout(() => resolve('budget'), Math.max(1, fgDeadlineAt - now())); });
            const outcome = await Promise.race([Promise.all([run.fg, ...waitFor]).then(() => 'done'), onTime]);
            clearTimeout(timer);
            run.all.catch(() => {}); // never an unhandled rejection from calls that outlive the response
            if (outcome === 'budget') stats.timedOut = true;
            newItems = run.counters.newItems;
            pendingCalls = run.counters.open;
            // calls that outlive the response may have added to the bank meanwhile; serve from the current lists
            for (const term of terms) lists.set(term.id, await bank.entries(termKeyOf(term), level));
        }
        // 2. serve: least-served first, ids rewritten to this set's term ids
        const items = [];
        const served = [];
        const dropped = [];
        for (const term of terms) {
            const list = lists.get(term.id);
            for (const slot of slotsOf.get(term.id)) {
                const cands = usable(list, slot, level, term, terms);
                let entry = null;
                let finished = null;
                for (const c of cands.slice().sort((a, b) => (a.servedCount - b.servedCount) || ((a.lastServedAt || 0) - (b.lastServedAt || 0)) || (rand() - 0.5))) {
                    finished = reshuffleOptions(c.item, term, terms, rand, level);
                    if (finished) { entry = c; break; }
                }
                if (!entry) { if (!isSkipped(list, slot)) dropped.push({ lexiconId: term.id, type: slot }); continue; }
                served.push(entry);
                items.push({ ...finished, id: `ai-${term.id}-${slot.replace(':', '-')}-${entry.id}`, lexiconId: term.id });
            }
        }
        bank.markServed(served);
        // gaps in terms we answered without waiting (and terms the foreground could not finish) -> background top-up at top priority
        const gapTerms = terms.filter((t) => {
            const st = termState(level, t, lists.get(t.id), slotsOf.get(t.id), terms);
            return st.open.some((sl) => !inflight.has(flightKey(level, t, sl)));
        });
        if (gapTerms.length && onTopUp) { try { onTopUp({ level, terms: gapTerms }); } catch (e) { log(`top-up hook failed: ${e?.message || e}`); } }
        // 3. growth plan for the background: below the target, or a small chance to add one more
        const plan = [];
        for (const term of terms) {
            const list = lists.get(term.id);
            const slots = slotsOf.get(term.id).filter((sl) => {
                const n = usable(list, sl, level, term, terms).length;
                if (isSkipped(list, sl) || cool(level, term, sl) || n >= slotMax(sl)) return false;
                if (n === 0) return false; // foreground already tried and failed
                return n < slotTarget(sl) || rand() < limits.growProbability;
            });
            if (slots.length) plan.push({ term, slots: new Set(slots) });
        }
        const growPlan = shuffled(plan, rand).slice(0, limits.growTerms);
        const grow = async () => {
            const gStats = { aiCalls: 0, aiErrors: 0, timedOut: false };
            const gJobs = growPlan.map(({ term, slots }) => ({
                term, slots,
                avoid: [...slots].flatMap((sl) => usable(lists.get(term.id), sl, level, term, terms).slice(0, 4).map((e) => ({ slot: sl, text: itemText(e.item) }))),
            }));
            const run = fill({ level, jobs: gJobs, setTerms: terms, jobDeadlineAt: now() + limits.bgDeadlineMs, stats: gStats, prio: 'lo', concurrency: limits.bgCallConcurrency ?? 3 });
            await run.all;
            return { added: run.counters.newItems, aiCalls: gStats.aiCalls };
        };
        const ready = metaReady(level, terms, lists, slotsOf);
        return {
            items,
            meta: {
                setId, level, promptVersion: PROMPT_VERSION, types,
                requestedTerms: terms.length, bankHits, newItems,
                aiCalls: stats.aiCalls, growthScheduled: growPlan.length,
                dropped, missingTerms: terms.filter((t) => !items.some((i) => i.lexiconId === t.id)).map((t) => t.id),
                timedOut: stats.timedOut, pendingCalls, budgetMs: budget, elapsedMs: now() - started,
                ready, allReady: terms.every((t) => ready[t.id].ready), topUpQueued: gapTerms.length,
            },
            stats, growPlan, grow,
        };
    }

    generate.readiness = readiness;
    generate.warmupReadiness = warmupReadiness;
    generate.prewarm = prewarm;
    generate.stats = () => ({ fgActive, inflight: inflight.size });
    return generate;
}

// ---------------------------------------------------------------- express handler

export const TRACK_PATH = '/api/study/track-generate';

/**
 * Express handler. Auth: signed bridge headers (server-to-server) OR a study session
 * (req.isAuthenticated()). Mount after express-session/passport and after the route-specific
 * express.json({ verify }) that sets req.rawBody.
 */
export function createTrackGenerateHandler({
    generate, isConfigured = () => true, getSecret = () => (process.env.STUDY_BRIDGE_SECRET || '').trim(),
    limiter = createTrackLimiter(), nonces = createNonceStore(), now = () => Date.now(), path = TRACK_PATH,
    schedule = (fn) => setImmediate(fn),
} = {}) {
    return async function trackGenerate(req, res) {
        const err = (status, code, error, extra = {}) => res.status(status).json({ error, code, ...extra });
        // 1. auth
        let principal;
        if (req.headers[BRIDGE_HEADERS.signature]) {
            const v = verifyBridgeRequest(req, { secret: getSecret(), nonces, now, path });
            if (!v.ok) return err(v.status, v.code, v.error);
            principal = 'app';
        } else if (req.isAuthenticated?.() && req.user) {
            principal = `user:${req.user.id}`;
        } else {
            return err(401, 'auth_required', 'Sign in or send a signed bridge request.');
        }
        // 2. payload
        const checked = validateTrackRequest(req.body);
        if (!checked.ok) return err(400, checked.code, checked.error);
        const v = checked.value;
        const limitKey = principal === 'app' ? (v.userRef ? `app:${v.userRef}` : 'app') : principal;
        // 3a. fast path: every term already has enough banked task types -> no AI wait, no AI quota, no `busy` lock
        let fast = false;
        try {
            if (v.mode === 'warmup') fast = Boolean((await generate.warmupReadiness?.(v))?.banked);
            else fast = Boolean((await generate.readiness?.(v))?.allSufficient);
        } catch (e) { console.warn('[track-ai] readiness failed:', e?.message || e); }
        if (fast) {
            const cheapGate = limiter.checkCheap(limitKey);
            if (!cheapGate.ok) {
                res.set('Retry-After', String(cheapGate.retryAfterSec));
                return err(429, cheapGate.code, cheapGate.error, { retryAfterSec: cheapGate.retryAfterSec });
            }
            try {
                const out = await generate(v);
                return res.json({ items: out.items, meta: out.meta });
            } catch (e) {
                console.error('track-generate (bank) failed:', e?.message || e);
                return err(500, 'internal', 'Generation failed.');
            }
        }
        // 3b. otherwise gate AI work
        const gate = limiter.check(limitKey);
        if (!gate.ok) {
            res.set('Retry-After', String(gate.retryAfterSec));
            return err(429, gate.code, gate.error, { retryAfterSec: gate.retryAfterSec });
        }
        if (!isConfigured()) return err(503, 'ai_not_configured', 'AI generation is not configured on lingospark.study (CURSOR_API_KEY missing).');
        limiter.start(limitKey);
        try {
            const out = await generate(v);
            if (!out.items.length) {
                if (out.stats.timedOut) {
                    res.set('Retry-After', '5');
                    return err(504, 'ai_timeout', 'The AI did not answer in time. Try again in a few seconds; the work continues and finished terms are cached.', { retryAfterSec: 5, meta: out.meta });
                }
                if (out.stats.aiErrors && out.stats.aiErrors >= out.stats.aiCalls) return err(502, 'ai_failed', 'The AI request failed.', { meta: out.meta });
                return err(502, 'ai_invalid', 'The AI answers did not pass validation.', { meta: out.meta });
            }
            res.json({ items: out.items, meta: out.meta });
            // Grow the bank after answering (never blocks the learner; bounded by the background budget).
            if (out.growPlan?.length && !out.stats.timedOut && isConfigured() && limiter.tryStartBackground()) {
                schedule(() => out.grow()
                    .catch((e) => console.warn('[track-ai] bank growth failed:', e?.message || e))
                    .finally(() => limiter.finishBackground()));
            }
            return;
        } catch (e) {
            console.error('track-generate failed:', e?.message || e);
            return err(500, 'internal', 'Generation failed.');
        } finally {
            limiter.finish(limitKey);
        }
    };
}

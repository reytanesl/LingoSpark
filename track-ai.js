/* AI exercise generation for the LingoSpark mobile app's "Track" (POST /api/study/track-generate).
   Server-side only (imported by server.js and the tests, never served). The app server (or a signed-in
   study user) sends a word set + CEFR level; the Cursor AI runner (server.js passes runVisionJsonPrompt,
   CURSOR_API_KEY) writes the exercises; everything the model returns is validated here before it is
   sent back. There are NO template fallbacks: an exercise that cannot be validated is dropped.
   Contract (summary):
     auth     : HMAC-signed server-to-server headers (STUDY_BRIDGE_SECRET) OR a study session cookie
     cache    : per term, keyed by setId + term(id,en,pl) hash + level + types + PROMPT_VERSION
     limits   : see LIMITS */
import crypto from 'node:crypto';

export const PROMPT_VERSION = 'tg1';
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
    batchSize: 3,
    batchConcurrency: 3,
    maxAttempts: 3, // 1 try + 2 retries per batch for invalid / missing items
    perCallTimeoutMs: 70_000,
    deadlineMs: 85_000, // Render/Cloudflare cut requests at ~100 s
    userMax: 10, userWindowMs: 10 * 60_000, // generation requests that reach the AI, per user
    globalMax: 120, globalWindowMs: 60 * 60_000,
    globalConcurrent: 4,
    signatureSkewMs: 60_000,
    nonceTtlMs: 5 * 60_000,
    cacheMax: 4000, cacheTtlMs: 7 * 24 * 3600_000,
};

/** Sentence length (words) per level. */
const SENT_WORDS = { A1: [4, 7], A2: [5, 9], B1: [6, 11], B2: [7, 13], C1: [8, 15] };
const LEVEL_NOTES = {
    A1: 'A1: present simple, to be, have got, there is/are, imperatives; only the 500 most common words around the target; very short, concrete, everyday sentences.',
    A2: 'A2: past simple, present continuous, going to, can/must/should, comparatives; common everyday vocabulary around the target; short, clear sentences.',
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
    return { ok: true, value: { setId, level, terms, types, userRef } };
}

// ---------------------------------------------------------------- prompt

const slotsFor = (type) => (type === 'meaningPick' ? MEANING_DIRECTIONS.map((d) => `meaningPick:${d}`) : [type]);
const slotType = (slot) => slot.split(':')[0];

const TYPE_SPECS = {
    sentenceGap: '{"termId","type":"sentenceGap","sentence":full English sentence using the target in a form that fits the grammar,"answer":the exact words of the target as written in the sentence (NOT at the very start of the sentence),"distractors":[3 wrong options of the same word class and form that cannot fit the sentence]}',
    gapTranslate: '{"termId","type":"gapTranslate","sentence":as sentenceGap,"answer","distractors":[3],"plTranslation":natural Polish translation of the whole sentence}',
    sentenceOrder: '{"termId","type":"sentenceOrder","sentence":one sentence with the target (punctuation attached to the last word),"plTranslation":Polish translation as a hint}',
    meaningPick: '{"termId","type":"meaningPick","direction":"pl-en" or "en-pl","distractors":[3 wrong options in the ANSWER language: other terms of the set when sensible]} (the question is the term itself; the answer is its translation exactly as listed in the term)',
    collocationPick: '{"termId","type":"collocationPick","phrase":a natural 2–6 word collocation/chunk containing the target (target NOT first),"answer":the target as written in the phrase,"distractors":[3 words that do NOT collocate here]}',
    contextTrueFalse: '{"termId","type":"contextTrueFalse","passage":2–3 connected sentences using the target,"statement":one sentence about the passage that is clearly true or clearly false,"correctTrue":boolean}',
    letterScramble: '{"termId","type":"letterScramble","answer":the English term exactly as listed (single word only),"hint":short Polish or English clue that does not contain the answer}',
    translateType: '{"termId","type":"translateType","source":Polish sentence,"answer":the natural English translation containing the target,"answers":[0–3 other acceptable English translations that also contain the target]}',
    dictation: '{"termId","type":"dictation","sentence":one English sentence with the target, easy to pronounce}',
    listenPick: '{"termId","type":"listenPick","distractors":[3 English words/phrases that sound or look similar or are in the same topic; other terms of the set when sensible]} (the learner hears the term itself)',
    wordFormation: '{"termId","type":"wordFormation","stem":UPPERCASE base word,"sentence":full sentence containing the correctly formed derived word,"answer":the derived word exactly as in the sentence (differs from the stem, NOT at the very start)}',
    keyTransform: '{"termId","type":"keyTransform","sourceSentence":original sentence,"keyWord":UPPERCASE word that must be used UNCHANGED in the answer,"template":second sentence with ONE gap ___ that must be filled with 2–5 words INCLUDING the key word (key word not outside the gap),"answer":the 2–5 words,"answers":[the answer plus up to 2 other correct 2–5 word solutions with the key word]} (same meaning as the source sentence; the target term appears in the source or in the completed sentence)',
};

export function buildTrackPrompt({ level, terms, setTerms, wants, feedback = [] }) {
    const [lo, hi] = SENT_WORDS[level];
    const lines = terms.map((t) => {
        const ts = wants.get(t.id);
        const slots = [...ts].join(', ');
        return `- termId ${JSON.stringify(t.id)}: en ${JSON.stringify(t.en)} | pl ${JSON.stringify(t.pl)}${t.pos ? ` | pos ${t.pos}` : ''} → wanted: ${slots}`;
    });
    const typeNames = [...new Set([...wants.values()].flatMap((s) => [...s].map(slotType)))];
    return [
        'You write language-learning exercises for a mobile vocabulary app. Learners are Polish speakers learning English.',
        `CEFR level of the exercises: ${level}. ${LEVEL_NOTES[level]}`,
        `Sentences you write: ${lo}–${hi} words, natural, one clear meaning, no names of real people, no offensive content. Vocabulary and grammar around the target must be at or below ${level}; only the target itself may be harder.`,
        '',
        'TARGET TERMS (write exercises ONLY for these; every item needs the termId):',
        ...lines,
        '',
        `WHOLE SET (use these English/Polish words as distractors when they fit the type): ${setTerms.map((t) => `${t.en} = ${t.pl}`).join('; ')}`,
        '',
        'ITEM FORMATS (JSON objects inside "items"):',
        ...typeNames.map((t) => `- ${TYPE_SPECS[t]}`),
        '',
        'RULES:',
        '- Write one item for every wanted type of every term. For meaningPick write one item per wanted direction.',
        '- If a type makes no sense for a term (for example wordFormation for a phrasal verb, letterScramble for a multi-word phrase, a keyTransform that would be forced), do NOT force it: add {"termId","type","reason"} to "skipped" instead.',
        '- The target must really be tested: the sentence/answer must contain the target term (inflected if the grammar needs it).',
        '- Never reveal the answer in the question text, the hint, the other options or the Polish instruction. Exactly one option may be correct; distractors must be clearly wrong in context but plausible (same word class/form).',
        '- Options must be distinct. No duplicate sentences across items of one term.',
        '- Use the term\'s given English form and Polish meaning; do not change the meaning of the term.',
        ...(feedback.length ? ['', 'PREVIOUS ATTEMPT — these items were rejected, write them again and fix the problem:', ...feedback.map((f) => `- termId ${JSON.stringify(f.termId)} ${f.slot}: ${f.reason}`)] : []),
        '',
        'Return ONLY valid JSON of the form {"items":[...],"skipped":[...]}. No markdown, no commentary.',
    ].join('\n');
}

// ---------------------------------------------------------------- item validation / building

const REASON = (m) => ({ ok: false, reason: m });

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

/** The prompt shown to the learner never contains the answer. */
function promptLeaks(prompt, answer) {
    const a = norm(answer);
    return a.length >= 3 && hasWord(prompt, a);
}

/**
 * Validate one raw model item for a term and turn it into the app's shape.
 * Returns { ok:true, slot, item } or { ok:false, reason }.
 */
export function buildItem(raw, term, level) {
    if (!raw || typeof raw !== 'object') return REASON('not an object');
    const type = raw.type;
    if (!ALL_TYPES.includes(type)) return REASON('unknown type');
    const [lo, hi] = SENT_WORDS[level];
    const rng = rngFrom(`${term.id}|${type}|${raw.direction || ''}|${norm(raw.sentence || raw.phrase || raw.stem || '')}`);
    const base = { type, lexiconId: term.id, skill: SKILL[type] };
    const tag = (slot, item) => ({ ok: true, slot, item: { id: `ai-${term.id}-${slot.replace(':', '-')}`, ...base, ...item } });
    const sentenceOk = (s, label = 'sentence') => {
        if (!isStr(s, 6, 220)) return `${label} missing or too long`;
        if (countGaps(s)) return `${label} must not contain a gap`;
        const n = wordCount(s);
        if (n < 3 || n > hi + 2) return `${label} has ${n} words; ${level} sentences should be at most ${hi} words`;
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
            const options = buildOptions(raw.answer, raw.distractors, rng);
            if (!options) return REASON('needs 3 distinct distractors');
            const oe = checkOptions(options, raw.answer);
            if (oe) return REASON(oe);
            const prompt = type === 'gapTranslate' ? 'Fill the gap. Use the Polish translation to help.' : 'Choose the word that fits the gap.';
            const item = { prompt, template, answer: clean(raw.answer), options };
            if (type === 'gapTranslate') {
                if (!isStr(raw.plTranslation, 4, 260)) return REASON('plTranslation missing');
                item.plTranslation = clean(raw.plTranslation);
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
            if (isStr(raw.plTranslation, 2, 260)) item.plTranslation = clean(raw.plTranslation);
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
                prompt: direction === 'pl-en' ? 'What is the English word?' : 'What does it mean in Polish?',
                direction, question, answer, options, correctIndex: options.findIndex((o) => norm(o) === norm(answer)),
            });
        }
        case 'collocationPick': {
            if (!isStr(raw.phrase, 5, 80)) return REASON('phrase missing or too long');
            const n = wordCount(raw.phrase);
            if (n < 2 || n > 7) return REASON('phrase must have 2–6 words');
            if (!isStr(raw.answer, 1, 60) || !findTermForm(raw.answer, term.en)) return REASON('answer is not a form of the target term');
            const template = makeTemplate(raw.phrase, raw.answer);
            if (!template) return REASON('answer not inside the phrase (or phrase starts with it)');
            if (hasWord(template.replace(GAP, ' '), raw.answer)) return REASON('answer also appears outside the gap (leak)');
            const options = buildOptions(raw.answer, raw.distractors, rng);
            if (!options) return REASON('needs 3 distinct distractors');
            const oe = checkOptions(options, raw.answer);
            if (oe) return REASON(oe);
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
            if (!isStr(raw.hint, 2, 80)) return REASON('hint missing');
            if (hasWord(raw.hint, w)) return REASON('hint reveals the answer');
            const chars = w.split('');
            let letters = shuffled(chars, rng);
            for (let i = 0; i < 6 && letters.join('') === w; i++) letters = shuffled(chars, rng);
            if (letters.join('') === w) return REASON('cannot scramble term');
            return tag('letterScramble', { prompt: 'Unscramble the word.', hint: clean(raw.hint), letters, answer: clean(term.en) });
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
    if (item.answer && promptLeaks(item.prompt, item.answer)) return 'answer appears in the prompt';
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

/** Optional Postgres persistence (table created lazily). Every failure is swallowed: cache only. */
export function createPgCacheStore({ getPool, ttlMs = LIMITS.cacheTtlMs } = {}) {
    let ready = null;
    const ensure = () => (ready ||= getPool().query(
        'CREATE TABLE IF NOT EXISTS track_ai_cache (key TEXT PRIMARY KEY, value JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    ).catch((e) => { ready = null; throw e; }));
    return {
        async get(key) {
            try {
                await ensure();
                const r = await getPool().query('SELECT value FROM track_ai_cache WHERE key = $1 AND created_at > NOW() - ($2 || \' milliseconds\')::interval', [key, String(ttlMs)]);
                return r.rows[0]?.value;
            } catch (e) { console.warn('[track-ai] pg cache get failed:', e.message); return undefined; }
        },
        async set(key, value) {
            try {
                await ensure();
                await getPool().query('INSERT INTO track_ai_cache (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, created_at = NOW()', [key, JSON.stringify(value)]);
            } catch (e) { console.warn('[track-ai] pg cache set failed:', e.message); }
        },
    };
}

/** Sliding-window per-key + global limiter, one concurrent job per key, bounded global concurrency. */
export function createTrackLimiter({ now = () => Date.now(), limits = LIMITS } = {}) {
    const hits = new Map();
    const busy = new Set();
    let globalHits = [];
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
        start(key) { const t = now(); busy.add(key); running++; globalHits.push(t); hits.set(key, [...(hits.get(key) || []), t]); },
        finish(key) { busy.delete(key); running = Math.max(0, running - 1); },
        stats() { return { running, global: globalHits.length }; },
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
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

const termCacheKey = ({ setId, level, types, term }) =>
    `${PROMPT_VERSION}|${setId}|${level}|${types.join(',')}|${term.id}|${hashTerm(term)}`;

/**
 * createTrackGenerator({ runPrompt, cache, store }) -> generate(request) -> { items, meta }.
 * runPrompt(prompt, label) must resolve to parsed JSON ({items:[],skipped:[]}).
 */
export function createTrackGenerator({ runPrompt, cache = createLruCache(), store = null, limits = LIMITS, now = () => Date.now(), log = () => {} } = {}) {
    async function readCache(key) {
        const hit = cache.get(key);
        if (hit) return hit;
        if (store) {
            const v = await store.get(key);
            if (v && Array.isArray(v.items)) { cache.set(key, v); return v; }
        }
        return undefined;
    }
    async function writeCache(key, value) {
        cache.set(key, value);
        if (store) await store.set(key, value);
    }

    async function runBatch({ level, batch, setTerms, types, deadlineAt, stats }) {
        const found = new Map(batch.map((t) => [t.id, new Map()])); // termId -> slot -> item
        const wants = new Map(batch.map((t) => {
            const slots = new Set();
            for (const ty of types) {
                if (ty === 'letterScramble' && !/^[a-z]{3,14}$/.test(norm(t.en))) continue; // impossible by definition, not a template: no scramble of phrases
                for (const s of slotsFor(ty)) slots.add(s);
            }
            return [t.id, slots];
        }));
        const skipped = new Set(); // `${termId}|${slot}`
        let feedback = [];
        const dropped = [];
        for (let attempt = 0; attempt < limits.maxAttempts; attempt++) {
            const need = new Map();
            for (const t of batch) {
                const s = new Set([...wants.get(t.id)].filter((x) => !found.get(t.id).has(x) && !skipped.has(`${t.id}|${x}`)));
                if (s.size) need.set(t.id, s);
            }
            if (!need.size) break;
            const remaining = deadlineAt - now();
            if (remaining < 2000) { stats.timedOut = true; break; }
            const prompt = buildTrackPrompt({ level, terms: batch.filter((t) => need.has(t.id)), setTerms, wants: need, feedback });
            let raw;
            try {
                stats.aiCalls++;
                raw = await withTimeout(runPrompt(prompt, `track-${level}-b${batch.length}${attempt ? `-r${attempt}` : ''}`), Math.min(limits.perCallTimeoutMs, remaining), 'AI call');
            } catch (e) {
                if (e instanceof TimeoutError) stats.timedOut = true; else stats.aiErrors++;
                log(`track batch attempt ${attempt} failed: ${e.message}`);
                feedback = [];
                continue;
            }
            feedback = [];
            const items = Array.isArray(raw?.items) ? raw.items : [];
            for (const sk of Array.isArray(raw?.skipped) ? raw.skipped : []) {
                if (sk && need.has(String(sk.termId)) && ALL_TYPES.includes(sk.type)) {
                    if (sk.type === 'meaningPick') slotsFor('meaningPick').forEach((s) => skipped.add(`${sk.termId}|${s}`));
                    else skipped.add(`${sk.termId}|${sk.type}`);
                }
            }
            for (const r of items) {
                const termId = String(r?.termId ?? '');
                const term = batch.find((t) => t.id === termId);
                if (!term || !need.has(termId)) continue;
                const built = buildItem(r, term, level);
                const slot = built.slot || (r?.type === 'meaningPick' ? `meaningPick:${r.direction}` : r?.type);
                if (!built.ok) { feedback.push({ termId, slot, reason: built.reason }); continue; }
                if (!need.get(termId).has(built.slot)) continue;
                const fc = finalCheck(built.item);
                if (fc) { feedback.push({ termId, slot, reason: fc }); continue; }
                if (!found.get(termId).has(built.slot)) found.get(termId).set(built.slot, built.item);
                // reject duplicate sentences inside one term
            }
        }
        for (const t of batch) {
            for (const s of wants.get(t.id)) {
                if (!found.get(t.id).has(s) && !skipped.has(`${t.id}|${s}`)) dropped.push({ lexiconId: t.id, slot: s, reason: 'failed validation or not returned' });
            }
        }
        return { found, dropped };
    }

    return async function generate({ setId, level, terms, types }) {
        const started = now();
        const deadlineAt = started + limits.deadlineMs;
        const stats = { aiCalls: 0, aiErrors: 0, timedOut: false, cachedTerms: 0 };
        const perTerm = new Map(); // term.id -> items[]
        const pending = [];
        for (const term of terms) {
            const key = termCacheKey({ setId, level, types, term });
            const hit = await readCache(key);
            if (hit) { perTerm.set(term.id, hit.items); stats.cachedTerms++; } else pending.push({ term, key });
        }
        const dropped = [];
        const batches = [];
        for (let i = 0; i < pending.length; i += limits.batchSize) batches.push(pending.slice(i, i + limits.batchSize));
        let next = 0;
        const worker = async () => {
            while (next < batches.length) {
                const b = batches[next++];
                const { found, dropped: d } = await runBatch({ level, batch: b.map((x) => x.term), setTerms: terms, types, deadlineAt, stats });
                dropped.push(...d);
                for (const { term, key } of b) {
                    const slotMap = found.get(term.id);
                    const items = [...slotMap.values()];
                    perTerm.set(term.id, items);
                    if (items.length) await writeCache(key, { items });
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(limits.batchConcurrency, batches.length) }, worker));
        const items = [];
        const order = (it) => ALL_TYPES.indexOf(it.type) * 10 + (it.direction === 'en-pl' ? 1 : 0);
        for (const term of terms) items.push(...(perTerm.get(term.id) || []).slice().sort((a, b) => order(a) - order(b)));
        const missingTerms = terms.filter((t) => !(perTerm.get(t.id) || []).length).map((t) => t.id);
        return {
            items,
            meta: {
                setId, level, promptVersion: PROMPT_VERSION, types,
                requestedTerms: terms.length, cachedTerms: stats.cachedTerms, aiCalls: stats.aiCalls,
                dropped: dropped.map((d) => ({ lexiconId: d.lexiconId, type: d.slot })),
                missingTerms, timedOut: stats.timedOut, elapsedMs: now() - started,
            },
            stats,
        };
    };
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
        // 3. serve from cache when complete, otherwise gate AI work
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
                if (out.stats.timedOut) return err(504, 'ai_timeout', 'The AI did not answer in time. Try again; finished terms are cached.', { meta: out.meta });
                if (out.stats.aiErrors && out.stats.aiErrors >= out.stats.aiCalls) return err(502, 'ai_failed', 'The AI request failed.', { meta: out.meta });
                return err(502, 'ai_invalid', 'The AI answers did not pass validation.', { meta: out.meta });
            }
            return res.json({ items: out.items, meta: out.meta });
        } catch (e) {
            console.error('track-generate failed:', e?.message || e);
            return err(500, 'internal', 'Generation failed.');
        } finally {
            limiter.finish(limitKey);
        }
    };
}

/**
 * Stamp Rush AI cloze prompts — meaningful unique sentences + word-formation realise cards.
 * Pure helpers; server.js runs the model via runVisionJsonPrompt.
 */

export function buildStampClozePrompt({ box, variantCount = 2, level = 'intermediate' } = {}) {
    const terms = (box || []).map((b, i) => `${i + 1}. ${b.term} — ${b.definition}`).join('\n');
    const k = Math.max(1, Math.min(8, Number(variantCount) || 2));
    const levelHint = level === 'beginner' || level === 'easy'
        ? 'A2–B1 school English'
        : level === 'advanced'
            ? 'B2–C1 school English'
            : 'B1–B2 school English';
    return `You write cloze cards for Stamp Rush, a classroom vocabulary race (${levelHint}).

VOCAB BOX (exactly these ${box?.length || 0} terms — use each one):
${terms}

For EACH term write exactly ${k} UNIQUE variants. Every sentence must be different (no recycled frames).

Each variant has two modes:
1) recognise — one natural English sentence (10–18 words) with exactly one blank "___" where the BASE TERM fits as written. Context should make the meaning clear from the definition without quoting the definition. Answer = the base term.
2) realise — a DIFFERENT natural sentence (10–18 words) with exactly one blank "___" that needs a CHANGED FORM of the base term (word formation / morphology), like exam Use of English: noun↔adjective, verb→noun, adverb, plural, -ing/-ed participle, comparative, etc. Cue = base term in CAPS. Answer = the changed form only (one word preferred; hyphenated OK). Answer must NOT equal the base term ignoring case. Never use the base form in the blank.

Rules:
- Exactly one "___" per sentence.
- No proper-name tricks; no meta talk about stamps/postcards/vocabulary.
- Sentences must be meaningful, grammatical, and unique across the whole reply.
- Prefer common, teachable word families. If a rare term has no natural family, use a clear inflection (plural, 3rd person -s, -ing, -ed) that still changes the spelling.

Return ONLY valid JSON:
{"cards":[{"term":"<exact term from list>","variants":[{"recognise":{"sentence":"... ___ ...","answer":"<base term>"},"realise":{"sentence":"... ___ ...","cue":"<BASE TERM CAPS>","answer":"<changed form>"}}]}]}`;
}

function oneGap(s) {
    return (String(s || '').match(/_{3,}/g) || []).length === 1;
}

function cleanSentence(s) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .replace(/_{4,}/g, '___')
        .trim()
        .slice(0, 220);
}

function cleanAnswer(s) {
    return String(s || '').replace(/<[^>]*>/g, '').trim().slice(0, 80);
}

function sameWord(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/* ---------- fallback word formation (no AI): real English forms + sentences that fit them ---------- */
const ADJ_Y = new Set(['happy', 'easy', 'busy', 'angry', 'funny', 'lucky', 'heavy', 'tidy', 'lazy', 'noisy', 'sunny', 'rainy', 'windy', 'cloudy', 'dirty', 'hungry', 'healthy', 'friendly', 'pretty', 'ugly', 'tiny', 'crazy', 'sleepy', 'thirsty', 'ready', 'empty', 'shy', 'messy', 'silly', 'lonely', 'tasty', 'wealthy', 'sticky', 'scary']);
const ADJ_LY = new Set(['quick', 'slow', 'quiet', 'loud', 'kind', 'polite', 'rude', 'brave', 'calm', 'clear', 'strong', 'weak', 'bright', 'soft', 'safe', 'warm', 'cold', 'sad', 'glad', 'proud', 'honest', 'patient', 'quiet', 'polite', 'serious', 'simple', 'gentle', 'nervous', 'rapid', 'sudden', 'usual', 'final', 'real', 'quick', 'careful', 'careless', 'beautiful', 'dangerous', 'famous', 'polite', 'perfect', 'certain', 'recent', 'correct', 'exact', 'main', 'fair', 'free', 'open', 'secret', 'silent', 'smooth', 'sweet', 'tight', 'violent', 'wise', 'eager', 'equal', 'formal', 'normal', 'natural', 'physical', 'basic', 'tragic', 'dramatic']);
const VERBS = new Set(['decide', 'prepare', 'arrive', 'depart', 'explain', 'describe', 'improve', 'choose', 'travel', 'visit', 'open', 'close', 'remember', 'forget', 'begin', 'finish', 'listen', 'answer', 'help', 'learn', 'teach', 'read', 'write', 'speak', 'talk', 'walk', 'run', 'swim', 'play', 'study', 'try', 'cry', 'carry', 'worry', 'hurry', 'stop', 'plan', 'shop', 'sit', 'get', 'cook', 'clean', 'wash', 'watch', 'catch', 'fix', 'mix', 'pass', 'relax', 'prevent', 'pretend', 'present', 'protect', 'collect', 'invent', 'discover', 'explore', 'imagine', 'practise', 'practice', 'organise', 'organize', 'complain', 'agree', 'argue', 'apologise', 'apologize', 'borrow', 'lend', 'deliver', 'post', 'send', 'receive', 'check', 'count', 'jump', 'climb', 'dance', 'sing', 'build', 'grow', 'paint', 'draw', 'fly', 'drive', 'ride', 'save', 'spend', 'pay', 'order', 'book', 'pack', 'enjoy', 'hate', 'like', 'love', 'need', 'want', 'wait', 'work', 'move', 'change', 'compare', 'create', 'develop', 'discuss', 'include', 'increase', 'reduce', 'repeat', 'return', 'solve', 'support', 'suggest']);
const UNCOUNTABLE = new Set(['luggage', 'baggage', 'information', 'advice', 'homework', 'furniture', 'news', 'equipment', 'knowledge', 'money', 'music', 'traffic', 'weather', 'rice', 'bread', 'water', 'milk', 'research', 'evidence', 'progress', 'software', 'jewellery', 'jewelry', 'accommodation', 'rubbish', 'garbage', 'grammar', 'vocabulary', 'health', 'happiness', 'fun']);
const DOUBLE_FINAL = new Set(['begin', 'forget', 'prefer', 'refer', 'occur', 'admit', 'permit', 'regret', 'upset', 'control', 'travel', 'commit', 'submit', 'equip']);
const F_PLURAL_KEEP = new Set(['roof', 'chief', 'belief', 'proof', 'chef', 'cliff', 'giraffe', 'safe', 'cafe', 'café']);
const IRREGULAR_PLURAL = { child: 'children', person: 'people', man: 'men', woman: 'women', foot: 'feet', tooth: 'teeth', mouse: 'mice', goose: 'geese' };

const isVowel = (c) => /[aeiou]/.test(c);
const consonantY = (w) => /[^aeiou]y$/.test(w);

export function pluralOf(word) {
    const w = String(word).toLowerCase();
    if (IRREGULAR_PLURAL[w]) return IRREGULAR_PLURAL[w];
    if (consonantY(w)) return `${w.slice(0, -1)}ies`;
    if (/(s|x|z|ch|sh)$/.test(w)) return `${w}es`;
    if (!F_PLURAL_KEEP.has(w) && /[^f]fe$/.test(w)) return `${w.slice(0, -2)}ves`;
    if (!F_PLURAL_KEEP.has(w) && /[^f]f$/.test(w)) return `${w.slice(0, -1)}ves`;
    if (/[^aeiou]o$/.test(w) && ['potato', 'tomato', 'hero', 'echo'].includes(w)) return `${w}es`;
    return `${w}s`;
}

export function ingOf(verb) {
    const w = String(verb).toLowerCase();
    if (/ie$/.test(w)) return `${w.slice(0, -2)}ying`;
    if (/[^aeiouy]e$/.test(w) && !/(ee|ye|oe)$/.test(w)) return `${w.slice(0, -1)}ing`;
    const groups = (w.match(/[aeiou]+/g) || []).length;
    const cvc = w.length >= 3 && !isVowel(w.at(-1)) && !/[wxy]$/.test(w) && isVowel(w.at(-2)) && !isVowel(w.at(-3));
    if (cvc && (groups === 1 || DOUBLE_FINAL.has(w))) return `${w}${w.at(-1)}ing`;
    return `${w}ing`;
}

export function adverbOf(adj) {
    const w = String(adj).toLowerCase();
    if (w === 'true') return 'truly';
    if (w === 'full') return 'fully';
    if (consonantY(w)) return `${w.slice(0, -1)}ily`;
    if (/[^aeiou]le$/.test(w)) return `${w.slice(0, -1)}y`;
    if (/ic$/.test(w)) return `${w}ally`;
    if (/ll$/.test(w)) return `${w}y`;
    return `${w}ly`;
}

/** Guess the word class of a base term from the word itself and its definition. */
export function guessWordClass(term, definition = '') {
    const w = String(term).toLowerCase().trim();
    const d = String(definition || '').toLowerCase().trim();
    if (ADJ_Y.has(w)) return 'adj-y';
    if (/^to\s/.test(d) || VERBS.has(w) || /(ate|ise|ize|ify)$/.test(w)) return 'verb';
    if (ADJ_LY.has(w) || /(ful|ous|ive|able|ible|less|al|ic|ent|ant)$/.test(w) || /^(very\s|feeling\s|describes?\s)/.test(d)) return 'adj';
    return 'noun';
}

/** Heuristic realise fallback when AI is missing or invalid: a real changed form + a sentence that fits that form. */
export function fallbackRealise(term, definition, n = 0) {
    const t = String(term || '').trim();
    const lower = t.toLowerCase();
    const words = lower.split(/\s+/);
    const head = words.at(-1);
    const prefix = words.slice(0, -1).join(' ');
    const join = (w) => (prefix ? `${prefix} ${w}` : w);
    const cls = words.length > 1 ? 'noun' : guessWordClass(lower, definition);
    let answer;
    let sentence;
    if (cls === 'adj-y') {
        answer = `${lower.slice(0, -1)}iness`;
        sentence = [`Her ___ was obvious to everyone in the room.`, `We talked about the ___ of the people in the story.`, `You could see the ___ on his face.`][n % 3];
    } else if (cls === 'adj') {
        answer = adverbOf(lower);
        sentence = [`She answered the question ___.`, `He closed the door very ___.`, `They finished the task ___.`][n % 3];
    } else if (cls === 'verb') {
        answer = ingOf(lower);
        sentence = [`Right now the whole class is ___.`, `I am ___ at the moment, so please wait.`, `They were still ___ when the bell rang.`][n % 3];
    } else if (UNCOUNTABLE.has(head)) {
        // Uncountable nouns have no plural: use the real compound adjective "<noun>-free".
        answer = join(`${head}-free`);
        sentence = [`At last we had a ___ weekend.`, `The teacher promised us a ___ day.`, `It was a completely ___ trip.`][n % 3];
    } else {
        answer = join(pluralOf(head));
        sentence = [`There were a lot of ___ in the picture.`, `We counted five ___ in the photo.`, `Two ___ were mentioned in the text.`][n % 3];
    }
    return {
        sentence: cleanSentence(sentence),
        cue: t.toUpperCase(),
        answer: cleanAnswer(answer),
        lead: 'Word formation',
        body: cleanSentence(sentence),
        hint: definition || '',
        prompt: cleanSentence(sentence),
    };
}

/** Is `answer` a genuine changed form of `term` (shares its stem, not identical)? */
export function isFormOf(answer, term) {
    const a = String(answer || '').trim().toLowerCase();
    const b = String(term || '').trim().toLowerCase();
    if (!a || !b || a === b) return false;
    const bw = b.split(/\s+/);
    const aw = a.split(/\s+/);
    if (bw.length > 1) return aw.length === bw.length && aw.slice(0, -1).join(' ') === bw.slice(0, -1).join(' ') && isFormOf(aw.at(-1), bw.at(-1));
    if (IRREGULAR_PLURAL[b] === a) return true;
    if (/ie$/.test(b) && a.startsWith(`${b.slice(0, -2)}y`)) return true;
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    const need = Math.max(2, Math.min(4, b.length - 2));
    return p >= need;
}

export function fallbackRecognise(term, definition, n = 0) {
    const frames = [
        `In today's lesson we focused on ___, which means: ${String(definition || '').slice(0, 80)}.`,
        `Can you explain ___ in your own words?`,
        `The gap in this postcard is ___.`,
        `My classmate used ___ in a clear example.`,
    ];
    const sentence = cleanSentence(frames[n % frames.length].replace('___', '___'));
    // Prefer a frame that already has the blank as the term slot without stuffing the definition into every card.
    const body = [
        `After reading the note, I understood ____ better.`,
        `Please choose the stamp that means: ${String(definition || 'this idea').slice(0, 90)}. Wait — stamp ____.`,
        `The missing word on this card is ____.`,
        `We practised ____ together before the break.`,
    ][n % 4].replace(/____/g, '___');
    return {
        sentence: cleanSentence(body),
        answer: String(term || '').trim(),
        lead: 'Postcard',
        body: cleanSentence(body),
        hint: definition || '',
        prompt: cleanSentence(body),
    };
}

/**
 * Parse AI JSON into { [termLower]: variants[] } where each variant has recognise + realise payloads.
 */
export function parseStampClozeReply(reply, box) {
    const byTerm = new Map();
    for (const entry of box || []) {
        byTerm.set(String(entry.term).toLowerCase(), []);
    }
    const cards = Array.isArray(reply?.cards) ? reply.cards : [];
    for (const card of cards) {
        const termKey = String(card?.term || '').trim().toLowerCase();
        if (!byTerm.has(termKey)) continue;
        const entry = box.find((b) => b.term.toLowerCase() === termKey);
        const variants = Array.isArray(card.variants) ? card.variants : [];
        for (let i = 0; i < variants.length; i++) {
            const v = variants[i] || {};
            const recRaw = v.recognise || {};
            const realRaw = v.realise || {};
            let recognise = {
                sentence: cleanSentence(recRaw.sentence),
                answer: cleanAnswer(recRaw.answer || entry.term),
            };
            let realise = {
                sentence: cleanSentence(realRaw.sentence),
                cue: cleanAnswer(realRaw.cue || entry.term).toUpperCase(),
                answer: cleanAnswer(realRaw.answer),
            };
            if (!oneGap(recognise.sentence) || !sameWord(recognise.answer, entry.term)) {
                recognise = fallbackRecognise(entry.term, entry.definition, i);
            } else {
                recognise.answer = entry.term;
            }
            if (!oneGap(realise.sentence) || !realise.answer || !isFormOf(realise.answer, entry.term)) {
                realise = fallbackRealise(entry.term, entry.definition, i);
            } else {
                realise.cue = entry.term.toUpperCase();
            }
            byTerm.get(termKey).push({
                recognise: {
                    ...recognise,
                    lead: 'Postcard',
                    body: recognise.sentence,
                    hint: entry.definition,
                    prompt: recognise.sentence,
                },
                realise: {
                    ...realise,
                    lead: 'Word formation',
                    body: realise.sentence,
                    hint: entry.definition,
                    prompt: realise.sentence,
                },
            });
        }
    }
    // Fill missing terms / empty variant lists.
    for (const entry of box || []) {
        const key = entry.term.toLowerCase();
        const list = byTerm.get(key) || [];
        if (!list.length) {
            list.push({
                recognise: {
                    ...fallbackRecognise(entry.term, entry.definition, 0),
                    lead: 'Postcard',
                    body: fallbackRecognise(entry.term, entry.definition, 0).sentence,
                    hint: entry.definition,
                    prompt: fallbackRecognise(entry.term, entry.definition, 0).sentence,
                },
                realise: {
                    ...fallbackRealise(entry.term, entry.definition, 0),
                    lead: 'Word formation',
                    body: fallbackRealise(entry.term, entry.definition, 0).sentence,
                    hint: entry.definition,
                    prompt: fallbackRealise(entry.term, entry.definition, 0).sentence,
                },
            });
        }
        byTerm.set(key, list);
    }
    return byTerm;
}

/** Build a cloze pack Map → plain object for match storage. */
export function stampClozePackFromReply(reply, box, variantCount = 2) {
    const map = parseStampClozeReply(reply, box);
    const out = {};
    for (const entry of box || []) {
        const key = entry.term.toLowerCase();
        let list = map.get(key) || [];
        while (list.length < variantCount) {
            const n = list.length;
            list = list.concat([{
                recognise: {
                    ...fallbackRecognise(entry.term, entry.definition, n),
                    lead: 'Postcard',
                    body: fallbackRecognise(entry.term, entry.definition, n).sentence,
                    hint: entry.definition,
                    prompt: fallbackRecognise(entry.term, entry.definition, n).sentence,
                },
                realise: {
                    ...fallbackRealise(entry.term, entry.definition, n),
                    lead: 'Word formation',
                    body: fallbackRealise(entry.term, entry.definition, n).sentence,
                    hint: entry.definition,
                    prompt: fallbackRealise(entry.term, entry.definition, n).sentence,
                },
            }]);
        }
        out[key] = list.slice(0, Math.max(variantCount, list.length));
    }
    return out;
}

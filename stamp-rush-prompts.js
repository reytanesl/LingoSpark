/**
 * Stamp Rush AI cloze prompts — meaningful unique sentences + word-formation realise cards.
 * Pure helpers; server.js runs the model via runVisionJsonPrompt.
 */

export function buildStampClozePrompt({ box, variantCount = 2, level = 'intermediate', topic = '' } = {}) {
    const terms = (box || []).map((b, i) => `${i + 1}. ${b.term} — ${b.definition}`).join('\n');
    const k = Math.max(1, Math.min(8, Number(variantCount) || 2));
    const levelHint = level === 'beginner' || level === 'easy'
        ? 'A2–B1 school English'
        : level === 'advanced'
            ? 'B2–C1 school English'
            : 'B1–B2 school English';
    const topicLine = String(topic || '').trim()
        ? `Lesson topic / theme: ${String(topic).trim()}. Every sentence must feel natural for this topic and for the word's definition.`
        : 'Lesson topic: use the shared theme of the word list (infer it from the definitions). Every sentence must fit that theme.';
    return `You write cloze cards for Stamp Rush, a classroom vocabulary race (${levelHint}).

${topicLine}

VOCAB BOX (exactly these ${box?.length || 0} terms — use each one; keep the meaning in the definition):
${terms}

For EACH term write exactly ${k} UNIQUE variants. Every sentence must be different (no recycled frames).

Each variant has two modes:
1) recognise — one natural English sentence (10–20 words) with exactly one blank "___" where the BASE TERM fits as written. The surrounding words must make that meaning unmistakable from the definition (do NOT quote or paste the definition). Answer = the base term exactly as listed.
2) realise — a DIFFERENT natural sentence (10–20 words) with exactly one blank "___" that needs a CHANGED FORM of the base term (exam-style word formation: noun↔adjective, verb→noun/-ing, adverb, plural, comparative, etc.). Cue = base term in CAPS. Answer = the changed form only (one word preferred; hyphenated OK). Answer must NOT equal the base term (ignore case). Never put the base form in the blank.

Word-formation quality (prime importance):
- The gap answer must be the ONE natural form that completes the sentence; another form of the same word must NOT also fit.
- The sentence situation must match the word's meaning and the lesson topic (travel words → travel scenes; feelings → people/feelings; school words → school life, etc.).
- Prefer common, teachable word families. If a rare term has no natural family, use a clear inflection (plural, 3rd-person -s, -ing, -ed) that still changes the spelling AND fits the sentence meaning.

Rules:
- Exactly one "___" per sentence; grammatical; no meta talk about stamps, postcards, vocabulary, lessons, gaps or blanks.
- Do not invent a meaning that contradicts the given definition.
- Sentences must be meaningful and unique across the whole reply.

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
const ALREADY_PLURAL = new Set(['customs', 'goods', 'clothes', 'trousers', 'scissors', 'glasses', 'sunglasses', 'stairs', 'premises', 'thanks', 'congratulations', 'outskirts', 'surroundings', 'belongings']);
const UNCOUNTABLE = new Set(['luggage', 'baggage', 'information', 'advice', 'homework', 'furniture', 'news', 'equipment', 'knowledge', 'money', 'music', 'traffic', 'weather', 'rice', 'bread', 'water', 'milk', 'research', 'evidence', 'progress', 'software', 'jewellery', 'jewelry', 'accommodation', 'rubbish', 'garbage', 'grammar', 'vocabulary', 'health', 'happiness', 'fun']);
const DOUBLE_FINAL = new Set(['begin', 'forget', 'prefer', 'refer', 'occur', 'admit', 'permit', 'regret', 'upset', 'control', 'travel', 'commit', 'submit', 'equip']);
const F_PLURAL_KEEP = new Set(['roof', 'chief', 'belief', 'proof', 'chef', 'cliff', 'giraffe', 'safe', 'cafe', 'café']);
const IRREGULAR_PLURAL = { child: 'children', person: 'people', man: 'men', woman: 'women', foot: 'feet', tooth: 'teeth', mouse: 'mice', goose: 'geese' };

const isVowel = (c) => /[aeiou]/.test(c);
const consonantY = (w) => /[^aeiou]y$/.test(w);

export function pluralOf(word) {
    const w = String(word).toLowerCase();
    if (ALREADY_PLURAL.has(w)) return w;
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

/** Heuristic realise fallback when AI is missing or invalid: a real changed form + a sentence that fits that form AND the word's meaning. */
export function fallbackRealise(term, definition, n = 0) {
    const t = String(term || '').trim();
    const lower = t.toLowerCase();
    const words = lower.split(/\s+/);
    const head = words.at(-1);
    const prefix = words.slice(0, -1).join(' ');
    const join = (w) => (prefix ? `${prefix} ${w}` : w);
    const cls = words.length > 1 ? 'noun' : guessWordClass(lower, definition);
    const field = semanticField(definition, lower);
    let answer;
    let sentence;
    if (cls === 'adj-y') {
        answer = `${lower.slice(0, -1)}iness`;
        sentence = [
            `You could see the ___ on her face when she heard the good news.`,
            `Their ___ after the long day made everyone smile.`,
            `The story shows the ___ of people who finally felt safe again.`,
        ][n % 3];
    } else if (cls === 'adj') {
        answer = adverbOf(lower);
        sentence = [
            `She checked every detail ___ because she wanted to avoid mistakes.`,
            `He spoke ___ so the whole class could follow the instructions.`,
            `They packed the bags ___ before the early morning departure.`,
        ][n % 3];
    } else if (cls === 'verb') {
        answer = ingOf(lower);
        sentence = [
            field === 'travel'
                ? `Right now the travellers are ___ at the station gate.`
                : `Right now they are ___ carefully before the next step.`,
            `I am ___ at the moment, so please give me a second.`,
            field === 'travel'
                ? `They were still ___ when the train doors opened.`
                : `They were still ___ when the teacher walked in.`,
        ][n % 3];
    } else if (UNCOUNTABLE.has(head)) {
        answer = join(`${head}-free`);
        sentence = [
            `After a week of stress they wanted a completely ___ holiday.`,
            `She booked a quiet room for a ___ break from all that ${head}.`,
            `It was a rare ___ morning with no ${head} to worry about.`,
        ][n % 3];
    } else if (head === 'customs') {
        answer = 'customs officer';
        sentence = [
            `The ___ asked us to open our bags at the airport.`,
            `A friendly ___ checked our documents carefully.`,
            `We waited in the queue until the ___ called our names.`,
        ][n % 3];
    } else if (ALREADY_PLURAL.has(head)) {
        answer = join(`${head}-related`);
        sentence = [
            `The teacher asked for a ___ example from the reading text.`,
            `We wrote a short ___ note about the lesson topic.`,
            `His ___ comment helped us understand the idea better.`,
        ][n % 3];
    } else {
        answer = join(pluralOf(head));
        sentence = [
            field === 'travel'
                ? `There were several ___ waiting at the airport desk.`
                : `There were several ___ mentioned in yesterday's reading.`,
            field === 'travel'
                ? `We packed five ___ before the long journey began.`
                : `We listed five ___ that belonged to this word family.`,
            field === 'travel'
                ? `Two important ___ helped everyone continue the journey.`
                : `Two important ___ helped the class understand the topic.`,
        ][n % 3];
    }
    if (!isFormOf(answer, lower)) {
        answer = UNCOUNTABLE.has(head) || ALREADY_PLURAL.has(head)
            ? join(`${head}-related`)
            : join(pluralOf(head));
        sentence = field === 'travel'
            ? `The class needed a clear ___ example about the journey.`
            : `The class needed a clear ___ example about this topic.`;
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

/** Short clean definition snippet (for hints / AI context, not dumped into gaps). */
export function shortDef(definition, max = 48) {
    let d = String(definition || '')
        .replace(/^to\s+/i, '')
        .replace(/[.;:].*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!d) return '';
    if (d.length > max) d = `${d.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
    return d;
}

/** Coarse semantic field from a definition — steers fallback scenes without pasting raw fragments. */
export function semanticField(definition = '', term = '') {
    const d = `${definition} ${term}`.toLowerCase();
    if (/\b(travel|journey|trip|flight|airport|train|passport|ticket|luggage|baggage|border|customs|depart|arrive|hotel|holiday|tourist)\b/.test(d)) return 'travel';
    if (/\b(feel|feeling|emotion|happy|sad|angry|afraid|pleasure|mood)\b/.test(d)) return 'feelings';
    if (/\b(school|lesson|class|teacher|student|homework|exam|study)\b/.test(d)) return 'school';
    if (/\b(food|eat|meal|cook|kitchen|restaurant)\b/.test(d)) return 'food';
    return 'general';
}

/** Reject weak / meta / off-topic cloze sentences (AI or fallback). */
export function isStrongClozeSentence(sentence, { term = '', answer = '', formation = false } = {}) {
    const s = cleanSentence(sentence);
    if (!oneGap(s)) return false;
    const words = s.replace(/___/g, ' GAP ').split(/\s+/).filter(Boolean);
    if (words.length < 7 || words.length > 28) return false;
    if (/\b(stamp|postcard|vocabulary|vocab|gap|blank|cloze|word formation|type the|fill in|this topic|word family|lesson topic)\b/i.test(s)) return false;
    if (formation && term) {
        const re = new RegExp(`\\b${String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (re.test(s)) return false;
    }
    // Reject leftover raw definition dumps ("for reach", "for get ready").
    if (/\bfor (reach|get|leave|feel|give|make|take|lets)\b/i.test(s)) return false;
    return true;
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
    // "customs officer" counts as a form of "customs"
    if (a.startsWith(`${b} `) || a.startsWith(`${b}-`)) return true;
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    const need = Math.max(2, Math.min(4, b.length - 2));
    return p >= need;
}

export function fallbackRecognise(term, definition, n = 0) {
    const t = String(term || '').trim();
    const field = semanticField(definition, t);
    const body = field === 'travel'
        ? [
            `Before the flight she double-checked her ___ one last time.`,
            `The guide reminded everyone that ___ is essential for a safe journey.`,
            `In the travel story, the hero finally understood why ___ mattered.`,
            `At the airport desk they asked a clear question about ___.`,
            `Without a valid ___, nobody could continue the journey.`,
            `Our class notes say that ___ is a key idea when you travel.`,
        ][n % 6]
        : field === 'feelings'
            ? [
                `After the news, everyone noticed a change in her ___.`,
                `The story shows how ___ can affect a whole family.`,
                `He could not hide his ___ during the long conversation.`,
                `We talked about ___ and how people express it.`,
                `Without real ___, the ending of the story felt empty.`,
                `The poem describes ___ in a simple, honest way.`,
            ][n % 6]
            : [
                `In yesterday's reading we met the idea of ___ for the first time.`,
                `The teacher asked who could explain ___ in their own words.`,
                `A clear example of ___ appeared in the second paragraph.`,
                `Before the test we revised every detail about ___.`,
                `Without understanding ___, the next exercise was too hard.`,
                `Our notes say that ___ is closely linked to this unit.`,
            ][n % 6];
    const sentence = cleanSentence(body);
    return {
        sentence,
        answer: t,
        lead: 'Postcard',
        body: sentence,
        hint: definition || '',
        prompt: sentence,
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
            if (!oneGap(recognise.sentence)
                || !sameWord(recognise.answer, entry.term)
                || !isStrongClozeSentence(recognise.sentence, { term: entry.term, answer: entry.term, formation: false })) {
                recognise = fallbackRecognise(entry.term, entry.definition, i);
            } else {
                recognise.answer = entry.term;
            }
            if (!oneGap(realise.sentence)
                || !realise.answer
                || !isFormOf(realise.answer, entry.term)
                || !isStrongClozeSentence(realise.sentence, { term: entry.term, answer: realise.answer, formation: true })) {
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

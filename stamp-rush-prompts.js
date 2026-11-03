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

/** Heuristic realise fallback when AI is missing or invalid. */
export function fallbackRealise(term, definition, n = 0) {
    const t = String(term || '').trim();
    const lower = t.toLowerCase();
    let answer = lower;
    let sentence = '';
    if (/y$/i.test(t) && t.length > 3) {
        answer = `${lower.slice(0, -1)}ies`;
        sentence = [`Several ___ were mentioned in class.`, `We listed the ___ on the board.`, `The article discussed those ___.`][n % 3];
    } else if (/e$/i.test(t) && t.length > 3) {
        answer = `${lower}d`;
        sentence = [`They ___ the idea carefully yesterday.`, `Someone had already ___ it.`, `We ___ the plan before lunch.`][n % 3];
    } else if (/[aeiou][b-df-hj-np-tv-z]$/i.test(t) && t.length > 3) {
        answer = `${lower}${lower.slice(-1)}ing`;
        sentence = [`She is ___ about the topic now.`, `They kept ___ for hours.`, `___ can help you remember it.`][n % 3];
    } else if (t.length > 3) {
        answer = `${lower}ing`;
        sentence = [`___ this word in a sentence helps.`, `They practised ___ it aloud.`, `___ was the next step.`][n % 3];
        if (sameWord(answer, lower)) {
            answer = `${lower}s`;
            sentence = [`Many ___ appear in the text.`, `We compared two ___.`, `Those ___ matter in the exam.`][n % 3];
        }
    } else {
        answer = `${lower}s`;
        sentence = `We wrote two ___ in our notebooks.`;
    }
    if (sameWord(answer, lower)) {
        answer = `${lower}-related`;
        sentence = `The teacher asked for a ___ example.`;
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
            if (!oneGap(realise.sentence) || !realise.answer || sameWord(realise.answer, entry.term)) {
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

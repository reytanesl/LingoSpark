/* Frankenstein Builder — "Generate with AI".
   Server-side only (imported by server.js and the tests, never served). The browser sends a
   whitelisted text type, paragraph type (or "whole") and an optional topic to POST /api/frank/generate;
   the prompt is built here and targets CKE matura rozszerzona (formuła 2023+) writing requirements.
   The AI reply is validated (JSON shape, word count, cohesive linking so the order is unambiguous)
   before it reaches the player; on failure the client falls back to the static bank. */
import './frank-options.js';

const FO = globalThis.FrankOptions;

export const WHOLE_WORDS = { min: 200, max: 250 };
export const PARA_WORDS = { min: 45, max: 140 };
export const RATE_LIMIT = { max: 12, windowMs: 60 * 60 * 1000, minGapMs: 8000 };
export const MAX_TOPIC_CHARS = 120;

/** Exam forms on the 2023+ extended matura (tekst argumentacyjny / list / artykuł, 200–250 words). */
const CKE_FORMS = {
    for_against: {
        exam: true,
        form: 'rozprawka "for and against" (argumentative essay): introduce the issue, present arguments for and against, then a balanced judgement',
        register: 'formal / neutral academic register, no contractions, impersonal structures where natural',
    },
    opinion: {
        exam: true,
        form: 'rozprawka "opinion" (opinion essay): clear thesis, supporting arguments, a counter-argument with rebuttal, conclusion',
        register: 'formal / neutral academic register, no contractions; a clear personal stance is expected',
    },
    formal_letter: {
        exam: true,
        form: 'list formalny (formal letter / email) to an institution, organisation, newspaper editor or official, written to persuade or argue a case',
        register: 'formal register: "Dear Sir or Madam," or "Dear Mr/Ms + surname,"; no contractions; polite, persuasive formulas; ends with "Yours faithfully," / "Yours sincerely," and a full name',
    },
    article: {
        exam: true,
        form: 'artykuł publicystyczny (opinion article for a magazine or website) arguing a clear position',
        register: 'semi-formal publicistic register: engaging opening (question, striking fact), direct address to readers allowed, no slang, no contractions',
    },
};

/** Cohesive devices that make the position of a sentence / paragraph recognisable. */
const LINKERS = [
    'however', 'nevertheless', 'nonetheless', 'moreover', 'furthermore', 'in addition', 'additionally', 'what is more',
    'besides', 'firstly', 'first of all', 'first', 'secondly', 'second', 'thirdly', 'finally', 'lastly', 'last but not least',
    'to begin with', 'to start with', 'as a result', 'consequently', 'therefore', 'thus', 'hence', 'accordingly', 'for this reason',
    'that is why', 'this is why', 'on the one hand', 'on the other hand', 'in contrast', 'by contrast', 'conversely', 'whereas',
    'while', 'although', 'though', 'even though', 'despite', 'in spite of', 'admittedly', 'it is true that', 'granted',
    'for example', 'for instance', 'such as', 'in particular', 'particularly', 'specifically', 'in fact', 'indeed', 'above all',
    'to sum up', 'in conclusion', 'to conclude', 'all in all', 'all things considered', 'on balance', 'overall', 'in short',
    'in my view', 'in my opinion', 'in their view', 'in their opinion', 'some argue', 'some people argue', 'others argue', 'critics', 'opponents', 'supporters', 'proponents', 'from my perspective', 'personally', 'as a consequence', 'not only', 'apart from',
    'as for', 'as regards', 'regarding', 'with regard to', 'similarly', 'likewise', 'equally', 'meanwhile', 'then', 'later',
    'afterwards', 'eventually', 'at first', 'soon', 'suddenly', 'when', 'after', 'before', 'once', 'until', 'by the time',
    'also', 'too', 'yet', 'still', 'otherwise', 'instead', 'if so', 'if', 'unless', 'provided that', 'as long as',
    'i look forward', 'yours faithfully', 'yours sincerely', 'best wishes', 'take care', 'thank you',
];
const REFERENCE_START = /^(this|these|that|those|such|it|they|he|she|its|their|his|her|both|neither|another|the other|one|others|the former|the latter|the same)\b/i;

export function countWords(text) {
    return String(text || '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function hasCohesiveMarker(sentence) {
    const s = String(sentence || '').trim();
    if (REFERENCE_START.test(s)) return true;
    const low = ` ${s.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ')} `;
    return LINKERS.some((l) => low.includes(` ${l} `));
}

function pick(list, rand = Math.random) {
    return list[Math.floor(rand() * list.length) % list.length];
}

/** Whitelist the request; "any" choices are resolved here so the prompt is always concrete. */
export function validateFrankAiRequest(body, rand = Math.random) {
    const b = body && typeof body === 'object' ? body : {};
    const sel = FO.normalizeSelection({ textType: b.textType, paraType: b.paraType });
    let textType = sel.textType;
    if (textType === FO.ANY) textType = pick(FO.TEXT_TYPES, rand).id;
    const t = FO.findTextType(textType);
    let paraType = sel.textType === FO.ANY && sel.paraType !== FO.WHOLE && !String(sel.paraType).startsWith('role:') ? FO.ANY : sel.paraType;
    if (String(paraType).startsWith('role:')) {
        const role = paraType.slice(5);
        paraType = pick(t.paras.filter((p) => p.role === role), rand).id;
    } else if (paraType === FO.ANY) {
        paraType = pick(t.paras, rand).id;
    }
    if (paraType !== FO.WHOLE && !FO.findPara(textType, paraType)) {
        return { ok: false, error: 'Unknown paragraph type.' };
    }
    const topic = String(b.topic || '').replace(/[\u0000-\u001f<>{}]/g, ' ').replace(/\s+/g, ' ').trim();
    if (topic.length > MAX_TOPIC_CHARS) return { ok: false, error: `Topic is too long (max ${MAX_TOPIC_CHARS} characters).` };
    return { ok: true, value: { textType, paraType, whole: paraType === FO.WHOLE, topic } };
}

function rolePlan(textType) {
    const t = FO.findTextType(textType);
    return t.paras.map((p) => `- ${p.id} (${p.role}): ${p.label}. ${p.hint}`).join('\n');
}

export function buildFrankAiPrompt(v, { retryNote = '' } = {}) {
    const t = FO.findTextType(v.textType);
    const form = CKE_FORMS[v.textType];
    const para = v.whole ? null : FO.findPara(v.textType, v.paraType);
    const topicLine = v.topic
        ? `TOPIC requested by the student: "${v.topic}". Build the task and the text around it (keep it suitable for school).`
        : 'TOPIC: choose a fresh, realistic topic typical of extended-matura tasks (education, technology, environment, work, culture, health, travel, society, media).';
    const common = `You write model texts for Polish students preparing for the CKE matura z języka angielskiego, poziom rozszerzony (formuła 2023+), writing task (wypowiedź pisemna).
TEXT TYPE: ${t.label}. Form: ${form.form}.
${form.exam ? 'This IS a form used on the extended exam: follow the CKE task format exactly.' : 'This form is not set on the extended exam; keep the same CKE quality criteria anyway.'}
${topicLine}

CKE CRITERIA THE TEXT MUST MEET (score at the top band in every criterion):
1. Zgodność z poleceniem: the task (polecenie) has exactly TWO elements; the text addresses BOTH and develops each one fully (rozwinięcie: a clear claim + explanation/justification + a concrete example or consequence), not just mentions it.
2. Spójność i logika: clear paragraphing (introduction, body paragraphs, conclusion / opening and closing for letters), logical progression, and explicit cohesion: EVERY sentence after the first one in a paragraph must contain a linking device or a clear reference to the previous sentence (e.g. However, Moreover, As a result, For instance, This..., Such...), and EVERY paragraph after the first must open with a signposting phrase (Firstly / On the other hand / Admittedly / To sum up ...). The original order of sentences must be the only sensible one.
3. Zakres środków językowych: a wide range of B2+/C1 vocabulary (precise collocations, topic-specific lexis, no repetition) and structures (e.g. conditionals, passive, participle clauses, inversion, cleft sentences, modal perfects) — but natural and accurate.
4. Poprawność środków językowych: no language mistakes. Register: ${form.register}.

POLECENIE: write the exam-style task in POLISH, the way CKE phrases it (one or two sentences of context + "Napisz ..." + the two elements as separate bullet points). Put the two elements also in "elements" (Polish).`;
    const format = 'Every sentence is a separate string. Plain text only, no line breaks, no numbering, no markdown. Each sentence at most 35 words.';
    if (v.whole) {
        return `${common}

WRITE: the WHOLE text, ${WHOLE_WORDS.min}–${WHOLE_WORDS.max} words in total (count every word, including greeting, sign-off and title if any). 4 or 5 paragraphs. ${format}
${v.textType === 'formal_letter' ? 'Put the greeting (e.g. "Dear Sir or Madam,") as the first string of the first paragraph, and the sign-off (e.g. "Yours faithfully,") and the full name as the last two strings of the last paragraph.' : ''}
${v.textType === 'article' ? 'Give the article a short catchy "title" (not part of the paragraphs).' : ''}
Typical paragraph roles for this text type:
${rolePlan(v.textType)}
${retryNote}
Return ONLY valid JSON:
{"task":"<polecenie in Polish>","elements":["<element 1>","<element 2>"],"topic":"<short English topic>","title":"<title or empty>","paragraphs":[{"type":"<role id from the list>","sentences":["...","..."]}]}`;
    }
    return `${common}

WRITE: ONE paragraph only — the "${para.label}" of a ${t.short.toLowerCase()} answering the polecenie. ${para.hint} 4–6 sentences, ${PARA_WORDS.min}–${PARA_WORDS.max} words. ${format}
${para.id === 'opening' && /letter/.test(v.textType) ? 'Start with the greeting (e.g. "Dear Sir or Madam,") as the first string.' : ''}
${para.id === 'closing' && /letter/.test(v.textType) ? 'End with the sign-off and the full name as the last two strings.' : ''}
${retryNote}
Return ONLY valid JSON:
{"task":"<polecenie in Polish>","elements":["<element 1>","<element 2>"],"topic":"<short English topic>","paragraph":{"type":"${para.id}","sentences":["...","..."]}}`;
}

const cleanSentence = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * Check an AI reply against the schema and the CKE-derived rules. Returns
 * { ok: true, value } with a bank-shaped item, or { ok: false, error } describing what to fix.
 */
export function validateFrankAiResult(raw, v) {
    const r = raw && typeof raw === 'object' ? raw : null;
    if (!r) return { ok: false, error: 'Reply is not a JSON object.' };
    const task = cleanSentence(r.task);
    const elements = Array.isArray(r.elements) ? r.elements.map(cleanSentence).filter(Boolean) : [];
    if (task.length < 20) return { ok: false, error: 'Missing exam task (polecenie).' };
    if (elements.length !== 2) return { ok: false, error: 'The task must have exactly two elements.' };
    const topic = cleanSentence(r.topic).slice(0, 120) || v.topic || 'AI-generated topic';
    const rawParas = v.whole ? r.paragraphs : (r.paragraph ? [r.paragraph] : null);
    if (!Array.isArray(rawParas) || !rawParas.length) return { ok: false, error: 'Missing paragraphs.' };
    const paras = rawParas.map((p) => (Array.isArray(p && p.sentences) ? p.sentences.map(cleanSentence).filter(Boolean) : []));
    if (paras.some((list) => !list.length)) return { ok: false, error: 'A paragraph has no sentences.' };
    const all = paras.flat();
    if (new Set(all.map((s) => s.toLowerCase())).size !== all.length) return { ok: false, error: 'Duplicate sentences.' };
    if (all.some((s) => countWords(s) > 45)) return { ok: false, error: 'A sentence is too long (max 45 words).' };
    const title = cleanSentence(r.title).slice(0, 100);
    const words = all.reduce((n, s) => n + countWords(s), 0) + (v.whole && title ? countWords(title) : 0);

    // Linking: every non-first, non-greeting/sign-off sentence of a paragraph needs a cohesive marker
    // (≥ 75% per text), and every paragraph after the first must open with one.
    let needed = 0;
    let linked = 0;
    let unsignposted = 0;
    paras.forEach((list, pi) => {
        const firstReal = list.findIndex((x) => !FO.isShortLine(x));
        list.forEach((s, si) => {
            if (FO.isShortLine(s) || (pi === 0 && si === firstReal)) return;
            if (si === firstReal) {
                if (!hasCohesiveMarker(s)) unsignposted += 1;
                return;
            }
            needed += 1;
            if (hasCohesiveMarker(s)) linked += 1;
        });
    });
    if (unsignposted) return { ok: false, error: 'Every paragraph after the first must open with a linking/signposting phrase.' };
    if (needed && linked / needed < 0.75) return { ok: false, error: 'Too few linking devices: the sentence order would be ambiguous.' };

    const id = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const meta = { task, elements, topic, title, words, ai: true };
    if (v.whole) {
        if (paras.length < 3 || paras.length > 6) return { ok: false, error: 'A whole text needs 3–6 paragraphs.' };
        if (words < WHOLE_WORDS.min || words > WHOLE_WORDS.max) {
            return { ok: false, error: `The whole text has ${words} words; it must have ${WHOLE_WORDS.min}–${WHOLE_WORDS.max}.` };
        }
        const t = FO.findTextType(v.textType);
        const startType = t.paras.find((p) => p.role === 'start').id;
        const endType = t.paras.filter((p) => p.role === 'end').map((p) => p.id);
        const middleType = t.paras.find((p) => p.role === 'middle').id;
        const typed = paras.map((sentences, i) => {
            const wanted = String(rawParas[i] && rawParas[i].type || '');
            let type = i === 0 ? startType : i === paras.length - 1 ? (endType.includes(wanted) ? wanted : endType[0]) : middleType;
            if (i > 0 && i < paras.length - 1 && FO.findPara(v.textType, wanted)?.role === 'middle') type = wanted;
            return { id: `${id}-p${i + 1}`, type, sentences };
        });
        const chunks = FO.chunkWholeText({ paragraphs: typed });
        if (chunks.length < 8) return { ok: false, error: 'Too few sentences to order.' };
        return { ok: true, value: { id, textType: v.textType, paraType: FO.WHOLE, kind: '', paragraphs: typed, ...meta } };
    }
    const sentences = paras[0];
    if (sentences.length < 3 || sentences.length > 8) return { ok: false, error: 'A paragraph needs 3–8 sentences.' };
    if (words < PARA_WORDS.min || words > PARA_WORDS.max) {
        return { ok: false, error: `The paragraph has ${words} words; it must have ${PARA_WORDS.min}–${PARA_WORDS.max}.` };
    }
    return { ok: true, value: { id, textType: v.textType, type: v.paraType, sentences, ...meta } };
}

/** Per-user sliding-window limiter (in memory): max N per window, a minimum gap, one at a time. */
export function createRateLimiter({ max = RATE_LIMIT.max, windowMs = RATE_LIMIT.windowMs, minGapMs = RATE_LIMIT.minGapMs, now = () => Date.now() } = {}) {
    const hits = new Map();
    const busy = new Set();
    return {
        check(userId) {
            const key = String(userId);
            const t = now();
            const list = (hits.get(key) || []).filter((x) => t - x < windowMs);
            hits.set(key, list);
            if (busy.has(key)) return { ok: false, retryAfterSec: 5, error: 'A text is already being generated. Please wait.' };
            if (list.length && t - list[list.length - 1] < minGapMs) {
                return { ok: false, retryAfterSec: Math.ceil((minGapMs - (t - list[list.length - 1])) / 1000), error: 'Please wait a few seconds before generating again.' };
            }
            if (list.length >= max) {
                return { ok: false, retryAfterSec: Math.ceil((windowMs - (t - list[0])) / 1000), error: `Limit reached: ${max} AI texts per hour. The ready-made bank is still available.` };
            }
            return { ok: true };
        },
        start(userId) { const key = String(userId); busy.add(key); (hits.get(key) || hits.set(key, []).get(key)).push(now()); },
        finish(userId) { busy.delete(String(userId)); },
    };
}

/**
 * Express handler factory. `runPrompt(prompt, label)` returns parsed JSON (server.js passes the
 * Cursor AI runner; tests pass a mock). Mount behind requireWritingAccess.
 */
export function createFrankGenerateHandler({ runPrompt, limiter = createRateLimiter(), isConfigured = () => true, attempts = 2 } = {}) {
    return async function frankGenerate(req, res) {
        const checked = validateFrankAiRequest(req.body);
        if (!checked.ok) return res.status(400).json({ error: checked.error, fallback: true });
        if (!isConfigured()) return res.status(503).json({ error: 'AI generation is not configured on the server.', fallback: true });
        const userId = req.user && req.user.id;
        const gate = limiter.check(userId);
        if (!gate.ok) {
            res.set('Retry-After', String(gate.retryAfterSec));
            return res.status(429).json({ error: gate.error, retryAfterSec: gate.retryAfterSec, fallback: true });
        }
        const v = checked.value;
        limiter.start(userId);
        let lastError = 'The AI reply did not pass the checks.';
        try {
            for (let i = 0; i < attempts; i++) {
                const retryNote = i ? `PREVIOUS ATTEMPT WAS REJECTED: ${lastError} Fix this.` : '';
                let raw;
                try {
                    raw = await runPrompt(buildFrankAiPrompt(v, { retryNote }), `frank-${v.textType}-${v.paraType}`);
                } catch (err) {
                    lastError = err && err.message ? err.message : 'AI request failed.';
                    continue;
                }
                const result = validateFrankAiResult(raw, v);
                if (result.ok) return res.json({ ok: true, item: result.value });
                lastError = result.error;
            }
            return res.status(502).json({ error: `AI text could not be validated (${lastError})`, fallback: true });
        } finally {
            limiter.finish(userId);
        }
    };
}

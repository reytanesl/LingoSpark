// Frankenstein Builder: text type + paragraph type options and bank filtering.
// Works in the browser (window.FrankOptions) and in Node tests (module.exports).
(function (root) {
    'use strict';

    const ANY = 'any';
    const WHOLE = 'whole';
    const STORAGE_KEY = 'lingospark.frank.selection.v1';

    const TEXT_TYPES = [
        {
            id: 'essay',
            wholeHint: 'Typical shape: introduction → body paragraphs (arguments for and against, or your opinion and a counter-argument) → conclusion.',
            label: 'Essay (for and against / opinion)',
            short: 'Essay',
            paras: [
                { id: 'introduction', role: 'start', label: 'Introduction', hint: 'Typical shape: general context → the debate or problem → the writer’s thesis or question.' },
                { id: 'body_for', role: 'middle', label: 'Body paragraph — arguments for', hint: 'Typical shape: a point in favour → explanation → extra support → result or wrap-up.' },
                { id: 'body_against', role: 'middle', label: 'Body paragraph — arguments against', hint: 'Typical shape: a contrasting point → explanation → extra support → result or wrap-up.' },
                { id: 'body_opinion', role: 'middle', label: 'Body paragraph — opinion', hint: 'Typical shape: a clear personal view → reasons → further justification → a firm close.' },
                { id: 'body_counter', role: 'middle', label: 'Counter-argument and rebuttal', hint: 'Typical shape: the opposing view → why some people hold it → your rebuttal (However / Nevertheless) → your position restated.' },
                { id: 'conclusion_for_against', role: 'end', label: 'Conclusion — for and against', hint: 'Typical shape: a balanced summary → both sides in brief → a measured closing judgement.' },
                { id: 'conclusion_opinion', role: 'end', label: 'Conclusion — opinion', hint: 'Typical shape: a restated opinion → a key reason → a final recommendation.' },
            ],
        },
        {
            id: 'formal_letter',
            wholeHint: 'Typical shape: greeting and reason for writing → main points → further details → what you expect next and a formal sign-off.',
            label: 'Formal letter / email',
            short: 'Formal letter',
            paras: [
                { id: 'opening', role: 'start', label: 'Opening — greeting and reason for writing', hint: 'Typical shape: Dear Sir or Madam / Dear Ms … → I am writing to / in response to … → what the letter is about.' },
                { id: 'body', role: 'middle', label: 'Main body — details, request or complaint', hint: 'Typical shape: first point → more detail → next point, linked with Firstly / In addition / As a result.' },
                { id: 'closing', role: 'end', label: 'Closing and sign-off', hint: 'Typical shape: what you expect next → I look forward to … → Yours faithfully / sincerely → your name.' },
            ],
        },
        {
            id: 'informal_letter',
            wholeHint: 'Typical shape: friendly greeting → main news → more news or details → wrapping up and a casual sign-off.',
            label: 'Informal letter / email',
            short: 'Informal email',
            paras: [
                { id: 'opening', role: 'start', label: 'Opening — greeting and reason for writing', hint: 'Typical shape: Hi … → a friendly question or thanks → why you are writing.' },
                { id: 'body', role: 'middle', label: 'Main body — news and details', hint: 'Typical shape: the main news → details → what happened next → how things are now.' },
                { id: 'closing', role: 'end', label: 'Closing and sign-off', hint: 'Typical shape: wrapping up (Anyway …) → ask for a reply or suggest meeting → Love / Take care → your name.' },
            ],
        },
        {
            id: 'article',
            wholeHint: 'Typical shape: an eye-catching introduction → the main point → a further point → a conclusion that speaks to the reader.',
            label: 'Article',
            short: 'Article',
            paras: [
                { id: 'introduction', role: 'start', label: 'Introduction — hooking the reader', hint: 'Typical shape: a question or striking idea → link to the reader → what the article will discuss.' },
                { id: 'body', role: 'middle', label: 'Main body — developing the topic', hint: 'Typical shape: main point → explanation → example or consequence → extra point (What is more …).' },
                { id: 'conclusion', role: 'end', label: 'Conclusion — final thought or call to action', hint: 'Typical shape: summing up → advice or a question for the reader → a memorable last line.' },
            ],
        },
        {
            id: 'review',
            wholeHint: 'Typical shape: what it is → description → strengths and weaknesses → overall opinion and recommendation.',
            label: 'Review (film, book, restaurant)',
            short: 'Review',
            paras: [
                { id: 'introduction', role: 'start', label: 'Introduction — what, where and when', hint: 'Typical shape: what you saw, read or visited → basic background → your first impression.' },
                { id: 'body', role: 'middle', label: 'Main body — description and evaluation', hint: 'Typical shape: what it is about → more detail → strong points → a weakness (My only criticism …).' },
                { id: 'conclusion', role: 'end', label: 'Conclusion — recommendation', hint: 'Typical shape: overall opinion → balance of good and bad → who you recommend it to.' },
            ],
        },
        {
            id: 'story',
            wholeHint: 'Typical shape: setting the scene → events build up → the key moment → how it all ended.',
            label: 'Story',
            short: 'Story',
            paras: [
                { id: 'opening', role: 'start', label: 'Opening — setting the scene', hint: 'Typical shape: time and place → the characters → a hint that something will happen.' },
                { id: 'body', role: 'middle', label: 'Development and climax', hint: 'Typical shape: events in time order (At first … Then … Soon … Finally …) building to the key moment.' },
                { id: 'ending', role: 'end', label: 'Ending', hint: 'Typical shape: how the problem is solved → what happened afterwards → a final reflection.' },
            ],
        },
        {
            id: 'report',
            wholeHint: 'Typical shape: aim of the report → findings → further findings → conclusion and recommendations.',
            label: 'Report',
            short: 'Report',
            paras: [
                { id: 'introduction', role: 'start', label: 'Introduction — aim of the report', hint: 'Typical shape: The aim of this report is … → how the information was collected → what follows.' },
                { id: 'body', role: 'middle', label: 'Findings', hint: 'Typical shape: main finding → a contrasting finding (However …) → further points (In addition …).' },
                { id: 'conclusion', role: 'end', label: 'Conclusion and recommendations', hint: 'Typical shape: overall summary → Firstly / Secondly, I would recommend … → expected result.' },
            ],
        },
    ];

    const ROLES = [
        { id: 'start', label: 'Beginning — introduction / opening' },
        { id: 'middle', label: 'Middle — body paragraph' },
        { id: 'end', label: 'End — conclusion / closing' },
    ];

    const DEFAULT_SELECTION = Object.freeze({ textType: ANY, paraType: ANY });

    function textTypeOf(item) {
        return (item && item.textType) || 'essay';
    }

    function findTextType(id) {
        return TEXT_TYPES.find((t) => t.id === id) || null;
    }

    function findPara(textType, paraId) {
        const t = findTextType(textType);
        return (t && t.paras.find((p) => p.id === paraId)) || null;
    }

    /** Options for the paragraph selector, filtered by text type ("any" → generic roles). */
    function paragraphOptions(textType) {
        const t = findTextType(textType);
        const list = t ? t.paras.map((p) => ({ value: p.id, label: p.label })) : ROLES.map((r) => ({ value: `role:${r.id}`, label: r.label }));
        return [{ value: ANY, label: 'Any / Random' }, { value: WHOLE, label: 'Whole text (beginning to end)' }, ...list];
    }

    function textTypeOptions() {
        return [{ value: ANY, label: 'Any / Random' }, ...TEXT_TYPES.map((t) => ({ value: t.id, label: t.label }))];
    }

    /** Keep only valid combinations; an unknown or mismatched paragraph type falls back to Any. */
    function normalizeSelection(sel) {
        const s = sel && typeof sel === 'object' ? sel : {};
        const textType = findTextType(s.textType) ? s.textType : ANY;
        const paraType = String(s.paraType || ANY);
        const valid = paragraphOptions(textType).some((o) => o.value === paraType);
        return { textType, paraType: valid ? paraType : ANY };
    }

    function roleOf(item) {
        const p = findPara(textTypeOf(item), item && item.type);
        return p ? p.role : null;
    }

    function isWhole(sel) {
        return normalizeSelection(sel).paraType === WHOLE;
    }

    function matches(item, sel) {
        const s = normalizeSelection(sel);
        if (s.paraType === WHOLE) return false;
        if (!item || !Array.isArray(item.sentences) || item.sentences.length < 2) return false;
        if (s.textType !== ANY && textTypeOf(item) !== s.textType) return false;
        if (s.paraType === ANY) return true;
        if (s.paraType.startsWith('role:')) return roleOf(item) === s.paraType.slice(5);
        return item.type === s.paraType;
    }

    function filterBank(bank, sel) {
        return (Array.isArray(bank) ? bank : []).filter((item) => matches(item, sel));
    }

    /** Random matching paragraph, avoiding the previous one when possible. */
    function pickParagraph(bank, sel, lastId, rand) {
        const r = typeof rand === 'function' ? rand : Math.random;
        const usable = filterBank(bank, sel);
        const pool = usable.filter((p) => p.id !== lastId);
        const list = pool.length ? pool : usable;
        if (!list.length) return null;
        return list[Math.floor(r() * list.length) % list.length];
    }

    /** Lines of one paragraph: greetings / sign-offs / names (ending in a comma or no full stop) get their own line. */
    function paragraphLines(item) {
        const lines = [];
        let cur = '';
        for (const raw of (item && item.sentences) || []) {
            const sentence = String(raw || '').trim();
            if (!sentence) continue;
            const own = /,$/.test(sentence) || !/[.!?…"”'’)]$/.test(sentence);
            if (own) {
                if (cur) lines.push(cur);
                lines.push(sentence);
                cur = '';
            } else {
                cur = cur ? `${cur} ${sentence}` : sentence;
            }
        }
        if (cur) lines.push(cur);
        return lines;
    }

    /** Resolve a whole-text model (paragraph ids) into its ordered paragraphs; null if any part is missing. */
    function resolveWholeText(bank, whole) {
        if (!whole || !Array.isArray(whole.paragraphs) || whole.paragraphs.length < 3) return null;
        const byId = new Map((Array.isArray(bank) ? bank : []).map((p) => [p.id, p]));
        const paras = whole.paragraphs.map((id) => byId.get(id));
        if (paras.some((p) => !p)) return null;
        return {
            id: whole.id,
            textType: whole.textType || 'essay',
            kind: whole.essayKind || '',
            topic: whole.topic || '',
            paragraphs: paras.map((p) => ({ id: p.id, type: p.type, sentences: p.sentences.slice(), lines: paragraphLines(p), text: paragraphLines(p).join('\n') })),
        };
    }

    function filterWholeTexts(bank, wholes, sel) {
        const s = normalizeSelection(sel);
        return (Array.isArray(wholes) ? wholes : [])
            .filter((w) => s.textType === ANY || (w.textType || 'essay') === s.textType)
            .map((w) => resolveWholeText(bank, w))
            .filter(Boolean);
    }

    function pickWholeText(bank, wholes, sel, lastId, rand) {
        const r = typeof rand === 'function' ? rand : Math.random;
        const usable = filterWholeTexts(bank, wholes, sel);
        const pool = usable.filter((w) => w.id !== lastId);
        const list = pool.length ? pool : usable;
        if (!list.length) return null;
        return list[Math.floor(r() * list.length) % list.length];
    }

    /** Letter greeting / sign-off / name line: ends with a comma or has no final punctuation. */
    function isShortLine(sentence) {
        const t = String(sentence || '').trim();
        return /,$/.test(t) || !/[.!?…"”'’)]$/.test(t);
    }

    /**
     * Whole-text cards: single sentences or two-sentence chunks across the entire text.
     * Chunks never cross a paragraph break; greetings, sign-offs and names stay on their own.
     * Sentences are paired (1+2, 3+4 … inside the paragraph with the most cards first) until
     * the text has at most `max` cards (default 12). Deterministic, so positions are stable.
     */
    function chunkWholeText(whole, opts) {
        const max = (opts && opts.max) || 12;
        const paras = ((whole && whole.paragraphs) || []).map((p, pi) => {
            const src = p.sentences || (p.lines ? null : []);
            const sentences = src || [];
            return sentences.map((t) => ({ para: pi, sentences: [String(t).trim()], fixed: isShortLine(t) }));
        });
        const total = () => paras.reduce((n, list) => n + list.length, 0);
        const mergeOnce = () => {
            // the paragraph with the most single-sentence cards that can still be paired
            let best = -1;
            let bestCount = 0;
            paras.forEach((list, pi) => {
                let singles = 0;
                for (let i = 0; i + 1 < list.length; i++) {
                    if (!list[i].fixed && !list[i + 1].fixed && list[i].sentences.length === 1 && list[i + 1].sentences.length === 1) singles++;
                }
                const count = list.filter((c) => !c.fixed).length;
                if (singles && count > bestCount) { best = pi; bestCount = count; }
            });
            if (best < 0) return false;
            const list = paras[best];
            for (let i = 0; i + 1 < list.length; i++) {
                const a = list[i];
                const b = list[i + 1];
                if (!a.fixed && !b.fixed && a.sentences.length === 1 && b.sentences.length === 1) {
                    list.splice(i, 2, { para: best, sentences: [...a.sentences, ...b.sentences], fixed: false });
                    return true;
                }
            }
            return false;
        };
        while (total() > max && mergeOnce()) { /* pair up */ }
        const chunks = [];
        paras.forEach((list) => list.forEach((c) => {
            chunks.push({ id: chunks.length + 1, para: c.para, text: c.sentences.join(' '), sentences: c.sentences.length, short: c.fixed });
        }));
        return chunks;
    }

    /** Index (0-based) of the first card that is out of place, or -1 when the order is right. */
    function firstWrongPosition(order) {
        return (order || []).findIndex((id, i) => Number(id) !== i + 1);
    }


    function countFor(bank, wholes, sel) {
        return isWhole(sel) ? filterWholeTexts(bank, wholes, sel).length : filterBank(bank, sel).length;
    }

    function wholeInfo(whole) {
        const t = findTextType(whole && whole.textType);
        return {
            textLabel: (whole && whole.kind) || (t ? t.short : 'Text'),
            label: 'Whole text — order the sentences from beginning to end',
            hint: t ? t.wholeHint : 'Put the paragraphs in order from the beginning of the text to the end.',
        };
    }

    function typeInfo(item) {
        const t = findTextType(textTypeOf(item));
        const p = findPara(textTypeOf(item), item && item.type);
        return {
            textLabel: t ? t.short : 'Text',
            label: p ? p.label : String((item && item.type) || 'Paragraph').replace(/_/g, ' '),
            hint: p ? p.hint : 'Put the sentences back into the original paragraph order.',
        };
    }

    function selectionLabel(sel) {
        const s = normalizeSelection(sel);
        const t = findTextType(s.textType);
        const p = paragraphOptions(s.textType).find((o) => o.value === s.paraType);
        return `${t ? t.short : 'Any text type'} · ${s.paraType === ANY ? 'any paragraph' : p.label}`;
    }

    function loadSelection(storage) {
        try {
            const raw = storage && storage.getItem(STORAGE_KEY);
            return normalizeSelection(raw ? JSON.parse(raw) : DEFAULT_SELECTION);
        } catch (_) {
            return { ...DEFAULT_SELECTION };
        }
    }

    function saveSelection(storage, sel) {
        const s = normalizeSelection(sel);
        try { if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_) { /* private mode */ }
        return s;
    }

    const api = {
        ANY, WHOLE, STORAGE_KEY, isWhole, chunkWholeText, firstWrongPosition, isShortLine, paragraphLines, resolveWholeText, filterWholeTexts, pickWholeText, countFor, wholeInfo, TEXT_TYPES, ROLES, DEFAULT_SELECTION,
        textTypeOf, findTextType, findPara, paragraphOptions, textTypeOptions, normalizeSelection,
        matches, filterBank, pickParagraph, typeInfo, selectionLabel, loadSelection, saveSelection,
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FrankOptions = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));

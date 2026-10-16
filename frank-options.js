// Frankenstein Builder: text type + paragraph type options and bank filtering.
// Works in the browser (window.FrankOptions) and in Node tests (module.exports).
(function (root) {
    'use strict';

    const ANY = 'any';
    const WHOLE = 'whole';
    const STORAGE_KEY = 'lingospark.frank.selection.v1';

    /**
     * CKE Matura rozszerzona (formuła 2023+) writing forms.
     * Marked out of 13 on the same four criteria for every form; target length 200–250 words
     * (CKE: below 160 words only Zgodność is scored). See Informator — język angielski.
     */
    const TEXT_TYPES = [
        {
            id: 'for_against',
            wholeHint: 'CKE plan (4 paragraphs, 200–250 words): neutral introduction → arguments for → arguments against → conclusion that weighs both sides.',
            label: 'For–against essay',
            short: 'For–against essay',
            conventions: 'Neutral introduction (no thesis yet); one paragraph of arguments for and one against (or a balanced mix); conclusion that sums up both sides and may give an opinion. Formal style, no contractions.',
            plan: [
                'Introduction: present the issue neutrally; note that it is controversial — do not give your opinion yet.',
                'Arguments for: 2–3 points, each with support or examples (often one polecenie element).',
                'Arguments against: 2–3 points, each with support or examples (often the other element).',
                'Conclusion: sum up both sides and give a balanced view or your own opinion.',
            ],
            paras: [
                { id: 'introduction', role: 'start', label: 'Introduction — neutral', hint: 'Present the issue neutrally (e.g. a controversial debate) → both sides promised → no final verdict yet.' },
                { id: 'body_for', role: 'middle', label: 'Arguments for', hint: '2–3 points in favour, each with reasons/examples/consequences (Often: first element of the polecenie).' },
                { id: 'body_against', role: 'middle', label: 'Arguments against', hint: '2–3 contrasting points, each with support (Often: second element of the polecenie).' },
                { id: 'conclusion_for_against', role: 'end', label: 'Conclusion — balanced judgement', hint: 'Brief summary of both sides → measured closing judgement or opinion.' },
            ],
        },
        {
            id: 'opinion',
            wholeHint: 'CKE plan (4–5 paragraphs, 200–250 words): introduction with a clear thesis → body arguments → optional opposing view with rebuttal → conclusion that restates the opinion.',
            label: 'Opinion essay',
            short: 'Opinion essay',
            conventions: 'Introduction with a clear thesis; body paragraphs that each argue one point with support; conclusion that restates the opinion. Formal, impersonal style — no contractions or chatty language.',
            plan: [
                'Introduction: introduce the topic and state your opinion clearly in a thesis sentence.',
                'Body 1: first argument with reasons and an example (often the first polecenie element).',
                'Body 2: second argument with support (often the second polecenie element).',
                'Optional Body 3: one opposing view, then why you disagree.',
                'Conclusion: restate your opinion in different words and add a final thought or recommendation.',
            ],
            paras: [
                { id: 'introduction', role: 'start', label: 'Introduction — thesis', hint: 'General context → the problem → a clear thesis stating your opinion.' },
                { id: 'body_opinion', role: 'middle', label: 'Body — supporting argument', hint: 'One clear claim → reasons → example or consequence → firm close (one polecenie element).' },
                { id: 'body_counter', role: 'middle', label: 'Opposing view and rebuttal (optional)', hint: 'Opposing view → why some hold it → your rebuttal (However / Nevertheless) → your position restated.' },
                { id: 'conclusion_opinion', role: 'end', label: 'Conclusion — restated opinion', hint: 'Restate the opinion in different words → key reason → final recommendation or thought.' },
            ],
        },
        {
            id: 'article',
            wholeHint: 'CKE plan (4–5 paragraphs, 200–250 words): catchy title → hooking opening → body developing both prompt elements → memorable ending or call to action.',
            label: 'Article',
            short: 'Article',
            conventions: 'Eye-catching title; opening that hooks the reader (question, surprising fact or short anecdote); lively body that speaks to the reader; memorable final line or call to action. Semi-formal and vivid — no slang. Must not read like a dry essay.',
            plan: [
                'Title: short and catchy (question, play on words, or a promise).',
                'Opening: hook the reader and introduce the topic.',
                'Body 1: first polecenie element — personal examples and vivid language.',
                'Body 2: second polecenie element — developed the same way.',
                'Optional Body 3: an extra angle or a piece of advice.',
                'Ending: memorable final line (advice, call to action or rhetorical question) that links back to the opening.',
            ],
            paras: [
                { id: 'introduction', role: 'start', label: 'Opening — hook the reader', hint: 'Question, surprising fact or short anecdote → link to the reader → what the article will discuss.' },
                { id: 'body', role: 'middle', label: 'Main body — develop a prompt element', hint: 'One polecenie element: claim → vivid explanation → personal example or consequence → address the reader.' },
                { id: 'conclusion', role: 'end', label: 'Ending — call to action', hint: 'Memorable last line: advice, call to action or rhetorical question that echoes the opening.' },
            ],
        },
        {
            id: 'formal_letter',
            wholeHint: 'CKE plan (4–5 paragraphs, 200–250 words): greeting → reason for writing → body for each prompt element → closing that asks for action → Yours faithfully/sincerely + XYZ.',
            label: 'Formal letter',
            short: 'Formal letter',
            conventions: 'Correct greeting and matching sign-off (Dear Sir or Madam → Yours faithfully; Dear Mr/Ms X → Yours sincerely). Reason for writing in the opening; closing that asks for a reply or action. Formal, polite, no contractions. Sign as XYZ — never a real name.',
            plan: [
                'Greeting: Dear Sir or Madam, or Dear Mr/Ms X,',
                'Opening: who you are if relevant and why you are writing.',
                'Body 1: first polecenie element, developed with details.',
                'Body 2: second polecenie element, developed with details.',
                'Closing: what you expect next (reply or action) and a polite thank-you.',
                'Sign-off: Yours faithfully / Yours sincerely, then XYZ on its own line.',
            ],
            paras: [
                { id: 'opening', role: 'start', label: 'Opening — greeting and reason', hint: 'Dear Sir or Madam / Dear Mr/Ms … → I am writing to / in response to … → who you are if needed and why.' },
                { id: 'body', role: 'middle', label: 'Main body — one prompt element', hint: 'Develop one polecenie element fully (claim + details + example/consequence), with formal linkers.' },
                { id: 'closing', role: 'end', label: 'Closing and sign-off (XYZ)', hint: 'What you expect next → I look forward to … → Yours faithfully / sincerely → XYZ (never a real name).' },
            ],
        },
    ];

    /** Shared CKE marking scale for every Matura rozszerzona writing form (max 13). */
    const CKE_CRITERIA = Object.freeze([
        { id: 'zgodnosc', label: 'Zgodność z poleceniem', max: 5, summary: 'Cover both prompt elements and develop each with reasons, examples and consequences; follow the conventions of the form. Just mentioning an element scores low.' },
        { id: 'spojnosc', label: 'Spójność i logika', max: 2, summary: 'Clear paragraphs, logical order and linkers between sentences and paragraphs so the reader never has to guess how ideas fit.' },
        { id: 'zakres', label: 'Zakres środków językowych', max: 3, summary: 'Precise, varied B2+ vocabulary and structures (collocations, inversion, passives) — not simple, repeated words.' },
        { id: 'poprawnosc', label: 'Poprawność środków językowych', max: 3, summary: 'Grammar, vocabulary, spelling and punctuation: fewer mistakes, especially ones that block meaning, means more points.' },
    ]);
    const CKE_WORD_TARGET = Object.freeze({ min: 200, max: 250 });
    const CKE_WORD_ACCEPT = Object.freeze({ min: 180, max: 280 });
    const CKE_WORD_FLOOR = 160; // CKE: below this, only Zgodność is scored

    const FOR_AGAINST_PARAS = new Set(['introduction', 'body_for', 'body_against', 'conclusion_for_against']);
    const OPINION_PARAS = new Set(['introduction', 'body_opinion', 'body_counter', 'conclusion_opinion']);
    const SHARED_ESSAY_INTROS = new Set(['introduction']);

    const ROLES = [
        { id: 'start', label: 'Beginning — introduction / opening' },
        { id: 'middle', label: 'Middle — body paragraph' },
        { id: 'end', label: 'End — conclusion / closing' },
    ];

    const DEFAULT_SELECTION = Object.freeze({ textType: ANY, paraType: ANY });

    /** Map bank / AI items onto the four active Matura forms (legacy essay → for_against / opinion). */
    function resolveTextTypes(item) {
        const raw = String((item && item.textType) || 'essay');
        if (raw === 'formal_letter' || raw === 'article') return [raw];
        if (raw === 'for_against' || raw === 'opinion') return [raw];
        if (raw === 'essay' || !item || !item.textType) {
            const typ = String((item && item.type) || '');
            if (SHARED_ESSAY_INTROS.has(typ)) return ['for_against', 'opinion'];
            if (FOR_AGAINST_PARAS.has(typ)) return ['for_against'];
            if (OPINION_PARAS.has(typ)) return ['opinion'];
            return ['for_against'];
        }
        return [raw];
    }

    function textTypeOf(item) {
        return resolveTextTypes(item)[0];
    }

    function isActiveTextType(id) {
        return Boolean(findTextType(id));
    }

    function resolveWholeTextType(whole) {
        const raw = String((whole && whole.textType) || 'essay');
        if (raw === 'formal_letter' || raw === 'article' || raw === 'for_against' || raw === 'opinion') return raw;
        if (raw === 'essay') {
            return /opinion/i.test(String((whole && whole.essayKind) || '')) ? 'opinion' : 'for_against';
        }
        return raw;
    }

    function findTextType(id) {
        return TEXT_TYPES.find((t) => t.id === id) || null;
    }

    function findPara(textType, paraId) {
        const t = findTextType(textType);
        return t ? (t.paras.find((p) => p.id === paraId) || null) : null;
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
        for (const tt of resolveTextTypes(item)) {
            const p = findPara(tt, item && item.type);
            if (p) return p.role;
        }
        return null;
    }

    function isWhole(sel) {
        return normalizeSelection(sel).paraType === WHOLE;
    }

    function matches(item, sel) {
        const s = normalizeSelection(sel);
        if (s.paraType === WHOLE) return false;
        if (!item || !Array.isArray(item.sentences) || item.sentences.length < 2) return false;
        const types = resolveTextTypes(item);
        if (s.textType === ANY) {
            if (!types.some(isActiveTextType)) return false;
        } else if (!types.includes(s.textType)) {
            return false;
        }
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
        const textType = resolveWholeTextType(whole);
        return {
            id: whole.id,
            textType,
            kind: whole.essayKind || '',
            topic: whole.topic || '',
            paragraphs: paras.map((p) => ({ id: p.id, type: p.type, sentences: p.sentences.slice(), lines: paragraphLines(p), text: paragraphLines(p).join('\n') })),
        };
    }

    function filterWholeTexts(bank, wholes, sel) {
        const s = normalizeSelection(sel);
        return (Array.isArray(wholes) ? wholes : [])
            .filter((w) => {
                const tt = resolveWholeTextType(w);
                if (s.textType === ANY) return isActiveTextType(tt);
                return tt === s.textType;
            })
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
        const t = findTextType(resolveWholeTextType(whole || {}));
        return {
            textLabel: (whole && whole.kind) || (t ? t.short : 'Text'),
            label: 'Whole text — order the sentences from beginning to end',
            hint: t ? t.wholeHint : 'Put the paragraphs in order from the beginning of the text to the end.',
        };
    }

    function typeInfo(item) {
        const tt = textTypeOf(item);
        const t = findTextType(tt);
        const p = findPara(tt, item && item.type);
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
        CKE_CRITERIA, CKE_WORD_TARGET, CKE_WORD_ACCEPT, CKE_WORD_FLOOR,
        textTypeOf, resolveTextTypes, resolveWholeTextType, isActiveTextType, findTextType, findPara, paragraphOptions, textTypeOptions, normalizeSelection,
        matches, filterBank, pickParagraph, typeInfo, selectionLabel, loadSelection, saveSelection,
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FrankOptions = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));

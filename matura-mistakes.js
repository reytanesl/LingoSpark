/**
 * Matura writing assessment — mistake types.
 * Shared by the browser (window.MaturaMistakes, loaded by index.html) and the server/tests
 * (import './matura-mistakes.js' then read globalThis.MaturaMistakes).
 *
 * The AI marks mistakes in markedTranscript with <<err>>…<</err>> and (since this change)
 * also returns `mistakes`: one { text, type, correction, explanation } per marker, in order.
 * Older saved reviews have no `mistakes`; for those each marker gets a heuristic type
 * (flagged `inferred: true` so the UI can say it is a best guess).
 */
(function (root) {
    'use strict';

    const TYPES = {
        grammar: { label: 'Grammar', short: 'GRAM', color: '#c8102e' },
        vocabulary: { label: 'Vocabulary / word choice', short: 'VOC', color: '#7b3fd1' },
        spelling: { label: 'Spelling', short: 'SP', color: '#d9480f' },
        punctuation: { label: 'Punctuation', short: 'PUNCT', color: '#0b7285' },
        'word-order': { label: 'Word order', short: 'WO', color: '#1c5fd6' },
        style: { label: 'Style / register', short: 'STY', color: '#2b8a3e' },
        coherence: { label: 'Coherence / linking', short: 'COH', color: '#a6570b' },
        other: { label: 'Other', short: '?', color: '#5c5f66' },
    };
    const TYPE_IDS = Object.keys(TYPES);

    const ALIASES = [
        [/^gram|tense|agreement|article|preposition|verb|plural|conditional|passive|modal/, 'grammar'],
        [/^vocab|word ?choice|lexis|lexical|collocation|wrong word|false friend|idiom/, 'vocabulary'],
        [/^spell|orthograph|typo|capital/, 'spelling'],
        [/^punct|comma|apostroph|full stop/, 'punctuation'],
        [/order/, 'word-order'],
        [/^style|register|formal|informal|tone|repetit|wordy|redundan/, 'style'],
        [/^coheren|cohesion|link|connector|logic|reference/, 'coherence'],
    ];

    /** Map whatever the model wrote ("Grammar (tense)", "word_order", "Lexis") to a type id. */
    function normalizeType(value) {
        const v = String(value || '').toLowerCase().trim().replace(/[_]+/g, ' ');
        if (!v) return null;
        const direct = v.replace(/\s+/g, '-');
        if (TYPES[direct]) return direct;
        for (const [re, id] of ALIASES) if (re.test(v)) return id;
        return 'other';
    }

    const FUNCTION_WORDS = /\b(a|an|the|is|are|was|were|be|been|being|am|has|have|had|do|does|did|will|would|shall|should|can|could|may|might|must|to|of|in|on|at|for|since|ago|than|then|who|which|whom|whose|that|this|these|those|much|many|less|fewer|more|most|myself|yourself|himself|herself|ourselves|themselves|me|him|her|us|them|my|his|its|their|our|your)\b/i;

    /** Best-guess type for a marked phrase when the model gave none (older results). */
    function classifyMistake(text) {
        const raw = String(text || '');
        const t = raw.trim();
        if (!t) return 'other';
        if (/^[\s.,;:!?'"’“”()\-–—]+$/.test(raw)) return 'punctuation';
        if (/^(and|but|so|because|however|moreover|furthermore|therefore|although|though|besides|firstly|secondly|finally|in addition|on the other hand|to sum up|in conclusion)\b[\s,]*$/i.test(t)) return 'coherence';
        if (/\b(gonna|wanna|kinda|stuff|guys|awesome|cool|ok|okay)\b/i.test(t)) return 'style';
        const words = t.split(/\s+/);
        if (words.length === 1) {
            if (/\b[a-z]+[,;]$|^[,;]|[a-z][,.][a-z]/i.test(t)) return 'punctuation';
            if (/^i$/.test(t) || /([a-z])\1\1/i.test(t) || /(ie|ei)/i.test(t) && /cie|ei[^g]/i.test(t)) return 'spelling';
            if (FUNCTION_WORDS.test(t) || /(ed|s)$/i.test(t)) return 'grammar';
            return 'vocabulary';
        }
        if (FUNCTION_WORDS.test(t) || /\b\w+(ed|s|ing)\b/i.test(t)) return 'grammar';
        return 'vocabulary';
    }

    function clip(s, n) {
        const v = String(s ?? '').replace(/\s+/g, ' ').trim();
        return v.length > n ? `${v.slice(0, n - 1)}…` : v;
    }

    /** Clean the model's `mistakes` array (also used before saving a review). */
    function sanitizeMistakes(list) {
        if (!Array.isArray(list)) return [];
        return list.slice(0, 120).map((m) => {
            if (!m || typeof m !== 'object') return null;
            const text = clip(m.text ?? m.original ?? m.error, 300);
            if (!text) return null;
            return {
                text,
                type: normalizeType(m.type ?? m.category) || classifyMistake(text),
                correction: clip(m.correction ?? m.fix ?? m.suggestion, 300),
                explanation: clip(m.explanation ?? m.reason ?? m.note, 400),
            };
        }).filter(Boolean);
    }

    const norm = (s) => String(s || '').toLowerCase().replace(/[\s.,;:!?'"’“”]+/g, ' ').trim();

    /**
     * Split a marked transcript into text and mistake segments and attach one mistake record
     * to every marker: same position when the text agrees, else the first unused record with
     * the same text, else a heuristic type (inferred).
     * Returns { segments: [{ text } | { text, mistake, index }], mistakes: [...] }.
     */
    function parseMarkedTranscript(marked, plain, mistakes) {
        const raw = String(marked || plain || '').trim();
        const given = sanitizeMistakes(mistakes);
        const used = new Set();
        const segments = [];
        const out = [];
        if (!raw) return { segments, mistakes: out };
        const re = /<<err>>([\s\S]*?)<<\/err>>/g;
        let last = 0;
        let m;
        while ((m = re.exec(raw)) !== null) {
            if (m.index > last) segments.push({ text: raw.slice(last, m.index) });
            const text = m[1];
            const i = out.length;
            let rec = null;
            if (given[i] && !used.has(i) && norm(given[i].text) === norm(text)) { rec = given[i]; used.add(i); }
            if (!rec) {
                const j = given.findIndex((g, k) => !used.has(k) && norm(g.text) === norm(text));
                if (j >= 0) { rec = given[j]; used.add(j); }
            }
            if (!rec && given[i] && !used.has(i) && given.length === countMarks(raw)) { rec = given[i]; used.add(i); }
            const mistake = rec
                ? { ...rec, text, inferred: false }
                : { text, type: classifyMistake(text), correction: '', explanation: '', inferred: true };
            out.push(mistake);
            segments.push({ text, mistake, index: i });
            last = m.index + m[0].length;
        }
        if (last < raw.length) segments.push({ text: raw.slice(last) });
        return { segments, mistakes: out };
    }

    function countMarks(raw) {
        return (String(raw).match(/<<err>>/g) || []).length;
    }

    function typeInfo(id) {
        return TYPES[id] || TYPES.other;
    }

    /** Prompt fragment the server appends so the model returns one typed entry per marker. */
    const PROMPT_TYPES = TYPE_IDS.filter((t) => t !== 'other').join(' | ');

    root.MaturaMistakes = {
        TYPES, TYPE_IDS, PROMPT_TYPES, normalizeType, classifyMistake, sanitizeMistakes, parseMarkedTranscript, typeInfo,
    };
})(typeof window !== 'undefined' ? window : globalThis);

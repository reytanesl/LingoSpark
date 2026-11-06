/**
 * Error-correction helpers for Own Time: tokenize a sentence into clickable words,
 * infer the wrong span, apply a fragment fix, and grade the student's selection + fix.
 * Browser: window.OwnTimeErrorFix; Node/tests: import or globalThis after import.
 */
(function (root) {
    'use strict';

    /** Split into word tokens; punctuation stays attached to the neighbouring word (trailing preferred). */
    function tokenizeSentence(sentence) {
        const s = String(sentence || '').replace(/\s+/g, ' ').trim();
        if (!s) return [];
        // Keep hyphenated words and apostrophes inside tokens; attach trailing punctuation to the word.
        const re = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*(?:-[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*)*[.,!?;:'"”’)]*|[.,!?;:"“‘(]+/gu;
        const raw = s.match(re) || [];
        // Drop pure-punctuation tokens for clickability, but keep them as glue in join — store as non-clickable.
        return raw.map((text, i) => ({
            i,
            text,
            clickable: /[\p{L}\p{N}]/u.test(text),
        }));
    }

    function clickableIndices(tokens) {
        return tokens.map((t, i) => (t.clickable ? i : -1)).filter((i) => i >= 0);
    }

    function joinTokens(tokens) {
        if (!tokens.length) return '';
        let out = tokens[0].text;
        for (let i = 1; i < tokens.length; i++) {
            const prev = tokens[i - 1].text;
            const cur = tokens[i].text;
            const noSpace = /^[.,!?;:'"”’)]$/.test(cur) || /[(“‘]$/.test(prev);
            out += noSpace ? cur : ` ${cur}`;
        }
        return out.replace(/\s+/g, ' ').trim();
    }

    function spanText(tokens, start, end) {
        if (!tokens.length) return '';
        const a = Math.max(0, Math.min(start, end));
        const b = Math.min(tokens.length - 1, Math.max(start, end));
        return joinTokens(tokens.slice(a, b + 1));
    }

    /** Contiguous selection from first/last clicked clickable word indices (token indexes). */
    function contiguousRange(a, b) {
        if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return null;
        return { start: Math.min(a, b), end: Math.max(a, b) };
    }

    /**
     * Find the wrong span in `lead` given the expected replacement fragment `answer`
     * and optional explicit `errorFrom` substring. Returns { start, end, errorFrom } in token indexes.
     */
    function inferErrorSpan(lead, { answer, errorFrom, alts } = {}) {
        const tokens = tokenizeSentence(lead);
        const clicks = clickableIndices(tokens);
        if (!tokens.length || !clicks.length) return null;

        const from = String(errorFrom || '').replace(/\s+/g, ' ').trim();
        if (from) {
            // Prefer matching a contiguous clickable-word span whose joined text equals errorFrom (loose).
            const loose = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
            const want = loose(from);
            for (let len = clicks.length; len >= 1; len--) {
                for (let a = 0; a <= clicks.length - len; a++) {
                    const start = clicks[a];
                    const end = clicks[a + len - 1];
                    if (loose(spanText(tokens, start, end)) === want) {
                        return { start, end, errorFrom: spanText(tokens, start, end) };
                    }
                }
            }
            // Fallback: substring search in the raw lead → map to tokens by character offsets.
            const idx = lead.toLowerCase().indexOf(from.toLowerCase());
            if (idx >= 0) {
                let pos = 0;
                let start = null;
                let end = null;
                for (const t of tokens) {
                    const at = lead.indexOf(t.text, pos);
                    if (at < 0) continue;
                    const tEnd = at + t.text.length;
                    if (tEnd > idx && at < idx + from.length && t.clickable) {
                        if (start == null) start = t.i;
                        end = t.i;
                    }
                    pos = at + t.text.length;
                }
                if (start != null) return { start, end, errorFrom: spanText(tokens, start, end) };
            }
        }

        // Infer by trying each contiguous span: replace with answer and see if we get a "cleaner" sentence —
        // without a full correct sentence we pick the shortest span whose text ≠ answer (case-insensitive).
        const loose = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
        const ans = loose(answer);
        if (!ans) return { start: clicks[0], end: clicks[0], errorFrom: spanText(tokens, clicks[0], clicks[0]) };

        // Prefer a span whose loose text is NOT the answer (the wrong bit).
        let best = null;
        for (let len = 1; len <= Math.min(4, clicks.length); len++) {
            for (let a = 0; a <= clicks.length - len; a++) {
                const start = clicks[a];
                const end = clicks[a + len - 1];
                const frag = loose(spanText(tokens, start, end));
                if (frag && frag !== ans) {
                    // Heuristic: prefer spans that share a stem with the answer or are short function-word errors.
                    const score = len + (ans.includes(frag.slice(0, 2)) || frag.includes(ans.slice(0, 2)) ? 0 : 2);
                    if (!best || score < best.score) best = { start, end, errorFrom: spanText(tokens, start, end), score };
                }
            }
        }
        if (best) return { start: best.start, end: best.end, errorFrom: best.errorFrom };
        return { start: clicks[0], end: clicks[0], errorFrom: spanText(tokens, clicks[0], clicks[0]) };
    }

    function applyFix(lead, start, end, replacement) {
        const tokens = tokenizeSentence(lead);
        if (!tokens.length) return String(replacement || '').trim();
        const a = Math.max(0, Math.min(start, end));
        const b = Math.min(tokens.length - 1, Math.max(start, end));
        const before = tokens.slice(0, a);
        const after = tokens.slice(b + 1);
        const mid = String(replacement ?? '').replace(/\s+/g, ' ').trim();
        const midTokens = mid ? tokenizeSentence(mid) : [];
        return joinTokens([...before, ...midTokens, ...after]);
    }

    function parseStudentValue(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return { start: null, end: null, fix: '' };
        if (raw.startsWith('{')) {
            try {
                const o = JSON.parse(raw);
                return {
                    start: Number.isFinite(Number(o.s ?? o.start)) ? Number(o.s ?? o.start) : null,
                    end: Number.isFinite(Number(o.e ?? o.end)) ? Number(o.e ?? o.end) : null,
                    fix: String(o.t ?? o.fix ?? o.answer ?? '').trim(),
                };
            } catch { /* fall through */ }
        }
        return { start: null, end: null, fix: raw };
    }

    function encodeStudentValue({ start, end, fix }) {
        return JSON.stringify({ s: start, e: end, t: String(fix || '').trim() });
    }

    function normFrag(s) {
        return String(s ?? '').toLowerCase().replace(/[\u2018\u2019\u02bc`´]/g, "'")
            .replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
    }

    /**
     * Grade error_correction: student gives selected span + replacement fragment.
     * Accepts the key fragment, alts, or a fix that yields the same corrected sentence
     * as the author's span+answer (allows slightly wider/narrower selection).
     */
    function gradeErrorCorrection(item, value) {
        const parsed = parseStudentValue(value);
        const fix = parsed.fix;
        if (!fix) return { status: 'empty' };
        const keys = [item?.answer, ...(item?.alts || []), ...(item?.acceptedAnswers || [])]
            .map(normFrag).filter(Boolean);
        if (keys.includes(normFrag(fix))) return { status: 'ok', mode: 'fragment' };

        const lead = String(item?.lead || '');
        if (!lead) return { status: 'wrong' };

        const authorStart = Number.isFinite(Number(item.errorStart)) ? Number(item.errorStart) : null;
        const authorEnd = Number.isFinite(Number(item.errorEnd)) ? Number(item.errorEnd) : null;
        let keySentence = item.corrected ? String(item.corrected) : null;
        if (!keySentence && authorStart != null && authorEnd != null && item.answer != null) {
            keySentence = applyFix(lead, authorStart, authorEnd, item.answer);
        }
        // Try student's span + fix
        if (parsed.start != null && parsed.end != null) {
            const got = normFrag(applyFix(lead, parsed.start, parsed.end, fix));
            if (keySentence && got === normFrag(keySentence)) return { status: 'ok', mode: 'sentence' };
            // Also try each alt as if it were the author answer on the author span
            for (const alt of [item?.answer, ...(item?.alts || [])].filter(Boolean)) {
                if (authorStart == null) break;
                const altSent = normFrag(applyFix(lead, authorStart, authorEnd, alt));
                if (got === altSent) return { status: 'ok', mode: 'sentence-alt' };
            }
        }
        // Plain-text legacy: student typed the full corrected sentence
        if (keySentence && normFrag(fix) === normFrag(keySentence)) return { status: 'ok', mode: 'full-sentence' };
        // 1-letter typo on short fragment
        if (keys.some((k) => k.replace(/\s/g, '').length >= 4 && editDistance(k, normFrag(fix)) === 1)) {
            return { status: 'almost' };
        }
        return { status: 'wrong' };
    }

    function editDistance(a, b) {
        a = String(a); b = String(b);
        if (Math.abs(a.length - b.length) > 2) return 3;
        const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
        for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
            const c = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
        return d[a.length][b.length];
    }

    /** Enrich a normalised error_correction item with errorStart/errorEnd/errorFrom/corrected. */
    function enrichErrorItem(it) {
        if (!it || !it.lead) return it;
        const span = inferErrorSpan(it.lead, {
            answer: it.answer,
            errorFrom: it.errorFrom || it.wrong || it.error,
            alts: it.alts,
        });
        if (!span) return it;
        const corrected = applyFix(it.lead, span.start, span.end, it.answer);
        return {
            ...it,
            errorStart: span.start,
            errorEnd: span.end,
            errorFrom: span.errorFrom,
            corrected,
        };
    }

    const api = {
        tokenizeSentence, clickableIndices, joinTokens, spanText, contiguousRange,
        inferErrorSpan, applyFix, parseStudentValue, encodeStudentValue,
        gradeErrorCorrection, enrichErrorItem, normFrag,
    };
    root.OwnTimeErrorFix = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

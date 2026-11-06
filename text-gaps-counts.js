/**
 * Text Gaps (Basic + Advanced) — clamp/resolve gap & missing-sentence counts.
 * Browser: window.TextGapsCounts. Node/tests: import then globalThis.TextGapsCounts.
 */
(function (root) {
    'use strict';

    const TRANSLATE_MIN = 3;
    const TRANSLATE_MAX = 10;
    const SENTENCES_MIN = 2;
    const SENTENCES_MAX = 6;

    /** Discrete choices shown in the setup UI (covers every level default). */
    const TRANSLATE_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10];
    const SENTENCES_OPTIONS = [2, 3, 4, 5, 6];

    function toInt(v, fallback) {
        const n = Number(v);
        return Number.isFinite(n) ? Math.round(n) : fallback;
    }

    function clampTranslateGapCount(n, fallback = 5) {
        const fb = Math.min(TRANSLATE_MAX, Math.max(TRANSLATE_MIN, toInt(fallback, 5)));
        const v = toInt(n, fb);
        return Math.min(TRANSLATE_MAX, Math.max(TRANSLATE_MIN, v));
    }

    function clampSentenceGapCount(n, fallback = 3) {
        const fb = Math.min(SENTENCES_MAX, Math.max(SENTENCES_MIN, toInt(fallback, 3)));
        const v = toInt(n, fb);
        return Math.min(SENTENCES_MAX, Math.max(SENTENCES_MIN, v));
    }

    function defaultCountForMode(mode, levelGuide) {
        const L = levelGuide || {};
        if (mode === 'sentences') return clampSentenceGapCount(L.gapsSentences, 3);
        return clampTranslateGapCount(L.gapsTranslate, 5);
    }

    /**
     * Resolve the count the generator should request.
     * @param {{ mode?: string, chosen?: number|string|null, levelGuide?: object }} opts
     */
    function resolveGapsCount({ mode, chosen, levelGuide } = {}) {
        const fallback = defaultCountForMode(mode, levelGuide);
        if (mode === 'sentences') return clampSentenceGapCount(chosen, fallback);
        return clampTranslateGapCount(chosen, fallback);
    }

    /**
     * Trim AI output to the requested gap count (parts.length becomes gaps.length + 1).
     * Too-few gaps are left as-is (cannot invent answers).
     */
    function normalizeGapsToCount(parts, gaps, count) {
        const n = Math.max(0, toInt(count, 0));
        const rawGaps = Array.isArray(gaps) ? gaps.slice() : [];
        const rawParts = Array.isArray(parts) ? parts.slice() : [''];
        if (!n || !rawGaps.length) {
            return { parts: rawParts, gaps: rawGaps };
        }
        if (rawGaps.length <= n) {
            return {
                parts: rawParts,
                gaps: rawGaps.map((g, i) => ({ ...(g && typeof g === 'object' ? g : {}), n: i + 1 })),
            };
        }
        const kept = rawGaps.slice(0, n).map((g, i) => ({
            ...(g && typeof g === 'object' ? g : {}),
            n: i + 1,
        }));
        let p = rawParts.slice();
        if (p.length > kept.length + 1) {
            const head = p.slice(0, kept.length);
            const tail = p.slice(kept.length).join('');
            p = [...head, tail];
        }
        while (p.length < kept.length + 1) p.push('');
        p = p.slice(0, kept.length + 1);
        return { parts: p, gaps: kept };
    }

    /** Short EN/PL phrase naming the count for on-screen instructions. */
    function instructionCountPhrase(mode, count, lang) {
        const n = mode === 'sentences'
            ? clampSentenceGapCount(count, 3)
            : clampTranslateGapCount(count, 5);
        if (lang === 'pl') {
            return mode === 'sentences'
                ? (n === 1 ? '1 brakujące zdanie' : `${n} brakujące zdania`)
                : (n === 1 ? '1 lukę' : `${n} luk`);
        }
        return mode === 'sentences'
            ? `${n} missing sentence${n === 1 ? '' : 's'}`
            : `${n} gap${n === 1 ? '' : 's'}`;
    }

    const api = {
        TRANSLATE_MIN,
        TRANSLATE_MAX,
        SENTENCES_MIN,
        SENTENCES_MAX,
        TRANSLATE_OPTIONS,
        SENTENCES_OPTIONS,
        clampTranslateGapCount,
        clampSentenceGapCount,
        defaultCountForMode,
        resolveGapsCount,
        normalizeGapsToCount,
        instructionCountPhrase,
    };
    root.TextGapsCounts = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

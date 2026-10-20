// Word Sets "Import from photo / list": shared helpers (browser: window.WordSetImportCore; Node: globalThis).
// Cleaning terms, parsing typed lists, de-duplicating and planning appends as consecutive cards.
(function (root) {
    'use strict';

    const LIMITS = Object.freeze({
        maxItems: 60,          // per import
        maxTerm: 80,
        maxDefinition: 200,
        setCap: 500,           // same cap as word sets
        maxFileBytes: 15 * 1024 * 1024,
        maxSide: 1600,         // client downscale
        jpegQuality: 0.82,
    });
    const LEVELS = ['A2', 'B1', 'B2', 'C1'];

    /** Strip numbering, bullets, checkboxes and stray punctuation around a term; keep phrases. */
    function cleanTerm(raw) {
        let t = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
        t = t.replace(/^(?:[-–—•·*▪◦●○□☐✓✔>]+\s*)+/, '');
        t = t.replace(/^\(?(?:\d{1,3}|[a-zA-Z]|[ivxIVX]{1,4})[.)\]:]\s+/, '');
        t = t.replace(/^\d{1,3}\s+(?=\p{L})/u, '');
        t = t.replace(/^[\s"'“”‘’(\[]+|[\s"'“”‘’)\].,;:!?]+$/g, '');
        // a trailing ")" that closes a "(" inside the term is part of it, e.g. "look up (a word)"
        if (/\([^)]*$/.test(t)) t += ')';
        return t.slice(0, LIMITS.maxTerm).trim();
    }

    function cleanDefinition(raw) {
        return String(raw == null ? '' : raw).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
            .replace(/^[-–—=:]\s*/, '').slice(0, LIMITS.maxDefinition).trim();
    }

    const keyOf = (term) => String(term || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

    /** Clean, drop empties, merge duplicates (first wins; a later definition fills an empty one). */
    function normaliseItems(items, max = LIMITS.maxItems) {
        const out = [];
        const seen = new Map();
        for (const it of Array.isArray(items) ? items : []) {
            const term = cleanTerm(it && (it.term ?? it.word));
            if (!term || !/[\p{L}\p{N}]/u.test(term)) continue;
            const definition = cleanDefinition(it && (it.definition ?? it.def));
            const k = keyOf(term);
            if (seen.has(k)) {
                const prev = seen.get(k);
                if (!prev.definition && definition) prev.definition = definition;
                continue;
            }
            const row = { term, definition };
            if (it && it.fromSource) row.fromSource = true;
            seen.set(k, row);
            out.push(row);
            if (out.length >= max) break;
        }
        return out;
    }

    /** Parse a typed/pasted list: "term = def", "term - def", "term: def", "term<TAB>def", or just terms. */
    function parseTypedList(text) {
        const rows = [];
        for (const line of String(text || '').split(/\r?\n/)) {
            const l = line.trim();
            if (!l) continue;
            const m = l.match(/^(.+?)\s*(?:\t+|\s=\s*|\s[-–—]\s+|:\s+)(.+)$/);
            if (m) rows.push({ term: m[1], definition: m[2], fromSource: true });
            else rows.push({ term: l, definition: '' });
        }
        return normaliseItems(rows);
    }

    /** Mark items already present in a set (case-insensitive term match). */
    function markDuplicates(items, existingTerms) {
        const have = new Set((existingTerms || []).map(keyOf));
        return (items || []).map((it) => ({ ...it, duplicate: have.has(keyOf(it.term)) }));
    }

    /**
     * Plan an append: new terms become consecutive cards after the current last position;
     * duplicates (already in the set or repeated in the import) and overflow past the cap are skipped.
     */
    function planAppend(existingRows, incoming, cap = LIMITS.setCap) {
        const have = new Set();
        let maxPos = -1;
        for (const r of existingRows || []) {
            have.add(keyOf(r.term));
            if (Number(r.position) > maxPos) maxPos = Number(r.position);
        }
        let count = (existingRows || []).length;
        const toInsert = [];
        const skipped = [];
        for (const it of incoming || []) {
            const term = cleanTerm(it && it.term);
            if (!term) continue;
            const k = keyOf(term);
            if (have.has(k)) { skipped.push({ term, reason: 'duplicate' }); continue; }
            if (count >= cap) { skipped.push({ term, reason: 'set-full' }); continue; }
            have.add(k);
            count += 1;
            maxPos += 1;
            toInsert.push({ term, definition: cleanDefinition(it.definition) || null, position: maxPos });
        }
        return { toInsert, skipped, itemCount: count };
    }

    function normaliseLevel(level) {
        const l = String(level || '').toUpperCase();
        return LEVELS.includes(l) ? l : 'B1';
    }

    const api = { LIMITS, LEVELS, cleanTerm, cleanDefinition, keyOf, normaliseItems, parseTypedList, markDuplicates, planAppend, normaliseLevel };
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.WordSetImportCore = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));

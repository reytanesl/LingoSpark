/**
 * "In your own time" — imported vocabulary lists (server-only, pure helpers).
 * A pasted list of OWN_TIME_VOCAB_MIN+ items is worked through in batches, set after set:
 *   new     → the next unused part of the list,
 *   revise  → words that were already practised (cycling through the covered ones),
 *   exhausted → every item has been covered: the student is asked what to do next.
 * Progress is stored per profile as a tiny state object (indexes only, never the words):
 *   { sig, total, cursor, covered: [idx…], reviseCursor, nextMode: 'new'|'revise', free: bool }
 */
export const OWN_TIME_VOCAB_MIN = 10;
export const OWN_TIME_VOCAB_MAX_ITEMS = 300;
export const OWN_TIME_VOCAB_TEXT_MAX = 8000;

/** Split a pasted list into items (one per line; a single line may be comma / semicolon separated). */
export function parseVocabList(text) {
    const raw = String(text ?? '').replace(/\r/g, '').slice(0, OWN_TIME_VOCAB_TEXT_MAX);
    let parts = raw.split('\n');
    if (parts.filter((p) => p.trim()).length <= 2 && /[;,]/.test(raw)) parts = raw.split(/[;\n,]+/);
    const seen = new Set();
    const out = [];
    for (const p of parts) {
        const s = p.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim().slice(0, 80);
        if (!s) continue;
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
        if (out.length >= OWN_TIME_VOCAB_MAX_ITEMS) break;
    }
    return out;
}

/** Short stable fingerprint of a list (so a new/edited list restarts the progress). */
export function vocabSig(items) {
    let h = 2166136261;
    for (const ch of items.join('\n').toLowerCase()) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return `${items.length}:${h.toString(36)}`;
}

export function vocabBatchSize(cefr) {
    return ['A0', 'A1'].includes(String(cefr || '').toUpperCase()) ? 6 : 8;
}

const uniqInts = (arr, max) => [...new Set((Array.isArray(arr) ? arr : []).map((x) => Math.floor(Number(x))).filter((n) => Number.isFinite(n) && n >= 0 && n < max))].sort((a, b) => a - b);

export function sanitizeVocabState(s) {
    if (!s || typeof s !== 'object' || typeof s.sig !== 'string') return null;
    const total = Math.max(0, Math.min(OWN_TIME_VOCAB_MAX_ITEMS, Math.floor(Number(s.total) || 0)));
    if (!total) return null;
    const covered = uniqInts(s.covered, total);
    return {
        sig: s.sig.slice(0, 40),
        total,
        cursor: Math.max(0, Math.min(total, Math.floor(Number(s.cursor) || 0))),
        covered,
        reviseCursor: covered.length ? Math.max(0, Math.floor(Number(s.reviseCursor) || 0)) % covered.length : 0,
        nextMode: s.nextMode === 'revise' ? 'revise' : 'new',
        free: s.free === true,
    };
}

export function freshVocabState(sig, total) {
    return { sig, total, cursor: 0, covered: [], reviseCursor: 0, nextMode: 'new', free: false };
}

/**
 * What the next set should be built from.
 * Returns { active:false } for short lists / free-topic mode, otherwise
 * { active:true, mode, exhausted, sig, total, idx[], words[], from, to, covered, state }.
 */
export function planVocab({ vocabText, state, cefr } = {}) {
    const items = parseVocabList(vocabText);
    if (items.length < OWN_TIME_VOCAB_MIN) return { active: false, items: items.length };
    const sig = vocabSig(items);
    let st = sanitizeVocabState(state);
    if (!st || st.sig !== sig) st = freshVocabState(sig, items.length);
    if (st.free) return { active: false, free: true, sig, total: items.length, state: st };
    const size = vocabBatchSize(cefr);
    let mode = st.nextMode === 'revise' && st.covered.length ? 'revise' : 'new';
    const base = { active: true, sig, total: items.length, covered: st.covered.length, state: st };
    let idx = [];
    if (mode === 'new') {
        if (st.cursor >= items.length) return { ...base, mode: 'new', exhausted: true, idx: [], words: [], from: items.length, to: items.length };
        for (let i = st.cursor; i < Math.min(items.length, st.cursor + size); i += 1) idx.push(i);
    } else {
        const n = Math.min(size, st.covered.length);
        for (let k = 0; k < n; k += 1) idx.push(st.covered[(st.reviseCursor + k) % st.covered.length]);
        idx.sort((a, b) => a - b);
    }
    return { ...base, mode, exhausted: false, idx, words: idx.map((i) => items[i]), from: idx[0] + 1, to: idx[idx.length - 1] + 1 };
}

/** What the browser needs (no word list beyond the batch). */
export function publicVocabPlan(plan) {
    if (!plan?.active) return null;
    return { sig: plan.sig, total: plan.total, mode: plan.mode, idx: plan.idx, from: plan.from, to: plan.to, covered: plan.covered, size: plan.idx.length, words: plan.words };
}

/** A finished set (plan from the lesson) moves the state on; nextMode comes from the student's feedback. */
export function advanceVocabState(prev, plan, nextMode) {
    if (!plan || typeof plan.sig !== 'string') return sanitizeVocabState(prev);
    const total = Math.max(0, Math.min(OWN_TIME_VOCAB_MAX_ITEMS, Math.floor(Number(plan.total) || 0)));
    if (!total) return sanitizeVocabState(prev);
    let st = sanitizeVocabState(prev);
    if (!st || st.sig !== plan.sig) st = freshVocabState(plan.sig.slice(0, 40), total);
    const idx = uniqInts(plan.idx, total).slice(0, 20);
    if (plan.mode === 'revise') {
        st.reviseCursor = st.covered.length ? (st.reviseCursor + idx.length) % st.covered.length : 0;
    } else if (idx.length) {
        st.covered = uniqInts([...st.covered, ...idx], total);
        st.cursor = Math.max(st.cursor, idx[idx.length - 1] + 1);
    }
    st.nextMode = nextMode === 'revise' && st.covered.length ? 'revise' : 'new';
    return st;
}

/** Prompt section for list mode. */
export function vocabPromptBlock(plan, { instrLangName = 'Polish', prevSet = null } = {}) {
    if (!plan?.active || plan.exhausted) return '';
    const words = plan.words.map((w) => `  - ${w}`).join('\n');
    const head = `VOCABULARY LIST MODE: the student imported a list of ${plan.total} items; this set covers items ${plan.from}–${plan.to}.`;
    if (plan.mode === 'revise') {
        const prev = prevSet && (prevSet.title || (prevSet.weak || []).length)
            ? `\nPrevious set: "${prevSet.title || ''}"${(prevSet.weak || []).length ? `; weak spots: ${prevSet.weak.join(' | ')}` : ''}.` : '';
        return `${head}
REVISION SET: these items were practised before — build ALL tasks around exactly these items, re-using them in NEW sentences and contexts (no new target vocabulary), and revisit the grammar structures of the previous set.${prev}
Items:
${words}
`;
    }
    return `${head}
NEW MATERIAL SET: build ALL tasks around exactly these items (use every one at least once across the set; do not take other new target words from outside this batch; the items may be shown with a Polish translation — practise the English word/phrase). Write coach-facing text in ${instrLangName}.
Items:
${words}
`;
}

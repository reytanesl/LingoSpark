/**
 * "In your own time" — "Sprawdzian za X dni" (test-prep plan). Server-only, pure helpers (no DB, no AI).
 *
 * The student pastes a word list (EN – PL, optionally in sections with headings, e.g. a two-column textbook
 * vocabulary page) and sets a test date. We build a day-by-day plan:
 *   - days 1…N-1: the list's sections split over the learning days (headings detected; equal chunks otherwise),
 *   - day N (the last day before the test): revision + "Próbny sprawdzian" (mock test). A 1-day plan: learn + mock.
 * Every set = up to TP_NEW_PER_SET new items of the current day + review of the previous day's not-yet-mastered
 * items + items from the "worek błędów" (mistake bag). Tasks move from recognition (matching, multiple choice)
 * to production (translation PL→EN, gap fill in sentences, word formation) within the day and across days.
 *
 * State (per profile, JSONB own_time_student_profiles.test_prep) stores indexes and small counters only:
 *   { v, sig, total, days, startDate, testDate, day, cursor:[per day], setNo, kinds:[mask per item],
 *     sess:[count], last:[setNo], bag:{ix:streak}, mock:null|{…}, active, finishedAt }
 *
 * RULES (documented for the teacher):
 *   - Mastered item = answered correctly in at least 2 DIFFERENT task types (matching, multiple choice,
 *     translation, gap fill, word formation) OR correctly in 2 different sets, and NOT in the mistake bag.
 *   - Mistake bag: a wrong answer puts the item in the bag (streak 0); each correct answer while in the bag
 *     adds 1; 2 correct answers in a row remove it; another wrong answer resets the streak to 0.
 */
export const TP_MAX_DAYS = 14;
export const TP_TEXT_MAX = 30000;
export const TP_MAX_ITEMS = 500;
export const TP_MIN_ITEMS = 10;
export const TP_NEW_PER_SET = 10;
export const TP_REVIEW_PER_SET = 5;
export const TP_BAG_PER_SET = 6;
export const TP_BAG_CLEAR_STREAK = 2;
export const TP_MOCK_QUESTIONS = 30;
/** Task types (bit flags) for the readiness rule. */
export const TP_KINDS = { match: 1, mc: 2, trans: 4, gap: 8, wf: 16 };
const KIND_NAMES = Object.keys(TP_KINDS);

/* ---------------------------------------------------------------- parsing */

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const isHeadingText = (s) => /\s·\s/.test(s) && s.length <= 90;
const mostlyUpper = (s) => {
    const letters = s.replace(/[^\p{L}]/gu, '');
    return letters.length >= 8 && letters.replace(/[^\p{Lu}]/gu, '').length / letters.length > 0.7;
};
/** Segments of a line split on 2+ spaces / tabs, with their start column. */
function segments(line) {
    const out = [];
    const re = /\S+(?: \S+)*/g; // runs separated by 2+ spaces
    let m;
    const l = line.replace(/\t/g, '    ');
    while ((m = re.exec(l))) out.push({ at: m.index, text: m[0] });
    return out;
}
/** Column starts shared by many lines (two-column textbook layout: EN PL EN PL). */
function detectColumns(lines) {
    const counts = new Map();
    for (const l of lines) for (const s of segments(l)) counts.set(s.at, (counts.get(s.at) || 0) + 1);
    const min = Math.max(3, Math.floor(lines.length * 0.08));
    const starts = [...counts.entries()].filter(([, c]) => c >= min).map(([a]) => a).sort((a, b) => a - b);
    const merged = [];
    for (const a of starts) if (!merged.length || a - merged[merged.length - 1] > 3) merged.push(a);
    return merged;
}
const SEP_RE = /\s+[-–—=:]\s+|\t+/;
/** Split "en – pl" (one item per line) style. */
function splitPair(line) {
    const m = line.match(SEP_RE);
    if (!m) return { en: clean(line), pl: '' };
    return { en: clean(line.slice(0, m.index)), pl: clean(line.slice(m.index + m[0].length)) };
}
function joinCell(a, b) {
    if (!a) return b;
    if (!b) return a;
    return `${a} ${b}`.replace(/\s+/g, ' ');
}
const contEnd = (s) => /[\/,(\-–]$/.test(String(s || '').trim());

/**
 * Parse a pasted list into items { en, pl, sec } and sections { name, title, from, to } (to exclusive).
 * Handles: one item per line ("word - tłumaczenie", tab, "=", ":"), and multi-column layouts
 * (columns separated by 2+ spaces, wrapped cells continued on the next lines). Headings: a short line
 * with " · " ("Shops & places · Sklepy i miejsca") or a line ending with ":" and no translation.
 */
export function parseTestPrepList(text) {
    const raw = String(text ?? '').replace(/\r/g, '').slice(0, TP_TEXT_MAX);
    const lines = raw.split('\n').map((l) => l.replace(/\t/g, '    '));
    const items = [];
    const sections = [];
    const seen = new Set();
    let sec = null;
    const startSection = (name) => {
        const [en0, pl0] = name.split(/\s·\s/);
        const cont = /\((cont\.?|ciąg dalszy|c\.d\.)\)\s*$/i;
        const en = clean(en0).replace(cont, '').trim();
        const pl = clean(pl0 || '').replace(cont, '').trim();
        if (sec && sec.name === en) return; // "Shopping · Robienie zakupów (cont.)" after a page break
        if (sec && sec.to === sec.from) sections.pop();
        sec = { name: en, pl, from: items.length, to: items.length };
        sections.push(sec);
    };
    const push = (en, pl) => {
        en = clean(en).replace(/\s*\/\s*$/, '');
        pl = clean(pl).replace(/,\s*$/, '');
        if (!en || en.length > 90) return;
        const k = `${en.toLowerCase()}|${pl.toLowerCase()}`;
        if (seen.has(k) || items.length >= TP_MAX_ITEMS) return;
        seen.add(k);
        if (!sec) startSection('');
        items.push({ en, pl, sec: sections.length - 1 });
        sec.to = items.length;
    };
    // 1) blocks of lines between headings; page headers/footers dropped
    const blocks = [];
    let block = { heading: null, lines: [] };
    for (const line of lines) {
        const txt = clean(line);
        if (!txt) continue;
        if (/\bpage \d+\s*\/\s*\d+$|\bstrona \d+/i.test(txt) || mostlyUpper(txt)) continue;
        const single = segments(line).length === 1;
        if (single && (isHeadingText(txt) || (/^[^\d].{1,60}:$/.test(txt) && !SEP_RE.test(txt)))) {
            blocks.push(block);
            block = { heading: txt.replace(/:$/, ''), lines: [] };
            continue;
        }
        block.lines.push(line);
    }
    blocks.push(block);
    // 2) per block: one item per line, or a multi-column layout with wrapped cells
    for (const b of blocks) {
        if (b.heading !== null) startSection(b.heading);
        const multiLines = b.lines.filter((l) => segments(l).length >= 2 && !SEP_RE.test(clean(l)));
        const multi = multiLines.length >= Math.max(1, b.lines.length * 0.4) && b.lines.some((l) => segments(l).length >= 3);
        if (!multi) {
            for (const l of b.lines) {
                const sg = segments(l);
                if (sg.length === 2 && !SEP_RE.test(clean(l))) push(sg[0].text, sg[1].text);
                else { const p = splitPair(clean(l)); push(p.en, p.pl); }
            }
            continue;
        }
        // column starts from the lines with 4 cells (most reliable), then the others
        const full = b.lines.map(segments).filter((sg) => sg.length >= 4);
        let cols;
        if (full.length) {
            cols = [0, 1, 2, 3].map((k) => Math.min(...full.map((sg) => sg[k].at)));
        } else {
            cols = detectColumns(b.lines);
        }
        const colOf = (at) => { let c = 0; for (let k = 0; k < cols.length; k += 1) if (cols[k] <= at + 2) c = k; return c; };
        const pairs = Math.max(1, Math.ceil(cols.length / 2));
        let rows = Array(pairs).fill(null); // open row per pair
        const order = []; // completed rows in reading order: left column first, then right (per block)
        const perPair = Array.from({ length: pairs }, () => []);
        // Sentence-like block (e.g. "Complaint letter": most entries start with a capital letter)?
        const firsts = b.lines.flatMap((l) => segments(l).filter((sg) => colOf(sg.at) % 2 === 0).map((sg) => sg.text));
        const sentenceMode = firsts.length >= 4 && firsts.filter((x) => /^\p{Lu}/u.test(x)).length >= firsts.length * 0.4;
        for (const l of b.lines) {
            const cells = [];
            for (const s of segments(l)) { const c = colOf(s.at); cells[c] = joinCell(cells[c] || '', s.text); }
            // Table rows wrap together: if any column pair on this line is clearly a continuation (a cell missing,
            // or the previous cell ended with "/" or ","), the whole line continues the open rows — also a pair
            // with both cells filled ("make informed / decisions", "podejmować świadome / decyzje").
            const cellsOf = (p) => [cells[p * 2] || '', cells[p * 2 + 1] || ''];
            // Per pair: 'cont' (surely continues), 'new' (surely a new entry), 'maybe'.
            const UP = /^\p{Lu}/u;
            const LOW = /^[\p{Ll}…]/u;
            const done = (x) => /[.!?…]$/.test(String(x || '').trim());
            const stateOf = (p) => {
                const [en, pl] = cellsOf(p);
                const prev = rows[p];
                if (!prev || (!en && !pl)) return 'new';
                if (!en || !pl) return 'wrap';
                // sentence-like entries ("I am writing to / complain about …"): capital = new, small letter = wrapped
                if (sentenceMode && UP.test(prev.en) && UP.test(en)) return 'new';
                if (sentenceMode && UP.test(prev.en) && LOW.test(en) && !done(prev.en)) return 'cont';
                if (/\b(a|an|the)$/i.test(prev.en.trim())) return 'cont'; // "pay money into an / account"
                if (contEnd(prev.en) || contEnd(prev.pl)) return 'cont';
                return 'maybe';
            };
            const states = Array.from({ length: pairs }, (_, p) => stateOf(p));
            // only a cell missing in one pair (a clear wrap) carries the other pairs of that line along
            const lineCont = states.includes('wrap');
            const isCont = (p) => states[p] === 'wrap' || states[p] === 'cont' || (lineCont && states[p] === 'maybe');
            for (let p = 0; p < pairs; p += 1) {
                const [en, pl] = cellsOf(p);
                if (!en && !pl) continue;
                const prev = rows[p];
                if (prev && isCont(p)) { prev.en = joinCell(prev.en, en); prev.pl = joinCell(prev.pl, pl); continue; }
                rows[p] = { en, pl };
                perPair[p].push(rows[p]);
            }
        }
        perPair.forEach((list) => list.forEach((r) => order.push(r)));
        order.forEach((r) => push(r.en, r.pl));
    }
    if (sec && sec.to === sec.from) sections.pop();
    const keep = sections.filter((s) => s.to > s.from);
    keep.forEach((s, i) => { for (let k = s.from; k < s.to; k += 1) items[k].sec = i; });
    return { items, sections: keep };
}

/** Accepted English answers of an item: "shopping centre / mall" → ["shopping centre", "mall"]. */
export function answerVariants(en) {
    const base = clean(String(en).replace(/\([^)]*\)/g, ' '));
    const parts = base.split(/\s*\/\s*/).map(clean).filter(Boolean);
    const out = [...new Set(parts.length ? parts : [base])];
    return out.length ? out : [clean(en)];
}

export function testPrepSig(items) {
    let h = 2166136261;
    for (const ch of items.map((x) => `${x.en}=${x.pl}`).join('\n').toLowerCase()) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return `${items.length}:${h.toString(36)}`;
}

/* ---------------------------------------------------------------- the day plan */

/**
 * Split the list into learning days. Units = sections (split in halves when there are fewer sections than days,
 * or a section is much bigger than a day); units go to days in order so that each day gets about total/days items.
 * Returns [{ day, from, to, sections:[name…], count }] — contiguous index ranges.
 */
export function splitLearningDays(items, sections, learnDays) {
    const n = items.length;
    const days = Math.max(1, Math.min(learnDays, n));
    let units = (sections && sections.length > 1 ? sections : [{ name: '', from: 0, to: n }]).map((s) => ({ from: s.from, to: s.to, name: s.pl || s.name }));
    const target = n / days;
    // Too few units, or units much bigger than a day: split the biggest in half.
    for (let guard = 0; guard < 200; guard += 1) {
        const big = units.reduce((b, u, i) => (u.to - u.from > (b < 0 ? 0 : units[b].to - units[b].from) ? i : b), -1);
        const size = units[big].to - units[big].from;
        if (units.length >= days && size <= target * 1.35) break;
        if (size < 2) break;
        const mid = units[big].from + Math.ceil(size / 2);
        units.splice(big, 1, { ...units[big], to: mid }, { ...units[big], from: mid });
    }
    // Contiguous grouping: close a day when its cumulative size passes the next ideal boundary.
    const out = [];
    let cur = null;
    let done = 0;
    units.forEach((u, i) => {
        if (!cur) cur = { from: u.from, to: u.from, names: [] };
        cur.to = u.to;
        if (u.name && !cur.names.includes(u.name)) cur.names.push(u.name);
        done += u.to - u.from;
        const left = units.length - i - 1;
        const daysLeft = days - out.length - 1;
        const boundary = target * (out.length + 1);
        if (daysLeft > 0 && (done >= boundary - (u.to - u.from) / 2 || left <= daysLeft - 1 + 0) && left >= daysLeft) {
            out.push(cur);
            cur = null;
        }
    });
    if (cur) out.push(cur);
    return out.map((d, i) => ({ day: i + 1, from: d.from, to: d.to, sections: d.names, count: d.to - d.from }));
}

const toDate = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
const fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10);
export function addDays(dateStr, n) { return fmtDate(toDate(dateStr) + n * 86400000); }
export function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }

/** Days of preparation from the test date ("sprawdzian 2026-11-04", today 2026-11-01 → 3 days) or the "za ile dni" number. */
export function resolveTestDate({ today, testDate, inDays }) {
    let days = Number.isFinite(Number(inDays)) && Number(inDays) > 0 ? Math.floor(Number(inDays)) : null;
    let date = toDate(testDate) ? testDate : null;
    if (date) days = daysBetween(today, date);
    if (!days || days < 1) return { ok: false, error: 'Data sprawdzianu musi być w przyszłości (1–14 dni).' };
    if (days > TP_MAX_DAYS) return { ok: false, error: `Plan obejmuje maksymalnie ${TP_MAX_DAYS} dni.` };
    return { ok: true, days, testDate: date || addDays(today, days) };
}

/** The whole plan: learning days + a final revision/mock-test day. */
export function buildTestPrepPlan(items, sections, days) {
    const d = Math.max(1, Math.min(TP_MAX_DAYS, Math.floor(days)));
    const learn = d === 1 ? 1 : d - 1;
    const learnDays = splitLearningDays(items, sections, learn);
    const plan = learnDays.map((x) => ({ ...x, kind: 'learn' }));
    if (d > 1) plan.push({ day: plan.length + 1, from: 0, to: items.length, sections: [], count: items.length, kind: 'revision' });
    else plan[0].kind = 'learn+mock';
    return plan;
}

/* ---------------------------------------------------------------- state */

export function freshTestPrepState({ items, sections, days, today, testDate }) {
    const plan = buildTestPrepPlan(items, sections, days);
    const n = items.length;
    return {
        v: 1, sig: testPrepSig(items), total: n, days: plan.length, startDate: today, testDate,
        day: 1, cursor: plan.map(() => 0), setNo: 0,
        kinds: Array(n).fill(0), sess: Array(n).fill(0), last: Array(n).fill(-1),
        bag: {}, mock: null, active: true, finishedAt: null,
        plan: plan.map((p) => ({ from: p.from, to: p.to, kind: p.kind, sections: p.sections.slice(0, 8) })),
    };
}

const intArr = (a, n, dflt) => Array.from({ length: n }, (_, i) => { const v = Math.floor(Number(Array.isArray(a) ? a[i] : NaN)); return Number.isFinite(v) ? v : dflt; });
export function sanitizeTestPrepState(s) {
    if (!s || typeof s !== 'object' || typeof s.sig !== 'string') return null;
    const total = Math.max(0, Math.min(TP_MAX_ITEMS, Math.floor(Number(s.total) || 0)));
    if (!total || !Array.isArray(s.plan) || !s.plan.length) return null;
    const plan = s.plan.slice(0, TP_MAX_DAYS).map((p) => ({
        from: Math.max(0, Math.min(total, Math.floor(Number(p.from) || 0))),
        to: Math.max(0, Math.min(total, Math.floor(Number(p.to) || 0))),
        kind: ['learn', 'revision', 'learn+mock'].includes(p.kind) ? p.kind : 'learn',
        sections: (Array.isArray(p.sections) ? p.sections : []).map((x) => String(x).slice(0, 60)).slice(0, 8),
    }));
    const bag = {};
    for (const [k, v] of Object.entries(s.bag && typeof s.bag === 'object' ? s.bag : {})) {
        const i = Math.floor(Number(k));
        if (i >= 0 && i < total) bag[i] = Math.max(0, Math.min(TP_BAG_CLEAR_STREAK, Math.floor(Number(v) || 0)));
    }
    return {
        v: 1, sig: s.sig.slice(0, 40), total, days: plan.length,
        startDate: String(s.startDate || '').slice(0, 10), testDate: String(s.testDate || '').slice(0, 10),
        day: Math.max(1, Math.min(plan.length, Math.floor(Number(s.day) || 1))),
        cursor: intArr(s.cursor, plan.length, 0).map((c, i) => Math.max(0, Math.min(plan[i].to - plan[i].from, c))),
        setNo: Math.max(0, Math.floor(Number(s.setNo) || 0)),
        kinds: intArr(s.kinds, total, 0).map((x) => x & 31), sess: intArr(s.sess, total, 0), last: intArr(s.last, total, -1),
        bag, mock: s.mock && typeof s.mock === 'object' ? sanitizeMock(s.mock) : null,
        active: s.active !== false, finishedAt: s.finishedAt ? String(s.finishedAt).slice(0, 30) : null, plan,
    };
}
function sanitizeMock(m) {
    return {
        score: Math.max(0, Math.floor(Number(m.score) || 0)), total: Math.max(0, Math.floor(Number(m.total) || 0)),
        at: String(m.at || '').slice(0, 30),
        weak: (Array.isArray(m.weak) ? m.weak : []).slice(0, 5).map((w) => ({ name: String(w?.name || '').slice(0, 60), ok: Math.floor(Number(w?.ok) || 0), total: Math.floor(Number(w?.total) || 0) })),
    };
}

const bits = (x) => { let c = 0; for (let v = x; v; v &= v - 1) c += 1; return c; };
/** Readiness rule (see the header): 2 different task types OR 2 different sets, and not in the mistake bag. */
export function isMastered(st, i) {
    if (st.bag[i] !== undefined) return false;
    return bits(st.kinds[i]) >= 2 || st.sess[i] >= 2;
}
export function masteredCount(st) {
    let c = 0;
    for (let i = 0; i < st.total; i += 1) if (isMastered(st, i)) c += 1;
    return c;
}

/** The day the student is on: the stored day, moved forward by the calendar (never past the last day). */
export function currentDay(st, today) {
    const cal = st.startDate && today ? daysBetween(st.startDate, today) + 1 : 1;
    return Math.max(1, Math.min(st.days, Math.max(st.day, cal)));
}
export function planStatus(st, today) {
    if (!st || !st.active) return 'off';
    if (st.testDate && today && daysBetween(today, st.testDate) < 0) return 'expired';
    if (st.finishedAt) return 'finished';
    return 'active';
}

/* ---------------------------------------------------------------- next set */

function rotatePick(list, n, offset) {
    if (!list.length) return [];
    const out = [];
    for (let k = 0; k < Math.min(n, list.length); k += 1) out.push(list[(offset + k) % list.length]);
    return out;
}

/**
 * What the next set is built from.
 * kind: 'learn' (new items of the day), 'review' (day's items introduced, no new left), 'revision' (last day),
 *       'mock-ready' (last day / 1-day plan finished: the mock test is next).
 * stage 0…3 = recognition → production (0: day 1 first half, 1: day 1 second half, 2: later learning days, 3: revision).
 */
export function nextSetPlan(st, today) {
    const day = currentDay(st, today);
    const p = st.plan[day - 1];
    const bagIdx = Object.keys(st.bag).map(Number).sort((a, b) => (st.last[a] - st.last[b]) || a - b).slice(0, TP_BAG_PER_SET);
    const inBag = new Set(bagIdx);
    const notMastered = (from, to) => { const r = []; for (let i = from; i < to; i += 1) if (!isMastered(st, i) && !inBag.has(i)) r.push(i); return r; };
    if (p.kind === 'revision') {
        const pool = notMastered(0, st.total).sort((a, b) => (st.sess[a] - st.sess[b]) || (st.last[a] - st.last[b]) || a - b);
        const review = pool.slice(0, TP_NEW_PER_SET + TP_REVIEW_PER_SET - bagIdx.length);
        return { kind: review.length || bagIdx.length ? 'revision' : 'mock-ready', day, stage: 3, newIdx: [], reviewIdx: review, bagIdx, mockAvailable: true };
    }
    const size = p.to - p.from;
    const cur = st.cursor[day - 1];
    // New items: the earliest learning day (up to today) that still has items not introduced yet —
    // a skipped day is caught up first instead of being lost.
    let newDay = day;
    for (let k = 1; k <= day; k += 1) {
        const q = st.plan[k - 1];
        if (q.kind !== 'revision' && st.cursor[k - 1] < q.to - q.from) { newDay = k; break; }
    }
    const np = st.plan[newDay - 1];
    const ncur = st.cursor[newDay - 1];
    const newIdx = [];
    for (let i = np.from + ncur; i < Math.min(np.to, np.from + ncur + TP_NEW_PER_SET); i += 1) newIdx.push(i);
    let reviewIdx = [];
    if (day > 1) {
        const prev = st.plan[day - 2];
        reviewIdx = rotatePick(notMastered(prev.from, prev.to), TP_REVIEW_PER_SET, st.setNo * TP_REVIEW_PER_SET);
    }
    const stage = day === 1 ? (cur < size / 2 ? 0 : 1) : 2;
    if (newIdx.length) return { kind: 'learn', day, newDay, stage, newIdx, reviewIdx, bagIdx, mockAvailable: false };
    // everything of today introduced: review today's not-mastered items (+ previous day + bag)
    const today2 = rotatePick(notMastered(p.from, p.to), TP_NEW_PER_SET, st.setNo * 3);
    const mockAvailable = p.kind === 'learn+mock';
    if (!today2.length && !reviewIdx.length && !bagIdx.length) return { kind: mockAvailable ? 'mock-ready' : 'day-done', day, stage: Math.max(stage, 1), newIdx: [], reviewIdx: [], bagIdx, mockAvailable, dayDone: true };
    return { kind: 'review', day, stage: Math.max(stage, 1), newIdx: [], reviewIdx: [...today2, ...reviewIdx].slice(0, TP_NEW_PER_SET + TP_REVIEW_PER_SET), bagIdx, mockAvailable, dayDone: true };
}

/* ---------------------------------------------------------------- tasks */

function rng(seedText) {
    let seed = 2166136261;
    for (const ch of String(seedText)) seed = Math.imul(seed ^ ch.codePointAt(0), 16777619) >>> 0;
    return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function shuffled(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
/** MC options: the answer + distractors (same section first), shuffled; the key never in the same slot twice in a row. */
function mcOptions(items, ix, field, k, r, prevPos) {
    const it = items[ix];
    const answer = field === 'en' ? it.en : it.pl;
    const same = items.map((x, i) => i).filter((i) => i !== ix && items[i].sec === it.sec && items[i][field] && items[i][field] !== answer);
    const other = items.map((x, i) => i).filter((i) => i !== ix && items[i].sec !== it.sec && items[i][field] && items[i][field] !== answer);
    const picks = [...shuffled(same, r), ...shuffled(other, r)].map((i) => items[i][field]);
    const opts = [...new Set(picks)].filter((o) => o.toLowerCase() !== answer.toLowerCase()).slice(0, k - 1);
    const slots = [...Array(opts.length + 1).keys()].filter((s) => s !== prevPos.v);
    const pos = slots[Math.floor(r() * slots.length)];
    prevPos.v = pos;
    opts.splice(pos, 0, answer);
    return { options: opts, answer };
}

const STEPS = {
    match: ['Przeczytaj angielskie słowo.', 'Wybierz jego polskie znaczenie.', 'Kliknij „Sprawdź”.'],
    mc: ['Przeczytaj polskie słowo lub zwrot.', 'Wybierz właściwy angielski odpowiednik.', 'Kliknij „Sprawdź”.'],
    trans: ['Przeczytaj polskie słowo.', 'Wpisz je po angielsku — pisownia się liczy.', 'Kliknij „Sprawdź” i popraw błędy.'],
    gap: ['Przeczytaj całe zdanie.', 'Wpisz brakujące słowo lub zwrot.', 'Kliknij „Sprawdź”.'],
    wf: ['Przeczytaj zdanie.', 'Przekształć wyraz z nawiasu — zawsze zmień jego formę.', 'Kliknij „Sprawdź”.'],
};

/**
 * Which cue a gap fill gets by level (no word boxes):
 * A0–B1 = open cloze (type the missing word); B2/C1 = Polish fragment in brackets (CKE translation).
 */
export function gapCueMode(cefr) {
    const c = String(cefr || 'B1').toUpperCase();
    if (['B2', 'C1'].includes(c)) return 'pl';
    return 'open';
}
const EXAM_BY_CEFR = { A2: 'E8', B1: 'MP', B2: 'MR', C1: 'MD' };

/** Carrier sentences used when no AI sentence is available (OWN_TIME_MOCK and AI failures). */
export function fallbackSentence(item, n = 0) {
    const en = answerVariants(item.en)[0];
    const verb = /^to\s/i.test(en) || /\b(sb|sth)\b/.test(item.en) || /czasownik|phrasal/i.test(item.secName || '');
    if (verb) return ['Yesterday my mum told me ___ when we were in town.', 'It is a good idea ___ before you buy anything.', 'My friend decided ___ last weekend.'][n % 3];
    return ['We talked about the ___ in our English lesson.', 'My cousin told me a story about a ___ .', 'I wrote ___ on my shopping list.', 'There was a sign about a ___ in the window.'][n % 4];
}

/** Word-formation pairs inside the list: two single-word items of one word family (shared stem of 5+ letters). */
export function wordFormationPairs(items) {
    const singles = items.map((it, i) => ({ i, w: answerVariants(it.en)[0].toLowerCase() })).filter((x) => /^[a-z]{4,}$/.test(x.w));
    const out = [];
    for (const a of singles) {
        for (const b of singles) {
            if (a.i === b.i || a.w === b.w) continue;
            let k = 0;
            while (k < a.w.length && k < b.w.length && a.w[k] === b.w[k]) k += 1;
            if (k >= 5 && k >= Math.min(a.w.length, b.w.length) - 4 && b.w.length > a.w.length) out.push({ ix: b.i, root: a.w.toUpperCase(), answer: b.w });
        }
    }
    return out.sort((a, b) => a.root.length - b.root.length);
}

function sentenceFor(items, ix, sentences, n) {
    const s = sentences && sentences[ix];
    if (s && /_{3,}/.test(s)) return s;
    return fallbackSentence(items[ix], n);
}

/** Build one task of a given kind from item indexes. */
function makeTask(kind, idx, items, ctx) {
    const { cefr, r, prevPos, sentences, label } = ctx;
    const k = ['B2', 'C1'].includes(cefr) ? 4 : 3;
    const exam = EXAM_BY_CEFR[cefr] || null;
    const base = { n: 0, steps: STEPS[kind], example: '', usefulLanguage: [], hint: '', target: null, prompt: '', modelAnswers: [], tp: { kind, label } };
    const tag = (it, ix) => ({ ...it, ix });
    if (kind === 'match') {
        return { ...base, type: 'uoe', format: 'mc_sentences', exam, instruction: 'Dopasuj: wybierz polskie znaczenie każdego angielskiego słowa lub zwrotu.',
            items: idx.map((ix) => { const o = mcOptions(items, ix, 'pl', k, r, prevPos); return tag({ q: items[ix].en, options: o.options, answer: o.answer }, ix); }) };
    }
    if (kind === 'mc') {
        return { ...base, type: 'uoe', format: 'mc_translation', exam, instruction: 'Wybierz angielski odpowiednik polskiego słowa lub zwrotu.',
            items: idx.map((ix) => { const o = mcOptions(items, ix, 'en', k, r, prevPos); return tag({ q: `${items[ix].pl} → ___`, options: o.options, answer: o.answer }, ix); }) };
    }
    if (kind === 'trans') {
        return { ...base, type: 'vocab_drill', instruction: 'Przetłumacz na angielski (PL → EN). Pisownia się liczy.',
            items: idx.map((ix) => { const v = answerVariants(items[ix].en); return tag({ q: items[ix].pl, answer: v[0], alts: [...v.slice(1), items[ix].en].filter((x, i, a) => a.indexOf(x) === i && x !== v[0]) }, ix); }) };
    }
    if (kind === 'gap') {
        const mode = gapCueMode(cefr);
        const its = idx.map((ix, n) => { const v = answerVariants(items[ix].en); return tag({ q: sentenceFor(items, ix, sentences, n), answer: v[0], alts: v.slice(1), ...(mode === 'pl' ? { pl: items[ix].pl } : {}) }, ix); });
        if (mode === 'pl') {
            return { ...base, type: 'uoe', format: 'translation', exam, instruction: 'Przetłumacz na język angielski fragmenty podane w nawiasach, tak aby otrzymać logiczne i gramatycznie poprawne zdania. Wymagana jest pełna poprawność ortograficzna wpisywanych fragmentów.', items: its };
        }
        return { ...base, type: 'vocab_drill', instruction: 'Uzupełnij zdania.', items: its };
    }
    if (kind === 'wf') {
        const its = idx.map((w, n) => tag({ q: (sentences && sentences[w.ix]) && /_{3,}/.test(sentences[w.ix]) ? sentences[w.ix] : ['The shop assistant gave us a clear ___ .', 'Everybody was talking about the ___ .', 'We were surprised by the ___ .'][n % 3], cue: w.root, answer: w.answer }, w.ix));
        return { ...base, type: 'uoe', format: 'word_formation', exam, instruction: 'Uzupełnij każdą lukę, przekształcając wyraz podany w nawiasie (zawsze zmień jego formę). W każdą lukę możesz wpisać tylko jeden wyraz.', items: its };
    }
    return null;
}

/**
 * Recipes per stage (recognition → production). Pools: n1/n2 = halves of the new items, r1/r2/r3 = thirds of the
 * review + mistake-bag items, all = everything (for the review-only sets). Each task ≤ MAX_PER_TASK items (one screen).
 */
const RECIPES = {
    0: [['match', 'n1', 'r1'], ['match', 'n2', 'r2'], ['mc', 'n1', 'r3'], ['mc', 'n2'], ['trans', 'n1'], ['gap', 'n2']],
    1: [['mc', 'n1', 'r1'], ['match', 'n2', 'r2'], ['trans', 'n1', 'r3'], ['gap', 'n2'], ['trans', 'n2'], ['gap', 'n1']],
    2: [['mc', 'n1', 'n2'], ['trans', 'n1', 'r1'], ['gap', 'n2', 'r2'], ['wf'], ['trans', 'n2', 'r3'], ['gap', 'n1']],
    3: [['mc', 'r1'], ['trans', 'r2'], ['gap', 'r3'], ['wf'], ['trans', 'r1'], ['gap', 'r2'], ['trans', 'r3']],
};
const MAX_PER_TASK = 6; // one screen also on a phone (375×812)
const MAX_PER_MC_TASK = 5; // A–D options take more room
// matching shows long Polish options; open cloze (A0–B1) stays compact on one phone screen
const capFor = (kind, cefr = 'B2') => {
    if (kind === 'match') return MAX_PER_MC_TASK - 1;
    if (kind === 'mc') return MAX_PER_MC_TASK;
    if (kind === 'gap' && gapCueMode(cefr) !== 'pl') return MAX_PER_TASK - 2;
    return MAX_PER_TASK;
};
const uniqByIx = (arr) => arr.filter((w, i, a) => a.findIndex((x) => x.ix === w.ix) === i);

/**
 * Lesson (same shape as the AI lessons, so the existing task renderer shows it) for a set plan.
 * Every new item appears in recognition AND production tasks; review / mistake-bag items are mixed in.
 */
export function buildTestPrepLesson(st, items, setPlan, { cefr = 'B1', sentences = null, seed = '' } = {}) {
    const c = String(cefr || 'B1').toUpperCase();
    const r = rng(`${st.sig}|${st.setNo}|${seed}`);
    const prevPos = { v: -1 };
    const learn = setPlan.newIdx.slice(0, 2 * MAX_PER_TASK);
    const review = [...setPlan.bagIdx, ...setPlan.reviewIdx.filter((i) => !setPlan.bagIdx.includes(i))].slice(0, 24);
    const all = [...learn, ...review];
    const half = Math.ceil(learn.length / 2);
    const third = Math.ceil(review.length / 3);
    const pools = { n1: learn.slice(0, half), n2: learn.slice(half), r1: review.slice(0, third), r2: review.slice(third, 2 * third), r3: review.slice(2 * third) };
    if (!learn.length) { pools.n1 = pools.r1; pools.n2 = pools.r2; }
    const wfAll = uniqByIx(wordFormationPairs(items));
    const wfHere = wfAll.filter((w) => all.includes(w.ix));
    const wf = uniqByIx([...wfHere, ...shuffled(wfAll.filter((w) => !all.includes(w.ix)), r)]).slice(0, 4);
    const recipe = RECIPES[setPlan.stage] || RECIPES[2];
    const tasks = [];
    for (const [kind, ...poolNames] of recipe) {
        if (kind === 'wf') { if (wf.length >= 2) tasks.push(makeTask('wf', wf, items, { cefr: c, r, prevPos, sentences })); continue; }
        const idx = [...new Set(poolNames.flatMap((n) => pools[n] || []))].slice(0, capFor(kind, c));
        if (idx.length >= 2 || (idx.length && all.length < 4)) tasks.push(makeTask(kind, idx, items, { cefr: c, r, prevPos, sentences }));
    }
    // Every new item needs a production task: items cut by a task cap go into a translation task with room.
    const prodSeen = new Set(tasks.filter((t) => ['trans', 'gap', 'wf'].includes(t.tp.kind)).flatMap((t) => t.items.map((it) => it.ix)));
    const missing = learn.filter((ix) => !prodSeen.has(ix));
    if (missing.length) {
        const room = tasks.find((t) => t.tp.kind === 'trans' && t.items.length + missing.length <= MAX_PER_TASK);
        const extra = makeTask('trans', missing, items, { cefr: c, r, prevPos, sentences });
        if (room) room.items.push(...extra.items); else tasks.push(extra);
    }
    tasks.forEach((t, i) => { t.n = i + 1; });
    const day = setPlan.day;
    const dayPlan = st.plan[(setPlan.newDay || day) - 1];
    const secNames = dayPlan.sections.slice(0, 2).join(', ') + (dayPlan.sections.length > 2 ? '…' : '');
    const title = setPlan.kind === 'learn'
        ? `Dzień ${setPlan.newDay || day}/${st.days}: nowe słówka ${setPlan.newIdx[0] - dayPlan.from + 1}–${setPlan.newIdx[setPlan.newIdx.length - 1] - dayPlan.from + 1} z ${dayPlan.to - dayPlan.from}${secNames ? ` (${secNames})` : ''}`
        : setPlan.kind === 'revision' ? `Dzień ${day}/${st.days}: powtórka przed sprawdzianem` : `Dzień ${day}/${st.days}: powtórka dnia`;
    return {
        title: title.slice(0, 120), cefr: c, instrLang: 'pl', focus: 'Sprawdzian', goal: '', coachNote: '', taskCountOk: true, tasks,
        testPrep: { day, newDay: setPlan.newDay || day, days: st.days, kind: setPlan.kind, stage: setPlan.stage, setNo: st.setNo + 1, newIdx: setPlan.newIdx, reviewIdx: setPlan.reviewIdx, bagIdx: setPlan.bagIdx },
    };
}

/* ---------------------------------------------------------------- mock test */

/**
 * "Próbny sprawdzian": a teacher-style test from the WHOLE list — every section represented, half of the questions
 * from not-yet-mastered / mistake-bag items. Sections: A matching (EN→PL), B multiple choice (PL→EN),
 * C translation (PL→EN), D gap fill in sentences, E word formation (if the list has word families). No hints,
 * scored at the end.
 */
export function buildMockTest(st, items, sections, { cefr = 'B1', sentences = null, seed = '' } = {}) {
    const c = String(cefr || 'B1').toUpperCase();
    const r = rng(`${st.sig}|mock|${st.setNo}|${seed}`);
    const prevPos = { v: -1 };
    const weak = new Set([...Object.keys(st.bag).map(Number), ...items.map((x, i) => i).filter((i) => !isMastered(st, i))]);
    // stratified draw: round-robin over sections, weak items first within a section
    const bySec = (sections.length ? sections : [{ from: 0, to: items.length }]).map((s) => {
        const ids = []; for (let i = s.from; i < s.to; i += 1) ids.push(i);
        const sh = shuffled(ids, r);
        return [...sh.filter((i) => weak.has(i)), ...sh.filter((i) => !weak.has(i))];
    });
    const wfAll = uniqByIx(shuffled(wordFormationPairs(items), r)).slice(0, 4);
    const wfSet = new Set(wfAll.map((w) => w.ix));
    const want = TP_MOCK_QUESTIONS - wfAll.length;
    const picked = [];
    for (let round = 0; picked.length < want && round < 200; round += 1) {
        let added = false;
        for (const q of bySec) { const i = q.shift(); if (i !== undefined && !wfSet.has(i)) { picked.push(i); added = true; } if (picked.length >= want) break; }
        if (!added) break;
    }
    const sh = shuffled(picked, r);
    const cut = (a, b) => sh.slice(Math.round(sh.length * a), Math.round(sh.length * b));
    const parts = [
        ['match', cut(0, 0.2), 'A'], ['mc', cut(0.2, 0.42), 'B'], ['trans', cut(0.42, 0.7), 'C'], ['gap', cut(0.7, 1), 'D'],
    ];
    const tasks = [];
    for (const [kind, idx, letter] of parts) {
        // each task fits one screen: at most MAX_PER_TASK items
        // even chunks (7 → 4 + 3, not 6 + 1), each fits one screen
        const chunks = Math.ceil(idx.length / capFor(kind, c));
        const size = Math.ceil(idx.length / Math.max(1, chunks));
        for (let k = 0; k < idx.length; k += size) {
            const tsk = makeTask(kind, idx.slice(k, k + size), items, { cefr: c, r, prevPos, sentences });
            tsk.mockSection = letter;
            tasks.push(tsk);
        }
    }
    if (wfAll.length >= 2) { const tsk = makeTask('wf', wfAll, items, { cefr: c, r, prevPos, sentences }); tsk.mockSection = 'E'; tasks.push(tsk); }
    tasks.forEach((t, i) => { t.n = i + 1; t.steps = []; t.hint = ''; });
    const total = tasks.reduce((s, t) => s + t.items.length, 0);
    return {
        title: `Próbny sprawdzian — ${total} pytań z całej listy`, cefr: c, instrLang: 'pl', focus: 'Próbny sprawdzian', goal: '', coachNote: '', taskCountOk: true, tasks,
        mockTest: true, testPrep: { day: st.days, days: st.days, kind: 'mock', stage: 3, setNo: st.setNo + 1, newIdx: [], reviewIdx: [], bagIdx: [] },
    };
}

/** Score + the weakest categories (sections) of a finished mock test. results: [{ix, ok}] */
export function mockSummary(items, sections, results) {
    const per = new Map();
    let ok = 0;
    for (const r of results) {
        const it = items[r.ix];
        if (!it) continue;
        if (r.ok) ok += 1;
        const s = sections[it.sec] || { name: 'Lista' };
        const key = s.name || 'Lista';
        const cur = per.get(key) || { name: key, pl: s.pl || '', ok: 0, total: 0 };
        cur.total += 1; if (r.ok) cur.ok += 1;
        per.set(key, cur);
    }
    const total = results.filter((r) => items[r.ix]).length;
    const cats = [...per.values()];
    const weak = cats.filter((x) => x.ok < x.total).sort((a, b) => (a.ok / a.total - b.ok / b.total) || (b.total - a.total)).slice(0, 3);
    return { score: ok, total, pct: total ? Math.round((ok / total) * 100) : 0, categories: cats, weak };
}

/* ---------------------------------------------------------------- results → state */

/**
 * A finished set (or the mock test) moves the state on.
 * results: [{ ix, kind: 'match'|'mc'|'trans'|'gap'|'wf', ok }]; meta: lesson.testPrep.
 */
export function applyTestPrepResults(prev, meta, results, { today = null, mock = null } = {}) {
    const st = sanitizeTestPrepState(prev);
    if (!st || !meta) return st;
    const setNo = st.setNo + 1;
    st.setNo = setNo;
    const okInSet = new Map();
    for (const r of Array.isArray(results) ? results : []) {
        const i = Math.floor(Number(r?.ix));
        if (!(i >= 0 && i < st.total)) continue;
        const kindBit = TP_KINDS[r.kind] || 0;
        if (r.ok) {
            st.kinds[i] |= kindBit;
            if (!okInSet.has(i)) okInSet.set(i, true);
            if (st.bag[i] !== undefined) {
                st.bag[i] += 1;
                if (st.bag[i] >= TP_BAG_CLEAR_STREAK) delete st.bag[i];
            }
        } else {
            okInSet.set(i, false);
            st.bag[i] = 0;
        }
        st.last[i] = setNo;
    }
    for (const [i, good] of okInSet) if (good) st.sess[i] += 1;
    if (meta.kind === 'learn' && Array.isArray(meta.newIdx) && meta.newIdx.length) {
        const d = Math.max(1, Math.min(st.days, Math.floor(Number(meta.newDay ?? meta.day) || 1)));
        const p = st.plan[d - 1];
        const end = Math.max(...meta.newIdx.map(Number)) + 1;
        st.cursor[d - 1] = Math.max(st.cursor[d - 1], Math.min(p.to, end) - p.from);
    }
    if (meta.kind === 'mock' && mock) {
        st.mock = sanitizeMock({ ...mock, at: new Date().toISOString() });
        st.finishedAt = st.finishedAt || new Date().toISOString();
    }
    return st;
}

/** Move to the next day early (the day's new items are all done). */
export function advanceDay(prev, today) {
    const st = sanitizeTestPrepState(prev);
    if (!st) return st;
    st.day = Math.min(st.days, currentDay(st, today) + 1);
    return st;
}

/* ---------------------------------------------------------------- what the browser sees */

export function publicTestPrep(st, items, sections, today) {
    if (!st) return null;
    const day = currentDay(st, today);
    const status = planStatus(st, today);
    const next = status === 'active' ? nextSetPlan(st, today) : null;
    return {
        status, day, days: st.days, startDate: st.startDate, testDate: st.testDate, total: st.total,
        daysLeft: st.testDate && today ? daysBetween(today, st.testDate) : null,
        mastered: masteredCount(st), bag: Object.keys(st.bag).length,
        plan: st.plan.map((p, i) => ({
            day: i + 1, kind: p.kind, count: p.to - p.from, done: p.kind === 'revision' ? null : st.cursor[i],
            sections: p.sections,
            mastered: p.kind === 'revision' ? null : (() => { let c = 0; for (let k = p.from; k < p.to; k += 1) if (isMastered(st, k)) c += 1; return c; })(),
        })),
        next: next ? { kind: next.kind, stage: next.stage, newCount: next.newIdx.length, reviewCount: next.reviewIdx.length, bagCount: next.bagIdx.length, dayDone: !!next.dayDone, mockAvailable: !!next.mockAvailable } : null,
        mock: st.mock,
        bagWords: Object.keys(st.bag).slice(0, 12).map((i) => items[i]?.en).filter(Boolean),
    };
}

/* ---------------------------------------------------------------- AI sentences (optional) */

/** One short AI call per set: a natural sentence per item with the item replaced by ___ (production tasks). */
export function buildSentencePrompt(items, idx, cefr) {
    const list = idx.map((i) => `${i}: ${items[i].en} (${items[i].pl})`).join('\n');
    return `You write example sentences for a Polish student's vocabulary test practice (level ${cefr}, exam: ${({ A2: 'egzamin ósmoklasisty', B1: 'matura podstawowa', B2: 'matura rozszerzona', C1: 'matura dwujęzyczna' })[cefr] || 'school test'}).
For EACH item below write ONE natural English sentence (8–16 words) that uses the English item (first variant if there is a "/"), then replace exactly that word/phrase with ___ (three underscores). The sentence must make the missing item clear from context. Use the item EXACTLY as given (no -s/-ed/-ing changes; drop "sb/sth" placeholders by putting a real object after the gap), so the given form is the correct answer.
Items (index: English (Polish)):
${list}
Return JSON only: {"sentences":[{"ix":<index>,"sentence":"... ___ ..."}]}`;
}
export function parseSentenceReply(reply, idx) {
    const out = {};
    const allowed = new Set(idx);
    for (const s of (reply && Array.isArray(reply.sentences) ? reply.sentences : [])) {
        const i = Math.floor(Number(s?.ix));
        const txt = clean(s?.sentence).slice(0, 220);
        if (allowed.has(i) && (txt.match(/_{3,}/g) || []).length === 1) out[i] = txt;
    }
    return out;
}

/* ---------------------------------------------------------------- endpoint core (pure; server.js does DB + AI) */

/** Today as YYYY-MM-DD: the browser's local date when it is sane (±1 day of the server's), else the server's UTC date. */
export function resolveToday(clientToday, now = Date.now()) {
    const server = fmtDate(now);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(clientToday || '')) && Math.abs(daysBetween(server, clientToday)) <= 1) return clientToday;
    return server;
}

/** Bag-only drill ("Ćwicz błędy" after the mock test, or from the bag indicator). */
export function bagSetPlan(st, today) {
    const bagIdx = Object.keys(st.bag).map(Number).sort((a, b) => a - b).slice(0, 2 * MAX_PER_TASK);
    return { kind: 'bag', day: currentDay(st, today), stage: 2, newIdx: [], reviewIdx: [], bagIdx };
}

/**
 * Everything the test-prep endpoints need, without I/O.
 *   action 'status' | 'setup' | 'off' | 'next-day' | 'set' | 'result'
 * Returns { state, save: bool, json } and, for 'set', { sentenceIdx, finish(sentences) → json } so the server
 * can ask the AI for gap sentences first (mock mode / failures: finish(null) → template sentences).
 */
export function testPrepAction({ action, body = {}, profile = {}, state = null, today }) {
    const parsed = parseTestPrepList(profile.vocab || '');
    const { items, sections } = parsed;
    const cefr = String(profile.cefr || 'B1').toUpperCase();
    let st = state && state.sig === testPrepSig(items) ? state : null;
    const pub = (s) => publicTestPrep(s, items, sections, today);
    if (action === 'status') return { state: st, save: false, json: { testPrep: pub(st) } };
    if (action === 'off') return { state: null, save: true, json: { testPrep: null } };
    if (action === 'setup') {
        if (items.length < TP_MIN_ITEMS) return { error: `Wklej listę słówek (co najmniej ${TP_MIN_ITEMS}) w ustawieniach profilu.`, status: 400 };
        const withPl = items.filter((x) => x.pl).length;
        if (withPl < items.length * 0.6) return { error: 'Do planu potrzebna jest lista z tłumaczeniami (np. „słowo – tłumaczenie”).', status: 400 };
        const d = resolveTestDate({ today, testDate: body.testDate, inDays: body.inDays });
        if (!d.ok) return { error: d.error, status: 400 };
        st = freshTestPrepState({ items, sections, days: d.days, today, testDate: d.testDate });
        return { state: st, save: true, json: { testPrep: pub(st) } };
    }
    if (!st) return { error: 'Brak planu przygotowania do sprawdzianu.', status: 404 };
    if (action === 'next-day') { st = advanceDay(st, today); return { state: st, save: true, json: { testPrep: pub(st) } }; }
    if (action === 'set') {
        const want = String(body.mode || 'next');
        let lessonOf;
        let sentenceIdx = [];
        if (want === 'mock') {
            const probe = buildMockTest(st, items, sections, { cefr });
            sentenceIdx = probe.tasks.filter((t) => t.tp.kind === 'gap' || t.tp.kind === 'wf').flatMap((t) => t.items.map((it) => it.ix));
            lessonOf = (sentences) => buildMockTest(st, items, sections, { cefr, sentences });
        } else {
            const sp = want === 'bag' ? bagSetPlan(st, today) : nextSetPlan(st, today);
            if (want === 'bag' && !sp.bagIdx.length) return { error: 'Worek błędów jest pusty.', status: 400 };
            if (sp.kind === 'mock-ready' || sp.kind === 'day-done') return { state: st, save: false, json: { testPrep: pub(st), next: sp.kind } };
            const probe = buildTestPrepLesson(st, items, sp, { cefr });
            sentenceIdx = probe.tasks.filter((t) => t.tp.kind === 'gap' || t.tp.kind === 'wf').flatMap((t) => t.items.map((it) => it.ix));
            lessonOf = (sentences) => buildTestPrepLesson(st, items, sp, { cefr, sentences });
        }
        return {
            state: st, save: false, sentenceIdx: [...new Set(sentenceIdx)],
            sentencePrompt: buildSentencePrompt(items, [...new Set(sentenceIdx)], cefr),
            finish: (sentences) => ({ lesson: lessonOf(sentences || null), testPrep: pub(st) }),
        };
    }
    if (action === 'result') {
        const meta = body.meta && typeof body.meta === 'object' ? body.meta : null;
        const results = (Array.isArray(body.results) ? body.results : []).slice(0, 200)
            .map((r) => ({ ix: Math.floor(Number(r?.ix)), kind: KIND_NAMES.includes(r?.kind) ? r.kind : '', ok: !!r?.ok }))
            .filter((r) => r.ix >= 0 && r.ix < st.total);
        if (!meta) return { error: 'Missing set info.', status: 400 };
        let summary = null;
        if (meta.kind === 'mock') summary = mockSummary(items, sections, results);
        st = applyTestPrepResults(st, { ...meta, newIdx: (Array.isArray(meta.newIdx) ? meta.newIdx : []).map(Number).filter((i) => i >= 0 && i < st.total) }, results, { today, mock: summary });
        return { state: st, save: true, json: { testPrep: pub(st), ...(summary ? { mockResult: summary } : {}) } };
    }
    return { error: 'Unknown action.', status: 400 };
}

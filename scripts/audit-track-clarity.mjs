/* Read-only audit of the Track question bank (task clarity).
     node scripts/audit-track-clarity.mjs            -> uses DATABASE_URL if set (SELECT only, nothing is written), else a built-in SAMPLE
     node scripts/audit-track-clarity.mjs --sample   -> force the sample
   It applies the same read-time checks the serve path uses (broken setup, generic gap, copy task, too-hard A1/A2 text, slash lists,
   unclear verdicts already stored by the AI judge) and reports counts by reason plus real examples.
   The AI judge itself runs inside the server (prewarm worker + after served requests); its stored verdicts are summarised here
   (clarity.verdict / issues / widened) when the rows already carry them. */
import {
    taskStructureReason, copyTaskReason, genericGapReason, demonstrativeGapReason, simpleVocabReason, displayedSlashReason,
    clarityBlocked, BANK_COMPATIBLE_VERSIONS, decorateItem, collapseChoiceItem, norm,
} from '../track-ai.js';

const forceSample = process.argv.includes('--sample');

export function reasonsFor(item, level, term) {
    const out = [];
    if (!item) return out;
    let it = { ...item };
    if (it.type === 'meaningPick' || it.type === 'listenPick') it = collapseChoiceItem(it, term);
    if (clarityBlocked(it)) out.push(['judge:unclear', (it.clarity.issues || []).join(',') + (it.clarity.note ? ` (${it.clarity.note})` : '')]);
    const st = taskStructureReason(it);
    if (st) out.push(['setup', st]);
    if ((it.type === 'sentenceGap' || it.type === 'gapTranslate') && typeof it.template === 'string') {
        const g = genericGapReason(it.template); if (g) out.push(['generic-gap', g]);
    }
    if (typeof it.template === 'string' && ['sentenceGap', 'gapTranslate', 'collocationPick'].includes(it.type)) {
        const d = demonstrativeGapReason(it.template, it.answer, it.options); if (d) out.push(['this-that', d]);
    }
    const c = copyTaskReason(it); if (c) out.push(['copy-task', c]);
    const sl = displayedSlashReason(it, term); if (sl && !(['meaningPick', 'listenPick'].includes(it.type))) out.push(['slash-list', sl]);
    return out;
}

async function loadRows() {
    if (!forceSample && process.env.DATABASE_URL) {
        const { default: pg } = await import('pg');
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
        try {
            const r = await pool.query('SELECT id, term_key, en, pl, level, slot, prompt_version, item FROM track_ai_bank'); // read-only
            return { source: 'live track_ai_bank (SELECT only)', rows: r.rows.map((x) => ({ id: String(x.id), en: x.en, pl: x.pl, level: x.level, slot: x.slot, pv: x.prompt_version, item: x.item })) };
        } finally { await pool.end(); }
    }
    const { SAMPLE } = await import('./audit-track-clarity-sample.mjs');
    return { source: 'built-in SAMPLE (synthetic legacy-style rows, NOT live data)', rows: SAMPLE };
}

const { source, rows } = await loadRows();
const byReason = new Map(); const examples = [];
let checked = 0; let flagged = 0; let skippedRows = 0; let judged = 0; let judgeUnclear = 0; let widenedRows = 0; let widenedAnswers = 0;
for (const r of rows) {
    const item = r.item;
    if (!item || item.skipped || !item.type || !BANK_COMPATIBLE_VERSIONS.has(r.pv)) { skippedRows++; continue; }
    checked++;
    const term = { id: '1', en: r.en, pl: r.pl };
    if (item.clarity) { judged++; if (item.clarity.verdict === 'unclear') judgeUnclear++; if (item.clarity.widened) { widenedRows++; widenedAnswers += item.clarity.widened; } }
    const why = reasonsFor(item, r.level, term);
    const a1 = (r.level === 'A1' || r.level === 'A2') ? simpleVocabReason(String(item.template || item.sentence || item.answer || '').replace(/___/g, item.answer || ''), r.level, term, []) : '';
    if (a1 && ['sentenceGap', 'gapTranslate', 'sentenceOrder', 'dictation', 'translateType', 'collocationPick'].includes(item.type)) why.push(['too-hard-for-level', a1]);
    if (!why.length) continue;
    flagged++;
    const key = why[0][0];
    byReason.set(key, (byReason.get(key) || 0) + 1);
    examples.push({ id: r.id, level: r.level, type: item.type, term: `${r.en} / ${r.pl}`, reason: key, why: why[0][1], shown: item.template || item.sentence || item.source || item.question || item.answer });
}
console.log(`SOURCE: ${source}`);
console.log(`rows: ${rows.length}; checked (compatible, not skip rows): ${checked}; not checked: ${skippedRows}`);
console.log(`flagged by read-time checks: ${flagged}`);
for (const [k, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
console.log(`AI judge verdicts already stored on rows: ${judged} (unclear ${judgeUnclear}); rows with widened acceptedAnswers: ${widenedRows} (${widenedAnswers} answers added)`);
console.log('EXAMPLES:');
const pick = []; const seenR = new Set();
for (const e of examples) if (!seenR.has(e.reason)) { seenR.add(e.reason); pick.push(e); }
for (const e of examples) if (pick.length < 10 && !pick.includes(e)) pick.push(e);
for (const e of pick.slice(0, 10)) console.log(`  [${e.level} ${e.type} #${e.id}] ${e.term} | ${e.reason}: ${e.why}\n      shown: ${String(e.shown).slice(0, 110)}`);

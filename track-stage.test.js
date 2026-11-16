import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {
    STAGE_PATH, STAGE_LIMITS, A1_TYPED, SLOT_MIX, validateStageRequest, termWeight, strengthFromInterval, weightedSample, planStage, allowedSlots, orderStage,
    fingerprintsOf, templateItem, createStageMemory, createStageGenerator, createStageLimiter, createTrackStageHandler,
} from './track-stage.js';
import { signBridgeRequest, BRIDGE_HEADERS, PROMPT_VERSION, answerLangOf } from './track-ai.js';
import { APP_DIRECT_ROUTES } from './study-direct.js';

const SECRET = 'unit-test-bridge-secret-0123456789';
const WORDS = [['scarf', 'szalik'], ['dress', 'sukienka'], ['hat', 'czapka'], ['belt', 'pasek'], ['skirt', 'spódnica'], ['shirt', 'koszula'], ['coat', 'płaszcz'], ['shoes', 'buty'], ['socks', 'skarpetki'], ['jacket', 'kurtka'], ['gloves', 'rękawiczki'], ['jeans', 'dżinsy']];
const TERMS = WORDS.map(([en, pl], i) => ({ id: String(i + 1), en, pl, pos: '' }));
const TERM_BODY = TERMS.map(({ id, en, pl }) => ({ id, en, pl }));
const TYPED = new Set(['translateType', 'dictation', 'wordFormation', 'keyTransform', 'letterScramble']);

function seeded(seed = 1) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* a mock AI: reads the "wanted" lines of the prompt and writes one valid item per wanted slot */
const FRAMES = ['I have a red X.', 'She has a new X.', 'We want a big X.', 'He has a small X.', 'You have a blue X.', 'My mum has a long X.', 'They want an old X.', 'My dad has a new X.'];
function makeMock({ onPrompt, skipEvery = 0, frameStart = 0 } = {}) {
    let k = frameStart; let n = 0;
    return async (prompt) => {
        onPrompt?.(prompt);
        const items = [];
        for (const m of prompt.matchAll(/- termId "([^"]+)": en "([^"]+)" \| pl "([^"]+)".*→ wanted: (.*)/g)) {
            const [, id, en, pl, wanted] = m;
            const others = TERMS.filter((t) => t.id !== id);
            for (const slot of wanted.split(',').map((s) => s.trim())) {
                n++;
                if (skipEvery && n % skipEvery === 0) continue;
                const sentence = FRAMES[(k++) % FRAMES.length].replace('X', en);
                if (slot === 'sentenceGap') items.push({ termId: id, type: 'sentenceGap', sentence, answer: en, distractors: others.slice(0, 3).map((t) => t.en) });
                else if (slot === 'gapTranslate') items.push({ termId: id, type: 'gapTranslate', sentence, answer: en, distractors: others.slice(1, 4).map((t) => t.en), plTranslation: `Mam ${pl}.` });
                else if (slot === 'collocationPick') items.push({ termId: id, type: 'collocationPick', phrase: `a red ${en}`, answer: en, distractors: others.slice(0, 3).map((t) => t.en) });
                else if (slot === 'sentenceOrder') items.push({ termId: id, type: 'sentenceOrder', sentence, plTranslation: `Mam ${pl}.` });
                else if (slot.startsWith('meaningPick')) { const d = slot.split(':')[1]; items.push({ termId: id, type: 'meaningPick', direction: d, distractors: others.slice(2, 5).map((t) => (d === 'pl-en' ? t.en : t.pl)) }); }
                else if (slot === 'listenPick') items.push({ termId: id, type: 'listenPick', distractors: others.slice(3, 6).map((t) => t.en) });
            }
        }
        return { items, skipped: [] };
    };
}
const judgeOk = () => ({ calls: [], judgeRows: async function (level, rows) { this.calls.push(rows.length); rows.forEach((r) => { r.entry.item.clarity = { v: 2, verdict: 'ok', issues: [] }; }); return { calls: 1, judged: rows.length }; } });
const REQ = (over = {}) => ({ setId: 'clothes', level: 'A1', terms: TERM_BODY, ...over });
const V = (over) => { const r = validateStageRequest(REQ(over)); assert.ok(r.ok, JSON.stringify(r)); return r.value; };

/* ---------------------------------------------------------------- request validation */

test('validateStageRequest: defaults per kind, clean values', () => {
    const v = V();
    assert.equal(v.kind, 'station'); assert.equal(v.size, 6); assert.equal(v.stageIndex, 0); assert.equal(v.judge, true);
    assert.equal(V({ kind: 'recap' }).size, 10);
    assert.equal(V({ kind: 'daily' }).size, 8);
    assert.equal(V({ size: 5, stageIndex: 7, kind: 'recap' }).size, 5);
    assert.equal(V({ level: 'a2' }).level, 'A2');
});

test('validateStageRequest: bad input is rejected with a code', () => {
    const bad = (patch, code) => { const r = validateStageRequest(REQ(patch)); assert.equal(r.ok, false, JSON.stringify(patch)); if (code) assert.equal(r.code, code, JSON.stringify(patch)); };
    bad({ kind: 'weekly' }, 'bad_stage');
    bad({ stageIndex: -1 }, 'bad_stage');
    bad({ stageIndex: 1.5 }, 'bad_stage');
    bad({ size: 0 }, 'bad_size');
    bad({ size: 15 }, 'bad_size');
    bad({ size: 'six' }, 'bad_size');
    bad({ progress: 'x' }, 'bad_progress');
    bad({ progress: [1] }, 'bad_progress');
    bad({ progress: [{ strength: 0.5 }] }, 'bad_progress');
    bad({ progress: Array.from({ length: 61 }, () => ({ termId: '1' })) }, 'bad_progress');
    bad({ recentFingerprints: 'abc' }, 'bad_recent');
    bad({ budgetMs: 100 }, 'bad_budget');
    bad({ budgetMs: 999999 }, 'bad_budget');
    bad({ judge: 'yes' });
    bad({ level: 'Z9' }, 'bad_level');
    bad({ terms: [] });
    bad({ terms: Array.from({ length: 41 }, (_, i) => ({ id: String(i), en: 'fog', pl: 'x' })) }, 'too_many_terms');
    assert.equal(validateStageRequest(null).ok, false);
});

test('validateStageRequest: progress is normalised, unknown words ignored, numbers clamped, lists capped', () => {
    const v = V({
        progress: [
            { termId: 1, strength: 7, intervalDays: -4, wrongCount: 2.7, ladderStep: 9, due: '2026-01-01T00:00:00Z', lastWrong: true, lastSeenAt: 1_700_000_000_000 },
            { termId: 'nope', strength: 0.1 }, { id: '2', due: true, lastWrong: '2026-11-15T10:00:00Z' }, { termId: '1', strength: 0 },
        ],
        recentFingerprints: Array.from({ length: 500 }, (_, i) => `fp${i}`), recentTexts: ['  She has a ___.  '], focusTermIds: ['3', 'zzz', '3'],
    });
    assert.equal(v.progress.length, 2);
    const p1 = v.progress.find((p) => p.termId === '1');
    assert.equal(p1.strength, 1); assert.equal(p1.intervalDays, 0); assert.equal(p1.wrongCount, 2); assert.equal(p1.ladderStep, 3);
    assert.equal(typeof p1.dueAt, 'number'); assert.equal(p1.lastWrongFlag, true); assert.equal(p1.lastSeenAt, 1_700_000_000_000);
    assert.equal(v.progress.find((p) => p.termId === '2').due, true);
    assert.equal(v.recentFingerprints.length, STAGE_LIMITS.maxRecentFps);
    assert.equal(v.recentFingerprints.at(-1), 'fp499');
    assert.deepEqual(v.recentTexts, ['She has a ___.']);
    assert.deepEqual(v.focusTermIds, ['3']);
});

/* ---------------------------------------------------------------- SRS weights */

test('termWeight: exponential in weakness; due / recent mistakes up, mastered down', () => {
    const now = Date.UTC(2026, 10, 16, 12);
    const fresh = termWeight(undefined, now);
    const weak = termWeight({ strength: 0.1, wrongCount: 3, lastWrongFlag: true }, now);
    const learning = termWeight({ strength: 0.5 }, now);
    const due = termWeight({ strength: 0.5, due: true, intervalDays: 4, overdueDays: 4 }, now);
    const mastered = termWeight({ strength: 0.95, intervalDays: 40 }, now);
    const masteredDue = termWeight({ strength: 0.95, intervalDays: 40, due: true }, now);
    assert.equal(fresh.state, 'new'); assert.equal(weak.state, 'weak'); assert.equal(due.state, 'due'); assert.equal(mastered.state, 'mastered');
    assert.ok(weak.w > fresh.w && fresh.w > learning.w && due.w > learning.w && learning.w > mastered.w);
    assert.ok(weak.w / mastered.w > 20, `weak/mastered ${weak.w / mastered.w}`);
    assert.ok(masteredDue.w > mastered.w * 3, 'a mastered word that is due comes back');
    // SRS interval doubling = equal steps in strength, weight falls exponentially with each doubling
    const w = (d) => termWeight({ intervalDays: d }, now).w;
    assert.ok(w(1) > w(2) && w(2) > w(4) && w(4) > w(8) && w(8) > w(16));
    assert.ok(strengthFromInterval(60) > 0.99 && strengthFromInterval(0) === 0);
    // just practised: let the other words in
    assert.ok(termWeight({ strength: 0.3, lastSeenAt: now - 60_000 }, now).w < termWeight({ strength: 0.3 }, now).w);
    // overdue longer = heavier
    assert.ok(termWeight({ strength: 0.5, intervalDays: 2, overdueDays: 6 }, now).w > termWeight({ strength: 0.5, intervalDays: 2, overdueDays: 1 }, now).w);
});

test('weightedSample: heavy items win far more often, no repeats', () => {
    const rand = seeded(3); const hits = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 2000; i++) { const s = weightedSample(['a', 'b', 'c'], (x) => ({ a: 10, b: 1, c: 0.1 }[x]), 2, rand); assert.equal(new Set(s).size, 2); s.forEach((x) => { hits[x]++; }); }
    assert.ok(hits.a > hits.b && hits.b > hits.c);
});

/* ---------------------------------------------------------------- planning */

const slotKey = (e) => e.slot;

test('allowedSlots: A1 has no typed task at all, A2+ keeps them, sentenceGap choice is the biggest share', () => {
    const a1 = allowedSlots('A1');
    assert.ok(a1.length >= 5);
    for (const sl of a1) assert.ok(!A1_TYPED.has(sl.split(':')[0]), sl);
    for (const sl of ['translateType', 'dictation', 'wordFormation', 'keyTransform', 'letterScramble']) assert.ok(!a1.includes(sl));
    assert.ok(allowedSlots('A2').includes('translateType') && allowedSlots('B1').includes('wordFormation') && allowedSlots('B2').includes('keyTransform'));
    assert.ok(!allowedSlots('A2').includes('wordFormation'));
    for (const lv of Object.keys(SLOT_MIX)) {
        const mix = SLOT_MIX[lv]; const top = Object.entries(mix).sort((a, b) => b[1] - a[1])[0][0];
        assert.equal(top, 'sentenceGap', lv);
    }
    assert.ok(SLOT_MIX.A2.sentenceGap + SLOT_MIX.A2.gapTranslate > SLOT_MIX.B2.sentenceGap + SLOT_MIX.B2.gapTranslate - 1);
    assert.deepEqual(allowedSlots('A1', ['sentenceGap', 'listenPick']).sort(), ['listenPick', 'sentenceGap']);
});

test('planStage A1: all different words, no typed types, sentence gap most frequent, no slot more than half of the stage', () => {
    const rand = seeded(11); const slotCount = {}; let total = 0;
    for (let i = 0; i < 300; i++) {
        const { entries, meta } = planStage({ level: 'A1', terms: TERMS, size: 6, kind: 'station', rand });
        const real = entries.filter((e) => !e.spare);
        assert.equal(real.length, 6);
        assert.equal(entries.length, 8, 'size + 2 spares');
        assert.ok(new Set(real.map((e) => e.term.id)).size >= 5, 'a station covers (nearly) all different words');
        const perWord = {}; entries.forEach((e) => { perWord[e.term.id] = (perWord[e.term.id] || 0) + 1; });
        assert.ok(Math.max(...Object.values(perWord)) <= 2);
        for (const e of entries) { assert.ok(!TYPED.has(e.slot.split(':')[0]), e.slot); slotCount[slotKey(e)] = (slotCount[slotKey(e)] || 0) + 1; total++; }
        const c = {}; real.forEach((e) => { c[e.slot] = (c[e.slot] || 0) + 1; });
        assert.ok(Math.max(...Object.values(c)) <= 3, JSON.stringify(c));
        assert.ok(meta.maxPerWord === 2);
        // a word's two items are different tasks
        for (const t of new Set(entries.map((e) => e.term.id))) { const sl = entries.filter((e) => e.term.id === t).map((e) => e.slot); assert.equal(new Set(sl).size, sl.length); }
    }
    const top = Object.entries(slotCount).sort((a, b) => b[1] - a[1]);
    assert.equal(top[0][0], 'sentenceGap');
    assert.ok(slotCount.sentenceGap / total > 0.35, `sentenceGap share ${slotCount.sentenceGap / total}`);
    assert.ok((slotCount.sentenceGap + (slotCount.gapTranslate || 0)) / total > 0.4);
});

test('planStage A2+: typed tasks appear but sentence-gap choice stays the most frequent', () => {
    const rand = seeded(5);
    for (const level of ['A2', 'B1', 'B2']) {
        const count = {}; let total = 0;
        for (let i = 0; i < 300; i++) {
            const mastered = TERMS.map((t) => ({ termId: t.id, strength: 0.9, intervalDays: 30 }));
            for (const e of planStage({ level, terms: TERMS, progress: mastered, size: 6, rand }).entries) { count[e.slot] = (count[e.slot] || 0) + 1; total++; }
        }
        assert.equal(Object.entries(count).sort((a, b) => b[1] - a[1])[0][0], 'sentenceGap', level);
        assert.ok(Object.keys(count).some((s) => TYPED.has(s)), `${level} keeps typed tasks for well-known words`);
        assert.ok(Object.keys(count).length >= 6, `${level} variety ${Object.keys(count)}`);
    }
});

test('planStage: new words only get easy task types, known words get harder ones (ladder step)', () => {
    const rand = seeded(8); let hard = 0; let easy = 0;
    for (let i = 0; i < 200; i++) {
        for (const e of planStage({ level: 'B2', terms: TERMS.slice(0, 8), progress: [], size: 6, rand }).entries) { if (['keyTransform', 'wordFormation', 'translateType', 'dictation'].includes(e.slot)) hard++; else easy++; }
    }
    assert.equal(hard, 0, 'step-0 words are not given step-2/3 tasks');
    const known = TERMS.map((t) => ({ termId: t.id, strength: 0.7, ladderStep: 3 }));
    let hard2 = 0;
    for (let i = 0; i < 200; i++) for (const e of planStage({ level: 'B2', terms: TERMS, progress: known, size: 6, rand }).entries) if (['keyTransform', 'wordFormation', 'translateType', 'dictation'].includes(e.slot)) hard2++;
    assert.ok(hard2 > 100 && easy > 0);
});

test('planStage: due / weak words come up more often, mastered words rarely, all words still get a turn', () => {
    const rand = seeded(21); const hits = {};
    const progress = [
        { termId: '1', strength: 0.1, wrongCount: 3, lastWrongFlag: true }, { termId: '2', strength: 0.5, due: true, intervalDays: 3, overdueDays: 3 },
        ...['3', '4', '5', '6'].map((id) => ({ termId: id, strength: 0.95, intervalDays: 45 })),
    ];
    for (let i = 0; i < 600; i++) for (const e of planStage({ level: 'A2', terms: TERMS, progress, size: 6, rand }).entries.filter((x) => !x.spare)) hits[e.term.id] = (hits[e.term.id] || 0) + 1;
    const avgOther = (['7', '8', '9', '10', '11', '12'].reduce((n, id) => n + (hits[id] || 0), 0)) / 6;
    const avgMastered = (['3', '4', '5', '6'].reduce((n, id) => n + (hits[id] || 0), 0)) / 4;
    assert.ok(hits['1'] > hits['2'] && hits['2'] > avgOther, JSON.stringify(hits));
    assert.ok(avgMastered < avgOther * 0.5, `mastered ${avgMastered} vs new ${avgOther}`);
    assert.ok(avgMastered > 0, 'mastered words are rare, not gone');
});

test('planStage recap: many different words, never 1-2 — even when the focus list is tiny', () => {
    const rand = seeded(2);
    for (let i = 0; i < 200; i++) {
        const { entries, meta } = planStage({ level: 'A1', terms: TERMS, size: 10, kind: 'recap', focusIds: ['1', '2'], rand });
        const real = entries.filter((e) => !e.spare);
        assert.equal(real.length, 10);
        assert.ok(new Set(real.map((e) => e.term.id)).size >= 8, `distinct ${new Set(real.map((e) => e.term.id)).size}`);
        assert.equal(meta.maxPerWord, 1);
        assert.ok(real.some((e) => ['1', '2'].includes(e.term.id)), 'the focus words are still in');
    }
    // a tiny set: each word at most ceil(size/words) times, and still different tasks per word
    const small = planStage({ level: 'A1', terms: TERMS.slice(0, 3), size: 6, kind: 'station', rand });
    const per = {}; small.entries.filter((e) => !e.spare).forEach((e) => { per[e.term.id] = (per[e.term.id] || 0) + 1; });
    assert.equal(Object.keys(per).length, 3); assert.ok(Math.max(...Object.values(per)) <= 2);
    const one = planStage({ level: 'A1', terms: TERMS.slice(0, 1), size: 3, kind: 'station', rand });
    assert.ok(one.entries.filter((e) => !e.spare).length >= 3 || one.entries.length >= 1);
});

test('planStage: recently seen word-level tasks are down-weighted', () => {
    const recent = new Set(['pl-en'].map(() => fingerprintsOf({ type: 'meaningPick', direction: 'pl-en', lexiconId: '1' }).fp));
    const rand = seeded(4); let seen = 0; let others = 0;
    for (let i = 0; i < 1500; i++) for (const e of planStage({ level: 'A1', terms: TERMS.slice(0, 6), size: 6, recent, rand }).entries) { if (e.term.id === '1' && e.slot === 'meaningPick:pl-en') seen++; if (e.term.id === '2' && e.slot === 'meaningPick:pl-en') others++; }
    assert.ok(seen < others * 0.6, `${seen} vs ${others}`);
});

/* ---------------------------------------------------------------- ordering and fingerprints */

test('orderStage: Polish-answer tasks first, no equal types / words next to each other where possible', () => {
    const mk = (type, id, direction) => ({ type, lexiconId: id, ...(direction ? { direction } : {}) });
    const items = [mk('sentenceGap', '1'), mk('sentenceGap', '2'), mk('sentenceGap', '3'), mk('meaningPick', '4', 'en-pl'), mk('listenPick', '5'), mk('gapTranslate', '6'), mk('meaningPick', '7', 'pl-en')];
    for (let s = 1; s < 30; s++) {
        const out = orderStage(items, seeded(s));
        assert.equal(out.length, items.length);
        assert.equal(answerLangOf(out[0]), 'pl');
        for (let i = 1; i < out.length; i++) assert.notEqual(out[i].type, out[i - 1].type, out.map((x) => x.type).join(','));
    }
    assert.equal(orderStage([mk('sentenceGap', '1')]).length, 1);
});

test('fingerprintsOf: sentence + type; same sentence in another type shares textFp; word-level by word', () => {
    const gap = { type: 'sentenceGap', template: 'I have a red ___.', answer: 'scarf', lexiconId: '1' };
    const gap2 = { ...gap, type: 'gapTranslate' };
    const gapSame = { ...gap, template: 'I  have a RED ___.' };
    assert.equal(fingerprintsOf(gap).fp, fingerprintsOf(gapSame).fp);
    assert.notEqual(fingerprintsOf(gap).fp, fingerprintsOf(gap2).fp);
    assert.equal(fingerprintsOf(gap).textFp, fingerprintsOf(gap2).textFp);
    assert.notEqual(fingerprintsOf(gap).fp, fingerprintsOf({ ...gap, template: 'She has a red ___.' }).fp);
    const mp = { type: 'meaningPick', direction: 'pl-en', lexiconId: '1', options: ['a', 'b'] };
    assert.equal(fingerprintsOf(mp).fp, fingerprintsOf({ ...mp, options: ['x', 'y'] }).fp);
    assert.notEqual(fingerprintsOf(mp).fp, fingerprintsOf({ ...mp, direction: 'en-pl' }).fp);
    assert.match(fingerprintsOf(gap).fp, /^[0-9a-f]{12}$/);
});

/* ---------------------------------------------------------------- deterministic fallback items */

test('templateItem: valid choice items from the set words (and from the basic pool for tiny sets)', () => {
    const rand = seeded(9);
    for (const slot of ['meaningPick:pl-en', 'meaningPick:en-pl', 'listenPick']) {
        const it = templateItem(TERMS[0], slot, TERMS, 'A1', rand);
        assert.ok(it, slot); assert.equal(it.options.length, 4); assert.ok(it.options.includes(it.answer));
        assert.equal(new Set(it.options.map((o) => o.toLowerCase())).size, 4);
        assert.ok(it.prompt && it.answerLang);
        const tiny = templateItem(TERMS[0], slot, TERMS.slice(0, 1), 'A1', rand);
        assert.ok(tiny && tiny.options.length === 4, `tiny set ${slot}`);
    }
    assert.ok(templateItem(TERMS[0], 'letterScramble', TERMS, 'A2', rand));
    assert.equal(templateItem(TERMS[0], 'sentenceGap', TERMS, 'A1', rand), null);
});

/* ---------------------------------------------------------------- generator */

async function run(over = {}, { gen = {}, judge = judgeOk(), runPrompt = makeMock(), now, budget } = {}) {
    const generate = createStageGenerator({ runPrompt, judge, budget, rand: seeded(over.seed || 1), memory: createStageMemory(), ...gen, ...(now ? { now } : {}) });
    const v = V(over.req || {});
    return { out: await generate(v, over.key || 'u1'), generate, judge };
}

test('generator A1: a fresh station — 6 choice items, different words, gap with the Polish word in brackets, no typed tasks, 2 gen + 1 judge call', async () => {
    const { out, judge } = await run();
    assert.equal(out.items.length, 6);
    assert.equal(out.meta.promptVersion, 'tg7'); assert.equal(PROMPT_VERSION, 'tg7');
    assert.equal(out.meta.source.ai, 6); assert.equal(out.meta.fallback, null);
    assert.equal(out.meta.genCalls, 2); assert.equal(out.meta.judgeCalls, 1); assert.equal(out.meta.aiCalls, 3);
    assert.equal(judge.calls.reduce((a, b) => a + b, 0), 8, 'every generated item (6 + 2 spares) is judged in one call');
    assert.ok(out.meta.distinctTerms >= 5);
    for (const it of out.items) {
        assert.ok(!TYPED.has(it.type), it.type);
        assert.ok(it.id.startsWith('st0-') && it.lexiconId && it.fp && it.textFp && it.source === 'ai' && it.answerLang && it.prompt, JSON.stringify(it).slice(0, 200));
        assert.ok(!('clarity' in it));
        if (['sentenceGap', 'gapTranslate'].includes(it.type)) { assert.equal(it.inputMode, 'choice'); assert.match(it.templateCue, /___ \(.+\)/); assert.equal(it.options.length, 4); }
    }
    assert.equal(new Set(out.items.map((i) => i.id)).size, 6);
    assert.equal(answerLangOf(out.items[0]), out.items.some((i) => answerLangOf(i) === 'pl') ? 'pl' : answerLangOf(out.items[0]));
});

test('generator: progress steers the words; the bank is never touched (no bank in the generator at all)', async () => {
    const progress = [{ termId: '1', strength: 0.05, wrongCount: 4, lastWrongFlag: true, due: true }, ...TERMS.slice(1, 8).map((t) => ({ termId: t.id, strength: 0.97, intervalDays: 50 }))];
    let with1 = 0;
    for (let s = 1; s <= 25; s++) { const { out } = await run({ seed: s, req: { progress } }); if (out.items.some((i) => i.lexiconId === '1')) with1++; }
    assert.ok(with1 >= 18, `the failing word is in ${with1}/25 stages`);
    const src = (await import('node:fs')).readFileSync(new URL('./track-stage.js', import.meta.url), 'utf8');
    assert.ok(!/createBank|bank\.(add|entries|markServed)|createPgBankStore/.test(src));
});

test('generator: items the learner saw (fingerprints, texts) are never served again; 12 stages in a row stay fresh', async () => {
    const generate = createStageGenerator({ runPrompt: makeMock(), judge: judgeOk(), rand: seeded(5), memory: createStageMemory() });
    const seen = new Set(); const sentences = new Set(); let recent = [];
    let words = new Set();
    for (let i = 0; i < 12; i++) {
        const out = await generate(V({ stageIndex: i, recentFingerprints: recent }), 'learnerA');
        for (const it of out.items) {
            if (it.type !== 'meaningPick' && it.type !== 'listenPick') { assert.ok(!sentences.has(it.textFp), `stage ${i} repeated a sentence: ${it.templateCue || it.tokens?.join(' ')}`); sentences.add(it.textFp); }
            seen.add(it.fp); words.add(it.lexiconId);
        }
        recent = [...recent, ...out.items.flatMap((x) => [x.fp, x.textFp])];
    }
    assert.ok(words.size >= 11, `12 stages touched ${words.size} of 12 words`);
});

test('generator: the server-side memory protects a client that sends no fingerprints', async () => {
    const generate = createStageGenerator({ runPrompt: makeMock(), judge: judgeOk(), rand: seeded(6), memory: createStageMemory() });
    const a = await generate(V({ stageIndex: 0 }), 'learnerB');
    const b = await generate(V({ stageIndex: 1 }), 'learnerB');
    const sent = (o) => new Set(o.items.filter((i) => !['meaningPick', 'listenPick'].includes(i.type)).map((i) => i.textFp));
    for (const x of sent(a)) assert.ok(!sent(b).has(x));
    const other = createStageMemory();
    other.remember('k|s', a.items);
    assert.ok(other.recentFps('k|s').includes(a.items[0].fp)); assert.equal(other.recentFps('x|s').length, 0);
});

test('generator: the prompt carries the variety notes, the recent sentences, and no bank text; wants stay per word', async () => {
    const prompts = [];
    await run({ req: { recentTexts: ['I have a red scarf.'] } }, { runPrompt: makeMock({ onPrompt: (p) => prompts.push(p) }) });
    assert.equal(prompts.length, 2);
    for (const p of prompts) {
        assert.match(p, /STAGE VARIETY/); assert.match(p, /ALREADY SHOWN TO THIS LEARNER/); assert.match(p, /i have a red scarf/);
        assert.doesNotMatch(p, /ALREADY WRITTEN/);
    }
    const wanted = prompts.flatMap((p) => [...p.matchAll(/→ wanted: (.*)/g)].map((m) => m[1]));
    assert.ok(wanted.length >= 4);
});

test('generator: the judge rejects items -> spares replace them in the same round (no extra gen call)', async () => {
    const judge = { calls: 0, judgeRows: async function (level, rows) { this.calls++; rows.forEach((r, i) => { r.entry.item.clarity = { v: 2, verdict: i % 4 === 0 ? 'unclear' : 'ok', issues: [], note: 'bad' }; }); return { calls: 1 }; } };
    const { out } = await run({}, { judge });
    assert.equal(out.items.length, 6); assert.equal(out.meta.source.ai, 6); assert.equal(out.meta.rounds, 1);
    assert.ok(out.meta.rejected.judge >= 2); assert.equal(out.meta.genCalls, 2);
});

test('generator: too many rejects -> one second round (other words / types), then fallback fills the rest', async () => {
    const prompts = [];
    const judge = { judgeRows: async (level, rows) => { rows.forEach((r) => { r.entry.item.clarity = { v: 2, verdict: 'unclear', issues: ['which_gap_unclear'] }; }); return { calls: 1 }; } };
    const { out } = await run({}, { judge, runPrompt: makeMock({ onPrompt: (p) => prompts.push(p) }) });
    assert.equal(out.meta.rounds, 2);
    assert.equal(out.items.length, 6);
    assert.equal(out.meta.source.ai, 0);
    assert.equal(out.meta.source.template, 6);
    assert.equal(out.meta.fallback, 'partial');
    for (const it of out.items) assert.ok(['meaningPick', 'listenPick'].includes(it.type));
    assert.ok(prompts.length >= 3);
});

test('generator: a judge that fails or times out never blocks the stage (items served unjudged)', async () => {
    const boom = { judgeRows: async () => { throw new Error('judge down'); } };
    const { out } = await run({}, { judge: boom });
    assert.equal(out.items.length, 6); assert.equal(out.meta.judged, 0); assert.equal(out.meta.source.ai, 6);
    const hang = { judgeRows: () => new Promise(() => {}) };
    const t0 = Date.now();
    const slow = await run({ req: { budgetMs: 5000 } }, { judge: hang, gen: { limits: { ...STAGE_LIMITS, judgeTimeoutMs: 80 } } });
    assert.equal(slow.out.items.length, 6); assert.ok(Date.now() - t0 < 4000);
    const noJudge = await run({ req: { judge: false } });
    assert.equal(noJudge.out.meta.judgeCalls, 0); assert.equal(noJudge.out.meta.aiCalls, 2);
});

test('generator: short answers from the AI -> second round fills the gap', async () => {
    const { out } = await run({}, { runPrompt: makeMock({ skipEvery: 2 }) });
    assert.equal(out.items.length, 6);
    assert.ok(out.meta.rounds <= 2);
    assert.ok(out.meta.source.ai >= 4);
});

test('generator fallback: AI errors -> deterministic stage from the set words, still the full size, choice only', async () => {
    let calls = 0;
    const { out } = await run({}, { runPrompt: async () => { calls++; throw new Error('boom'); } });
    assert.ok(calls >= 2);
    assert.equal(out.items.length, 6); assert.equal(out.meta.source.template, 6); assert.equal(out.meta.fallback, 'ai_failed');
    assert.ok(out.meta.distinctTerms >= 5);
    for (const it of out.items) { assert.ok(['meaningPick', 'listenPick'].includes(it.type)); assert.equal(it.source, 'template'); assert.ok(it.options.length === 4); }
    const kinds = new Set(out.items.map((i) => `${i.type}${i.direction || ''}`));
    assert.equal(kinds.size, 3, 'meaningPick both ways and listenPick all appear');
    assert.equal(out.items.filter((i) => answerLangOf(i) === 'pl').length, 1, 'one Polish-answer task in a 6-item stage');
    for (let i = 1; i < out.items.length; i++) assert.notEqual(`${out.items[i].type}${out.items[i].direction || ''}`, `${out.items[i - 1].type}${out.items[i - 1].direction || ''}`);
});

test('generator fallback: AI not configured / daily cap reached -> no AI call at all', async () => {
    let calls = 0;
    const runPrompt = async () => { calls++; return { items: [] }; };
    const a = await run({}, { runPrompt, gen: { isConfigured: () => false } });
    assert.equal(calls, 0); assert.equal(a.out.meta.fallback, 'ai_not_configured'); assert.equal(a.out.items.length, 6); assert.equal(a.out.meta.aiConfigured, false);
    const spent = []; const budget = { dailyCalls: 10, callsToday: async () => 10, addCalls: async (n) => spent.push(n) };
    const b = await run({}, { runPrompt, budget });
    assert.equal(calls, 0); assert.equal(b.out.meta.fallback, 'daily_cap_reached'); assert.equal(b.out.meta.dailyCapReached, true); assert.equal(b.out.items.length, 6);
});

test('generator: every AI call is counted toward the daily budget', async () => {
    const spent = []; const budget = { dailyCalls: 1500, callsToday: async () => 3, addCalls: async (n) => spent.push(n) };
    const { out } = await run({}, { budget });
    assert.equal(spent.reduce((a, b) => a + b, 0), out.meta.genCalls, 'gen calls are counted here, judge calls by the judge itself');
});

test('generator last resort: earlier fresh items of the learner are reused when nothing else can be built', async () => {
    const memory = createStageMemory();
    const generate = createStageGenerator({ runPrompt: makeMock(), judge: judgeOk(), rand: seeded(3), memory });
    const first = await generate(V({ terms: TERM_BODY.slice(0, 2), size: 4 }), 'z');
    assert.equal(first.items.length, 4);
    assert.ok(memory.items('z|clothes').length > 0);
    // a 2-word set at size 8 needs more than the 2 words x 3 types x cap can give from templates
    const failing = createStageGenerator({ runPrompt: async () => { throw new Error('x'); }, judge: judgeOk(), rand: seeded(3), memory });
    const out = await failing(V({ terms: TERM_BODY.slice(0, 2), size: 6, stageIndex: 1 }), 'z');
    assert.ok(out.items.length >= 4);
    assert.ok(out.items.every((i) => i.source === 'template' || i.source === 'reuse'));
    assert.ok(out.items.every((i) => !TYPED.has(i.type)));
});

test('generator A2: typed tasks are allowed, A1 stays typed-free even when typed types are requested', async () => {
    const a1 = await run({ req: { level: 'A1', types: ['translateType', 'dictation', 'sentenceGap'] } });
    assert.ok(a1.out.items.every((i) => !TYPED.has(i.type)));
    const mastered = TERMS.map((t) => ({ termId: t.id, strength: 0.9, ladderStep: 3, intervalDays: 30 }));
    const types = new Set();
    for (let s = 1; s < 20; s++) { const r = await run({ seed: s, req: { level: 'A2', progress: mastered } }); r.out.items.forEach((i) => types.add(i.type)); }
    assert.ok(types.has('sentenceGap')); assert.ok(types.size >= 3);
});

test('generator recap: size 10, mixes at least 8 different words', async () => {
    const { out } = await run({ req: { kind: 'recap', focusTermIds: ['1', '2'] } });
    assert.equal(out.items.length, 10);
    assert.ok(out.meta.distinctTerms >= 8, `distinct ${out.meta.distinctTerms}`);
    assert.equal(out.meta.aiCalls <= 6, true);
});

test('generator latency: 2 parallel generation calls + 1 judge call; time follows the slowest call, not the sum of generation', async () => {
    let t = 0; const now = () => t;
    const delayed = (ms, fn) => async (...a) => { t += 0; await new Promise((r) => setTimeout(r, ms)); return fn(...a); };
    const t0 = Date.now();
    const { out } = await run({}, { runPrompt: delayed(60, makeMock()), judge: { judgeRows: delayed(60, async (l, rows) => { rows.forEach((r) => { r.entry.item.clarity = { v: 2, verdict: 'ok', issues: [] }; }); return { calls: 1 }; }) } });
    const el = Date.now() - t0;
    assert.equal(out.items.length, 6);
    assert.ok(el < 400, `parallel calls: ${el} ms`);
    void now;
});

/* ---------------------------------------------------------------- HTTP */

function signedReq(body, { path = STAGE_PATH, secret = SECRET } = {}) {
    const rawBody = Buffer.from(JSON.stringify(body)); const timestamp = String(Date.now()); const nonce = `n${Math.random().toString(36).slice(2)}${'x'.repeat(16)}`;
    return { rawBody, headers: { [BRIDGE_HEADERS.timestamp]: timestamp, [BRIDGE_HEADERS.nonce]: nonce, [BRIDGE_HEADERS.signature]: signBridgeRequest({ secret, timestamp, nonce, method: 'POST', path, rawBody }) } };
}
async function serve({ runPrompt = makeMock(), user = null, limiter, secret = SECRET, judge = judgeOk() } = {}) {
    const app = express();
    app.use((req, _res, next) => { req.isAuthenticated = () => Boolean(user); if (user) req.user = user; next(); });
    app.use(STAGE_PATH, express.json({ limit: STAGE_LIMITS.maxBodyBytes, verify: (req, _res, buf) => { req.rawBody = buf; } }));
    const generate = createStageGenerator({ runPrompt, judge, rand: seeded(1), memory: createStageMemory() });
    app.post(STAGE_PATH, createTrackStageHandler({ generate, getSecret: () => secret, limiter: limiter || createStageLimiter() }));
    const server = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    return {
        close: () => new Promise((r) => server.close(r)),
        post: (body, headers = {}) => fetch(base + STAGE_PATH, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }),
        signed: (body) => { const s = signedReq(body); return fetch(base + STAGE_PATH, { method: 'POST', headers: { 'content-type': 'application/json', ...s.headers }, body: s.rawBody }); },
    };
}

test('http: auth like track-generate (401 / bad signature / 503 without secret), signed app request and session both work', async () => {
    let calls = 0;
    const s = await serve({ runPrompt: async (...a) => { calls++; return makeMock()(...a); } });
    try {
        assert.equal((await s.post(REQ())).status, 401);
        const bad = await s.post(REQ(), { [BRIDGE_HEADERS.timestamp]: String(Date.now()), [BRIDGE_HEADERS.nonce]: 'a'.repeat(20), [BRIDGE_HEADERS.signature]: `v1=${'A'.repeat(43)}` });
        assert.equal(bad.status, 401); assert.equal((await bad.json()).code, 'bad_signature');
        assert.equal(calls, 0);
        const ok = await s.signed(REQ({ userRef: 'kid-1', stageIndex: 3 }));
        assert.equal(ok.status, 200);
        const j = await ok.json();
        assert.equal(j.items.length, 6); assert.equal(j.meta.stageIndex, 3); assert.ok(j.items[0].id.startsWith('st3-'));
        // a signature made for another path (track-generate) is not accepted here
        const other = signedReq(REQ(), { path: '/api/study/track-generate' });
        const wrong = await s.post(REQ(), { ...other.headers });
        assert.equal(wrong.status, 401);
    } finally { await s.close(); }
    const s2 = await serve({ secret: '' });
    try { assert.equal((await s2.signed(REQ())).status, 503); } finally { await s2.close(); }
    const s3 = await serve({ user: { id: 7 } });
    try { assert.equal((await s3.post(REQ())).status, 200); } finally { await s3.close(); }
});

test('http: validation errors are 400 with a code; the AI is not called', async () => {
    let calls = 0;
    const s = await serve({ runPrompt: async () => { calls++; return { items: [] }; } });
    try {
        for (const [patch, code] of [[{ kind: 'x' }, 'bad_stage'], [{ size: 99 }, 'bad_size'], [{ progress: 5 }, 'bad_progress'], [{ level: 'Q' }, 'bad_level'], [{ budgetMs: 1 }, 'bad_budget']]) {
            const r = await s.signed(REQ(patch)); assert.equal(r.status, 400); assert.equal((await r.json()).code, code);
        }
        assert.equal(calls, 0);
    } finally { await s.close(); }
});

test('http: an AI outage still answers 200 with a full fallback stage; busy / rate limits answer 429 with Retry-After; identical in-flight calls share one run', async () => {
    const s = await serve({ runPrompt: async () => { throw new Error('down'); } });
    try {
        const r = await s.signed(REQ());
        assert.equal(r.status, 200);
        const j = await r.json();
        assert.equal(j.items.length, 6); assert.equal(j.meta.fallback, 'ai_failed');
    } finally { await s.close(); }
    let started = 0; let release;
    const gate = new Promise((r) => { release = r; });
    const s2 = await serve({ runPrompt: async (...a) => { started++; await gate; return makeMock()(...a); }, limiter: createStageLimiter({ limits: { ...STAGE_LIMITS, userConcurrent: 1 } }) });
    try {
        const body = REQ({ userRef: 'kid-2', stageIndex: 1 });
        const p1 = s2.signed(body); const p2 = s2.signed(body);
        await new Promise((r) => setTimeout(r, 120));
        const other = await s2.signed(REQ({ userRef: 'kid-2', stageIndex: 2 }));
        assert.equal(other.status, 429); assert.equal((await other.json()).code, 'busy'); assert.ok(other.headers.get('retry-after'));
        release();
        const [a, b] = await Promise.all([p1, p2]);
        assert.equal(a.status, 200); assert.equal(b.status, 200);
        assert.equal(started, 2, 'two generation calls for one stage, not four');
        assert.deepEqual((await a.json()).items.map((i) => i.id), (await b.json()).items.map((i) => i.id));
    } finally { await s2.close(); }
});

test('limiter: per-learner hourly cap and global concurrency', () => {
    let t = 0;
    const l = createStageLimiter({ now: () => t, limits: { ...STAGE_LIMITS, userMax: 2, globalConcurrent: 3, userConcurrent: 5 } });
    assert.ok(l.check('a').ok); l.start('a'); l.finish('a');
    assert.ok(l.check('a').ok); l.start('a'); l.finish('a');
    const r = l.check('a'); assert.equal(r.ok, false); assert.equal(r.code, 'rate_limited');
    t += STAGE_LIMITS.userWindowMs + 1;
    assert.ok(l.check('a').ok);
    l.start('b'); l.start('c'); l.start('d');
    assert.equal(l.check('e').code, 'server_busy');
});

test('the app may call the stage route directly (strict CORS list)', () => {
    assert.ok(APP_DIRECT_ROUTES.includes('/api/study/track-stage'));
    assert.equal(STAGE_PATH, '/api/study/track-stage');
});

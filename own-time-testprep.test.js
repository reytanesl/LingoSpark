import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    parseTestPrepList, answerVariants, splitLearningDays, buildTestPrepPlan, resolveTestDate, freshTestPrepState,
    nextSetPlan, buildTestPrepLesson, applyTestPrepResults, isMastered, masteredCount, buildMockTest, mockSummary,
    sanitizeTestPrepState, currentDay, planStatus, wordFormationPairs, gapCueMode, testPrepAction, advanceDay,
    TP_NEW_PER_SET, TP_BAG_CLEAR_STREAK, parseSentenceReply,
} from './own-time-testprep.js';

// Two-column textbook layout (excerpt of a real chapter list): headings with " · ", wrapped cells, page footer.
const SAMPLE = `MATURA ROZSZERZONA · B2               SŁÓWKA · VOCABULARY              ROZDZIAŁ 8

Zakupy i usługi · Shopping and Services — Vocabulary
 Shops & places · Sklepy i miejsca
chemist's                 drogeria, apteka               pharmacy               apteka
greengrocer's             warzywniak                     butcher's              sklep mięsny
baker's                   piekarnia                      newsagent's            kiosk z prasą
department store          dom towarowy                   shopping centre /      centrum handlowe
                                                         mall
street market             targ uliczny                   boutique               butik

 Goods & products · Towary
goods                     towary                         brand                  marka
toaster                   toster                         washing machine        pralka
coffee machine            ekspres do kawy                headphones /           słuchawki
                                                         earphones
trainers                  buty sportowe                  fridge                 lodówka

LingoSpark · Matura rozszerzona · Zakupy i usługi · słówka                                         page 1/5
 Goods & products · Towary (cont.)
vase                      wazon                          receipt                paragon
 Advertising · Reklama
advertise                 reklamować                     advertiser             reklamodawca
advertising               reklama (dziedzina)            leaflet                ulotka
out of stock              wyprzedany,                    commercial             reklama
                          niedostępny                                           telewizyjna
`;

const parsed = () => parseTestPrepList(SAMPLE);
const today = '2026-11-01';

test('section splitting: two-column list with headings, wrapped cells, (cont.) and page footers', () => {
    const { items, sections } = parsed();
    assert.deepEqual(sections.map((s) => s.name), ['Shops & places', 'Goods & products', 'Advertising']);
    assert.deepEqual(sections.map((s) => s.pl), ['Sklepy i miejsca', 'Towary', 'Reklama']);
    assert.deepEqual(sections.map((s) => s.to - s.from), [10, 10, 6]);
    const find = (en) => items.find((x) => x.en === en);
    assert.equal(find('shopping centre / mall').pl, 'centrum handlowe');
    assert.equal(find('headphones / earphones').pl, 'słuchawki');
    assert.equal(find('out of stock').pl, 'wyprzedany, niedostępny');
    assert.equal(find('commercial').pl, 'reklama telewizyjna');
    assert.equal(find('vase').sec, 1, '(cont.) continues the same section');
    assert.ok(!items.some((x) => /LingoSpark|MATURA|Vocabulary/.test(x.en)), 'headers / footers / title dropped');
});

test('one item per line lists (dash / tab / =) and headings ending with a colon', () => {
    const { items, sections } = parseTestPrepList('Food:\napple - jabłko\nbread\tchleb\nmilk = mleko\nDrinks:\ntea – herbata\n');
    assert.deepEqual(items.map((x) => [x.en, x.pl]), [['apple', 'jabłko'], ['bread', 'chleb'], ['milk', 'mleko'], ['tea', 'herbata']]);
    assert.deepEqual(sections.map((s) => s.name), ['Food', 'Drinks']);
    assert.deepEqual(answerVariants('shopping centre / mall'), ['shopping centre', 'mall']);
    assert.deepEqual(answerVariants('pay in cash / by card'), ['pay in cash', 'by card']);
});

test('real chapter file (if present): ~300 items, 14 sections, 3-day plan = 2 learning days + revision', { skip: !fs.existsSync('/workspace/shared/matura-r8-zakupy/slowka-rozdzial8.txt') }, () => {
    const { items, sections } = parseTestPrepList(fs.readFileSync('/workspace/shared/matura-r8-zakupy/slowka-rozdzial8.txt', 'utf8'));
    assert.ok(items.length >= 290 && items.length <= 340, String(items.length));
    assert.equal(sections.length, 14);
    const plan = buildTestPrepPlan(items, sections, 3);
    assert.deepEqual(plan.map((p) => p.kind), ['learn', 'learn', 'revision']);
    assert.equal(plan[0].count + plan[1].count, items.length);
    assert.ok(Math.abs(plan[0].count - plan[1].count) < items.length * 0.2);
});

test('day plan: contiguous, balanced, section-aligned; last day = revision + mock; 1 day = learn + mock', () => {
    const { items, sections } = parsed();
    const p3 = buildTestPrepPlan(items, sections, 3);
    assert.equal(p3.length, 3);
    assert.equal(p3[0].from, 0);
    assert.equal(p3[0].to, p3[1].from);
    assert.equal(p3[1].to, items.length);
    assert.equal(p3[2].kind, 'revision');
    const p1 = buildTestPrepPlan(items, sections, 1);
    assert.deepEqual(p1.map((p) => p.kind), ['learn+mock']);
    // more days than sections: big sections are split
    const p6 = splitLearningDays(items, sections, 5);
    assert.equal(p6.length, 5);
    assert.equal(p6.reduce((s, d) => s + d.count, 0), items.length);
    // no headings → equal chunks
    const flat = Array.from({ length: 40 }, (_, i) => ({ en: `w${i}`, pl: `s${i}`, sec: 0 }));
    assert.deepEqual(splitLearningDays(flat, [], 4).map((d) => d.count), [10, 10, 10, 10]);
});

test('test date: date or "za ile dni", 1–14 days', () => {
    assert.deepEqual(resolveTestDate({ today, testDate: '2026-11-04' }), { ok: true, days: 3, testDate: '2026-11-04' });
    assert.deepEqual(resolveTestDate({ today, inDays: 5 }), { ok: true, days: 5, testDate: '2026-11-06' });
    assert.equal(resolveTestDate({ today, testDate: '2026-11-01' }).ok, false);
    assert.equal(resolveTestDate({ today, inDays: 15 }).ok, false);
});

const fresh = (days = 3) => { const { items, sections } = parsed(); return { items, sections, st: freshTestPrepState({ items, sections, days, today, testDate: '2026-11-04' }) }; };
const answerAll = (lesson, okFn) => lesson.tasks.flatMap((t) => t.items.map((it) => ({ ix: it.ix, kind: t.tp.kind, ok: okFn(it.ix, t.tp.kind) })));

test('sets: new items of the day, recognition → production, MC shuffled, ≤6 items per task', () => {
    const { items, st } = fresh();
    const sp = nextSetPlan(st, today);
    assert.equal(sp.kind, 'learn');
    assert.equal(sp.stage, 0);
    assert.equal(sp.newIdx.length, Math.min(TP_NEW_PER_SET, st.plan[0].to));
    const L = buildTestPrepLesson(st, items, sp, { cefr: 'B2' });
    const kinds = L.tasks.map((t) => t.tp.kind);
    assert.ok(kinds.indexOf('match') < kinds.indexOf('trans'), 'recognition first');
    assert.ok(L.tasks.every((t) => t.items.length <= 6 && t.items.length >= 1));
    for (const ix of sp.newIdx) {
        const seen = L.tasks.filter((t) => t.items.some((it) => it.ix === ix)).map((t) => t.tp.kind);
        assert.ok(seen.some((k) => k === 'match' || k === 'mc') && seen.some((k) => k === 'trans' || k === 'gap'), `item ${ix}: ${seen}`);
    }
    const mcTasks = L.tasks.filter((t) => t.items[0].options);
    for (const t of mcTasks) {
        const pos = t.items.map((it) => it.options.indexOf(it.answer));
        assert.ok(pos.every((p) => p >= 0));
        for (let i = 1; i < pos.length; i += 1) assert.notEqual(pos[i], pos[i - 1], 'key never in the same slot twice in a row');
        assert.ok(t.items.every((it) => it.options.length === 4), 'B2: 4 options');
    }
    // B2 gap fill = CKE translation format with the Polish fragment in brackets (no word box)
    const gap = L.tasks.find((t) => t.tp.kind === 'gap');
    assert.equal(gap.format, 'translation');
    assert.ok(gap.items.every((it) => it.pl && /_{3,}/.test(it.q)));
});

test('level-dependent gap cues: word box A0–A2, box + distractors B1, Polish fragment B2+', () => {
    assert.equal(gapCueMode('A2'), 'box');
    assert.equal(gapCueMode('B1'), 'box+');
    assert.equal(gapCueMode('B2'), 'pl');
    const { items, st } = fresh();
    const sp = nextSetPlan(st, today);
    const a2 = buildTestPrepLesson(st, items, sp, { cefr: 'A2' }).tasks.find((t) => t.tp.kind === 'gap');
    assert.deepEqual([...a2.wordBank].sort(), a2.items.map((x) => x.answer).sort());
    for (const cefr of ['A2', 'B1', 'B2']) {
        const L = buildTestPrepLesson(st, items, sp, { cefr });
        for (const ix of sp.newIdx) assert.ok(L.tasks.some((t) => ['trans', 'gap', 'wf'].includes(t.tp.kind) && t.items.some((it) => it.ix === ix)), `${cefr} item ${ix} has a production task`);
        assert.ok(L.tasks.every((t) => t.items.length <= (t.tp.kind === 'match' ? 4 : t.tp.kind === 'mc' ? 5 : 6)), cefr);
    }
    const b1 = buildTestPrepLesson(st, items, sp, { cefr: 'B1' }).tasks.find((t) => t.tp.kind === 'gap');
    assert.equal(b1.wordBank.length, b1.items.length + 2);
});

test('progression across days + spaced review of the previous day; next-day button', () => {
    const { items, st: s0 } = fresh();
    let st = s0;
    // finish day 1, all correct
    for (let g = 0; g < 10; g += 1) {
        const sp = nextSetPlan(st, today);
        if (sp.kind !== 'learn') break;
        st = applyTestPrepResults(st, buildTestPrepLesson(st, items, sp).testPrep, answerAll(buildTestPrepLesson(st, items, sp), (ix) => ix !== 1));
    }
    const after = nextSetPlan(st, today);
    assert.equal(after.dayDone, true);
    st = advanceDay(st, today);
    assert.equal(currentDay(st, today), 2);
    const sp2 = nextSetPlan(st, today);
    assert.equal(sp2.stage, 2, 'day 2 = production stage');
    assert.ok(sp2.newIdx.every((i) => i >= st.plan[1].from));
    const L2 = buildTestPrepLesson(st, items, sp2, { cefr: 'B2' });
    assert.ok(L2.tasks.filter((t) => ['trans', 'gap', 'wf'].includes(t.tp.kind)).length >= 3);
    assert.ok(sp2.bagIdx.includes(1), 'the missed item comes back from the bag');
    // calendar moves the day forward too
    assert.equal(currentDay(s0, '2026-11-02'), 2);
    assert.equal(currentDay(s0, '2026-11-09'), 3);
});

test('mistake bag: wrong → in; 2 correct in a row → out; wrong again resets the streak', () => {
    const { st: s0 } = fresh();
    const meta = { kind: 'review', day: 1, newIdx: [] };
    let st = applyTestPrepResults(s0, meta, [{ ix: 3, kind: 'mc', ok: false }]);
    assert.equal(st.bag[3], 0);
    st = applyTestPrepResults(st, meta, [{ ix: 3, kind: 'trans', ok: true }]);
    assert.equal(st.bag[3], 1);
    st = applyTestPrepResults(st, meta, [{ ix: 3, kind: 'gap', ok: false }]);
    assert.equal(st.bag[3], 0, 'streak reset');
    for (let k = 0; k < TP_BAG_CLEAR_STREAK; k += 1) st = applyTestPrepResults(st, meta, [{ ix: 3, kind: 'trans', ok: true }]);
    assert.equal(st.bag[3], undefined);
    assert.deepEqual(sanitizeTestPrepState(JSON.parse(JSON.stringify(st))), st, 'state survives JSON round-trip');
});

test('readiness rule: 2 different task types OR 2 different sets, and not in the bag', () => {
    const { st: s0 } = fresh();
    const meta = { kind: 'review', day: 1, newIdx: [] };
    let st = applyTestPrepResults(s0, meta, [{ ix: 0, kind: 'match', ok: true }, { ix: 0, kind: 'match', ok: true }]);
    assert.equal(isMastered(st, 0), false, 'one type, one set');
    st = applyTestPrepResults(st, meta, [{ ix: 0, kind: 'match', ok: true }]);
    assert.equal(isMastered(st, 0), true, 'two sets');
    st = applyTestPrepResults(s0, meta, [{ ix: 2, kind: 'mc', ok: true }, { ix: 2, kind: 'trans', ok: true }]);
    assert.equal(isMastered(st, 2), true, 'two types');
    st = applyTestPrepResults(st, meta, [{ ix: 2, kind: 'gap', ok: false }]);
    assert.equal(isMastered(st, 2), false, 'in the bag');
    assert.equal(masteredCount(st), 0);
});

test('mock test: whole list, every section, mixed types, no hints, scored with the weakest categories', () => {
    const { items, sections, st } = fresh();
    const m = buildMockTest(st, items, sections, { cefr: 'B2' });
    assert.equal(m.mockTest, true);
    const ix = m.tasks.flatMap((t) => t.items.map((it) => it.ix));
    for (const s of sections) assert.ok(ix.some((i) => i >= s.from && i < s.to), s.name);
    assert.ok(new Set(m.tasks.map((t) => t.tp.kind)).size >= 4);
    assert.ok(m.tasks.every((t) => !t.steps.length && !t.hint && t.items.length <= 6));
    const res = ix.map((i) => ({ ix: i, ok: items[i].sec !== 2 }));
    const sum = mockSummary(items, sections, res);
    assert.equal(sum.total, ix.length);
    assert.equal(sum.weak[0].name, 'Advertising');
    const st2 = applyTestPrepResults(st, m.testPrep, res.map((r) => ({ ...r, kind: 'trans' })), { mock: sum });
    assert.equal(st2.mock.score, sum.score);
    assert.equal(planStatus(st2, today), 'finished');
    assert.equal(planStatus(st, '2026-11-05'), 'expired');
});

test('word formation pairs always change the form', () => {
    const { items } = parsed();
    const wf = wordFormationPairs(items);
    assert.ok(wf.length >= 2);
    assert.ok(wf.every((w) => w.root.toLowerCase() !== w.answer));
});

test('endpoint core: setup → set → result; list needs translations; sentences from AI only with one gap', () => {
    const profile = { vocab: SAMPLE, cefr: 'B2' };
    const setup = testPrepAction({ action: 'setup', body: { inDays: 3 }, profile, state: null, today });
    assert.equal(setup.save, true);
    assert.equal(setup.json.testPrep.days, 3);
    const set = testPrepAction({ action: 'set', body: {}, profile, state: setup.state, today });
    assert.ok(set.sentenceIdx.length);
    const out = set.finish(null);
    assert.ok(out.lesson.tasks.length >= 5);
    const results = answerAll(out.lesson, () => false);
    const r = testPrepAction({ action: 'result', body: { meta: out.lesson.testPrep, results }, profile, state: setup.state, today });
    assert.ok(r.json.testPrep.bag > 0);
    const noPl = testPrepAction({ action: 'setup', body: { inDays: 3 }, profile: { vocab: Array.from({ length: 12 }, (_, i) => `word${i}`).join('\n') }, state: null, today });
    assert.equal(noPl.status, 400);
    assert.deepEqual(parseSentenceReply({ sentences: [{ ix: 1, sentence: 'A ___ b ___' }, { ix: 2, sentence: 'I buy ___ here.' }, { ix: 99, sentence: 'x ___' }] }, [1, 2]), { 2: 'I buy ___ here.' });
});

test('a skipped day is caught up first (calendar moved on, day-1 items not lost)', () => {
    const { items, sections } = parsed();
    const st = freshTestPrepState({ items, sections, days: 3, today: '2026-10-31', testDate: '2026-11-03' });
    const sp = nextSetPlan(st, today); // calendar day 2
    assert.equal(sp.day, 2);
    assert.equal(sp.newDay, 1);
    assert.equal(sp.newIdx[0], 0);
    const L = buildTestPrepLesson(st, items, sp);
    const st2 = applyTestPrepResults(st, L.testPrep, []);
    assert.equal(st2.cursor[0], sp.newIdx.length);
    assert.equal(st2.cursor[1], 0);
});

test('wrapped entries: a line continuing in BOTH column pairs, article-ended cells, sentence-like blocks', () => {
    const txt = ` Advertising · Reklama
labelling                 etykietowanie,                 make informed        podejmować świadome
                          oznakowanie                    decisions            decyzje
leaflet                   ulotka                         slogan               hasło reklamowe
 Bank · Bank
bank account              konto bankowe                  open / close an      otworzyć / zamknąć
                                                         account              konto
pay money into an         wpłacić pieniądze na           savings account      konto oszczędnościowe
account                   konto
loan                      pożyczka, kredyt               ATM / cash machine   bankomat
 Complaint letter · List z reklamacją
I am writing to           piszę, aby złożyć              Dear Sir or Madam,     Szanowni Państwo, … Z
complain about …          reklamację w sprawie …         … Yours faithfully,    poważaniem
I purchased … on …        kupiłem / kupiłam …            It stopped working     przestał działać po
                          dnia …                         after a week.          tygodniu
I find this               uważam to za całkowicie        I would be grateful    byłbym wdzięczny /
completely                niedopuszczalne                if you could …         byłabym wdzięczna,
unacceptable.                                                                   gdyby …
`;
    const { items } = parseTestPrepList(txt);
    const pairs = items.map((x) => `${x.en} = ${x.pl}`);
    for (const want of [
        'labelling = etykietowanie, oznakowanie', 'make informed decisions = podejmować świadome decyzje',
        'open / close an account = otworzyć / zamknąć konto', 'pay money into an account = wpłacić pieniądze na konto',
        'savings account = konto oszczędnościowe', 'ATM / cash machine = bankomat',
        'I am writing to complain about … = piszę, aby złożyć reklamację w sprawie …', 'I purchased … on … = kupiłem / kupiłam … dnia …',
        'It stopped working after a week. = przestał działać po tygodniu', 'I find this completely unacceptable. = uważam to za całkowicie niedopuszczalne',
        'I would be grateful if you could … = byłbym wdzięczny / byłabym wdzięczna, gdyby …',
    ]) assert.ok(pairs.includes(want), `${want}\n${pairs.join('\n')}`);
    assert.ok(!items.some((x) => ['decisions', 'account', 'complain about …', 'after a week.'].includes(x.en)));
    assert.equal(items.length, 16);
});

test('mock result: score and percentage only (no school-grade conversion)', () => {
    const { items, sections, st } = fresh();
    const m = buildMockTest(st, items, sections, { cefr: 'B2' });
    const sum = mockSummary(items, sections, m.tasks.flatMap((t) => t.items.map((it, k) => ({ ix: it.ix, ok: k % 3 > 0 }))));
    assert.equal(sum.grade, undefined);
    assert.ok(sum.pct >= 0 && sum.pct <= 100);
    const client = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
    assert.ok(!/ocena|m\.grade/.test(client));
});

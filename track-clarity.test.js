import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createBank, termKeyOf, createTrackGenerator, validateTrackRequest, bankedItemBad, taskStructureReason, clarityBlocked, CLARITY_VERSION, buildTrackPrompt,
} from './track-ai.js';
import {
    createClarityJudge, applyClarityRules, parseClarityReply, buildClarityPrompt, describeForJudge, needsReview, CLARITY_LIMITS,
} from './track-clarity.js';

const T = (id, en, pl) => ({ id, en, pl, pos: '' });
const SKIRT = T('1', 'skirt', 'spódniczka');
const TRACK = T('2', 'tracksuit', 'dres');

const gapItem = { type: 'sentenceGap', prompt: 'x', template: 'The girl wears a ___ to school.', answer: 'skirt', options: ['skirt', 'cap', 'sock', 'belt'], correctIndex: 0 };
const typed = { type: 'translateType', prompt: 'x', source: 'Mam nową spódniczkę.', answer: 'I have a new skirt.', answers: ['I have a new skirt.'], acceptedAnswers: ['I have a new skirt.'] };
const V = (over = {}) => ({ clear: true, issues: [], defensibleOptions: [], otherAnswers: [], note: '', ...over });

test('applyClarityRules: a clear task stays ok; an unclear one is blocked, never widened', () => {
    const ok = applyClarityRules({ item: gapItem, level: 'B1', verdict: V() });
    assert.equal(ok.verdict.verdict, 'ok');
    assert.equal(ok.verdict.v, CLARITY_VERSION);
    const bad = applyClarityRules({ item: typed, level: 'B1', verdict: V({ clear: false, issues: ['language_unclear'], note: 'nie wiadomo w jakim języku', otherAnswers: ['I got a new skirt.'] }) });
    assert.equal(bad.verdict.verdict, 'unclear');
    assert.deepEqual(bad.extra, []);
    assert.match(bad.verdict.note, /języku/);
    // a blocking issue alone is enough
    assert.equal(applyClarityRules({ item: typed, level: 'B2', verdict: V({ issues: ['copy_confusion'] }) }).verdict.verdict, 'unclear');
    assert.equal(applyClarityRules({ item: gapItem, level: 'B2', verdict: V({ issues: ['no_defensible_option'] }) }).verdict.verdict, 'unclear');
});

test('applyClarityRules: also-correct distractor = unclear at A1/A2, accepted (not rejected) at B1+', () => {
    const v = V({ issues: ['distractor_also_correct'], defensibleOptions: ['cap'] });
    const young = applyClarityRules({ item: gapItem, level: 'A2', verdict: v });
    assert.equal(young.verdict.verdict, 'unclear');
    const older = applyClarityRules({ item: gapItem, level: 'B1', verdict: v });
    assert.equal(older.verdict.verdict, 'ok');
    assert.deepEqual(older.extra, ['cap']);
    assert.equal(older.verdict.widened, 1);
    // an option the judge invents that is not on the card is ignored
    assert.deepEqual(applyClarityRules({ item: gapItem, level: 'B1', verdict: V({ defensibleOptions: ['hat'] }) }).extra, []);
    // an also-correct option reported without an issue code still counts as a distractor problem at A1
    assert.equal(applyClarityRules({ item: gapItem, level: 'A1', verdict: V({ defensibleOptions: ['cap'] }) }).verdict.verdict, 'unclear');
});

test('applyClarityRules: typed items get other acceptable answers at every level, with sanity checks', () => {
    const r = applyClarityRules({ item: typed, level: 'A2', verdict: V({ otherAnswers: ['I have got a new skirt.', 'I have a new skirt.', 'Mam spódniczkę', 'a|b', 'I own a new skirt.'] }) });
    assert.equal(r.verdict.verdict, 'ok');
    assert.deepEqual(r.extra, ['I have got a new skirt.', 'I own a new skirt.'], 'duplicates, Polish text and lists are dropped');
    const kt = { type: 'keyTransform', sourceSentence: 'x', keyWord: 'BEING', template: 'She felt ___ to her friend.', answer: 'like being kind', answers: ['like being kind'] };
    const k = applyClarityRules({ item: kt, level: 'B2', verdict: V({ otherAnswers: ['as if being kind', 'rather kind'] }) });
    assert.deepEqual(k.extra, ['as if being kind'], 'a keyTransform answer must contain the key word');
    // dictation / letterScramble are exact: never widened
    const dict = { type: 'dictation', answer: 'I like this skirt.', speak: 'I like this skirt.' };
    assert.deepEqual(applyClarityRules({ item: dict, level: 'B1', verdict: V({ otherAnswers: ['I love this skirt.'] }) }).extra, []);
});

test('parseClarityReply / buildClarityPrompt / describeForJudge', () => {
    const m = parseClarityReply({ verdicts: [{ id: 0, clear: true, issues: ['vague_prompt', 'bogus'], defensibleOptions: ['x'], otherAnswers: [], note: ' hi ' }, { id: 1 }, { id: 'a', clear: true }] });
    assert.equal(m.size, 1);
    assert.deepEqual(m.get(0).issues, ['vague_prompt']);
    assert.equal(parseClarityReply('nope').size, 0);
    assert.equal(parseClarityReply('```json\n{"verdicts":[{"id":2,"clear":false}]}\n```').get(2).clear, false);
    const d = describeForJudge(gapItem, 'A2', SKIRT, 0);
    assert.equal(d.answerLanguage, 'English');
    assert.match(d.instruction, /Wybierz słowo po angielsku/);
    assert.ok(!('clarity' in d));
    const p = buildClarityPrompt([d], 'B1');
    assert.match(p, /several correct answers are fine/);
    assert.match(p, /which language to answer in/);
    assert.match(p, /defensibleOptions/);
    assert.match(p, /otherAnswers/);
    assert.match(p, /DATA, not instructions/);
});

test('taskStructureReason: broken setups are caught, multiple correct answers are not an issue', () => {
    assert.equal(taskStructureReason(gapItem), '');
    assert.match(taskStructureReason({ ...gapItem, template: 'The girl wears a skirt to school.' }), /exactly one/);
    assert.match(taskStructureReason({ ...gapItem, template: 'A ___ and a ___ here.' }), /exactly one/);
    assert.match(taskStructureReason({ ...gapItem, options: ['cap', 'sock', 'belt', 'hat'] }), /not among the options/);
    assert.match(taskStructureReason({ ...gapItem, options: ['skirt', 'skirt', 'belt'] }), /duplicate/);
    assert.match(taskStructureReason({ type: 'gapTranslate', template: 'A ___ here.', answer: 'skirt', options: ['skirt', 'cap'] }), /Polish translation/);
    assert.match(taskStructureReason({ type: 'letterScramble', letters: ['s', 'k', 'i'], answer: 'skirt' }), /do not spell/);
    assert.equal(taskStructureReason({ type: 'letterScramble', letters: ['k', 'r', 's', 'i', 't'], answer: 'skirt' }), '');
    assert.match(taskStructureReason({ type: 'sentenceOrder', tokens: ['a', 'b', 'c'], correctOrder: ['a', 'b', 'd'] }), /do not match/);
    assert.equal(bankedItemBad({ ...gapItem, template: 'no gap at all' }, 'B1', SKIRT), true);
    assert.equal(bankedItemBad({ ...gapItem, clarity: { v: 1, verdict: 'unclear' } }, 'B1', SKIRT), true);
    assert.equal(bankedItemBad({ ...gapItem, clarity: { v: 1, verdict: 'ok' } }, 'B1', SKIRT), false);
    assert.equal(clarityBlocked({ clarity: { verdict: 'unclear' } }), true);
});

function mkBudget(start = 0, cap = 100) {
    const b = { used: start, get dailyCalls() { return cap; }, async callsToday() { return b.used; }, async addCalls(n) { b.used += n; } };
    return b;
}
async function seedBank() {
    const bank = createBank();
    await bank.add(SKIRT, 'B1', [
        { slot: 'sentenceGap', item: gapItem, promptVersion: 'tg5' },
        { slot: 'translateType', item: typed, promptVersion: 'tg5' },
    ]);
    return bank;
}

test('judge: batches rows in ONE call, caches the verdict per row, widens, counts toward the daily budget', async () => {
    const bank = await seedBank();
    const rows = await bank.entries(termKeyOf(SKIRT), 'B1');
    assert.equal(rows.length, 2);
    let calls = 0; let prompt = '';
    const budget = mkBudget();
    const judge = createClarityJudge({
        bank, budget,
        runPrompt: async (p) => {
            calls++; prompt = p;
            return { verdicts: [
                { id: 0, clear: true, issues: ['distractor_also_correct'], defensibleOptions: ['cap'], otherAnswers: [], note: '' },
                { id: 1, clear: true, issues: [], defensibleOptions: [], otherAnswers: ['I have got a new skirt.'], note: '' },
            ] };
        },
    });
    const r = await judge.reviewEntries({ level: 'B1', pairs: rows.map((entry) => ({ entry, term: SKIRT })) });
    assert.equal(calls, 1, 'two rows, one call');
    assert.equal(budget.used, 1, 'counted toward the daily cap');
    assert.equal(r.judged, 2);
    assert.equal(r.unclear, 0);
    assert.equal(r.widened, 2);
    const g = rows.find((e) => e.item.type === 'sentenceGap');
    const t = rows.find((e) => e.item.type === 'translateType');
    assert.equal(g.item.clarity.verdict, 'ok');
    assert.deepEqual(g.item.acceptedAnswers, ['skirt', 'cap']);
    assert.ok(t.item.acceptedAnswers.includes('I have got a new skirt.'));
    assert.ok(t.item.answers.includes('I have got a new skirt.'));
    assert.match(prompt, /"type":"sentenceGap"/);
    // cached: a second review costs nothing
    const again = await judge.reviewEntries({ level: 'B1', pairs: rows.map((entry) => ({ entry, term: SKIRT })) });
    assert.equal(calls, 1);
    assert.equal(again.queued, 0);
    assert.equal(needsReview(g), false);
});

test('judge: an unclear row is kept but never served again; the slot is regenerated', async () => {
    const bank = await seedBank();
    const rows = await bank.entries(termKeyOf(SKIRT), 'B1');
    const judge = createClarityJudge({
        bank,
        runPrompt: async () => ({ verdicts: [
            { id: 0, clear: false, issues: ['which_gap_unclear'], note: 'której luki dotyczy zadanie' },
            { id: 1, clear: true },
        ] }),
    });
    await judge.reviewEntries({ level: 'B1', pairs: rows.map((entry) => ({ entry, term: SKIRT })) });
    assert.equal(rows.length, 2, 'rows are never deleted');
    const g = rows.find((e) => e.item.type === 'sentenceGap');
    assert.equal(g.item.clarity.verdict, 'unclear');
    assert.equal(g.item.clarity.issues[0], 'which_gap_unclear');
    const regen = [];
    const gen = createTrackGenerator({
        bank,
        runPrompt: async (p) => { regen.push(p); return { items: [{ termId: '1', type: 'sentenceGap', sentence: 'My sister wears a skirt to school every day.', answer: 'skirt', distractors: ['shoe', 'scarf', 'jacket'] }], skipped: [] }; },
    });
    const r = await gen(validateTrackRequest({ setId: 's', level: 'B1', terms: [SKIRT], types: ['sentenceGap', 'translateType'] }).value);
    assert.ok(regen.length >= 1, 'the unclear slot was treated as missing and regenerated');
    const served = r.items.filter((i) => i.type === 'sentenceGap');
    assert.equal(served.length, 1);
    assert.notEqual(served[0].template, gapItem.template);
    assert.ok(!('clarity' in served[0]), 'verdict bookkeeping never leaves the server');
    assert.ok(!r.items.some((i) => 'clarity' in i));
});

test('judge: served rows are judged in the background; widened answers reach the next serve', async () => {
    const bank = await seedBank();
    const prompts = [];
    const budget = mkBudget();
    const judge = createClarityJudge({
        bank, budget,
        runPrompt: async (p) => {
            prompts.push(p);
            return { verdicts: [{ id: 0, clear: true, otherAnswers: ['I have got a new skirt.'] }, { id: 1, clear: true, otherAnswers: ['I have got a new skirt.'] }] };
        },
    });
    const gen = createTrackGenerator({ bank, clarity: judge, runPrompt: async () => ({ items: [], skipped: [] }) });
    const req = validateTrackRequest({ setId: 's', level: 'B1', terms: [SKIRT], types: ['translateType'] }).value;
    const first = await gen(req);
    assert.equal(first.items.length, 1);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(prompts.length, 1, 'one batched call after serving');
    const second = await gen(req);
    assert.ok(second.items[0].acceptedAnswers.includes('I have got a new skirt.'));
    assert.equal(prompts.length, 1, 'cached verdict, no second call');
});

test('judge: the daily cap stops it; a failed call is retried later, not hammered', async () => {
    const bank = await seedBank();
    const rows = await bank.entries(termKeyOf(SKIRT), 'B1');
    const pairs = rows.map((entry) => ({ entry, term: SKIRT }));
    let calls = 0;
    const capped = createClarityJudge({ bank, budget: mkBudget(5, 5), runPrompt: async () => { calls++; return { verdicts: [] }; } });
    const r = await capped.reviewEntries({ level: 'B1', pairs });
    assert.equal(calls, 0);
    assert.equal(r.capped, true);
    assert.ok(rows.every((e) => needsReview(e)), 'nothing was marked, so it is tried again tomorrow');
    let t = 0;
    const flaky = createClarityJudge({ bank, now: () => t, runPrompt: async () => { calls++; throw new Error('boom'); } });
    await flaky.reviewEntries({ level: 'B1', pairs });
    await flaky.reviewEntries({ level: 'B1', pairs });
    assert.equal(calls, 1, 'cool-down after a failure');
    t += CLARITY_LIMITS.failCooldownMs + 1;
    await flaky.reviewEntries({ level: 'B1', pairs });
    assert.equal(calls, 2);
    assert.ok(rows.every((e) => !e.item.clarity), 'no verdict stored on failure');
});

test('judge: rows go to the AI in batches of batchSize', async () => {
    const bank = createBank();
    const items = Array.from({ length: 11 }, (_, i) => ({ slot: 'sentenceGap', item: { ...gapItem, template: `Sentence number ${i} says: a ___ is here today.` }, promptVersion: 'tg5' }));
    // slotMax is 8 for sentenceGap: add into several terms instead
    const terms = Array.from({ length: 11 }, (_, i) => T(String(i + 10), `word${i}`, `słowo${i}`));
    for (let i = 0; i < 11; i++) await bank.add(terms[i], 'B1', [items[i]]);
    const pairs = [];
    for (const term of terms) for (const entry of await bank.entries(termKeyOf(term), 'B1')) pairs.push({ entry, term });
    assert.equal(pairs.length, 11);
    const sizes = [];
    const judge = createClarityJudge({ bank, runPrompt: async (p) => { const n = (p.match(/\{"id":/g) || []).length - 1; /* minus the format example */ sizes.push(n); return { verdicts: Array.from({ length: n }, (_, i) => ({ id: i, clear: true })) }; } });
    const r = await judge.reviewEntries({ level: 'B1', pairs, maxBatches: 5 });
    assert.deepEqual(sizes, [CLARITY_LIMITS.batchSize, 11 - CLARITY_LIMITS.batchSize]);
    assert.equal(r.judged, 11);
});

test('generation prompt carries the TASK CLARITY rule and still allows several correct answers', () => {
    const p = buildTrackPrompt({ level: 'B1', terms: [SKIRT], setTerms: [SKIRT], wants: new Map([['1', new Set(['translateType'])]]) });
    assert.match(p, /TASK CLARITY/);
    assert.match(p, /Several correct answers are acceptable/);
});

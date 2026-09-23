import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addDays,
    introDayCount,
    cardsPerDay,
    answersMatch,
    createPlan,
    applyAnswer,
    advanceQueue,
    buildTodayQueue,
    previewToday,
    readiness,
    intervalDays,
    syncTerms,
    trimToMaxTerms,
    targetSuccesses,
} from './test-countdown-scheduler.js';

function terms(n, prefix = 'word') {
    return Array.from({ length: n }, (_, i) => ({
        term: `${prefix}-${i + 1}`,
        definition: `def ${i + 1}`,
    }));
}

function planFor(overrides = {}) {
    const res = createPlan({
        terms: terms(overrides.n ?? 20),
        startDate: '2026-09-23',
        today: '2026-09-23',
        testDate: overrides.testDate || '2026-10-03',
        minutes: overrides.minutes ?? 15,
        intensity: overrides.intensity || 'standard',
        setKey: 'demo:test',
        setName: 'Test',
        setKind: 'demo',
        ...overrides.extra,
    });
    assert.equal(res.error, undefined);
    return res.plan;
}

test('intros land in the first ~65% of study days and never on test day', () => {
    const plan = planFor({ n: 20, testDate: '2026-10-03' });
    const studyLen = 10; // 23 Sep through 2 Oct
    assert.equal(introDayCount(studyLen), 7);
    const introDates = new Set();
    for (const c of plan.cards) {
        assert.ok(c.plannedIntro, c.term);
        assert.ok(c.plannedIntro < plan.testDate);
        introDates.add(c.plannedIntro);
    }
    assert.ok(!introDates.has('2026-10-03'));
    assert.ok(!introDates.has('2026-10-02'));
    assert.ok(!introDates.has('2026-10-01'));
    assert.ok(!introDates.has('2026-09-30'));
    assert.ok(introDates.has('2026-09-23'));
    assert.ok(introDates.has('2026-09-29'));
    const perDay = {};
    for (const c of plan.cards) perDay[c.plannedIntro] = (perDay[c.plannedIntro] || 0) + 1;
    const counts = Object.values(perDay);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    assert.equal(plan.warning, null);
    assert.equal(plan.targetSuccesses, 3);
});

test('intervals compress as the test approaches', () => {
    assert.equal(intervalDays(4, 20, 'standard'), 7);
    assert.ok(intervalDays(4, 6, 'standard') <= 2);
    assert.equal(intervalDays(4, 3, 'standard'), 1);
    assert.equal(intervalDays(4, 1, 'cram'), 1);
    assert.ok(intervalDays(3, 20, 'cram') < intervalDays(3, 20, 'calm'));
});

test('a miss is due the same day; a typed miss weighs more', () => {
    let plan = planFor({ n: 4, testDate: '2026-09-30', minutes: 20 });
    const key = plan.cards[0].key;
    plan = applyAnswer(plan, { key, correct: false, typed: false, today: '2026-09-23' });
    const button = plan.cards.find((c) => c.key === key);
    assert.equal(button.nextDue, '2026-09-23');
    assert.equal(button.lapseWeight, 1);
    assert.equal(button.lastResult, 'fail');
    assert.equal(button.introduced, true);

    plan = applyAnswer(plan, { key, correct: false, typed: true, today: '2026-09-23' });
    const typed = plan.cards.find((c) => c.key === key);
    assert.equal(typed.lapseWeight, 2.5);
    assert.equal(typed.lastResult, 'typed-fail');
    assert.equal(typed.nextDue, '2026-09-23');
});

test('typed misses return sooner in the session than button misses', () => {
    const queue = [
        { key: 'a', role: 'new', reps: 0, mode: 'typed' },
        { key: 'b', role: 'new', reps: 0, mode: 'know' },
        { key: 'c', role: 'review', reps: 0, mode: 'know' },
    ];
    const typed = advanceQueue(queue, 0, { correct: false, typed: true });
    assert.deepEqual(typed.queue.map((q) => q.key), ['b', 'a', 'c']);
    const button = advanceQueue(queue, 0, { correct: false, typed: false });
    assert.deepEqual(button.queue.map((q) => q.key), ['b', 'c', 'a']);
    const third = advanceQueue(
        [{ key: 'a', reps: 2, role: 'review', mode: 'typed' }],
        0,
        { correct: false, typed: true }
    );
    assert.equal(third.queue.length, 0);
});

test('cram lowers the target to 2 only when the window is tiny', () => {
    assert.equal(targetSuccesses('cram', 2, 40, 24), 2);
    assert.equal(targetSuccesses('standard', 2, 40, 20), 3);
    assert.equal(targetSuccesses('calm', 2, 40, 15), 3);
    const wide = planFor({ n: 8, testDate: '2026-10-20', intensity: 'cram', minutes: 20 });
    assert.equal(wide.targetSuccesses, 3);
    const tiny = createPlan({
        terms: terms(40),
        startDate: '2026-09-23',
        today: '2026-09-23',
        testDate: '2026-09-24',
        minutes: 10,
        intensity: 'cram',
    });
    assert.equal(tiny.plan.targetSuccesses, 2);
    assert.equal(tiny.plan.warning.overCapacity, true);
});

test('an impossible load returns a warning with date, budget, and trim options', () => {
    const res = createPlan({
        terms: terms(100),
        startDate: '2026-09-23',
        today: '2026-09-23',
        testDate: '2026-09-28',
        minutes: 10,
        intensity: 'standard',
    });
    const w = res.plan.warning;
    assert.ok(w);
    assert.ok(w.neededSlots > w.availableSlots);
    assert.ok(w.suggestedTestDate > '2026-09-28');
    assert.ok(w.suggestedMinutes > 10);
    assert.ok(w.maxTerms > 0 && w.maxTerms < 100);
    assert.equal(cardsPerDay(10, 'standard'), 20);

    const extended = createPlan({
        previousPlan: res.plan,
        terms: terms(100),
        today: '2026-09-23',
        testDate: w.suggestedTestDate,
        minutes: 10,
        intensity: 'standard',
        skippedKeys: [],
    });
    assert.equal(extended.plan.warning, null);

    const richer = createPlan({
        previousPlan: res.plan,
        terms: terms(100),
        today: '2026-09-23',
        testDate: '2026-09-28',
        minutes: w.suggestedMinutes,
        intensity: 'standard',
        skippedKeys: [],
    });
    assert.equal(richer.plan.warning, null);

    const trimmed = trimToMaxTerms(res.plan, w.maxTerms, '2026-09-23');
    assert.equal(trimmed.plan.warning, null);
    assert.equal(trimmed.plan.cards.filter((c) => !c.skipped).length, w.maxTerms);
});

test('missed days merge into today and stop at the catch-up cap', () => {
    const plan = planFor({ n: 8, testDate: '2026-10-03', minutes: 10 });
    assert.equal(plan.cardsPerDay, 20);
    for (const c of plan.cards) {
        c.introduced = true;
        c.introDate = '2026-09-23';
        c.successCount = 1;
        c.recentCorrect = ['2026-09-23'];
        c.nextDue = '2026-09-24';
        c.lastResult = 'know';
    }
    plan.lastSessionDate = '2026-09-23';
    const quiet = buildTodayQueue(plan, '2026-09-24');
    assert.equal(quiet.catchUp.missedDays, 0);
    assert.equal(quiet.reviewCount, 8);

    plan.lastSessionDate = '2026-09-20';
    const extraCards = [];
    for (let i = 0; i < 30; i++) {
        extraCards.push({
            key: `old-${i}`,
            term: `old-${i}`,
            definition: 'x',
            order: 100 + i,
            skipped: false,
            introduced: true,
            plannedIntro: '2026-09-20',
            introDate: '2026-09-20',
            successCount: 1,
            failCount: 2,
            lapseWeight: 2,
            nextDue: '2026-09-21',
            lastReviewed: '2026-09-20',
            lastResult: 'fail',
            recentCorrect: ['2026-09-20'],
        });
    }
    plan.cards.push(...extraCards);
    const caught = buildTodayQueue(plan, '2026-09-24');
    assert.equal(caught.catchUp.missedDays, 3);
    assert.equal(caught.catchUp.capped, true);
    assert.ok(caught.queue.length <= 20 + Math.floor(20 / 2));
    assert.equal(caught.queue.length, 30);
});

test('rebuilding keeps progress on unchanged terms and schedules new ones', () => {
    let plan = planFor({ n: 3, testDate: '2026-10-03', minutes: 20 });
    const keep = plan.cards[0].key;
    const drop = plan.cards[2].key;
    plan = applyAnswer(plan, { key: keep, correct: true, today: '2026-09-23' });
    plan = applyAnswer(plan, { key: keep, correct: true, today: '2026-09-24' });
    const rebuilt = syncTerms(plan, [
        { term: plan.cards[0].term, definition: 'updated gloss' },
        { term: plan.cards[1].term, definition: plan.cards[1].definition },
        { term: 'brand-new', definition: 'nowy' },
    ], '2026-09-25');
    assert.equal(rebuilt.error, undefined);
    const kept = rebuilt.plan.cards.find((c) => c.key === keep);
    assert.equal(kept.successCount, 2);
    assert.equal(kept.definition, 'updated gloss');
    assert.equal(kept.introduced, true);
    assert.equal(rebuilt.plan.cards.some((c) => c.key === drop), false);
    const added = rebuilt.plan.cards.find((c) => c.key === 'brand-new');
    assert.equal(added.successCount, 0);
    assert.equal(added.introduced, false);
    assert.ok(added.plannedIntro >= '2026-09-25');
    assert.ok(added.plannedIntro < rebuilt.plan.testDate);
});

test('test day is a final run: weak cards, a mastered sample, no new intros', () => {
    const plan = planFor({ n: 8, testDate: '2026-09-27', minutes: 20 });
    plan.cards.forEach((c, i) => {
        c.introduced = true;
        c.introDate = '2026-09-23';
        c.plannedIntro = '2026-09-23';
        if (i < 3) {
            c.successCount = 1;
            c.recentCorrect = ['2026-09-23'];
            c.nextDue = '2026-09-24';
            c.lastResult = 'fail';
            c.failCount = 1;
            c.lapseWeight = 1;
        } else {
            c.successCount = 3;
            c.recentCorrect = ['2026-09-23', '2026-09-24', '2026-09-25'];
            c.nextDue = '2026-09-28';
            c.lastResult = 'know';
            c.lastReviewed = '2026-09-25';
        }
    });
    const built = buildTodayQueue(plan, '2026-09-27');
    assert.equal(built.isFinal, true);
    assert.equal(built.newCount, 0);
    assert.ok(built.queue.every((q) => q.role === 'final-weak' || q.role === 'final-sample'));
    assert.equal(built.finalWeak, 3);
    assert.ok(built.finalSample >= 1);
    assert.equal(built.queue.filter((q) => q.role === 'new').length, 0);
});

test('readiness is an explainable percentage and never a pass guarantee band', () => {
    const plan = planFor({ n: 4, testDate: '2026-10-03', minutes: 20 });
    const fresh = readiness(plan, '2026-09-23');
    assert.equal(fresh.percent, 0);
    assert.equal(fresh.status, 'on-track');
    plan.cards.forEach((c, i) => {
        c.introduced = true;
        c.recentCorrect = i < 2 ? ['2026-09-28', '2026-09-29'] : ['2026-09-29'];
        c.successCount = c.recentCorrect.length;
        c.nextDue = '2026-10-01';
        c.lastResult = 'know';
    });
    const mid = readiness(plan, '2026-09-30');
    assert.equal(mid.ready, 2);
    assert.equal(mid.total, 4);
    assert.equal(mid.percent, 50);
    assert.ok(['on-track', 'behind', 'at-risk'].includes(mid.status));

    plan.cards.forEach((c) => {
        c.recentCorrect = [];
        c.successCount = 0;
        c.nextDue = '2026-09-20';
    });
    const late = readiness(plan, '2026-09-30');
    assert.equal(late.percent, 0);
    assert.equal(late.status, 'at-risk');
});

test('typed recall trims and ignores case', () => {
    assert.equal(answersMatch('  Apple ', 'apple'), true);
    assert.equal(answersMatch('APPLE', 'apple'), true);
    assert.equal(answersMatch('apple', 'Apple / Malus'), true);
    assert.equal(answersMatch('apples', 'apple'), false);
    assert.equal(answersMatch('   ', 'apple'), false);
});

test('a success moves the next review forward and off today', () => {
    let plan = planFor({ n: 2, testDate: '2026-10-15', minutes: 20 });
    const key = plan.cards[0].key;
    plan = applyAnswer(plan, { key, correct: true, today: '2026-09-23' });
    const card = plan.cards.find((c) => c.key === key);
    assert.ok(card.nextDue > '2026-09-23');
    assert.ok(card.nextDue <= plan.testDate);
    assert.equal(card.successCount, 1);
});

test('preview catches a plan up without dropping saved successes', () => {
    const plan = planFor({ n: 6, testDate: '2026-10-03', minutes: 15 });
    const viewed = previewToday(plan, '2026-09-26');
    assert.equal(viewed.plan.cards[0].successCount, 0);
    assert.ok(viewed.newCount > 0);
    assert.equal(viewed.queue.some((q) => q.role === 'new'), true);
    assert.ok(addDays('2026-09-23', 1) === '2026-09-24');
});

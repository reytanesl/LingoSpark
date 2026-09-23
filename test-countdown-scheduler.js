/**
 * Test Countdown scheduler.
 * Pure functions: dates are YYYY-MM-DD strings, no DOM, no storage.
 *
 * Rules:
 * - Standard / Calm aim for >= 3 successful reviews before test day.
 * - Cram may drop to >= 2 when the window is tiny (3 study days or fewer,
 *   or not enough slots for 3 reviews each).
 * - New words spread across the first ~65% of study days. The last stretch
 *   is review-heavy. Test day introduces nothing.
 * - Intervals shrink as the test gets close.
 * - A miss is due again the same day (the session requeues it). A typed miss
 *   weighs 1.5 vs 1 for a Know/Don't know miss, and returns sooner in-session.
 * - If the set cannot fit the budget, return an honest warning plus a later
 *   date, a higher minute budget, and a max term count.
 * - Missed days fold into today, capped at +50% of the daily card budget.
 * - Rebuilding keeps progress on unchanged term keys.
 */

const RATES = { calm: 1.5, standard: 2, cram: 2.4 };
const INTERVAL_MUL = { calm: 1.35, standard: 1, cram: 0.6 };
const BASE_INTERVALS = [1, 2, 4, 7, 12];
const MAX_TERMS = 500;

function pad(n) { return String(n).padStart(2, '0'); }

export function todayISO(date = new Date()) {
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
    const [y, m, d] = String(iso).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
}

export function diffDays(fromIso, toIso) {
    const [y1, m1, d1] = String(fromIso).split('-').map(Number);
    const [y2, m2, d2] = String(toIso).split('-').map(Number);
    const a = Date.UTC(y1, m1 - 1, d1);
    const b = Date.UTC(y2, m2 - 1, d2);
    return Math.round((b - a) / 86400000);
}

export function studyDates(startDate, testDate) {
    if (!startDate || !testDate || testDate <= startDate) return [];
    const last = addDays(testDate, -1);
    const out = [];
    for (let d = startDate; d <= last; d = addDays(d, 1)) out.push(d);
    return out;
}

export function introDayCount(studyLen) {
    if (studyLen <= 0) return 0;
    if (studyLen <= 2) return 1;
    const n = Math.round(studyLen * 0.65);
    return Math.min(studyLen - 1, Math.max(1, n));
}

export function cardsPerDay(minutes, intensity) {
    const rate = RATES[intensity] || RATES.standard;
    const mins = clampInt(minutes, 5, 180);
    return Math.max(4, Math.round(mins * rate));
}

export function termKey(term) {
    return String(term || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function answersMatch(input, expected) {
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const guess = norm(input);
    if (!guess) return false;
    const parts = String(expected || '')
        .split(/\s*[,/]\s*/)
        .map(norm)
        .filter(Boolean);
    if (!parts.length) return false;
    return parts.includes(guess);
}

function clampInt(n, min, max) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, v));
}

function clone(v) {
    return JSON.parse(JSON.stringify(v));
}

function maxNewIntro(cpd) {
    return Math.max(1, Math.floor(cpd * 0.6));
}

function maxNewReview(cpd) {
    return Math.max(0, Math.floor(cpd * 0.25));
}

/** Cram + a tiny window is the only case that lowers the success target to 2. */
export function targetSuccesses(intensity, studyDayCount, termCount, perDay) {
    const available = studyDayCount * perDay;
    const tiny = studyDayCount <= 3 || available < termCount * 3;
    if (intensity === 'cram' && tiny) return 2;
    return 3;
}

function capacityFor(studyDayCount, perDay, intensity, termCount) {
    const target = targetSuccesses(intensity, studyDayCount, termCount, perDay);
    const introDays = introDayCount(studyDayCount);
    const reviewDays = Math.max(0, studyDayCount - introDays);
    const introCapacity = introDays * maxNewIntro(perDay) + reviewDays * maxNewReview(perDay);
    const availableSlots = studyDayCount * perDay;
    const neededSlots = termCount * target;
    return { target, introDays, introCapacity, availableSlots, neededSlots };
}

function fits(studyDayCount, perDay, intensity, termCount) {
    if (termCount <= 0) return false;
    const cap = capacityFor(studyDayCount, perDay, intensity, termCount);
    return termCount <= cap.introCapacity && cap.neededSlots <= cap.availableSlots;
}

function suggestMinutes(studyDayCount, termCount, intensity) {
    if (studyDayCount <= 0 || termCount <= 0) return null;
    for (let minutes = 5; minutes <= 180; minutes++) {
        const perDay = cardsPerDay(minutes, intensity);
        if (fits(studyDayCount, perDay, intensity, termCount)) return minutes;
    }
    return null;
}

function suggestStudyDays(perDay, termCount, intensity) {
    for (let study = 1; study <= 180; study++) {
        if (fits(study, perDay, intensity, termCount)) return study;
    }
    return null;
}

function maxTermsThatFit(studyDayCount, perDay, intensity) {
    if (studyDayCount <= 0) return 0;
    let lo = 0;
    let hi = Math.max(perDay * studyDayCount, 1);
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(studyDayCount, perDay, intensity, mid)) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

function assessWarning({ termCount, studyDayCount, perDay, intensity, startDate, unscheduled }) {
    if (termCount <= 0) return null;
    const cap = capacityFor(studyDayCount, perDay, intensity, termCount);
    const over = termCount > cap.introCapacity || cap.neededSlots > cap.availableSlots || unscheduled > 0;
    if (!over) return null;
    const extraDays = suggestStudyDays(perDay, termCount, intensity);
    const suggestedMinutes = suggestMinutes(studyDayCount, termCount, intensity);
    return {
        overCapacity: true,
        target: cap.target,
        termCount,
        studyDays: studyDayCount,
        cardsPerDay: perDay,
        neededSlots: cap.neededSlots,
        availableSlots: cap.availableSlots,
        introCapacity: cap.introCapacity,
        suggestedMinutes,
        suggestedTestDate: extraDays ? addDays(startDate, extraDays) : null,
        maxTerms: maxTermsThatFit(studyDayCount, perDay, intensity),
        unscheduled,
    };
}

function blankCard(term, definition, order) {
    return {
        key: termKey(term),
        term: String(term || '').trim(),
        definition: String(definition || '').trim(),
        order,
        skipped: false,
        introduced: false,
        plannedIntro: null,
        introDate: null,
        successCount: 0,
        failCount: 0,
        lapseWeight: 0,
        nextDue: null,
        lastReviewed: null,
        lastResult: null,
        recentCorrect: [],
    };
}

const PROGRESS_FIELDS = [
    'skipped', 'introduced', 'plannedIntro', 'introDate', 'successCount', 'failCount',
    'lapseWeight', 'nextDue', 'lastReviewed', 'lastResult', 'recentCorrect',
];

function copyProgress(card, prev) {
    if (!prev) return;
    for (const f of PROGRESS_FIELDS) {
        if (prev[f] !== undefined) card[f] = clone(prev[f]);
    }
}

function distribute(count, caps) {
    const counts = caps.map(() => 0);
    let left = count;
    while (left > 0) {
        let best = -1;
        for (let i = 0; i < caps.length; i++) {
            if (counts[i] >= caps[i]) continue;
            if (best === -1 || counts[i] < counts[best]) best = i;
        }
        if (best === -1) break;
        counts[best] += 1;
        left -= 1;
    }
    return { counts, unplaced: left };
}

function assignIntros(plan, today) {
    const allStudy = studyDates(plan.startDate, plan.testDate);
    const introN = introDayCount(allStudy.length);
    const introDates = allStudy.slice(0, introN).filter((d) => d >= today && d < plan.testDate);
    const reviewDates = allStudy.slice(introN).filter((d) => d >= today && d < plan.testDate);
    const pending = plan.cards
        .filter((c) => !c.skipped && !c.introduced)
        .sort((a, b) => a.order - b.order);
    for (const c of pending) c.plannedIntro = null;
    if (!pending.length) return 0;

    const perDay = plan.cardsPerDay;
    const place = (dates, capEach) => {
        if (!dates.length || capEach <= 0) return;
        const still = pending.filter((c) => !c.plannedIntro);
        if (!still.length) return;
        const { counts } = distribute(still.length, dates.map(() => capEach));
        let cursor = 0;
        dates.forEach((date, i) => {
            for (let n = 0; n < counts[i] && cursor < still.length; n++) {
                still[cursor].plannedIntro = date;
                cursor += 1;
            }
        });
    };
    place(introDates, maxNewIntro(perDay));
    place(reviewDates, maxNewReview(perDay));
    return pending.filter((c) => !c.plannedIntro).length;
}

function countUniqueTerms(terms) {
    const seen = new Set();
    for (const raw of terms || []) {
        const key = termKey(raw?.term);
        if (key) seen.add(key);
    }
    return seen.size;
}

function normaliseTerms(terms) {
    const out = [];
    const seen = new Set();
    for (const raw of terms || []) {
        const term = String(raw?.term || '').trim();
        const definition = String(raw?.definition ?? raw?.def ?? '').trim();
        const key = termKey(term);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ term: term.slice(0, 200), definition: definition.slice(0, 500) });
        if (out.length >= MAX_TERMS) break;
    }
    return out;
}

function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `tc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build or rebuild a plan. Pass previousPlan to keep progress on unchanged terms.
 * skippedKeys, when provided, replaces the skipped set (used by trim).
 */
export function createPlan(input) {
    const today = input.today || input.startDate;
    const prev = input.previousPlan || null;
    const startDate = prev?.startDate || input.startDate || today;
    const testDate = input.testDate;
    const intensity = ['calm', 'standard', 'cram'].includes(input.intensity) ? input.intensity : 'standard';
    const minutes = clampInt(input.minutes, 5, 180);
    // New plans start tomorrow at the earliest. An existing plan may be opened
    // on its test day (testDate === today) without being rejected.
    if (!testDate || !today || testDate < today) return { error: 'date_too_soon' };
    if (testDate === today && !(prev && prev.testDate === today)) return { error: 'date_too_soon' };
    if (testDate <= startDate) return { error: 'date_too_soon' };
    const terms = normaliseTerms(input.terms);
    if (!terms.length) return { error: 'no_terms' };
    if (countUniqueTerms(input.terms) > MAX_TERMS) return { error: 'too_many_terms' };

    const prevByKey = new Map((prev?.cards || []).map((c) => [c.key, c]));
    const cards = terms.map((t, order) => {
        const card = blankCard(t.term, t.definition, order);
        copyProgress(card, prevByKey.get(card.key));
        card.term = t.term;
        card.definition = t.definition;
        card.order = order;
        if (!card.introduced) {
            card.plannedIntro = null;
            card.introDate = null;
        }
        return card;
    });

    if (Array.isArray(input.skippedKeys)) {
        const skip = new Set(input.skippedKeys);
        for (const c of cards) c.skipped = skip.has(c.key);
    }

    const activeCount = cards.filter((c) => !c.skipped).length;
    const study = studyDates(startDate, testDate);
    const perDay = cardsPerDay(minutes, intensity);
    const target = targetSuccesses(intensity, study.length, Math.max(activeCount, 1), perDay);

    const plan = {
        id: prev?.id || input.id || newId(),
        setKey: input.setKey || prev?.setKey || '',
        setName: input.setName || prev?.setName || '',
        setKind: input.setKind || prev?.setKind || 'glossary',
        wordSetId: input.wordSetId ?? prev?.wordSetId ?? null,
        demoId: input.demoId ?? prev?.demoId ?? null,
        startDate,
        testDate,
        todayAnchor: today,
        minutes,
        intensity,
        cardsPerDay: perDay,
        targetSuccesses: target,
        sessionMode: input.sessionMode || prev?.sessionMode || 'mixed',
        createdAt: prev?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSessionDate: prev?.lastSessionDate || null,
        dayLog: prev?.dayLog ? clone(prev.dayLog) : {},
        cards,
        warning: null,
    };

    const unscheduled = assignIntros(plan, today);
    plan.warning = assessWarning({
        termCount: activeCount,
        studyDayCount: study.length,
        perDay,
        intensity,
        startDate,
        unscheduled,
    });
    return { plan };
}

export function rebalancePlan(plan, today) {
    const copy = clone(plan);
    if (!today || today >= copy.testDate) return copy;
    for (const c of copy.cards) {
        if (!c.skipped && !c.introduced && c.plannedIntro && c.plannedIntro < today) {
            c.plannedIntro = null;
        }
    }
    const activeCount = copy.cards.filter((c) => !c.skipped).length;
    const study = studyDates(copy.startDate, copy.testDate);
    copy.cardsPerDay = cardsPerDay(copy.minutes, copy.intensity);
    copy.targetSuccesses = targetSuccesses(copy.intensity, study.length, Math.max(activeCount, 1), copy.cardsPerDay);
    const unscheduled = assignIntros(copy, today);
    copy.warning = assessWarning({
        termCount: activeCount,
        studyDayCount: study.length,
        perDay: copy.cardsPerDay,
        intensity: copy.intensity,
        startDate: copy.startDate,
        unscheduled,
    });
    copy.updatedAt = new Date().toISOString();
    return copy;
}

export function updatePlanSettings(plan, { testDate, minutes, intensity }, today) {
    return createPlan({
        previousPlan: plan,
        terms: plan.cards.map((c) => ({ term: c.term, definition: c.definition })),
        testDate: testDate || plan.testDate,
        minutes: minutes ?? plan.minutes,
        intensity: intensity || plan.intensity,
        startDate: plan.startDate,
        today,
        setKey: plan.setKey,
        setName: plan.setName,
        setKind: plan.setKind,
        wordSetId: plan.wordSetId,
        demoId: plan.demoId,
        sessionMode: plan.sessionMode,
        skippedKeys: plan.cards.filter((c) => c.skipped).map((c) => c.key),
    });
}

export function syncTerms(plan, terms, today) {
    return createPlan({
        previousPlan: plan,
        terms,
        testDate: plan.testDate,
        minutes: plan.minutes,
        intensity: plan.intensity,
        startDate: plan.startDate,
        today,
        setKey: plan.setKey,
        setName: plan.setName,
        setKind: plan.setKind,
        wordSetId: plan.wordSetId,
        demoId: plan.demoId,
        sessionMode: plan.sessionMode,
        skippedKeys: plan.cards.filter((c) => c.skipped).map((c) => c.key),
    });
}

/** Keep the first maxTerms active cards (by original order); skip the rest. */
export function trimToMaxTerms(plan, maxTerms, today) {
    const keep = new Set();
    const ordered = [...plan.cards].sort((a, b) => a.order - b.order);
    for (const c of ordered) {
        if (keep.size >= maxTerms) break;
        keep.add(c.key);
    }
    const skippedKeys = ordered.filter((c) => !keep.has(c.key)).map((c) => c.key);
    return createPlan({
        previousPlan: plan,
        terms: plan.cards.map((c) => ({ term: c.term, definition: c.definition })),
        testDate: plan.testDate,
        minutes: plan.minutes,
        intensity: plan.intensity,
        today,
        setKey: plan.setKey,
        setName: plan.setName,
        setKind: plan.setKind,
        wordSetId: plan.wordSetId,
        demoId: plan.demoId,
        sessionMode: plan.sessionMode,
        skippedKeys,
    });
}

export function intervalDays(successCount, daysUntilTest, intensity) {
    const idx = Math.min(Math.max(successCount, 1) - 1, BASE_INTERVALS.length - 1);
    const mul = INTERVAL_MUL[intensity] || 1;
    let days = Math.max(1, Math.round(BASE_INTERVALS[idx] * mul));
    if (daysUntilTest <= 2) return 1;
    if (daysUntilTest <= 4) return Math.min(days, 1);
    if (daysUntilTest <= 7) return Math.min(days, 2);
    const cap = Math.max(1, Math.ceil(daysUntilTest / 2));
    return Math.min(days, cap);
}

export function applyAnswer(plan, { key, correct, typed, today }) {
    const copy = clone(plan);
    const card = copy.cards.find((c) => c.key === key);
    if (!card || !today) return copy;
    card.introduced = true;
    card.lastReviewed = today;
    if (!card.introDate) card.introDate = today;
    card.plannedIntro = card.plannedIntro || today;
    if (correct) {
        card.successCount = (card.successCount || 0) + 1;
        card.lastResult = 'know';
        const recent = Array.isArray(card.recentCorrect) ? card.recentCorrect : [];
        recent.push(today);
        card.recentCorrect = recent.slice(-8);
        const gap = intervalDays(card.successCount, diffDays(today, copy.testDate), copy.intensity);
        let due = addDays(today, gap);
        if (due > copy.testDate) due = copy.testDate;
        if (due <= today) due = today < copy.testDate ? addDays(today, 1) : copy.testDate;
        card.nextDue = due;
    } else {
        card.failCount = (card.failCount || 0) + 1;
        const add = typed ? 1.5 : 1;
        card.lapseWeight = Math.round(((card.lapseWeight || 0) + add) * 10) / 10;
        card.lastResult = typed ? 'typed-fail' : 'fail';
        card.nextDue = today;
    }
    copy.updatedAt = new Date().toISOString();
    return copy;
}

function weakness(card, today) {
    const overdue = card.nextDue && card.nextDue < today ? diffDays(card.nextDue, today) : 0;
    return overdue * 10 + (card.lapseWeight || 0) * 3 + (card.failCount || 0) - (card.successCount || 0);
}

export function isWeak(card, today, target) {
    if (!card || card.skipped || !card.introduced) return false;
    if ((card.successCount || 0) < target) return true;
    if (card.nextDue && card.nextDue < today) return true;
    if (card.lastResult === 'fail' || card.lastResult === 'typed-fail') return true;
    return false;
}

function isMastered(card, today, target) {
    return card.introduced && !card.skipped && !isWeak(card, today, target);
}

export function catchUpLimit(perDay) {
    return perDay + Math.floor(perDay / 2);
}

export function buildTodayQueue(plan, today) {
    const perDay = plan.cardsPerDay || cardsPerDay(plan.minutes, plan.intensity);
    const target = plan.targetSuccesses || 3;
    const active = (plan.cards || []).filter((c) => !c.skipped);
    const isFinal = today >= plan.testDate;
    const missedDays = plan.lastSessionDate
        ? Math.max(0, diffDays(plan.lastSessionDate, today) - 1)
        : 0;

    if (isFinal) {
        const weak = active
            .filter((c) => isWeak(c, today, target))
            .sort((a, b) => weakness(b, today) - weakness(a, today) || a.order - b.order);
        const mastered = active
            .filter((c) => isMastered(c, today, target))
            .sort((a, b) => String(a.lastReviewed || '').localeCompare(String(b.lastReviewed || '')) || a.key.localeCompare(b.key));
        let sampleSize = 0;
        if (mastered.length) {
            sampleSize = Math.min(
                mastered.length,
                Math.max(1, Math.round(mastered.length * 0.25)),
                Math.max(1, Math.floor(perDay * 0.4))
            );
            if (mastered.length >= 3) sampleSize = Math.max(sampleSize, Math.min(3, mastered.length, perDay));
            sampleSize = Math.min(sampleSize, mastered.length, perDay);
        }
        const sample = mastered.slice(0, sampleSize);
        const weakRoom = Math.max(0, perDay - sample.length);
        const weakTake = weak.slice(0, weakRoom);
        const queue = [
            ...weakTake.map((c) => ({ key: c.key, role: 'final-weak' })),
            ...sample.map((c) => ({ key: c.key, role: 'final-sample' })),
        ];
        return {
            queue,
            isFinal: true,
            newCount: 0,
            reviewCount: queue.length,
            finalWeak: weakTake.length,
            finalSample: sample.length,
            truncatedWeak: weak.length > weakTake.length,
            catchUp: { missedDays, extra: 0, capped: false },
            unscheduled: active.filter((c) => !c.introduced).length,
        };
    }

    const due = active
        .filter((c) => c.introduced && c.nextDue && c.nextDue <= today)
        .sort((a, b) => weakness(b, today) - weakness(a, today) || a.order - b.order);
    const fresh = active
        .filter((c) => !c.introduced && c.plannedIntro && c.plannedIntro <= today)
        .sort((a, b) => String(a.plannedIntro).localeCompare(String(b.plannedIntro)) || a.order - b.order);

    const reservedNew = Math.min(fresh.length, maxNewIntro(perDay), perDay);
    const reviewRoom = perDay - reservedNew;
    const reviews = due.slice(0, reviewRoom);
    const news = fresh.slice(0, reservedNew);
    const queue = [
        ...reviews.map((c) => ({ key: c.key, role: 'review' })),
        ...news.map((c) => ({ key: c.key, role: 'new' })),
    ];
    const used = new Set(queue.map((q) => q.key));
    const leftoverDue = due.filter((c) => !used.has(c.key));
    let extra = 0;
    let capped = false;
    const limit = catchUpLimit(perDay);
    if (missedDays > 0) {
        for (const c of leftoverDue) {
            if (queue.length >= limit) {
                capped = true;
                break;
            }
            queue.push({ key: c.key, role: 'review' });
            extra += 1;
        }
        if (leftoverDue.length > extra) capped = true;
    }

    return {
        queue,
        isFinal: false,
        newCount: queue.filter((q) => q.role === 'new').length,
        reviewCount: queue.filter((q) => q.role === 'review').length,
        finalWeak: 0,
        finalSample: 0,
        truncatedWeak: false,
        catchUp: { missedDays, extra, capped },
        unscheduled: active.filter((c) => !c.introduced && !c.plannedIntro).length,
    };
}

export function withModes(queue, mode) {
    const choice = mode === 'know' || mode === 'typed' ? mode : 'mixed';
    return (queue || []).map((item, i) => ({
        ...item,
        reps: 0,
        mode: choice === 'mixed' ? (i % 2 === 0 ? 'know' : 'typed') : choice,
    }));
}

/**
 * Move the queue after an answer. Typed misses are reinserted one card ahead
 * (sooner than a button miss, which goes to the end). A card is retried at most twice.
 */
export function advanceQueue(queue, index, { correct, typed }) {
    const next = (queue || []).slice();
    if (index < 0 || index >= next.length) return { queue: next, index };
    const item = next[index];
    next.splice(index, 1);
    if (!correct) {
        const reps = (item.reps || 0) + 1;
        if (reps <= 2) {
            const again = { ...item, reps };
            if (typed) {
                const pos = Math.min(next.length, index + 1);
                next.splice(pos, 0, again);
            } else {
                next.push(again);
            }
        }
    }
    return { queue: next, index: Math.min(index, next.length) };
}

export function readiness(plan, today) {
    const active = (plan.cards || []).filter((c) => !c.skipped);
    const total = active.length;
    const readyCards = active.filter((c) => {
        if (!c.introduced) return false;
        const recent = (c.recentCorrect || []).filter((d) => diffDays(d, today) <= 14 && diffDays(d, today) >= 0).length;
        const overdue = !!(c.nextDue && c.nextDue < today);
        return recent >= 2 && !overdue;
    });
    const ready = readyCards.length;
    const percent = total ? Math.round((100 * ready) / total) : 0;
    const study = studyDates(plan.startDate, plan.testDate);
    const elapsed = study.filter((d) => d < today).length;
    const expected = study.length ? Math.round((100 * Math.min(elapsed, study.length)) / study.length) : 0;
    let status = 'at-risk';
    if (elapsed === 0) status = 'on-track';
    else if (percent >= 70 || percent >= expected - 10) status = 'on-track';
    else if (percent >= 40 || percent >= expected - 30) status = 'behind';
    return { percent, status, ready, total, expected, elapsed };
}

export function calendarStrip(plan, today) {
    const dates = [...studyDates(plan.startDate, plan.testDate)];
    if (plan.testDate && !dates.includes(plan.testDate)) dates.push(plan.testDate);
    return dates.map((date) => ({
        date,
        isToday: date === today,
        isTest: date === plan.testDate,
        isPast: date < today,
        newCount: (plan.cards || []).filter((c) => !c.skipped && (c.introDate === date || (!c.introduced && c.plannedIntro === date))).length,
        studied: !!(plan.dayLog && plan.dayLog[date]),
    }));
}

export function nextActivityDate(plan, today) {
    const dates = [];
    for (const c of plan.cards || []) {
        if (c.skipped) continue;
        if (c.introduced && c.nextDue && c.nextDue > today) dates.push(c.nextDue);
        if (!c.introduced && c.plannedIntro && c.plannedIntro > today) dates.push(c.plannedIntro);
    }
    dates.sort();
    return dates[0] || null;
}

export function previewToday(plan, today) {
    const balanced = rebalancePlan(plan, today);
    const queue = buildTodayQueue(balanced, today);
    return {
        plan: balanced,
        ...queue,
        readiness: readiness(balanced, today),
        daysLeft: diffDays(today, balanced.testDate),
        nextDate: nextActivityDate(balanced, today),
    };
}

export function logSession(plan, today, stats) {
    const copy = clone(plan);
    copy.lastSessionDate = today;
    const prev = (copy.dayLog && copy.dayLog[today]) || { know: 0, miss: 0, cards: 0 };
    copy.dayLog = { ...(copy.dayLog || {}) };
    copy.dayLog[today] = {
        know: prev.know + (stats.know || 0),
        miss: prev.miss + (stats.miss || 0),
        cards: prev.cards + (stats.cards || 0),
    };
    copy.updatedAt = new Date().toISOString();
    return copy;
}

const api = {
    todayISO,
    addDays,
    diffDays,
    studyDates,
    introDayCount,
    cardsPerDay,
    termKey,
    answersMatch,
    targetSuccesses,
    createPlan,
    rebalancePlan,
    updatePlanSettings,
    syncTerms,
    trimToMaxTerms,
    intervalDays,
    applyAnswer,
    isWeak,
    catchUpLimit,
    buildTodayQueue,
    withModes,
    advanceQueue,
    readiness,
    calendarStrip,
    nextActivityDate,
    previewToday,
    logSession,
};

if (typeof globalThis.window !== 'undefined') {
    globalThis.TestCountdownScheduler = api;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    computeMaturaFreeWindow, getMaturaAssessAvailability,
    MATURA_ASSESS_FREE_PER_WINDOW, MATURA_ASSESS_COOLDOWN_MS,
} from './db.js';

const H = 60 * 60 * 1000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

test('two free assessments per 4-hour window', () => {
    assert.equal(MATURA_ASSESS_FREE_PER_WINDOW, 2);
    assert.equal(MATURA_ASSESS_COOLDOWN_MS, 4 * H);
});

test('computeMaturaFreeWindow counts uses inside the window', () => {
    const now = Date.now();
    assert.deepEqual(
        [computeMaturaFreeWindow(null, 0, now).freeRemaining, computeMaturaFreeWindow(null, 0, now).inWindow],
        [2, false],
    );
    const one = computeMaturaFreeWindow(new Date(now - H), 1, now);
    assert.equal(one.freeRemaining, 1);
    assert.equal(one.retryAfterMs, 0);
    const two = computeMaturaFreeWindow(new Date(now - H), 2, now);
    assert.equal(two.freeRemaining, 0);
    assert.ok(Math.abs(two.retryAfterMs - 3 * H) < 1000);
    // legacy row (count column defaulted to 0) with a recent use = 1 used, 1 left
    assert.equal(computeMaturaFreeWindow(new Date(now - H), 0, now).freeRemaining, 1);
    // expired window resets
    assert.equal(computeMaturaFreeWindow(new Date(now - 5 * H), 2, now).freeRemaining, 2);
});

test('availability: second assessment allowed, third blocked until window ends', () => {
    const fresh = getMaturaAssessAvailability({ email: 's@x.test' });
    assert.equal(fresh.available, true);
    assert.equal(fresh.freeRemaining, 2);
    const afterOne = getMaturaAssessAvailability({ email: 's@x.test', matura_assess_last_at: ago(10 * 60 * 1000), matura_assess_window_count: 1 });
    assert.equal(afterOne.available, true);
    assert.equal(afterOne.freeRemaining, 1);
    assert.equal(afterOne.usingCredits, false);
    const afterTwo = getMaturaAssessAvailability({ email: 's@x.test', matura_assess_last_at: ago(H), matura_assess_window_count: 2 });
    assert.equal(afterTwo.available, false);
    assert.equal(afterTwo.freeRemaining, 0);
    assert.ok(afterTwo.retryAfterMs > 2.9 * H && afterTwo.retryAfterMs <= 3 * H);
    assert.ok(afterTwo.nextAvailableAt);
    const withCredits = getMaturaAssessAvailability({ email: 's@x.test', matura_assess_last_at: ago(H), matura_assess_window_count: 2, matura_assess_credits: 3 });
    assert.equal(withCredits.available, true);
    assert.equal(withCredits.usingCredits, true);
});

test('UI copy reflects two per window', () => {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /one Matura criteria assessment every 4 hours/);
    assert.match(html, /function maturaFreeSlotsText/);
    assert.match(html, /two Matura criteria assessments every 4 hours/);
});

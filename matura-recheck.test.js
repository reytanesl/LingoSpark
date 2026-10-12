import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './matura-mistakes.js';
import { planMaturaRecheck, sanitizeMaturaReviewPayload } from './db.js';

const MM = globalThis.MaturaMistakes;
const ESSAY = 'Dear Editor, I am writing to complain about the new parking rules in our town. Last month I have went to the city centre and I recieved a fine despite of paying for the ticket, which was unfair.';

test('checkTranscriptionFix accepts small fixes, rejects rewrites', () => {
    assert.equal(MM.checkTranscriptionFix(ESSAY, ESSAY.replace('parking', 'parkinq').replace('town', 'tower')).ok, true);
    assert.equal(MM.checkTranscriptionFix(ESSAY, ESSAY.replace('city centre', 'city center')).ok, true);
    assert.equal(MM.checkTranscriptionFix(`<<err>>x<</err>> ${ESSAY}`, `x ${ESSAY}`).reason, 'unchanged');
    assert.equal(MM.checkTranscriptionFix(ESSAY, `  ${ESSAY}\n`).reason, 'unchanged');
    assert.equal(MM.checkTranscriptionFix(ESSAY, '').reason, 'empty');
    assert.equal(MM.checkTranscriptionFix(ESSAY, ESSAY.slice(0, 60)).reason, 'length_changed');
    assert.equal(MM.checkTranscriptionFix(ESSAY, `${ESSAY} ${ESSAY}`).reason, 'length_changed');
    const other = 'Hello friend, my summer holiday in Spain was wonderful because we swam every day and ate tasty food with my cousins, then visited old castles near the coast and beautiful museums.';
    assert.equal(MM.checkTranscriptionFix(ESSAY, other).reason, 'too_different');
});

test('planMaturaRecheck: one free recheck per original assessment', () => {
    const root = { id: 10, essay_text: ESSAY, root_id: null, free_recheck_used: false };
    const fixed = ESSAY.replace('town', 'towm');
    assert.deepEqual(
        { ...planMaturaRecheck({ run: root, root, editedText: fixed }), similarity: 0 },
        { eligible: true, reason: 'ok', rootId: 10, similarity: 0 },
    );
    const used = { ...root, free_recheck_used: true };
    assert.equal(planMaturaRecheck({ run: used, root: used, editedText: fixed }).reason, 'already_used');
    // a recheck run (child) points to its root; the root's flag decides
    const child = { id: 11, essay_text: fixed, root_id: 10, free_recheck_used: false };
    assert.equal(planMaturaRecheck({ run: child, root: used, editedText: ESSAY }).eligible, false);
    assert.equal(planMaturaRecheck({ run: child, root, editedText: ESSAY }).rootId, 10);
    assert.equal(planMaturaRecheck({ run: root, root, editedText: 'cats '.repeat(40) }).eligible, false);
    assert.equal(planMaturaRecheck({ run: null, root: null, editedText: fixed }).reason, 'unknown_assessment');
});

test('saved review keeps the assessment id for later rechecks', () => {
    assert.equal(sanitizeMaturaReviewPayload({ review: { assessmentId: 42 } }).assessmentId, 42);
    assert.equal(sanitizeMaturaReviewPayload({ review: { assessmentId: 'x' } }).assessmentId, null);
});

test('server wiring: recheck is text-only, claims atomically, skips quota when free', () => {
    const server = readFileSync(new URL('./server.js', import.meta.url), 'utf8');
    assert.match(server, /recheckOf/);
    assert.match(server, /A recheck uses your corrected text only/);
    assert.match(server, /!cooldown\.available && !recheck\?\.eligible/);
    assert.match(server, /claimMaturaFreeRecheck\(assessUser\.id, recheck\.rootId\)/);
    assert.match(server, /if \(!admin && !recheck\?\.free\)/);
    assert.match(server, /releaseMaturaFreeRecheck/);
    assert.match(server, /app\.put\('\/api\/matura\/reviews\/:id'/);
    const db = readFileSync(new URL('./db.js', import.meta.url), 'utf8');
    assert.match(db, /SET free_recheck_used = TRUE\s+WHERE user_id = \$1 AND id = \$2 AND free_recheck_used = FALSE/);
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    for (const id of ['matura-edit-btn', 'matura-edit-text', 'matura-edit-cancel', 'matura-edit-recheck']) assert.match(html, new RegExp(`id="${id}"`));
});

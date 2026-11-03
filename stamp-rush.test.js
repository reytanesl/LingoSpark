import assert from 'node:assert/strict';
import test from 'node:test';
import {
    STAMP_BOX_SIZE,
    STAMP_ROUNDS,
    createStampMatch,
    stampQuestionPayload,
    stampPublicView,
    stampWinners,
    submitStampAnswer,
} from './stamp-rush.js';

const DECK = Array.from({ length: 16 }, (_, i) => ({
    term: `term${i}`,
    definition: `definition ${i}`,
}));

test('Stamp Rush builds a shared 12-stamp box and unique player queues', () => {
    const m = createStampMatch({
        players: [
            { id: 'a', nickname: 'Ada' },
            { id: 'b', nickname: 'Bob' },
        ],
        deck: DECK,
        answerMode: 'recognise',
        seed: 7,
    });
    assert.equal(m.box.length, STAMP_BOX_SIZE);
    assert.equal(m.players.a.queue.length, STAMP_ROUNDS);
    assert.equal(m.players.b.queue.length, STAMP_ROUNDS);
    const aOrder = m.players.a.queue.map((q) => q.term).join(',');
    const bOrder = m.players.b.queue.map((q) => q.term).join(',');
    assert.notEqual(aOrder, bOrder);
    const q = stampQuestionPayload(m, 'a');
    assert.equal(q.stamp, true);
    assert.equal(q.box.length, 12);
    assert.equal(q.inputMode, 'choice');
    assert.equal(q.choices.length, 12);
});

test('correct stamps award speed points and advance the personal pile', () => {
    const m = createStampMatch({
        players: [{ id: 'a', nickname: 'Ada' }],
        deck: DECK,
        answerMode: 'realise',
        seed: 3,
    });
    const q = m.players.a.current;
    const now = q.dealtAt + 1_000;
    const out = submitStampAnswer(m, 'a', q.term, q.questionId, now);
    assert.equal(out.result.correct, true);
    assert.equal(out.result.stamps, 1);
    assert.ok(out.result.gain >= 100);
    assert.equal(out.nextQuestion, true);
    assert.ok(m.players.a.current);
    assert.notEqual(m.players.a.current.questionId, q.questionId);
});

test('solo player finishing all 12 ends the match', () => {
    const m = createStampMatch({
        players: [{ id: 'a', nickname: 'Solo' }],
        deck: DECK,
        answerMode: 'recognise',
        seed: 11,
    });
    for (let i = 0; i < STAMP_ROUNDS; i++) {
        const c = m.players.a.current;
        assert.ok(c, `missing question at ${i}`);
        submitStampAnswer(m, 'a', c.term, c.questionId, c.dealtAt + 4_000);
    }
    assert.equal(m.players.a.finished, true);
    assert.equal(m.finished, true);
    const w = stampWinners(m);
    assert.equal(w.winnerId, 'a');
    const view = stampPublicView(m);
    assert.equal(view.finished, true);
    assert.equal(view.players[0].stamps, 12);
});

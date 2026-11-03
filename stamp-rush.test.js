import assert from 'node:assert/strict';
import test from 'node:test';
import {
    STAMP_BOX_SIZE,
    STAMP_ROUNDS,
    createStampMatch,
    pickStampBox,
    stampQuestionPayload,
    stampPublicView,
    stampWinners,
    submitStampAnswer,
} from './stamp-rush.js';
import {
    buildStampClozePrompt,
    fallbackRealise,
    parseStampClozeReply,
    stampClozePackFromReply,
} from './stamp-rush-prompts.js';

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
    assert.match(q.body || q.sentence, /___/);
});

test('realise mode requires a changed form, not the base term', () => {
    const m = createStampMatch({
        players: [{ id: 'a', nickname: 'Ada' }],
        deck: DECK,
        answerMode: 'realise',
        seed: 3,
    });
    const q = m.players.a.current;
    assert.equal(q.inputMode, 'typed');
    assert.equal(q.formation, true);
    assert.ok(q.cue);
    assert.notEqual(String(q.answer).toLowerCase(), String(q.term).toLowerCase());

    const rejectBase = submitStampAnswer(m, 'a', q.term, q.questionId, Date.now());
    assert.equal(rejectBase.result.correct, false);
    assert.match(rejectBase.result.message, /change the form/i);

    const ok = submitStampAnswer(m, 'a', q.answer, q.questionId, Date.now() + 500);
    assert.equal(ok.result.correct, true);
    assert.equal(ok.result.stamps, 1);
});

test('AI cloze pack parses variants and fills gaps with fallbacks', () => {
    const { box } = pickStampBox(DECK, 9);
    const prompt = buildStampClozePrompt({ box, variantCount: 2, level: 'intermediate' });
    assert.match(prompt, /Return ONLY valid JSON/);
    assert.ok(prompt.includes(box[0].term));

    const reply = {
        cards: [{
            term: box[0].term,
            variants: [{
                recognise: { sentence: `We discussed ___ carefully today.`, answer: box[0].term },
                realise: { sentence: `Her ___ surprised everyone.`, cue: box[0].term.toUpperCase(), answer: `${box[0].term}ness` },
            }],
        }],
    };
    const pack = stampClozePackFromReply(reply, box, 2);
    assert.equal(Object.keys(pack).length, 12);
    assert.ok(pack[box[0].term.toLowerCase()].length >= 1);
    assert.match(pack[box[0].term.toLowerCase()][0].recognise.sentence, /___/);
    const parsed = parseStampClozeReply(reply, box);
    assert.ok(parsed.get(box[0].term.toLowerCase()).length >= 1);

    const fb = fallbackRealise('happy', 'feeling good', 0);
    assert.notEqual(fb.answer.toLowerCase(), 'happy');
    assert.match(fb.sentence, /___/);
});

test('correct stamps disappear from the remaining tray', () => {
    const m = createStampMatch({
        players: [{ id: 'a', nickname: 'Ada' }],
        deck: DECK,
        answerMode: 'recognise',
        seed: 5,
    });
    const first = m.players.a.current;
    assert.equal(first.choices.length, 12);
    submitStampAnswer(m, 'a', first.term, first.questionId, Date.now());
    assert.ok(m.players.a.usedTerms.includes(first.term));
    const next = stampQuestionPayload(m, 'a');
    assert.equal(next.remaining.length, 11);
    assert.ok(!next.remaining.map((t) => t.toLowerCase()).includes(first.term.toLowerCase()));
    assert.equal(next.choices.length, 11);
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
        submitStampAnswer(m, 'a', c.answer || c.term, c.questionId, c.dealtAt + 4_000);
    }
    assert.equal(m.players.a.finished, true);
    assert.equal(m.finished, true);
    const w = stampWinners(m);
    assert.equal(w.winnerId, 'a');
    const view = stampPublicView(m);
    assert.equal(view.finished, true);
    assert.equal(view.players[0].stamps, 12);
});

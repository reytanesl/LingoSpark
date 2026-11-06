import assert from 'node:assert/strict';
import test from 'node:test';
import {
    STAMP_BOX_SIZE,
    STAMP_ROUNDS,
    clozePackFromManualDeck,
    createStampMatch,
    parseStampQuestionList,
    pickStampBox,
    stampQuestionPayload,
    stampPublicView,
    stampWinners,
    submitStampAnswer,
} from './stamp-rush.js';

const DECK = Array.from({ length: 16 }, (_, i) => ({
    term: `term${i}`,
    definition: `What is term${i}?`,
}));

test('parseStampQuestionList reads 2-col and 3-col lines', () => {
    const text = [
        'apple\tA round fruit',
        'HAPPY\thappiness\tHer ___ was obvious.',
        'CREATE = creative = She gave a ___ answer.',
        'run - Move quickly on foot',
        'apple : ignored duplicate answer',
        'STRONG - strength - His ___ surprised us.',
        'not-a-pair',
    ].join('\n');
    const parsed = parseStampQuestionList(text);
    assert.equal(parsed.length, 5);
    assert.equal(parsed[0].term, 'apple');
    assert.equal(parsed[0].cue, null);
    assert.equal(parsed[1].term, 'happiness');
    assert.equal(parsed[1].cue, 'HAPPY');
    assert.equal(parsed[1].definition, 'Her ___ was obvious.');
    assert.equal(parsed[2].term, 'creative');
    assert.equal(parsed[2].cue, 'CREATE');
    assert.equal(parsed[3].cue, null);
    assert.equal(parsed[4].term, 'strength');
    assert.equal(parsed[4].cue, 'STRONG');
});

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
    assert.match(q.body || q.sentence, /What is term/);
    assert.equal(q.formation, false);
});

test('2-col realise mode accepts the exact stamp answer by typing', () => {
    const m = createStampMatch({
        players: [{ id: 'a', nickname: 'Ada' }],
        deck: DECK,
        answerMode: 'realise',
        seed: 3,
    });
    const q = m.players.a.current;
    assert.equal(q.inputMode, 'typed');
    assert.equal(q.formation, false);
    assert.equal(q.answer, q.term);

    const wrong = submitStampAnswer(m, 'a', 'not-the-answer', q.questionId, Date.now());
    assert.equal(wrong.result.correct, false);

    const ok = submitStampAnswer(m, 'a', q.term, q.questionId, Date.now() + 500);
    assert.equal(ok.result.correct, true);
    assert.equal(ok.result.stamps, 1);
});

test('3-col realise is word formation: reject cue, accept changed form', () => {
    const deck = Array.from({ length: 12 }, (_, i) => ({
        cue: `BASE${i}`,
        term: `form${i}`,
        definition: `Sentence with ___ number ${i}.`,
    }));
    const m = createStampMatch({
        players: [{ id: 'a', nickname: 'Ada' }],
        deck,
        answerMode: 'realise',
        seed: 4,
    });
    const q = m.players.a.current;
    assert.equal(q.inputMode, 'typed');
    assert.equal(q.formation, true);
    assert.ok(q.cue);
    assert.notEqual(String(q.answer).toLowerCase(), String(q.cue).toLowerCase());

    const rejectCue = submitStampAnswer(m, 'a', q.cue, q.questionId, Date.now());
    assert.equal(rejectCue.result.correct, false);
    assert.match(rejectCue.result.message, /change the form/i);

    const ok = submitStampAnswer(m, 'a', q.answer, q.questionId, Date.now() + 500);
    assert.equal(ok.result.correct, true);
    assert.equal(ok.result.stamps, 1);
});

test('manual cloze pack uses cue for realise when present', () => {
    const box = [
        { term: 'happiness', definition: 'Her ___ was clear.', cue: 'HAPPY' },
        ...Array.from({ length: 11 }, (_, i) => ({ term: `t${i}`, definition: `Q ${i}?`, cue: null })),
    ];
    const pack = clozePackFromManualDeck(box);
    const card = pack.happiness[0];
    assert.equal(card.recognise.formation, false);
    assert.equal(card.recognise.cue, null);
    assert.equal(card.realise.formation, true);
    assert.equal(card.realise.cue, 'HAPPY');
    assert.equal(card.realise.answer, 'happiness');
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

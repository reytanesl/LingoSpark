import assert from 'node:assert/strict';
import test from 'node:test';
import { createStampMatch, stampQuestionPayload, submitStampAnswer } from './stamp-rush.js';
import { fallbackRealise, isFormOf, isStrongClozeSentence, fallbackRecognise, stampClozePackFromReply, buildStampClozePrompt } from './stamp-rush-prompts.js';
import { createRoom, destroyRoom, joinRoom, publicRoomSnapshot } from './live-game.js';

const WORDS = ['market', 'happy', 'school', 'arrive', 'prepare', 'stop', 'visit', 'begin', 'careful', 'simple', 'luggage', 'box', 'city', 'knife', 'child', 'alarm clock', 'tie', 'decide'];

test('fallback word formation gives a real changed form of the base word in a one-gap sentence', () => {
    const expected = { market: 'markets', happy: 'happiness', arrive: 'arriving', stop: 'stopping', visit: 'visiting', begin: 'beginning', careful: 'carefully', simple: 'simply', luggage: 'luggage-free', box: 'boxes', city: 'cities', knife: 'knives', child: 'children', 'alarm clock': 'alarm clocks' };
    for (const w of WORDS) {
        for (let n = 0; n < 3; n++) {
            const r = fallbackRealise(w, '', n);
            assert.equal((r.sentence.match(/___/g) || []).length, 1, `${w}: one gap`);
            assert.notEqual(r.answer, w, `${w}: answer must change the base word`);
            assert.ok(isFormOf(r.answer, w), `${w} -> ${r.answer} is a form of the base word`);
            assert.doesNotMatch(r.answer, /(.)\1\1|tting$|-related$/, `${w}: no misspelled/odd forms (${r.answer})`);
        }
        if (expected[w]) assert.equal(fallbackRealise(w, '', 0).answer, expected[w]);
    }
    assert.equal(fallbackRealise('market', '').answer, 'markets');
    assert.equal(fallbackRealise('explain', 'to make clear').answer, 'explaining', 'definition "to ..." marks a verb');
});

test('AI realise answers that are not a form of the base word are replaced by valid fallbacks', () => {
    const box = WORDS.slice(0, 12).map((term) => ({ term, definition: `def ${term}` }));
    const reply = { cards: [
        { term: 'market', variants: [{ recognise: { sentence: 'We met at the ___ near our house yesterday afternoon.', answer: 'market' }, realise: { sentence: 'She works in ___ at a big company downtown.', cue: 'MARKET', answer: 'marketing' } }] },
        { term: 'happy', variants: [{ recognise: { sentence: 'I felt ___ after reading the letter from my friend.', answer: 'happy' }, realise: { sentence: 'The ___ was over before anyone could speak.', cue: 'HAPPY', answer: 'weekend' } }] },
    ] };
    const pack = stampClozePackFromReply(reply, box, 1);
    assert.equal(pack.market[0].realise.answer, 'marketing', 'genuine AI form kept');
    assert.notEqual(pack.happy[0].realise.answer, 'weekend', 'unrelated AI answer rejected');
    assert.ok(isFormOf(pack.happy[0].realise.answer, 'happy'));
});

test('typed cards: the word box shows base words (incl. this card\'s base word), never the answers', () => {
    const deck = WORDS.slice(0, 12).map((term) => ({ term, definition: `def ${term}` }));
    const m = createStampMatch({ players: [{ id: 'a', nickname: 'Ada' }], deck, answerMode: 'realise', seed: 3 });
    for (let round = 0; round < 12; round++) {
        const q = stampQuestionPayload(m, 'a');
        assert.equal(q.inputMode, 'typed');
        const base = m.players.a.current.term;
        const answer = m.players.a.current.realise?.answer || m.players.a.current.answer;
        assert.ok(q.remaining.includes(base), 'base word is in the box');
        assert.ok(!q.remaining.map((t) => t.toLowerCase()).includes(String(answer).toLowerCase()), 'answer itself is not in the box');
        assert.ok(isFormOf(answer, base), `${answer} is a form of ${base}`);
        assert.ok(q.remaining.every((t) => deck.some((d) => d.term === t)), 'box only holds deck base words');
        const r = submitStampAnswer(m, 'a', answer, q.questionId, Date.now());
        assert.equal(r.result.correct, true);
    }
    assert.equal(m.finished, true, 'solo game ends after 12 stamps');
});

test('Stamp Rush can start with one player; other formats still need two', () => {
    const deck = WORDS.slice(0, 12).map((term) => ({ term, definition: `def ${term}` }));
    const room = createRoom('host-solo', { deck, gameFormat: 'stamp-rush' });
    joinRoom(room.code, 'Solo', '10.7.0.1');
    const snap = publicRoomSnapshot(room);
    assert.equal(snap.minPlayers, 1);
    assert.equal(snap.canStart, true, 'Start button enabled with one player');
    destroyRoom(room.code, room.hostToken);
    const race = createRoom('host-race', { deck, gameFormat: 'race' });
    joinRoom(race.code, 'Solo', '10.7.0.2');
    assert.equal(publicRoomSnapshot(race).canStart, false);
    destroyRoom(race.code, race.hostToken);
});


test('AI prompt stresses topic, unambiguous word-formation context', () => {
    const prompt = buildStampClozePrompt({
        box: [{ term: 'passport', definition: 'an official travel document' }],
        variantCount: 2,
        topic: 'Travel and holidays',
    });
    assert.match(prompt, /Lesson topic/);
    assert.match(prompt, /Travel and holidays/);
    assert.match(prompt, /ONE natural form|unmistakable|prime importance/i);
});

test('fallback realise/recognise sentences are strong and topic-aware', () => {
    const travel = { term: 'passport', definition: 'an official document that lets you travel to another country' };
    const feel = { term: 'happy', definition: 'feeling or showing pleasure' };
    for (let n = 0; n < 3; n++) {
        const r = fallbackRealise(travel.term, travel.definition, n);
        assert.ok(isStrongClozeSentence(r.sentence, { term: travel.term, answer: r.answer, formation: true }), r.sentence);
        assert.match(r.sentence, /airport|journey|station|flight|bags|holiday|departure|train|travellers/i);
        const f = fallbackRealise(feel.term, feel.definition, n);
        assert.ok(isStrongClozeSentence(f.sentence, { term: feel.term, answer: f.answer, formation: true }), f.sentence);
    }
    const rec = fallbackRecognise(travel.term, travel.definition, 0);
    assert.ok(isStrongClozeSentence(rec.sentence, { term: travel.term, answer: travel.term }));
    assert.match(rec.sentence, /flight|journey|airport|travel/i);
    assert.equal(isStrongClozeSentence('The gap in this postcard is ___.', { term: 'arrive', answer: 'arrive' }), false);
});

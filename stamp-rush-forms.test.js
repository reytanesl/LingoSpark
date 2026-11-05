import assert from 'node:assert/strict';
import test from 'node:test';
import { createStampMatch, stampQuestionPayload, submitStampAnswer } from './stamp-rush.js';
import { fallbackRealise, isFormOf, isStrongClozeSentence, fallbackRecognise, stampClozePackFromReply, collectPackFrames, buildStampClozePrompt, CURATED_CLOZE, generateStampClozePack, mergeAiStampReply, listStampClozeGaps } from './stamp-rush-prompts.js';
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

test('fallback realise/recognise sentences are strong and word-specific', () => {
    const travel = { term: 'passport', definition: 'an official document that lets you travel to another country' };
    const feel = { term: 'happy', definition: 'feeling or showing pleasure' };
    const r = fallbackRealise(travel.term, travel.definition, 0);
    assert.ok(isStrongClozeSentence(r.sentence, { term: travel.term, answer: r.answer, formation: true }), r.sentence);
    assert.match(r.sentence, /control desk|embass|visa|boarding|jacket|plane/i);
    assert.ok(isFormOf(r.answer, 'passport'));
    const f = fallbackRealise(feel.term, feel.definition, 0);
    assert.ok(isStrongClozeSentence(f.sentence, { term: feel.term, answer: f.answer, formation: true }), f.sentence);
    assert.match(f.sentence, /face|letter|smile|news|happ/i);
    const rec = fallbackRecognise(travel.term, travel.definition, 0);
    assert.ok(isStrongClozeSentence(rec.sentence, { term: travel.term, answer: travel.term }));
    assert.equal(isStrongClozeSentence('The gap in this postcard is ___.', { term: 'arrive', answer: 'arrive' }), false);
});

test('a full fallback pack never reuses the same sentence frame', () => {
    const box = [
        ...['passport','border','journey','delay','ticket','arrive','depart','luggage','customs'],
        ...['happy','sad','angry','afraid','excited','lonely','careful'],
        ...['school','teacher','student','homework','exam','lesson','classroom'],
    ].map((term) => ({ term, definition: `def ${term}` }));
    const pack = stampClozePackFromReply(null, box, 2);
    const frames = collectPackFrames(pack);
    assert.ok(frames.length >= box.length * 2, 'at least one recognise+realise per term');
    assert.equal(frames.length, new Set(frames).size, 'no duplicate frames');
    // Spot-check: no banned generic frames.
    for (const f of frames) {
        assert.doesNotMatch(f, /several ___ waiting at the airport desk/);
        assert.doesNotMatch(f, /guide reminded everyone that ___ is essential/);
        assert.doesNotMatch(f, /preparing carefully before the next step/);
    }
    assert.ok(Object.keys(CURATED_CLOZE).length >= 20);
});

test('generateStampClozePack keeps AI cards and retries only gaps', async () => {
    const box = [
        { term: 'passport', definition: 'an official travel document' },
        { term: 'happy', definition: 'feeling pleasure' },
    ];
    let calls = 0;
    const runPrompt = async (prompt) => {
        calls += 1;
        if (calls === 1) {
            // First pass: only passport is valid; happy realise answer is junk.
            return {
                cards: [
                    {
                        term: 'passport',
                        variants: [{
                            recognise: { sentence: 'Show your ___ at the control desk before boarding the plane today.', answer: 'passport' },
                            realise: { sentence: 'Two ___ were checked carefully by the officer at the desk.', cue: 'PASSPORT', answer: 'passports' },
                        }],
                    },
                    {
                        term: 'happy',
                        variants: [{
                            recognise: { sentence: 'She looked really ___ after hearing the good news yesterday.', answer: 'happy' },
                            realise: { sentence: 'The ___ was over before anyone could speak aloud.', cue: 'HAPPY', answer: 'weekend' },
                        }],
                    },
                ],
            };
        }
        // Retry: only happy requested.
        assert.match(prompt, /ONLY these terms still need cards|still need cards/i);
        assert.match(prompt, /happy/i);
        assert.doesNotMatch(prompt, /passport —/);
        return {
            cards: [{
                term: 'happy',
                variants: [{
                    recognise: { sentence: 'The children felt ___ when the school trip was finally announced.', answer: 'happy' },
                    realise: { sentence: 'You could see the ___ on her face when she opened the letter.', cue: 'HAPPY', answer: 'happiness' },
                }],
            }],
        };
    };
    const pack = await generateStampClozePack({ box, variantCount: 1, runPrompt, maxAttempts: 3, timeoutMs: 5000 });
    assert.equal(calls, 2);
    assert.equal(pack.passport[0].realise.answer, 'passports');
    assert.equal(pack.passport[0].recognise.source, 'ai');
    assert.equal(pack.happy[0].realise.answer, 'happiness');
    assert.equal(pack.happy[0].recognise.source, 'ai');
});

test('generateStampClozePack warns and falls back only when AI is unavailable', async () => {
    const box = [
        { term: 'passport', definition: 'an official travel document' },
        { term: 'school', definition: 'a place where children learn' },
    ];
    const warnings = [];
    const pack = await generateStampClozePack({
        box,
        variantCount: 1,
        runPrompt: null,
        warn: (msg) => warnings.push(String(msg)),
    });
    assert.ok(warnings.some((w) => /AI unavailable/i.test(w)));
    assert.ok(pack.passport[0].recognise.sentence.includes('___'));
    assert.equal(pack.passport[0].recognise.source, 'fallback');

    const warnings2 = [];
    let calls = 0;
    const pack2 = await generateStampClozePack({
        box,
        variantCount: 1,
        maxAttempts: 2,
        timeoutMs: 1000,
        warn: (msg) => warnings2.push(String(msg)),
        runPrompt: async () => {
            calls += 1;
            throw new Error('boom');
        },
    });
    assert.equal(calls, 2);
    assert.ok(warnings2.some((w) => /incomplete after/i.test(w)));
    assert.ok(pack2.school[0].realise.answer);
});

test('mergeAiStampReply rejects weak cards without inserting fallbacks', () => {
    const box = [{ term: 'happy', definition: 'feeling pleasure' }];
    const pack = { happy: [] };
    const used = new Set();
    const added = mergeAiStampReply(pack, {
        cards: [{
            term: 'happy',
            variants: [{
                recognise: { sentence: 'The gap is ___.', answer: 'happy' },
                realise: { sentence: 'She felt ___ today.', cue: 'HAPPY', answer: 'happiness' },
            }],
        }],
    }, box, used);
    assert.equal(added, 0);
    assert.equal(pack.happy.length, 0);
    assert.equal(listStampClozeGaps(pack, box, 1).length, 1);
});

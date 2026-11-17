import assert from 'node:assert/strict';
import test from 'node:test';
import {
    SENTENCE_PICK, SENTENCE_PICK_PROMPT, isSentenceTerm, correctSentenceOf, diffOne, buildSentencePick, ruleVariants, ruleSentencePick,
    sentencePickFingerprints, buildSentencePickPrompt,
} from './track-sentence-pick.js';
import { planStage, createStageGenerator, validateStageRequest, orderStage, fingerprintsOf } from './track-stage.js';
import { answerLangOf, instructionPrompt, decorateItem, taskStructureReason } from './track-ai.js';
import { applyClarityRules, describeForJudge, buildClarityPrompt } from './track-clarity.js';

function seeded(seed = 1) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const SENTS = [['How are you?', 'Jak się masz?'], ['Where do you live?', 'Gdzie mieszkasz?'], ['She likes pizza.', 'Ona lubi pizzę.'], ['What time is it?', 'Która godzina?'],
    ['Can I help you?', 'Czy mogę ci pomóc?'], ['We are going to the cinema tomorrow.', 'Jutro idziemy do kina.']];
const WORDS = [['scarf', 'szalik'], ['dress', 'sukienka'], ['hat', 'czapka'], ['belt', 'pasek'], ['skirt', 'spódnica'], ['shirt', 'koszula'], ['coat', 'płaszcz'], ['shoes', 'buty']];
const MIXED = [...SENTS.slice(0, 3), ...WORDS].map(([en, pl], i) => ({ id: String(i + 1), en, pl, pos: '' }));
const ONLY_SENTS = SENTS.map(([en, pl], i) => ({ id: `s${i + 1}`, en, pl, pos: '' }));
const term = (en, pl = 'x', id = 't1') => ({ id, en, pl, pos: '' });

/* AI wrong copies a good model would write */
const AI_WRONG = {
    'How are you?': { wrong: 'How you are?', errorKind: 'word_order', explanation: 'W pytaniu „are” stoi przed „you”: How are you?' },
    'Where do you live?': { wrong: 'Where you live?', errorKind: 'wrong_word', explanation: 'W pytaniu potrzebne jest „do”: Where do you live?' },
    'She likes pizza.': { wrong: 'She like pizza.', errorKind: 'wrong_word', explanation: 'Po „she” czasownik ma końcówkę -s: likes.' },
    'What time is it?': { wrong: 'What time it is?', errorKind: 'word_order', explanation: 'W pytaniu „is” stoi przed „it”.' },
    'Can I help you?': { wrong: 'Can I to help you?', errorKind: 'wrong_word', explanation: 'Po „can” nie używamy „to”.' },
    'We are going to the cinema tomorrow.': { wrong: 'We are going to the cinema tomorow.', errorKind: 'spelling', explanation: 'Poprawna pisownia: „tomorrow”.' },
};
const FRAMES = ['I have a red X.', 'She has a new X.', 'We want a big X.', 'He has a small X.', 'You have a blue X.', 'My mum has a long X.', 'They want an old X.', 'My dad has a new X.'];
function mockAI({ terms, wrongFor = (s) => AI_WRONG[s], prompts = [] } = {}) {
    let k = 0;
    return async (prompt) => {
        prompts.push(prompt);
        const items = [];
        for (const m of prompt.matchAll(/- termId "([^"]+)": "([^"]+)" \(Polish meaning/g)) {
            const w = wrongFor(m[2]);
            if (w) items.push({ termId: m[1], ...w });
        }
        for (const m of prompt.matchAll(/- termId "([^"]+)": en "([^"]+)" \| pl "([^"]+)".*→ wanted: (.*)/g)) {
            const [, id, en, pl, wanted] = m;
            const others = terms.filter((t) => t.id !== id && !isSentenceTerm(t));
            for (const slot of wanted.split(',').map((s) => s.trim())) {
                const sentence = FRAMES[(k++) % FRAMES.length].replace('X', en);
                if (slot === 'sentenceGap') items.push({ termId: id, type: 'sentenceGap', sentence, answer: en, distractors: others.slice(0, 3).map((t) => t.en) });
                else if (slot === 'gapTranslate') items.push({ termId: id, type: 'gapTranslate', sentence, answer: en, distractors: others.slice(1, 4).map((t) => t.en), plTranslation: `Mam ${pl}.` });
                else if (slot === 'collocationPick') items.push({ termId: id, type: 'collocationPick', phrase: `a red ${en}`, answer: en, distractors: others.slice(0, 3).map((t) => t.en) });
                else if (slot === 'sentenceOrder') items.push({ termId: id, type: 'sentenceOrder', sentence, plTranslation: `Mam ${pl}.` });
                else if (slot.startsWith('meaningPick')) { const d = slot.split(':')[1]; items.push({ termId: id, type: 'meaningPick', direction: d, distractors: others.slice(2, 5).map((t) => (d === 'pl-en' ? t.en : t.pl)) }); }
                else if (slot === 'listenPick') items.push({ termId: id, type: 'listenPick', distractors: others.slice(3, 6).map((t) => t.en) });
            }
        }
        return { items, skipped: [] };
    };
}
const judgeWith = (verdictOf = () => 'ok') => ({
    rows: [],
    judgeRows: async function (level, rows) {
        for (const r of rows) { this.rows.push(r.entry.item); r.entry.item.clarity = { v: 2, verdict: verdictOf(r.entry.item), issues: [] }; }
        return { calls: 1, judged: rows.length };
    },
});
const V = (over) => { const r = validateStageRequest({ setId: 's', level: 'A1', terms: MIXED, ...over }); assert.ok(r.ok, JSON.stringify(r)); return r.value; };

function assertShape(it) {
    assert.equal(it.type, SENTENCE_PICK);
    assert.equal(it.prompt, 'Wybierz poprawne zdanie:');
    assert.ok(!/w nawiasie|lis|fox/i.test(it.prompt));
    assert.equal(it.options.length, 2);
    assert.ok([0, 1].includes(it.correctIndex));
    assert.equal(it.options[it.correctIndex], it.answer);
    assert.equal(it.options[1 - it.correctIndex], it.wrongOption);
    assert.notEqual(it.options[0], it.options[1]);
    assert.equal(it.answerLang, 'en');
    assert.equal(it.inputMode, 'choice');
    assert.equal(it.step, 0);
    assert.ok(['word_order', 'wrong_word', 'spelling'].includes(it.errorKind));
    assert.ok(it.explanation && it.explanation.length <= 180);
    assert.ok(diffOne(it.answer, it.wrongOption).ok, `${it.answer} / ${it.wrongOption}`);
    assert.equal(taskStructureReason(it), '');
}

/* ---------------------------------------------------------------- detection */

test('isSentenceTerm: sentences and questions yes; words, short phrases, phrasal verbs, collocations no', () => {
    for (const en of ['How are you?', 'What time is it?', 'She likes pizza.', 'I like pizza', 'There is a cat here', 'Can I help you?', 'What a pity!', 'Please sit down'])
        assert.equal(isSentenceTerm(term(en)), true, en);
    for (const en of ['scarf', 'take off', 'in front of', 'a piece of cake', 'do the shopping', 'have a shower', 'how to cook', 'be good at', 'look forward to sth', 'Hello!', "What's up?"])
        assert.equal(isSentenceTerm(term(en)), false, en);
    assert.equal(isSentenceTerm({ id: '1', en: 'nice to meet you', pl: 'miło cię poznać', pos: 'sentence' }), true);
    assert.equal(correctSentenceOf(term('how are you?')), 'How are you?');
});

/* ---------------------------------------------------------------- one change only */

test('diffOne: exactly one move / replacement / added or dropped word; punctuation and capitals alone are no mistake', () => {
    assert.equal(diffOne('Where are you from?', 'Where you are from?').shape, 'order');
    assert.equal(diffOne('I always go to school.', 'I go always to school.').shape, 'order');
    assert.equal(diffOne('She likes pizza.', 'She like pizza.').shape, 'substitution');
    assert.equal(diffOne('Where do you live?', 'Where you live?').shape, 'deletion');
    assert.equal(diffOne('I can swim.', 'I can to swim.').shape, 'insertion');
    assert.equal(diffOne('How are you?', 'how are you').ok, false);
    assert.equal(diffOne('She likes pizza.', 'He like pizza.').ok, false);
    assert.equal(diffOne('Where are you from?', 'From where you are?').ok, false);
    assert.equal(diffOne('I can swim.', 'I can to swim well.').ok, false);
});

/* ---------------------------------------------------------------- item */

test('buildSentencePick: app shape, random correct index that always matches, Polish meaning as the only hint', () => {
    const t = term('Where are you from?', 'Skąd jesteś?');
    const seen = new Set();
    const r = seeded(3);
    for (let i = 0; i < 40; i++) {
        const b = buildSentencePick({ wrong: 'where you are from', errorKind: 'word_order', explanation: 'W pytaniu „are” stoi przed „you”.' }, t, 'A1', r);
        assert.ok(b.ok, b.reason);
        assertShape(b.item);
        assert.equal(b.item.lexiconId, 't1');
        assert.equal(b.item.wrongOption, 'Where you are from?'); // same capital and end punctuation as the correct one
        assert.deepEqual(b.item.hintHelp, { translation: 'Skąd jesteś?', segments: [] }); // no segments: they would show the correct sentence
        seen.add(b.item.correctIndex);
    }
    assert.deepEqual([...seen].sort(), [0, 1]);
});

test('buildSentencePick: wrong copies that are not ONE clear mistake are rejected', () => {
    const bad = (en, wrong) => assert.equal(buildSentencePick({ wrong }, term(en), 'B1', () => 0.3).ok, false, `${en} -> ${wrong}`);
    bad('What is your favourite colour?', 'What is your favourite color?'); // US spelling is not a mistake
    bad('I think that he is right.', 'I think he is right.'); // optional word
    bad('He is very tall.', 'He is tall.');
    bad('How are you?', 'How are you.'); // punctuation only
    bad('How are you?', 'Jak się masz?');
    bad('She likes pizza.', 'He like pizza.'); // two changes
    bad('She likes pizza.', '');
    bad('She likes pizza.', 'She likes ___.');
    bad('scarf', 'scraf'); // not a sentence term
    const ok = buildSentencePick({ wrong: 'She like pizza.', errorKind: 'nonsense', explanation: '' }, term('She likes pizza.'), 'A1', () => 0.9);
    assert.ok(ok.ok);
    assert.equal(ok.item.errorKind, 'wrong_word');
    assert.match(ok.item.explanation, /She likes pizza\./); // default Polish feedback when the AI gave none
});

test('rule-built wrong copies: typical Polish-learner mistakes, always exactly one change', () => {
    const want = {
        'How are you?': 'How you are?',
        'Where do you live?': 'Where you live?',
        'What time is it?': 'What time it is?',
        'She likes pizza.': 'She like pizza.',
        'Can I help you?': 'Can I to help you?',
        'What is your name?': 'What are your name?',
        'We are going to the cinema tomorrow.': 'We is going to the cinema tomorrow.',
    };
    for (const [en, wrong] of Object.entries(want)) {
        const list = ruleVariants(en);
        assert.ok(list.some((v) => v.wrong === wrong), `${en}: ${JSON.stringify(list)}`);
        for (const v of list) { assert.ok(diffOne(en, v.wrong).ok); assert.ok(v.explanation); }
    }
    assert.ok(ruleVariants('My friend lives near the beautiful park.').some((v) => v.errorKind === 'spelling' && v.wrong.includes('beatiful')));
    const it = ruleSentencePick(term('Where are you from?'), 'A1', () => 0.1);
    assertShape(it);
    assert.equal(it.variantSource, 'rule');
    const other = ruleSentencePick(term('Where are you from?'), 'A1', () => 0.1, { avoidWrong: [it.wrongOption] });
    assert.ok(other && other.wrongOption !== it.wrongOption);
});

test('instruction, answer language, fingerprints: a sentence term keeps coming back (word-level fp), the exact pair has its own fp', () => {
    const it = ruleSentencePick(term('She likes pizza.', 'x', '7'), 'A1', () => 0.2);
    assert.equal(instructionPrompt(it), SENTENCE_PICK_PROMPT);
    assert.equal(answerLangOf(it), 'en');
    const d = decorateItem({ ...it }, 'A1', term('She likes pizza.', 'x', '7'));
    assert.equal(d.prompt, 'Wybierz poprawne zdanie:'); assert.equal(d.step, 0); assert.equal(d.cue, undefined);
    const fp = fingerprintsOf(it);
    assert.deepEqual(fp, sentencePickFingerprints(it));
    const it2 = buildSentencePick({ wrong: 'She likes piza.' }, term('She likes pizza.', 'x', '7'), 'A1', () => 0.2).item;
    assert.equal(fingerprintsOf(it2).textFp, fp.textFp);
    assert.notEqual(fingerprintsOf(it2).fp, fp.fp);
});

test('the AI prompt asks for one typical mistake, the right kinds, a Polish explanation, and lists the sentences as data', () => {
    const p = buildSentencePickPrompt({ level: 'A1', jobs: [{ term: ONLY_SENTS[0], preferKind: 'word_order' }] });
    assert.match(p, /EXACTLY ONE deliberate mistake/);
    assert.match(p, /word_order\|wrong_word\|spelling/);
    assert.match(p, /- termId "s1": "How are you\?" \(Polish meaning: "Jak się masz\?"\) → preferred mistake: word_order/);
    assert.match(p, /intonation questions/);
    assert.ok(!/w nawiasie/i.test(p));
});

/* ---------------------------------------------------------------- planning */

test('planStage: sentence terms always get sentencePick, word terms never; A1 stays typed-free; sentence-gap choice still leads for words', () => {
    let gaps = 0; let picks = 0;
    for (let seed = 1; seed <= 40; seed++) {
        const { entries } = planStage({ level: 'A1', terms: MIXED, size: 6, kind: 'station', rand: seeded(seed) });
        for (const e of entries) {
            if (isSentenceTerm(e.term)) { assert.equal(e.slot, SENTENCE_PICK); picks++; } else assert.notEqual(e.slot, SENTENCE_PICK);
            assert.ok(!['translateType', 'dictation', 'wordFormation', 'keyTransform', 'letterScramble'].includes(e.slot));
            if (e.slot === 'sentenceGap') gaps++;
        }
        const real = entries.filter((e) => !e.spare);
        const per = new Map(); real.forEach((e) => per.set(e.term.id, (per.get(e.term.id) || 0) + 1));
        for (const [id, n] of per) if (isSentenceTerm(MIXED.find((t) => t.id === id))) assert.equal(n, 1); // one pick per sentence and stage
    }
    assert.ok(picks > 0 && gaps > 0);
});

/* ---------------------------------------------------------------- generator */

test('generator A1 + B1: sentence terms come back as sentencePick written by the AI and judged; words keep their task mix', async () => {
    for (const level of ['A1', 'B1']) {
        const prompts = []; const judge = judgeWith();
        const gen = createStageGenerator({ runPrompt: mockAI({ terms: MIXED, prompts }), judge, rand: seeded(5) });
        const out = await gen(V({ level, size: 8, kind: 'daily' }));
        assert.equal(out.items.length, 8);
        const picks = out.items.filter((i) => i.type === SENTENCE_PICK);
        const sentIds = MIXED.filter(isSentenceTerm).map((t) => t.id);
        for (const it of out.items) assert.equal(it.type === SENTENCE_PICK, sentIds.includes(it.lexiconId), `${it.type} ${it.lexiconId}`);
        assert.ok(picks.length >= 1, level);
        for (const it of picks) {
            assertShape(it);
            assert.equal(it.source, 'ai'); assert.equal(it.variantSource, 'ai'); assert.equal(it.judged, true);
            assert.match(it.id, new RegExp(`^st0-\\d+-${it.lexiconId}-sentencePick$`));
            assert.equal(it.wrongOption, AI_WRONG[it.answer].wrong);
        }
        assert.ok(judge.rows.some((r) => r.type === SENTENCE_PICK));
        assert.ok(prompts.some((p) => p.includes('choose the correct sentence')));
        assert.ok(!prompts.some((p) => p.includes('→ wanted:') && /How are you\?|Where do you live\?|She likes pizza\./.test(p.split('TARGET TERMS')[1]?.split('WHOLE SET')[0] || '')));
        assert.equal(out.meta.sentencePick.served, picks.length);
        assert.equal(out.meta.fallback, null);
    }
});

test('generator: an invalid AI wrong copy -> rule-built copy; a copy the judge finds acceptable -> another, rule-built mistake', async () => {
    const gen = createStageGenerator({ runPrompt: mockAI({ terms: ONLY_SENTS, wrongFor: (s) => ({ wrong: s === 'How are you?' ? 'How are you.' : 'Totally different words here now?' }) }), judge: judgeWith(), rand: seeded(2) });
    const out = await gen(V({ terms: ONLY_SENTS, size: 6 }));
    assert.equal(out.items.length, 6);
    for (const it of out.items) { assertShape(it); assert.equal(it.variantSource, 'rule'); assert.equal(it.source, 'template'); }
    assert.ok(out.meta.rejected.validator >= 6);

    const judge = judgeWith((item) => (item.variantSource === 'ai' ? 'unclear' : 'ok'));
    const gen2 = createStageGenerator({ runPrompt: mockAI({ terms: ONLY_SENTS }), judge, rand: seeded(4) });
    const out2 = await gen2(V({ terms: ONLY_SENTS, size: 6, level: 'B1' }));
    assert.equal(out2.items.length, 6);
    for (const it of out2.items) {
        assertShape(it);
        assert.equal(it.variantSource, 'rule');
        assert.notEqual(it.wrongOption, AI_WRONG[it.answer].wrong); // never the copy the judge rejected
    }
});

test('generator: no AI / AI down -> sentence terms still get a rule-built sentencePick, never a word task', async () => {
    for (const runPrompt of [null, async () => { throw new Error('down'); }]) {
        const gen = createStageGenerator({ runPrompt, rand: seeded(9) });
        const out = await gen(V({ size: 8, kind: 'daily' }));
        assert.equal(out.items.length, 8);
        const sentIds = MIXED.filter(isSentenceTerm).map((t) => t.id);
        for (const it of out.items) {
            if (sentIds.includes(it.lexiconId)) { assertShape(it); assert.equal(it.source, 'template'); } else assert.notEqual(it.type, SENTENCE_PICK);
        }
        assert.ok(out.items.some((i) => i.type === SENTENCE_PICK));
    }
    // a set of only 3 sentences and a 6-question station: each sentence twice, with two different mistakes
    const three = ONLY_SENTS.slice(1, 4); // each has 2+ rule-built mistakes
    const out = await createStageGenerator({ runPrompt: null, rand: seeded(1) })(V({ terms: three, size: 6 }));
    assert.equal(out.items.length, 6);
    for (const t of three) {
        const mine = out.items.filter((i) => i.lexiconId === t.id);
        assert.equal(mine.length, 2);
        assert.notEqual(mine[0].wrongOption, mine[1].wrongOption);
    }
});

test('generator: sentence terms are never dropped as "already seen" — the SRS can bring them back stage after stage', async () => {
    const gen = createStageGenerator({ runPrompt: mockAI({ terms: ONLY_SENTS }), judge: judgeWith(), rand: seeded(7) });
    const recent = [];
    for (let stage = 0; stage < 4; stage++) {
        const out = await gen(V({ terms: ONLY_SENTS, size: 6, stageIndex: stage, recentFingerprints: recent }));
        assert.equal(out.items.length, 6);
        out.items.forEach(assertShape);
        assert.equal(new Set(out.items.map((i) => i.lexiconId)).size, 6);
        out.items.forEach((i) => recent.push(i.fp, i.textFp));
    }
});

test('orderStage keeps sentencePick in the English-answer block', () => {
    const sp = ruleSentencePick(term('She likes pizza.', 'x', 'a'), 'A1', () => 0.2);
    const mp = { type: 'meaningPick', direction: 'en-pl', lexiconId: 'b' };
    const out = orderStage([sp, mp, { ...sp, lexiconId: 'c' }], seeded(1));
    assert.equal(out[0].type, 'meaningPick');
});

/* ---------------------------------------------------------------- judge */

test('clarity judge: sentencePick is described with both sentences; a wrong option that is also correct is unclear at EVERY level', () => {
    const t = term('I often go to the cinema.');
    const it = buildSentencePick({ wrong: 'I go often to the cinema.', errorKind: 'word_order', explanation: 'Przysłówek „often” stoi przed czasownikiem.' }, t, 'B2', () => 0.1).item;
    const d = describeForJudge(it, 'B2', t, 0);
    assert.equal(d.instruction, 'Wybierz poprawne zdanie:');
    assert.equal(d.options.length, 2); assert.equal(d.storedAnswer, 'I often go to the cinema.'); assert.equal(d.mistakeKind, 'word_order');
    assert.match(buildClarityPrompt([d], 'B2'), /sentencePick tasks/);
    for (const level of ['A1', 'B1', 'C1']) {
        const r = applyClarityRules({ item: it, level, verdict: { clear: true, issues: [], defensibleOptions: ['I go often to the cinema.'], otherAnswers: [], note: '' } });
        assert.equal(r.verdict.verdict, 'unclear', level);
        assert.deepEqual(r.extra, []);
    }
    const fine = applyClarityRules({ item: it, level: 'B1', verdict: { clear: true, issues: [], defensibleOptions: [], otherAnswers: [], note: '' } });
    assert.equal(fine.verdict.verdict, 'ok');
});

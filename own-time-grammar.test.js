import assert from 'node:assert/strict';
import test from 'node:test';
import {
    UOE_FORMATS, UOE_LEVELS, GRAMMAR_UOE_FORMATS, grammarFormatsFor, isGrammarUoeTask,
    ensureGrammarTasks, normalizeOwnTimeLesson, buildOwnTimeLessonPrompt, uoeInstruction,
    buildUoeItem, resolveUoeFormat, validateOwnTimeGenerateRequest, instructionAudience,
    adaptTaskInstruction, taskInstruction,
} from './own-time-prompts.js';

test('grammar UOE formats exist and are marked', () => {
    for (const f of ['tense_form', 'error_correction', 'sentence_rewrite', 'grammar_mc']) {
        assert.ok(UOE_FORMATS[f], f);
        assert.equal(UOE_FORMATS[f].grammar, true);
        assert.ok(GRAMMAR_UOE_FORMATS.includes(f));
    }
    assert.ok(GRAMMAR_UOE_FORMATS.includes('brackets'));
    assert.ok(GRAMMAR_UOE_FORMATS.includes('transformation'));
});

test('grammar formats are level-appropriate (A1…C1 / E8 / matura)', () => {
    assert.deepEqual(grammarFormatsFor('A1').sort(), ['brackets', 'error_correction', 'grammar_mc', 'tense_form'].sort());
    assert.ok(grammarFormatsFor('A2').includes('sentence_rewrite'));
    assert.ok(grammarFormatsFor('A2').includes('tense_form'));
    assert.ok(grammarFormatsFor('B1').includes('error_correction'));
    assert.ok(grammarFormatsFor('B2').includes('transformation'));
    assert.ok(grammarFormatsFor('B2').includes('sentence_rewrite'));
    assert.ok(!grammarFormatsFor('A1').includes('transformation'));
    assert.ok(UOE_LEVELS.A2.formats.includes('error_correction'));
    assert.ok(UOE_LEVELS.B1.formats.includes('sentence_rewrite'));
});

test('taskPrefs accepts grammar; prompt requires grammar formats', () => {
    const v = validateOwnTimeGenerateRequest({
        profile: { cefr: 'B1', age: 16, taskPrefs: ['grammar', 'writing'], intensity: 'standard', instrLang: 'pl' },
    });
    assert.ok(v.ok);
    assert.deepEqual(v.value.taskPrefs, ['grammar', 'writing']);
    const p = buildOwnTimeLessonPrompt(v.value);
    assert.match(p, /5c\. GRAMMAR/);
    assert.match(p, /tense_form/);
    assert.match(p, /error_correction/);
    assert.match(p, /sentence_rewrite/);
    assert.match(p, /grammar→uoe/);
    // Instructions must forbid a word box; the prompt may mention the ban.
    assert.match(p, /Never mention a word box|NEVER use a word box|Never a word box/i);
    assert.doesNotMatch(p, /put the answers in a word box|words from the box above/i);
});

test('buildUoeItem normalises error_correction and sentence_rewrite', () => {
    const ec = buildUoeItem('error_correction', {
        lead: 'She go to school every day.',
        answer: 'goes',
        acceptedAnswers: ['She goes to school every day.'],
    }, 'A2');
    assert.equal(ec.lead, 'She go to school every day.');
    assert.equal(ec.answer, 'goes');
    assert.ok(ec.alts.includes('She goes to school every day.'));

    const sr = buildUoeItem('sentence_rewrite', {
        lead: 'They built the house in 1990.',
        rule: 'passive',
        q: 'The house ___ in 1990.',
        answer: 'was built',
        acceptedAnswers: ['was built by them'],
    }, 'B1');
    assert.equal(sr.rule, 'PASSIVE');
    assert.equal(sr.answer, 'was built');
    assert.match(sr.q, /___/);

    assert.equal(buildUoeItem('error_correction', { answer: 'x' }, 'A2'), null);
    const tf = buildUoeItem('tense_form', { q: 'Yesterday she ___.', cue: 'go', answer: 'went', acceptedAnswers: ["didn't go"] }, 'A1');
    assert.equal(tf.cue, 'go');
    assert.equal(tf.answer, 'went');
});

test('resolveUoeFormat keeps A1 unknown formats on simple; accepts tense_form', () => {
    assert.equal(resolveUoeFormat({ format: 'transformation' }, 'A1'), 'simple');
    assert.equal(resolveUoeFormat({ format: 'tense_form' }, 'A1'), 'tense_form');
    assert.equal(resolveUoeFormat({ format: 'error_correction' }, 'A2'), 'error_correction');
    assert.equal(resolveUoeFormat({ items: [{ q: 'I ___ (go).', answer: 'went' }] }, 'A2'), 'brackets');
});

test('normalizeOwnTimeLesson keeps grammar formats + age-aware polecenia', () => {
    const kid = normalizeOwnTimeLesson({
        title: 'G', cefr: 'A1',
        tasks: [
            { type: 'uoe', format: 'tense_form', instruction: 'Uzupełnij zdania. Wpisz w każdą lukę wyrazy podane w nawiasach w odpowiedniej formie. Jeśli to konieczne, dodaj inne wyrazy.', items: [
                { q: 'She ___ to school.', cue: 'go', answer: 'goes' },
                { q: 'They ___ yesterday.', cue: 'play', answer: 'played' },
            ] },
            { type: 'uoe', format: 'error_correction', instruction: 'x', items: [
                { lead: 'He have a cat.', answer: 'has' },
                { lead: 'I is happy.', answer: 'am' },
            ] },
            { type: 'vocab_drill', instruction: 'Uzupełnij', items: [{ q: 'dog', answer: 'pies' }] },
            { type: 'reading', instruction: 'Przeczytaj', prompt: 'Anna has a red bike. She rides it in the park.', items: [{ q: 'What colour is the bike?', answer: 'red' }] },
            { type: 'writing', instruction: 'Napisz', prompt: 'Write about your hobby.' },
        ],
    }, { age: 9, cefr: 'A1', instrLang: 'pl', taskPrefs: ['grammar'] });
    const kidTf = kid.tasks.find((t) => t.format === 'tense_form');
    const kidEc = kid.tasks.find((t) => t.format === 'error_correction');
    assert.ok(kidTf && kidEc);
    assert.match(kidTf.instruction, /czasownik|czasie/i);
    assert.doesNotMatch(kidTf.instruction, /maksymalnie trzy wyrazy|spójny i poprawny/i);
    assert.match(kidEc.instruction, /Kliknij|wyraz|błąd|popraw/i);
    assert.ok(kid.tasks.filter(isGrammarUoeTask).length >= 2);
    assert.doesNotMatch(kidTf.instruction, /ramka|word box|Use these words/i);

    const matura = normalizeOwnTimeLesson({
        title: 'G2', cefr: 'B2',
        tasks: [
            { type: 'uoe', format: 'sentence_rewrite', instruction: 'x', items: [
                { lead: 'Somebody stole my bike.', rule: 'PASSIVE', q: 'My bike ___.', answer: 'was stolen' },
                { lead: '“I am tired,” she said.', rule: 'REPORTED SPEECH', q: 'She said that she ___.', answer: 'was tired' },
                { lead: 'If it rains, we will stay.', rule: 'SECOND CONDITIONAL', q: 'If it ___, we would stay.', answer: 'rained' },
            ] },
            { type: 'uoe', format: 'error_correction', instruction: 'x', items: [
                { lead: 'If I would be rich, I would travel.', answer: 'were' },
                { lead: 'She suggested to go home.', answer: 'going' },
            ] },
            { type: 'uoe', format: 'open_cloze', instruction: 'x', prompt: 'I have lived here {{1}} 2010.', items: [{ q: '', answer: 'since' }] },
            { type: 'reading', instruction: 'Przeczytaj', prompt: 'Climate change affects cities worldwide. Floods are more common now.', items: [{ q: 'What are more common now?', answer: 'floods' }] },
            { type: 'writing', instruction: 'Napisz', prompt: 'Write about a problem in your town.' },
        ],
    }, { age: 17, cefr: 'B2', instrLang: 'pl', taskPrefs: ['grammar'] });
    const sr = matura.tasks.find((t) => t.format === 'sentence_rewrite');
    assert.ok(sr);
    assert.equal(sr.items[0].rule, 'PASSIVE');
    assert.match(sr.instruction, /Przekształć|strona bierna|mowa zależna|maksymalnie/i);
    assert.ok(matura.tasks.filter(isGrammarUoeTask).length >= 2);
});

test('ensureGrammarTasks promotes verb-form uoe when grammar preferred', () => {
    const tasks = [
        { type: 'uoe', format: 'simple', instruction: 'Uzupełnij czasownik', items: [
            { q: 'She ___ home.', cue: 'go', answer: 'went' },
            { q: 'He ___ now.', cue: 'eat', answer: 'is eating' },
        ] },
        { type: 'vocab_drill', instruction: 'Uzupełnij', items: [{ q: 'x', answer: 'y' }] },
        { type: 'writing', instruction: 'Napisz', prompt: 'p', items: [] },
        { type: 'reading', instruction: 'Przeczytaj', prompt: 'Tom lives in a city. He likes parks.', items: [{ q: 'Where does Tom live?', answer: 'in a city' }] },
        { type: 'vocab_drill', instruction: 'Uzupełnij', items: [{ q: 'a', answer: 'b' }] },
    ];
    const { tasks: out, grammarShort } = ensureGrammarTasks(tasks, 'A2', ['grammar']);
    assert.ok(out.some((t) => t.format === 'tense_form'));
    assert.ok(grammarShort <= 1);
    const none = ensureGrammarTasks(tasks, 'A2', ['vocab']);
    assert.equal(none.tasks[0].format, 'simple');
});

test('polecenia for grammar differ kid A1 vs E8 A2 vs matura B2', () => {
    const kid = uoeInstruction('tense_form', 'A1', { age: 9 });
    const e8 = uoeInstruction('error_correction', 'A2', { age: 14 });
    const b2 = uoeInstruction('sentence_rewrite', 'B2', { age: 17 });
    assert.match(kid, /czasownik|czasie/i);
    assert.ok(kid.length < 90);
    assert.match(e8, /Kliknij|błąd|wyraz/i);
    assert.match(b2, /Przekształć|strona bierna|mowa zależna/i);
    assert.notEqual(kid, e8);
    const audKid = instructionAudience({ age: 9, cefr: 'A1' });
    const audExam = instructionAudience({ age: 14, cefr: 'A2' });
    assert.equal(audKid.band, 'kid');
    assert.equal(audExam.band, 'exam');
    const adapted = adaptTaskInstruction({
        type: 'uoe', format: 'tense_form',
        instruction: 'Uzupełnij zdania. Wpisz w każdą lukę wyrazy podane w nawiasach w odpowiedniej formie. Jeśli to konieczne, dodaj inne wyrazy, tak aby otrzymać logiczne i gramatycznie poprawne zdania.',
    }, { age: 9, cefr: 'A1', instrLang: 'pl' });
    assert.match(adapted.instruction, /czasownik|czasie/i);
    assert.doesNotMatch(adapted.instruction, /maksymalnie trzy/);
});

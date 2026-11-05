import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWordCues, alignInstructionWithBox, instructionCueRefs, cueRuleText, normalizeOwnTimeLesson, BOX_DISTRACTORS } from './own-time-prompts.js';
import { OWN_TIME_MOCK_LOW_REPLY, OWN_TIME_MOCK_REPLY, OWN_TIME_MOCK_EXTRA_REPLY } from './own-time-fixtures.js';

const two = [{ q: 'I ___ ok.', answer: 'am' }, { q: 'We ___ ok.', answer: 'are' }];

test('word boxes are never created — legacy banks are stripped', () => {
    const t = applyWordCues({
        type: 'vocab_drill',
        instruction: 'Complete with words from the box. There are two extra words.',
        items: two,
        wordBank: ['am', 'are', 'is', 'be'],
    }, { tier: 0 });
    assert.equal(t.wordBank, undefined);
    assert.equal(t.boxExtra, undefined);
    assert.equal(t.autoWordBank, undefined);
    assert.equal(instructionCueRefs(t.instruction).box, false);
    assert.doesNotMatch(t.instruction, /box|extra word|ramk|zbędn/i);
});

test('cueRuleText forbids word boxes (mentions only to ban them)', () => {
    for (const tier of [0, 1, 2, 3]) {
        const s = cueRuleText(tier);
        assert.match(s, /Never (use )?a word box|Never a word box/i);
        assert.doesNotMatch(s, /use a word box with|wordBank":/i);
        assert.match(s, /bracket|NO cues/i);
    }
    assert.deepEqual(BOX_DISTRACTORS, [[0, 0], [0, 0], [0, 0], [0, 0]]);
});

test('legacy instruction mentioning a box is rewritten; bracket tasks keep bracket wording', () => {
    const open = alignInstructionWithBox({
        type: 'vocab_drill',
        instruction: 'Uzupełnij każde zdanie jednym słowem z ramki. Dwa wyrazy są zbędne.',
        items: [{ q: 'a ___', answer: 'x' }],
    });
    assert.equal(instructionCueRefs(open.instruction).box, false);
    assert.doesNotMatch(open.instruction, /ramk|zbędn|box/i);

    const cued = applyWordCues({
        type: 'vocab_drill',
        instruction: 'Complete with one word from the box.',
        items: [{ q: 'I ___ (go).', answer: 'went' }, { q: 'We ___ (play).', answer: 'played' }],
    }, { tier: 0 });
    assert.equal(cued.wordBank, undefined);
    assert.equal(cued.instruction, 'Complete the gaps with the correct form of the words in brackets.');
    assert.deepEqual(cued.items.map((i) => i.cue), ['go', 'play']);
});

test('normalised mock lessons never keep a wordBank or box instruction', () => {
    for (const reply of [OWN_TIME_MOCK_LOW_REPLY, OWN_TIME_MOCK_REPLY, OWN_TIME_MOCK_EXTRA_REPLY]) {
        const L = normalizeOwnTimeLesson(reply, { cefr: reply.cefr || 'A2', instrLang: 'pl', intensity: 'standard', age: 15 });
        for (const task of L.tasks) {
            assert.equal(task.wordBank, undefined, task.instruction);
            if (task.instruction) {
                assert.equal(instructionCueRefs(task.instruction).box, false, task.instruction);
            }
        }
    }
});

test('client never renders Use these words', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
    assert.match(src, /Word boxes \("Use these words"\) were removed/);
    assert.doesNotMatch(src, /ot-wordbox-label/);
});

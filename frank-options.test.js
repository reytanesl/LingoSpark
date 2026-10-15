import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isPublicStaticPath } from './static-allowlist.js';

await import('./frank-paragraphs.js');
await import('./frank-options.js');
const FO = globalThis.FrankOptions;
const BANK = globalThis.LINGOSPARK_FRANK_PARAGRAPHS;
const WHOLES = globalThis.LINGOSPARK_FRANK_WHOLE_TEXTS;

function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('bank: unique ids, every item maps to a known text/paragraph type', () => {
    const ids = new Set(BANK.map((p) => p.id));
    assert.equal(ids.size, BANK.length);
    for (const p of BANK) {
        assert.ok(FO.findPara(FO.textTypeOf(p), p.type), `item ${p.id} has unknown type ${FO.textTypeOf(p)}/${p.type}`);
        assert.ok(p.sentences.length >= 3, `item ${p.id} is too short to order`);
        assert.ok(p.topic, `item ${p.id} needs a topic`);
        for (const s of p.sentences) assert.ok(typeof s === 'string' && s.trim().length > 2, `item ${p.id} has an empty sentence`);
    }
});

test('every text type × paragraph type combination has at least 3 model paragraphs', () => {
    for (const t of FO.TEXT_TYPES) {
        for (const para of t.paras) {
            const n = FO.filterBank(BANK, { textType: t.id, paraType: para.id }).length;
            assert.ok(n >= 3, `${t.id}/${para.id} has only ${n}`);
        }
        assert.ok(FO.filterBank(BANK, { textType: t.id, paraType: 'any' }).length >= 9);
    }
    for (const r of FO.ROLES) assert.ok(FO.filterBank(BANK, { textType: 'any', paraType: `role:${r.id}` }).length >= 20);
    assert.equal(FO.filterBank(BANK, FO.DEFAULT_SELECTION).length, BANK.length);
});

test('picked paragraphs match the selection and avoid an immediate repeat', () => {
    const sel = { textType: 'formal_letter', paraType: 'closing' };
    let last = null;
    for (let i = 0; i < 40; i++) {
        const p = FO.pickParagraph(BANK, sel, last);
        assert.equal(FO.textTypeOf(p), 'formal_letter');
        assert.equal(p.type, 'closing');
        assert.notEqual(p.id, last);
        last = p.id;
    }
    const intro = FO.pickParagraph(BANK, { textType: 'essay', paraType: 'introduction' }, null, () => 0);
    assert.equal(FO.textTypeOf(intro), 'essay');
    // "opening" exists for letters, not essays: a role filter spans text types.
    const starts = FO.filterBank(BANK, { textType: 'any', paraType: 'role:start' });
    assert.ok(starts.some((p) => FO.textTypeOf(p) === 'story') && starts.some((p) => FO.textTypeOf(p) === 'essay'));
    assert.ok(starts.every((p) => ['introduction', 'opening'].includes(p.type)));
});

test('paragraph options are filtered by text type; invalid choices fall back to Any', () => {
    const essay = FO.paragraphOptions('essay').map((o) => o.value);
    assert.deepEqual(essay.slice(0, 1), ['any']);
    assert.ok(essay.includes('body_counter') && !essay.includes('closing'));
    const letter = FO.paragraphOptions('informal_letter').map((o) => o.value);
    assert.deepEqual(letter, ['any', 'whole', 'opening', 'body', 'closing']);
    assert.ok(FO.paragraphOptions('any').every((o) => ['any', 'whole'].includes(o.value) || o.value.startsWith('role:')));
    assert.deepEqual(FO.normalizeSelection({ textType: 'story', paraType: 'body_for' }), { textType: 'story', paraType: 'any' });
    assert.deepEqual(FO.normalizeSelection({ textType: 'nope', paraType: 'x' }), { textType: 'any', paraType: 'any' });
    assert.equal(FO.textTypeOptions()[0].label, 'Any / Random');
});

test('last choice is remembered in storage', () => {
    const st = memoryStorage();
    assert.deepEqual(FO.loadSelection(st), { textType: 'any', paraType: 'any' });
    FO.saveSelection(st, { textType: 'review', paraType: 'conclusion' });
    assert.deepEqual(FO.loadSelection(st), { textType: 'review', paraType: 'conclusion' });
    st.setItem(FO.STORAGE_KEY, '{broken');
    assert.deepEqual(FO.loadSelection(st), { textType: 'any', paraType: 'any' });
    assert.deepEqual(FO.loadSelection(null), { textType: 'any', paraType: 'any' });
});

test('typeInfo labels and the page wiring', () => {
    const info = FO.typeInfo({ textType: 'report', type: 'conclusion' });
    assert.equal(info.textLabel, 'Report');
    assert.match(info.label, /recommendations/i);
    assert.equal(FO.typeInfo({ type: 'body_for' }).textLabel, 'Essay');
    assert.ok(isPublicStaticPath('/frank-options.js'));
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.ok(html.includes('<script src="frank-options.js"></script>'));
    assert.equal((html.match(/data-frank-options/g) || []).length >= 2, true);
    assert.ok(html.includes('id="frank-setup-text-type"') && html.includes('id="frank-setup-para-type"'));
});

test('whole texts: 3+ per text type, all parts exist, follow beginning → middle → end', () => {
    const ids = new Set(WHOLES.map((w) => w.id));
    assert.equal(ids.size, WHOLES.length);
    for (const t of FO.TEXT_TYPES) {
        const list = FO.filterWholeTexts(BANK, WHOLES, { textType: t.id, paraType: 'whole' });
        assert.ok(list.length >= 3, `${t.id} has only ${list.length} whole texts`);
        assert.ok(t.wholeHint, `${t.id} needs a whole-text hint`);
        for (const w of list) {
            assert.ok(w.paragraphs.length >= 4, `${w.id} is too short`);
            const roles = w.paragraphs.map((p) => FO.findPara(t.id, p.type).role);
            assert.equal(roles[0], 'start', `${w.id} must open with a beginning paragraph`);
            assert.equal(roles[roles.length - 1], 'end', `${w.id} must end with an ending paragraph`);
            assert.ok(roles.slice(1, -1).every((r) => r === 'middle'), `${w.id} middle paragraphs`);
            const bankTopics = new Set(w.paragraphs.map((p) => BANK.find((b) => b.id === p.id).topic));
            assert.equal(bankTopics.size, 1, `${w.id} mixes topics`);
        }
    }
    for (const w of WHOLES) assert.ok(FO.resolveWholeText(BANK, w), `${w.id} references a missing paragraph`);
    assert.equal(FO.countFor(BANK, WHOLES, { textType: 'any', paraType: 'whole' }), WHOLES.length);
});

test('whole-text option: offered for every text type, picked texts match and do not repeat', () => {
    for (const v of ['any', ...FO.TEXT_TYPES.map((t) => t.id)]) {
        assert.ok(FO.paragraphOptions(v).some((o) => o.value === 'whole' && /Whole text/.test(o.label)));
    }
    const sel = FO.normalizeSelection({ textType: 'story', paraType: 'whole' });
    assert.deepEqual(sel, { textType: 'story', paraType: 'whole' });
    assert.ok(FO.isWhole(sel));
    assert.equal(FO.filterBank(BANK, sel).length, 0, 'whole mode never deals a single paragraph');
    let last = null;
    for (let i = 0; i < 20; i++) {
        const w = FO.pickWholeText(BANK, WHOLES, sel, last);
        assert.equal(w.textType, 'story');
        assert.notEqual(w.id, last);
        last = w.id;
    }
    assert.equal(FO.wholeInfo({ textType: 'essay', kind: 'Opinion essay' }).textLabel, 'Opinion essay');
    const st = memoryStorage();
    FO.saveSelection(st, { textType: 'report', paraType: 'whole' });
    assert.deepEqual(FO.loadSelection(st), { textType: 'report', paraType: 'whole' });
});

test('letter greetings, sign-offs and names get their own line', () => {
    const lines = FO.paragraphLines({ sentences: ['Thanks again!', 'Take care,', 'Kuba'] });
    assert.deepEqual(lines, ['Thanks again!', 'Take care,', 'Kuba']);
    assert.deepEqual(FO.paragraphLines({ sentences: ['Dear Ms Taylor,', 'I am writing.', 'I would like to apply.'] }), ['Dear Ms Taylor,', 'I am writing. I would like to apply.']);
});

test('whole text is ordered as sentences / two-sentence chunks: 8–12 cards, never across paragraphs', () => {
    for (const w of WHOLES) {
        const text = FO.resolveWholeText(BANK, w);
        const chunks = FO.chunkWholeText(text);
        assert.ok(chunks.length >= 8 && chunks.length <= 12, `${w.id} has ${chunks.length} cards`);
        assert.deepEqual(chunks.map((c) => c.id), chunks.map((_, i) => i + 1));
        const allSentences = text.paragraphs.flatMap((p) => p.sentences.map((x) => x.trim()));
        assert.equal(chunks.map((c) => c.text).join(' '), allSentences.join(' '), `${w.id} chunks must cover the text in order`);
        for (const c of chunks) {
            assert.ok(c.sentences === 1 || c.sentences === 2, `${w.id} chunk ${c.id} has ${c.sentences} sentences`);
            if (c.short) assert.equal(c.sentences, 1, 'greetings / sign-offs / names stay on their own');
        }
        // a chunk never crosses a paragraph break, and paragraphs stay in order
        const paraOf = chunks.map((c) => c.para);
        assert.deepEqual(paraOf, [...paraOf].sort((a, b) => a - b));
        // all unique texts (no two identical cards → one right answer)
        assert.equal(new Set(chunks.map((c) => c.text)).size, chunks.length);
    }
    const letter = FO.chunkWholeText(FO.resolveWholeText(BANK, WHOLES.find((w) => w.textType === 'formal_letter')));
    assert.ok(letter[0].short && /,$/.test(letter[0].text), 'greeting is its own first card');
    assert.ok(letter[letter.length - 1].short && letter[letter.length - 2].short, 'sign-off and name are their own cards');
});

test('chunking pairs only when needed and feedback finds the first wrong position', () => {
    const small = { paragraphs: [{ sentences: ['A one.', 'A two.', 'A three.'] }, { sentences: ['B one.', 'B two.', 'B three.'] }, { sentences: ['C one.', 'C two.'] }] };
    assert.equal(FO.chunkWholeText(small).length, 8, 'short texts stay as single sentences');
    const big = { paragraphs: [{ sentences: ['1.', '2.', '3.', '4.', '5.', '6.'] }, { sentences: ['7.', '8.', '9.', '10.', '11.', '12.'] }, { sentences: ['13.', '14.'] }] };
    const c = FO.chunkWholeText(big);
    assert.equal(c.length, 12);
    assert.equal(c.filter((x) => x.sentences === 2).length, 2);
    assert.equal(FO.firstWrongPosition([1, 2, 3, 4]), -1);
    assert.equal(FO.firstWrongPosition([1, 2, 4, 3]), 2);
    assert.equal(FO.firstWrongPosition([2, 1]), 0);
});

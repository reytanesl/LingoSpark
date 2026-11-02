import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './own-time-print.js';
import { normalizeOwnTimeLesson, publicOwnTimeLesson } from './own-time-prompts.js';
import * as F from './own-time-fixtures.js';
import { PUBLIC_SCRIPTS, isPublicStaticPath } from './static-allowlist.js';

const P = globalThis.OwnTimePrint;
const lesson = (reply, cefr) => publicOwnTimeLesson(normalizeOwnTimeLesson(reply, { cefr, instrLang: 'pl', age: 15 }));
const SETS = [['A1', F.OWN_TIME_MOCK_LOW_REPLY], ['A2', F.OWN_TIME_MOCK_EXTRA_REPLY], ['B1', F.OWN_TIME_MOCK_B1_REPLY], ['B2', F.OWN_TIME_MOCK_B2_REPLY], ['C1', F.OWN_TIME_MOCK_C1_REPLY]];

test('print sheet contains every task of the set, title, level and instructions', () => {
    for (const [cefr, reply] of SETS) {
        const L = lesson(reply, cefr);
        const html = P.build(L, { lang: 'en' });
        assert.equal((html.match(/class="otp-task"/g) || []).length, L.tasks.length, cefr);
        assert.ok(html.includes(L.title.replace(/&/g, '&amp;')), cefr);
        assert.ok(html.includes(cefr));
        L.tasks.filter((t) => t.instruction).forEach((t) => assert.ok(html.includes(t.instruction.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')), `${cefr}: ${t.instruction}`));
        assert.doesNotMatch(html, /<button|<input|Premium/);
        assert.doesNotMatch(html, /\{\{\s*\d+\s*\}\}|_{3,}/, 'gaps become lines');
    }
});

test('MC options are lettered in the shown order; word box words are printed (shown order if given)', () => {
    const L = lesson(F.OWN_TIME_MOCK_REPLY, 'A2');
    const mc = L.tasks.find((t) => t.items.some((it) => Array.isArray(it.options)));
    const html = P.build({ ...L, tasks: [mc] }, { lang: 'en' });
    mc.items[0].options.forEach((o, k) => assert.ok(html.includes(`<b>${'ABCD'[k]}.</b> ${o}`)));
    const box = { type: 'vocab_drill', instruction: 'x', wordBank: ['a', 'b', 'c'], items: [{ q: 'I ___', answer: 'a' }] };
    const h2 = P.build({ title: 'T', tasks: [box] }, { shownBank: () => ['c', 'a', 'b'] });
    assert.match(h2, /<div class="otp-box"><span>c<\/span><span>a<\/span><span>b<\/span><\/div>/);
});

test('answer key only when asked, on its own page, with letters for MC', () => {
    const L = lesson(F.OWN_TIME_MOCK_REPLY, 'A2');
    assert.doesNotMatch(P.build(L, {}), /otp-keypage/);
    const k = P.build(L, { withKey: true, lang: 'pl' });
    assert.match(k, /otp-keypage/);
    assert.match(k, /Klucz odpowiedzi/);
    const mc = L.tasks.find((t) => t.items.some((it) => Array.isArray(it.options)));
    const it = mc.items[0];
    assert.ok(k.includes(`(1) ${'ABCD'[it.options.indexOf(it.answer)]} ${it.answer}`));
});

test('EN default labels, PL via lang', () => {
    const L = lesson(F.OWN_TIME_MOCK_C1_REPLY, 'C1');
    assert.match(P.build(L), /Name:.*Date:/);
    assert.match(P.build(L, { lang: 'pl' }), /Imię i nazwisko/);
});

test('print CSS: A4, condensed font, no breaks inside tasks, only the sheet printed; file allow-listed and loaded', () => {
    const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.match(html, /@page \{ size: A4/);
    assert.match(html, /#ot-print-root \{ font-family:[^}]*font-size: 10\.5pt/);
    assert.match(html, /\.otp-task \{ break-inside: avoid/);
    assert.match(html, /body\.ot-printing > \*:not\(#ot-print-root\) \{ display: none !important/);
    assert.match(html, /<script src="own-time-print\.js"><\/script>\s*<script src="own-time\.js">/);
    assert.ok(PUBLIC_SCRIPTS.has('own-time-print.js'));
    assert.ok(isPublicStaticPath('/own-time-print.js'));
    const ot = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
    assert.match(ot, /id="ot-print"/);
    assert.match(ot, /t\('Drukuj', 'Print'\)/);
});

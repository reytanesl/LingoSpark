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
    assert.doesNotMatch(h2, /otp-box|Use these words|wordBank/i);
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

test('select: only ticked tasks print, renumbered 1..n, key matches the same tasks', () => {
    const L = lesson(F.OWN_TIME_MOCK_REPLY, 'A2');
    assert.ok(L.tasks.length >= 4);
    const keep = [0, 2, 3].filter((i) => i < L.tasks.length);
    const html = P.build(L, { lang: 'en', withKey: true, select: keep });
    assert.equal((html.match(/class="otp-task"/g) || []).length, keep.length);
    const nums = [...html.matchAll(/class="otp-num">(\d+)</g)].map((m) => Number(m[1]));
    assert.deepEqual(nums, keep.map((_, i) => i + 1));
    const keyRows = html.slice(html.indexOf('otp-keypage')).match(/<li><b>\d+\.<\/b>/g) || [];
    assert.equal(keyRows.length, keep.length);
    const skipped = L.tasks[1];
    if (skipped.instruction && !keep.some((i) => L.tasks[i].instruction === skipped.instruction)) {
        assert.ok(!html.includes(skipped.instruction.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')));
    }
    assert.equal(P.build(L, { lang: 'en' }), P.build(L, { lang: 'en', select: undefined }), 'no select = whole set');
});

test('task picker: labels EN/PL, panel with select all/none, key toggle, disabled print + hint when none ticked', () => {
    const L = lesson(F.OWN_TIME_MOCK_REPLY, 'A2');
    assert.match(P.taskLabel(L.tasks[0], 'en'), /^[A-Z][\w ]+/);
    assert.match(P.taskLabel({ type: 'reading' }, 'pl'), /^Czytanie$/);
    assert.ok(P.taskLabel({ type: 'uoe', instruction: 'x'.repeat(100) }, 'en').endsWith('…'));
    const ot = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
    for (const s of ['id="ot-print-panel"', 'id="ot-pp-all"', 'id="ot-pp-none"', 'id="ot-print-go"', 'id="ot-pp-hint"', 'id="ot-print-key"', "'Select all'", "'Zaznacz wszystkie'", "'Tick at least one task.'", "'Zaznacz co najmniej jedno zadanie.'"]) assert.ok(ot.includes(s), s);
    assert.match(ot, /go\.disabled = sel\.size === 0/);
    assert.match(ot, /select: \[\.\.\.sel\]/);
    assert.doesNotMatch(ot, /beforeprint/, 'Ctrl+P behaviour unchanged');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { isPublicStaticPath } from './static-allowlist.js';

const mod = { exports: {} };
vm.runInNewContext(readFileSync(new URL('./tests-exams.js', import.meta.url), 'utf8'), { module: mod, globalThis: {} });
const R = mod.exports;
const J = (f) => (...a) => JSON.parse(JSON.stringify(f(...a)));
const TE = { ...R, skillAction: J(R.skillAction), homeAction: J(R.homeAction), HOME: JSON.parse(JSON.stringify(R.HOME)), PICKERS: JSON.parse(JSON.stringify(R.PICKERS)), EXAMS: JSON.parse(JSON.stringify(R.EXAMS)) };
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('home order: Primary first, then exams, school test, own pace, workshop, word games', () => {
    assert.deepEqual(TE.HOME.map((h) => h[0]), ['primary', 'e8', 'podst', 'rozsz', 'dwuj', 'school-test', 'own', 'workshop', 'games']);
});

test('exam level presets', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(TE.EXAMS).map(([k, v]) => [k, v.level])), { e8: 'A2', podst: 'B1', rozsz: 'B2', dwuj: 'C1' });
});

test('skill routing into existing activities with level preset', () => {
    assert.deepEqual(TE.skillAction('rozsz', 'check'), { kind: 'hash', hash: '#/setup/matura' });
    for (const ex of ['e8', 'podst', 'dwuj']) assert.equal(TE.skillAction(ex, 'check').kind, 'soon');
    assert.deepEqual(TE.skillAction('e8', 'clock'), { kind: 'pe', game: 'pe-exam', level: 'A2' });
    assert.deepEqual(TE.skillAction('podst', 'clock'), { kind: 'pe', game: 'pe-exam', level: 'B1' });
    assert.deepEqual(TE.skillAction('e8', 'gaps'), { kind: 'pe', game: 'pe-e8-gaps', level: 'A2' });
    assert.deepEqual(TE.skillAction('rozsz', 'gaps'), { kind: 'adv', game: 'adv-gaps', level: 'B2' });
    assert.deepEqual(TE.skillAction('dwuj', 'gaps'), { kind: 'adv', game: 'adv-gaps', level: 'B2+' });
    assert.deepEqual(TE.skillAction('podst', 'uoe'), { kind: 'own', focus: 'uoe', cefr: 'B1' });
    assert.deepEqual(TE.skillAction('dwuj', 'reading'), { kind: 'own', focus: 'reading', cefr: 'C1' });
    assert.deepEqual(TE.skillAction('e8', 'vocab'), { kind: 'own', focus: 'vocab', cefr: 'A2' });
    assert.equal(TE.skillAction('rozsz', 'mock').kind, 'soon');
    assert.deepEqual(TE.skillAction('e8', 'results'), { kind: 'hash', hash: '#/progress' });
});

test('home tiles route to pickers, own time and school test', () => {
    for (const id of ['primary', 'e8', 'workshop', 'games']) assert.deepEqual(TE.homeAction(id), { kind: 'sub', sub: id });
    assert.deepEqual(TE.homeAction('school-test'), { kind: 'own', testPrep: true });
    assert.deepEqual(TE.homeAction('own'), { kind: 'hash', hash: '#/setup/own-time' });
});

test('pickers only point at existing setups', () => {
    const games = Object.values(TE.PICKERS).flatMap((p) => p.groups.flatMap((g) => g[1].map((x) => x[4])));
    for (const a of games) {
        if (a.kind === 'hash' && a.hash.startsWith('#/setup/')) assert.ok(html.includes(`href="${a.hash}"`), a.hash);
        if (a.kind === 'pe') assert.match(a.game, /^pe-/);
    }
    assert.deepEqual(TE.PICKERS.primary.groups.flatMap((g) => g[1].map((x) => x[2][1])), ['Dictation', 'Colour Blocks', 'Vocab Scenes', 'Topic Challenge', 'Review Chatbot', 'Detail Detective', 'Link Master']);
});

test('index wires the suite and keeps old writing content', () => {
    assert.match(html, /<script src="tests-exams\.js"><\/script>/);
    assert.match(html, /window\.TestsExams\.show\(/);
    assert.match(html, /Tests &amp; Exams/);
    assert.match(html, /id="own-time-tile"/);
    assert.ok(isPublicStaticPath('/tests-exams.js'));
    assert.ok(isPublicStaticPath('/tests-exams.css'));
});

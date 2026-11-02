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

const server = readFileSync(new URL('./server.js', import.meta.url), 'utf8');
const gateOf = (method, route) => {
    const m = new RegExp(`app\\.${method}\\('${route.replace(/[/:]/g, (c) => '\\' + c)}',\\s*(\\w+)`).exec(server);
    return m && m[1];
};

test('gating: every exam skill that opens an activity is gated, except soon/results', () => {
    for (const ex of Object.keys(R.EXAMS)) for (const [sk] of R.SKILLS.concat([['mock'], ['results']])) {
        const a = TE.skillAction(ex, sk);
        if (a.kind === 'soon' || sk === 'results') assert.equal(R.isGated(a), false, `${ex}:${sk}`);
        else assert.equal(R.isGated(a), true, `${ex}:${sk}`);
    }
});

test('gating: free status kept for free PE games, Vocab Scenes and word games', () => {
    const byName = Object.fromEntries(Object.values(TE.PICKERS).flatMap((p) => p.groups.flatMap((g) => g[1].map((x) => [x[2][1], R.isGated(x[4])]))));
    for (const free of ['Dictation', 'Colour Blocks', 'Vocab Scenes', 'Penalty Match', 'Test Countdown', 'Vocab Review', 'Live Spark']) assert.equal(byName[free], false, free);
    for (const paid of ['Topic Challenge', 'Review Chatbot', 'Detail Detective', 'Link Master', 'Vocab Upgrade', 'Bloat Slasher', 'Tight Write', 'Transitions', "Devil's Advocate", 'Frankenstein', 'Mission: Chat', 'Odyssey']) assert.equal(byName[paid], true, paid);
    assert.equal(R.isGated({ kind: 'own', testPrep: true }), true);
    for (const id of ['e8', 'podst', 'rozsz', 'dwuj', 'school-test', 'own', 'workshop', 'ai']) assert.equal(R.homeGated(id), true, id);
    for (const id of ['primary', 'games']) assert.equal(R.homeGated(id), false, id);
});

test('gating: module lists match index.html WRITING_GAMES / FREE_PE_GAMES', () => {
    const list = (name) => JSON.parse(new RegExp(`const ${name} = new Set\\((\\[[^\\]]*\\])\\)`).exec(html)[1].replace(/'/g, '"'));
    assert.deepEqual([...R.WRITING_SETUPS].sort(), list('WRITING_GAMES').sort());
    assert.deepEqual([...R.FREE_SETUPS].sort(), list('FREE_PE_GAMES').sort());
});

test('gating: client routes #/game/<writing game> through the paywall', () => {
    assert.match(html, /root === 'game' && arg && WRITING_GAMES\.has\(arg\) && !FREE_PE_GAMES\.has\(arg\)[^\n]*\n[^\n]*\n\s*await goToWritingSetup\(arg\);/);
});

test('gating: server APIs used by Tests & Exams activities require writing access', () => {
    const gated = [['post', '/api/generate'], ['post', '/api/odyssey'], ['post', '/api/frank/generate'], ['post', '/api/assess-pe-exam'], ['post', '/api/assess-writing'],
        ['post', '/api/matura/reviews'], ['put', '/api/matura/reviews/:id'],
        ['get', '/api/own-time/profiles'], ['get', '/api/own-time/lessons'], ['post', '/api/own-time/lessons'], ['post', '/api/own-time/generate'], ['post', '/api/own-time/test-prep'], ['post', '/api/own-time/vocab'], ['post', '/api/own-time/check-open'], ['put', '/api/own-time/progress']];
    for (const [m, r] of gated) assert.equal(gateOf(m, r), 'requireWritingAccess', `${m} ${r}`);
});

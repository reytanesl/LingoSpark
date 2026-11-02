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

test('Tests & Exams home: only premium exam/test items', () => {
    assert.deepEqual(TE.HOME.map((h) => h[0]), ['e8', 'podst', 'rozsz', 'dwuj', 'school-test', 'own', 'workshop']);
    for (const [id] of TE.HOME) assert.equal(R.homeGated(id), true, id);
    assert.equal(R.homeGated('ai'), true);
    assert.deepEqual(Object.keys(TE.PICKERS).sort(), ['ai', 'workshop']);
});

test('Vocab practice home + moved routes', () => {
    const VP = JSON.parse(JSON.stringify(R.VP_HOME));
    assert.deepEqual(VP.map((h) => h[0]), ['learn', 'games', 'primary', 'sets']);
    assert.deepEqual(JSON.parse(JSON.stringify(R.MOVED)), { primary: '#/vocab/primary', games: '#/vocab/games' });
    assert.deepEqual(J(R.vpHomeAction)('sets'), { kind: 'fn', fn: 'openWordSets' });
    for (const id of ['learn', 'games', 'primary']) assert.deepEqual(J(R.vpHomeAction)(id), { kind: 'sub', sub: id });
    for (const id of ['learn', 'games', 'primary']) assert.equal(R.vpHomeGated(id), false, id);
    // every vocab-section activity is reachable from the new home
    const hashes = new Set(Object.values(JSON.parse(JSON.stringify(R.VP_PICKERS))).flatMap((p) => p.groups.flatMap((g) => g[1].map((x) => x[4].hash || x[4].url || x[4].game))));
    for (const h of ['#/setup/flashcard', '#/setup/memory-flip', '#/setup/word-repair', '#/setup/speed-match', '#/setup/bomb', '#/setup/grid', '#/auction', '#/penalty-match', 'vocab-scenes.html', 'pe-dictation', 'pe-colour', 'pe-topic', 'pe-review', 'pe-detail', 'pe-link']) assert.ok(hashes.has(h), h);
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
    for (const id of ['e8', 'workshop']) assert.deepEqual(TE.homeAction(id), { kind: 'sub', sub: id });
    assert.deepEqual(TE.homeAction('school-test'), { kind: 'own', testPrep: true });
    assert.deepEqual(TE.homeAction('own'), { kind: 'hash', hash: '#/setup/own-time' });
});

test('pickers only point at existing setups', () => {
    const games = [...Object.values(TE.PICKERS), ...Object.values(JSON.parse(JSON.stringify(R.VP_PICKERS)))].flatMap((p) => p.groups.flatMap((g) => g[1].map((x) => x[4])));
    for (const a of games) {
        if (a.kind === 'hash' && a.hash.startsWith('#/setup/')) assert.ok(html.includes(`href="${a.hash}"`), a.hash);
        if (a.kind === 'pe') assert.match(a.game, /^pe-/);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(R.VP_PICKERS)).primary.groups.flatMap((g) => g[1].map((x) => x[2][1])), ['Dictation', 'Colour Blocks', 'Vocab Scenes', 'Topic Challenge', 'Review Chatbot', 'Detail Detective', 'Link Master']);
});

test('index wires the suite and keeps old writing content', () => {
    assert.match(html, /<script src="tests-exams\.js"><\/script>/);
    assert.match(html, /window\.TestsExams\.show\(/);
    assert.match(html, /window\.TestsExams\.showVocab\(/);
    assert.match(html, /Vocab practice<\/span>/);
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
    const byName = Object.fromEntries([...Object.values(TE.PICKERS), ...Object.values(JSON.parse(JSON.stringify(R.VP_PICKERS)))].flatMap((p) => p.groups.flatMap((g) => g[1].map((x) => [x[2][1], R.isGated(x[4])]))));
    for (const free of ['Dictation', 'Colour Blocks', 'Vocab Scenes', 'Penalty Match', 'Flashcards', 'Memory Flip', 'Word Repair', 'Speed Match', 'Bomb Defusal', 'Grid Territory', 'Vocab Auction']) assert.equal(byName[free], false, free);
    for (const paid of ['Topic Challenge', 'Review Chatbot', 'Detail Detective', 'Link Master', 'Vocab Upgrade', 'Bloat Slasher', 'Tight Write', 'Transitions', "Devil's Advocate", 'Frankenstein', 'Mission: Chat', 'Odyssey']) assert.equal(byName[paid], true, paid);
    assert.equal(R.isGated({ kind: 'own', testPrep: true }), true);
    for (const id of ['e8', 'podst', 'rozsz', 'dwuj', 'school-test', 'own', 'workshop', 'ai']) assert.equal(R.homeGated(id), true, id);
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

test('Test Countdown is removed from the site; old links redirect to Vocab practice', () => {
    assert.doesNotMatch(html, /test-countdown\.js|screen-test-countdown|TestCountdown|id="test-countdown-settings"|href="#\/setup\/test-countdown"/);
    assert.match(html, /arg === 'test-countdown'\) \{\n[^\n]*\n\s*history\.replaceState\(null, '', '#\/vocab'\)/);
    assert.equal(isPublicStaticPath('/test-countdown.js'), false);
    const all = JSON.stringify([R.VP_HOME, R.VP_PICKERS, R.HOME, R.PICKERS]);
    assert.doesNotMatch(all, /test-countdown|Test Countdown|live\/host|live\/join/);
});

test('setup screen: vocab-only settings block closes before the other games\' settings (own-time regression)', () => {
    // 4ea4e30 removed one </div> too many with the Test Countdown form, so every later
    // setup panel (own-time, mission, PE, writing games) sat inside the hidden vocab block.
    const start = html.indexOf('id="vocab-setup-section"');
    assert.ok(start > 0);
    const from = html.lastIndexOf('<div', start);
    const re = /<div\b|<\/div>/g;
    re.lastIndex = from;
    let depth = 0; let end = -1; let m;
    while ((m = re.exec(html))) { depth += m[0] === '</div>' ? -1 : 1; if (depth === 0) { end = m.index; break; } }
    assert.ok(end > start, 'vocab-setup-section must close');
    for (const id of ['own-time-setup-note', 'mission-settings', 'writing-setup-note', 'frank-setup-note']) {
        const at = html.indexOf(`id="${id}"`);
        assert.ok(at > end, `${id} must not be inside #vocab-setup-section`);
    }
    // whole setup screen is balanced
    const s0 = html.indexOf('<div id="screen-setup"'); const s1 = html.indexOf('<!-- ', html.indexOf('</div>', s0));
    assert.ok(s0 > 0 && s1 > s0);
});

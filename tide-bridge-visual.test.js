// Tide Bridge "Storybook Dusk" visual layer: wiring + safety checks that need no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PUBLIC_SCRIPTS, isPublicStaticPath } from './static-allowlist.js';

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');

test('index.html loads Fredoka, the Tide Bridge stylesheet and both Tide Bridge scripts', () => {
    const html = read('index.html');
    assert.match(html, /fonts\.googleapis\.com\/css2\?[^"]*family=Fredoka:wght@500;600/);
    assert.match(html, /href="tide-bridge\.css"/);
    assert.match(html, /src="tide-bridge-scene\.js"/);
    assert.match(html, /src="tide-bridge-client\.js"/);
});

test('both Tide Bridge browser scripts are served by the static allowlist', () => {
    assert.ok(PUBLIC_SCRIPTS.has('tide-bridge-client.js'));
    assert.ok(PUBLIC_SCRIPTS.has('tide-bridge-scene.js'));
});

test('tide-bridge.css only styles Tide Bridge hooks (no bare/global selectors)', () => {
    const css = read('tide-bridge.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const selectors = [];
    css.replace(/(?:^|\})\s*([^{}@]+)\{/g, (_, sel) => { selectors.push(...sel.split(',').map((s) => s.trim()).filter(Boolean)); return ''; });
    assert.ok(selectors.length > 50);
    const ok = /(\.tb-|\.tbs-|#tb-|tide|#live-host-tide|\.live-winner-screen--tide|\.live-ranking-screen--tide|^:root$|\.tb-hud)/;
    const bad = selectors.filter((s) => !ok.test(s));
    assert.deepEqual(bad, []);
});

function loadScene() {
    const sandbox = { globalThis: null };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('tide-bridge-scene.js'), sandbox);
    return sandbox.TideBridgeScene;
}

test('scene generator draws six themed bridges, scaled to the span count, with unique SVG ids per instance', () => {
    const S = loadScene();
    const themes = ['footbridge', 'arch', 'viaduct', 'rapids', 'storm', 'citadel'];
    assert.deepEqual([...Object.keys(S.THEMES)], themes);
    assert.deepEqual([...S.THEME_BY_ROUND].slice(0, 6), themes);
    for (const theme of themes) {
        for (const n of [1, 2, 3, 4, 5]) {
            const svg = S.bridgeSvg('t1', { n, theme });
            assert.match(svg, /<svg[^>]+data-uid="t1"/);
            assert.match(svg, new RegExp(`data-theme="${theme}"`));
            const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
            assert.equal(new Set(ids).size, ids.length, `duplicate ids inside one svg (${theme}/${n})`);
            assert.ok(ids.every((id) => id.startsWith('t1')), 'ids must carry the instance prefix');
            assert.equal(S.geom(n, theme).n, n);
            assert.ok(S.geom(n, theme).w > 40);
        }
    }
    // the storm theme has rain + lightning, every theme animates its waves from the --tbs-wave variable
    assert.match(S.bridgeSvg('s', { n: 3, theme: 'storm', wave: 3 }), /tbs-rain[\s\S]*tbs-flash|tbs-flash[\s\S]*tbs-rain/);
    assert.match(S.bridgeSvg('s', { n: 3, theme: 'footbridge', wave: 9 }), /--tbs-wave:9s/);
    assert.match(S.bridgeSvg('c', { n: 3, theme: 'citadel' }), /tbs-citadel/);
    const a = S.bridgeSvg('ua', { n: 4, theme: 'arch' });
    const b = S.bridgeSvg('ub', { n: 4, theme: 'arch' });
    const idsA = new Set([...a.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    assert.ok([...b.matchAll(/ id="([^"]+)"/g)].every((m) => !idsA.has(m[1])));
    for (const theme of themes) assert.ok(S.tideY(0, theme) > S.tideY(1, theme), `${theme}: tide must rise with the ratio`);
    assert.match(S.beachSvg('bb'), /<svg/);
});

test('the six-round client is wired to the new state: labelled clock + round tide, round strip, new end copy', () => {
    const client = read('tide-bridge-client.js');
    assert.match(client, /GAME CLOCK/);
    assert.match(client, /id="tb-gauge-l"/);
    assert.match(client, /Bonus question!/);
    assert.match(client, /id="tb-bar-round"/);
    assert.match(client, /id="tb-bar-span"/);
    assert.match(client, /id="tb-strip"/);
    assert.match(client, /THE WATER WON!/);
    assert.match(client, /bridges completed/);
    assert.match(client, /Swept Back to Shore/);
    assert.match(client, /Mid-Channel Explorers/);
    assert.match(client, /Reached the Far Cliff/);
    assert.doesNotMatch(client, /ROUNDS CLEARED|GOLD_STONES/);
    const css = read('tide-bridge.css');
    assert.match(css, /animation: tbsWaveA var\(--tbs-wave/);
    assert.match(css, /\.tb-result/);
    const live = read('live-game-client.js');
    assert.match(live, /TideBridgeUI\?\.showResult/);
});

test('the visual layer does not touch game mechanics modules', () => {
    for (const f of ['tide-bridge-client.js', 'tide-bridge-scene.js']) {
        const src = read(f);
        assert.doesNotMatch(src, /\.emit\(/, `${f} must not emit socket events`);
        assert.doesNotMatch(src, /live:(answer|submit|skip|end)/);
    }
});

test('The Bridge soundtrack: file exists, is served, and is a looped host-only <audio>', () => {
    const file = new URL('./audio/the-bridge-theme.mp3', import.meta.url);
    assert.ok(fs.existsSync(file), 'audio/the-bridge-theme.mp3 missing');
    const size = fs.statSync(file).size;
    assert.ok(size > 200_000 && size < 3_000_000, `unexpected size ${size}`);
    assert.ok(isPublicStaticPath('/audio/the-bridge-theme.mp3'));
    const client = read('tide-bridge-client.js');
    assert.match(client, /<audio id="tb-music" loop preload="none" src="\$\{MUSIC_SRC\}"/);
    assert.match(client, /MUSIC_SRC = '\/audio\/the-bridge-theme\.mp3'/);
    assert.match(client, /MUTE_KEY = 'ls_the_bridge_muted'/);
    assert.match(client, /id="tb-mute"/);
    const live = read('live-game-client.js');
    // host starts the theme, players do not; generic gameplay loop is skipped only for tide-bridge
    assert.match(live, /if \(role === 'host'\) window\.TideBridgeUI\?\.startMusic/);
    assert.match(live, /window\.TideBridgeUI\?\.stopMusic\?\.\(\);/);
    assert.equal((live.match(/LiveAudio\.startGame\(\)/g) || []).length, 1, 'only the generic helper may call LiveAudio.startGame()');
    assert.match(read('tide-bridge.css'), /#tb-mute\.is-muted/);
});

test('The Bridge soundtrack: seamless Web Audio loop with <audio loop> fallback', () => {
    const client = read('tide-bridge-client.js');
    // Web Audio engine: decoded buffer, loop=true between the trimmed edges, volume 0.35
    assert.match(client, /decodeAudioData/);
    assert.match(client, /src\.loop = true;/);
    assert.match(client, /src\.loopStart = web\.loopStart;/);
    assert.match(client, /src\.loopEnd = web\.loopEnd;/);
    assert.match(client, /MUSIC_VOLUME = 0\.35/);
    assert.match(client, /web\.gain\.gain\.value = MUSIC_VOLUME/);
    // fallback to the element when Web Audio is missing / fetch or decode fails
    assert.match(client, /if \(!webSupported\(\)\) \{ elementPlay\(\); return; \}/);
    assert.match(client, /\.catch\(\(\) => \{ if \(musicWanted && !isMuted\(\)\) elementPlay\(\); \}\)/);
    // stop paths release the Web Audio source and the element
    assert.match(client, /function stopMusic\(\) \{\s*musicWanted = false;\s*webStop\(\);\s*elementStop\(\);/);
    assert.match(client, /musicState,/);
});

test('The Bridge soundtrack: mp3 is a valid ~2 MB-or-less loop with a LAME/Xing header', () => {
    const buf = fs.readFileSync(new URL('./audio/the-bridge-theme.mp3', import.meta.url));
    assert.ok(buf.length < 2_100_000, `file too large: ${buf.length}`);
    // ffmpeg/LAME writes an Xing/Info frame near the start; it carries the gapless delay/padding data
    const headBytes = buf.subarray(0, 600).toString('latin1');
    assert.ok(/Xing|Info/.test(headBytes), 'missing Xing/Info (LAME) header');
});


/* ---- simple student phone (Karol: "straightforward and fully intuitive") ---- */
function loadClient(lang = 'en') {
    const store = { ls_lang: lang };
    const sandbox = { URLSearchParams, location: { search: '' }, localStorage: { getItem: (k) => store[k] ?? null }, document: { documentElement: { lang: 'en' } } };
    sandbox.globalThis = sandbox; sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('tide-bridge-client.js'), sandbox);
    return sandbox.TideBridgeUI;
}

test('student phone: one goal line, one instruction, one water bar — no match clock, room code, span or tide jargon', () => {
    const client = read('tide-bridge-client.js');
    const phone = client.slice(client.indexOf('function ensurePhoneDom'), client.indexOf('function syncPlayerBanner'));
    for (const id of ['tb-p-rounds', 'tb-p-pips', 'tb-p-title', 'tb-p-tide']) assert.match(phone, new RegExp(`id="${id}"`));
    for (const gone of ['tb-p-clock', 'tb-p-room', 'tb-p-spanl', 'tb-p-tidep', 'tb-phone-foot', 'SPAN', 'MATCH']) assert.doesNotMatch(phone, new RegExp(gone));
    const ui = loadClient('en');
    const words = ['doAnswer', 'doBonus', 'stoneLaid', 'waitSpan', 'waitBridge', 'waitFail', 'correct', 'wrong'].map((k) => ui.text(k)).join(' | ');
    assert.doesNotMatch(words, /span|chasm|shore|obstacle|tide|round/i, words);
    assert.equal(ui.text('doAnswer'), 'Answer to build the bridge!');
});

test('student feedback says right/wrong and what happened to the bridge (EN + PL)', () => {
    const en = loadClient('en');
    assert.deepEqual({ ...en.resultTexts({ correct: true, gotCorrect: 2, neededCorrect: 3 }) }, { tone: 'ok', title: 'Correct!', sub: 'Your class has 2 of 3 answers for the next stone' });
    assert.equal(en.resultTexts({ correct: true, cleared: true }).sub, 'A new stone is on the bridge!');
    assert.equal(en.resultTexts({ correct: true, cleared: true, roundCleared: true }).sub, 'Bridge finished!');
    const w = en.resultTexts({ correct: false, correctTerm: 'prevent', choices: ['a'] });
    assert.equal(w.tone, 'wrong');
    assert.match(w.sub, /“prevent”.*Choose it/);
    assert.match(en.resultTexts({ correct: false, correctTerm: 'seal', challengeable: true }).sub, /Type it/);
    const pl = loadClient('pl');
    assert.equal(pl.text('doAnswer'), 'Odpowiadaj, aby budować most!');
    assert.equal(pl.resultTexts({ correct: true, gotCorrect: 1, neededCorrect: 2 }).title, 'Dobrze!');
    assert.match(pl.waitingText('cleared'), /Most gotowy/);
    for (const k of ['doAnswer', 'doBonus', 'correct', 'wrong', 'waitSpan', 'ask', 'water', 'nextStone']) assert.notEqual(pl.text(k), en.text(k), k);
});

test('live client uses the simple student wording for waits and teacher notes', () => {
    const live = read('live-game-client.js');
    assert.match(live, /TideBridgeUI\.waitingText\(kind\)/);
    assert.match(live, /waitingText\('correct'\)/);
    assert.match(live, /showNote\('sent'\)/);
});

test('tutorial (4 steps, skippable, EN + PL) and clearly marked interludes with a countdown', () => {
    const en = loadClient('en'); const pl = loadClient('pl');
    for (let i = 1; i <= 4; i++) { assert.ok(en.text(`tut${i}`).length < 80); assert.notEqual(pl.text(`tut${i}`), en.text(`tut${i}`)); }
    assert.match(en.text('tut4'), /not from the word list/i);
    assert.equal(pl.text('tutSkip'), 'Pomiń');
    const client = read('tide-bridge-client.js');
    assert.match(client, /id="tb-tut-skip"/);
    assert.match(client, /tb_tutorial_seen_/);
    const v = (o) => ({ finished: false, st: { phaseMsLeft: 3000, ...o.st }, round: 2, transition: null, ...o });
    const il = en.interludeInfo(v({ moment: true, transition: { kind: 'cleared' } }));
    assert.equal(il.kick, 'BREAK'); assert.equal(il.title, 'Bridge 2 built!'); assert.match(il.sub, /^Next bridge in \d…$/);
    assert.match(en.interludeInfo(v({ between: true, st: { phaseMsLeft: 1200, betweenNext: 'breaker' } })).sub, /bonus question/);
    assert.equal(en.interludeInfo(v({ failedMoment: true, moment: true, transition: { kind: 'failed' } })).kick, 'WATER WON');
    assert.equal(en.interludeInfo(v({})), null, 'no interlude during play');
    assert.equal(pl.interludeInfo(v({ moment: true, transition: { kind: 'cleared' } })).kick, 'PRZERWA');
    assert.match(en.resultTexts({ correct: true, extra: true, pushedBackMs: 1500 }).sub, /water goes down/);
    const live = read('live-game-client.js');
    assert.match(live, /TideBridgeUI\?\.onQuestion\?\.\(q\)/);
    assert.match(live, /showTutorial\?\.\(/);
    assert.match(live, /result\.correct && result\.nextQuestion/);
});

test('bonus question shows the water as paused; host board uses the plain wording (EN + PL)', () => {
    const en = loadClient('en'); const pl = loadClient('pl');
    assert.equal(en.text('waterPaused'), 'WATER PAUSED');
    assert.equal(pl.text('waterPaused'), 'WODA STOI');
    assert.match(en.text('tut4'), /water stops/);
    assert.match(pl.text('tut4'), /woda wtedy stoi/);
    assert.equal(en.text('hTagBonus'), 'BONUS QUESTION · WATER PAUSED');
    assert.equal(en.text('hBridgeBuilt', { n: 2 }), 'Bridge 2 built!');
    assert.equal(pl.text('hNextBridge', { m: 3 }), 'Następny: most 3');
    const client = read('tide-bridge-client.js');
    assert.doesNotMatch(client.slice(0, client.indexOf('function mountWinBackdrop')), /chasm|Mid-Bridge Obstacle|ROUND TIDE|MATCH CLOCK/);
    assert.match(client, /classList\.toggle\('water-paused', v\.breaker\)/);
    assert.equal(en.interludeInfo({ finished: false, between: true, round: 2, st: { phaseMsLeft: 1200, betweenFrom: 'bonus' } }).title, 'Bonus done!');
});

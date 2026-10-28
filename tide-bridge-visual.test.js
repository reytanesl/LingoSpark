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
    assert.match(client, /MATCH CLOCK/);
    assert.match(client, /ROUND TIDE/);
    assert.match(client, /Mid-Bridge Obstacle!/);
    assert.match(client, /id="tb-bar-round"/);
    assert.match(client, /id="tb-bar-span"/);
    assert.match(client, /id="tb-strip"/);
    assert.match(client, /The tide took the bridge!/i);
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


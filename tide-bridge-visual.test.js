// Tide Bridge "Storybook Dusk" visual layer: wiring + safety checks that need no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PUBLIC_SCRIPTS } from './static-allowlist.js';

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

test('scene generator scales the bridge to the stone count and keeps SVG ids unique per instance', () => {
    const sandbox = { globalThis: null };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('tide-bridge-scene.js'), sandbox);
    const S = sandbox.TideBridgeScene;
    for (const n of [7, 10, 14, 17]) {
        const svg = S.bridgeSvg('t1', { n });
        assert.match(svg, /<svg[^>]+data-uid="t1"/);
        const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        assert.equal(new Set(ids).size, ids.length, 'duplicate ids inside one svg');
        assert.ok(ids.every((id) => id.startsWith('t1')), 'ids must carry the instance prefix');
        assert.equal(S.geom(n).n, n);
        assert.ok(Math.abs(S.geom(n).w * n - 702) < 1e-6);
    }
    const a = S.bridgeSvg('ua', { n: 10 });
    const b = S.bridgeSvg('ub', { n: 10 });
    const idsA = new Set([...a.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    assert.ok([...b.matchAll(/ id="([^"]+)"/g)].every((m) => !idsA.has(m[1])));
    assert.ok(S.tideY(0) > S.tideY(1));
    assert.match(S.beachSvg('bb'), /<svg/);
});

test('the visual layer does not touch game mechanics modules', () => {
    for (const f of ['tide-bridge-client.js', 'tide-bridge-scene.js']) {
        const src = read(f);
        assert.doesNotMatch(src, /\.emit\(/, `${f} must not emit socket events`);
        assert.doesNotMatch(src, /live:(answer|submit|skip|end)/);
    }
});

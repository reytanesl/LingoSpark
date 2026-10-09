// Browser fit checks: Live Spark host room (1366x768, 1920x1080), phone lobby + question (375x667, 390x844),
// forgot-password + reset page. Needs Playwright, Chrome and a working DATABASE_URL, so it only runs when
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs [CHROME_PATH=/usr/bin/google-chrome] npm run test:layout
// (in plain `npm test` it is skipped).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

const MODULE = process.env.PLAYWRIGHT_MODULE;
const skip = MODULE ? false : 'set PLAYWRIGHT_MODULE (and CHROME_PATH) to run browser fit checks';
const FORMATS = ['race', 'captain-crew', 'hot-spark-relay', 'lucky-lanterns', 'word-cannon'];
const HOST_VIEWPORTS = [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }];
const PHONE_VIEWPORTS = [{ width: 375, height: 667 }, { width: 390, height: 844 }];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

/** Page must not scroll and no visible control may sit outside the viewport (unless inside an inner scroller). */
function measure() {
    const vw = innerWidth; const vh = innerHeight; const doc = document.documentElement;
    const out = [];
    const roots = document.querySelectorAll('.screen.active');
    for (const root of roots) {
        root.querySelectorAll('button, input, select, textarea, h1, h2, h3, p, label, a, .word-prompt').forEach((el) => {
            if (!el.getClientRects().length) return;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') return;
            if (el.closest('[aria-hidden="true"], .live-host-race, .ll-host, .wc-host')) return;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return;
            if (r.bottom > vh + 1 || r.right > vw + 1 || r.top < -1 || r.left < -1) {
                let p = el.parentElement; let scroller = false;
                while (p && p !== root) { const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll') { scroller = true; break; } p = p.parentElement; }
                if (!scroller) out.push(`${el.tagName.toLowerCase()}#${el.id}.${String(el.className).split(' ')[0]} ${Math.round(r.top)}..${Math.round(r.bottom)}`);
            }
        });
    }
    const active = [...roots].map((r) => r.id);
    const answering = !!document.querySelector('#live-play-choices button, #live-play-answer, .ll-player, .wc-player, #live-play-lantern, #live-play-cannon') && [...document.querySelectorAll('#live-play-choices button, #live-play-answer, #live-play-lantern, #live-play-cannon')].some((e) => e.getClientRects().length > 0);
    return { active, answering, scrollY: Math.max(0, doc.scrollHeight - vh, document.body.scrollHeight - vh), scrollX: Math.max(0, doc.scrollWidth - vw), out };
}

test('Live Spark screens fit one screen', { skip, timeout: 600000 }, async (t) => {
    const { chromium } = await import(MODULE);
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const server = spawn(process.execPath, ['server.js'], { cwd: new URL('.', import.meta.url).pathname, env: { ...process.env, PORT: String(port), APP_BASE_URL: base }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    server.stdout.on('data', (d) => { log += d; });
    server.stderr.on('data', (d) => { log += d; });
    const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    try {
        for (let i = 0; i < 60 && !/Database ready|listening|running/i.test(log); i++) await wait(250);
        await wait(500);
        const email = process.env.LS_LAYOUT_EMAIL || `layout-${Date.now()}@example.test`;
        const password = process.env.LS_LAYOUT_PASSWORD || `layout-${Date.now()}-pw`;

        const hostCtx = await browser.newContext({ viewport: HOST_VIEWPORTS[0] });
        const host = await hostCtx.newPage();
        await host.goto(`${base}/#/home`);
        const login = await host.evaluate(async ({ email, password, register }) => {
            const res = await fetch(register ? '/auth/register' : '/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name: 'Layout Check' }) });
            return res.status;
        }, { email, password, register: !process.env.LS_LAYOUT_EMAIL });
        assert.equal(login, 200, 'sign in for the host checks');

        for (const format of FORMATS) {
            const room = await host.evaluate(async (gameFormat) => (await fetch('/api/live/create', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'builtin', level: 'beginner', gameFormat, answerMode: 'recognise' }) })).json(), format);
            await host.evaluate((r) => { sessionStorage.setItem('ls_live_host_code', r.code); sessionStorage.setItem('ls_live_host_token', r.hostToken); }, room);
            await host.goto(`${base}/#/live/host`);
            await host.waitForFunction(() => document.getElementById('screen-live-host')?.classList.contains('active'));
            const phones = [];
            for (const [i, name] of ['Maya', 'Olek', 'Zosia', 'Kuba'].entries()) {
                const ctx = await browser.newContext({ viewport: PHONE_VIEWPORTS[i % 2], isMobile: true, hasTouch: true });
                const p = await ctx.newPage();
                await p.goto(`${base}/#/home`);
                await p.evaluate(async ({ code, name }) => {
                    const d = await (await fetch('/api/live/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, nickname: name, avatar: '🦊' }) })).json();
                    sessionStorage.setItem('ls_live_player_id', d.playerId); sessionStorage.setItem('ls_live_player_token', d.playerToken);
                    sessionStorage.setItem('ls_live_room_code', d.code); sessionStorage.setItem('ls_live_nickname', d.nickname); sessionStorage.setItem('ls_live_avatar', d.avatar || '');
                }, { code: room.code, name });
                await p.goto(`${base}/#/live/play`);
                phones.push(p);
            }
            await wait(1500);
            for (const vp of HOST_VIEWPORTS) {
                await host.setViewportSize(vp);
                await wait(300);
                const m = await host.evaluate(measure);
                await t.test(`${format} host lobby ${vp.width}x${vp.height}`, () => { assert.deepEqual(m.active, ['screen-live-host']); assert.equal(m.scrollY, 0); assert.equal(m.scrollX, 0); assert.deepEqual(m.out, []); });
            }
            await host.setViewportSize(HOST_VIEWPORTS[0]);
            for (const [i, p] of phones.slice(0, 2).entries()) {
                const m = await p.evaluate(measure);
                await t.test(`${format} phone lobby ${PHONE_VIEWPORTS[i].width}x${PHONE_VIEWPORTS[i].height}`, () => { assert.deepEqual(m.active, ['screen-live-play']); assert.equal(m.scrollY, 0); assert.deepEqual(m.out, []); });
            }
            await host.evaluate(() => document.getElementById('live-host-start').click());
            await wait(format === 'lucky-lanterns' ? 9000 : format === 'word-cannon' ? 7000 : 2500);
            for (const [i, p] of phones.slice(0, 2).entries()) {
                const m = await p.evaluate(measure);
                await t.test(`${format} phone question ${PHONE_VIEWPORTS[i].width}x${PHONE_VIEWPORTS[i].height}`, () => { assert.ok(m.answering, 'answer controls visible'); assert.equal(m.scrollY, 0); assert.deepEqual(m.out, []); });
            }
            await host.evaluate(() => document.getElementById('live-host-end')?.click());
            for (const p of phones) await p.context().close();
        }

        for (const vp of [...PHONE_VIEWPORTS, ...HOST_VIEWPORTS]) {
            const ctx = await browser.newContext({ viewport: vp });
            const p = await ctx.newPage();
            await p.goto(`${base}/#/live/host`);
            await p.waitForSelector('#lse-forgot-link', { state: 'visible' });
            await p.click('#lse-forgot-link');
            const forgot = await p.evaluate(measure);
            await p.goto(`${base}/#/reset-password?token=${'x'.repeat(43)}`);
            await p.waitForSelector('#rp-invalid', { state: 'visible' });
            const invalid = await p.evaluate(measure);
            await p.evaluate(() => { document.getElementById('rp-invalid').hidden = true; document.getElementById('rp-form').hidden = false; });
            const form = await p.evaluate(measure);
            await t.test(`forgot + reset pages ${vp.width}x${vp.height}`, () => {
                for (const m of [forgot, invalid, form]) { assert.equal(m.scrollY, 0); assert.deepEqual(m.out, []); }
            });
            await ctx.close();
        }
    } finally {
        await browser.close();
        server.kill();
    }
});

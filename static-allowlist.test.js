// Static lockdown: express.static serves the repo root, so only allowlisted client files may be
// reachable. Unit-checks the allowlist and then hits a real server (no DB) over HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { isPublicStaticPath, PUBLIC_PAGES, PUBLIC_SCRIPTS } from './static-allowlist.js';

const ROOT = new URL('.', import.meta.url).pathname;

export const BLOCKED = [
    '/server.js', '/db.js', '/auth.js', '/billing.js', '/mailer.js', '/password-reset.js',
    '/live-game.js', '/lucky-lanterns.js', '/word-cannon.js', '/vocab-quiz-utils.js',
    '/odyssey-prompts.js', '/static-allowlist.js',
    '/static-allowlist.test.js', '/penalty-match.test.js', '/live-layout-fit.test.js',
    '/package.json', '/package-lock.json', '/render.yaml', '/railway.toml', '/DEPLOY.md', '/README.md',
    '/.env', '/.env.example', '/.gitignore', '/.nvmrc', '/.git/config', '/.git/HEAD',
    '/%2eenv', '/%2Egit/config', '/assets/../server.js', '/assets/%2e%2e/server.js', '/..%2fserver.js',
    '/node_modules/express/package.json', '/node_modules/socket.io/package.json',
    '/scripts/', '/tools/', '/data/', '/shorts/',
    '/packs/README.md', '/packs/data/', '/shop/build-previews.mjs', '/shop/make_bmc_shop_cover.py',
    '/shop/', '/assets/', '/audio/',
];

export const ALLOWED = [
    '/', '/index.html', '/admin.html', '/shop.html', '/penalty-match.html', '/vocab-auction.html',
    '/board-game-challenge.html', '/esl-millionaire.html', '/vocab-scenes.html',
    '/site-design.css', '/live-room.css', '/penalty-match.css', '/vocab-auction.css',
    '/live-game-client.js', '/live-entry.js', '/word-cannon-client.js', '/lucky-lanterns-fx.js',
    '/penalty-match-core.js', '/vocab-auction-bank.js', '/vocab-auction-chips.js', '/demo-sets.js',
    '/favicon.ico', '/favicon.png', '/apple-touch-icon.png',
    '/assets/brand/lingospark-logo-red.svg', '/assets/vocab-scenes/animals-farm.jpg',
    '/audio/live-lobby.mp3', '/shop/catalog.js', '/shop/bmc-shop-cover.png',
    '/socket.io/socket.io.js',
];

const listDir = (dir, re) => fs.readdirSync(new URL(dir, import.meta.url)).filter((f) => re.test(f));

test('allowlist: every server/test/config file in the repo root is blocked', () => {
    const clientJs = new Set(PUBLIC_SCRIPTS);
    for (const f of listDir('.', /\.(js|mjs|cjs|json|ya?ml|toml|md|py|sh)$/)) {
        if (clientJs.has(f)) continue;
        assert.equal(isPublicStaticPath('/' + f), false, `${f} must not be public`);
    }
    for (const f of listDir('.', /\.test\.js$/)) assert.equal(isPublicStaticPath('/' + f), false, f);
});

test('allowlist: listed pages and scripts exist and are not server modules or tests', () => {
    for (const f of [...PUBLIC_PAGES, ...PUBLIC_SCRIPTS]) {
        assert.ok(fs.existsSync(ROOT + f), `${f} listed but missing`);
        assert.ok(!f.endsWith('.test.js'), f);
    }
    // Client scripts are classic scripts: none may use ESM imports / node built-ins.
    for (const f of PUBLIC_SCRIPTS) {
        const src = fs.readFileSync(ROOT + f, 'utf8');
        assert.ok(!/^\s*import\s.+from\s+['"]/m.test(src), `${f} looks like an ES/server module`);
        assert.ok(!/process\.env|require\(['"](fs|path|pg)['"]\)/.test(src), `${f} touches server APIs`);
    }
});

test('allowlist: every script/style a page references is served', () => {
    for (const page of PUBLIC_PAGES) {
        const html = fs.readFileSync(ROOT + page, 'utf8');
        const refs = [...html.matchAll(/(?:src|href)=["']([^"'#?]+\.(?:js|css|png|svg|jpg|ico))["']/g)]
            .map((m) => m[1]).filter((u) => !/^https?:|^\/\//.test(u));
        for (const ref of refs) {
            const url = ref.startsWith('/') ? ref : '/' + ref;
            if (url.startsWith('/socket.io/')) continue;
            assert.ok(isPublicStaticPath(url), `${page} references ${ref} but it is blocked`);
        }
    }
});

test('allowlist: unit verdicts', () => {
    for (const p of BLOCKED) assert.equal(isPublicStaticPath(p), false, `blocked: ${p}`);
    for (const p of ALLOWED.filter((x) => !x.startsWith('/socket.io/'))) assert.equal(isPublicStaticPath(p), true, `allowed: ${p}`);
});

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('HTTP: blocked paths 404, allowed paths 200 (server without DB)', async (t) => {
    const port = await freePort();
    const server = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(port), DATABASE_URL: '', APP_BASE_URL: `http://127.0.0.1:${port}` },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    server.stdout.on('data', (d) => { log += d; });
    server.stderr.on('data', (d) => { log += d; });
    try {
        for (let i = 0; i < 80 && !/LingoSpark running/.test(log); i++) await wait(250);
        assert.match(log, /LingoSpark running/, log);
        // Raw request so "../" and "%2e" are sent exactly as written (fetch would normalise them).
        const get = (p) => new Promise((resolve, reject) => {
            const sock = net.connect(port, '127.0.0.1', () => sock.write(`GET ${p} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
            let buf = '';
            sock.on('data', (d) => { buf += d; });
            sock.on('end', () => resolve({ status: Number(buf.split(' ')[1]), body: buf.split('\r\n\r\n').slice(1).join('\r\n\r\n') }));
            sock.on('error', reject);
        });
        for (const p of BLOCKED) {
            await t.test(`blocked ${p}`, async () => {
                const r = await get(p);
                assert.equal(r.status, 404, `${p} -> ${r.status}`);
                assert.ok(!/import |DATABASE_URL|"dependencies"/.test(r.body), `${p} leaked content`);
            });
        }
        for (const p of ALLOWED) {
            await t.test(`allowed ${p}`, async () => {
                const r = await get(p);
                assert.equal(r.status, 200, `${p} -> ${r.status}`);
            });
        }
    } finally {
        server.kill();
    }
});

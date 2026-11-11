import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { mountAppBridge } from './services/study-bridge/auth-app-bridge.js';
import { isPublicStaticPath } from './static-allowlist.js';

const DONE = 'https://lingospark.apps.grok.bot/api/study/google/done';
const LOCAL_DONE = 'http://localhost:8081/api/study/google/done';
const TEST_SECRET = 'test-study-bridge-secret-value'; // 16+ chars, tests only

function b64url(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function parseHandoff(handoff, secret) {
    const parts = handoff.split('.');
    assert.equal(parts.length, 2, 'handoff must be body.sig');
    const [body, sig] = parts;
    const expect = b64url(crypto.createHmac('sha256', secret).update(body).digest());
    assert.equal(sig.length, expect.length);
    assert.ok(crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)), 'HMAC mismatch');
    const pad = body.length % 4 === 0 ? '' : '='.repeat(4 - (body.length % 4));
    const json = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
    return JSON.parse(json);
}

async function listen(app) {
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const get = (path, { cookie, follow = false } = {}) =>
        fetch(base + path, {
            redirect: follow ? 'follow' : 'manual',
            headers: cookie ? { cookie } : {},
        });
    return {
        base,
        get,
        close: () => new Promise((r) => server.close(r)),
    };
}

function appWithBridge({ loggedIn = false } = {}) {
    const app = express();
    app.use((req, _res, next) => {
        req.isAuthenticated = () => loggedIn;
        if (loggedIn) req.user = { id: 1, email: 'test@lingospark.study' };
        next();
    });
    app.get('/', (_req, res) => res.type('text').send('ok'));
    mountAppBridge(app);
    return app;
}

test('static allowlist does not expose the bridge module', () => {
    for (const p of [
        '/services/study-bridge/auth-app-bridge.js',
        '/services/study-bridge/',
        '/services/',
        '/auth-app-bridge.js',
        '/auth-app-bridge.test.js',
    ]) {
        assert.equal(isPublicStaticPath(p), false, p);
    }
});

test('missing or short STUDY_BRIDGE_SECRET returns 503; other routes still work', async (t) => {
    const prev = process.env.STUDY_BRIDGE_SECRET;
    t.after(() => {
        if (prev === undefined) delete process.env.STUDY_BRIDGE_SECRET;
        else process.env.STUDY_BRIDGE_SECRET = prev;
    });

    for (const value of [undefined, '', '   ', 'short-secret']) {
        if (value === undefined) delete process.env.STUDY_BRIDGE_SECRET;
        else process.env.STUDY_BRIDGE_SECRET = value;
        const { get, close } = await listen(appWithBridge());
        try {
            const home = await get('/');
            assert.equal(home.status, 200, `home with secret=${JSON.stringify(value)}`);
            assert.equal(await home.text(), 'ok');
            const r = await get(`/auth/app-bridge?redirect=${encodeURIComponent(DONE)}`);
            assert.equal(r.status, 503, `bridge with secret=${JSON.stringify(value)}`);
            assert.match(await r.text(), /STUDY_BRIDGE_SECRET is not configured/);
        } finally {
            await close();
        }
    }
});

test('disallowed redirects are rejected with 400', async (t) => {
    const prev = process.env.STUDY_BRIDGE_SECRET;
    process.env.STUDY_BRIDGE_SECRET = TEST_SECRET;
    t.after(() => {
        if (prev === undefined) delete process.env.STUDY_BRIDGE_SECRET;
        else process.env.STUDY_BRIDGE_SECRET = prev;
    });
    const { get, close } = await listen(appWithBridge());
    t.after(close);

    const bad = [
        '',
        'https://evil.com/api/study/google/done',
        'https://evil.apps.grok.bot/api/study/google/done',
        'https://lingospark.apps.grok.bot.evil.com/api/study/google/done',
        'https://not-lingospark.apps.grok.bot/api/study/google/done',
        'https://preview.cursor.app/api/study/google/done',
        'http://lingospark.apps.grok.bot/api/study/google/done',
        'https://lingospark.apps.grok.bot/api/study/google/done/',
        'https://lingospark.apps.grok.bot/other',
        'https://lingospark.apps.grok.bot/api/study/google/done?x=1',
        'https://lingospark.apps.grok.bot/api/study/google/done#frag',
        'https://user:pass@lingospark.apps.grok.bot/api/study/google/done',
        'javascript:alert(1)',
        '//evil.com/api/study/google/done',
    ];
    for (const redirect of bad) {
        const qs = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
        const r = await get(`/auth/app-bridge${qs}`);
        assert.equal(r.status, 400, redirect || '(missing)');
        assert.equal(await r.text(), 'Disallowed redirect');
    }
});

test('unauthenticated allowed redirect goes to /auth/google with returnTo the bridge', async (t) => {
    const prev = process.env.STUDY_BRIDGE_SECRET;
    process.env.STUDY_BRIDGE_SECRET = TEST_SECRET;
    t.after(() => {
        if (prev === undefined) delete process.env.STUDY_BRIDGE_SECRET;
        else process.env.STUDY_BRIDGE_SECRET = prev;
    });
    const { get, close } = await listen(appWithBridge({ loggedIn: false }));
    t.after(close);

    const state = 'st_abc123';
    const r = await get(
        `/auth/app-bridge?redirect=${encodeURIComponent(DONE)}&state=${state}`,
    );
    assert.equal(r.status, 302);
    const loc = r.headers.get('location');
    assert.ok(loc.startsWith('/auth/google?returnTo='), loc);
    const returnTo = new URL(loc, 'http://lingospark.study').searchParams.get('returnTo');
    const back = new URL(returnTo, 'http://lingospark.study');
    assert.equal(back.pathname, '/auth/app-bridge');
    assert.equal(back.searchParams.get('redirect'), DONE);
    assert.equal(back.searchParams.get('state'), state);
});

test('signed-in request issues a signed handoff redirect to the app done URL', async (t) => {
    const prev = process.env.STUDY_BRIDGE_SECRET;
    process.env.STUDY_BRIDGE_SECRET = TEST_SECRET;
    t.after(() => {
        if (prev === undefined) delete process.env.STUDY_BRIDGE_SECRET;
        else process.env.STUDY_BRIDGE_SECRET = prev;
    });
    const { get, close } = await listen(appWithBridge({ loggedIn: true }));
    t.after(close);

    const cookie = 'connect.sid=s%3Asigned-session.signature';
    const state = 'g_test1';
    const before = Date.now();
    const r = await get(
        `/auth/app-bridge?redirect=${encodeURIComponent(LOCAL_DONE)}&state=${state}`,
        { cookie },
    );
    const after = Date.now();
    assert.equal(r.status, 302);
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.origin + loc.pathname, LOCAL_DONE);
    assert.equal(loc.searchParams.get('state'), state);
    const handoff = loc.searchParams.get('handoff');
    assert.ok(handoff);
    const payload = parseHandoff(handoff, TEST_SECRET);
    assert.equal(payload.c, cookie);
    assert.ok(payload.exp > after, 'exp must be in the future');
    assert.ok(payload.exp <= before + 2 * 60 * 1000 + 2000, 'exp is ~2 minutes');
});

test('signed-in request without a session cookie returns 401', async (t) => {
    const prev = process.env.STUDY_BRIDGE_SECRET;
    process.env.STUDY_BRIDGE_SECRET = TEST_SECRET;
    t.after(() => {
        if (prev === undefined) delete process.env.STUDY_BRIDGE_SECRET;
        else process.env.STUDY_BRIDGE_SECRET = prev;
    });
    const { get, close } = await listen(appWithBridge({ loggedIn: true }));
    t.after(close);
    const r = await get(`/auth/app-bridge?redirect=${encodeURIComponent(DONE)}`);
    assert.equal(r.status, 401);
    assert.equal(await r.text(), 'No session cookie');
});

test('https production done URL is allowed', async (t) => {
    const prev = process.env.STUDY_BRIDGE_SECRET;
    process.env.STUDY_BRIDGE_SECRET = TEST_SECRET;
    t.after(() => {
        if (prev === undefined) delete process.env.STUDY_BRIDGE_SECRET;
        else process.env.STUDY_BRIDGE_SECRET = prev;
    });
    const { get, close } = await listen(appWithBridge({ loggedIn: false }));
    t.after(close);
    const r = await get(`/auth/app-bridge?redirect=${encodeURIComponent(DONE)}`);
    assert.equal(r.status, 302);
});

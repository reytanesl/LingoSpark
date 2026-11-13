import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { createTrackGenerateHandler, createTrackLimiter, TRACK_PATH } from './track-ai.js';
import { mountAppBridge } from './services/study-bridge/auth-app-bridge.js';
import {
    createStudyCors, createBearerSession, skipOnAppRoutes, parseAllowedOrigins, isAppDirectPath, tokenForAppOrigin,
    signSessionToken, sealAppCode, createCodeRedeemer,
} from './study-direct.js';

const APP = 'https://lingospark.apps.grok.bot';
const EVIL = 'https://evil.apps.grok.bot';
const SECRET = 'unit-test-session-secret-0123456789';
const TERMS = [{ id: '1', en: 'fog', pl: 'mgła', pos: 'noun' }];
const WARM_BODY = { setId: 'lake', level: 'B1', terms: TERMS, mode: 'warmup', warmupSize: 3 };

async function serve({ authedLimiter } = {}) {
    const app = express();
    app.use(createStudyCors());
    app.use(skipOnAppRoutes((_req, res, next) => { res.set('Access-Control-Allow-Origin', 'LEGACY'); next(); }));
    app.use(express.json());
    app.use(createBearerSession());
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: false, cookie: { sameSite: 'lax' } }));
    passport.serializeUser((u, cb) => cb(null, u));
    passport.deserializeUser((u, cb) => cb(null, u));
    app.use(passport.initialize());
    app.use(passport.session());
    app.post('/auth/login', (req, res, next) => {
        req.login({ id: 7, email: 'a@b.c' }, (e) => {
            if (e) return next(e);
            const token = tokenForAppOrigin(req, { secret: SECRET });
            res.json({ ok: true, ...(token ? { token } : {}) });
        });
    });
    app.get('/api/auth/me', (req, res) => res.json({ user: req.user || null }));
    app.post('/auth/logout', (req, res, next) => req.logout((e) => (e ? next(e) : req.session.destroy(() => res.json({ ok: true })))));
    const calls = [];
    const generate = async (v) => { calls.push(v); return { items: [{ id: 'x' }], meta: { mode: v.mode }, stats: {} }; };
    app.post(TRACK_PATH, createTrackGenerateHandler({ generate, limiter: authedLimiter || createTrackLimiter() }));
    mountAppBridge(app, { sessionSecret: () => SECRET });
    app.get('/other', (_req, res) => res.send('other'));
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    return { base, calls, close: () => new Promise((r) => server.close(r)) };
}

const j = (body, extra = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });

test('parseAllowedOrigins: default app origin, env additions, junk rejected', () => {
    assert.deepEqual(parseAllowedOrigins({}), [APP]);
    const o = parseAllowedOrigins({ STUDY_CORS_ORIGINS: ' https://x.example , *, null, http://evil.com, https://p.example/path, http://localhost:8081, https://user@u.example' });
    assert.deepEqual(o.sort(), [APP, 'http://localhost:8081', 'https://x.example'].sort());
    assert.ok(isAppDirectPath('/api/study/track-generate') && isAppDirectPath('/api/word-sets/12') && !isAppDirectPath('/api/admin/users') && !isAppDirectPath('/api/word-setsX'));
});

test('CORS preflight from the app origin: 204 + exact headers, no credentials', async (t) => {
    const s = await serve(); t.after(s.close);
    const r = await fetch(s.base + TRACK_PATH, { method: 'OPTIONS', headers: { origin: APP, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,authorization' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), APP);
    assert.equal(r.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
    assert.equal(r.headers.get('access-control-allow-headers'), 'Content-Type, Authorization');
    assert.equal(r.headers.get('access-control-max-age'), '600');
    assert.equal(r.headers.get('access-control-expose-headers'), 'Retry-After');
    assert.equal(r.headers.get('access-control-allow-credentials'), null);
    assert.match(r.headers.get('vary'), /Origin/);
});

test('CORS: rejected origin gets no CORS headers (preflight 403, real request has none, legacy cors skipped)', async (t) => {
    const s = await serve(); t.after(s.close);
    const pre = await fetch(s.base + TRACK_PATH, { method: 'OPTIONS', headers: { origin: EVIL, 'access-control-request-method': 'POST' } });
    assert.equal(pre.status, 403);
    assert.equal(pre.headers.get('access-control-allow-origin'), null);
    const real = await fetch(s.base + TRACK_PATH, j(WARM_BODY, { origin: EVIL }));
    assert.equal(real.status, 401);
    assert.equal(real.headers.get('access-control-allow-origin'), null);
    assert.match(real.headers.get('vary'), /Origin/);
    // a non-app route still goes through the legacy middleware untouched
    const other = await fetch(s.base + '/other', { headers: { origin: EVIL } });
    assert.equal(other.headers.get('access-control-allow-origin'), 'LEGACY');
    // allowed origin on a real response: ACAO + Retry-After exposed, still no credentials
    const ok = await fetch(s.base + TRACK_PATH, j(WARM_BODY, { origin: APP }));
    assert.equal(ok.headers.get('access-control-allow-origin'), APP);
    assert.equal(ok.headers.get('access-control-allow-credentials'), null);
});

test('login from the app origin returns a token; Bearer works on track-generate warmup', async (t) => {
    const s = await serve(); t.after(s.close);
    const login = await fetch(s.base + '/auth/login', j({}, { origin: APP }));
    const { token } = await login.json();
    assert.match(token, /^s:/);
    const r = await fetch(s.base + TRACK_PATH, j(WARM_BODY, { origin: APP, authorization: `Bearer ${token}` }));
    assert.equal(r.status, 200);
    const out = await r.json();
    assert.equal(out.meta.mode, 'warmup');
    assert.equal(s.calls[0].mode, 'warmup');
    assert.equal(s.calls[0].warmupSize, 3);
    const me = await (await fetch(s.base + '/api/auth/me', { headers: { authorization: `Bearer ${token}` } })).json();
    assert.equal(me.user.id, 7);
});

test('no token is issued to the site\'s own pages or other origins', async (t) => {
    const s = await serve(); t.after(s.close);
    for (const origin of [undefined, EVIL]) {
        const r = await (await fetch(s.base + '/auth/login', j({}, origin ? { origin } : {}))).json();
        assert.equal(r.token, undefined);
    }
});

test('missing / invalid / forged / tampered Bearer token -> 401', async (t) => {
    const s = await serve(); t.after(s.close);
    const login = await fetch(s.base + '/auth/login', j({}, { origin: APP }));
    const { token } = await login.json();
    const forged = signSessionToken(crypto.randomUUID(), 'some-other-secret-value-xxxxxxxxxx');
    const unknownSid = signSessionToken(crypto.randomUUID(), SECRET); // properly signed but no such session
    for (const h of [undefined, 'Bearer ', 'Bearer garbage', `Bearer ${forged}`, `Bearer ${unknownSid}`, `Bearer ${token.slice(0, -2)}xx`, 'Basic abc']) {
        const r = await fetch(s.base + TRACK_PATH, j(WARM_BODY, { origin: APP, ...(h ? { authorization: h } : {}) }));
        assert.equal(r.status, 401, String(h));
        assert.equal((await r.json()).code, 'auth_required');
    }
    assert.equal(s.calls.length, 0);
});

test('Bearer replaces ambient cookies (a cookie session cannot be mixed in) and logout revokes the token', async (t) => {
    const s = await serve(); t.after(s.close);
    const login = await fetch(s.base + '/auth/login', j({}, { origin: APP }));
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const { token } = await login.json();
    // cookie alone works (the site itself)...
    assert.equal((await fetch(s.base + TRACK_PATH, j(WARM_BODY, { cookie }))).status, 200);
    // ...but an invalid Bearer next to a valid cookie must not fall back to the cookie
    assert.equal((await fetch(s.base + TRACK_PATH, j(WARM_BODY, { cookie, authorization: 'Bearer nope' }))).status, 401);
    // logout with the Bearer token destroys the session -> token is dead
    assert.equal((await fetch(s.base + '/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } })).status, 200);
    assert.equal((await fetch(s.base + TRACK_PATH, j(WARM_BODY, { authorization: `Bearer ${token}` }))).status, 401);
});

test('per-user rate limits still apply to Bearer users', async (t) => {
    const limiter = createTrackLimiter();
    const s = await serve({ authedLimiter: limiter }); t.after(s.close);
    const { token } = await (await fetch(s.base + '/auth/login', j({}, { origin: APP }))).json();
    let last;
    for (let i = 0; i < 40; i++) { last = await fetch(s.base + TRACK_PATH, j(WARM_BODY, { authorization: `Bearer ${token}` })); if (last.status === 429) break; }
    assert.equal(last.status, 429);
    assert.ok(Number(last.headers.get('retry-after')) >= 1);
});

// ---- Google handoff: PKCE code -> token

const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const DONE = `${APP}/api/study/google/done`;

test('app bridge (PKCE): logged-out goes to Google and keeps challenge; logged-in redirects with a code only; code redeems once', async (t) => {
    const prev = process.env.STUDY_BRIDGE_SECRET; delete process.env.STUDY_BRIDGE_SECRET; // not needed in PKCE mode
    t.after(() => { if (prev !== undefined) process.env.STUDY_BRIDGE_SECRET = prev; });
    const s = await serve(); t.after(s.close);
    const q = `redirect=${encodeURIComponent(DONE)}&state=st1&code_challenge=${challenge}`;
    const out = await fetch(`${s.base}/auth/app-bridge?${q}`, { redirect: 'manual' });
    assert.equal(out.status, 302);
    const back = new URL(new URL(out.headers.get('location'), 'http://x').searchParams.get('returnTo'), 'http://x');
    assert.equal(back.searchParams.get('code_challenge'), challenge);
    assert.equal(back.searchParams.get('redirect'), DONE);
    // login to get a session cookie, then hit the bridge
    const login = await fetch(s.base + '/auth/login', j({}, { origin: APP }));
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const { token } = await login.json();
    const r = await fetch(`${s.base}/auth/app-bridge?${q}`, { redirect: 'manual', headers: { cookie } });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.origin + loc.pathname, DONE);
    assert.equal(loc.searchParams.get('state'), 'st1');
    const code = loc.searchParams.get('code');
    assert.ok(code && !code.includes(token) && !loc.search.includes('connect.sid'), 'no session token or cookie in the URL');
    // wrong verifier fails (and does not burn the code), right verifier works exactly once
    const bad = await fetch(s.base + '/auth/app-token', j({ code, code_verifier: crypto.randomBytes(32).toString('base64url') }, { origin: APP }));
    assert.equal(bad.status, 400);
    const good = await fetch(s.base + '/auth/app-token', j({ code, code_verifier: verifier }, { origin: APP }));
    assert.equal(good.status, 200);
    assert.equal(good.headers.get('access-control-allow-origin'), APP);
    const got = await good.json();
    assert.equal(got.token, token);
    const again = await fetch(s.base + '/auth/app-token', j({ code, code_verifier: verifier }, { origin: APP }));
    assert.equal((await again.json()).code, 'used');
    assert.equal((await fetch(s.base + TRACK_PATH, j(WARM_BODY, { authorization: `Bearer ${got.token}` }))).status, 200);
});

test('app bridge (PKCE): delivery=post form, bad challenge, wrong-redirect, expired code', async (t) => {
    const s = await serve(); t.after(s.close);
    const login = await fetch(s.base + '/auth/login', j({}, { origin: APP }));
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = await fetch(`${s.base}/auth/app-bridge?redirect=${encodeURIComponent(DONE)}&code_challenge=${challenge}&delivery=post&state=a%22b`, { headers: { cookie } });
    assert.equal(post.status, 200);
    const html = await post.text();
    assert.match(html, /method="POST" action="https:\/\/lingospark\.apps\.grok\.bot\/api\/study\/google\/done"/);
    assert.match(html, /name="code"/);
    assert.ok(!html.includes('a"b'), 'state is HTML-escaped');
    assert.equal((await fetch(`${s.base}/auth/app-bridge?redirect=${encodeURIComponent(DONE)}&code_challenge=short`, { headers: { cookie } })).status, 400);
    for (const redirect of [`${EVIL}/api/study/google/done`, 'https://apps.grok.bot/api/study/google/done', 'https://lingospark.apps.grok.bot/other']) {
        assert.equal((await fetch(`${s.base}/auth/app-bridge?redirect=${encodeURIComponent(redirect)}&code_challenge=${challenge}`, { headers: { cookie } })).status, 400, redirect);
    }
    let t0 = 1_000_000;
    const redeem = createCodeRedeemer({ secret: () => SECRET, now: () => t0 });
    const code = sealAppCode({ token: 's:abc.def', challenge, secret: SECRET, now: t0 });
    t0 += 61_000;
    assert.equal(redeem(code, verifier).error, 'expired');
    assert.equal(redeem(code.slice(0, -3) + 'AAA', verifier).error, 'bad_code');
});

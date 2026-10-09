import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcrypt';
import {
    generateResetToken, hashResetToken, isWellFormedResetToken, buildResetUrl, validateNewPassword,
    createRateLimiter, createMemoryResetStore, registerPasswordResetRoutes, resetEmailContent,
    NEUTRAL_FORGOT_MESSAGE, RESET_TOKEN_TTL_MS,
} from './password-reset.js';
import { createMailer, mailProviderFromEnv } from './mailer.js';

const silent = { log() {}, warn() {}, error() {} };

async function setup({ limits = {}, users } = {}) {
    let clock = Date.parse('2026-10-09T10:00:00Z');
    const now = () => clock;
    const store = createMemoryResetStore({
        users: users || [
            { id: 1, email: 'teacher@school.test', name: 'Ola', password_hash: await bcrypt.hash('old-password-1', 4) },
            { id: 2, email: 'google@school.test', name: 'G', password_hash: null },
        ],
        now,
    });
    const sent = [];
    const mailer = { provider: 'test', configured: true, send: async (m) => { sent.push(m); return { provider: 'test' }; } };
    const app = express();
    app.use(express.json());
    const routes = registerPasswordResetRoutes(app, {
        store, mailer, baseUrl: 'https://lingospark.example', hashPassword: (pw) => bcrypt.hash(pw, 4),
        minPasswordLength: 8, now, logger: silent, limits,
    });
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async (path, body) => {
        const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
    };
    const tokenFromMail = (m) => new URL(m.text.match(/https:\/\/\S+/)[0].replace('/#/', '/')).searchParams.get('token');
    return { store, sent, routes, post, tokenFromMail, advance: (ms) => { clock += ms; }, close: () => new Promise((r) => server.close(r)) };
}

test('tokens: 32 random bytes, base64url, only the SHA-256 hash is stored', () => {
    const a = generateResetToken();
    const b = generateResetToken();
    assert.notEqual(a.token, b.token);
    assert.ok(isWellFormedResetToken(a.token));
    assert.equal(a.token.length, 43);
    assert.equal(a.tokenHash, hashResetToken(a.token));
    assert.match(a.tokenHash, /^[0-9a-f]{64}$/);
    assert.ok(!a.tokenHash.includes(a.token));
    assert.ok(!isWellFormedResetToken('short'));
    assert.ok(!isWellFormedResetToken(`${a.token}!`));
    assert.ok(!isWellFormedResetToken(null));
});

test('reset link keeps the token in the URL fragment', () => {
    assert.equal(buildResetUrl('https://x.test/', 'abc'), 'https://x.test/#/reset-password?token=abc');
    const mail = resetEmailContent({ name: 'Ola', url: 'https://x.test/#/reset-password?token=abc' });
    assert.match(mail.subject, /Reset your LingoSpark password/);
    assert.match(mail.text, /expires in 1 hour/);
    assert.match(mail.html, /token=abc/);
});

test('password validation', () => {
    assert.match(validateNewPassword('short', 'short'), /at least 8/);
    assert.match(validateNewPassword('long-enough', 'long-enougX'), /do not match/);
    assert.match(validateNewPassword('        ', '        '), /only spaces/);
    assert.match(validateNewPassword('x'.repeat(201), 'x'.repeat(201)), /at most 200/);
    assert.equal(validateNewPassword('long-enough', 'long-enough'), null);
});

test('rate limiter: fixed window per key', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    assert.ok(rl.hit('a')); assert.ok(rl.hit('a')); assert.ok(!rl.hit('a'));
    assert.ok(rl.hit('b'));
    t = 1000;
    assert.ok(rl.hit('a'));
});

test('forgot-password answers the same for known and unknown emails; only real accounts get a mail', async () => {
    const t = await setup();
    try {
        const known = await t.post('/auth/forgot-password', { email: '  Teacher@School.test ' });
        const unknown = await t.post('/auth/forgot-password', { email: 'nobody@school.test' });
        assert.equal(known.status, 200);
        assert.deepEqual(known.body, unknown.body);
        assert.equal(known.body.message, NEUTRAL_FORGOT_MESSAGE);
        assert.equal(known.headers.get('cache-control'), 'no-store');
        await t.routes.idle();
        assert.equal(t.sent.length, 1);
        assert.equal(t.sent[0].to, 'teacher@school.test');
        const token = t.tokenFromMail(t.sent[0]);
        assert.ok(isWellFormedResetToken(token));
        assert.equal(t.store.tokens.length, 1);
        assert.equal(t.store.tokens[0].tokenHash, hashResetToken(token));
        assert.ok(!JSON.stringify(t.store.tokens).includes(token), 'raw token must not be stored');
        assert.equal(t.store.tokens[0].expiresAt - Date.parse('2026-10-09T10:00:00Z'), RESET_TOKEN_TTL_MS);
        const bad = await t.post('/auth/forgot-password', { email: 'not-an-email' });
        assert.equal(bad.status, 400);
    } finally { await t.close(); }
});

test('full reset: validates, changes the password, burns the token, signs out other sessions', async () => {
    const t = await setup();
    try {
        await t.post('/auth/forgot-password', { email: 'teacher@school.test' });
        await t.routes.idle();
        const token = t.tokenFromMail(t.sent[0]);
        assert.deepEqual((await t.post('/auth/reset-password/check', { token })).body, { valid: true });
        assert.deepEqual((await t.post('/auth/reset-password/check', { token: 'x'.repeat(43) })).body, { valid: false });

        const mismatch = await t.post('/auth/reset-password', { token, password: 'new-password-1', confirm: 'new-password-2' });
        assert.equal(mismatch.status, 400);
        assert.equal(mismatch.body.code, 'invalid_password');
        const short = await t.post('/auth/reset-password', { token, password: 'short', confirm: 'short' });
        assert.equal(short.status, 400);
        assert.equal((await t.post('/auth/reset-password/check', { token })).body.valid, true, 'a typo must not burn the link');

        const ok = await t.post('/auth/reset-password', { token, password: 'new-password-1', confirm: 'new-password-1' });
        assert.equal(ok.status, 200);
        assert.equal(ok.body.email, 'teacher@school.test');
        const user = t.store.users.find((u) => u.id === 1);
        assert.ok(await bcrypt.compare('new-password-1', user.password_hash));
        assert.ok(!(await bcrypt.compare('old-password-1', user.password_hash)));
        assert.deepEqual(t.store.sessionsDeletedFor, [1]);

        const again = await t.post('/auth/reset-password', { token, password: 'another-pass-1', confirm: 'another-pass-1' });
        assert.equal(again.status, 400);
        assert.equal(again.body.code, 'invalid_token');
        assert.equal((await t.post('/auth/reset-password/check', { token })).body.valid, false);
        assert.ok(await bcrypt.compare('new-password-1', user.password_hash));
    } finally { await t.close(); }
});

test('links expire after 1 hour and only the newest link works', async () => {
    const t = await setup();
    try {
        await t.post('/auth/forgot-password', { email: 'teacher@school.test' });
        await t.routes.idle();
        const first = t.tokenFromMail(t.sent[0]);
        await t.post('/auth/forgot-password', { email: 'teacher@school.test' });
        await t.routes.idle();
        const second = t.tokenFromMail(t.sent[1]);
        assert.equal((await t.post('/auth/reset-password/check', { token: first })).body.valid, false);
        assert.equal((await t.post('/auth/reset-password/check', { token: second })).body.valid, true);
        t.advance(RESET_TOKEN_TTL_MS + 1);
        assert.equal((await t.post('/auth/reset-password/check', { token: second })).body.valid, false);
        const late = await t.post('/auth/reset-password', { token: second, password: 'new-password-1', confirm: 'new-password-1' });
        assert.equal(late.status, 400);
        assert.equal(late.body.code, 'invalid_token');
    } finally { await t.close(); }
});

test('two simultaneous submits of one link: exactly one wins', async () => {
    const t = await setup();
    try {
        await t.post('/auth/forgot-password', { email: 'teacher@school.test' });
        await t.routes.idle();
        const token = t.tokenFromMail(t.sent[0]);
        const results = await Promise.all([
            t.post('/auth/reset-password', { token, password: 'first-pass-11', confirm: 'first-pass-11' }),
            t.post('/auth/reset-password', { token, password: 'second-pass-22', confirm: 'second-pass-22' }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    } finally { await t.close(); }
});

test('Google-only accounts can set a password through the emailed link', async () => {
    const t = await setup();
    try {
        await t.post('/auth/forgot-password', { email: 'google@school.test' });
        await t.routes.idle();
        const token = t.tokenFromMail(t.sent[0]);
        const ok = await t.post('/auth/reset-password', { token, password: 'fresh-pass-12', confirm: 'fresh-pass-12' });
        assert.equal(ok.status, 200);
        assert.ok(await bcrypt.compare('fresh-pass-12', t.store.users.find((u) => u.id === 2).password_hash));
    } finally { await t.close(); }
});

test('rate limits: per IP (429) and a silent per-email cap', async () => {
    const t = await setup({ limits: { forgotPerIp: 5, forgotPerEmail: 3, resetPerIp: 3 } });
    try {
        const statuses = [];
        for (let i = 0; i < 5; i++) statuses.push((await t.post('/auth/forgot-password', { email: 'teacher@school.test' })).status);
        assert.deepEqual(statuses, [200, 200, 200, 200, 200]);
        await t.routes.idle();
        assert.equal(t.sent.length, 3, 'per-email cap stops mail floods without revealing anything');
        const blocked = await t.post('/auth/forgot-password', { email: 'other@school.test' });
        assert.equal(blocked.status, 429);
        const resets = [];
        for (let i = 0; i < 4; i++) resets.push((await t.post('/auth/reset-password', { token: 'y'.repeat(43), password: 'new-password-1', confirm: 'new-password-1' })).status);
        assert.deepEqual(resets, [400, 400, 400, 429]);
    } finally { await t.close(); }
});

test('mailer: provider from env, dev log shows the link, production never logs it', async () => {
    assert.equal(mailProviderFromEnv({}), 'log');
    assert.equal(mailProviderFromEnv({ SMTP_HOST: 'smtp.x' }), 'smtp');
    assert.equal(mailProviderFromEnv({ RESEND_API_KEY: 'k', SMTP_HOST: 'smtp.x' }), 'resend');
    const lines = [];
    const logger = { log: (m) => lines.push(['log', m]), warn: (m) => lines.push(['warn', m]), error() {} };
    const dev = createMailer({ NODE_ENV: 'development' }, { logger });
    assert.equal(dev.configured, false);
    await dev.send({ to: 'a@b.test', subject: 'Reset', text: 'link https://x/#/reset-password?token=SECRET' });
    assert.ok(lines.some(([k, m]) => k === 'log' && m.includes('token=SECRET')));
    lines.length = 0;
    const prod = createMailer({ NODE_ENV: 'production' }, { logger });
    await prod.send({ to: 'a@b.test', subject: 'Reset', text: 'link https://x/#/reset-password?token=SECRET' });
    assert.ok(lines.length > 0);
    assert.ok(lines.every(([, m]) => !m.includes('SECRET')));
});

test('mailer: Resend and SMTP adapters', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ id: 'em_1' }) }; };
    const resend = createMailer({ RESEND_API_KEY: 're_test', MAIL_FROM: 'LingoSpark <no-reply@lingospark.test>' }, { logger: silent, fetchImpl });
    const r = await resend.send({ to: 't@x.test', subject: 'S', text: 'T', html: '<b>H</b>' });
    assert.equal(r.id, 'em_1');
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
    assert.deepEqual(JSON.parse(calls[0].init.body), { from: 'LingoSpark <no-reply@lingospark.test>', to: ['t@x.test'], subject: 'S', text: 'T', html: '<b>H</b>' });

    const failing = createMailer({ RESEND_API_KEY: 're_test', MAIL_FROM: 'a@b.test' }, { logger: silent, fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'domain not verified' }) });
    await assert.rejects(failing.send({ to: 't@x.test', subject: 'S', text: 'T' }), /403/);

    let transportOpts = null;
    const sentMail = [];
    const nodemailerImport = async () => ({ default: { createTransport: (o) => { transportOpts = o; return { sendMail: async (m) => { sentMail.push(m); return { messageId: 'm1' }; } }; } } });
    const smtp = createMailer({ SMTP_HOST: 'smtp.x.test', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'n@x.test' }, { logger: silent, nodemailerImport });
    const s = await smtp.send({ to: 't@x.test', subject: 'S', text: 'T' });
    assert.equal(s.id, 'm1');
    assert.deepEqual(transportOpts, { host: 'smtp.x.test', port: 465, secure: true, auth: { user: 'u', pass: 'p' } });
    assert.equal(sentMail[0].from, 'n@x.test');
});

// Optional: run against a real Postgres (LS_PG_TESTS=1 DATABASE_URL=...). Never runs in plain `npm test`.
test('pg store: idempotent table + single-use tokens', { skip: process.env.LS_PG_TESTS !== '1' && 'set LS_PG_TESTS=1 with DATABASE_URL to run' }, async () => {
    const { initDb, getPool } = await import('./db.js');
    const { createPgResetStore } = await import('./password-reset.js');
    await initDb();
    await initDb(); // second run must be a no-op
    const pool = getPool();
    const email = `reset-test-${Date.now()}@example.test`;
    const { rows } = await pool.query('INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id', [email, 'Reset Test']);
    const userId = rows[0].id;
    try {
        const store = createPgResetStore(pool);
        assert.equal((await store.findUserByEmail(email.toUpperCase())).id, userId);
        const a = generateResetToken();
        await store.createToken({ userId, tokenHash: a.tokenHash, expiresAt: Date.now() + RESET_TOKEN_TTL_MS, requestIp: '127.0.0.1' });
        const b = generateResetToken();
        await store.createToken({ userId, tokenHash: b.tokenHash, expiresAt: Date.now() + RESET_TOKEN_TTL_MS, requestIp: '127.0.0.1' });
        assert.equal(await store.isTokenValid(a.tokenHash), false);
        assert.equal(await store.isTokenValid(b.tokenHash), true);
        const [x, y] = await Promise.all([store.consumeToken(b.tokenHash), store.consumeToken(b.tokenHash)]);
        assert.deepEqual([x, y].filter((v) => v != null), [userId]);
        assert.equal(await store.setPassword(userId, 'hash'), email);
        await store.deleteUserSessions(userId);
        const expired = generateResetToken();
        await store.createToken({ userId, tokenHash: expired.tokenHash, expiresAt: Date.now() - 1000 });
        assert.equal(await store.consumeToken(expired.tokenHash), null);
    } finally {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        await pool.end();
    }
});

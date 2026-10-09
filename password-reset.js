/**
 * "Forgot password?" flow for email/password accounts.
 *
 * - POST /auth/forgot-password {email}          → always the same neutral answer (no account enumeration);
 *                                                 the token + email work happens after the response is sent.
 * - POST /auth/reset-password/check {token}     → { valid } so the reset page can show "link expired" up front.
 * - POST /auth/reset-password {token, password, confirm}
 *                                               → sets the new password, burns the token (single use),
 *                                                 invalidates the user's other reset links and signs out
 *                                                 their existing sessions.
 *
 * Tokens: 32 random bytes (base64url) sent only in the email link; the database stores a SHA-256 hash.
 * Links expire after 1 hour. Requests are rate-limited per IP and per email address (in memory).
 */
import crypto from 'crypto';

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const NEUTRAL_FORGOT_MESSAGE = 'If an account exists for that email, we sent a link to reset your password. It works once and expires in 1 hour.';
export const INVALID_LINK_MESSAGE = 'This reset link is invalid or has expired. Ask for a new one.';
export const MAX_PASSWORD_LENGTH = 200;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function hashResetToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function generateResetToken() {
    const token = crypto.randomBytes(32).toString('base64url');
    return { token, tokenHash: hashResetToken(token) };
}

export function isWellFormedResetToken(token) {
    return typeof token === 'string' && TOKEN_RE.test(token);
}

export function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export function looksLikeEmail(email) {
    const e = normalizeEmail(email);
    return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Token lives in the URL fragment so it never reaches server/proxy access logs. */
export function buildResetUrl(baseUrl, token) {
    return `${String(baseUrl || '').replace(/\/$/, '')}/#/reset-password?token=${encodeURIComponent(token)}`;
}

export function validateNewPassword(password, confirm, minLength = 8) {
    const pw = typeof password === 'string' ? password : '';
    if (pw.length < minLength) return `Password must be at least ${minLength} characters.`;
    if (pw.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
    if (!pw.trim()) return 'Password cannot be only spaces.';
    if (confirm !== undefined && confirm !== pw) return 'Passwords do not match.';
    return null;
}

/** Fixed-window counter per key. */
export function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
    const hits = new Map();
    return {
        hit(key) {
            const t = now();
            let entry = hits.get(key);
            if (!entry || t - entry.start >= windowMs) {
                entry = { start: t, count: 0 };
                hits.set(key, entry);
            }
            entry.count += 1;
            if (hits.size > 5000) {
                for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
            }
            return entry.count <= limit;
        },
        reset() { hits.clear(); },
    };
}

export function resetEmailContent({ name, url, appName = 'LingoSpark' }) {
    const hello = name ? `Hi ${name},` : 'Hi,';
    const text = [
        hello,
        '',
        `Someone (hopefully you) asked to reset the password for your ${appName} account.`,
        'Open this link to choose a new password. It works once and expires in 1 hour:',
        '',
        url,
        '',
        "If you didn't ask for this, you can ignore this email — your password stays the same.",
        '',
        `— ${appName}`,
    ].join('\n');
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const html = `<!doctype html><html><body style="margin:0;background:#F5F7FF;font-family:Arial,Helvetica,sans-serif;color:#1E1B3A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:3px solid #C8102E;border-radius:20px;padding:28px;">
<tr><td style="font-size:22px;font-weight:bold;color:#012169;padding-bottom:12px;">Reset your ${esc(appName)} password</td></tr>
<tr><td style="font-size:15px;line-height:1.5;padding-bottom:20px;">${esc(hello)}<br>Someone (hopefully you) asked to reset the password for your ${esc(appName)} account. The link works once and expires in 1 hour.</td></tr>
<tr><td align="center" style="padding-bottom:20px;"><a href="${esc(url)}" style="display:inline-block;background:#C8102E;color:#fff;text-decoration:none;font-weight:bold;font-size:17px;padding:14px 28px;border-radius:999px;">Choose a new password</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#5B6075;">Button not working? Copy this link into your browser:<br><a href="${esc(url)}" style="color:#012169;word-break:break-all;">${esc(url)}</a><br><br>If you didn't ask for this, ignore this email — your password stays the same.</td></tr>
</table></td></tr></table></body></html>`;
    return { subject: `Reset your ${appName} password`, text, html };
}

/** Postgres-backed store (table created idempotently in db.js initDb). */
export function createPgResetStore(pool) {
    return {
        async findUserByEmail(email) {
            const r = await pool.query('SELECT id, email, name FROM users WHERE LOWER(email) = $1 LIMIT 1', [normalizeEmail(email)]);
            return r.rows[0] || null;
        },
        async createToken({ userId, tokenHash, expiresAt, requestIp }) {
            // Only the newest link works: older unused links for this user are retired.
            await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId]);
            await pool.query('DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL \'7 days\'');
            await pool.query(
                'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, request_ip) VALUES ($1, $2, $3, $4)',
                [userId, tokenHash, new Date(expiresAt), requestIp || null],
            );
        },
        async isTokenValid(tokenHash) {
            const r = await pool.query(
                'SELECT 1 FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()',
                [tokenHash],
            );
            return r.rowCount > 0;
        },
        /** Atomic single use: only one concurrent request can flip used_at. */
        async consumeToken(tokenHash) {
            const r = await pool.query(
                `UPDATE password_reset_tokens SET used_at = NOW()
                 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
                 RETURNING user_id`,
                [tokenHash],
            );
            return r.rows[0]?.user_id ?? null;
        },
        async setPassword(userId, passwordHash) {
            const r = await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING email', [userId, passwordHash]);
            return r.rows[0]?.email || null;
        },
        async invalidateUserTokens(userId) {
            await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId]);
        },
        async deleteUserSessions(userId) {
            try {
                await pool.query(`DELETE FROM session WHERE (sess::jsonb -> 'passport' ->> 'user') = $1`, [String(userId)]);
            } catch (err) {
                if (err?.code !== '42P01') throw err; // no session table yet
            }
        },
    };
}

/** In-memory store with the same contract (tests / no database). */
export function createMemoryResetStore({ users = [], now = () => Date.now() } = {}) {
    const tokens = [];
    const userList = users.map((u) => ({ ...u }));
    return {
        users: userList,
        tokens,
        sessionsDeletedFor: [],
        async findUserByEmail(email) {
            return userList.find((u) => normalizeEmail(u.email) === normalizeEmail(email)) || null;
        },
        async createToken({ userId, tokenHash, expiresAt, requestIp }) {
            for (const t of tokens) if (t.userId === userId && !t.usedAt) t.usedAt = now();
            tokens.push({ userId, tokenHash, expiresAt, requestIp, usedAt: null, createdAt: now() });
        },
        async isTokenValid(tokenHash) {
            return tokens.some((t) => t.tokenHash === tokenHash && !t.usedAt && t.expiresAt > now());
        },
        async consumeToken(tokenHash) {
            const t = tokens.find((x) => x.tokenHash === tokenHash && !x.usedAt && x.expiresAt > now());
            if (!t) return null;
            t.usedAt = now();
            return t.userId;
        },
        async setPassword(userId, passwordHash) {
            const u = userList.find((x) => x.id === userId);
            if (!u) return null;
            u.password_hash = passwordHash;
            return u.email;
        },
        async invalidateUserTokens(userId) {
            for (const t of tokens) if (t.userId === userId && !t.usedAt) t.usedAt = now();
        },
        async deleteUserSessions(userId) {
            this.sessionsDeletedFor.push(userId);
        },
    };
}

export function registerPasswordResetRoutes(app, {
    store,
    mailer,
    baseUrl,
    hashPassword,
    minPasswordLength = 8,
    isReady = () => true,
    now = () => Date.now(),
    logger = console,
    limits = {},
} = {}) {
    if (!store || !mailer || !hashPassword) throw new Error('registerPasswordResetRoutes needs store, mailer and hashPassword');
    const ipForgot = createRateLimiter({ limit: limits.forgotPerIp ?? 5, windowMs: limits.windowMs ?? 15 * 60 * 1000, now });
    const emailForgot = createRateLimiter({ limit: limits.forgotPerEmail ?? 3, windowMs: 60 * 60 * 1000, now });
    const ipReset = createRateLimiter({ limit: limits.resetPerIp ?? 10, windowMs: limits.windowMs ?? 15 * 60 * 1000, now });
    const ipCheck = createRateLimiter({ limit: limits.checkPerIp ?? 30, windowMs: limits.windowMs ?? 15 * 60 * 1000, now });
    const pending = new Set();
    const ipOf = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
    const noStore = (res) => res.set('Cache-Control', 'no-store');

    async function issueResetEmail(email, requestIp) {
        const user = await store.findUserByEmail(email);
        if (!user) return { sent: false, reason: 'no-account' };
        const { token, tokenHash } = generateResetToken();
        await store.createToken({ userId: user.id, tokenHash, expiresAt: now() + RESET_TOKEN_TTL_MS, requestIp });
        const url = buildResetUrl(typeof baseUrl === 'function' ? baseUrl() : baseUrl, token);
        const content = resetEmailContent({ name: user.name, url });
        await mailer.send({ to: user.email, ...content });
        return { sent: true };
    }

    app.post('/auth/forgot-password', (req, res) => {
        noStore(res);
        if (!isReady()) return res.status(503).json({ error: 'Password reset is not available right now. Please try again later.' });
        const email = normalizeEmail(req.body?.email);
        if (!looksLikeEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
        if (!ipForgot.hit(ipOf(req))) {
            return res.status(429).json({ error: 'Too many reset requests. Please wait a few minutes and try again.' });
        }
        // Same answer (and timing) whether or not the account exists; per-email limit is silent.
        res.json({ ok: true, message: NEUTRAL_FORGOT_MESSAGE });
        if (!emailForgot.hit(email)) return;
        const job = issueResetEmail(email, ipOf(req))
            .catch((err) => logger.error('[password-reset] could not send reset email:', err?.message || err))
            .finally(() => pending.delete(job));
        pending.add(job);
    });

    app.post('/auth/reset-password/check', async (req, res) => {
        noStore(res);
        if (!isReady()) return res.status(503).json({ error: 'Password reset is not available right now.' });
        if (!ipCheck.hit(ipOf(req))) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });
        const token = req.body?.token;
        if (!isWellFormedResetToken(token)) return res.json({ valid: false });
        try {
            res.json({ valid: await store.isTokenValid(hashResetToken(token)) });
        } catch (err) {
            logger.error('[password-reset] check failed:', err?.message || err);
            res.status(500).json({ error: 'Could not check the link. Please try again.' });
        }
    });

    app.post('/auth/reset-password', async (req, res) => {
        noStore(res);
        if (!isReady()) return res.status(503).json({ error: 'Password reset is not available right now.' });
        if (!ipReset.hit(ipOf(req))) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
        const { token, password, confirm } = req.body || {};
        if (!isWellFormedResetToken(token)) return res.status(400).json({ error: INVALID_LINK_MESSAGE, code: 'invalid_token' });
        // Validate before burning the token so a typo doesn't cost the user their link.
        const problem = validateNewPassword(password, confirm, minPasswordLength);
        if (problem) return res.status(400).json({ error: problem, code: 'invalid_password' });
        try {
            const passwordHash = await hashPassword(String(password));
            const tokenHash = hashResetToken(token);
            const userId = await store.consumeToken(tokenHash);
            if (userId == null) return res.status(400).json({ error: INVALID_LINK_MESSAGE, code: 'invalid_token' });
            const email = await store.setPassword(userId, passwordHash);
            await store.invalidateUserTokens(userId);
            await store.deleteUserSessions(userId);
            res.json({ ok: true, email: email || null, message: 'Your password has been changed. You can sign in now.' });
        } catch (err) {
            logger.error('[password-reset] reset failed:', err?.message || err);
            res.status(500).json({ error: 'Could not change the password. Please try again.' });
        }
    });

    return {
        /** Resolves when queued reset emails have been handled (tests). */
        idle: () => Promise.all([...pending]),
        resetLimits() { ipForgot.reset(); emailForgot.reset(); ipReset.reset(); ipCheck.reset(); },
    };
}

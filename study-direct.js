/**
 * Direct browser access for the LingoSpark mobile web app (https://lingospark.apps.grok.bot).
 *
 *  1. Strict CORS for the study routes the app calls. Only exact origins on the allow list get CORS headers.
 *     Bearer auth, so NO Access-Control-Allow-Credentials (cookies are never needed cross-origin).
 *  2. "Bearer session" auth: the token is the express-session cookie value ("s:<sid>.<sig>", signed with
 *     SESSION_SECRET). A request with `Authorization: Bearer <token>` is mapped onto the normal session, so
 *     passport/req.user, rate limits and every existing handler work unchanged. Logout destroys the session,
 *     which revokes the token. Tokens expire with the session (30 days).
 *  3. Token issuing: /auth/login and /auth/register include `token` in the JSON only when the request comes
 *     from an allowed app origin (so the site's own pages never see their session id in JS).
 */

import crypto from 'node:crypto';
import cookieSignature from 'cookie-signature';

export const DEFAULT_APP_ORIGINS = ['https://lingospark.apps.grok.bot'];
export const SESSION_COOKIE_NAME = 'connect.sid';

/** Routes the app may call directly. Exact paths or prefixes ending in "/*". */
export const APP_DIRECT_ROUTES = [
    '/api/study/track-generate',
    '/api/study/track-prewarm',
    '/auth/login',
    '/auth/register',
    '/auth/logout',
    '/auth/app-token',
    '/api/auth/me',
    '/api/word-sets',
    '/api/word-sets/*',
];

export function isAppDirectPath(path) {
    const p = String(path || '').split('?')[0];
    return APP_DIRECT_ROUTES.some((r) => (r.endsWith('/*') ? p.startsWith(r.slice(0, -1)) : p === r));
}

/** Normalise "https://host[:port]" origins; drop anything that is not a plain origin ("*", "null", paths, other schemes). */
export function parseAllowedOrigins(env = process.env) {
    const out = new Set(DEFAULT_APP_ORIGINS);
    for (const raw of String(env.STUDY_CORS_ORIGINS || '').split(',')) {
        const s = raw.trim();
        if (!s) continue;
        try {
            const u = new URL(s);
            const localDev = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
            if (u.protocol !== 'https:' && !localDev) continue;
            if (u.origin !== s.replace(/\/$/, '')) continue; // path/query/userinfo not allowed
            out.add(u.origin);
        } catch { /* ignore garbage */ }
    }
    return [...out];
}

export function createAppOriginCheck(getOrigins = () => parseAllowedOrigins()) {
    return (origin) => typeof origin === 'string' && origin !== '' && getOrigins().includes(origin);
}

/**
 * CORS middleware, mount BEFORE any other cors() and before the body parsers/session.
 * Routes outside APP_DIRECT_ROUTES are untouched (next()).
 */
export function createStudyCors({ getOrigins = () => parseAllowedOrigins() } = {}) {
    const allowed = createAppOriginCheck(getOrigins);
    return function studyCors(req, res, next) {
        if (!isAppDirectPath(req.path)) return next();
        res.append('Vary', 'Origin');
        const origin = req.headers.origin;
        const ok = allowed(origin);
        if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
            if (!ok) return res.status(403).end(); // no CORS headers -> the browser blocks the real request
            res.append('Vary', 'Access-Control-Request-Headers');
            res.set({
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '600',
                'Access-Control-Expose-Headers': 'Retry-After',
            });
            return res.status(204).end();
        }
        if (ok) {
            res.set({
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Expose-Headers': 'Retry-After',
            });
        }
        return next();
    };
}

/** True for `app.use(cors(...))` fallbacks: skip the legacy permissive CORS on the strict routes. */
export function skipOnAppRoutes(mw) {
    return (req, res, next) => (isAppDirectPath(req.path) ? next() : mw(req, res, next));
}

// ---------------------------------------------------------------- bearer session token

export function signSessionToken(sessionId, secret) {
    return `s:${cookieSignature.sign(String(sessionId), String(secret))}`;
}

/** Valid token shape check only (the real signature check is done by express-session). */
export function looksLikeSessionToken(token) {
    return typeof token === 'string' && token.length >= 20 && token.length <= 512 && /^s:[A-Za-z0-9_-]+\.[A-Za-z0-9+/=_-]+$/.test(token);
}

/**
 * Mount BEFORE express-session. `Authorization: Bearer <token>` replaces the Cookie header with the session cookie
 * built from the token, so ambient browser cookies can never be mixed in. A malformed token becomes an invalid
 * cookie (no session -> 401 from the handlers); it never falls back to a cookie.
 */
export function createBearerSession({ cookieName = SESSION_COOKIE_NAME } = {}) {
    return function bearerSession(req, _res, next) {
        const h = req.headers.authorization;
        if (typeof h === 'string' && isAppDirectPath(req.path)) {
            const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
            if (m) {
                req.bearerAuth = true;
                req.headers.cookie = looksLikeSessionToken(m[1]) ? `${cookieName}=${encodeURIComponent(m[1])}` : `${cookieName}=invalid`;
            }
        }
        next();
    };
}

/** Token for the current (just logged-in) session, or null unless the caller is an allowed app origin. */
export function tokenForAppOrigin(req, { secret, getOrigins = () => parseAllowedOrigins() }) {
    if (!createAppOriginCheck(getOrigins)(req.headers.origin)) return null;
    if (!req.sessionID || !secret) return null;
    return signSessionToken(req.sessionID, secret);
}

// ---------------------------------------------------------------- one-time code (PKCE) for the Google handoff

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha256b64u = (s) => crypto.createHash('sha256').update(String(s)).digest('base64url');

function codeKey(secret) {
    return crypto.createHmac('sha256', String(secret)).update('lingospark-app-code-v1').digest(); // 32 bytes
}

/** Encrypted, authenticated, short-lived code carrying the session token. Useless without the PKCE verifier. */
export function sealAppCode({ token, challenge, now = Date.now(), ttlMs = 60_000, secret }) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', codeKey(secret), iv);
    const body = Buffer.concat([c.update(JSON.stringify({ t: token, ch: challenge, exp: now + ttlMs, jti: crypto.randomUUID() }), 'utf8'), c.final()]);
    return `${b64u(iv)}.${b64u(body)}.${b64u(c.getAuthTag())}`;
}

export function createCodeRedeemer({ secret, now = () => Date.now(), used = new Map() } = {}) {
    return function redeem(code, verifier) {
        if (typeof code !== 'string' || typeof verifier !== 'string' || code.length > 2000) return { ok: false, error: 'bad_request' };
        if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return { ok: false, error: 'bad_verifier' };
        const parts = code.split('.');
        if (parts.length !== 3) return { ok: false, error: 'bad_code' };
        let p;
        try {
            const d = crypto.createDecipheriv('aes-256-gcm', codeKey(secret()), Buffer.from(parts[0], 'base64url'));
            d.setAuthTag(Buffer.from(parts[2], 'base64url'));
            p = JSON.parse(Buffer.concat([d.update(Buffer.from(parts[1], 'base64url')), d.final()]).toString('utf8'));
        } catch { return { ok: false, error: 'bad_code' }; }
        const t = now();
        for (const [k, exp] of used) if (exp < t) used.delete(k);
        if (!p || p.exp < t) return { ok: false, error: 'expired' };
        if (used.has(p.jti)) return { ok: false, error: 'used' };
        const a = Buffer.from(sha256b64u(verifier)), b = Buffer.from(String(p.ch));
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: 'bad_verifier' };
        used.set(p.jti, p.exp + 60_000);
        return { ok: true, token: p.t };
    };
}

export const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/; // base64url(sha256)

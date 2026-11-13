/**
 * Google → app handoff for lingospark.study (Express, ESM).
 *
 * Two modes, both start at  GET /auth/app-bridge?redirect=<app-done-url>&state=<app-state>
 * (logged-out users are sent through /auth/google and come back here):
 *
 *  A. PKCE token mode (direct Bearer flow, NO STUDY_BRIDGE_SECRET needed): add `code_challenge=<base64url(sha256(verifier))>`.
 *     The site redirects (GET, default) or form-POSTs (`delivery=post`) `code` (+ `state`) to the app done URL. The code is a
 *     60s, single-use, AES-GCM sealed blob that is useless without the verifier. The app's browser then calls
 *       POST https://www.lingospark.study/auth/app-token  {code, code_verifier}  ->  {token, user}
 *     and uses `Authorization: Bearer <token>` on the Track/study routes (see study-direct.js).
 *  B. Legacy handoff mode (needs STUDY_BRIDGE_SECRET): signed `handoff` carrying the session cookie, delivered by HTML form
 *     POST by default (never in the URL) or by GET with `delivery=redirect`. The app must redeem it once (jti), POST only.
 *
 * Redirect allow list is EXACT (no wildcard subdomains): app origins (default https://lingospark.apps.grok.bot plus
 * STUDY_CORS_ORIGINS), path /api/study/google/done or /study/google/done; http://localhost for development.
 *
 * www vs apex: the Google OAuth callbackURL must be on the host that set connect.sid before the Google redirect
 * (https://www.lingospark.study/auth/google/callback), otherwise returnTo is lost and the user lands on the homepage.
 */

import crypto from 'crypto';
import {
    parseAllowedOrigins, signSessionToken, sealAppCode, createCodeRedeemer, PKCE_CHALLENGE_RE,
} from '../../study-direct.js';

const DONE_PATH_RE = /^\/(?:api\/)?study\/google\/done$/;
const LOCAL_RE = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

function b64url(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function escapeHtmlAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function signHandoff(cookieHeader, secret, state) {
    const iat = Date.now();
    const body = b64url(
        JSON.stringify({
            c: cookieHeader,
            iat,
            exp: iat + 60 * 1000,
            jti: crypto.randomUUID(),
            state: String(state || ''),
        }),
    );
    const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
    return `${body}.${sig}`;
}

function isAllowed(redirect, origins) {
    try {
        const u = new URL(redirect);
        if (u.username || u.password || u.hash || u.search) return false;
        if (!DONE_PATH_RE.test(u.pathname)) return false;
        return origins.includes(u.origin) || LOCAL_RE.test(u.origin);
    } catch {
        return false;
    }
}

function isLoggedIn(req) {
    if (typeof req.isAuthenticated === 'function') return req.isAuthenticated();
    return Boolean(req.user);
}

function noStore(res) {
    res.set('Cache-Control', 'private, no-store');
    res.set('Referrer-Policy', 'no-referrer');
}

function autoPostPage(action, fields) {
    const inputs = Object.entries(fields)
        .map(([k, v]) => `<input type="hidden" name="${escapeHtmlAttr(k)}" value="${escapeHtmlAttr(v)}" />`)
        .join('\n  ');
    return `<!doctype html>
<html><head><meta charset="utf-8"/><title>LingoSpark</title>
<meta name="referrer" content="no-referrer"/>
</head><body>
<p>Signing you in…</p>
<form id="f" method="POST" action="${escapeHtmlAttr(action)}">
  ${inputs}
</form>
<script>document.getElementById("f").submit();</script>
</body></html>`;
}

/**
 * @param app            express app (after session + passport)
 * @param opts.sessionSecret  () => SESSION_SECRET used to sign session ids (needed for mode A)
 * @param opts.getOrigins     () => allowed app origins
 */
export function mountAppBridge(app, {
    sessionSecret = () => process.env.SESSION_SECRET || 'lingospark-dev-secret-change-me',
    getOrigins = () => parseAllowedOrigins(),
    now = () => Date.now(),
} = {}) {
    const redeem = createCodeRedeemer({ secret: sessionSecret, now });

    app.get('/auth/app-bridge', (req, res) => {
        const redirect = String(req.query.redirect || '');
        const state = String(req.query.state || '');
        const challenge = String(req.query.code_challenge || '');
        const pkce = challenge !== '';
        const delivery = String(req.query.delivery || (pkce ? 'redirect' : 'post')).toLowerCase() === 'redirect' ? 'redirect' : 'post';

        const secret = (process.env.STUDY_BRIDGE_SECRET || '').trim();
        if (!pkce && secret.length < 16) {
            res.status(503).type('text').send('STUDY_BRIDGE_SECRET is not configured on lingospark.study');
            return;
        }
        if (!redirect || !isAllowed(redirect, getOrigins())) {
            res.status(400).type('text').send('Disallowed redirect');
            return;
        }
        if (pkce && !PKCE_CHALLENGE_RE.test(challenge)) {
            res.status(400).type('text').send('Bad code_challenge');
            return;
        }

        if (!isLoggedIn(req)) {
            const q = { redirect, state, delivery };
            if (pkce) q.code_challenge = challenge;
            res.redirect(`/auth/google?returnTo=${encodeURIComponent(`/auth/app-bridge?${new URLSearchParams(q).toString()}`)}`);
            return;
        }

        noStore(res);
        let fields;
        if (pkce) {
            if (!req.sessionID) {
                res.status(401).type('text').send('No session');
                return;
            }
            const code = sealAppCode({ token: signSessionToken(req.sessionID, sessionSecret()), challenge, secret: sessionSecret(), now: now() });
            fields = { code, state };
        } else {
            const cookieHeader = req.headers.cookie || '';
            if (!cookieHeader) {
                res.status(401).type('text').send('No session cookie');
                return;
            }
            fields = { handoff: signHandoff(cookieHeader, secret, state), state };
        }

        if (delivery === 'redirect') {
            const target = new URL(redirect);
            for (const [k, v] of Object.entries(fields)) if (v) target.searchParams.set(k, v);
            res.redirect(target.toString());
            return;
        }
        res.status(200).type('html').send(autoPostPage(redirect, fields));
    });

    // Code → Bearer token. Called by the app's browser (CORS for the app origin is added by createStudyCors).
    app.post('/auth/app-token', (req, res) => {
        noStore(res);
        const r = redeem(req.body?.code, req.body?.code_verifier);
        if (!r.ok) return res.status(400).json({ error: 'Invalid or expired code.', code: r.error });
        res.json({ token: r.token, tokenType: 'Bearer', expiresInSec: 30 * 24 * 3600 });
    });
}

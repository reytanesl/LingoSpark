/**
 * Drop-in Google → app handoff for lingospark.study (Express).
 *
 * Install on the study server:
 *   1. Copy this file into the study project (or paste the route below).
 *   2. Set env STUDY_BRIDGE_SECRET to a long random string (16+ chars).
 *      Use the SAME value as the Cursor app secret STUDY_BRIDGE_SECRET.
 *   3. Mount once after passport/session middleware:
 *        import { mountAppBridge } from './services/study-bridge/auth-app-bridge.js';
 *        mountAppBridge(app);
 *
 * Flow:
 *   App → /auth/google?returnTo=/auth/app-bridge?redirect=<app-done-url>
 *   → Google → study session cookie → /auth/app-bridge
 *   → signed ?handoff= redirect back to the app.
 */

import crypto from 'crypto';

const ALLOWED_REDIRECT = [
    /^https:\/\/lingospark\.apps\.grok\.bot\/api\/study\/google\/done$/i,
    /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/api\/study\/google\/done$/i,
];

function b64url(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
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

function isAllowed(redirect) {
    try {
        const u = new URL(redirect);
        if (u.username || u.password || u.hash || u.search) return false;
        return ALLOWED_REDIRECT.some((re) => re.test(u.origin + u.pathname));
    } catch {
        return false;
    }
}

function isLoggedIn(req) {
    if (typeof req.isAuthenticated === 'function') return req.isAuthenticated();
    return Boolean(req.user);
}

export function mountAppBridge(app) {
    app.get('/auth/app-bridge', (req, res) => {
        const secret = (process.env.STUDY_BRIDGE_SECRET || '').trim();
        if (secret.length < 16) {
            res
                .status(503)
                .type('text')
                .send('STUDY_BRIDGE_SECRET is not configured on lingospark.study');
            return;
        }

        const redirect = String(req.query.redirect || '');
        const state = String(req.query.state || '');
        if (!redirect || !isAllowed(redirect)) {
            res.status(400).type('text').send('Disallowed redirect');
            return;
        }

        if (!isLoggedIn(req)) {
            const returnTo = `/auth/app-bridge?${new URLSearchParams({
                redirect,
                state,
            }).toString()}`;
            res.redirect(
                `/auth/google?returnTo=${encodeURIComponent(returnTo)}`,
            );
            return;
        }

        const cookieHeader = req.headers.cookie || '';
        if (!cookieHeader) {
            res.status(401).type('text').send('No session cookie');
            return;
        }

        const handoff = signHandoff(cookieHeader, secret, state);
        const target = new URL(redirect);
        target.searchParams.set('handoff', handoff);
        if (state) target.searchParams.set('state', state);
        res.redirect(target.toString());
    });
}

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import {
    upsertGoogleUser,
    getUserById,
    getUserByEmail,
    createLocalUser,
    hasWritingAccess,
    isAdminEmail,
    expireUserIfNeeded,
    applyPendingBmcPayments,
} from './db.js';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

export function configurePassport() {
    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await getUserById(id);
            done(null, user || false);
        } catch (err) {
            done(err);
        }
    });

    passport.use(
        new LocalStrategy(
            { usernameField: 'email', passwordField: 'password' },
            async (email, password, done) => {
                try {
                    const user = await getUserByEmail(email);
                    if (!user || !user.password_hash) {
                        return done(null, false, { message: 'Invalid email or password.' });
                    }
                    const ok = await bcrypt.compare(password, user.password_hash);
                    if (!ok) {
                        return done(null, false, { message: 'Invalid email or password.' });
                    }
                    const withPending = await applyPendingBmcPayments(user);
                    return done(null, withPending);
                } catch (err) {
                    return done(err);
                }
            }
        )
    );

    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL = process.env.GOOGLE_CALLBACK_URL;
    const googleReady = Boolean(clientID && clientSecret && callbackURL);

    if (googleReady) {
        passport.use(
            new GoogleStrategy(
                { clientID, clientSecret, callbackURL },
                async (_accessToken, _refreshToken, profile, done) => {
                    try {
                        const user = await upsertGoogleUser(profile);
                        done(null, user);
                    } catch (err) {
                        done(err);
                    }
                }
            )
        );
    } else {
        console.warn('Google OAuth env vars missing — Google login disabled (email/password still works).');
    }

    return { googleReady };
}

export async function registerLocalAccount({ email, password, name }) {
    const normalized = (email || '').toLowerCase().trim();
    if (!normalized || !normalized.includes('@')) {
        const err = new Error('Please enter a valid email address.');
        err.status = 400;
        throw err;
    }
    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
        const err = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        err.status = 400;
        throw err;
    }

    const existing = await getUserByEmail(normalized);
    if (existing) {
        if (existing.password_hash) {
            const err = new Error('An account with this email already exists. Please sign in.');
            err.status = 409;
            throw err;
        }
        // Google-only account — tell them to use Google or we could allow setting password later
        const err = new Error(
            'This email is already registered with Google. Sign in with Google, or use a different email.'
        );
        err.status = 409;
        throw err;
    }

    const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
    return createLocalUser({
        email: normalized,
        passwordHash,
        name: (name || '').trim() || normalized.split('@')[0],
    });
}

export function requireLogin(req, res, next) {
    if (req.isAuthenticated?.() && req.user) return next();
    return res.status(401).json({ error: 'Sign in required.' });
}

export function requireAdmin(req, res, next) {
    if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ error: 'Sign in required.' });
    }
    if (!isAdminEmail(req.user.email)) {
        return res.status(403).json({ error: 'Admin only.' });
    }
    return next();
}

export async function requireWritingAccess(req, res, next) {
    if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ error: 'Sign in required.' });
    }
    try {
        const fresh = await expireUserIfNeeded(req.user);
        req.user = fresh || req.user;
        req.user = (await applyPendingBmcPayments(req.user)) || req.user;
    } catch {
        /* ignore expiry cleanup failures */
    }
    if (!hasWritingAccess(req.user)) {
        return res.status(403).json({ error: 'Writing Suite access required. Buy a plan or get teacher approval.' });
    }
    return next();
}

export { hasWritingAccess, isAdminEmail, MIN_PASSWORD_LENGTH };

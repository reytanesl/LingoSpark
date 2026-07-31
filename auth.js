import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { upsertGoogleUser, getUserById, hasWritingAccess, isAdminEmail, expireUserIfNeeded } from './db.js';

export function configurePassport() {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL = process.env.GOOGLE_CALLBACK_URL;

    if (!clientID || !clientSecret || !callbackURL) {
        console.warn('Google OAuth env vars missing — login disabled until configured.');
        return false;
    }

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

    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await getUserById(id);
            done(null, user || false);
        } catch (err) {
            done(err);
        }
    });

    return true;
}

export function requireLogin(req, res, next) {
    if (req.isAuthenticated?.() && req.user) return next();
    return res.status(401).json({ error: 'Sign in with Google required.' });
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
        return res.status(401).json({ error: 'Sign in with Google required.' });
    }
    try {
        const fresh = await expireUserIfNeeded(req.user);
        req.user = fresh || req.user;
    } catch {
        /* ignore expiry cleanup failures */
    }
    if (!hasWritingAccess(req.user)) {
        return res.status(403).json({ error: 'Writing Suite access required. Use Buy Access or get admin approval.' });
    }
    return next();
}

export { hasWritingAccess, isAdminEmail };

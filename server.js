import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import passport from 'passport';
import connectPgSimple from 'connect-pg-simple';
import { Agent } from '@cursor/sdk';
import {
    initDb,
    getPool,
    listUsers,
    approveUser,
    revokeUser,
    publicUser,
    hasWritingAccess,
    isAdminEmail,
    getAccessStatus,
    recordSiteVisit,
    recordUserVisit,
    getSiteVisitCount,
    expireStaleAccess,
    expireUserIfNeeded,
    applyPendingBmcPayments,
} from './db.js';
import { configurePassport, registerLocalAccount, requireAdmin, requireWritingAccess } from './auth.js';
import { verifyBmcSignature, handleBmcWebhook } from './billing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const APP_BASE_URL = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));

// BMC webhook needs raw body for signature verification
app.post(
    '/api/billing/bmc-webhook',
    express.raw({ type: '*/*' }),
    async (req, res) => {
        try {
            const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''));
            const signature = req.headers['x-signature-sha256'];
            const secret = process.env.BMC_WEBHOOK_SECRET;

            if (secret && !verifyBmcSignature(rawBody, signature, secret)) {
                return res.status(401).json({ error: 'Invalid signature' });
            }

            const payload = JSON.parse(rawBody.toString('utf8') || '{}');
            const eventType = payload.type || payload.event_name || payload.event || '';
            const result = await handleBmcWebhook(eventType, payload);
            console.log('BMC webhook:', result);
            res.json({ received: true, ...result });
        } catch (err) {
            console.error('BMC webhook error:', err);
            res.status(500).json({ error: err.message || 'Webhook failed' });
        }
    }
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

async function start() {
    let dbReady = false;
    try {
        await initDb();
        dbReady = true;
        console.log('Database ready');
    } catch (err) {
        console.error('Database init failed:', err.message);
        console.warn('Auth/billing features require a working DATABASE_URL.');
    }

    const PgSession = connectPgSimple(session);
    const sessionConfig = {
        secret: process.env.SESSION_SECRET || 'lingospark-dev-secret-change-me',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 30 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
        },
    };

    if (dbReady) {
        sessionConfig.store = new PgSession({
            pool: getPool(),
            tableName: 'session',
            createTableIfMissing: true,
        });
    }

    app.use(session(sessionConfig));

    const { googleReady } = configurePassport();
    app.use(passport.initialize());
    app.use(passport.session());

    if (googleReady) {
        app.get('/auth/google', (req, res, next) => {
            const returnTo = req.query.returnTo || '/';
            req.session.returnTo = returnTo;
            passport.authenticate('google', {
                scope: ['profile', 'email'],
                prompt: 'select_account',
            })(req, res, next);
        });

        app.get(
            '/auth/google/callback',
            passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
            (req, res) => {
                const returnTo = req.session.returnTo || '/';
                delete req.session.returnTo;
                res.redirect(returnTo);
            }
        );
    }

    app.post('/auth/register', async (req, res, next) => {
        try {
            if (!dbReady) {
                return res.status(503).json({ error: 'Database not available.' });
            }
            const user = await registerLocalAccount({
                email: req.body?.email,
                password: req.body?.password,
                name: req.body?.name,
            });
            req.login(user, (err) => {
                if (err) return next(err);
                res.json({
                    ok: true,
                    user: publicUser(user),
                    hasAccess: hasWritingAccess(user),
                    status: getAccessStatus(user),
                });
            });
        } catch (err) {
            const status = err.status || 500;
            if (status === 500) console.error('Register error:', err);
            res.status(status).json({ error: err.message || 'Registration failed' });
        }
    });

    app.post('/auth/login', (req, res, next) => {
        if (!dbReady) {
            return res.status(503).json({ error: 'Database not available.' });
        }
        passport.authenticate('local', (err, user, info) => {
            if (err) return next(err);
            if (!user) {
                return res.status(401).json({ error: info?.message || 'Invalid email or password.' });
            }
            req.login(user, (loginErr) => {
                if (loginErr) return next(loginErr);
                res.json({
                    ok: true,
                    user: publicUser(user),
                    hasAccess: hasWritingAccess(user),
                    status: getAccessStatus(user),
                });
            });
        })(req, res, next);
    });

    app.post('/auth/logout', (req, res, next) => {
        req.logout((err) => {
            if (err) return next(err);
            req.session.destroy(() => {
                res.clearCookie('connect.sid');
                res.json({ ok: true });
            });
        });
    });

    app.get('/api/auth/me', async (req, res) => {
        let user = req.user || null;
        if (user) {
            try {
                user = (await expireUserIfNeeded(user)) || user;
                user = (await applyPendingBmcPayments(user)) || user;
                req.user = user;
            } catch {
                /* ignore */
            }
        }
        res.json({
            user: publicUser(user),
            isAdmin: user ? isAdminEmail(user.email) : false,
            hasAccess: hasWritingAccess(user),
            status: getAccessStatus(user),
            googleConfigured: googleReady,
            localAuthEnabled: dbReady,
            bmcPaymentUrl: process.env.BMC_PAYMENT_URL || 'https://buymeacoffee.com/lingospark/extras',
            dbReady,
        });
    });

    // Count a visit once per browser session (site total + signed-in user).
    app.post('/api/visit', async (req, res) => {
        try {
            if (!dbReady) return res.json({ ok: true, counted: false });
            let siteVisits = 0;
            try {
                siteVisits = await getSiteVisitCount();
            } catch {
                siteVisits = 0;
            }
            if (!req.session.visitCounted) {
                req.session.visitCounted = true;
                try {
                    siteVisits = await recordSiteVisit();
                } catch (err) {
                    console.warn('recordSiteVisit failed:', err.message);
                }
            }
            if (req.user?.id && !req.session.userVisitCounted) {
                req.session.userVisitCounted = true;
                try {
                    await recordUserVisit(req.user.id);
                } catch (err) {
                    console.warn('recordUserVisit failed:', err.message);
                }
            }
            res.json({ ok: true, counted: true, siteVisits });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/billing/bmc-url', (_req, res) => {
        const url = process.env.BMC_PAYMENT_URL || 'https://buymeacoffee.com/lingospark/extras';
        res.json({ url });
    });

    app.get('/api/admin/users', requireAdmin, async (_req, res) => {
        try {
            try {
                await expireStaleAccess();
            } catch (err) {
                console.warn('expireStaleAccess failed:', err.message);
            }
            const users = await listUsers();
            const mapped = users.map((u) => {
                const status = getAccessStatus(u);
                return {
                    ...publicUser(u),
                    hasAccess: hasWritingAccess(u),
                    status,
                    createdAt: u.created_at,
                };
            });
            const counts = {
                all: mapped.length,
                active: mapped.filter((u) => u.status === 'active').length,
                inactive: mapped.filter((u) => u.status === 'inactive').length,
                expired: mapped.filter((u) => u.status === 'expired').length,
                loggedInVisits: mapped.reduce((sum, u) => sum + Number(u.visitCount || 0), 0),
            };
            let siteVisits = 0;
            try {
                siteVisits = await getSiteVisitCount();
            } catch (err) {
                console.warn('getSiteVisitCount failed:', err.message);
            }
            res.json({
                users: mapped,
                counts,
                siteVisits,
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/admin/users/:id/approve', requireAdmin, async (req, res) => {
        try {
            const user = await approveUser(Number(req.params.id));
            if (!user) return res.status(404).json({ error: 'User not found' });
            res.json({ user: publicUser(user), hasAccess: hasWritingAccess(user) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/admin/users/:id/revoke', requireAdmin, async (req, res) => {
        try {
            const user = await revokeUser(Number(req.params.id));
            if (!user) return res.status(404).json({ error: 'User not found' });
            res.json({ user: publicUser(user), hasAccess: hasWritingAccess(user) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    function extractJson(text) {
        if (!text) throw new Error('Empty response from Cursor AI');
        const trimmed = text.trim();
        const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = fenced ? fenced[1].trim() : trimmed;
        return JSON.parse(candidate);
    }

    app.post('/api/generate', requireWritingAccess, async (req, res) => {
        const prompt = req.body?.prompt;
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'Missing prompt' });
        }

        const apiKey = process.env.CURSOR_API_KEY;
        if (!apiKey) {
            return res.status(503).json({ error: 'Server not configured: CURSOR_API_KEY is missing.' });
        }

        const fullPrompt = `${prompt}\n\nReturn ONLY valid JSON. No markdown fences, no explanation, no tool use.`;

        try {
            const result = await Agent.prompt(fullPrompt, {
                apiKey,
                model: { id: 'composer-2.5' },
                local: { cwd: __dirname },
            });

            if (result.status !== 'finished' || !result.result) {
                const message = result.error?.message || 'Cursor AI generation failed';
                return res.status(500).json({ error: message });
            }

            const parsed = extractJson(result.result);
            res.json(parsed);
        } catch (error) {
            console.error('Generation error:', error);
            res.status(500).json({ error: error.message || 'Failed to generate content' });
        }
    });

    app.get('/api/health', (_req, res) => {
        res.json({
            ok: true,
            cursorConfigured: Boolean(process.env.CURSOR_API_KEY),
            googleConfigured: googleReady,
            localAuthEnabled: dbReady,
            dbReady,
            bmcConfigured: Boolean(process.env.BMC_PAYMENT_URL),
        });
    });

    app.use(express.static(__dirname));

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`LingoSpark running on ${APP_BASE_URL} (port ${PORT})`);
        if (!process.env.CURSOR_API_KEY) {
            console.warn('Warning: CURSOR_API_KEY is not set.');
        }
        if (!googleReady) {
            console.warn('Warning: Google OAuth not configured (email/password login still available).');
        }
        if (!process.env.BMC_PAYMENT_URL) {
            console.warn('Warning: BMC_PAYMENT_URL is not set.');
        }
    });
}

start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

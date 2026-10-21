import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import passport from 'passport';
import connectPgSimple from 'connect-pg-simple';
import { Server as SocketIOServer } from 'socket.io';
import { Agent } from '@cursor/sdk';
import {
    initDb,
    getPool,
    listUsers,
    approveUser,
    revokeUser,
    deleteUser,
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
    startAnalyticsVisit,
    normalizeAnalyticsPageKey,
    updateAnalyticsDwell,
    endAnalyticsVisit,
    getGamePopularityStats,
    createWordSet,
    listWordSets,
    getWordSet,
    updateWordSet,
    deleteWordSet,
    appendWordSetItems,
    appendItemsToWordSet,
    loadWordSetForGame,
    enableWordSetShare,
    revokeWordSetShare,
    getSharedWordSetByToken,
    recordGameSession,
    updateWordProgress,
    getProgressSummary,
    saveMaturaEssayReview,
    listMaturaEssayReviews,
    getMaturaEssayReview,
    deleteMaturaEssayReview,
    getMaturaProgressSummary,
    getUserById,
    getMaturaAssessAvailability,
    updateMaturaEssayReview,
    recordMaturaAssessRun,
    getMaturaAssessRun,
    claimMaturaFreeRecheck,
    releaseMaturaFreeRecheck,
    planMaturaRecheck,
    recordMaturaAssessUsage,
    getWorksheetMakerAvailability,
    consumeWorksheetMakerCredit,
    getOwnTimeProfile,
    upsertOwnTimeProfile,
    listOwnTimeLessons,
    saveOwnTimeLesson,
    getOwnTimeToday,
    reserveOwnTimeExtra,
    releaseOwnTimeExtra,
} from './db.js';
import { configurePassport, registerLocalAccount, requireAdmin, requireWritingAccess, requireLogin, hashPassword, MIN_PASSWORD_LENGTH } from './auth.js';
import { createMailer } from './mailer.js';
import { registerPasswordResetRoutes, createPgResetStore } from './password-reset.js';
import { verifyBmcSignature, handleBmcWebhook, publicAccessPlans, publicMaturaAssessPack, publicWorksheetMakerPack, checkoutUrls } from './billing.js';
import {
    buildDeckFromRequest,
    createRoom,
    getRoom,
    initLiveGame,
    joinRoom,
    registerLiveLookupRoute,
    broadcastLobbyUpdate,
    publicRoomSnapshot,
    destroyRoom,
} from './live-game.js';
import { reportToCsv, reportToPdf, reportFileBase } from './game-report.js';
import { loadBuiltinDeck } from './vocab-quiz-utils.js';
import { validateOdysseyRequest, buildOdysseyPrompt, targetWordsFound } from './odyssey-prompts.js';
import { validateOwnTimeGenerateRequest, buildOwnTimeLessonPrompt, normalizeOwnTimeLesson, OWN_TIME_EXTRA_DAILY_LIMIT } from './own-time-prompts.js';
import { OWN_TIME_MOCK_REPLY, OWN_TIME_MOCK_EXTRA_REPLY, OWN_TIME_MOCK_LOW_REPLY, OWN_TIME_MOCK_B1_REPLY, OWN_TIME_MOCK_B2_REPLY, OWN_TIME_MOCK_C1_REPLY } from './own-time-fixtures.js';
import { createFrankGenerateHandler } from './frank-ai.js';
import { createWordSetImportHandlers, mountWordSetImportRoutes } from './wordset-import-ai.js';
import { staticAllowlist } from './static-allowlist.js';
import { createWorksheetMakerRouter } from './worksheet-maker/server.js';
import './matura-mistakes.js';
const { sanitizeMistakes: sanitizeMaturaMistakes, PROMPT_TYPES: MATURA_MISTAKE_TYPES } = globalThis.MaturaMistakes;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

/** Empty cwd so JSON/vision jobs don't pull the app repo into agent context (tokens + latency). */
const AI_CWD = path.join(os.tmpdir(), 'lingospark-ai-empty');
try {
    fs.mkdirSync(AI_CWD, { recursive: true });
} catch (err) {
    console.warn('Could not create AI workspace dir:', err.message);
}

const AI_MODEL = { id: 'composer-2.5' };

function aiAgentOptions(apiKey) {
    return {
        apiKey,
        model: AI_MODEL,
        local: {
            cwd: AI_CWD,
            // Inline config only — do not load project/user rules from the host.
            settingSources: [],
        },
    };
}

function logAiUsage(label, result) {
    const u = result?.usage;
    if (!u) return;
    console.log(
        `[ai] ${label}: in=${u.inputTokens ?? 0} out=${u.outputTokens ?? 0} total=${u.totalTokens ?? 0}` +
            (u.cacheReadTokens ? ` cacheRead=${u.cacheReadTokens}` : ''),
    );
}

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

app.use(express.json({ limit: '25mb' }));
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

    const mailer = createMailer();
    console.log(mailer.configured
        ? `Email: sending via ${mailer.provider} as ${mailer.from}`
        : 'Email: no provider configured (RESEND_API_KEY or SMTP_HOST) — password reset links are only logged in development.');
    registerPasswordResetRoutes(app, {
        // isReady() answers 503 before the store is touched when the database is down.
        store: createPgResetStore(dbReady ? getPool() : { query: async () => { throw new Error('Database not available'); } }),
        mailer,
        baseUrl: APP_BASE_URL,
        hashPassword,
        minPasswordLength: MIN_PASSWORD_LENGTH,
        isReady: () => dbReady,
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
                // Refresh matura cooldown timestamp from DB (session user can be stale).
                try {
                    const fresh = await getUserById(user.id);
                    if (fresh) user = fresh;
                } catch {
                    /* ignore */
                }
                req.user = user;
            } catch {
                /* ignore */
            }
        }
        const admin = user ? isAdminEmail(user.email) : false;
        res.json({
            user: publicUser(user),
            isAdmin: admin,
            hasAccess: hasWritingAccess(user),
            status: getAccessStatus(user),
            maturaAssess: getMaturaAssessAvailability(user, { isAdmin: admin }),
            maturaAssessPack: publicMaturaAssessPack(),
            worksheetMaker: getWorksheetMakerAvailability(user, { isAdmin: admin }),
            worksheetMakerPack: publicWorksheetMakerPack(),
            googleConfigured: googleReady,
            localAuthEnabled: dbReady,
            bmcPaymentUrl: checkoutUrls().extras,
            accessPlans: publicAccessPlans(),
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
        res.json({ url: checkoutUrls().extras });
    });

    app.get('/api/billing/plans', (_req, res) => {
        res.json({
            plans: publicAccessPlans(),
            maturaAssessPack: publicMaturaAssessPack(),
            worksheetMakerPack: publicWorksheetMakerPack(),
            checkoutNote: 'Checkout is in USD on Buy Me a Coffee. PLN is the local price (~4 zł / $1). Stripe / Przelewy24 later.',
        });
    });

    // Anonymous + logged-in game/section popularity tracking
    app.post('/api/analytics/enter', async (req, res) => {
        try {
            if (!dbReady) return res.json({ ok: false, disabled: true });
            // Screens outside the analytics allowlist (live host / join / play, auction…) are
            // simply not tracked — answer 200 instead of a console-visible 400.
            if (!normalizeAnalyticsPageKey(req.body?.pageKey)) return res.json({ ok: false, ignored: true });
            const visit = await startAnalyticsVisit({
                visitorSessionId: req.body?.visitorSessionId,
                userId: req.user?.id || null,
                pageKey: req.body?.pageKey,
            });
            if (!visit) return res.status(400).json({ error: 'Invalid page or session' });
            res.json({ ok: true, visitId: visit.id, pageKey: visit.page_key });
        } catch (err) {
            console.warn('analytics enter failed:', err.message);
            res.status(500).json({ error: 'Analytics failed' });
        }
    });

    app.post('/api/analytics/dwell', async (req, res) => {
        try {
            if (!dbReady) return res.json({ ok: false, disabled: true });
            const row = await updateAnalyticsDwell({
                visitId: req.body?.visitId,
                visitorSessionId: req.body?.visitorSessionId,
                durationMs: req.body?.durationMs,
            });
            if (!row) return res.status(400).json({ error: 'Invalid visit' });
            res.json({ ok: true, durationMs: row.duration_ms });
        } catch (err) {
            console.warn('analytics dwell failed:', err.message);
            res.status(500).json({ error: 'Analytics failed' });
        }
    });

    app.post('/api/analytics/leave', async (req, res) => {
        try {
            if (!dbReady) return res.json({ ok: false, disabled: true });
            const row = await endAnalyticsVisit({
                visitId: req.body?.visitId,
                visitorSessionId: req.body?.visitorSessionId,
                durationMs: req.body?.durationMs,
            });
            if (!row) return res.status(400).json({ error: 'Invalid visit' });
            res.json({ ok: true, durationMs: row.duration_ms });
        } catch (err) {
            console.warn('analytics leave failed:', err.message);
            res.status(500).json({ error: 'Analytics failed' });
        }
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
            const daysRaw = req.body?.days;
            const accessUntilRaw = req.body?.accessUntil;
            const opts = {};
            if (accessUntilRaw) opts.accessUntil = accessUntilRaw;
            else if (daysRaw !== undefined && daysRaw !== null && daysRaw !== '') opts.days = daysRaw;
            const user = await approveUser(Number(req.params.id), opts);
            if (!user) return res.status(404).json({ error: 'User not found' });
            res.json({ user: publicUser(user), hasAccess: hasWritingAccess(user) });
        } catch (err) {
            const status = /Invalid|must be|positive/i.test(err.message || '') ? 400 : 500;
            res.status(status).json({ error: err.message });
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

    app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid user id' });
            if (req.user && Number(req.user.id) === id) {
                return res.status(400).json({ error: 'You cannot delete your own signed-in account.' });
            }
            const user = await deleteUser(id);
            if (!user) return res.status(404).json({ error: 'User not found' });
            res.json({ deleted: true, id: user.id, email: user.email });
        } catch (err) {
            const status = /Cannot delete the admin/i.test(err.message || '') ? 400 : 500;
            res.status(status).json({ error: err.message || 'Failed to delete user' });
        }
    });

    app.get('/api/admin/game-stats', requireAdmin, async (req, res) => {
        try {
            const days = Number(req.query.days) || 30;
            const stats = await getGamePopularityStats({ days });
            res.json(stats);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==========================================
    // WORD SETS API
    // ==========================================

    app.get('/api/word-sets', requireLogin, async (req, res) => {
        try {
            const sets = await listWordSets(req.user.id);
            res.json({ sets });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/word-sets', requireLogin, async (req, res) => {
        try {
            const { name, setType, testDirection, items, category, className } = req.body;
            if (!name || !items || !Array.isArray(items) || items.length < 1) {
                return res.status(400).json({ error: 'Name and at least 1 item required' });
            }
            const ws = await createWordSet(req.user.id, { name, setType, testDirection, items, category, className });
            res.json({ set: ws });
        } catch (err) { res.status(400).json({ error: err.message }); }
    });

    /**
     * Import from photo / typed list (Writing Suite plan for the WHOLE feature, 403 without it):
     * AI extraction + learner definitions (per-user rate limits in wordset-import-ai.js), then append
     * reviewed cards to an owned set as consecutive cards (ownership checked, duplicates skipped).
     */
    const wordSetImport = createWordSetImportHandlers({
        runPrompt: ({ prompt, images = [], label }) => runVisionJsonPrompt({ apiKey: process.env.CURSOR_API_KEY, prompt, images, label }),
        appendItems: (setId, userId, items) => appendItemsToWordSet(setId, userId, items),
        isConfigured: () => Boolean(process.env.CURSOR_API_KEY),
    });
    mountWordSetImportRoutes(app, { gate: requireWritingAccess, handlers: wordSetImport });

    app.post('/api/word-sets/append', requireLogin, async (req, res) => {
        try {
            const { name, setType, testDirection, items } = req.body;
            if (!name || !items || !Array.isArray(items) || items.length < 1) {
                return res.status(400).json({ error: 'Name and at least 1 item required' });
            }
            const result = await appendWordSetItems(req.user.id, { name, setType, testDirection, items });
            res.json(result);
        } catch (err) { res.status(400).json({ error: err.message }); }
    });

    app.get('/api/word-sets/:id', requireLogin, async (req, res) => {
        try {
            const ws = await getWordSet(Number(req.params.id), req.user.id);
            if (!ws) return res.status(404).json({ error: 'Not found' });
            res.json({ set: ws });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/word-sets/:id', requireLogin, async (req, res) => {
        try {
            const { name, testDirection, items, category, className } = req.body;
            const ws = await updateWordSet(Number(req.params.id), req.user.id, { name, testDirection, items, category, className });
            if (!ws) return res.status(404).json({ error: 'Not found' });
            res.json({ set: ws });
        } catch (err) { res.status(400).json({ error: err.message }); }
    });

    app.delete('/api/word-sets/:id', requireLogin, async (req, res) => {
        try {
            const ok = await deleteWordSet(Number(req.params.id), req.user.id);
            if (!ok) return res.status(404).json({ error: 'Not found' });
            res.json({ deleted: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/word-sets/:id/load', requireLogin, async (req, res) => {
        try {
            const data = await loadWordSetForGame(Number(req.params.id), req.user.id);
            if (!data) return res.status(404).json({ error: 'Not found' });
            res.json(data);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/word-sets/:id/share', requireLogin, async (req, res) => {
        try {
            const rotate = Boolean(req.body?.rotate);
            const ws = await enableWordSetShare(Number(req.params.id), req.user.id, { rotate });
            if (!ws) return res.status(404).json({ error: 'Not found' });
            const token = ws.share_token;
            res.json({
                set: { id: ws.id, name: ws.name, shareToken: token, itemCount: ws.item_count },
                url: `${APP_BASE_URL}/#/set/${encodeURIComponent(token)}`,
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.delete('/api/word-sets/:id/share', requireLogin, async (req, res) => {
        try {
            const ws = await revokeWordSetShare(Number(req.params.id), req.user.id);
            if (!ws) return res.status(404).json({ error: 'Not found' });
            res.json({ revoked: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /** Public: load a shared word list by token (no login). */
    app.get('/api/shared-sets/:token', async (req, res) => {
        try {
            const data = await getSharedWordSetByToken(req.params.token);
            if (!data) return res.status(404).json({ error: 'This share link is invalid or has been turned off.' });
            res.json(data);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ==========================================
    // PROGRESS API
    // ==========================================

    app.post('/api/progress/session', requireLogin, async (req, res) => {
        try {
            const { gameKey, wordSetId, score, pointsEarned, durationMs, wordsTotal, wordsMastered, result } = req.body;
            if (!gameKey) return res.status(400).json({ error: 'gameKey required' });
            await recordGameSession(req.user.id, { gameKey, wordSetId, score, pointsEarned, durationMs, wordsTotal, wordsMastered, result });
            res.json({ saved: true });
        } catch (err) { res.status(400).json({ error: err.message }); }
    });

    app.get('/api/progress/summary', requireLogin, async (req, res) => {
        try {
            const summary = await getProgressSummary(req.user.id);
            res.json(summary);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/progress/words', requireLogin, async (req, res) => {
        try {
            const { updates } = req.body;
            if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates array required' });
            await updateWordProgress(req.user.id, updates);
            res.json({ saved: true });
        } catch (err) { res.status(400).json({ error: err.message }); }
    });

    // ==========================================
    // LIVE GAME API
    // ==========================================

    app.post('/api/live/create', requireLogin, async (req, res) => {
        try {
            let deckPayload;
            let deckLabel = null;
            const { source, setId, level, terms, glossary, answerMode } = req.body || {};

            if (source === 'wordset') {
                if (!setId) return res.status(400).json({ error: 'setId required for word set source.' });
                const data = await loadWordSetForGame(Number(setId), req.user.id);
                if (!data) return res.status(404).json({ error: 'Word set not found.' });
                deckLabel = data.set?.name || data.set?.title || `Word set #${setId}`;
                deckPayload = buildDeckFromRequest({
                    source: 'wordset',
                    items: data.items,
                    level,
                });
            } else if (source === 'paste') {
                deckPayload = buildDeckFromRequest({ source: 'paste', terms: terms || glossary, level });
                deckLabel = 'Pasted glossary';
            } else {
                deckPayload = buildDeckFromRequest({ source: 'builtin', level: level || 'intermediate' });
                const lv = String(deckPayload.level || 'intermediate');
                deckLabel = `Built-in deck (${lv.charAt(0).toUpperCase()}${lv.slice(1)})`;
            }

            if (deckPayload.deck.length < 12) {
                return res.status(400).json({ error: 'At least 12 terms with definitions are required.' });
            }

            const room = createRoom(req.user.id, {
                deck: deckPayload.deck,
                level: deckPayload.level,
                answerMode,
                gameFormat: req.body?.gameFormat,
                teamAssignment: req.body?.teamAssignment,
                questionSeconds: req.body?.questionSeconds,
                gameMinutes: req.body?.gameMinutes,
                challenges: req.body?.challenges,
                deckLabel,
                hostName: req.user?.name || '',
            });

            const joinUrl = `${APP_BASE_URL}/#/live/join?code=${encodeURIComponent(room.code)}`;
            res.json({
                code: room.code,
                hostToken: room.hostToken,
                termsToWin: 12,
                minPlayers: (room.gameFormat === 'captain-crew' || room.gameFormat === 'hot-spark-relay') ? 4 : 2,
                gameMinutes: room.gameMinutes,
                answerMode: room.answerMode,
                gameFormat: room.gameFormat,
                teamAssignment: room.teamAssignment,
                joinUrl,
            });
        } catch (err) {
            res.status(400).json({ error: err.message || 'Could not create room.' });
        }
    });

    app.post('/api/live/destroy', requireLogin, async (req, res) => {
        try {
            const { code, hostToken } = req.body || {};
            if (!code || !hostToken) return res.status(400).json({ error: 'code and hostToken required.' });
            const room = destroyRoom(code, hostToken);
            if (!room) return res.status(404).json({ error: 'Room not found.' });
            res.json({ ok: true });
        } catch (err) {
            res.status(400).json({ error: err.message || 'Could not close room.' });
        }
    });

    app.post('/api/live/join', async (req, res) => {
        try {
            const { code, nickname, avatar } = req.body || {};
            if (!code) return res.status(400).json({ error: 'Room code required.' });
            const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
            const { room, player, reclaimed } = joinRoom(code, nickname, ip, avatar);
            broadcastLobbyUpdate(room.code);
            res.json({
                code: room.code,
                playerId: player.id,
                playerToken: player.playerToken,
                nickname: player.nickname,
                avatar: player.avatar || null,
                reclaimed: Boolean(reclaimed),
                phase: room.phase,
                snapshot: publicRoomSnapshot(room),
            });
        } catch (err) {
            res.status(400).json({ error: err.message || 'Could not join room.' });
        }
    });

    // Join page: "Room found — <host>'s class · N players waiting". Public + rate-limited.
    registerLiveLookupRoute(app);

    // Host-only download of the last finished game's report (kept on the room in memory;
    // a copy is also saved in the host's user_game_sessions.result.report).
    const sendLiveReport = (fmt) => async (req, res) => {
        const room = getRoom(req.params.code);
        if (!room) return res.status(404).json({ error: 'Room not found.' });
        if (!room.hostUserId || room.hostUserId !== req.user?.id) {
            return res.status(403).json({ error: 'Only the host can download this report.' });
        }
        const report = room.lastReport;
        if (!report) return res.status(404).json({ error: 'No finished game in this room yet.' });
        const base = reportFileBase(report);
        res.set('Cache-Control', 'no-store');
        try {
            if (fmt === 'csv') {
                res.set('Content-Type', 'text/csv; charset=utf-8');
                res.set('Content-Disposition', `attachment; filename="${base}.csv"`);
                return res.send(reportToCsv(report));
            }
            const pdf = await reportToPdf(report);
            res.set('Content-Type', 'application/pdf');
            res.set('Content-Disposition', `attachment; filename="${base}.pdf"`);
            return res.send(pdf);
        } catch (err) {
            console.error('report export failed:', err);
            return res.status(500).json({ error: 'Could not build the report.' });
        }
    };
    app.get('/api/live/room/:code/report.csv', requireLogin, sendLiveReport('csv'));
    app.get('/api/live/room/:code/report.pdf', requireLogin, sendLiveReport('pdf'));

    app.get('/api/live/room/:code', (req, res) => {
        const room = getRoom(req.params.code);
        if (!room) return res.status(404).json({ error: 'Room not found or expired.' });
        res.json(publicRoomSnapshot(room));
    });

    app.get('/api/live/builtin-levels', (_req, res) => {
        res.json({
            levels: [
                { id: 'beginner', label: 'Beginner' },
                { id: 'easy', label: 'Easy' },
                { id: 'intermediate', label: 'Intermediate' },
                { id: 'advanced', label: 'Advanced' },
            ],
            samples: {
                beginner: loadBuiltinDeck('beginner').length,
                easy: loadBuiltinDeck('easy').length,
                intermediate: loadBuiltinDeck('intermediate').length,
                advanced: loadBuiltinDeck('advanced').length,
            },
        });
    });

    // ==========================================
    // MATURA ESSAY REVIEW HISTORY (text only — no images/PDFs)
    // ==========================================

    app.get('/api/matura/reviews', requireLogin, async (req, res) => {
        try {
            const [reviews, progress] = await Promise.all([
                listMaturaEssayReviews(req.user.id),
                getMaturaProgressSummary(req.user.id),
            ]);
            res.json({ reviews, progress });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/matura/reviews/:id', requireLogin, async (req, res) => {
        try {
            const row = await getMaturaEssayReview(req.user.id, Number(req.params.id));
            if (!row) return res.status(404).json({ error: 'Review not found' });
            res.json({
                id: row.id,
                taskText: row.task_text,
                essayText: row.essay_text,
                totalScore: row.total_score,
                maxScore: row.max_score,
                review: row.review,
                createdAt: row.created_at,
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/matura/reviews', requireLogin, async (req, res) => {
        try {
            const { taskText, essayText, totalScore, maxScore, review } = req.body || {};
            if (!review || typeof review !== 'object') {
                return res.status(400).json({ error: 'review object required' });
            }
            // Reject any attempt to store binary uploads
            if (req.body?.images || review.images || review.dataUrl) {
                return res.status(400).json({ error: 'Images and PDF files are not stored. Save the text review only.' });
            }
            const saved = await saveMaturaEssayReview(req.user.id, {
                taskText,
                essayText,
                totalScore,
                maxScore,
                review,
            });
            const progress = await getMaturaProgressSummary(req.user.id);
            res.json({ saved: true, id: saved.id, createdAt: saved.created_at, progress });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    app.put('/api/matura/reviews/:id', requireLogin, async (req, res) => {
        try {
            const { taskText, essayText, totalScore, maxScore, review } = req.body || {};
            if (!review || typeof review !== 'object') {
                return res.status(400).json({ error: 'review object required' });
            }
            if (req.body?.images || review.images || review.dataUrl) {
                return res.status(400).json({ error: 'Images and PDF files are not stored. Save the text review only.' });
            }
            const saved = await updateMaturaEssayReview(req.user.id, req.params.id, { taskText, essayText, totalScore, maxScore, review });
            if (!saved) return res.status(404).json({ error: 'Review not found' });
            const progress = await getMaturaProgressSummary(req.user.id);
            res.json({ saved: true, id: saved.id, createdAt: saved.created_at, progress });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    app.delete('/api/matura/reviews/:id', requireLogin, async (req, res) => {
        try {
            const deleted = await deleteMaturaEssayReview(req.user.id, Number(req.params.id));
            if (!deleted) return res.status(404).json({ error: 'Review not found' });
            const progress = await getMaturaProgressSummary(req.user.id);
            res.json({ deleted: true, progress });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

function extractJson(text) {
    if (!text) throw new Error('Empty response from Cursor AI');
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    try {
        return JSON.parse(candidate);
    } catch (_) {
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start !== -1 && end > start) {
            return JSON.parse(candidate.slice(start, end + 1));
        }
        throw new Error('Cursor AI did not return valid JSON.');
    }
}

function cleanVisionImages(images) {
    // Cap payload size (~1.5MB base64 ≈ ~1.1MB binary) — client should compress first.
    const maxBase64Chars = 2_000_000;
    return (Array.isArray(images) ? images : []).slice(0, 5).map((img) => {
        const mimeType = String(img?.mimeType || 'image/png');
        if (!/^image\/(png|jpeg|jpg|gif|webp)$/i.test(mimeType)) {
            throw new Error('Unsupported image type. Use PNG, JPEG, GIF or WebP (PDF pages are converted client-side).');
        }
        let data = String(img?.data || img?.dataUrl || '');
        const comma = data.indexOf(',');
        if (data.startsWith('data:') && comma !== -1) data = data.slice(comma + 1);
        if (!data) throw new Error('Image payload empty.');
        if (data.length > maxBase64Chars) {
            throw new Error('Image too large after upload. Re-take as a smaller JPG or crop to one page.');
        }
        const out = { data, mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType };
        const w = Number(img?.dimension?.width || img?.width);
        const h = Number(img?.dimension?.height || img?.height);
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            out.dimension = { width: Math.round(w), height: Math.round(h) };
        }
        return out;
    });
}

async function runVisionJsonPrompt({ apiKey, prompt, images = [], label = 'generate' }) {
    const cleanImages = cleanVisionImages(images);
    const alreadyJsonOnly = /return only valid json/i.test(prompt);
    const fullPrompt = alreadyJsonOnly
        ? `${prompt}\n\nNo markdown fences. No tool use. Reply with JSON only.`
        : `${prompt}\n\nReturn ONLY valid JSON. No markdown fences, no explanation, no tool use.`;
    if (!cleanImages.length) {
        const result = await Agent.prompt(fullPrompt, aiAgentOptions(apiKey));
        logAiUsage(label, result);
        if (result.status !== 'finished' || !result.result) {
            throw new Error(result.error?.message || 'Cursor AI generation failed');
        }
        return extractJson(result.result);
    }

    let agent;
    try {
        agent = await Agent.create(aiAgentOptions(apiKey));
        const run = await agent.send({
            text: fullPrompt,
            images: cleanImages,
        });
        const result = await run.wait();
        logAiUsage(label, result);
        if (result.status !== 'finished' || !result.result) {
            throw new Error(result.error?.message || 'Cursor AI generation failed');
        }
        return extractJson(result.result);
    } finally {
        if (agent && typeof agent[Symbol.asyncDispose] === 'function') {
            try { await agent[Symbol.asyncDispose](); } catch (_) { /* ignore */ }
        }
    }
}

    // ---- In your own time (personalized practice coach) ----
    app.get('/api/own-time/profile', requireWritingAccess, async (req, res) => {
        try {
            const profile = await getOwnTimeProfile(req.user.id);
            res.json({ profile });
        } catch (err) {
            console.error('own-time profile get:', err);
            res.status(500).json({ error: 'Failed to load profile.' });
        }
    });

    app.put('/api/own-time/profile', requireWritingAccess, async (req, res) => {
        try {
            const profile = await upsertOwnTimeProfile(req.user.id, req.body || {});
            res.json({ profile });
        } catch (err) {
            console.error('own-time profile put:', err);
            res.status(500).json({ error: 'Failed to save profile.' });
        }
    });

    app.get('/api/own-time/lessons', requireWritingAccess, async (req, res) => {
        try {
            const lessons = await listOwnTimeLessons(req.user.id, { limit: req.query?.limit });
            const today = await getOwnTimeToday(req.user.id, OWN_TIME_EXTRA_DAILY_LIMIT);
            res.json({ lessons, today });
        } catch (err) {
            console.error('own-time lessons list:', err);
            res.status(500).json({ error: 'Failed to load lessons.' });
        }
    });

    app.post('/api/own-time/lessons', requireWritingAccess, async (req, res) => {
        try {
            const saved = await saveOwnTimeLesson(req.user.id, {
                lesson: req.body?.lesson,
                feedback: req.body?.feedback,
                durationMs: req.body?.durationMs,
            });
            res.json(saved);
        } catch (err) {
            console.error('own-time lesson save:', err);
            res.status(500).json({ error: 'Failed to save lesson.' });
        }
    });

    app.post('/api/own-time/generate', requireWritingAccess, async (req, res) => {
        const checked = validateOwnTimeGenerateRequest(req.body);
        if (!checked.ok) return res.status(400).json({ error: checked.error });
        const apiKey = process.env.CURSOR_API_KEY;
        const mock = !apiKey && process.env.OWN_TIME_MOCK === '1' && process.env.NODE_ENV !== 'production';
        if (!apiKey && !mock) {
            return res.status(503).json({ error: 'Server not configured: CURSOR_API_KEY is missing.' });
        }
        // "Keep going": capped extra sets per day; reserve before calling the AI, release on failure.
        let reservation = null;
        if (checked.value.extra) {
            try {
                reservation = await reserveOwnTimeExtra(req.user.id, OWN_TIME_EXTRA_DAILY_LIMIT);
            } catch (err) {
                console.error('own-time extra reserve:', err);
                return res.status(500).json({ error: 'Could not start an extra set.' });
            }
            if (!reservation.ok) {
                return res.status(429).json({
                    error: `Daily limit reached: ${OWN_TIME_EXTRA_DAILY_LIMIT} extra sets per day.`,
                    code: 'own_time_extra_cap',
                    extrasUsed: OWN_TIME_EXTRA_DAILY_LIMIT,
                    extrasLimit: OWN_TIME_EXTRA_DAILY_LIMIT,
                });
            }
            checked.value.extraContext.setNumber = reservation.used;
        }
        const extraInfo = reservation ? {
            extra: true,
            extrasUsed: reservation.used,
            extrasLimit: OWN_TIME_EXTRA_DAILY_LIMIT,
            extrasLeft: Math.max(0, OWN_TIME_EXTRA_DAILY_LIMIT - reservation.used),
        } : {};
        // Local testing without an AI key: OWN_TIME_MOCK=1 returns fixed sample lessons (never in production).
        if (mock) {
            // Lower levels (A0–A1 or under 12) get the sample with word-order + unscramble tile tasks.
            const cefr = checked.value.cefr;
            const low = ['A0', 'A1'].includes(cefr) || (checked.value.age != null && checked.value.age < 12 && !['B1', 'B2', 'C1'].includes(cefr));
            const byLevel = { B1: OWN_TIME_MOCK_B1_REPLY, B2: OWN_TIME_MOCK_B2_REPLY, C1: OWN_TIME_MOCK_C1_REPLY };
            const reply = checked.value.extra ? OWN_TIME_MOCK_EXTRA_REPLY : (low ? OWN_TIME_MOCK_LOW_REPLY : (byLevel[cefr] || OWN_TIME_MOCK_REPLY));
            const lesson = normalizeOwnTimeLesson(reply, checked.value);
            if (reservation) lesson.extra = true;
            return res.json({ lesson, mock: true, ...extraInfo });
        }
        try {
            const prompt = buildOwnTimeLessonPrompt(checked.value);
            const label = `own-time-${checked.value.cefr}${reservation ? '-extra' : ''}`;
            let lesson = normalizeOwnTimeLesson(await runVisionJsonPrompt({ apiKey, prompt, label }), checked.value);
            if (!lesson.taskCountOk) {
                // Every lesson / extra set must have 5–6 tasks: ask once more, then reject.
                const retry = `${prompt}\n\nIMPORTANT: your previous reply had ${lesson.tasks.length} usable task(s). Return EXACTLY 5 or 6 valid tasks.`;
                lesson = normalizeOwnTimeLesson(await runVisionJsonPrompt({ apiKey, prompt: retry, label: `${label}-retry` }), checked.value);
                if (!lesson.taskCountOk) throw new Error('The lesson generator returned too few tasks. Please try again.');
            }
            if (reservation) lesson.extra = true;
            res.json({ lesson, ...extraInfo });
        } catch (error) {
            if (reservation) await releaseOwnTimeExtra(reservation.id).catch(() => {});
            console.error('Own-time generation error:', error);
            res.status(500).json({ error: error.message || 'Failed to generate lesson' });
        }
    });

    app.post('/api/generate', requireWritingAccess, async (req, res) => {
    const prompt = req.body?.prompt;
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Missing prompt' });
    }

    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) {
            return res.status(503).json({ error: 'Server not configured: CURSOR_API_KEY is missing.' });
    }

    try {
        const parsed = await runVisionJsonPrompt({
            apiKey,
            prompt,
            images: Array.isArray(req.body?.images) ? req.body.images : [],
            label: 'generate',
        });
        res.json(parsed);
    } catch (error) {
        console.error('Generation error:', error);
        const status = /Unsupported image|too large|valid JSON/i.test(error.message || '') ? 400 : 500;
        res.status(status).json({ error: error.message || 'Failed to generate content' });
    }
    });

    /**
     * Word-Forged Odyssey: the client sends a whitelisted CEFR level (A2-C1), genre, target words and
     * game state; the Game Master prompt (with the level's constraints) is built on the server.
     */
    app.post('/api/odyssey', requireWritingAccess, async (req, res) => {
        const checked = validateOdysseyRequest(req.body);
        if (!checked.ok) return res.status(400).json({ error: checked.error });
        const apiKey = process.env.CURSOR_API_KEY;
        if (!apiKey) {
            return res.status(503).json({ error: 'Server not configured: CURSOR_API_KEY is missing.' });
        }
        const v = checked.value;
        try {
            const parsed = await runVisionJsonPrompt({ apiKey, prompt: buildOdysseyPrompt(v), label: `odyssey-${v.phase}-${v.level}` });
            const out = parsed && typeof parsed === 'object' ? parsed : {};
            out.level = v.level;
            out.targetWordsInStory = v.phase === 'open'
                ? targetWordsFound(v.words, out.storyBeat, out.situation)
                : targetWordsFound(v.words, out.storyContinuation, out.newSituation);
            res.json(out);
        } catch (error) {
            console.error('Odyssey generation error:', error);
            res.status(500).json({ error: error.message || 'Failed to generate the story' });
        }
    });

    /**
     * Frankenstein Builder "Generate with AI": whitelisted text/paragraph type + optional topic; the
     * CKE extended-matura prompt, validation (JSON, word count, linking) and a per-user rate limit
     * live in frank-ai.js. On any failure the client falls back to the static bank.
     */
    app.post('/api/frank/generate', requireWritingAccess, createFrankGenerateHandler({
        runPrompt: (prompt, label) => runVisionJsonPrompt({ apiKey: process.env.CURSOR_API_KEY, prompt, label }),
        isConfigured: () => Boolean(process.env.CURSOR_API_KEY),
    }));

    /**
     * Primary English Exam Simulator — same vision upload path as Matura Writing Assessment,
     * but with friendly PE / E8 email examiner feedback (not Matura 13-point criteria).
     */
    app.post('/api/assess-pe-exam', requireWritingAccess, async (req, res) => {
        const task = (req.body?.task || '').trim();
        const essayText = (req.body?.essayText || '').trim();
        const images = Array.isArray(req.body?.images) ? req.body.images : [];
        const level = String(req.body?.level || 'A2');
        const bullets = Array.isArray(req.body?.bullets) ? req.body.bullets : [];
        const minWords = Number(req.body?.minWords) || 50;
        const maxWords = Number(req.body?.maxWords) || 120;
        const requiredWords = Array.isArray(req.body?.requiredWords) ? req.body.requiredWords : [];

        if (!task) {
            return res.status(400).json({ error: 'Exam task is required.' });
        }
        if (!essayText && images.length === 0) {
            return res.status(400).json({ error: 'Upload at least one image/PDF page or type the email.' });
        }

        const apiKey = process.env.CURSOR_API_KEY;
        if (!apiKey) {
            return res.status(503).json({ error: 'Server not configured: CURSOR_API_KEY is missing.' });
        }

        const prompt = `CEFR ${level} English email examiner (Polish primary/E8). IGNORE capitalisation. Score spelling/vocab/grammar/meaning only.

TASK:
"""
${task}
"""
Bullets: ${JSON.stringify(bullets)}
Words: ${minWords}-${maxWords}
${requiredWords.length ? `Required words (case-insensitive): ${JSON.stringify(requiredWords)}.` : ''}
${essayText ? `TYPED EMAIL:\n"""\n${essayText}\n"""` : 'No typed text — read email from attached image(s).'}

Check length, bullet coverage, cohesion, ${level}-adequate language. Second person. No invented content. Note illegible handwriting briefly.

Return ONLY valid JSON:
{
  "valid": true,
  "points": 100,
  "wordCount": 0,
  "bulletsCovered": 0,
  "bulletsTotal": ${Math.max(bullets.length, 1)},
  "message": "HTML-safe multi-line feedback with Length, Content, Cohesion, Summary."
}`;

        try {
            const parsed = await runVisionJsonPrompt({ apiKey, prompt, images, label: 'pe-exam' });
            res.json(parsed);
        } catch (error) {
            console.error('Assess-pe-exam error:', error);
            const status = /Unsupported image|too large|valid JSON|required/i.test(error.message || '') ? 400 : 500;
            res.status(status).json({ error: error.message || 'Failed to assess exam email' });
        }
    });

    /**
     * Matura Writing Assessment — accepts essay images (and optional typed text)
     * plus the exam task, then returns structured criteria feedback.
     */
    app.post('/api/assess-writing', requireWritingAccess, async (req, res) => {
        const task = (req.body?.task || '').trim();
        const essayText = (req.body?.essayText || '').trim();
        const images = Array.isArray(req.body?.images) ? req.body.images : [];

        if (!task) {
            return res.status(400).json({ error: 'Writing task is required.' });
        }
        if (!essayText && images.length === 0) {
            return res.status(400).json({ error: 'Upload at least one image/PDF page or paste the essay text.' });
        }

        let assessUser = req.user;
        try {
            const fresh = await getUserById(req.user.id);
            if (fresh) {
                assessUser = fresh;
                req.user = fresh;
            }
        } catch {
            /* use session user */
        }
        const admin = isAdminEmail(assessUser?.email);

        // Recheck after fixing a wrong transcription: text-only, tied to an earlier assessment of this user.
        const recheckOf = req.body?.recheckOf != null ? Number(req.body.recheckOf) : 0;
        let recheck = null;
        if (recheckOf) {
            if (images.length) return res.status(400).json({ error: 'A recheck uses your corrected text only — no images.' });
            let run = null;
            let root = null;
            try {
                run = await getMaturaAssessRun(assessUser.id, recheckOf);
                root = run && run.root_id ? await getMaturaAssessRun(assessUser.id, run.root_id) : run;
            } catch (e) {
                console.warn('getMaturaAssessRun failed:', e.message);
            }
            if (!run) return res.status(404).json({ error: 'Original assessment not found. Run a new assessment instead.' });
            recheck = { ...planMaturaRecheck({ run, root, editedText: essayText }), free: false };
            if (recheck.reason === 'unchanged') {
                return res.status(400).json({ error: 'The text is unchanged — edit the transcription first.', code: 'matura_recheck_unchanged' });
            }
        }

        const cooldown = getMaturaAssessAvailability(assessUser, { isAdmin: admin });
        if (!cooldown.available && !recheck?.eligible) {
            const ms = Math.max(0, cooldown.retryAfterMs || 0);
            const totalMin = Math.max(1, Math.ceil(ms / 60000));
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            let when = `${totalMin} minute${totalMin === 1 ? '' : 's'}`;
            if (h > 0) when = m === 0 ? `${h} hour${h === 1 ? '' : 's'}` : `${h}h ${m}m`;
            return res.status(429).json({
                error: `You have used both free Matura criteria assessments in this 4-hour window. Unlock 4 more assessments for 5 zł / $1, or try again in about ${when}.`,
                code: 'matura_assess_cooldown',
                maturaAssess: cooldown,
                maturaAssessPack: publicMaturaAssessPack(),
            });
        }

        const apiKey = process.env.CURSOR_API_KEY;
        if (!apiKey) {
            return res.status(503).json({ error: 'Server not configured: CURSOR_API_KEY is missing.' });
        }
        if (recheck?.eligible) {
            try {
                recheck.free = await claimMaturaFreeRecheck(assessUser.id, recheck.rootId);
            } catch (e) {
                console.warn('claimMaturaFreeRecheck failed:', e.message);
            }
            if (!recheck.free) {
                recheck.reason = 'already_used';
                if (!cooldown.available) {
                    return res.status(429).json({
                        error: 'The free recheck for this essay was already used and no free assessments are left in this 4-hour window.',
                        code: 'matura_assess_cooldown', maturaAssess: cooldown, maturaAssessPack: publicMaturaAssessPack(),
                    });
                }
            }
        }

        const prompt = `Matura rozszerzona English writing feedback TO THE STUDENT (you/your). Total 13 pts: Content 0–5, Coherence 0–2, Range 0–3, Accuracy 0–3.

TASK:
"""
${task}
"""

${essayText ? `TYPED TEXT (also use images if attached):\n"""\n${essayText}\n"""` : 'No typed text — read the essay from the attached image(s).'}

Also give conciseness coaching (does NOT change the 13 pts): redundancy, strong verbs, active voice, fillers, short phrases, avoid nominalizations, simpler sentences. 3–6 "conciseness" bullets with before→after hints from THEIR wording. Weave 1–2 into improvements. Do NOT rewrite paragraphs or give a model essay.

Rules: second person; short bullet arrays only; fair/specific; scores integers in band; no invented content; if handwriting illegible, note briefly. Full original transcript in transcribedEssay; markedTranscript wraps ONLY real mistakes in <<err>>...<<\/err>> (no corrections inside tags). For EVERY <<err>> tag add one entry to "mistakes", in the same order: text = exactly the text inside that tag, type = one of ${MATURA_MISTAKE_TYPES}, correction = the corrected wording (short), explanation = ≤15 words why.

Return ONLY valid JSON:
{
  "transcribedEssay": "full plain transcript",
  "markedTranscript": "transcript with <<err>>mistakes<<\/err>>",
  "mistakes": [{ "text": "exact text inside the nth tag", "type": "grammar", "correction": "...", "explanation": "..." }],
  "wordCount": 0,
  "overallComment": ["2–4 bullets"],
  "totalScore": 0,
  "maxScore": 13,
  "criteria": [
    { "id": "content", "name": "Content (Treść)", "score": 0, "max": 5, "comment": ["..."], "strengths": ["..."], "improvements": ["..."] },
    { "id": "coherence", "name": "Coherence & cohesion (Spójność i logika)", "score": 0, "max": 2, "comment": ["..."], "strengths": ["..."], "improvements": ["..."] },
    { "id": "range", "name": "Range (Zakres środków językowych)", "score": 0, "max": 3, "comment": ["..."], "strengths": ["..."], "improvements": ["..."] },
    { "id": "accuracy", "name": "Accuracy (Poprawność środków językowych)", "score": 0, "max": 3, "comment": ["..."], "strengths": ["..."], "improvements": ["..."] }
  ],
  "conciseness": ["3–6 bullets"],
  "strengths": ["3–5"],
  "improvements": ["3–5 next steps for the student; include ≥1 conciseness tip if wordy"]
}`;

        try {
            const parsed = await runVisionJsonPrompt({
                apiKey,
                prompt,
                images,
                label: 'matura-assess',
            });
            parsed.mistakes = sanitizeMaturaMistakes(parsed?.mistakes);
            let maturaAssess = cooldown;
            if (!admin && !recheck?.free) {
                try {
                    const stamped = await recordMaturaAssessUsage(assessUser.id);
                    if (stamped) {
                        assessUser.matura_assess_last_at = stamped.matura_assess_last_at;
                        assessUser.matura_assess_credits = stamped.matura_assess_credits;
                        assessUser.matura_assess_window_count = stamped.matura_assess_window_count;
                    }
                    maturaAssess = getMaturaAssessAvailability(assessUser, { isAdmin: false });
                } catch (stampErr) {
                    console.warn('recordMaturaAssessUsage failed:', stampErr.message);
                }
            }
            let assessmentId = null;
            try {
                assessmentId = await recordMaturaAssessRun(assessUser.id, {
                    essayText: parsed.transcribedEssay || essayText,
                    rootId: recheck?.rootId || null,
                });
            } catch (runErr) {
                console.warn('recordMaturaAssessRun failed:', runErr.message);
            }
            // One free recheck per original assessment: gone once used (by this or an earlier recheck).
            const freeRecheckGone = Boolean(recheck && (recheck.free || recheck.reason === 'already_used'));
            res.json({
                ...parsed,
                assessmentId,
                recheck: recheck ? { free: recheck.free, reason: recheck.reason, recheckOf } : null,
                freeRecheckAvailable: Boolean(assessmentId) && !freeRecheckGone,
                maturaAssess,
                maturaAssessPack: publicMaturaAssessPack(),
            });
        } catch (error) {
            if (recheck?.free) {
                try { await releaseMaturaFreeRecheck(assessUser.id, recheck.rootId); } catch { /* ignore */ }
            }
            console.error('Assess-writing error:', error);
            const status = /Unsupported image|too large|valid JSON/i.test(error.message || '') ? 400 : 500;
            res.status(status).json({ error: error.message || 'Failed to assess writing' });
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

    app.use('/packs', (_req, res) => {
        res.status(404).type('text/plain').send('Not found');
    });

    // Worksheet Maker (Lesson Creator) — own page + /worksheet-maker/api/*
    // Creating a worksheet costs one prepaid credit (5 zł / $2 per BMC Extra link use).
    app.use('/worksheet-maker', createWorksheetMakerRouter({
        async requireCreateAccess(req, res) {
            if (!req.isAuthenticated?.() || !req.user) {
                res.status(401).json({
                    error: 'Sign in required to use Worksheet Maker.',
                    code: 'login_required',
                    worksheetMakerPack: publicWorksheetMakerPack(),
                });
                return false;
            }
            try {
                let user = (await expireUserIfNeeded(req.user)) || req.user;
                user = (await applyPendingBmcPayments(user)) || user;
                try {
                    const fresh = await getUserById(user.id);
                    if (fresh) user = fresh;
                } catch { /* ignore */ }
                req.user = user;
            } catch { /* ignore */ }

            if (isAdminEmail(req.user.email)) return true;

            const availability = getWorksheetMakerAvailability(req.user, { isAdmin: false });
            if (!availability.allowed) {
                res.status(402).json({
                    error: 'Buy one Worksheet Maker use (5 zł / $2) with the purchase link, then try again.',
                    code: 'worksheet_maker_credits',
                    worksheetMaker: availability,
                    worksheetMakerPack: publicWorksheetMakerPack(),
                });
                return false;
            }

            const updated = await consumeWorksheetMakerCredit(req.user.id);
            if (!updated) {
                res.status(402).json({
                    error: 'No Worksheet Maker uses left. Buy another use (5 zł / $2) with the purchase link.',
                    code: 'worksheet_maker_credits',
                    worksheetMaker: getWorksheetMakerAvailability(req.user, { isAdmin: false }),
                    worksheetMakerPack: publicWorksheetMakerPack(),
                });
                return false;
            }
            req.user = updated;
            return true;
        },
    }));

    // Only files on the allowlist (pages, client JS/CSS, images, audio) are served;
    // server code, tests, package/deploy files, dotfiles, data/, scripts/ etc. 404.
    app.use(staticAllowlist());
    app.use(express.static(__dirname, { dotfiles: 'deny', index: ['index.html'] }));

    const httpServer = http.createServer(app);
    const io = new SocketIOServer(httpServer, {
        cors: { origin: true, credentials: true },
    });

    initLiveGame(io, {
        onGameEnd(room) {
            if (!room.hostUserId) return;
            // Lucky Lanterns / Word Cannon players have no race `score`, which made this NaN and
            // broke the integer insert. Use each format's own score and never pass NaN.
            const finite = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
            let topScore = Array.from(room.players.values()).reduce((m, p) => Math.max(m, finite(p.score)), 0);
            if (room.lantern?.scores) {
                topScore = Math.max(topScore, ...Object.values(room.lantern.scores).map(finite));
            }
            if (room.cannon?.teams) {
                topScore = Math.max(topScore, finite(room.cannon.teams.red?.points), finite(room.cannon.teams.blue?.points));
            }
            topScore = Math.round(topScore);
            recordGameSession(room.hostUserId, {
                gameKey: 'live_host',
                score: room.players.size,
                pointsEarned: topScore,
                wordsTotal: 12,
                durationMs: room.lastReport?.durationMs || 0,
                // The full game report is kept with the teacher's live-host history.
                result: { code: room.code, players: room.players.size, ...(room.lastReport ? { report: room.lastReport } : {}) },
            }).catch((err) => console.warn('live_host session save failed:', err.message));
        },
    });

    httpServer.listen(PORT, '0.0.0.0', () => {
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

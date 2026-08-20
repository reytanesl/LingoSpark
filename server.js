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
    startAnalyticsVisit,
    updateAnalyticsDwell,
    endAnalyticsVisit,
    getGamePopularityStats,
    createWordSet,
    listWordSets,
    getWordSet,
    updateWordSet,
    deleteWordSet,
    loadWordSetForGame,
    recordGameSession,
    updateWordProgress,
    getProgressSummary,
} from './db.js';
import { configurePassport, registerLocalAccount, requireAdmin, requireWritingAccess, requireLogin } from './auth.js';
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

    // Anonymous + logged-in game/section popularity tracking
    app.post('/api/analytics/enter', async (req, res) => {
        try {
            if (!dbReady) return res.json({ ok: false, disabled: true });
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
            const { name, setType, testDirection, items } = req.body;
            if (!name || !items || !Array.isArray(items) || items.length < 1) {
                return res.status(400).json({ error: 'Name and at least 1 item required' });
            }
            const ws = await createWordSet(req.user.id, { name, setType, testDirection, items });
            res.json({ set: ws });
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
            const { name, testDirection, items } = req.body;
            const ws = await updateWordSet(Number(req.params.id), req.user.id, { name, testDirection, items });
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

        const apiKey = process.env.CURSOR_API_KEY;
        if (!apiKey) {
            return res.status(503).json({ error: 'Server not configured: CURSOR_API_KEY is missing.' });
        }

        let cleanImages;
        try {
            cleanImages = images.slice(0, 5).map((img) => {
                const mimeType = String(img?.mimeType || 'image/png');
                if (!/^image\/(png|jpeg|jpg|gif|webp)$/i.test(mimeType)) {
                    throw new Error('Unsupported image type. Use PNG, JPEG, GIF or WebP (PDF pages are converted client-side).');
                }
                let data = String(img?.data || '');
                const comma = data.indexOf(',');
                if (data.startsWith('data:') && comma !== -1) data = data.slice(comma + 1);
                if (!data || data.length > 20_000_000) throw new Error('Image payload too large.');
                return { data, mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType };
            });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        const prompt = `You are an official-style examiner for the Polish Matura z języka angielskiego — poziom ROZSZERZONY (extended), część pisemna (wypowiedź pisemna).

WRITING TASK GIVEN TO THE STUDENT:
"""
${task}
"""

${essayText ? `TRANSCRIBED / TYPED ESSAY TEXT (may be incomplete — also use any attached images of the handwritten or printed essay):\n"""\n${essayText}\n"""` : 'No typed transcript was provided. Read the essay from the attached image(s) of the handwritten or printed work.'}

Assess the essay using the official Matura rozszerzona writing criteria (total 13 points):
1) Treść / Content (0–5): Are all required content points from the task covered fully, partially, or missing? Are ideas relevant and developed?
2) Spójność i logika wypowiedzi / Coherence & cohesion (0–2): Logical organisation, paragraphing, linking devices, clarity of argument.
3) Zakres środków językowych / Range (0–3): Variety and appropriateness of vocabulary and structures for B2+/C1 school-leaving level.
4) Poprawność środków językowych / Accuracy (0–3): Grammar, spelling, punctuation — weigh errors against communication success.

Rules:
- Be fair, specific and constructive. Quote short snippets from the essay when commenting.
- If handwriting is partly illegible, note uncertainty but still assess what is readable.
- Do NOT invent content that is not in the essay.
- Scores must be integers within each band's max.
- Write feedback in clear English (students learn English). You may add a short Polish summary line per criterion if helpful.

Return ONLY valid JSON (no markdown fences):
{
  "transcribedEssay": "full best-effort transcription of the essay from images+text",
  "wordCount": 0,
  "overallComment": "2–4 sentence holistic summary",
  "totalScore": 0,
  "maxScore": 13,
  "criteria": [
    { "id": "content", "name": "Content (Treść)", "score": 0, "max": 5, "comment": "detailed comment", "strengths": ["..."], "improvements": ["..."] },
    { "id": "coherence", "name": "Coherence & cohesion (Spójność i logika)", "score": 0, "max": 2, "comment": "...", "strengths": ["..."], "improvements": ["..."] },
    { "id": "range", "name": "Range (Zakres środków językowych)", "score": 0, "max": 3, "comment": "...", "strengths": ["..."], "improvements": ["..."] },
    { "id": "accuracy", "name": "Accuracy (Poprawność środków językowych)", "score": 0, "max": 3, "comment": "...", "strengths": ["..."], "improvements": ["..."] }
  ],
  "strengths": ["3–5 overall strengths"],
  "improvements": ["3–5 prioritised next steps"],
  "suggestedRewrite": "optional short improved paragraph or opening (or empty string)"
}`;

        try {
            await using agent = await Agent.create({
                apiKey,
                model: { id: 'composer-2.5' },
                local: { cwd: __dirname },
            });

            const run = await agent.send({
                text: `${prompt}\n\nReturn ONLY valid JSON. No markdown fences, no explanation.`,
                images: cleanImages,
            });
            const result = await run.wait();

            if (result.status !== 'finished' || !result.result) {
                const message = result.error?.message || 'Cursor AI assessment failed';
                return res.status(500).json({ error: message });
            }

            const parsed = extractJson(result.result);
            res.json(parsed);
        } catch (error) {
            console.error('Assess-writing error:', error);
            res.status(500).json({ error: error.message || 'Failed to assess writing' });
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

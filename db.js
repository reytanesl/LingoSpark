import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
    if (!pool) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not set');
        }
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
        });
    }
    return pool;
}

export async function initDb() {
    const db = getPool();
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            google_id TEXT UNIQUE,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            picture TEXT,
            password_hash TEXT,
            access_source TEXT,
            access_until TIMESTAMPTZ,
            bmc_supporter_email TEXT,
            bmc_membership_id TEXT,
            visit_count INTEGER NOT NULL DEFAULT 0,
            last_visit_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    // Migrations for existing installs (Google-only → Google + email/password)
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS visit_count INTEGER NOT NULL DEFAULT 0`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMPTZ`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
    await db.query(`
        DO $$ BEGIN
            ALTER TABLE users ALTER COLUMN google_id DROP NOT NULL;
        EXCEPTION WHEN others THEN NULL;
        END $$;
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS pending_bmc_payments (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            days INTEGER NOT NULL DEFAULT 7,
            membership_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pending_bmc_email ON pending_bmc_payments (LOWER(email))`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS app_stats (
            key TEXT PRIMARY KEY,
            value BIGINT NOT NULL DEFAULT 0
        );
    `);
    await db.query(`
        INSERT INTO app_stats (key, value) VALUES ('site_visits', 0)
        ON CONFLICT (key) DO NOTHING
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS session (
            sid VARCHAR NOT NULL COLLATE "default",
            sess JSON NOT NULL,
            expire TIMESTAMP(6) NOT NULL
        );
    `);
    await db.query(`
        DO $$ BEGIN
            ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid);
        EXCEPTION WHEN others THEN NULL;
        END $$;
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_page_visits (
            id SERIAL PRIMARY KEY,
            visitor_session_id TEXT NOT NULL,
            user_id INTEGER,
            page_key TEXT NOT NULL,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            duration_ms INTEGER NOT NULL DEFAULT 0,
            ended_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_analytics_page_key ON analytics_page_visits (page_key)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_analytics_started ON analytics_page_visits (started_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_analytics_visitor ON analytics_page_visits (visitor_session_id)`);

    // Word sets & progress tables
    await db.query(`
        CREATE TABLE IF NOT EXISTS word_sets (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            set_type TEXT NOT NULL DEFAULT 'vocab',
            test_direction TEXT NOT NULL DEFAULT 'def',
            item_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_word_sets_user ON word_sets (user_id)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS word_set_items (
            id SERIAL PRIMARY KEY,
            set_id INTEGER NOT NULL REFERENCES word_sets(id) ON DELETE CASCADE,
            term TEXT NOT NULL,
            definition TEXT,
            position INTEGER NOT NULL DEFAULT 0
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_word_set_items_set ON word_set_items (set_id)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS user_word_progress (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            word_set_item_id INTEGER NOT NULL REFERENCES word_set_items(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'new',
            correct_count INTEGER NOT NULL DEFAULT 0,
            wrong_count INTEGER NOT NULL DEFAULT 0,
            last_seen_at TIMESTAMPTZ,
            mastered_at TIMESTAMPTZ,
            UNIQUE(user_id, word_set_item_id)
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_uwp_user ON user_word_progress (user_id)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS user_game_sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            game_key TEXT NOT NULL,
            word_set_id INTEGER REFERENCES word_sets(id) ON DELETE SET NULL,
            score INTEGER NOT NULL DEFAULT 0,
            points_earned INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            words_total INTEGER NOT NULL DEFAULT 0,
            words_mastered INTEGER NOT NULL DEFAULT 0,
            result JSONB,
            played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ugs_user ON user_game_sessions (user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ugs_game ON user_game_sessions (user_id, game_key)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS user_game_totals (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            game_key TEXT NOT NULL,
            sessions_count INTEGER NOT NULL DEFAULT 0,
            total_points INTEGER NOT NULL DEFAULT 0,
            best_score INTEGER NOT NULL DEFAULT 0,
            last_played_at TIMESTAMPTZ,
            UNIQUE(user_id, game_key)
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ugt_user ON user_game_totals (user_id)`);

    // Matura essay reviews — text + AI feedback only (never store uploaded images/PDFs)
    await db.query(`
        CREATE TABLE IF NOT EXISTS matura_essay_reviews (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            task_text TEXT NOT NULL DEFAULT '',
            essay_text TEXT NOT NULL DEFAULT '',
            total_score INTEGER NOT NULL DEFAULT 0,
            max_score INTEGER NOT NULL DEFAULT 13,
            review JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_matura_reviews_user ON matura_essay_reviews (user_id, created_at DESC)`);
}

/** Clear BMC source when the paid period has ended (keeps access_until for history). */
export async function expireStaleAccess() {
    const db = getPool();
    await db.query(`
        UPDATE users
        SET access_source = NULL
        WHERE access_source = 'bmc'
          AND access_until IS NOT NULL
          AND access_until <= NOW()
    `);
}

export async function expireUserIfNeeded(user) {
    if (!user) return user;
    if (user.access_source !== 'bmc') return user;
    if (!user.access_until) return user;
    if (new Date(user.access_until) > new Date()) return user;

    const db = getPool();
    const result = await db.query(
        `UPDATE users SET access_source = NULL WHERE id = $1 RETURNING *`,
        [user.id]
    );
    return result.rows[0] || user;
}

export async function upsertGoogleUser(profile) {
    const db = getPool();
    const googleId = profile.id;
    const email = (profile.emails?.[0]?.value || '').toLowerCase();
    const name = profile.displayName || email;
    const picture = profile.photos?.[0]?.value || null;

    if (!email) {
        throw new Error('Google account did not provide an email');
    }

    // Existing Google account
    const byGoogle = await db.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    if (byGoogle.rows[0]) {
        const result = await db.query(
            `UPDATE users SET email = $2, name = $3, picture = $4 WHERE google_id = $1 RETURNING *`,
            [googleId, email, name, picture]
        );
        return applyPendingBmcPayments(result.rows[0]);
    }

    // Link Google to an existing email/password account
    const byEmail = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
    if (byEmail.rows[0]) {
        if (byEmail.rows[0].google_id && byEmail.rows[0].google_id !== googleId) {
            throw new Error('This email is already linked to a different Google account');
        }
        const result = await db.query(
            `UPDATE users SET google_id = $1, name = COALESCE(NULLIF($2, ''), name), picture = COALESCE($3, picture)
             WHERE id = $4 RETURNING *`,
            [googleId, name, picture, byEmail.rows[0].id]
        );
        return applyPendingBmcPayments(result.rows[0]);
    }

    const result = await db.query(
        `INSERT INTO users (google_id, email, name, picture)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [googleId, email, name, picture]
    );
    return applyPendingBmcPayments(result.rows[0]);
}

export async function createLocalUser({ email, passwordHash, name }) {
    const db = getPool();
    const normalized = (email || '').toLowerCase().trim();
    if (!normalized) throw new Error('Email is required');
    if (!passwordHash) throw new Error('Password is required');

    const result = await db.query(
        `INSERT INTO users (email, password_hash, name, google_id)
         VALUES ($1, $2, $3, NULL)
         RETURNING *`,
        [normalized, passwordHash, name || normalized.split('@')[0]]
    );
    return applyPendingBmcPayments(result.rows[0]);
}

export async function getUserByEmail(email) {
    const db = getPool();
    const normalized = (email || '').toLowerCase().trim();
    if (!normalized) return null;
    const result = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [normalized]);
    return expireUserIfNeeded(result.rows[0] || null);
}

export async function getUserById(id) {
    const db = getPool();
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = await expireUserIfNeeded(result.rows[0] || null);
    if (!user) return null;
    return applyPendingBmcPayments(user);
}

export async function listUsers() {
    await expireStaleAccess();
    const db = getPool();
    const result = await db.query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows;
}

export async function approveUser(id) {
    const db = getPool();
    const result = await db.query(
        `UPDATE users SET access_source = 'admin', access_until = NULL WHERE id = $1 RETURNING *`,
        [id]
    );
    return result.rows[0] || null;
}

export async function revokeUser(id) {
    const db = getPool();
    const result = await db.query(
        `UPDATE users SET access_source = NULL, access_until = NULL, bmc_membership_id = NULL WHERE id = $1 RETURNING *`,
        [id]
    );
    return result.rows[0] || null;
}

async function queuePendingBmcPayment(email, { membershipId = null, days = 7 } = {}) {
    const db = getPool();
    const normalized = (email || '').toLowerCase().trim();
    const grantDays = Number.isFinite(Number(days)) && Number(days) > 0 ? Number(days) : 7;
    await db.query(
        `INSERT INTO pending_bmc_payments (email, days, membership_id) VALUES ($1, $2, $3)`,
        [normalized, grantDays, membershipId]
    );
}

/** Apply any BMC payments that arrived before the user registered. */
export async function applyPendingBmcPayments(user) {
    if (!user?.email) return user;
    const db = getPool();
    const normalized = user.email.toLowerCase().trim();
    const pending = await db.query(
        `SELECT * FROM pending_bmc_payments WHERE LOWER(email) = $1 ORDER BY created_at ASC`,
        [normalized]
    );
    if (!pending.rows.length) return user;

    let current = user;
    for (const row of pending.rows) {
        current =
            (await grantBmcAccessByEmail(normalized, {
                membershipId: row.membership_id,
                days: row.days,
                skipQueue: true,
            })) || current;
    }
    await db.query(`DELETE FROM pending_bmc_payments WHERE LOWER(email) = $1`, [normalized]);
    return current;
}

export async function grantBmcAccessByEmail(email, { membershipId = null, days = 7, skipQueue = false } = {}) {
    const db = getPool();
    const normalized = (email || '').toLowerCase().trim();
    if (!normalized) return null;

    const existing = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [normalized]);
    const user = existing.rows[0];
    if (!user) {
        if (!skipQueue) {
            await queuePendingBmcPayment(normalized, { membershipId, days });
        }
        return null;
    }

    // Manual admin Approve stays as-is — BMC must not overwrite it.
    if (user.access_source === 'admin') {
        return user;
    }

    const grantDays = Number.isFinite(Number(days)) && Number(days) > 0 ? Number(days) : 7;
    const now = Date.now();
    let base = now;
    if (user.access_source === 'bmc' && user.access_until) {
        const untilMs = new Date(user.access_until).getTime();
        if (untilMs > base) base = untilMs;
    }
    const accessUntil = new Date(base + grantDays * 24 * 60 * 60 * 1000);

    const result = await db.query(
        `UPDATE users SET
            access_source = 'bmc',
            access_until = $2,
            bmc_supporter_email = $1,
            bmc_membership_id = COALESCE($3, bmc_membership_id)
         WHERE LOWER(email) = $1
         RETURNING *`,
        [normalized, accessUntil, membershipId]
    );
    return result.rows[0] || null;
}

export async function revokeBmcAccessByEmail(email) {
    const db = getPool();
    const normalized = (email || '').toLowerCase().trim();
    const result = await db.query(
        `UPDATE users SET
            access_source = CASE WHEN access_source = 'admin' THEN 'admin' ELSE NULL END,
            access_until = CASE WHEN access_source = 'admin' THEN access_until ELSE NULL END,
            bmc_membership_id = CASE WHEN access_source = 'admin' THEN bmc_membership_id ELSE NULL END
         WHERE LOWER(email) = $1
         RETURNING *`,
        [normalized]
    );
    // Also clear pending grants on refund
    await db.query(`DELETE FROM pending_bmc_payments WHERE LOWER(email) = $1`, [normalized]);
    return result.rows[0] || null;
}

export function hasWritingAccess(user) {
    if (!user) return false;
    if (user.access_source === 'admin') return true;
    if (user.access_source === 'bmc') {
        if (!user.access_until) return false; // timed BMC only — no open-ended BMC
        return new Date(user.access_until) > new Date();
    }
    return false;
}

/** active | expired | inactive */
export function getAccessStatus(user) {
    if (!user) return 'inactive';
    if (hasWritingAccess(user)) return 'active';
    if (user.access_until && new Date(user.access_until) <= new Date()) {
        return 'expired';
    }
    return 'inactive';
}

export async function recordSiteVisit() {
    const db = getPool();
    const result = await db.query(
        `UPDATE app_stats SET value = value + 1 WHERE key = 'site_visits' RETURNING value`
    );
    return Number(result.rows[0]?.value || 0);
}

export async function recordUserVisit(userId) {
    if (!userId) return null;
    const db = getPool();
    const result = await db.query(
        `UPDATE users
         SET visit_count = COALESCE(visit_count, 0) + 1,
             last_visit_at = NOW()
         WHERE id = $1
         RETURNING visit_count, last_visit_at`,
        [userId]
    );
    return result.rows[0] || null;
}

export async function getSiteVisitCount() {
    const db = getPool();
    const result = await db.query(`SELECT value FROM app_stats WHERE key = 'site_visits'`);
    return Number(result.rows[0]?.value || 0);
}

export function isAdminEmail(email) {
    const admin = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    if (!admin || !email) return false;
    return email.toLowerCase().trim() === admin;
}

export function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        hasPassword: Boolean(user.password_hash),
        hasGoogle: Boolean(user.google_id),
        accessSource: user.access_source,
        accessUntil: user.access_until,
        visitCount: Number(user.visit_count || 0),
        lastVisitAt: user.last_visit_at || null,
        status: getAccessStatus(user),
    };
}

/** Allowed analytics page keys (screens + home sections). */
export const ANALYTICS_PAGE_KEYS = new Set([
    'home',
    'setup',
    'flashcard',
    'bomb',
    'grid',
    'frank',
    'trans',
    'devil',
    'bloat',
    'vocab',
    'odyssey',
    'mission',
    'pe-boring',
    'pe-detail',
    'pe-link',
    'pe-exam',
    'section:cat-vocab',
    'section:cat-team',
    'section:cat-writing',
    'section:primary-english',
]);

const SETUP_PREFIX = 'setup:';

export function normalizeAnalyticsPageKey(raw) {
    const key = String(raw || '').trim().toLowerCase();
    if (!key || key.length > 64) return null;
    if (ANALYTICS_PAGE_KEYS.has(key)) return key;
    if (key.startsWith(SETUP_PREFIX)) {
        const game = key.slice(SETUP_PREFIX.length);
        if (ANALYTICS_PAGE_KEYS.has(game) && game !== 'home' && game !== 'setup' && !game.startsWith('section:')) {
            return `${SETUP_PREFIX}${game}`;
        }
    }
    return null;
}

export async function startAnalyticsVisit({ visitorSessionId, userId = null, pageKey }) {
    const page = normalizeAnalyticsPageKey(pageKey);
    const sid = String(visitorSessionId || '').trim().slice(0, 80);
    if (!page || !sid) return null;

    const db = getPool();
    const result = await db.query(
        `INSERT INTO analytics_page_visits (visitor_session_id, user_id, page_key)
         VALUES ($1, $2, $3)
         RETURNING id, page_key, started_at, duration_ms`,
        [sid, userId || null, page]
    );
    return result.rows[0] || null;
}

export async function updateAnalyticsDwell({ visitId, visitorSessionId, durationMs }) {
    const id = Number(visitId);
    const sid = String(visitorSessionId || '').trim().slice(0, 80);
    const ms = Math.max(0, Math.min(Number(durationMs) || 0, 24 * 60 * 60 * 1000));
    if (!Number.isFinite(id) || id <= 0 || !sid) return null;

    const db = getPool();
    const result = await db.query(
        `UPDATE analytics_page_visits
         SET duration_ms = GREATEST(duration_ms, $3),
             updated_at = NOW()
         WHERE id = $1 AND visitor_session_id = $2
         RETURNING id, page_key, duration_ms`,
        [id, sid, ms]
    );
    return result.rows[0] || null;
}

export async function endAnalyticsVisit({ visitId, visitorSessionId, durationMs }) {
    const id = Number(visitId);
    const sid = String(visitorSessionId || '').trim().slice(0, 80);
    const ms = Math.max(0, Math.min(Number(durationMs) || 0, 24 * 60 * 60 * 1000));
    if (!Number.isFinite(id) || id <= 0 || !sid) return null;

    const db = getPool();
    const result = await db.query(
        `UPDATE analytics_page_visits
         SET duration_ms = GREATEST(duration_ms, $3),
             ended_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND visitor_session_id = $2
         RETURNING id, page_key, duration_ms, ended_at`,
        [id, sid, ms]
    );
    return result.rows[0] || null;
}

// ==========================================
// WORD SETS CRUD
// ==========================================

export async function createWordSet(userId, { name, setType = 'vocab', testDirection = 'def', items = [] }) {
    const db = getPool();
    const trimName = (name || '').trim().slice(0, 80);
    if (!trimName) throw new Error('Set name is required');
    if (items.length > 500) throw new Error('Max 500 items per set');

    const setResult = await db.query(
        `INSERT INTO word_sets (user_id, name, set_type, test_direction, item_count)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [userId, trimName, setType === 'pe_terms' ? 'pe_terms' : 'vocab', testDirection === 'term' ? 'term' : 'def', items.length]
    );
    const ws = setResult.rows[0];

    for (let i = 0; i < items.length; i++) {
        const term = (items[i].term || '').trim().slice(0, 200);
        const def = (items[i].definition || items[i].def || '').trim().slice(0, 500) || null;
        if (!term) continue;
        await db.query(
            `INSERT INTO word_set_items (set_id, term, definition, position) VALUES ($1, $2, $3, $4)`,
            [ws.id, term, def, i]
        );
    }
    return ws;
}

export async function listWordSets(userId) {
    const db = getPool();
    const result = await db.query(
        `SELECT ws.*,
            COALESCE(
                (SELECT COUNT(*) FILTER (WHERE uwp.status = 'mastered')
                 FROM word_set_items wsi
                 LEFT JOIN user_word_progress uwp ON uwp.word_set_item_id = wsi.id AND uwp.user_id = ws.user_id
                 WHERE wsi.set_id = ws.id), 0
            )::int AS mastered_count
         FROM word_sets ws
         WHERE ws.user_id = $1
         ORDER BY ws.updated_at DESC`,
        [userId]
    );
    return result.rows;
}

export async function getWordSet(setId, userId) {
    const db = getPool();
    const setResult = await db.query('SELECT * FROM word_sets WHERE id = $1 AND user_id = $2', [setId, userId]);
    const ws = setResult.rows[0];
    if (!ws) return null;

    const itemsResult = await db.query(
        `SELECT wsi.*, uwp.status AS progress_status, uwp.correct_count, uwp.wrong_count, uwp.mastered_at
         FROM word_set_items wsi
         LEFT JOIN user_word_progress uwp ON uwp.word_set_item_id = wsi.id AND uwp.user_id = $2
         WHERE wsi.set_id = $1
         ORDER BY wsi.position`,
        [setId, userId]
    );
    return { ...ws, items: itemsResult.rows };
}

export async function updateWordSet(setId, userId, { name, testDirection, items }) {
    const db = getPool();
    const existing = await db.query('SELECT * FROM word_sets WHERE id = $1 AND user_id = $2', [setId, userId]);
    if (!existing.rows[0]) return null;

    const updates = [];
    const vals = [];
    let idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx++}`); vals.push((name || '').trim().slice(0, 80)); }
    if (testDirection !== undefined) { updates.push(`test_direction = $${idx++}`); vals.push(testDirection === 'term' ? 'term' : 'def'); }

    if (items !== undefined) {
        if (items.length > 500) throw new Error('Max 500 items per set');
        await db.query('DELETE FROM word_set_items WHERE set_id = $1', [setId]);
        for (let i = 0; i < items.length; i++) {
            const term = (items[i].term || '').trim().slice(0, 200);
            const def = (items[i].definition || items[i].def || '').trim().slice(0, 500) || null;
            if (!term) continue;
            await db.query(
                `INSERT INTO word_set_items (set_id, term, definition, position) VALUES ($1, $2, $3, $4)`,
                [setId, term, def, i]
            );
        }
        updates.push(`item_count = $${idx++}`);
        vals.push(items.length);
    }

    updates.push(`updated_at = NOW()`);
    vals.push(setId, userId);
    const result = await db.query(
        `UPDATE word_sets SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
        vals
    );
    return result.rows[0] || null;
}

export async function deleteWordSet(setId, userId) {
    const db = getPool();
    const result = await db.query('DELETE FROM word_sets WHERE id = $1 AND user_id = $2 RETURNING id', [setId, userId]);
    return result.rowCount > 0;
}

export async function loadWordSetForGame(setId, userId) {
    const db = getPool();
    const ws = await db.query('SELECT * FROM word_sets WHERE id = $1 AND user_id = $2', [setId, userId]);
    if (!ws.rows[0]) return null;
    const items = await db.query(
        'SELECT term, definition FROM word_set_items WHERE set_id = $1 ORDER BY position', [setId]
    );
    return { set: ws.rows[0], items: items.rows };
}

// ==========================================
// GAME PROGRESS
// ==========================================

const VALID_GAME_KEYS = new Set([
    'flashcards', 'bomb', 'grid', 'odyssey', 'mission', 'auction',
    'pe_boring', 'pe_detail', 'pe_link', 'pe_exam',
    'frank', 'trans', 'devil', 'bloat', 'vocab_upgrade', 'matura',
]);

export async function recordGameSession(userId, { gameKey, wordSetId, score = 0, pointsEarned = 0, durationMs = 0, wordsTotal = 0, wordsMastered = 0, result = null }) {
    if (!VALID_GAME_KEYS.has(gameKey)) throw new Error('Invalid game key');
    const db = getPool();

    await db.query(
        `INSERT INTO user_game_sessions (user_id, game_key, word_set_id, score, points_earned, duration_ms, words_total, words_mastered, result)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, gameKey, wordSetId || null, score, pointsEarned, Math.min(durationMs, 86400000), wordsTotal, wordsMastered, result ? JSON.stringify(result) : null]
    );

    await db.query(
        `INSERT INTO user_game_totals (user_id, game_key, sessions_count, total_points, best_score, last_played_at)
         VALUES ($1, $2, 1, $3, $4, NOW())
         ON CONFLICT (user_id, game_key)
         DO UPDATE SET
            sessions_count = user_game_totals.sessions_count + 1,
            total_points = user_game_totals.total_points + EXCLUDED.total_points,
            best_score = GREATEST(user_game_totals.best_score, EXCLUDED.best_score),
            last_played_at = NOW()`,
        [userId, gameKey, pointsEarned, score]
    );
}

export async function updateWordProgress(userId, updates) {
    const db = getPool();
    for (const u of updates) {
        const { wordSetItemId, correct } = u;
        if (!wordSetItemId) continue;
        const status = correct ? 'mastered' : 'learning';
        await db.query(
            `INSERT INTO user_word_progress (user_id, word_set_item_id, status, correct_count, wrong_count, last_seen_at, mastered_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), $6)
             ON CONFLICT (user_id, word_set_item_id)
             DO UPDATE SET
                status = CASE WHEN $7 THEN 'mastered' ELSE
                    CASE WHEN user_word_progress.status = 'mastered' THEN 'mastered' ELSE 'learning' END
                END,
                correct_count = user_word_progress.correct_count + $4,
                wrong_count = user_word_progress.wrong_count + $5,
                last_seen_at = NOW(),
                mastered_at = CASE WHEN $7 AND user_word_progress.mastered_at IS NULL THEN NOW() ELSE user_word_progress.mastered_at END`,
            [userId, wordSetItemId, status, correct ? 1 : 0, correct ? 0 : 1, correct ? new Date() : null, correct]
        );
    }
}

export async function getProgressSummary(userId) {
    const db = getPool();
    const totals = await db.query(
        `SELECT game_key, sessions_count, total_points, best_score, last_played_at
         FROM user_game_totals WHERE user_id = $1 ORDER BY last_played_at DESC`, [userId]
    );
    const sets = await db.query(
        `SELECT ws.id, ws.name, ws.item_count, ws.set_type,
            COUNT(uwp.id) FILTER (WHERE uwp.status = 'mastered')::int AS mastered,
            COUNT(uwp.id) FILTER (WHERE uwp.status = 'learning')::int AS learning
         FROM word_sets ws
         LEFT JOIN word_set_items wsi ON wsi.set_id = ws.id
         LEFT JOIN user_word_progress uwp ON uwp.word_set_item_id = wsi.id AND uwp.user_id = $1
         WHERE ws.user_id = $1
         GROUP BY ws.id ORDER BY ws.updated_at DESC`, [userId]
    );
    const recentSessions = await db.query(
        `SELECT game_key, score, points_earned, played_at
         FROM user_game_sessions WHERE user_id = $1
         ORDER BY played_at DESC LIMIT 20`, [userId]
    );
    const maturaProgress = await getMaturaProgressSummary(userId);
    return {
        gameTotals: totals.rows,
        wordSets: sets.rows,
        recentSessions: recentSessions.rows,
        maturaProgress,
    };
}

/** Strip anything that looks like file/binary payload before persisting a Matura review. */
export function sanitizeMaturaReviewPayload(raw = {}) {
    const review = raw.review && typeof raw.review === 'object' ? raw.review : raw;
    const clean = {
        totalScore: Number(review.totalScore ?? raw.totalScore ?? 0) || 0,
        maxScore: Number(review.maxScore ?? raw.maxScore ?? 13) || 13,
        overallComment: review.overallComment ?? null,
        criteria: Array.isArray(review.criteria) ? review.criteria : [],
        strengths: review.strengths ?? [],
        improvements: review.improvements ?? [],
        markedTranscript: typeof review.markedTranscript === 'string' ? review.markedTranscript : '',
        transcribedEssay: typeof review.transcribedEssay === 'string'
            ? review.transcribedEssay
            : (typeof raw.essayText === 'string' ? raw.essayText : ''),
    };
    // Hard reject any accidental image/data-url fields
    delete clean.images;
    delete clean.image;
    delete clean.pdf;
    delete clean.files;
    delete clean.dataUrl;
    return clean;
}

export async function saveMaturaEssayReview(userId, { taskText = '', essayText = '', totalScore = 0, maxScore = 13, review }) {
    const db = getPool();
    const cleanReview = sanitizeMaturaReviewPayload({ ...review, totalScore, maxScore, essayText });
    const score = Number(cleanReview.totalScore) || 0;
    const max = Number(cleanReview.maxScore) || 13;
    const task = String(taskText || '').slice(0, 20000);
    const essay = String(essayText || cleanReview.transcribedEssay || '').slice(0, 100000);

    const result = await db.query(
        `INSERT INTO matura_essay_reviews (user_id, task_text, essay_text, total_score, max_score, review)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id, total_score, max_score, created_at`,
        [userId, task, essay, score, max, JSON.stringify(cleanReview)]
    );
    return result.rows[0];
}

export async function listMaturaEssayReviews(userId, { limit = 50 } = {}) {
    const db = getPool();
    const lim = Math.max(1, Math.min(Number(limit) || 50, 100));
    const result = await db.query(
        `SELECT id, total_score, max_score, created_at,
                LEFT(task_text, 160) AS task_preview,
                LEFT(essay_text, 120) AS essay_preview
         FROM matura_essay_reviews
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, lim]
    );
    return result.rows;
}

export async function getMaturaEssayReview(userId, reviewId) {
    const db = getPool();
    const result = await db.query(
        `SELECT id, task_text, essay_text, total_score, max_score, review, created_at
         FROM matura_essay_reviews
         WHERE user_id = $1 AND id = $2`,
        [userId, reviewId]
    );
    return result.rows[0] || null;
}

export async function deleteMaturaEssayReview(userId, reviewId) {
    const db = getPool();
    const result = await db.query(
        `DELETE FROM matura_essay_reviews WHERE user_id = $1 AND id = $2 RETURNING id`,
        [userId, reviewId]
    );
    return result.rows[0] || null;
}

export async function getMaturaProgressSummary(userId) {
    const db = getPool();
    const series = await db.query(
        `SELECT id, total_score, max_score, created_at
         FROM matura_essay_reviews
         WHERE user_id = $1
         ORDER BY created_at ASC
         LIMIT 100`,
        [userId]
    );
    const rows = series.rows;
    if (!rows.length) {
        return { count: 0, bestScore: 0, averageScore: 0, latestScore: null, previousScore: null, delta: null, series: [] };
    }
    const scores = rows.map(r => Number(r.total_score) || 0);
    const bestScore = Math.max(...scores);
    const averageScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    const latestScore = scores[scores.length - 1];
    const previousScore = scores.length > 1 ? scores[scores.length - 2] : null;
    const delta = previousScore == null ? null : latestScore - previousScore;
    return {
        count: rows.length,
        bestScore,
        averageScore,
        latestScore,
        previousScore,
        delta,
        series: rows.map(r => ({
            id: r.id,
            score: Number(r.total_score) || 0,
            maxScore: Number(r.max_score) || 13,
            createdAt: r.created_at,
        })),
    };
}

export async function getGamePopularityStats({ days = 30 } = {}) {
    const db = getPool();
    const windowDays = Math.max(1, Math.min(Number(days) || 30, 365));

    const result = await db.query(
        `SELECT
            page_key,
            COUNT(*)::int AS visits,
            COUNT(DISTINCT visitor_session_id)::int AS unique_visitors,
            COUNT(*) FILTER (WHERE user_id IS NOT NULL)::int AS logged_in_visits,
            COUNT(*) FILTER (WHERE user_id IS NULL)::int AS anonymous_visits,
            COALESCE(SUM(duration_ms), 0)::bigint AS total_dwell_ms,
            COALESCE(AVG(duration_ms), 0)::float AS avg_dwell_ms,
            COALESCE(MAX(duration_ms), 0)::int AS max_dwell_ms,
            MAX(started_at) AS last_visit_at
         FROM analytics_page_visits
         WHERE started_at >= NOW() - make_interval(days => $1::int)
         GROUP BY page_key
         ORDER BY visits DESC, total_dwell_ms DESC`,
        [windowDays]
    );

    const totalsResult = await db.query(
        `SELECT
            COUNT(*)::int AS visits,
            COUNT(DISTINCT visitor_session_id)::int AS unique_visitors,
            COUNT(*) FILTER (WHERE user_id IS NOT NULL)::int AS logged_in_visits,
            COUNT(*) FILTER (WHERE user_id IS NULL)::int AS anonymous_visits,
            COALESCE(SUM(duration_ms), 0)::bigint AS total_dwell_ms
         FROM analytics_page_visits
         WHERE started_at >= NOW() - make_interval(days => $1::int)`,
        [windowDays]
    );

    return {
        days: windowDays,
        totals: totalsResult.rows[0] || {
            visits: 0,
            unique_visitors: 0,
            logged_in_visits: 0,
            anonymous_visits: 0,
            total_dwell_ms: 0,
        },
        pages: result.rows,
    };
}

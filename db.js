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

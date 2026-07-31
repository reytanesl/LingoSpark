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
            google_id TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            picture TEXT,
            access_source TEXT,
            access_until TIMESTAMPTZ,
            bmc_supporter_email TEXT,
            bmc_membership_id TEXT,
            visit_count INTEGER NOT NULL DEFAULT 0,
            last_visit_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS visit_count INTEGER NOT NULL DEFAULT 0`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMPTZ`);
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

    const result = await db.query(
        `INSERT INTO users (google_id, email, name, picture)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (google_id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            picture = EXCLUDED.picture
         RETURNING *`,
        [googleId, email, name, picture]
    );
    return result.rows[0];
}

export async function getUserById(id) {
    const db = getPool();
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    return expireUserIfNeeded(result.rows[0] || null);
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

export async function grantBmcAccessByEmail(email, { membershipId = null, days = 7 } = {}) {
    const db = getPool();
    const normalized = (email || '').toLowerCase().trim();
    if (!normalized) return null;

    const existing = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [normalized]);
    const user = existing.rows[0];
    if (!user) return null;

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
        accessSource: user.access_source,
        accessUntil: user.access_until,
        visitCount: Number(user.visit_count || 0),
        lastVisitAt: user.last_visit_at || null,
        status: getAccessStatus(user),
    };
}

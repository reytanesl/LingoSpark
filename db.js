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
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
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
    return result.rows[0] || null;
}

export async function listUsers() {
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

export async function grantBmcAccessByEmail(email, { membershipId = null, days = null } = {}) {
    const db = getPool();
    const normalized = (email || '').toLowerCase().trim();
    if (!normalized) return null;

    const accessUntil = days
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        : null;

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
        if (!user.access_until) return true;
        return new Date(user.access_until) > new Date();
    }
    if (user.access_until && new Date(user.access_until) > new Date()) return true;
    return false;
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
    };
}

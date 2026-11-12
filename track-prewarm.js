/* On-demand background generation for Track (server-side only; imported by server.js and the tests).
   AI is spent ONLY for words a learner is actually about to use: when the app opens a set and the learner picks a
   question level, track-generate (mode "warmup") or POST /api/study/track-prewarm puts the set's terms into a small
   Postgres queue, and a worker fills the question bank for them (every task type of that level), so the next stations
   are bank hits by the time the warm-up station is finished. There is NO global walk over all word sets.

     - queue    : Postgres table `track_prewarm_queue` (one row per term+level, FIFO, resumable after a restart) and
                  `track_prewarm_budget` (AI calls spent per UTC day). Memory implementation for tests / no-DB mode.
     - worker   : createPrewarmWorker() claims a batch of same-level terms, asks generator.prewarm() to fill every missing
                  task type, records the AI calls against the daily safety cap, and yields to cold foreground requests.
     - endpoint : POST /api/study/track-prewarm (same auth as track-generate) enqueues terms and answers 202.
   Env: TRACK_PREWARM=off (kill switch for the background jobs), TRACK_PREWARM_DAILY_CALLS (safety cap, default 1500),
        TRACK_PREWARM_CONCURRENCY (8), TRACK_PREWARM_TERMS_PER_RUN (8), TRACK_PREWARM_CALL_WEIGHT (1000). */
import {
    typesForLevel, termKeyOf, validateTrackRequest, verifyBridgeRequest, createNonceStore,
} from './track-ai.js';

export const PREWARM_PATH = '/api/study/track-prewarm';
export const PREWARM_BODY_LIMIT = 64 * 1024;

export function readPrewarmConfig(env = process.env) {
    const num = (v, d, min = 0, max = Infinity) => { const n = Number(v); return Number.isFinite(n) && n >= min ? Math.min(Math.floor(n), max) : d; };
    const off = String(env.TRACK_PREWARM || '').trim().toLowerCase() === 'off';
    return {
        enabled: !off && Boolean(env.CURSOR_API_KEY),
        killSwitch: off,
        dailyCalls: num(env.TRACK_PREWARM_DAILY_CALLS, 1500, 0), // safety cap on background AI calls per UTC day
        concurrency: num(env.TRACK_PREWARM_CONCURRENCY, 8, 1, 12), // parallel AI calls of one batch (small calls: the learner is waiting for the next stations)
        termsPerRun: num(env.TRACK_PREWARM_TERMS_PER_RUN, 8, 1, 40),
        callWeight: num(env.TRACK_PREWARM_CALL_WEIGHT, 1000, 300, 6000), // ~1 term per call
        maxAttempts: 3,
        backoffMs: 5 * 60_000, // after a partial attempt: attempt n waits n * 5 min
        retryFailedMs: 24 * 3600_000, // a term that stayed incomplete after maxAttempts is tried again after a day
        rebumpFailedMs: 6 * 3600_000, // ...unless a learner asks for it again (not sooner than 6 h after the failure)
        leaseMs: 10 * 60_000,
        idleMs: 60_000, busyYieldMs: 3_000, cappedMs: 10 * 60_000, offMs: 60_000, aiErrorMs: 2 * 60_000, betweenRunsMs: 200,
    };
}

// ---------------------------------------------------------------- stores

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/** In-memory queue (tests / no database). Same behaviour as the Postgres store. */
export function createMemoryPrewarmStore({ now = () => Date.now() } = {}) {
    const rows = new Map();
    const budget = new Map();
    let seq = 0;
    const key = (r) => `${r.level}|${r.termKey}`;
    const eligible = (r, t) => ((r.status === 'pending' || r.status === 'failed') && r.nextTryAt <= t) || (r.status === 'running' && r.leaseUntil < t);
    return {
        rows,
        async ensure() {},
        /** Adds new rows (FIFO in the given order). A finished row is re-opened; a recently failed one is not. Returns rows added or re-opened. */
        async enqueue(list, { rebumpMs = 6 * 3600_000 } = {}) {
            const t = now(); let n = 0;
            for (const r of list) {
                const cur = rows.get(key(r));
                if (!cur) { rows.set(key(r), { termKey: r.termKey, en: r.en, pl: r.pl, level: r.level, status: 'pending', attempts: 0, seq: ++seq, nextTryAt: t, leaseUntil: 0, updatedAt: t, note: '' }); n++; continue; }
                if (cur.status === 'done' || (cur.status === 'failed' && t - cur.updatedAt > rebumpMs)) { cur.status = 'pending'; cur.attempts = 0; cur.nextTryAt = t; cur.seq = ++seq; cur.updatedAt = t; n++; }
            }
            return n;
        },
        async claim({ limit, leaseMs }) {
            const t = now();
            const cands = [...rows.values()].filter((r) => eligible(r, t)).sort((a, b) => a.seq - b.seq);
            if (!cands.length) return [];
            const picked = cands.filter((r) => r.level === cands[0].level).slice(0, limit);
            for (const r of picked) { r.status = 'running'; r.leaseUntil = t + leaseMs; r.updatedAt = t; }
            return picked.map((r) => ({ termKey: r.termKey, en: r.en, pl: r.pl, level: r.level, attempts: r.attempts }));
        },
        async release(list) { for (const r of list) { const cur = rows.get(key(r)); if (cur && cur.status === 'running') { cur.status = 'pending'; cur.updatedAt = now(); } } },
        async finish(r, { status, nextTryMs = 0, note = '' }) {
            const cur = rows.get(key(r)); if (!cur) return;
            cur.status = status; cur.nextTryAt = now() + nextTryMs; cur.note = note; cur.updatedAt = now();
            cur.attempts = status === 'done' ? 0 : r.attempts + 1;
        },
        async addCalls(n) { if (n > 0) budget.set(dayKey(now()), (budget.get(dayKey(now())) || 0) + n); },
        async callsToday() { return budget.get(dayKey(now())) || 0; },
        async counts() {
            const c = { pending: 0, running: 0, done: 0, failed: 0 };
            for (const r of rows.values()) c[r.status]++;
            return { ...c, callsToday: budget.get(dayKey(now())) || 0 };
        },
    };
}

/** Postgres queue: resumable across restarts (a crashed `running` row is reclaimed when its lease expires). */
export function createPgPrewarmStore({ getPool } = {}) {
    let ready = null;
    const q = (sql, params) => getPool().query(sql, params);
    const ensure = () => (ready ||= (async () => {
        await q(`CREATE TABLE IF NOT EXISTS track_prewarm_queue (
            term_key TEXT NOT NULL, level TEXT NOT NULL, en TEXT NOT NULL, pl TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
            seq BIGSERIAL, next_try_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), lease_until TIMESTAMPTZ,
            note TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (term_key, level))`);
        await q('CREATE INDEX IF NOT EXISTS track_prewarm_queue_pick ON track_prewarm_queue (status, seq)');
        await q(`CREATE TABLE IF NOT EXISTS track_prewarm_budget (day DATE PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0)`);
    })().catch((e) => { ready = null; throw e; }));
    const ELIG = (a) => `((${a}status IN ('pending','failed') AND ${a}next_try_at <= NOW()) OR (${a}status = 'running' AND ${a}lease_until < NOW()))`;
    return {
        ensure,
        async enqueue(list, { rebumpMs = 6 * 3600_000 } = {}) {
            await ensure();
            let n = 0;
            for (let i = 0; i < list.length; i += 400) {
                const part = list.slice(i, i + 400);
                const reopen = `(track_prewarm_queue.status = 'done' OR (track_prewarm_queue.status = 'failed' AND track_prewarm_queue.updated_at < NOW() - make_interval(secs => $5::double precision / 1000)))`;
                const r = await q(`
                    INSERT INTO track_prewarm_queue (term_key, en, pl, level)
                    SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
                    ON CONFLICT (term_key, level) DO UPDATE SET
                        status = 'pending', attempts = 0, next_try_at = NOW(), updated_at = NOW(),
                        seq = nextval(pg_get_serial_sequence('track_prewarm_queue','seq'))
                    WHERE ${reopen}
                    RETURNING true AS changed`,
                [part.map((r) => r.termKey), part.map((r) => r.en), part.map((r) => r.pl), part.map((r) => r.level), rebumpMs]);
                n += r.rows.length;
            }
            return n;
        },
        async claim({ limit, leaseMs }) {
            await ensure();
            const r = await q(`
                WITH head AS (SELECT level FROM track_prewarm_queue WHERE ${ELIG('')} ORDER BY seq LIMIT 1),
                picked AS (
                    SELECT t.term_key, t.level FROM track_prewarm_queue t, head
                    WHERE t.level = head.level AND ${ELIG('t.')}
                    ORDER BY t.seq LIMIT $1 FOR UPDATE OF t SKIP LOCKED)
                UPDATE track_prewarm_queue u SET status = 'running', lease_until = NOW() + make_interval(secs => $2::double precision / 1000), updated_at = NOW()
                FROM picked WHERE u.term_key = picked.term_key AND u.level = picked.level
                RETURNING u.term_key, u.en, u.pl, u.level, u.attempts, u.seq`, [limit, leaseMs]);
            return r.rows.sort((a, b) => Number(a.seq) - Number(b.seq)).map((x) => ({ termKey: x.term_key, en: x.en, pl: x.pl, level: x.level, attempts: x.attempts }));
        },
        async release(list) {
            if (!list.length) return;
            await q(`UPDATE track_prewarm_queue SET status = 'pending', updated_at = NOW() WHERE status = 'running' AND (term_key, level) IN (SELECT * FROM unnest($1::text[], $2::text[]))`, [list.map((r) => r.termKey), list.map((r) => r.level)]);
        },
        async finish(r, { status, nextTryMs = 0, note = '' }) {
            await q(`UPDATE track_prewarm_queue SET status = $3, attempts = CASE WHEN $3 = 'done' THEN 0 ELSE $4 END,
                        next_try_at = NOW() + make_interval(secs => $5::double precision / 1000), lease_until = NULL, note = $6, updated_at = NOW()
                     WHERE term_key = $1 AND level = $2`, [r.termKey, r.level, status, r.attempts + 1, nextTryMs, String(note).slice(0, 300)]);
        },
        async addCalls(n) {
            if (!(n > 0)) return;
            await ensure();
            await q(`INSERT INTO track_prewarm_budget (day, calls) VALUES ((NOW() AT TIME ZONE 'UTC')::date, $1)
                     ON CONFLICT (day) DO UPDATE SET calls = track_prewarm_budget.calls + EXCLUDED.calls`, [Math.floor(n)]);
        },
        async callsToday() {
            await ensure();
            const r = await q(`SELECT calls FROM track_prewarm_budget WHERE day = (NOW() AT TIME ZONE 'UTC')::date`);
            return r.rows[0]?.calls || 0;
        },
        async counts() {
            await ensure();
            const r = await q(`SELECT status, count(*)::int AS n FROM track_prewarm_queue GROUP BY status`);
            const c = { pending: 0, running: 0, done: 0, failed: 0 };
            for (const x of r.rows) c[x.status] = x.n;
            return { ...c, callsToday: await this.callsToday() };
        },
    };
}

// ---------------------------------------------------------------- worker

/**
 * createPrewarmWorker({ store, generate, config, log }) -> { start, stop, kick, tick, enqueueTerms }.
 * `generate` is the track generator (needs .prewarm and .stats). `config` is a function (read each tick, so the
 * TRACK_PREWARM kill switch and cap are honoured without code changes) or an object.
 */
export function createPrewarmWorker({ store, generate, config = readPrewarmConfig, log = () => {}, now = () => Date.now() }) {
    const cfgOf = () => (typeof config === 'function' ? config() : config);
    let running = false;
    let wake = null;
    const sleep = (ms) => new Promise((resolve) => { const t = setTimeout(() => { wake = null; resolve(); }, ms); t.unref?.(); wake = () => { clearTimeout(t); wake = null; resolve(); }; });

    /** Terms a learner is about to use (set opened + level picked, or gaps found while serving): queue them, in set order. */
    async function enqueueTerms({ level, terms }) {
        const cfg = cfgOf();
        const seen = new Set();
        const rows = [];
        for (const t of terms) {
            const termKey = termKeyOf(t);
            if (seen.has(termKey)) continue;
            seen.add(termKey);
            rows.push({ termKey, en: t.en, pl: t.pl, level });
        }
        const changed = await store.enqueue(rows, { rebumpMs: cfg.rebumpFailedMs });
        if (rows.length) wake?.();
        return { queued: rows.length, changed };
    }

    async function tick() {
        const cfg = cfgOf();
        if (!cfg.enabled) return { state: 'off' };
        if (generate.stats().fgActive > 0) return { state: 'yield' };
        const used = await store.callsToday();
        if (used >= cfg.dailyCalls) return { state: 'capped', used };
        const rows = await store.claim({ limit: cfg.termsPerRun, leaseMs: cfg.leaseMs });
        if (!rows.length) return { state: 'idle' };
        const level = rows[0].level;
        const terms = rows.map((r, i) => ({ id: String(i + 1), en: r.en, pl: r.pl }));
        let res;
        try {
            res = await generate.prewarm({ level, terms, concurrency: cfg.concurrency, callWeight: cfg.callWeight });
        } catch (e) {
            log(`run crashed: ${e?.message || e}`);
            for (const r of rows) await store.finish(r, { status: 'pending', nextTryMs: cfg.backoffMs, note: `crashed: ${String(e?.message || e).slice(0, 120)}` }).catch(() => {});
            return { state: 'ai_errors' };
        }
        await store.addCalls(res.aiCalls).catch((e) => log(`budget write failed: ${e?.message}`));
        let done = 0; let partial = 0;
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const miss = res.missing[String(i + 1)];
            if (!miss) { done++; await store.finish(r, { status: 'done' }); continue; }
            partial++;
            const attempts = r.attempts + 1;
            const note = `missing ${miss.join(',')}`;
            if (attempts >= cfg.maxAttempts) await store.finish(r, { status: 'failed', nextTryMs: cfg.retryFailedMs, note });
            else await store.finish(r, { status: 'pending', nextTryMs: cfg.backoffMs * attempts, note });
        }
        const counts = await store.counts().catch(() => null);
        log(`${level}: ${done}/${rows.length} terms complete${partial ? `, ${partial} partial` : ''}, ${res.aiCalls} AI calls (today ${used + res.aiCalls}/${cfg.dailyCalls})${counts ? `, queue pending ${counts.pending} done ${counts.done} failed ${counts.failed}` : ''}`);
        if (res.aiCalls > 0 && res.aiErrors >= res.aiCalls) return { state: 'ai_errors', res };
        return { state: 'work', res };
    }

    async function loop() {
        while (running) {
            let r;
            try { r = await tick(); } catch (e) { log(`tick failed: ${e?.message || e}`); r = { state: 'ai_errors' }; }
            const cfg = cfgOf();
            const wait = { work: cfg.betweenRunsMs, yield: cfg.busyYieldMs, idle: cfg.idleMs, capped: cfg.cappedMs, off: cfg.offMs, ai_errors: cfg.aiErrorMs }[r.state] ?? cfg.idleMs;
            await sleep(wait);
        }
    }

    return {
        tick, enqueueTerms, loop,
        start() {
            if (running) return;
            running = true;
            const cfg = cfgOf();
            log(`worker started (${cfg.killSwitch ? 'OFF by TRACK_PREWARM=off' : cfg.enabled ? 'on, on-demand only' : 'off: no CURSOR_API_KEY'}; safety cap ${cfg.dailyCalls} AI calls/day)`);
            loop();
        },
        stop() { running = false; wake?.(); },
        kick() { wake?.(); },
    };
}

// ---------------------------------------------------------------- HTTP: POST /api/study/track-prewarm

function createWindowLimiter({ max, windowMs, now = () => Date.now() }) {
    const hits = new Map();
    return {
        check(key) {
            const t = now();
            const list = (hits.get(key) || []).filter((x) => t - x < windowMs);
            if (list.length >= max) { hits.set(key, list); return { ok: false, retryAfterSec: Math.ceil((windowMs - (t - list[0])) / 1000) }; }
            list.push(t); hits.set(key, list);
            if (hits.size > 5000) for (const k of hits.keys()) { hits.delete(k); if (hits.size <= 4000) break; }
            return { ok: true };
        },
    };
}

/**
 * Same auth as track-generate (signed bridge headers, or a study session). Body: { terms:[{id,en,pl}], level, setId?, userRef? }.
 * Enqueues the terms that are not fully banked (in the given order) and answers 202 straight away. For sets larger than
 * the 40 terms track-generate accepts, use this for the terms after the first 40.
 */
export function createTrackPrewarmHandler({
    generate, worker, store = null, isConfigured = () => true, getConfig = readPrewarmConfig,
    getSecret = () => (process.env.STUDY_BRIDGE_SECRET || '').trim(),
    nonces = createNonceStore(), now = () => Date.now(), path = PREWARM_PATH,
    limiter = createWindowLimiter({ max: 30, windowMs: 10 * 60_000, now }),
} = {}) {
    return async function trackPrewarm(req, res) {
        const err = (status, code, error, extra = {}) => res.status(status).json({ error, code, ...extra });
        let principal;
        if (req.headers['x-bridge-signature']) {
            const v = verifyBridgeRequest(req, { secret: getSecret(), nonces, now, path });
            if (!v.ok) return err(v.status, v.code, v.error);
            principal = 'app';
        } else if (req.isAuthenticated?.() && req.user) {
            principal = `user:${req.user.id}`;
        } else {
            return err(401, 'auth_required', 'Sign in or send a signed bridge request.');
        }
        const body = req.body && typeof req.body === 'object' ? { ...req.body, setId: req.body.setId ?? 'prewarm' } : req.body;
        const checked = validateTrackRequest(body);
        if (!checked.ok) return err(400, checked.code, checked.error);
        const v = checked.value;
        const key = principal === 'app' ? (v.userRef ? `app:${v.userRef}` : 'app') : principal;
        const gate = limiter.check(key);
        if (!gate.ok) { res.set('Retry-After', String(gate.retryAfterSec)); return err(429, 'rate_limited', 'Too many prewarm requests.', { retryAfterSec: gate.retryAfterSec }); }
        if (!isConfigured()) return err(503, 'ai_not_configured', 'AI generation is not configured on lingospark.study (CURSOR_API_KEY missing).');
        try {
            const state = await generate.readiness({ level: v.level, terms: v.terms, types: typesForLevel(v.level) });
            const todo = v.terms.filter((t) => !state.ready[t.id]?.ready);
            const cfg = getConfig();
            let queued = 0;
            if (todo.length) queued = (await worker.enqueueTerms({ level: v.level, terms: todo })).queued;
            const queue = store ? await store.counts().catch(() => null) : null;
            return res.status(202).json({
                accepted: true, level: v.level, requestedTerms: v.terms.length,
                alreadyReady: state.readyCount, queued, enabled: cfg.enabled,
                ...(cfg.killSwitch ? { note: 'background generation is switched off (TRACK_PREWARM=off); track-generate still works on demand' } : {}),
                ready: state.ready,
                ...(queue ? { queue: { pending: queue.pending, running: queue.running, done: queue.done, failed: queue.failed, callsToday: queue.callsToday, dailyCap: cfg.dailyCalls } } : {}),
            });
        } catch (e) {
            console.error('track-prewarm failed:', e?.message || e);
            return err(500, 'internal', 'Prewarm failed.');
        }
    };
}

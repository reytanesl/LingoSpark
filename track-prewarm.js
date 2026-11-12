/* Track question prewarming (server-side only; imported by server.js and the tests).
   Goal: Track requests from the mobile app are answered from the question bank in milliseconds, so the bank is
   filled AHEAD of time by Cursor AI (@cursor/sdk via the generator's runPrompt) instead of while a learner waits.

   Pieces
     - queue    : Postgres table `track_prewarm_queue` (one row per term+level, resumable, priority ordered) and
                  `track_prewarm_budget` (AI calls spent per UTC day). Memory implementations exist for tests / no-DB mode.
     - sources  : collectSources() walks every word set (word_sets/word_set_items) and the built-in demo sets, infers a
                  CEFR level per set and queues each term at that level (+ adjacent levels at lower priority).
     - worker   : createPrewarmWorker() claims a batch of same-level terms, asks generator.prewarm() to fill every missing
                  task type, records the AI calls against the daily cap, and yields to foreground requests.
     - endpoint : POST /api/study/track-prewarm (same auth as track-generate) enqueues terms at top priority (0).
   Priorities: 0 = requested by the app (set opened / level picked), 1 = recently used sets + built-in sets (primary level),
               2 = all other sets (primary level), 3 = adjacent levels of priority-1 terms, 4 = adjacent levels of the rest.
   Env: TRACK_PREWARM=off (kill switch), TRACK_PREWARM_DAILY_CALLS (default 1500), TRACK_PREWARM_CONCURRENCY (2),
        TRACK_PREWARM_TOP_CONCURRENCY (6), TRACK_PREWARM_TOP_CALL_WEIGHT (1000), TRACK_PREWARM_TERMS_PER_RUN (10), TRACK_PREWARM_CALL_WEIGHT (2000),
        TRACK_PREWARM_ADJACENT=off, TRACK_PREWARM_DEFAULT_LEVEL (B1), TRACK_PREWARM_RECENT_DAYS (30). */
import {
    LEVELS, typesForLevel, termKeyOf, termTokens, validateTrackRequest, verifyBridgeRequest, createNonceStore, LIMITS,
} from './track-ai.js';

export const PREWARM_PATH = '/api/study/track-prewarm';
export const PREWARM_BODY_LIMIT = 64 * 1024;

export function readPrewarmConfig(env = process.env) {
    const num = (v, d, min = 0, max = Infinity) => { const n = Number(v); return Number.isFinite(n) && n >= min ? Math.min(Math.floor(n), max) : d; };
    const level = String(env.TRACK_PREWARM_DEFAULT_LEVEL || 'B1').toUpperCase();
    return {
        enabled: String(env.TRACK_PREWARM || '').trim().toLowerCase() !== 'off' && Boolean(env.CURSOR_API_KEY),
        killSwitch: String(env.TRACK_PREWARM || '').trim().toLowerCase() === 'off',
        dailyCalls: num(env.TRACK_PREWARM_DAILY_CALLS, 1500, 0),
        hardCapFactor: 2, // app-requested (priority 0) work may exceed the daily cap up to this many times
        concurrency: num(env.TRACK_PREWARM_CONCURRENCY, 2, 1, 6),
        topConcurrency: num(env.TRACK_PREWARM_TOP_CONCURRENCY, 6, 1, 8),
        topCallWeight: num(env.TRACK_PREWARM_TOP_CALL_WEIGHT, 1000, 300, 6000), // app-requested terms: smaller calls, more in parallel = faster
        termsPerRun: num(env.TRACK_PREWARM_TERMS_PER_RUN, 10, 1, 40),
        callWeight: num(env.TRACK_PREWARM_CALL_WEIGHT, 2000, 300, 6000),
        adjacent: String(env.TRACK_PREWARM_ADJACENT || '').trim().toLowerCase() !== 'off',
        defaultLevel: LEVELS.includes(level) ? level : 'B1',
        recentDays: num(env.TRACK_PREWARM_RECENT_DAYS, 30, 1),
        maxAttempts: 3,
        backoffMs: 15 * 60_000, // after a partial attempt: attempt n waits n * 15 min
        retryFailedMs: 24 * 3600_000, // a term that stayed incomplete after maxAttempts is tried again after a day
        rebumpFailedMs: 6 * 3600_000,
        leaseMs: 10 * 60_000,
        scanIntervalMs: 6 * 3600_000,
        startDelayMs: 30_000,
        idleMs: 60_000, busyYieldMs: 3_000, cappedMs: 10 * 60_000, offMs: 60_000, aiErrorMs: 5 * 60_000, betweenRunsMs: 1_500,
        maxTopPending: 1000, // beyond this many pending priority-0 rows, further requests queue at priority 1
    };
}

// ---------------------------------------------------------------- level inference

/** CEFR level of a word set from its name/category/class (sets carry no explicit level). */
export function inferSetLevel({ name = '', category = '', className = '' } = {}, fallback = 'B1') {
    const t = ` ${[name, category, className].join(' ').toLowerCase()} `;
    const explicit = /(?:^|[^a-z0-9])(a1|a2|b1|b2|c1)(?![a-z0-9])/.exec(t);
    if (explicit) return explicit[1].toUpperCase();
    if (/\bc2\b|advanced|zaawansowan|\bcae\b|\bcpe\b/.test(t)) return 'C1';
    if (/rozszerzon|upper[- ]?intermediate|\bfce\b|b2\/c1|\bpe\b/.test(t)) return 'B2';
    if (/matura|podstawow(?:a|y|e)\b.*\bmatur|intermediate|\bpet\b/.test(t)) return 'B1';
    if (/ósmoklasist|osmoklasist|\be8\b|egzamin ósm/.test(t)) return 'A2';
    if (/beginner|starter|początkując|poczatkujac/.test(t)) return 'A1';
    if (/\beasy\b|elementary|podstawow/.test(t)) return 'A2';
    return LEVELS.includes(fallback) ? fallback : 'B1';
}

export function adjacentLevels(level) {
    const i = LEVELS.indexOf(level);
    return [LEVELS[i - 1], LEVELS[i + 1]].filter(Boolean);
}

const cleanTxt = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const validTerm = (en, pl) => en && pl && en.length <= LIMITS.maxEnChars && pl.length <= LIMITS.maxPlChars && termTokens(en).length > 0;

/**
 * Every (term, level) the worker should fill, best priority first. `sets`: [{ name, category, className, lastActive(ms), items:[{term, definition}], builtIn }]
 */
export function planFromSets(sets, config, nowMs = Date.now()) {
    const recentMs = config.recentDays * 24 * 3600_000;
    const best = new Map(); // `${level}|${termKey}` -> row
    const put = (row) => {
        const k = `${row.level}|${row.termKey}`;
        const cur = best.get(k);
        if (!cur || row.priority < cur.priority || (row.priority === cur.priority && row.activity > cur.activity)) best.set(k, row);
    };
    for (const set of sets) {
        const level = inferSetLevel(set, config.defaultLevel);
        const recent = set.builtIn || (nowMs - (set.lastActive || 0) < recentMs);
        const activity = set.builtIn ? nowMs : (set.lastActive || 0);
        for (const it of set.items || []) {
            const en = cleanTxt(it.term);
            const pl = cleanTxt(it.definition);
            if (!validTerm(en, pl)) continue;
            const termKey = termKeyOf({ en, pl });
            put({ termKey, en, pl, level, priority: recent ? 1 : 2, activity });
            if (config.adjacent) for (const adj of adjacentLevels(level)) put({ termKey, en, pl, level: adj, priority: recent ? 3 : 4, activity });
        }
    }
    return [...best.values()].sort((a, b) => (a.priority - b.priority) || (b.activity - a.activity));
}

/** Read word sets from Postgres (+ built-in demo sets) and return the prewarm plan. */
export async function collectSources({ getPool, config, loadDemoSets = defaultDemoSets, nowMs = Date.now() }) {
    const pool = getPool();
    const sets = new Map();
    const setRows = await pool.query(`
        SELECT ws.id, ws.name, ws.category, ws.class_name,
               GREATEST(ws.updated_at, COALESCE(MAX(ugs.played_at), ws.updated_at)) AS last_active
        FROM word_sets ws LEFT JOIN user_game_sessions ugs ON ugs.word_set_id = ws.id
        GROUP BY ws.id`);
    for (const r of setRows.rows) sets.set(r.id, { name: r.name, category: r.category, className: r.class_name, lastActive: new Date(r.last_active).getTime(), items: [] });
    const itemRows = await pool.query(`SELECT set_id, term, definition FROM word_set_items WHERE definition IS NOT NULL AND btrim(definition) <> ''`);
    for (const r of itemRows.rows) sets.get(r.set_id)?.items.push({ term: r.term, definition: r.definition });
    const all = [...sets.values()];
    try {
        for (const d of await loadDemoSets()) all.push({ name: d.name, category: d.description || '', className: '', builtIn: true, items: d.items || [] });
    } catch { /* demo sets are optional */ }
    return planFromSets(all, config, nowMs);
}

async function defaultDemoSets() {
    await import('./demo-sets.js'); // defines globalThis.LINGOSPARK_DEMO_SETS
    return globalThis.LINGOSPARK_DEMO_SETS || [];
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
        async enqueue(list, { bump = false } = {}) {
            const t = now(); let n = 0;
            for (const r of list) {
                const cur = rows.get(key(r));
                if (!cur) { rows.set(key(r), { termKey: r.termKey, en: r.en, pl: r.pl, level: r.level, priority: r.priority, status: 'pending', attempts: 0, seq: ++seq, nextTryAt: t, leaseUntil: 0, updatedAt: t, note: '' }); n++; continue; }
                if (!bump) continue;
                cur.priority = Math.min(cur.priority, r.priority);
                const reset = cur.status === 'done' || (cur.status === 'failed' && t - cur.updatedAt > (r.rebumpMs ?? 6 * 3600_000));
                if (reset) { cur.status = 'pending'; cur.attempts = 0; cur.nextTryAt = t; cur.seq = ++seq; n++; }
            }
            return n;
        },
        async claim({ limit, leaseMs }) {
            const t = now();
            const cands = [...rows.values()].filter((r) => eligible(r, t)).sort((a, b) => (a.priority - b.priority) || (a.seq - b.seq));
            const head = cands[0];
            if (!head) return [];
            const picked = cands.filter((r) => r.level === head.level && (r.priority === 0) === (head.priority === 0)).slice(0, limit);
            for (const r of picked) { r.status = 'running'; r.leaseUntil = t + leaseMs; r.updatedAt = t; }
            return picked.map((r) => ({ termKey: r.termKey, en: r.en, pl: r.pl, level: r.level, priority: r.priority, attempts: r.attempts }));
        },
        async release(list) { for (const r of list) { const cur = rows.get(key(r)); if (cur && cur.status === 'running') { cur.status = 'pending'; cur.updatedAt = now(); } } },
        async finish(r, { status, nextTryMs = 0, note = '' }) {
            const cur = rows.get(key(r)); if (!cur) return;
            cur.status = status; cur.nextTryAt = now() + nextTryMs; cur.note = note; cur.updatedAt = now();
            if (status !== 'done') cur.attempts = r.attempts + 1; else cur.attempts = 0;
        },
        async addCalls(n) { if (n > 0) budget.set(dayKey(now()), (budget.get(dayKey(now())) || 0) + n); },
        async callsToday() { return budget.get(dayKey(now())) || 0; },
        async pendingTop() { return [...rows.values()].filter((r) => r.priority === 0 && r.status !== 'done' && r.status !== 'failed').length; },
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
            priority SMALLINT NOT NULL DEFAULT 2, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
            seq BIGSERIAL, next_try_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), lease_until TIMESTAMPTZ,
            note TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (term_key, level))`);
        await q('CREATE INDEX IF NOT EXISTS track_prewarm_queue_pick ON track_prewarm_queue (status, priority, seq)');
        await q(`CREATE TABLE IF NOT EXISTS track_prewarm_budget (day DATE PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0)`);
    })().catch((e) => { ready = null; throw e; }));
    const ELIG = `((status IN ('pending','failed') AND next_try_at <= NOW()) OR (status = 'running' AND lease_until < NOW()))`;
    return {
        ensure,
        async enqueue(list, { bump = false, rebumpMs = 6 * 3600_000 } = {}) {
            await ensure();
            let n = 0;
            for (let i = 0; i < list.length; i += 400) {
                const part = list.slice(i, i + 400);
                const cols = [part.map((r) => r.termKey), part.map((r) => r.en), part.map((r) => r.pl), part.map((r) => r.level), part.map((r) => r.priority)];
                const reset = `(track_prewarm_queue.status = 'done' OR (track_prewarm_queue.status = 'failed' AND track_prewarm_queue.updated_at < NOW() - make_interval(secs => $6::double precision / 1000)))`;
                const sql = bump
                    ? `INSERT INTO track_prewarm_queue (term_key, en, pl, level, priority)
                       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[])
                       ON CONFLICT (term_key, level) DO UPDATE SET
                         priority = LEAST(track_prewarm_queue.priority, EXCLUDED.priority),
                         status = CASE WHEN ${reset} THEN 'pending' ELSE track_prewarm_queue.status END,
                         attempts = CASE WHEN ${reset} THEN 0 ELSE track_prewarm_queue.attempts END,
                         next_try_at = CASE WHEN ${reset} THEN NOW() ELSE track_prewarm_queue.next_try_at END,
                         seq = CASE WHEN ${reset} THEN nextval(pg_get_serial_sequence('track_prewarm_queue','seq')) ELSE track_prewarm_queue.seq END,
                         updated_at = CASE WHEN ${reset} THEN NOW() ELSE track_prewarm_queue.updated_at END
                       RETURNING (xmax = 0) AS inserted`
                    : `INSERT INTO track_prewarm_queue (term_key, en, pl, level, priority)
                       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[])
                       ON CONFLICT (term_key, level) DO NOTHING RETURNING true AS inserted`;
                const r = await q(sql, bump ? [...cols, rebumpMs] : cols);
                n += r.rows.length;
            }
            return n;
        },
        async claim({ limit, leaseMs }) {
            await ensure();
            const r = await q(`
                WITH head AS (SELECT level, priority FROM track_prewarm_queue WHERE ${ELIG} ORDER BY priority, seq LIMIT 1),
                picked AS (
                    SELECT t.term_key, t.level FROM track_prewarm_queue t, head
                    WHERE t.level = head.level AND ${ELIG.replace(/\bstatus\b/g, 't.status').replace(/\bnext_try_at\b/g, 't.next_try_at').replace(/\blease_until\b/g, 't.lease_until')}
                      AND ((head.priority = 0) = (t.priority = 0))
                    ORDER BY t.priority, t.seq LIMIT $1 FOR UPDATE OF t SKIP LOCKED)
                UPDATE track_prewarm_queue u SET status = 'running', lease_until = NOW() + make_interval(secs => $2::double precision / 1000), updated_at = NOW()
                FROM picked WHERE u.term_key = picked.term_key AND u.level = picked.level
                RETURNING u.term_key, u.en, u.pl, u.level, u.priority, u.attempts`, [limit, leaseMs]);
            return r.rows.map((x) => ({ termKey: x.term_key, en: x.en, pl: x.pl, level: x.level, priority: x.priority, attempts: x.attempts }));
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
        async pendingTop() {
            await ensure();
            const r = await q(`SELECT count(*)::int AS n FROM track_prewarm_queue WHERE priority = 0 AND status IN ('pending','running')`);
            return r.rows[0].n;
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
 * createPrewarmWorker({ store, generate, collect, config, log }) -> { start, stop, kick, tick, scan, enqueueTerms }.
 * `generate` is the track generator (needs .prewarm and .stats). `config` is a function (read each tick, so the
 * TRACK_PREWARM kill switch and cap are honoured without code changes) or an object.
 */
export function createPrewarmWorker({ store, generate, collect = null, config = readPrewarmConfig, log = () => {}, now = () => Date.now() }) {
    const cfgOf = () => (typeof config === 'function' ? config() : config);
    let running = false;
    let wake = null;
    let lastScan = 0;
    let started = 0;
    const sleep = (ms) => new Promise((resolve) => { const t = setTimeout(() => { wake = null; resolve(); }, ms); t.unref?.(); wake = () => { clearTimeout(t); wake = null; resolve(); }; });

    async function scan() {
        if (!collect) return { queued: 0, planned: 0 };
        const cfg = cfgOf();
        const plan = await collect(cfg);
        const queued = await store.enqueue(plan.map((r) => ({ termKey: r.termKey, en: r.en, pl: r.pl, level: r.level, priority: r.priority })), { bump: false });
        lastScan = now();
        log(`scan: ${plan.length} term/level pairs from word sets, ${queued} new in the queue`);
        return { queued, planned: plan.length };
    }

    /** App-requested (priority 0) or top-up terms: put them at the front. */
    async function enqueueTerms({ level, terms, priority = 0 }) {
        const cfg = cfgOf();
        let p = priority;
        if (p === 0 && (await store.pendingTop()) >= cfg.maxTopPending) p = 1;
        const seen = new Set();
        const rows = [];
        for (const t of terms) {
            const termKey = termKeyOf(t);
            if (seen.has(termKey)) continue;
            seen.add(termKey);
            rows.push({ termKey, en: t.en, pl: t.pl, level, priority: p });
        }
        const n = await store.enqueue(rows, { bump: true, rebumpMs: cfg.rebumpFailedMs });
        if (n || rows.length) wake?.();
        return { queued: rows.length, changed: n };
    }

    async function tick() {
        const cfg = cfgOf();
        if (!cfg.enabled) return { state: 'off' };
        if (generate.stats().fgActive > 0) return { state: 'yield' };
        const used = await store.callsToday();
        if (used >= cfg.dailyCalls * cfg.hardCapFactor) return { state: 'capped', used };
        const rows = await store.claim({ limit: cfg.termsPerRun, leaseMs: cfg.leaseMs });
        if (!rows.length) return { state: 'idle' };
        const top = rows[0].priority === 0;
        if (!top && used >= cfg.dailyCalls) { await store.release(rows); return { state: 'capped', used }; }
        const level = rows[0].level;
        const terms = rows.map((r, i) => ({ id: String(i + 1), en: r.en, pl: r.pl }));
        let res;
        try {
            res = await generate.prewarm({ level, terms, concurrency: top ? cfg.topConcurrency : cfg.concurrency, callWeight: top ? cfg.topCallWeight : cfg.callWeight });
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
        log(`${level} p${rows[0].priority}: ${done}/${rows.length} terms complete${partial ? `, ${partial} partial` : ''}, ${res.aiCalls} AI calls (today ${used + res.aiCalls}/${cfg.dailyCalls})${counts ? `, queue pending ${counts.pending} done ${counts.done} failed ${counts.failed}` : ''}`);
        if (res.aiCalls > 0 && res.aiErrors >= res.aiCalls) return { state: 'ai_errors', res };
        return { state: 'work', res };
    }

    async function loop() {
        while (running) {
            let r = { state: 'idle' };
            try {
                const cfg = cfgOf();
                if (cfg.enabled && collect && (!lastScan || now() - lastScan > cfg.scanIntervalMs) && now() - started >= cfg.startDelayMs) await scan();
                r = await tick();
            } catch (e) { log(`tick failed: ${e?.message || e}`); r = { state: 'ai_errors' }; }
            const cfg = cfgOf();
            const wait = { work: cfg.betweenRunsMs, yield: cfg.busyYieldMs, idle: cfg.idleMs, capped: cfg.cappedMs, off: cfg.offMs, ai_errors: cfg.aiErrorMs }[r.state] ?? cfg.idleMs;
            await sleep(wait);
        }
    }

    return {
        scan, tick, enqueueTerms, loop,
        start() {
            if (running) return;
            running = true; started = now();
            const cfg = cfgOf();
            log(`worker started (${cfg.killSwitch ? 'OFF by TRACK_PREWARM=off' : cfg.enabled ? 'on' : 'off: no CURSOR_API_KEY'}; cap ${cfg.dailyCalls} AI calls/day, concurrency ${cfg.concurrency})`);
            sleep(cfg.startDelayMs).then(() => (running ? loop() : null));
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
 * Enqueues the terms that are not fully banked at top priority and answers 202 straight away.
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
            if (todo.length) queued = (await worker.enqueueTerms({ level: v.level, terms: todo, priority: 0 })).queued;
            const queue = store ? await store.counts().catch(() => null) : null;
            return res.status(202).json({
                accepted: true, level: v.level, requestedTerms: v.terms.length,
                alreadyReady: state.readyCount, queued, enabled: cfg.enabled,
                ...(cfg.killSwitch ? { note: 'prewarm worker is switched off (TRACK_PREWARM=off); track-generate still works on demand' } : {}),
                ready: state.ready,
                ...(queue ? { queue: { pending: queue.pending, running: queue.running, done: queue.done, failed: queue.failed, callsToday: queue.callsToday, dailyCap: cfg.dailyCalls } } : {}),
            });
        } catch (e) {
            console.error('track-prewarm failed:', e?.message || e);
            return err(500, 'internal', 'Prewarm failed.');
        }
    };
}

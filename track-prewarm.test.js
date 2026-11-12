import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {
    readPrewarmConfig, createMemoryPrewarmStore, createPrewarmWorker, createTrackPrewarmHandler, PREWARM_PATH,
} from './track-prewarm.js';
import {
    createTrackGenerator, typesForLevel, signBridgeRequest, BRIDGE_HEADERS, createBank, termKeyOf, LIMITS,
} from './track-ai.js';

const SECRET = 'unit-test-bridge-secret-0123456789';
const CFG = readPrewarmConfig({ CURSOR_API_KEY: 'x' });

/** Mock model: writes a valid item for every wanted slot (parses the prompt). */
function model({ skip = () => false, counter = { calls: 0 } } = {}) {
    const mk = (termId, en, slot) => {
        switch (slot) {
            case 'gapTranslate': case 'sentenceGap': return { termId, type: slot, sentence: `She was really ${en} about the news yesterday.`, answer: en, distractors: [`d1${en}`, `d2${en}`, `d3${en}`], plTranslation: 'Była naprawdę zadowolona z wiadomości wczoraj.' };
            case 'sentenceOrder': return { termId, type: slot, sentence: `I was ${en} about the news today.` };
            case 'meaningPick:pl-en': return { termId, type: 'meaningPick', direction: 'pl-en', distractors: [`a1${en}`, `b1${en}`, `c1${en}`] };
            case 'meaningPick:en-pl': return { termId, type: 'meaningPick', direction: 'en-pl', distractors: [`a2${en}`, `b2${en}`, `c2${en}`] };
            case 'listenPick': return { termId, type: slot, distractors: [`q${en}`, `w${en}`, `e${en}`] };
            case 'dictation': return { termId, type: slot, sentence: `I was ${en} today.` };
            case 'translateType': return { termId, type: slot, source: 'Byłem dziś zadowolony.', answer: `I was ${en} today.`, answers: [] };
            case 'letterScramble': return { termId, type: slot, answer: en, hint: 'uczucie' };
            case 'contextTrueFalse': return { termId, type: slot, passage: `Tom was ${en} for the help. He said thanks twice.`, statement: 'Tom said thanks once.', correctTrue: false };
            case 'collocationPick': return { termId, type: slot, phrase: `very ${en} person`, answer: en, distractors: [`x1${en}`, `x2${en}`, `x3${en}`] };
            case 'wordFormation': return { termId, type: slot, stem: en.toUpperCase(), sentence: `All of us saw his ${en}ness today.`, answer: `${en}ness` };
            case 'keyTransform': return { termId, type: slot, sourceSentence: `She was ${en} to her friend.`, keyWord: 'BEING', template: 'She felt ___ to her friend.', answer: `like being ${en}`, answers: [] };
            default: return null;
        }
    };
    return async (prompt) => {
        counter.calls++;
        const items = [];
        for (const [, id, en, w] of prompt.matchAll(/- termId "(\d+)": en "([^"]+)".*→ wanted: (.*)$/gm)) for (const sl of w.split(', ')) { if (!skip(en, sl)) { const it = mk(id, en, sl); if (it) items.push(it); } }
        return { items, skipped: [] };
    };
}
const row = (en, level = 'B1') => ({ termKey: termKeyOf({ en, pl: `pl-${en}` }), en, pl: `pl-${en}`, level });
const WORDS = ['grateful', 'happy', 'proud', 'upset', 'calm', 'eager', 'tired', 'brave'];

/* ---------------------------------------------------------------- queue (memory store; the Postgres store has the same contract) */

test('queue: idempotent enqueue, FIFO in set order, one level per batch, finished terms re-open, leases are reclaimed', async () => {
    let t = 1_000_000;
    const store = createMemoryPrewarmStore({ now: () => t });
    assert.equal(await store.enqueue([...WORDS.slice(0, 3).map((w) => row(w, 'B1')), ...WORDS.slice(3, 5).map((w) => row(w, 'A2'))]), 5);
    assert.equal(await store.enqueue(WORDS.slice(0, 3).map((w) => row(w, 'B1'))), 0, 'asking twice = no duplicates');
    const first = await store.claim({ limit: 2, leaseMs: 60_000 });
    assert.deepEqual(first.map((r) => r.en), ['grateful', 'happy'], 'set order');
    const rest = await store.claim({ limit: 10, leaseMs: 60_000 });
    assert.deepEqual(rest.map((r) => r.en), ['proud'], 'same level only');
    // crash: leases expire -> claimable again (resumable)
    t += 61_000;
    const again = await store.claim({ limit: 10, leaseMs: 60_000 });
    assert.deepEqual(again.map((r) => r.en), ['grateful', 'happy', 'proud']);
    await store.finish(again[0], { status: 'done' });
    assert.equal((await store.counts()).done, 1);
    // a learner opening the set again re-opens a finished term; a recently failed one stays failed (no endless retries)
    await store.finish(again[1], { status: 'failed', nextTryMs: 10 * 3600_000, note: 'x' });
    assert.equal(await store.enqueue([again[0], again[1]]), 1);
    assert.equal(store.rows.get(`${again[1].level}|${again[1].termKey}`).status, 'failed');
    t += 7 * 3600_000;
    assert.equal(await store.enqueue([again[1]]), 1, 'after 6 h a new request re-opens it');
});

/* ---------------------------------------------------------------- worker */

function setup({ cfg = {}, skip, fg = 0, terms = WORDS.slice(0, 6), level = 'B1' } = {}) {
    const counter = { calls: 0 };
    const generate = createTrackGenerator({ runPrompt: model({ skip, counter }), bank: createBank(), limits: { ...LIMITS, budgetMs: 4000 } });
    const realStats = generate.stats;
    generate.stats = () => ({ ...realStats(), fgActive: fg });
    const store = createMemoryPrewarmStore();
    const logs = [];
    const config = { ...CFG, ...cfg };
    const worker = createPrewarmWorker({ store, generate, config, log: (m) => logs.push(m) });
    return { counter, generate, store, worker, logs, enqueue: () => store.enqueue(terms.map((w) => row(w, level))) };
}

test('worker: fills the bank for queued terms, marks them done, counts AI calls against the daily budget, logs progress', async () => {
    const s = setup();
    await s.enqueue();
    const r = await s.worker.tick();
    assert.equal(r.state, 'work');
    const c = await s.store.counts();
    assert.equal(c.done, 6);
    assert.equal(c.callsToday, s.counter.calls);
    assert.ok(s.counter.calls >= 2 && s.counter.calls <= 12, `calls ${s.counter.calls}`);
    assert.ok(s.logs.some((l) => /6\/6 terms complete/.test(l) && /AI calls \(today \d+\/1500\)/.test(l)));
    // everything banked: the app's fast path now sees every term ready, and the next tick has nothing to do
    const ready = await s.generate.readiness({ level: 'B1', terms: WORDS.slice(0, 6).map((w, i) => ({ id: String(i + 1), en: w, pl: `pl-${w}` })), types: typesForLevel('B1') });
    assert.equal(ready.allReady, true);
    assert.equal((await s.worker.tick()).state, 'idle');
});

test('worker: kill switch, missing key, foreground traffic and the daily safety cap each stop AI spending', async () => {
    const off = setup({ cfg: { enabled: false, killSwitch: true } });
    await off.enqueue();
    assert.equal((await off.worker.tick()).state, 'off');
    assert.equal(off.counter.calls, 0);
    assert.equal(readPrewarmConfig({ CURSOR_API_KEY: 'k', TRACK_PREWARM: 'off' }).enabled, false);
    assert.equal(readPrewarmConfig({ TRACK_PREWARM: 'on' }).enabled, false, 'no CURSOR_API_KEY');
    assert.equal(readPrewarmConfig({ CURSOR_API_KEY: 'k' }).enabled, true);
    assert.equal(readPrewarmConfig({ CURSOR_API_KEY: 'k' }).dailyCalls, 1500);
    assert.equal(readPrewarmConfig({ CURSOR_API_KEY: 'k', TRACK_PREWARM_DAILY_CALLS: '300' }).dailyCalls, 300);

    const busy = setup({ fg: 2 });
    await busy.enqueue();
    assert.equal((await busy.worker.tick()).state, 'yield');
    assert.equal(busy.counter.calls, 0);

    const capped = setup({ cfg: { dailyCalls: 5 } });
    await capped.enqueue();
    await capped.store.addCalls(5);
    assert.equal((await capped.worker.tick()).state, 'capped');
    assert.equal(capped.counter.calls, 0);
    assert.equal((await capped.store.counts()).pending, 6, 'claimed rows were handed back');
});

test('worker: a term that stays incomplete is retried with back-off, then parked as failed (no endless AI spend); a restart resumes the queue', async () => {
    let t = 5_000_000;
    const counter = { calls: 0 };
    const generate = createTrackGenerator({ runPrompt: model({ skip: (en, sl) => en === 'happy' && sl === 'gapTranslate', counter }), bank: createBank(), limits: { ...LIMITS, budgetMs: 4000 }, now: () => t });
    const store = createMemoryPrewarmStore({ now: () => t });
    const config = { ...CFG, backoffMs: 1000, retryFailedMs: 100_000, maxAttempts: 2 };
    const worker = createPrewarmWorker({ store, generate, config, now: () => t });
    await store.enqueue([row('grateful'), row('happy')]);
    await worker.tick();
    let rows = [...store.rows.values()];
    assert.equal(rows.find((r) => r.en === 'grateful').status, 'done');
    const happy = () => [...store.rows.values()].find((r) => r.en === 'happy');
    assert.equal(happy().status, 'pending');
    assert.equal(happy().attempts, 1);
    assert.match(happy().note, /gapTranslate/);
    assert.equal((await worker.tick()).state, 'idle', 'backing off');
    t += 31 * 60_000; // past the failure cool-down of the generator and the queue back-off
    await worker.tick();
    assert.equal(happy().status, 'failed');
    t += 1000;
    assert.equal((await worker.tick()).state, 'idle', 'parked');
    // a new process on the same queue picks up what is still pending
    const store2 = createMemoryPrewarmStore({ now: () => t });
    store2.rows.set('x', { ...happy(), status: 'running', leaseUntil: t - 1 });
    const w2 = createPrewarmWorker({ store: store2, generate, config: { ...config }, now: () => t });
    assert.equal((await store2.claim({ limit: 5, leaseMs: 1000 })).length, 1);
    void w2;
});

test('worker.enqueueTerms: queues a set in order, de-duplicates, and wakes the worker; nothing is queued by itself', async () => {
    const s = setup();
    assert.equal((await s.store.counts()).pending, 0, 'no global walk: the queue starts empty');
    const terms = ['brave', 'tired', 'calm', 'Brave'].map((en, i) => ({ id: String(i), en, pl: `pl-${en.toLowerCase()}` }));
    const r = await s.worker.enqueueTerms({ level: 'B1', terms });
    assert.equal(r.queued, 3);
    assert.deepEqual((await s.store.claim({ limit: 10, leaseMs: 1000 })).map((x) => x.en), ['brave', 'tired', 'calm']);
});

/* ---------------------------------------------------------------- HTTP */

async function serve({ user = null, enabled = true, aiConfigured = true } = {}) {
    const s = setup({ cfg: { enabled, killSwitch: !enabled } });
    const app = express();
    app.use((req, _res, next) => { req.isAuthenticated = () => Boolean(user); if (user) req.user = user; next(); });
    app.use(PREWARM_PATH, express.json({ limit: 64 * 1024, verify: (req, _res, buf) => { req.rawBody = buf; } }));
    app.post(PREWARM_PATH, createTrackPrewarmHandler({ generate: s.generate, worker: s.worker, store: s.store, isConfigured: () => aiConfigured, getConfig: () => ({ ...CFG, enabled, killSwitch: !enabled }), getSecret: () => SECRET }));
    const server = await new Promise((res) => { const sv = app.listen(0, '127.0.0.1', () => res(sv)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    return {
        ...s, close: () => new Promise((r) => server.close(r)),
        post: (body) => fetch(base + PREWARM_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        signed: (body, { tamper = false } = {}) => {
            const rawBody = Buffer.from(JSON.stringify(body));
            const ts = Date.now(); const nonce = `n${Math.random().toString(36).slice(2)}abcdefghijkl`.slice(0, 24);
            const sig = signBridgeRequest({ secret: SECRET, timestamp: ts, nonce, path: PREWARM_PATH, rawBody });
            return fetch(base + PREWARM_PATH, { method: 'POST', headers: { 'content-type': 'application/json', [BRIDGE_HEADERS.timestamp]: String(ts), [BRIDGE_HEADERS.nonce]: nonce, [BRIDGE_HEADERS.signature]: tamper ? 'v1=' + 'A'.repeat(43) : sig }, body: rawBody });
        },
    };
}
const BODY = { level: 'B1', terms: WORDS.slice(0, 3).map((w, i) => ({ id: String(i + 1), en: w, pl: `pl-${w}` })) };

test('http prewarm: needs the same auth as track-generate; signed app and session both get 202 quickly with readiness', async () => {
    const s = await serve();
    try {
        assert.equal((await s.post(BODY)).status, 401);
        assert.equal((await s.signed(BODY, { tamper: true })).status, 401);
        const t0 = Date.now();
        const r = await s.signed(BODY);
        assert.equal(r.status, 202);
        assert.ok(Date.now() - t0 < 1000);
        const j = await r.json();
        assert.equal(j.accepted, true);
        assert.equal(j.requestedTerms, 3);
        assert.equal(j.alreadyReady, 0);
        assert.equal(j.queued, 3);
        assert.equal(j.enabled, true);
        assert.equal(j.ready['1'].ready, false);
        assert.equal(j.queue.dailyCap, 1500);
        assert.equal((await s.store.counts()).pending, 3);
                assert.equal(s.counter.calls, 0, 'the endpoint itself spends no AI');
        assert.equal((await s.signed({ ...BODY, level: 'Z9' })).status, 400);
    } finally { await s.close(); }
    const u = await serve({ user: { id: 3 } });
    try { assert.equal((await u.post(BODY)).status, 202); } finally { await u.close(); }
});

test('http prewarm: already-banked terms are reported ready and not queued again; kill switch is visible; 503 without a key', async () => {
    const s = await serve({ user: { id: 3 } });
    try {
        await s.post(BODY);
        await s.worker.tick(); // worker fills the three terms
        const j = await (await s.post(BODY)).json();
        assert.equal(j.alreadyReady, 3);
        assert.equal(j.queued, 0);
        assert.ok(Object.values(j.ready).every((x) => x.ready && x.have === x.want));
    } finally { await s.close(); }
    const off = await serve({ user: { id: 3 }, enabled: false });
    try { const j = await (await off.post(BODY)).json(); assert.equal(j.enabled, false); assert.match(j.note, /TRACK_PREWARM=off/); } finally { await off.close(); }
    const nokey = await serve({ user: { id: 3 }, aiConfigured: false });
    try { assert.equal((await nokey.post(BODY)).status, 503); } finally { await nokey.close(); }
});

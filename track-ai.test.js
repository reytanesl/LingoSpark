import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {
    validateTrackRequest, buildItem, findTermForm, makeTemplate, typesForLevel, buildTrackPrompt,
    createTrackGenerator, createTrackGenerateHandler, createTrackLimiter, createNonceStore, createLruCache,
    createBank, termKeyOf, itemText, BANK_TARGET, planCalls,
    signBridgeRequest, verifyBridgeRequest, BRIDGE_HEADERS, TRACK_PATH, LIMITS, ALL_TYPES,
} from './track-ai.js';

const SECRET = 'unit-test-bridge-secret-0123456789';
const T = (id, en, pl, pos) => ({ id, en, pl, pos: pos || '' });
const FOG = T('1', 'fog', 'mgła');
const NET = T('2', 'net', 'sieć');
const STEP = T('3', 'step out of', 'wyjść z');
const FISHER = T('4', 'fisherman', 'rybak');
const GIVE = T('5', 'give up', 'poddać się');

/* ---------------------------------------------------------------- helpers: term forms */

test('findTermForm: inflections, irregular verbs, separable phrasal verbs', () => {
    assert.ok(findTermForm('Thick fog covered the harbour.', 'fog'));
    assert.ok(findTermForm('Two fishermen sat on the pier.', 'fisherman'));
    assert.ok(findTermForm('She gave up smoking last year.', 'give up'));
    assert.ok(findTermForm('He gave it up in the end.', 'give up'));
    assert.ok(findTermForm('They had to step out of the room.', 'step out of'));
    assert.ok(findTermForm('The fish was caught with nets.', 'net'));
    assert.ok(!findTermForm('The lake was calm.', 'fog'));
    assert.ok(!findTermForm('Please give me the book.', 'give up'));
});

test('makeTemplate: first whole word becomes a gap, never at sentence start', () => {
    assert.equal(makeTemplate('Thick fog covered the harbour.', 'fog'), 'Thick ___ covered the harbour.');
    assert.equal(makeTemplate('Fog covered the harbour.', 'Fog'), null);
    assert.equal(makeTemplate('The foggy morning was cold.', 'fog'), null);
});

test('typesForLevel: wordFormation and keyTransform are B1+, context/collocation A2+', () => {
    assert.ok(!typesForLevel('A1').includes('wordFormation'));
    assert.ok(!typesForLevel('A1').includes('contextTrueFalse'));
    assert.ok(typesForLevel('A2').includes('collocationPick'));
    assert.ok(!typesForLevel('A2').includes('keyTransform'));
    assert.deepEqual(typesForLevel('B1'), ALL_TYPES);
});

/* ---------------------------------------------------------------- request validation */

test('validateTrackRequest: accepts a good request and applies defaults', () => {
    const r = validateTrackRequest({ setId: 'lake', level: 'a2', terms: [{ id: 1, en: ' fog ', pl: 'mgła' }] });
    assert.ok(r.ok);
    assert.equal(r.value.level, 'A2');
    assert.equal(r.value.terms[0].en, 'fog');
    assert.ok(!r.value.types.includes('wordFormation'));
});

test('validateTrackRequest: caps and bad input are rejected', () => {
    const base = { setId: 's', level: 'B1', terms: [{ id: 'a', en: 'fog', pl: 'mgła' }] };
    const bad = (patch, code) => { const r = validateTrackRequest({ ...base, ...patch }); assert.equal(r.ok, false); if (code) assert.equal(r.code, code); };
    bad({ level: 'D9' }, 'bad_level');
    bad({ terms: [] });
    bad({ terms: Array.from({ length: 41 }, (_, i) => ({ id: String(i), en: 'fog', pl: 'x' })) }, 'too_many_terms');
    bad({ terms: [{ id: 'a', en: 'x'.repeat(61), pl: 'x' }] }, 'term_too_long');
    bad({ terms: [{ id: 'a', en: 'fog', pl: 'x'.repeat(101) }] }, 'term_too_long');
    bad({ terms: [{ id: 'a', en: 'fog', pl: 'x' }, { id: 'a', en: 'net', pl: 'y' }] });
    bad({ terms: [{ id: 'a', en: '123', pl: 'x' }] });
    bad({ types: ['sentenceGap', 'nope'] }, 'bad_type');
    bad({ types: ['wordFormation'], level: 'A1' }, 'bad_type');
    bad({ setId: undefined });
    assert.equal(validateTrackRequest(null).ok, false);
    assert.equal(validateTrackRequest({ ...base, terms: Array.from({ length: 40 }, (_, i) => ({ id: String(i), en: 'fog', pl: 'x' })) }).ok, true);
});

/* ---------------------------------------------------------------- item validation */

const good = {
    sentenceGap: { type: 'sentenceGap', sentence: 'Thick fog covered the harbour.', answer: 'fog', distractors: ['rain', 'wind', 'sand'] },
    sentenceOrder: { type: 'sentenceOrder', sentence: 'The fisherman mended his old net.', plTranslation: 'Rybak naprawiał swoją starą sieć.' },
    wordFormation: { type: 'wordFormation', stem: 'FOG', sentence: 'It was a cold, foggy morning.', answer: 'foggy' },
    keyTransform: { type: 'keyTransform', sourceSentence: 'They caught the fish with a net.', keyWord: 'WAS', template: 'The fish ___ a net.', answer: 'was caught with', answers: ['was caught with', 'was caught using'] },
    contextTrueFalse: { type: 'contextTrueFalse', passage: 'Thick fog covered the harbour. The boats stayed in port.', statement: 'The boats went out to sea.', correctTrue: false },
    meaningPick: { type: 'meaningPick', direction: 'pl-en', distractors: ['rain', 'wind', 'sand'] },
};

test('buildItem: valid items take the app shapes', () => {
    const gap = buildItem(good.sentenceGap, FOG, 'A2');
    assert.ok(gap.ok, gap.reason);
    assert.equal(gap.item.template, 'Thick ___ covered the harbour.');
    assert.equal(gap.item.answer, 'fog');
    assert.equal(gap.item.options.length, 4);
    assert.ok(gap.item.options.includes('fog'));
    assert.equal(gap.item.lexiconId, '1');
    const order = buildItem(good.sentenceOrder, FISHER, 'B1');
    assert.ok(order.ok, order.reason);
    assert.deepEqual([...order.item.tokens].sort(), [...order.item.correctOrder].sort());
    assert.notDeepEqual(order.item.tokens, order.item.correctOrder);
    const wf = buildItem(good.wordFormation, FOG, 'B1');
    assert.ok(wf.ok, wf.reason);
    assert.equal(wf.item.stem, 'FOG');
    assert.equal(wf.item.template, 'It was a cold, ___ morning.');
    const kt = buildItem(good.keyTransform, NET, 'B2');
    assert.ok(kt.ok, kt.reason);
    assert.equal(kt.item.keyWord, 'WAS');
    assert.deepEqual(kt.item.answers, ['was caught with', 'was caught using']);
    const tf = buildItem(good.contextTrueFalse, FOG, 'A2');
    assert.ok(tf.ok, tf.reason);
    assert.equal(tf.item.correctTrue, false);
    const mp = buildItem(good.meaningPick, FOG, 'A1');
    assert.ok(mp.ok, mp.reason);
    assert.equal(mp.item.question, 'mgła');
    assert.equal(mp.item.answer, 'fog');
    assert.equal(mp.item.options[mp.item.correctIndex], 'fog');
});

test('buildItem: rejects leaks, wrong forms and bad options', () => {
    const no = (raw, term, level, re) => { const r = buildItem(raw, term, level); assert.equal(r.ok, false, JSON.stringify(raw)); if (re) assert.match(r.reason, re); };
    no({ ...good.sentenceGap, answer: 'lake' }, FOG, 'A2', /not a form|not found/);
    no({ ...good.sentenceGap, sentence: 'Fog covered the harbour.', answer: 'Fog' }, FOG, 'A2', /start/);
    no({ ...good.sentenceGap, sentence: 'Fog is thick fog near the harbour.', answer: 'fog' }, FOG, 'A2');
    no({ ...good.sentenceGap, distractors: ['rain', 'rain', 'fog'] }, FOG, 'A2', /distractors/);
    no({ ...good.sentenceGap, distractors: ['rain'] }, FOG, 'A2', /distractors/);
    no({ ...good.sentenceGap, sentence: 'Thick ___ covered the harbour.' }, FOG, 'A2', /gap/);
    no({ ...good.sentenceGap, sentence: 'Thick fog covered the whole harbour and all the boats and the town and everybody there.' }, FOG, 'A1', /words/);
    // wordFormation
    no({ ...good.wordFormation, answer: 'fog', sentence: 'It was a cold fog morning.' }, FOG, 'B1', /stem/);
    no({ ...good.wordFormation, answer: 'happy', sentence: 'It was a cold happy morning.' }, FOG, 'B1', /derived/);
    no({ ...good.wordFormation, sentence: 'It was a foggy, cold and foggy morning.' }, FOG, 'B1', /leak/);
    // keyTransform
    no({ ...good.keyTransform, answer: 'was caught with a big old' }, NET, 'B2', /2–5/);
    no({ ...good.keyTransform, answer: 'caught using' }, NET, 'B2', /key word/);
    no({ ...good.keyTransform, answer: 'was' }, NET, 'B2', /2–5/);
    no({ ...good.keyTransform, template: 'The fish was ___ a net.' }, NET, 'B2', /key word appears/);
    no({ ...good.keyTransform, template: 'The fish ___ a net.', sourceSentence: 'The fish was caught with a net.' }, NET, 'B2', /identical/);
    no({ ...good.keyTransform, template: 'The ___ fish ___ a net.' }, NET, 'B2', /one gap/);
    no({ ...good.keyTransform, sourceSentence: 'They caught the fish.', template: 'The fish ___ a boat.', answer: 'was caught with' }, NET, 'B2', /target term/);
    // context true/false
    no({ ...good.contextTrueFalse, passage: 'The boats stayed in port that morning for hours.' }, FOG, 'A2', /target/);
    no({ ...good.contextTrueFalse, statement: 'Thick fog covered the harbour.' }, FOG, 'A2', /repeats/);
    no({ ...good.contextTrueFalse, correctTrue: 'yes' }, FOG, 'A2', /boolean/);
    // meaningPick options
    no({ ...good.meaningPick, distractors: ['mgła', 'mgła', 'x'] }, FOG, 'A1');
    no({ type: 'meaningPick', direction: 'both', distractors: ['a', 'b', 'c'] }, FOG, 'A1', /direction/);
    // letterScramble only for single words; hint must not leak
    no({ type: 'letterScramble', answer: 'give up', hint: 'x' }, GIVE, 'A1');
    no({ type: 'letterScramble', answer: 'fog', hint: 'thick fog outside' }, FOG, 'A1', /reveals/);
    assert.ok(buildItem({ type: 'letterScramble', answer: 'fog', hint: 'mgła' }, FOG, 'A1').ok);
    // phrasal verb gap
    assert.ok(buildItem({ type: 'sentenceGap', sentence: 'They had to step out of the room.', answer: 'step out of', distractors: ['give up', 'look for', 'run out'] }, STEP, 'A2').ok);
});

/* ---------------------------------------------------------------- generator (mock AI) */

function aiFor({ level, terms }) {
    const items = [];
    for (const t of terms) {
        if (t.id === '1') {
            items.push({ termId: '1', ...good.sentenceGap });
            if (level >= 'B') items.push({ termId: '1', ...good.wordFormation });
            items.push({ termId: '1', type: 'meaningPick', direction: 'pl-en', distractors: ['rain', 'wind', 'sand'] });
            items.push({ termId: '1', type: 'meaningPick', direction: 'en-pl', distractors: ['deszcz', 'wiatr', 'piasek'] });
        }
    }
    return { items, skipped: [] };
}

const REQ = (over = {}) => ({ setId: 'lake', level: 'B2', terms: [{ id: '1', en: 'fog', pl: 'mgła' }], types: ['sentenceGap', 'wordFormation', 'meaningPick'], userRef: '', ...over });

test('generator: returns validated items, banks them per term, never calls AI for banked terms', async () => {
    let calls = 0;
    const gen = createTrackGenerator({ runPrompt: async (prompt) => { calls++; assert.match(prompt, /CEFR level/); assert.ok(!/\[object/.test(prompt)); return aiFor({ level: 'B2', terms: [{ id: '1' }] }); } });
    const r = await gen(validateTrackRequest(REQ()).value);
    assert.equal(r.items.length, 4);
    assert.deepEqual(r.items.map((i) => i.type), ['meaningPick', 'meaningPick', 'sentenceGap', 'wordFormation'].sort((a, b) => ['meaningPick', 'sentenceGap', 'wordFormation'].indexOf(a) - ['meaningPick', 'sentenceGap', 'wordFormation'].indexOf(b)));
    assert.equal(calls, 1);
    const again = await gen(validateTrackRequest(REQ()).value);
    assert.equal(again.items.length, 4);
    assert.equal(calls, 1, 'second request served from cache');
    assert.equal(again.meta.bankHits, 1);
    // different level or changed term text = different cache entry
    await gen(validateTrackRequest(REQ({ level: 'B1' })).value);
    assert.equal(calls, 2);
    await gen(validateTrackRequest(REQ({ terms: [{ id: '1', en: 'fog', pl: 'mgiełka' }] })).value);
    assert.equal(calls, 3);
});

test('generator: invalid items are retried with feedback, then dropped (no fallback)', async () => {
    const prompts = [];
    const bad = { termId: '1', ...good.sentenceGap, answer: 'lake' };
    const gen = createTrackGenerator({ runPrompt: async (p) => { prompts.push(p); return { items: [bad], skipped: [] }; } });
    await assert.rejects(async () => { const r = await gen(validateTrackRequest(REQ({ types: ['sentenceGap'] })).value); assert.equal(r.items.length, 0); assert.equal(r.meta.dropped.length, 1); throw new Error('done'); }, /done/);
    assert.equal(prompts.length, LIMITS.maxAttempts);
    assert.match(prompts[1], /PREVIOUS ATTEMPT/);
    assert.match(prompts[1], /not a form of the target term|not found/);
});

test('generator: a retry that fixes the item is kept; model-declared skips are not retried', async () => {
    let n = 0;
    const gen = createTrackGenerator({ runPrompt: async () => {
        n++;
        if (n === 1) return { items: [{ termId: '1', ...good.sentenceGap, distractors: ['rain'] }], skipped: [{ termId: '1', type: 'wordFormation', reason: 'x' }] };
        return { items: [{ termId: '1', ...good.sentenceGap }], skipped: [] };
    } });
    const r = await gen(validateTrackRequest(REQ({ types: ['sentenceGap', 'wordFormation'] })).value);
    assert.equal(n, 2);
    assert.equal(r.items.length, 1);
    assert.equal(r.meta.dropped.length, 0);
});

test('generator: ignores items for unknown term ids and wrong types', async () => {
    const gen = createTrackGenerator({ runPrompt: async () => ({ items: [{ termId: '99', ...good.sentenceGap }, { termId: '1', ...good.wordFormation }, { termId: '1', ...good.sentenceGap }], skipped: [] }) });
    const r = await gen(validateTrackRequest(REQ({ types: ['sentenceGap'], level: 'B1' })).value);
    assert.deepEqual(r.items.map((i) => i.type), ['sentenceGap']);
});

test('prompt: carries level, strict JSON, terms and set words for distractors', () => {
    const wants = new Map([['1', new Set(['sentenceGap', 'meaningPick:pl-en'])]]);
    const p = buildTrackPrompt({ level: 'A2', terms: [FOG], setTerms: [FOG, NET], wants });
    assert.match(p, /A2/);
    assert.match(p, /ONLY valid JSON/);
    assert.match(p, /net = sieć/);
    assert.ok(!/keyTransform/.test(p.split('ITEM FORMATS')[1].split('RULES')[0]));
});

/* ---------------------------------------------------------------- bridge signature */

const PATH = TRACK_PATH;
function signedReq(bodyObj, { secret = SECRET, ts = Date.now(), nonce = `n${Math.random().toString(36).slice(2)}abcdefghij`.slice(0, 24), tamper = false } = {}) {
    const rawBody = Buffer.from(JSON.stringify(bodyObj));
    const sig = signBridgeRequest({ secret, timestamp: ts, nonce, path: PATH, rawBody });
    return { method: 'POST', rawBody: tamper ? Buffer.from(JSON.stringify({ ...bodyObj, setId: 'evil' })) : rawBody, headers: { [BRIDGE_HEADERS.timestamp]: String(ts), [BRIDGE_HEADERS.nonce]: nonce, [BRIDGE_HEADERS.signature]: sig } };
}

test('verifyBridgeRequest: good, tampered, stale, replayed, wrong secret, unconfigured', () => {
    const nonces = createNonceStore();
    const opts = { secret: SECRET, nonces, path: PATH };
    assert.ok(verifyBridgeRequest(signedReq({ a: 1 }), opts).ok);
    assert.equal(verifyBridgeRequest(signedReq({ a: 1 }, { tamper: true }), opts).code, 'bad_signature');
    assert.equal(verifyBridgeRequest(signedReq({ a: 1 }, { ts: Date.now() - 10 * 60_000 }), opts).code, 'stale_timestamp');
    assert.equal(verifyBridgeRequest(signedReq({ a: 1 }, { secret: 'another-secret-value-0123456789' }), opts).code, 'bad_signature');
    const r = signedReq({ a: 1 });
    assert.ok(verifyBridgeRequest(r, opts).ok);
    assert.equal(verifyBridgeRequest(r, opts).code, 'replayed_nonce');
    assert.equal(verifyBridgeRequest(signedReq({ a: 1 }), { ...opts, secret: '' }).status, 503);
    assert.equal(verifyBridgeRequest({ method: 'POST', rawBody: Buffer.from('{}'), headers: {} }, opts).code, 'bad_signature_headers');
});

/* ---------------------------------------------------------------- HTTP handler */

async function serve({ runPrompt, isConfigured = () => true, user = null, limiter, secret = SECRET, deadlineMs, now, schedule = () => {} } = {}) {
    const app = express();
    app.use((req, _res, next) => { req.isAuthenticated = () => Boolean(user); if (user) req.user = user; next(); });
    app.use(PATH, express.json({ limit: LIMITS.maxBodyBytes, verify: (req, _res, buf) => { req.rawBody = buf; } }));
    const generate = createTrackGenerator({ runPrompt, limits: { ...LIMITS, ...(deadlineMs ? { deadlineMs } : {}) } });
    app.post(PATH, createTrackGenerateHandler({ generate, isConfigured, getSecret: () => secret, limiter: limiter || createTrackLimiter(), now, schedule }));
    const server = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    return {
        base,
        close: () => new Promise((r) => server.close(r)),
        post: (body, headers = {}, raw) => fetch(base + PATH, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw ?? JSON.stringify(body) }),
        signed: async (body) => {
            const s = signedReq(body);
            return fetch(base + PATH, { method: 'POST', headers: { 'content-type': 'application/json', ...s.headers }, body: s.rawBody });
        },
    };
}
const okAi = async () => aiFor({ level: 'B2', terms: [{ id: '1' }] });
const BODY = { setId: 'lake', level: 'B2', terms: [{ id: '1', en: 'fog', pl: 'mgła' }], types: ['sentenceGap', 'wordFormation', 'meaningPick'] };

test('http: rejects unauthenticated, bad signature, wrong secret; AI not called', async () => {
    let calls = 0;
    const s = await serve({ runPrompt: async () => { calls++; return okAi(); } });
    try {
        assert.equal((await s.post(BODY)).status, 401);
        const r = await s.post(BODY, { [BRIDGE_HEADERS.timestamp]: String(Date.now()), [BRIDGE_HEADERS.nonce]: 'a'.repeat(20), [BRIDGE_HEADERS.signature]: `v1=${'A'.repeat(43)}` });
        assert.equal(r.status, 401);
        assert.equal((await r.json()).code, 'bad_signature');
        assert.equal(calls, 0);
    } finally { await s.close(); }
    const s2 = await serve({ runPrompt: okAi, secret: '' });
    try { assert.equal((await s2.signed(BODY)).status, 503); } finally { await s2.close(); }
});

test('http: signed app request and session request both work; body is validated', async () => {
    const s = await serve({ runPrompt: okAi });
    try {
        const r = await s.signed(BODY);
        assert.equal(r.status, 200);
        const j = await r.json();
        assert.equal(j.items.length, 4);
        assert.ok(j.items.some((i) => i.type === 'wordFormation' && i.answer === 'foggy'));
        assert.equal((await s.signed({ ...BODY, level: 'Z9' })).status, 400);
        assert.equal((await s.signed({ ...BODY, terms: Array.from({ length: 41 }, (_, i) => ({ id: String(i), en: 'fog', pl: 'x' })) })).status, 400);
    } finally { await s.close(); }
    const s2 = await serve({ runPrompt: okAi, user: { id: 7 } });
    try { assert.equal((await s2.post(BODY)).status, 200); } finally { await s2.close(); }
});

test('http: oversized body is refused (413) before any AI call', async () => {
    let calls = 0;
    const s = await serve({ runPrompt: async () => { calls++; return okAi(); }, user: { id: 7 } });
    try {
        const r = await s.post(null, {}, JSON.stringify({ ...BODY, junk: 'x'.repeat(LIMITS.maxBodyBytes) }));
        assert.equal(r.status, 413);
        assert.equal(calls, 0);
    } finally { await s.close(); }
});

test('http: per-user and global rate limits answer 429 with Retry-After', async () => {
    const limiter = createTrackLimiter({ limits: { ...LIMITS, userMax: 2, globalMax: 3 } });
    const s = await serve({ runPrompt: okAi, user: { id: 1 }, limiter });
    try {
        assert.equal((await s.post(BODY)).status, 200);
        assert.equal((await s.post(BODY)).status, 200);
        const r = await s.post(BODY);
        assert.equal(r.status, 429);
        assert.equal((await r.json()).code, 'rate_limited');
        assert.ok(Number(r.headers.get('retry-after')) > 0);
    } finally { await s.close(); }
    const l2 = createTrackLimiter({ limits: { ...LIMITS, userMax: 10, globalMax: 2 } });
    const s2 = await serve({ runPrompt: okAi, user: { id: 1 }, limiter: l2 });
    try {
        await s2.post(BODY); await s2.post(BODY);
        const r = await s2.post(BODY);
        assert.equal(r.status, 429);
        assert.equal((await r.json()).code, 'rate_limited_global');
    } finally { await s2.close(); }
});

test('http: one request at a time per user', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const s = await serve({ runPrompt: async () => { await gate; return okAi(); }, user: { id: 5 } });
    try {
        const first = s.post(BODY);
        await new Promise((r) => setTimeout(r, 100));
        const second = await s.post(BODY);
        assert.equal(second.status, 429);
        assert.equal((await second.json()).code, 'busy');
        release();
        assert.equal((await first).status, 200);
    } finally { release?.(); await s.close(); }
});

test('http: 503 without CURSOR_API_KEY, 504 on AI timeout, 502 when nothing validates', async () => {
    const s = await serve({ runPrompt: okAi, user: { id: 1 }, isConfigured: () => false });
    try {
        const r = await s.post(BODY);
        assert.equal(r.status, 503);
        assert.equal((await r.json()).code, 'ai_not_configured');
    } finally { await s.close(); }
    const s2 = await serve({ runPrompt: () => new Promise(() => {}), user: { id: 1 }, deadlineMs: 2500 });
    try {
        const r = await s2.post(BODY);
        assert.equal(r.status, 504);
        assert.equal((await r.json()).code, 'ai_timeout');
    } finally { await s2.close(); }
    const s3 = await serve({ runPrompt: async () => ({ items: [{ termId: '1', ...good.sentenceGap, answer: 'lake' }] }), user: { id: 1 } });
    try {
        const r = await s3.post({ ...BODY, types: ['sentenceGap'] });
        assert.equal(r.status, 502);
        assert.equal((await r.json()).code, 'ai_invalid');
    } finally { await s3.close(); }
});

test('lru cache evicts oldest and expires', () => {
    let t = 0;
    const c = createLruCache({ max: 2, ttlMs: 100, now: () => t });
    c.set('a', 1); c.set('b', 2); c.set('c', 3);
    assert.equal(c.get('a'), undefined);
    assert.equal(c.get('c'), 3);
    t = 500;
    assert.equal(c.get('c'), undefined);
});


/* ---------------------------------------------------------------- the question bank */

const gapReq = (over = {}) => ({ setId: 'lake', level: 'A2', terms: [{ id: '1', en: 'fog', pl: 'mgła' }], types: ['sentenceGap'], userRef: '', ...over });
const gapItem = (sentence, answer = 'fog', distractors = ['rain', 'wind', 'sand']) => ({ termId: '1', type: 'sentenceGap', sentence, answer, distractors });
const seqAi = (...replies) => { const calls = []; const fn = async (prompt) => { calls.push(prompt); return replies[Math.min(calls.length - 1, replies.length - 1)]; }; fn.calls = calls; return fn; };

test('bank: items are keyed by the term (en+pl) + level, not by setId; ids are rewritten to the requesting set', async () => {
    const ai = seqAi({ items: [gapItem('Thick fog covered the harbour.')] });
    const gen = createTrackGenerator({ runPrompt: ai });
    const a = await gen(validateTrackRequest(gapReq()).value);
    assert.equal(a.items[0].lexiconId, '1');
    assert.equal(ai.calls.length, 1);
    const b = await gen(validateTrackRequest(gapReq({ setId: 'a-totally-different-set', terms: [{ id: 'w-77', en: '  FOG ', pl: 'Mgła' }] })).value);
    assert.equal(ai.calls.length, 1, 'same word + meaning + level reuses the bank in another set');
    assert.equal(b.meta.bankHits, 1);
    assert.equal(b.items[0].lexiconId, 'w-77');
    assert.match(b.items[0].id, /^ai-w-77-sentenceGap-/);
    assert.equal(b.items[0].template, 'Thick ___ covered the harbour.');
    // homonym (different meaning) and other level are separate bank entries
    await gen(validateTrackRequest(gapReq({ terms: [{ id: '1', en: 'fog', pl: 'zamglenie umysłu' }] })).value);
    assert.equal(ai.calls.length, 2);
    await gen(validateTrackRequest(gapReq({ level: 'B1' })).value);
    assert.equal(ai.calls.length, 3);
    assert.equal(termKeyOf({ en: ' Fog ', pl: 'MGŁA' }), termKeyOf({ en: 'fog', pl: 'mgła' }));
    assert.notEqual(termKeyOf({ en: 'fog', pl: 'mgła' }), termKeyOf({ en: 'fog', pl: 'inne' }));
});

test('bank growth: grow() appends new items, refuses exact and near duplicates, tells the model what exists', async () => {
    const ai = seqAi({ items: [gapItem('Thick fog covered the harbour.')] });
    const bank = createBank();
    const gen = createTrackGenerator({ runPrompt: ai, bank, rand: () => 0 }); // rand 0 => growth always planned
    const first = await gen(validateTrackRequest(gapReq()).value);
    assert.equal(first.meta.newItems, 1);
    assert.equal(first.growPlan.length, 1, 'below the target, so growth is planned');
    const entries = () => bank.entries(termKeyOf({ en: 'fog', pl: 'mgła' }), 'A2');
    assert.equal((await entries()).length, 1);
    // exact duplicate and near-duplicate are both refused (retries exhausted, nothing added)
    ai.calls.length = 0;
    const dupAi = seqAi({ items: [gapItem('Thick fog covered the harbour.')] }, { items: [gapItem('Thick fog covered the whole harbour.')] });
    const gen2 = createTrackGenerator({ runPrompt: dupAi, bank, rand: () => 0 });
    const second = await gen2(validateTrackRequest(gapReq()).value);
    const g = await second.grow();
    assert.equal(g.added, 0);
    assert.match(dupAi.calls[0], /ALREADY WRITTEN/);
    assert.match(dupAi.calls[0], /Thick fog covered the harbour/);
    assert.equal((await entries()).length, 1);
    // a genuinely different item is appended
    const newAi = seqAi({ items: [gapItem('We could not see the road because of the fog.', 'fog', ['sun', 'ice', 'sky'])] });
    const gen3 = createTrackGenerator({ runPrompt: newAi, bank, rand: () => 0 });
    const third = await gen3(validateTrackRequest(gapReq()).value);
    assert.equal((await third.grow()).added, 1);
    assert.equal((await entries()).length, 2);
    // no growth is planned once the target is reached (probability 1 would still add, so use rand=1)
    const gen4 = createTrackGenerator({ runPrompt: seqAi({ items: [gapItem('Heavy fog made the morning ride very slow today.', 'fog', ['hay', 'ice', 'mud'])] }), bank, rand: () => 0 });
    await (await gen4(validateTrackRequest(gapReq()).value)).grow();
    assert.equal((await entries()).length, BANK_TARGET);
    const gen5 = createTrackGenerator({ runPrompt: seqAi({ items: [] }), bank, rand: () => 0.99 });
    assert.equal((await gen5(validateTrackRequest(gapReq()).value)).growPlan.length, 0, 'target reached and no lucky roll');
});

test('bank serving: varied selection, least-served first, so repeat learners get different questions', async () => {
    const bank = createBank();
    const term = { id: '1', en: 'fog', pl: 'mgła' };
    const sentences = ['Thick fog covered the harbour.', 'We could not see the road because of the fog.', 'Heavy fog made the morning ride very slow today.'];
    for (const [i, sen] of sentences.entries()) {
        const gen = createTrackGenerator({ runPrompt: seqAi({ items: [gapItem(sen, 'fog', [['rain', 'wind', 'sand'], ['sun', 'ice', 'sky'], ['hay', 'ice', 'mud']][i])] }), bank });
        // seed the bank directly through the generator's grow path
        await bank.add(term, 'A2', [{ slot: 'sentenceGap', item: buildItem({ termId: '1', ...gapItem(sen, 'fog', [['rain', 'wind', 'sand'], ['sun', 'ice', 'sky'], ['hay', 'ice', 'mud']][i]) }, term, 'A2').item }]);
        void gen;
    }
    const never = async () => { throw new Error('AI must not be called when the bank can serve'); };
    const gen = createTrackGenerator({ runPrompt: never, bank, rand: Math.random });
    const seen = [];
    for (let i = 0; i < 6; i++) {
        const r = await gen(validateTrackRequest(gapReq()).value);
        assert.equal(r.meta.bankHits, 1);
        seen.push(r.items[0].template);
    }
    assert.equal(new Set(seen.slice(0, 3)).size, 3, 'first three requests serve three different items');
    assert.equal(new Set(seen.slice(3, 6)).size, 3, 'then the cycle repeats evenly');
    const list = await bank.entries(termKeyOf(term), 'A2');
    assert.deepEqual(list.map((e) => e.servedCount), [2, 2, 2]);
});

test('bank reuse keeps options valid: 4 distinct, include the answer, distractors may come from the current set', async () => {
    const bank = createBank();
    const gen0 = createTrackGenerator({ runPrompt: seqAi({ items: [
        { termId: '1', type: 'meaningPick', direction: 'pl-en', distractors: ['rain', 'wind', 'sand'] },
        { termId: '1', type: 'meaningPick', direction: 'en-pl', distractors: ['deszcz', 'wiatr', 'piasek'] },
        { termId: '1', ...good.sentenceGap },
    ] }), bank });
    await gen0(validateTrackRequest(gapReq({ types: ['meaningPick', 'sentenceGap'] })).value);
    const bigSet = ['lake', 'net', 'boat', 'harbour', 'storm', 'island'].map((en, i) => ({ id: `s${i}`, en, pl: ['jezioro', 'sieć', 'łódź', 'port', 'burza', 'wyspa'][i] }));
    const never = async () => { throw new Error('no AI'); };
    const gen = createTrackGenerator({ runPrompt: never, bank });
    const swappedSeen = new Set();
    for (let i = 0; i < 40; i++) {
        const r = await gen(validateTrackRequest(gapReq({ setId: 'other', terms: [{ id: 'f', en: 'fog', pl: 'mgła' }, ...bigSet], types: ['meaningPick', 'sentenceGap'] })).value);
        for (const it of r.items.filter((x) => x.lexiconId === 'f')) {
            assert.equal(it.options.length, 4);
            assert.equal(new Set(it.options.map((o) => o.toLowerCase())).size, 4);
            assert.ok(it.options.includes(it.answer));
            if ('correctIndex' in it) assert.equal(it.options[it.correctIndex], it.answer);
            if (it.type === 'meaningPick' && it.direction === 'pl-en' && it.options.some((o) => ['lake', 'net', 'boat', 'harbour', 'storm', 'island'].includes(o))) swappedSeen.add('swap');
        }
    }
    assert.ok(swappedSeen.has('swap'), 'distractors are sometimes swapped for words of the current set');
});

test('bank persistence: a new process (new bank on the same store) reuses stored items; incompatible versions are not served', async () => {
    const rows = [];
    let nextId = 1;
    const store = {
        async loadTerm(termKey, level) { return rows.filter((r) => r.termKey === termKey && r.level === level).map((r) => ({ id: r.id, slot: r.slot, type: r.type, fp: r.fp, item: r.item, promptVersion: r.promptVersion, servedCount: r.served, lastServedAt: 0 })); },
        async insert(row) { if (rows.some((r) => r.termKey === row.termKey && r.level === row.level && r.fp === row.fp)) return null; const id = String(nextId++); rows.push({ ...row, id, served: 0 }); return id; },
        async markServed(ids) { for (const r of rows) if (ids.includes(r.id)) r.served++; },
    };
    const ai = seqAi({ items: [gapItem('Thick fog covered the harbour.')] });
    await createTrackGenerator({ runPrompt: ai, bank: createBank({ store }) })(validateTrackRequest(gapReq()).value);
    assert.equal(rows.length, 1);
    assert.equal(ai.calls.length, 1);
    const never = async () => { throw new Error('no AI'); };
    const r = await createTrackGenerator({ runPrompt: never, bank: createBank({ store }) })(validateTrackRequest(gapReq({ setId: 'x' })).value);
    assert.equal(r.items.length, 1);
    await new Promise((res) => setTimeout(res, 5));
    assert.equal(rows[0].served, 2, 'served_count persisted (once per request)');
    // retired prompt version: row stays in the table but is not served; the slot is regenerated
    rows[0].promptVersion = 'tg0-retired';
    const ai2 = seqAi({ items: [gapItem('We could not see the road because of the fog.', 'fog', ['sun', 'ice', 'sky'])] });
    const r2 = await createTrackGenerator({ runPrompt: ai2, bank: createBank({ store }) })(validateTrackRequest(gapReq()).value);
    assert.equal(ai2.calls.length, 1);
    assert.match(r2.items[0].template, /road/);
});

test('bank: model-declared skips (wordFormation for a phrasal verb) are remembered and not asked again', async () => {
    const bank = createBank();
    const step = { id: '3', en: 'step out of', pl: 'wyjść z' };
    const ai = seqAi({ items: [{ termId: '3', type: 'sentenceGap', sentence: 'They had to step out of the room.', answer: 'step out of', distractors: ['give up', 'look for', 'run out'] }], skipped: [{ termId: '3', type: 'wordFormation', reason: 'phrasal verb' }] });
    const req = validateTrackRequest({ setId: 's', level: 'B1', terms: [step], types: ['sentenceGap', 'wordFormation'] }).value;
    const gen = createTrackGenerator({ runPrompt: ai, bank });
    const a = await gen(req);
    assert.equal(a.items.length, 1);
    assert.equal(a.meta.dropped.length, 0);
    const b = await gen(req);
    assert.equal(ai.calls.length, 1, 'second request is fully served from the bank, skip remembered');
    assert.equal(b.meta.bankHits, 1);
    // the skip survives a restart (loaded from the store)
});

test('http: background growth runs after the response, within the background budget', async () => {
    const jobs = [];
    const aiCalls = [];
    const s = await serve({
        runPrompt: async (prompt) => { aiCalls.push(prompt); return okAi(); }, user: { id: 1 }, schedule: (fn) => jobs.push(fn),
    });
    try {
        const r = await s.post({ ...BODY, setId: 'grow-set' });
        assert.equal(r.status, 200);
        assert.equal((await r.json()).meta.newItems, 4);
        assert.equal(aiCalls.length, 1, 'foreground only');
        assert.equal(jobs.length, 1, 'growth scheduled for after the response');
        await jobs[0]();
        assert.equal(aiCalls.length >= 2, true, 'growth asked the AI for more items');
        assert.match(aiCalls[1], /ALREADY WRITTEN/);
    } finally { await s.close(); }
    const limiter = createTrackLimiter({ limits: { ...LIMITS, bgMax: 1 } });
    assert.equal(limiter.tryStartBackground(), true);
    limiter.finishBackground();
    assert.equal(limiter.tryStartBackground(), false, 'hourly background budget used up');
});

/* ---------------------------------------------------------------- speed: parallel small calls, response budget */

const WORDS = [['1', 'fog', 'mgła'], ['2', 'boat', 'łódź'], ['3', 'lake', 'jezioro'], ['4', 'sand', 'piasek'], ['5', 'wave', 'fala'], ['6', 'shore', 'brzeg']];
const SPEED_TERMS = WORDS.map(([id, en, pl]) => T(id, en, pl));
const speedReq = (over = {}) => ({ setId: 'speed', level: 'A2', terms: SPEED_TERMS, types: ['sentenceGap'], userRef: '', ...over });
/** Mock model: answers every wanted sentenceGap in the prompt, after `delayFor(prompt)` ms. */
function slowAi({ delayFor = () => 50, bad = () => false } = {}) {
    const state = { calls: [], running: 0, maxRunning: 0, perTerm: new Map() };
    const fn = async (prompt) => {
        state.calls.push(prompt);
        state.running++; state.maxRunning = Math.max(state.maxRunning, state.running);
        await new Promise((r) => setTimeout(r, delayFor(prompt, state.calls.length)));
        state.running--;
        const items = [];
        for (const m of prompt.matchAll(/- termId "([^"]+)": en "([^"]+)"/g)) {
            const [, termId, en] = m;
            const nth = (state.perTerm.get(termId) || 0) + 1; state.perTerm.set(termId, nth);
            items.push({ termId, type: 'sentenceGap', sentence: `We saw the ${en} from the old bridge.`, answer: bad(termId, nth) ? 'bridge' : en, distractors: ['table', 'window', 'garden'] });
        }
        return { items, skipped: [] };
    };
    fn.state = state;
    return fn;
}
const mkGen = (ai, limits = {}) => createTrackGenerator({ runPrompt: ai, limits: { ...LIMITS, ...limits } });

test('planCalls: small calls in term order, every slot exactly once, big terms split, small ones share a call', () => {
    const slots = (t) => new Set(['letterScramble', 'meaningPick:pl-en', 'meaningPick:en-pl', 'sentenceGap', 'gapTranslate', 'sentenceOrder', 'translateType', 'listenPick', 'dictation', 'contextTrueFalse', 'collocationPick', 'wordFormation', 'keyTransform'].map((x) => x));
    const jobs = SPEED_TERMS.map((term) => ({ term, slots: slots(), avoid: [] }));
    const calls = planCalls(jobs);
    assert.ok(calls.length >= SPEED_TERMS.length * 2, `a B1 term is cut into at least 2 calls (got ${calls.length} calls for ${SPEED_TERMS.length} terms)`);
    const seen = new Map();
    for (const call of calls) for (const p of call) for (const sl of p.slots) { const k = `${p.term.id}|${sl}`; assert.ok(!seen.has(k), `${k} planned twice`); seen.set(k, 1); }
    assert.equal(seen.size, SPEED_TERMS.length * 13);
    const order = calls.map((c) => Number(c[0].term.id));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'calls follow the term order (first stations first)');
    // tiny jobs (one slot each) are packed together instead of one call per term
    const tiny = planCalls(SPEED_TERMS.map((term) => ({ term, slots: new Set(['listenPick']), avoid: [] })));
    assert.ok(tiny.length < SPEED_TERMS.length);
    assert.equal(tiny.flat().length, SPEED_TERMS.length);
});

test('speed: calls run in parallel, not one after another', async () => {
    const ai = slowAi({ delayFor: () => 300 });
    const gen = mkGen(ai, { callWeight: 60 }); // one sentenceGap (70) per call => 6 calls
    const t0 = Date.now();
    const r = await gen(validateTrackRequest(speedReq()).value);
    const ms = Date.now() - t0;
    assert.equal(r.items.length, 6);
    assert.equal(ai.state.calls.length, 6);
    assert.ok(ai.state.maxRunning >= 6, `all calls overlapped (max ${ai.state.maxRunning})`);
    assert.ok(ms < 900, `took ${ms} ms, a sequential run would need 1800`);
    assert.equal(r.meta.timedOut, false);
    assert.equal(r.meta.pendingCalls, 0);
});

test('speed: process-wide call limit is respected', async () => {
    const ai = slowAi({ delayFor: () => 60 });
    const gen = mkGen(ai, { callWeight: 60, callConcurrency: 6, globalCallConcurrency: 2 });
    const r = await gen(validateTrackRequest(speedReq()).value);
    assert.equal(r.items.length, 6);
    assert.equal(ai.state.maxRunning, 2);
});

test('budget: answers at the budget with what is ready; slow calls keep going and land in the bank', async () => {
    const ai = slowAi({ delayFor: (p) => (/en "(shore|wave)"/.test(p) ? 900 : 40) });
    const gen = mkGen(ai, { callWeight: 60, minBudgetMs: 100 });
    const t0 = Date.now();
    const r = await gen({ ...validateTrackRequest(speedReq()).value, budgetMs: 300 });
    const ms = Date.now() - t0;
    assert.ok(ms < 700, `answered after ${ms} ms, not after the slow calls`);
    assert.equal(r.items.length, 4);
    assert.deepEqual(r.meta.missingTerms.sort(), ['5', '6']);
    assert.equal(r.meta.timedOut, true);
    assert.equal(r.meta.budgetMs, 300);
    assert.equal(r.meta.pendingCalls, 2);
    await new Promise((res) => setTimeout(res, 1100));
    const callsBefore = ai.state.calls.length;
    const again = await gen(validateTrackRequest(speedReq()).value);
    assert.equal(again.items.length, 6, 'the late answers were stored');
    assert.equal(again.meta.bankHits, 6);
    assert.equal(ai.state.calls.length, callsBefore, 'second request needs no AI');
});

test('budget: default is 9 s, a request may ask for less (1.5 s) up to the hard deadline, nothing else', () => {
    assert.equal(LIMITS.budgetMs, 9000);
    assert.equal(validateTrackRequest(speedReq()).value.budgetMs, undefined);
    assert.equal(validateTrackRequest(speedReq({ budgetMs: 4000 })).value.budgetMs, 4000);
    assert.equal(validateTrackRequest(speedReq({ budgetMs: 20 })).ok, false);
    assert.equal(validateTrackRequest(speedReq({ budgetMs: 'soon' })).ok, false);
    assert.equal(validateTrackRequest(speedReq({ budgetMs: LIMITS.deadlineMs + 1 })).ok, false);
});

test('retries: a failed validation is retried inside the request while there is time, and in the background when there is not', async () => {
    // plenty of time: retry fixes it inside the request
    const ai = slowAi({ delayFor: () => 20, bad: (id, nth) => id === '1' && nth === 1 });
    const gen = mkGen(ai, { callWeight: 60 });
    const r = await gen(validateTrackRequest(speedReq()).value);
    assert.equal(r.items.length, 6, 'term 1 was retried before answering');
    assert.equal(ai.state.calls.length, 7);
    // not enough time left for a retry (retryMinRemainingMs > budget): answer first, retry lands in the bank afterwards
    const ai2 = slowAi({ delayFor: () => 20, bad: (id, nth) => id === '1' && nth === 1 });
    const gen2 = mkGen(ai2, { callWeight: 60, retryMinRemainingMs: 60_000 });
    const t0 = Date.now();
    const r2 = await gen2(validateTrackRequest(speedReq({ setId: 'speed2' })).value);
    assert.equal(r2.items.length, 5, 'answered without waiting for the retry');
    assert.deepEqual(r2.meta.missingTerms, ['1']);
    assert.ok(Date.now() - t0 < 500);
    await new Promise((res) => setTimeout(res, 200));
    const r3 = await gen2(validateTrackRequest(speedReq({ setId: 'speed2' })).value);
    assert.equal(r3.items.length, 6, 'background retry filled the bank');
    assert.equal(ai2.state.calls.length, 7);
});

test('prompt: a big set lists at most promptSetTerms words (targets always included)', () => {
    const many = Array.from({ length: 40 }, (_, i) => T(String(i), `word${i}`, `słowo${i}`));
    const p = buildTrackPrompt({ level: 'A2', terms: [many[30]], setTerms: many, wants: new Map([['30', new Set(['sentenceGap'])]]) });
    const line = p.split('\n').find((l) => l.startsWith('WHOLE SET'));
    assert.equal(line.split(';').length, LIMITS.promptSetTerms);
    assert.match(line, /word30 = /);
});

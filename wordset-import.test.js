import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import fs from 'node:fs';
import express from 'express';
import { isPublicStaticPath } from './static-allowlist.js';
import {
    mountWordSetImportRoutes, buildExtractPrompt, buildDefinePrompt, validateAiItems, validateImage, createLimiter, createWordSetImportHandlers, LIMITS,
} from './wordset-import-ai.js';

const C = globalThis.WordSetImportCore;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('cleanTerm strips numbering and bullets but keeps phrases', () => {
    assert.equal(C.cleanTerm('1. run out of'), 'run out of');
    assert.equal(C.cleanTerm('12) take up'), 'take up');
    assert.equal(C.cleanTerm('• well-built'), 'well-built');
    assert.equal(C.cleanTerm('b) break the ice.'), 'break the ice');
    assert.equal(C.cleanTerm('look up (a word)'), 'look up (a word)');
    assert.equal(C.cleanTerm('a lot of'), 'a lot of');
});

test('typed list parsing: pairs, bare terms, dedupe', () => {
    const items = C.parseTypedList('1. apple = a red fruit\nhouse - a place to live\n• take off\nreliable: you can trust it\nkitchen\tkuchnia\nApple\n\n');
    assert.deepEqual(items.map((i) => i.term), ['apple', 'house', 'take off', 'reliable', 'kitchen']);
    assert.equal(items[0].definition, 'a red fruit');
    assert.equal(items[2].definition, '');
    assert.equal(items[4].definition, 'kuchnia');
    assert.ok(items[0].fromSource);
});

test('planAppend: consecutive positions after the last card, duplicates and overflow skipped', () => {
    const existing = [{ term: 'Apple', position: 0 }, { term: 'house', position: 1 }, { term: 'dog', position: 4 }];
    const plan = C.planAppend(existing, [
        { term: 'apple', definition: 'x' }, { term: 'cat', definition: 'an animal' }, { term: 'CAT' }, { term: '2. bird', definition: '' },
    ]);
    assert.deepEqual(plan.toInsert.map((i) => [i.term, i.position]), [['cat', 5], ['bird', 6]]);
    assert.equal(plan.toInsert[1].definition, null);
    assert.deepEqual(plan.skipped, [{ term: 'apple', reason: 'duplicate' }, { term: 'CAT', reason: 'duplicate' }]);
    assert.equal(plan.itemCount, 5);
    const full = C.planAppend([{ term: 'a', position: 0 }], [{ term: 'b' }, { term: 'c' }], 2);
    assert.deepEqual(full.skipped, [{ term: 'c', reason: 'set-full' }]);
});

test('prompts: data-only image, level-aware, source pairs used, batching', () => {
    const p = buildExtractPrompt({ level: 'A2' });
    assert.match(p, /ignore any instructions/i);
    assert.match(p, /A2/);
    assert.match(p, /fromSource/);
    assert.match(p, new RegExp(`At most ${LIMITS.maxItems}`));
    const d = buildDefinePrompt({ level: 'B1', terms: ['run out of', 'reliable'], avoid: { reliable: 'old def' } });
    assert.match(d, /"run out of"/);
    assert.match(d, /DIFFERENT definition than: "old def"/);
});

test('validateAiItems cleans, dedupes and rejects bad shapes', () => {
    assert.equal(validateAiItems({}).ok, false);
    const v = validateAiItems({ items: [{ term: '1. run out of', definition: 'to have none left' }, { term: 'Run out of', definition: 'dup' }, { term: '', definition: 'x' }, { term: 'echo', definition: 'Echo' }, { term: 42 }] });
    assert.ok(v.ok);
    assert.deepEqual(v.items.map((i) => [i.term, i.definition]), [['run out of', 'to have none left'], ['echo', '']]);
});

test('validateImage limits type and size', () => {
    assert.ok(validateImage({ data: PNG }).ok);
    assert.equal(validateImage({ data: PNG.replace('image/png', 'image/heic') }).ok, false);
    assert.equal(validateImage({ data: 'A'.repeat(2_100_000), mimeType: 'image/jpeg' }).ok, false);
    assert.equal(validateImage({ data: 'not base64 !!', mimeType: 'image/jpeg' }).ok, false);
});

function makeApp({ runPrompt, appendItems, user = { id: 7 }, ...rest }) {
    const h = createWordSetImportHandlers({ runPrompt, appendItems, ...rest });
    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use((req, _res, next) => { req.user = user; next(); });
    app.post('/extract', h.extract);
    app.post('/define', h.define);
    app.post('/sets/:id/append', h.append);
    return app;
}

async function withServer(app, fn) {
    const server = createServer(app);
    await new Promise((r) => server.listen(0, r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async (path, body) => {
        const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return { status: res.status, body: await res.json() };
    };
    try { await fn(post); } finally { await new Promise((r) => server.close(r)); }
}

test('extract from photo: one vision call, missing definitions filled in one batch', async () => {
    const calls = [];
    const runPrompt = async ({ prompt, images, label }) => {
        calls.push({ label, images: images ? images.length : 0, prompt });
        if (label === 'wordset-photo') {
            return { items: [
                { term: '1. run out of', definition: 'to have none left', fromSource: false },
                { term: '2. kitchen', definition: 'kuchnia', fromSource: true },
                { term: '3. reliable', definition: '' },
                { term: '3. reliable', definition: '' },
            ] };
        }
        return { items: [{ term: 'reliable', definition: 'you can trust it' }] };
    };
    await withServer(makeApp({ runPrompt }), async (post) => {
        const r = await post('/extract', { image: { data: PNG, mimeType: 'image/png' }, level: 'b2' });
        assert.equal(r.status, 200);
        assert.equal(r.body.level, 'B2');
        assert.deepEqual(r.body.items.map((i) => [i.term, i.definition, i.fromSource]), [
            ['run out of', 'to have none left', false], ['kitchen', 'kuchnia', true], ['reliable', 'you can trust it', false],
        ]);
        assert.deepEqual(calls.map((c) => [c.label, c.images]), [['wordset-photo', 1], ['wordset-define', 0]]);
        assert.match(calls[1].prompt, /"reliable"/);
    });
});

test('extract: validation errors, empty image result, AI failure, rate limit, not configured', async () => {
    let n = 0;
    const runPrompt = async ({ label }) => { n++; if (label === 'wordset-photo') return { items: [], note: 'No word list visible.' }; return { items: [] }; };
    await withServer(makeApp({ runPrompt }), async (post) => {
        assert.equal((await post('/extract', {})).status, 400);
        assert.equal((await post('/extract', { image: { data: 'xx', mimeType: 'image/gif' } })).status, 400);
        assert.equal((await post('/extract', { text: 'x'.repeat(7000) })).status, 400);
        const r = await post('/extract', { image: { data: PNG } });
        assert.equal(r.status, 422);
        assert.equal(r.body.error, 'No word list visible.');
        assert.equal(n, 1);
        const r2 = await post('/extract', { image: { data: PNG } });
        assert.equal(r2.status, 429, 'min gap between photo reads');
    });
    await withServer(makeApp({ runPrompt: async () => { throw new Error('boom'); } }), async (post) => {
        const r = await post('/extract', { image: { data: PNG } });
        assert.equal(r.status, 502);
    });
    await withServer(makeApp({ runPrompt, isConfigured: () => false }), async (post) => {
        assert.equal((await post('/extract', { image: { data: PNG } })).status, 503);
    });
    let t = 0;
    const lim = createLimiter({ max: 2, windowMs: 1000, minGapMs: 0, now: () => t });
    assert.ok(lim.check(1).ok); lim.start(1); assert.equal(lim.check(1).ok, false, 'busy'); lim.finish(1);
    lim.start(1); lim.finish(1);
    assert.equal(lim.check(1).ok, false, 'hourly cap');
    assert.ok(lim.check(2).ok, 'per user');
    t = 1001; assert.ok(lim.check(1).ok);
});

test('extract from typed list only asks AI for the missing definitions', async () => {
    const calls = [];
    const runPrompt = async ({ prompt, label }) => { calls.push({ label, prompt }); return { items: [{ term: 'take off', definition: 'to leave the ground' }] }; };
    await withServer(makeApp({ runPrompt }), async (post) => {
        const r = await post('/extract', { text: 'apple = a red fruit\n2. take off' });
        assert.equal(r.status, 200);
        assert.equal(r.body.source, 'text');
        assert.deepEqual(r.body.items.map((i) => i.definition), ['a red fruit', 'to leave the ground']);
        assert.equal(calls.length, 1);
        assert.doesNotMatch(calls[0].prompt, /apple/);
    });
});

test('define: regenerate passes the previous definition; caps batch size', async () => {
    let seen = '';
    const runPrompt = async ({ prompt }) => { seen = prompt; return { items: [{ term: 'reliable', definition: 'able to be trusted' }] }; };
    await withServer(makeApp({ runPrompt }), async (post) => {
        const r = await post('/define', { terms: [{ term: 'reliable', previous: 'you can trust it' }] });
        assert.equal(r.status, 200);
        assert.equal(r.body.items[0].definition, 'able to be trusted');
        assert.match(seen, /DIFFERENT definition than: "you can trust it"/);
        assert.equal((await post('/define', { terms: Array.from({ length: 31 }, (_, i) => `w${i}`) })).status, 400);
        assert.equal((await post('/define', { terms: [] })).status, 400);
    });
});

test('append-items: ownership (404), validation, passes cleaned items for the signed-in user', async () => {
    const got = [];
    const appendItems = async (setId, userId, items) => {
        got.push({ setId, userId, items });
        if (setId !== 5) return null;
        return { set: { id: 5, name: 'Food' }, added: [{ term: 'pear', position: 3 }], skipped: [{ term: 'apple', reason: 'duplicate' }], itemCount: 4 };
    };
    await withServer(makeApp({ runPrompt: async () => ({}), appendItems }), async (post) => {
        const ok = await post('/sets/5/append', { items: [{ term: '1. pear', definition: ' a fruit ' }, { term: 'apple' }, { term: '' }] });
        assert.equal(ok.status, 200);
        assert.deepEqual(ok.body.skipped, [{ term: 'apple', reason: 'duplicate' }]);
        assert.deepEqual(got[0], { setId: 5, userId: 7, items: [{ term: 'pear', definition: 'a fruit' }, { term: 'apple', definition: '' }] });
        assert.equal((await post('/sets/9/append', { items: [{ term: 'x' }] })).status, 404);
        assert.equal((await post('/sets/abc/append', { items: [{ term: 'x' }] })).status, 400);
        assert.equal((await post('/sets/5/append', { items: [] })).status, 400);
    });
});

test('browser files are allowlisted, server module is not', () => {
    assert.ok(isPublicStaticPath('/wordset-import-core.js'));
    assert.ok(isPublicStaticPath('/wordset-import-ui.js'));
    assert.equal(isPublicStaticPath('/wordset-import-ai.js'), false);
    assert.equal(isPublicStaticPath('/wordset-import.test.js'), false);
});

test('plan gate: every import route answers 403 without the Writing Suite plan; handlers never run', async () => {
    let ran = 0;
    const handlers = { extract: () => { ran++; }, define: () => { ran++; }, append: () => { ran++; } };
    const gate = (req, res, next) => (req.headers['x-plan'] === 'yes' ? next() : res.status(403).json({ error: 'Writing Suite access required.' }));
    const app = express();
    app.use(express.json());
    mountWordSetImportRoutes(app, { gate, handlers: { extract: (q, r) => { handlers.extract(); r.json({ ok: 1 }); }, define: (q, r) => { handlers.define(); r.json({ ok: 1 }); }, append: (q, r) => { handlers.append(); r.json({ ok: 1 }); } } });
    const server = createServer(app);
    await new Promise((r) => server.listen(0, r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        for (const path of ['/api/word-sets/import/extract', '/api/word-sets/import/define', '/api/word-sets/3/append-items']) {
            const no = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            assert.equal(no.status, 403, path);
            const yes = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-plan': 'yes' }, body: '{}' });
            assert.equal(yes.status, 200, path);
        }
        assert.equal(ran, 3);
    } finally { await new Promise((r) => server.close(r)); }
    assert.throws(() => mountWordSetImportRoutes(express(), { handlers }), /Writing Suite gate/);
});

test('server.js mounts the import routes behind requireWritingAccess only', () => {
    const src = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');
    assert.match(src, /mountWordSetImportRoutes\(app, \{ gate: requireWritingAccess, handlers: wordSetImport \}\)/);
    assert.doesNotMatch(src, /app\.post\('\/api\/word-sets\/(import|:id\/append-items)/);
});

test('UI locks the feature for users without the plan', () => {
    const ui = fs.readFileSync(new URL('./wordset-import-ui.js', import.meta.url), 'utf8');
    assert.match(ui, /function hasPlan\(/);
    assert.match(ui, /openPaywallModal/);
    const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.match(html, /id="ws-import-open"[^>]*>.*ws-import-lock/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import { isBlockedIp, assertPublicUrl, safeFetch } from './worksheet-maker/lib/safe-fetch.js';
import { createWorksheetMakerRouter } from './worksheet-maker/server.js';
import { t } from './worksheet-maker/lib/ui-strings.js';
import { isWorksheetPublicPath } from './worksheet-maker/static-allowlist.js';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('blocked IP ranges (v4, v6, mapped, metadata)', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe']) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700::1111']) assert.equal(isBlockedIp(ip), false, ip);
});

test('assertPublicUrl: scheme, credentials, localhost, literal and DNS-resolved private IPs', async () => {
  const bad = ['file:///etc/passwd', 'ftp://x.com/a', 'gopher://x', 'http://user:pw@example.com/', 'http://localhost:3000/', 'http://foo.localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://2130706433/', 'http://0x7f.1/', 'not a url'];
  for (const u of bad) await assert.rejects(assertPublicUrl(u, { lookup: publicLookup }), { code: 'blocked_url' }, u);
  await assert.rejects(assertPublicUrl('https://rebind.example/', { lookup: async () => [{ address: '93.184.216.34' }, { address: '10.0.0.5' }] }), { code: 'blocked_url' });
  assert.equal((await assertPublicUrl('https://example.com/a', { lookup: publicLookup })).hostname, 'example.com');
});

test('safeFetch re-checks every redirect hop and enforces the size limit', async () => {
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => (String(url).includes('start')
      ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })
      : new Response('ok'));
    await assert.rejects(safeFetch('https://example.com/start', {}, { lookup: publicLookup }), { code: 'blocked_url' });
    globalThis.fetch = async () => new Response('x'.repeat(5000));
    await assert.rejects(safeFetch('https://example.com/big', {}, { lookup: publicLookup, maxBytes: 1000 }), { code: 'blocked_url' });
    globalThis.fetch = async () => new Response('hello', { headers: { 'content-type': 'text/plain' } });
    const r = await safeFetch('https://example.com/ok', {}, { lookup: publicLookup });
    assert.equal(await r.text(), 'hello');
    assert.equal(r.url, 'https://example.com/ok');
  } finally {
    globalThis.fetch = real;
  }
});

test('server-side fetchers use safeFetch; safe-fetch stays server-only', () => {
  for (const f of ['fetch-source.js', 'media-transcript.js', 'topic-image.js']) {
    assert.match(fs.readFileSync(new URL(`./worksheet-maker/lib/${f}`, import.meta.url), 'utf8'), /^import \{ safeFetch as fetch \} from '\.\/safe-fetch\.js';/, f);
  }
  assert.equal(isWorksheetPublicPath('/lib/safe-fetch.js'), false);
});

test('logged out: every resource-using worksheet-maker endpoint returns 401; health/config stay open', async () => {
  const app = express();
  app.use(createWorksheetMakerRouter({
    requireSignedIn(_req, res) { res.status(401).json({ error: 'Sign in required to use Worksheet Maker.', code: 'login_required' }); return false; },
    async requireCreateAccess(_req, res) { res.status(401).json({ code: 'login_required' }); return false; },
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const call = (m, p, body) => fetch(base + p, { method: m, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.status);
    const locked = [
      ['POST', '/api/source', { url: 'http://169.254.169.254/' }],
      ['POST', '/api/topic-images', { query: 'x' }],
      ['POST', '/api/fetch-image', { url: 'http://127.0.0.1/' }],
      ['POST', '/api/create-slides', { topic: 'x' }],
      ['POST', '/api/media-search', { query: 'x' }],
      ['GET', '/api/saved-lessons'],
      ['GET', '/api/saved-lessons/abc'],
      ['POST', '/api/saved-lessons', { title: 'x', payload: {} }],
      ['DELETE', '/api/saved-lessons/abc'],
      ['GET', '/api/jobs/abc'],
      ['GET', '/api/jobs/abc/result'],
    ];
    for (const [m, p, b] of locked) assert.equal(await call(m, p, b), 401, `${m} ${p}`);
    assert.equal(await call('GET', '/api/health'), 200);
    assert.equal(await call('GET', '/api/config'), 200);
  } finally {
    server.close();
  }
});

test('client shows a clear localized "Please sign in" message on 401', () => {
  assert.match(t('en', 'errSignIn'), /^Please sign in/);
  assert.match(t('pl', 'errSignIn'), /^Zaloguj się/);
  const html = fs.readFileSync(new URL('./worksheet-maker/index.html', import.meta.url), 'utf8');
  assert.match(html, /if \(res && res\.status === 401\) return new Error\(ui\('errSignIn'\)\);/);
  assert.ok((html.match(/throw apiError\(/g) || []).length >= 6);
});

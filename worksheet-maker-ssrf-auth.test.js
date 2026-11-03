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
    isSignedIn: () => false,
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
      ['GET', '/api/saved-lessons/abc'],
      ['POST', '/api/saved-lessons', { title: 'x', payload: {} }],
      ['DELETE', '/api/saved-lessons/abc'],
      ['GET', '/api/jobs/abc'],
      ['GET', '/api/jobs/abc/result'],
    ];
    for (const [m, p, b] of locked) assert.equal(await call(m, p, b), 401, `${m} ${p}`);
    assert.equal(await call('GET', '/api/health'), 200);
    assert.equal(await call('GET', '/api/config'), 200);
    // page-load mirror check: empty list, no data, no 401 in the console
    const list = await fetch(`${base}/api/saved-lessons`).then(async (r) => [r.status, await r.json()]);
    assert.deepEqual(list, [200, { items: [], signedIn: false }]);
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

test('safe-fetch: video hosts resolving to public v4/v6/NAT64 addresses are allowed', async () => {
  const { assertPublicUrl: apu } = await import('./worksheet-maker/lib/safe-fetch.js');
  const cases = [
    ['https://www.youtube.com/watch?v=WJhCa12UTsg', ['142.250.186.46', '2a00:1450:401b:80e::200e']],
    ['https://youtu.be/WJhCa12UTsg', ['64:ff9b::8efa:bb2e']],
    ['https://www.youtube.com/shorts/WJhCa12UTsg', ['64:ff9b::142.250.186.46']],
    ['https://i.ytimg.com/vi/WJhCa12UTsg/hqdefault.jpg', ['::ffff:142.250.186.46', '2a00:1450:4001:82b::2016']],
    ['https://cdn.example.com/a.mp3', ['192.0.1.5']],
  ];
  for (const [url, ips] of cases) {
    const u = await apu(url, { lookup: async () => ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) });
    assert.ok(u instanceof URL, url);
  }
});

test('safe-fetch: private / loopback / metadata / ULA / NAT64-metadata are blocked', async () => {
  const { assertPublicUrl: apu, isBlockedIp: ib } = await import('./worksheet-maker/lib/safe-fetch.js');
  for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '::1', 'fd00::1', '64:ff9b::a9fe:a9fe', '64:ff9b::127.0.0.1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '192.0.0.8', '192.0.2.1', '100.64.0.1', 'fe80::1', 'ff02::1', '::']) {
    assert.equal(ib(ip), true, ip);
    const warn = console.warn; console.warn = () => {};
    try {
      await assert.rejects(apu('https://evil.example/', { lookup: async () => [{ address: ip, family: ip.includes(':') ? 6 : 4 }] }), /private address/, ip);
    } finally { console.warn = warn; }
  }
  for (const ip of ['142.250.186.46', '2a00:1450:401b:80e::200e', '64:ff9b::8efa:bb2e', '192.0.1.5']) assert.equal(ib(ip), false, ip);
});

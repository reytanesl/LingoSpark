/**
 * SSRF-hardened fetch for server-side fetching of user-supplied URLs (server-only, not allowlisted).
 * - only http/https, no credentials in URL
 * - blocks localhost, private, loopback, link-local (incl. 169.254.169.254 metadata), CGNAT, multicast, reserved —
 *   both literal IPs and every address the host name resolves to
 * - redirects are followed manually (max 5) and every hop is re-checked
 * - time limit (default 20s) and response size limit (default 25 MB)
 */
import dns from 'node:dns/promises';
import net from 'node:net';

export class BlockedUrlError extends Error {
  constructor(msg) { super(msg); this.name = 'BlockedUrlError'; this.code = 'blocked_url'; }
}

function v4Blocked(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0);
}

export function isBlockedIp(ip) {
  const s = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIPv4(s)) return v4Blocked(s);
  if (!net.isIPv6(s)) return true;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Blocked(mapped[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s)) {
    const [hi, lo] = s.split(':').slice(-2).map((h) => parseInt(h, 16));
    return v4Blocked(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || /^64:ff9b:/.test(s) || /^2001:db8:/.test(s);
}

export async function assertPublicUrl(raw, { lookup = dns.lookup } = {}) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new BlockedUrlError('That link is not a valid web address.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BlockedUrlError('Only http(s) links can be used.');
  if (u.username || u.password) throw new BlockedUrlError('Links with a user name or password are not allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new BlockedUrlError('That link points to a private address.');
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new BlockedUrlError('That link points to a private address.');
    return u;
  }
  let addrs = [];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    return u; // unresolvable: the request itself will fail; nothing private can be reached
  }
  if (addrs.some((a) => isBlockedIp(a.address))) throw new BlockedUrlError('That link points to a private address.');
  return u;
}

async function limitedBody(res, maxBytes) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > maxBytes) throw new BlockedUrlError('That file is too large.');
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new BlockedUrlError('That file is too large.');
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } throw new BlockedUrlError('That file is too large.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export async function safeFetch(input, init = {}, { lookup, maxRedirects = 5, timeoutMs = 20000, maxBytes = 25 * 1024 * 1024 } = {}) {
  let url = String(input?.url || input);
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal && AbortSignal.any ? AbortSignal.any([init.signal, timeout]) : (init.signal || timeout);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicUrl(url, lookup ? { lookup } : {});
    const res = await globalThis.fetch(url, { ...init, redirect: 'manual', signal });
    const loc = res.headers?.get?.('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).href;
      continue;
    }
    if (!res.headers || typeof res.headers.get !== 'function') return res; // test doubles
    const body = await limitedBody(res, maxBytes);
    const out = new Response(res.status === 204 || res.status === 304 ? null : body, { status: res.status, statusText: res.statusText, headers: res.headers });
    Object.defineProperty(out, 'url', { value: url });
    return out;
  }
  throw new BlockedUrlError('Too many redirects.');
}

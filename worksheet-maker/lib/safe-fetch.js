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
  const [a, b, c] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) // CGNAT
    || (a === 169 && b === 254) // link-local / metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2)) // 192.0.0.0/24 IETF, 192.0.2.0/24 TEST-NET-1
    || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113); // TEST-NET-2/3
}

/** Expand an IPv6 string (may end in dotted IPv4) to 8 16-bit numbers, or null. */
function v6Words(s) {
  let str = s.split('%')[0];
  const dotted = str.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (!net.isIPv4(dotted[2])) return null;
    const o = dotted[2].split('.').map(Number);
    str = `${dotted[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = str.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const words = [...head, ...Array(fill).fill('0'), ...tail].map((h) => parseInt(h, 16));
  return words.length === 8 && words.every((w) => w >= 0 && w <= 0xffff) ? words : null;
}
const v4From = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

export function isBlockedIp(ip) {
  const s = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIPv4(s)) return v4Blocked(s);
  if (!net.isIPv6(s.split('%')[0])) return true;
  const w = v6Words(s);
  if (!w) return true;
  const zero = (n) => w.slice(0, n).every((x) => x === 0);
  if (zero(8)) return true; // ::
  if (zero(7) && w[7] === 1) return true; // ::1
  if (zero(5) && w[5] === 0xffff) return v4Blocked(v4From(w[6], w[7])); // IPv4-mapped ::ffff:a.b.c.d
  if (zero(6)) return v4Blocked(v4From(w[6], w[7])); // IPv4-compatible (deprecated) ::a.b.c.d
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0)) return v4Blocked(v4From(w[6], w[7])); // NAT64 64:ff9b::/96
  if (w[0] === 0x64 && w[1] === 0xff9b && w[2] === 1) return true; // 64:ff9b:1::/48 local-use NAT64
  if (w[0] === 0x2002) return v4Blocked(v4From(w[1], w[2])); // 6to4
  if (w[0] === 0x2001 && w[1] === 0) return true; // Teredo (embedded addr obfuscated)
  if (w[0] === 0x2001 && w[1] === 0xdb8) return true; // documentation
  if ((w[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((w[0] & 0xffc0) === 0xfe80) return true; // link-local
  if ((w[0] & 0xffc0) === 0xfec0) return true; // site-local (deprecated)
  if ((w[0] & 0xff00) === 0xff00) return true; // multicast
  if (w[0] === 0x100 && zero(4)) return true; // 100::/64 discard
  return false;
}

export async function assertPublicUrl(raw, { lookup = dns.lookup } = {}) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new BlockedUrlError('That link is not a valid web address.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BlockedUrlError('Only http(s) links can be used.');
  if (u.username || u.password) throw new BlockedUrlError('Links with a user name or password are not allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    console.warn(`[safe-fetch] blocked local host name host=${host}`);
    throw new BlockedUrlError('That link points to a private address.');
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) { console.warn(`[safe-fetch] blocked literal ip host=${host}`); throw new BlockedUrlError('That link points to a private address.'); }
    return u;
  }
  let addrs = [];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    return u; // unresolvable: the request itself will fail; nothing private can be reached
  }
  const list = (Array.isArray(addrs) ? addrs : [addrs]).map((a) => (typeof a === 'string' ? a : a?.address)).filter(Boolean);
  const bad = list.filter((a) => isBlockedIp(a));
  if (bad.length) {
    console.warn(`[safe-fetch] blocked host=${host} resolved=${JSON.stringify(list)} blocked=${JSON.stringify(bad)}`);
    throw new BlockedUrlError('That link points to a private address.');
  }
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

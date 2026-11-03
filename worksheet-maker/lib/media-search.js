/**
 * Key-free search for a video or an audio that matches the article topic.
 *
 * - Topic keywords: local keyword extraction from the article (no AI call, browser + Node safe).
 * - Video: YouTube results page (ytInitialData JSON), then every kept result is confirmed via
 *   YouTube oEmbed (exists + embeddable). No API key. Never invents URLs: only ids found on the page.
 * - Audio: iTunes Search API (podcast episodes, free, no key, explicit=No).
 * The fetch-dependent parts take an injectable `fetchImpl` so tests run on fixtures.
 */

const STOP = new Set(`a about above after again against all also am an and any are aren't as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just like many me more most much my myself new no nor not now of off on once one only or other our ours out over own said same say says she should so some such than that the their theirs them then there these they this those through to too two under until up us very was we were what when where which while who whom why will with would you your yours year years people time way also get got make made may might must one us told according percent per cent mr mrs ms dr however new news week weeks day days still even back first last many well around another really thing things lot lots use used using since every three four five six seven eight nine ten`.split(/\s+/));

function words(text) {
  return String(text || '').toLowerCase().normalize('NFKC').match(/[\p{L}][\p{L}'’-]{2,}/gu) || [];
}

/**
 * Pick 3–4 topic keywords: frequent content words, title words weighted ×3, frequent two-word phrases first.
 * @returns {{ query: string, keywords: string[] }}
 */
export function topicKeywords({ text = '', title = '', topic = '' } = {}, max = 4) {
  if (String(topic).trim()) {
    const q = String(topic).trim().split(/\s+/).slice(0, 8).join(' ');
    return { query: q, keywords: q.split(' ') };
  }
  const counts = new Map();
  const add = (w, n) => { if (!STOP.has(w) && !/^\d/.test(w) && w.length > 2) counts.set(w, (counts.get(w) || 0) + n); };
  words(text).forEach((w) => add(w.replace(/['’]s$/, ''), 1));
  words(title).forEach((w) => add(w.replace(/['’]s$/, ''), 3));
  // bigrams of content words that repeat ("sleep deprivation", "screen time")
  const toks = words(text).map((w) => w.replace(/['’]s$/, ''));
  const bi = new Map();
  for (let i = 0; i < toks.length - 1; i++) {
    const [a, b] = [toks[i], toks[i + 1]];
    if (STOP.has(a) || STOP.has(b) || a.length < 3 || b.length < 3) continue;
    const k = `${a} ${b}`;
    bi.set(k, (bi.get(k) || 0) + 1);
  }
  const phrases = [...bi.entries()].filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1]).slice(0, 1).map(([k]) => k);
  const single = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([w]) => w);
  const out = [...phrases];
  for (const w of single) {
    if (out.length >= max) break;
    if (out.some((p) => p.split(' ').includes(w))) continue;
    out.push(w);
  }
  return { query: out.join(' '), keywords: out };
}

/** "12:34" / "1:02:03" → seconds */
export function parseClock(s) {
  const parts = String(s || '').trim().split(':').map((x) => Number(x));
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (!s) return '';
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

function textOf(node) {
  if (!node) return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text || '').join('');
  return '';
}

function extractInitialData(html) {
  const src = String(html || '');
  const markers = ['var ytInitialData = ', 'window["ytInitialData"] = ', 'ytInitialData = '];
  for (const mk of markers) {
    const at = src.indexOf(mk);
    if (at < 0) continue;
    const start = src.indexOf('{', at);
    let depth = 0; let inStr = false; let esc = false;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(src.slice(start, i + 1)); } catch { return null; } } }
    }
  }
  return null;
}

function collectRenderers(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 40 || out.length > 60) return;
  if (Array.isArray(node)) { node.forEach((n) => collectRenderers(n, out, depth + 1)); return; }
  if (node.videoRenderer && node.videoRenderer.videoId) { out.push(node.videoRenderer); return; }
  for (const k of Object.keys(node)) collectRenderers(node[k], out, depth + 1);
}

/** Parse a YouTube results page into plain video cards (no network). */
export function parseYoutubeSearchHtml(html) {
  const data = extractInitialData(html);
  if (!data) return [];
  const rs = [];
  collectRenderers(data.contents || data, rs);
  const seen = new Set();
  return rs.map((v) => {
    const id = String(v.videoId || '');
    const durText = textOf(v.lengthText);
    const live = (v.badges || []).some((b) => /LIVE/i.test(JSON.stringify(b))) || !durText;
    const thumbs = v.thumbnail?.thumbnails || [];
    return {
      kind: 'video',
      provider: 'youtube',
      id,
      youtubeId: id,
      title: textOf(v.title),
      source: textOf(v.ownerText) || textOf(v.longBylineText),
      durationSec: parseClock(durText),
      duration: durText,
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` || thumbs[thumbs.length - 1]?.url,
      url: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      description: (v.detailedMetadataSnippets || []).map((s) => textOf(s.snippetText)).join(' ').trim()
        || textOf(v.descriptionSnippet),
      views: textOf(v.viewCountText),
      live,
    };
  }).filter((v) => /^[\w-]{11}$/.test(v.id) && v.title && !v.live && !seen.has(v.id) && seen.add(v.id));
}

/** Map an iTunes Search API response to audio cards (no network). */
export function parseItunesEpisodes(json) {
  const results = Array.isArray(json?.results) ? json.results : [];
  const seen = new Set();
  return results.filter((r) => r && (r.kind === 'podcast-episode' || r.wrapperType === 'podcastEpisode') && r.trackViewUrl)
    .map((r) => {
      const sec = Math.round((Number(r.trackTimeMillis) || 0) / 1000);
      const desc = String(r.description || r.shortDescription || '').replace(/\s+/g, ' ').trim();
      return {
        kind: 'audio',
        provider: 'itunes',
        id: String(r.trackId || r.episodeGuid || r.trackViewUrl),
        title: String(r.trackName || '').trim(),
        source: String(r.collectionName || '').trim(),
        durationSec: sec,
        duration: formatDuration(sec),
        thumbnail: r.artworkUrl160 || r.artworkUrl600 || r.artworkUrl60 || '',
        url: String(r.trackViewUrl),
        audioUrl: /^https:\/\//.test(String(r.episodeUrl || '')) ? String(r.episodeUrl) : '',
        description: desc.slice(0, 1500),
        released: String(r.releaseDate || '').slice(0, 10),
        explicit: /explicit/i.test(String(r.trackExplicitness || r.collectionExplicitness || '')) && !/notExplicit|clean/i.test(String(r.trackExplicitness || '')),
      };
    })
    .filter((a) => a.title && !a.explicit && !seen.has(a.id) && seen.add(a.id));
}

export const MAX_VIDEO_SEC = 20 * 60;
export const MAX_AUDIO_SEC = 45 * 60;
const IDEAL = { video: [120, 600], audio: [240, 900] };

/** Drop overly long / too short items; shorter classroom-friendly lengths first (stable otherwise). */
export function rankForClass(items, kind, query = '') {
  const max = kind === 'audio' ? MAX_AUDIO_SEC : MAX_VIDEO_SEC;
  const [lo, hi] = IDEAL[kind] || IDEAL.video;
  const stems = words(query).filter((w) => !STOP.has(w) && w.length > 3).map((w) => w.slice(0, 5));
  const hits = (x) => {
    const title = String(x.title || '').toLowerCase();
    const body = `${title} ${String(x.description || '').toLowerCase()}`;
    return stems.reduce((n, st) => n + (title.includes(st) ? 1 : body.includes(st) ? 0.5 : 0), 0);
  };
  const seenTitle = new Set();
  const kept = items.filter((x) => !x.durationSec || (x.durationSec >= 45 && x.durationSec <= max))
    .filter((x) => !stems.length || hits(x) > 0) // off-topic results (matched only on "English") are dropped
    .filter((x) => { const k = String(x.title).toLowerCase().replace(/\W+/g, ''); if (seenTitle.has(k)) return false; seenTitle.add(k); return true; });
  const score = (x) => (!x.durationSec ? 1 : (x.durationSec >= lo && x.durationSec <= hi ? 0 : 0.5)) - Math.min(stems.length, hits(x)) * 0.4;
  return kept.map((x, i) => ({ x, i })).sort((a, b) => score(a.x) - score(b.x) || a.i - b.i).map(({ x }) => x);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function withTimeout(fetchImpl, url, opts = {}, ms = 9000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fetchImpl(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(timer); }
}

/** ESL-friendly bias: a second query aimed at learner channels/podcasts; merged in front. */
export function eslQuery(query, kind) {
  return kind === 'audio' ? `${query} learning English` : `${query} English learners`;
}

export async function searchYoutube(query, { fetchImpl = fetch, limit = 6, esl = true } = {}) {
  const page = async (q) => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D&hl=en&gl=GB`;
    const res = await withTimeout(fetchImpl, url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9', Cookie: 'CONSENT=YES+; SOCS=CAI' } });
    if (!res.ok) throw new Error(`YouTube search failed (${res.status})`);
    return parseYoutubeSearchHtml(await res.text());
  };
  const [main, learner] = await Promise.all([page(query), esl ? page(eslQuery(query, 'video')).catch(() => []) : []]);
  const merged = [];
  const seen = new Set();
  // interleave: 2 topic results, then 1 learner-friendly result
  const a = [...main]; const b = learner.map((v) => ({ ...v, esl: true }));
  while (a.length || b.length) {
    for (const src of [a, a, b]) { const v = src.shift(); if (v && !seen.has(v.id)) { seen.add(v.id); merged.push(v); } }
  }
  const ranked = rankForClass(merged, 'video', query).slice(0, limit * 2);
  // oEmbed confirms the video exists and can be embedded; anything that fails is dropped.
  const checked = await Promise.all(ranked.map(async (v) => {
    try {
      const r = await withTimeout(fetchImpl, `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(v.url)}`, { headers: { 'User-Agent': UA } }, 6000);
      if (!r.ok) return null;
      const o = await r.json();
      return { ...v, title: o.title || v.title, source: o.author_name || v.source, verified: true };
    } catch { return null; }
  }));
  return checked.filter(Boolean).slice(0, limit);
}

export async function searchPodcasts(query, { fetchImpl = fetch, limit = 6, esl = true } = {}) {
  const one = async (q) => {
    const url = `https://itunes.apple.com/search?media=podcast&entity=podcastEpisode&explicit=No&limit=25&country=GB&term=${encodeURIComponent(q)}`;
    const res = await withTimeout(fetchImpl, url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Podcast search failed (${res.status})`);
    return parseItunesEpisodes(await res.json());
  };
  const [main, learner] = await Promise.all([one(query), esl ? one(eslQuery(query, 'audio')).catch(() => []) : []]);
  const seen = new Set();
  const merged = [];
  const a = [...main]; const b = learner.map((x) => ({ ...x, esl: true }));
  while (a.length || b.length) {
    for (const src of [a, a, b]) { const v = src.shift(); if (v && !seen.has(v.id)) { seen.add(v.id); merged.push(v); } }
  }
  return rankForClass(merged, 'audio', query).slice(0, limit);
}

/** Search both sources; each side fails independently with its own message. */
export async function searchMedia({ query, kind = 'both', fetchImpl = fetch, limit = 6, esl = true } = {}) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) throw new Error('Type a few search words first.');
  const out = { query: q, video: [], audio: [], errors: {} };
  const jobs = [];
  if (kind === 'video' || kind === 'both') {
    jobs.push(searchYoutube(q, { fetchImpl, limit, esl }).then((v) => { out.video = v; }).catch((e) => { out.errors.video = e.message || 'Video search failed'; }));
  }
  if (kind === 'audio' || kind === 'both') {
    jobs.push(searchPodcasts(q, { fetchImpl, limit, esl }).then((v) => { out.audio = v; }).catch((e) => { out.errors.audio = e.message || 'Audio search failed'; }));
  }
  await Promise.all(jobs);
  return out;
}

/** Keep only fields we trust from a client-sent media pick (URLs must be https and from known hosts). */
export function sanitizeCompanionMedia(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = String(raw.url || '').trim();
  let host = '';
  try { const u = new URL(url); if (u.protocol !== 'https:') return null; host = u.hostname.replace(/^www\./, ''); } catch { return null; }
  const kind = raw.kind === 'audio' ? 'audio' : 'video';
  const okHost = kind === 'video'
    ? /(^|\.)youtube\.com$|^youtu\.be$/.test(host)
    : /(^|\.)apple\.com$/.test(host);
  if (!okHost && !raw.pasted) return null;
  const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const audioUrl = String(raw.audioUrl || '');
  return {
    kind,
    provider: kind === 'video' ? 'youtube' : (okHost ? 'itunes' : 'link'),
    title: clean(raw.title, 200),
    source: clean(raw.source, 120),
    url,
    youtubeId: kind === 'video' ? clean(raw.youtubeId, 20) : '',
    durationSec: Math.max(0, Math.min(6 * 3600, Math.round(Number(raw.durationSec) || 0))),
    duration: clean(raw.duration, 12) || formatDuration(raw.durationSec),
    thumbnail: /^https:\/\//.test(String(raw.thumbnail || '')) ? String(raw.thumbnail).slice(0, 500) : '',
    audioUrl: /^https:\/\//.test(audioUrl) ? audioUrl.slice(0, 600) : '',
    description: clean(raw.description, 1500),
  };
}

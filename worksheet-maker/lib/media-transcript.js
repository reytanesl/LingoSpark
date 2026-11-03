/**
 * Transcripts for audio/video links that YouTube captions do not cover (server-only).
 *
 * Podcasts: the open Podcasting 2.0 <podcast:transcript> tag in the show's RSS feed
 * (Buzzsprout, Captivate, Omny, Spreaker, RSS.com, … publish them). Apple Podcasts links are
 * resolved to their RSS feed + episode via the free iTunes Lookup API. No keys.
 * Timed formats (SRT/VTT/JSON) keep [m:ss] markers so tasks can point at minute ranges.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(fetchImpl, url, { ms = 8000, accept = '*/*' } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: ctl.signal, redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const decode = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)));
const attr = (tag, name) => decode((tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i')) || tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i')) || [])[1] || '');
const inner = (xml, tag) => decode((xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')) || [])[1] || '').trim();

/** Minimal RSS item parser: title, guid, enclosure, podcast:transcript tags. */
export function parseRssItems(xml) {
  return [...String(xml || '').matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(([item]) => ({
    title: inner(item, 'title'),
    guid: inner(item, 'guid'),
    enclosure: attr((item.match(/<enclosure\b[^>]*>/i) || [''])[0], 'url'),
    transcripts: [...item.matchAll(/<podcast:transcript\b[^>]*>/gi)].map(([t]) => ({
      url: attr(t, 'url'), type: attr(t, 'type').toLowerCase(), language: attr(t, 'language'), rel: attr(t, 'rel'),
    })).filter((t) => /^https?:\/\//.test(t.url)),
  }));
}

const normTitle = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const fileOf = (u) => { try { return new URL(u).pathname.split('/').pop(); } catch { return ''; } };

export function findEpisode(items, { guid = '', title = '', audioUrl = '' } = {}) {
  return items.find((it) => guid && it.guid === guid)
    || items.find((it) => audioUrl && it.enclosure && (it.enclosure === audioUrl || fileOf(it.enclosure) === fileOf(audioUrl)))
    || items.find((it) => title && normTitle(it.title) === normTitle(title))
    || null;
}

/** Timed formats first (they give minute markers), then JSON, HTML, plain text. */
export function pickTranscript(list = []) {
  const rank = (t) => {
    const ty = `${t.type} ${t.url}`.toLowerCase();
    if (/vtt/.test(ty)) return 0;
    if (/srt|subrip/.test(ty)) return 1;
    if (/json/.test(ty)) return 2;
    if (/html/.test(ty)) return 3;
    return 4;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || (/^en/i.test(b.language) ? 1 : 0) - (/^en/i.test(a.language) ? 1 : 0))[0] || null;
}

export function clockLabel(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

const toSec = (t) => {
  const m = String(t).trim().replace(',', '.').match(/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
};

/**
 * Join timed cues into paragraphs with a [m:ss] marker at least every `every` seconds
 * (cue = { start (s), text, speaker? }). Speaker changes start a new paragraph.
 */
export function timedText(cues, every = 60) {
  const out = [];
  let para = []; let paraStart = -Infinity; let speaker = '';
  const flush = () => { if (para.length) out.push(para.join(' ').replace(/\s+/g, ' ').trim()); para = []; };
  for (const c of cues) {
    const text = String(c.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || /^\[[^\]]*\]$/.test(text)) continue;
    const sp = String(c.speaker || '').trim();
    if ((Number.isFinite(c.start) && c.start - paraStart >= every) || (sp && sp !== speaker)) {
      flush();
      paraStart = Number.isFinite(c.start) ? c.start : paraStart;
      para.push(`[${clockLabel(paraStart === -Infinity ? 0 : paraStart)}]${sp ? ` ${sp}:` : ''}`);
      speaker = sp || speaker;
    }
    para.push(text);
  }
  flush();
  return out.join('\n\n');
}

export function parseSrtVtt(body) {
  const cues = [];
  for (const block of String(body || '').replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const start = toSec(lines[i].split('-->')[0]);
    let text = lines.slice(i + 1).join(' ');
    let speaker = '';
    const v = text.match(/<v\s+([^>]+)>/i);
    if (v) speaker = v[1].trim();
    const lead = text.match(/^\s*([A-Z][\w .'-]{1,30}):\s/);
    if (!speaker && lead) { speaker = lead[1]; text = text.slice(lead[0].length); }
    cues.push({ start, text, speaker });
  }
  return timedText(cues);
}

export function parseJsonTranscript(body) {
  try {
    const data = JSON.parse(body);
    const segs = data.segments || data.transcript || [];
    return timedText(segs.map((s) => ({ start: Number(s.startTime ?? s.start ?? NaN), text: s.body ?? s.text ?? '', speaker: s.speaker || '' })));
  } catch {
    return '';
  }
}

export function htmlToText(html) {
  return decode(String(html || '')
    .replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function parseTranscriptBody(body, type = '') {
  const raw = String(body || '').trim();
  if (!raw) return '';
  const ty = String(type || '').toLowerCase();
  if (raw.startsWith('{') || /json/.test(ty)) return parseJsonTranscript(raw);
  if (/^WEBVTT/i.test(raw) || raw.includes('-->')) return parseSrtVtt(raw);
  if (/html/.test(ty) || /<\/?(p|div|span|body)\b/i.test(raw)) return htmlToText(raw);
  return raw.replace(/[ \t]+/g, ' ').trim();
}

/** Apple Podcasts episode link → { feedUrl, guid, title, description, audioUrl, collectionName } via iTunes Lookup. */
export async function resolveApplePodcastEpisode(link, { fetchImpl = fetch } = {}) {
  let u;
  try { u = new URL(link); } catch { return null; }
  if (!/(^|\.)podcasts\.apple\.com$/.test(u.hostname)) return null;
  const showId = (u.pathname.match(/\/id(\d+)/) || [])[1];
  const episodeId = u.searchParams.get('i');
  if (!showId) return null;
  const body = await get(fetchImpl, `https://itunes.apple.com/lookup?id=${showId}&entity=podcastEpisode&limit=200`, { accept: 'application/json' });
  if (!body) return null;
  let data; try { data = JSON.parse(body); } catch { return null; }
  const results = data.results || [];
  const show = results.find((r) => r.wrapperType === 'track' || r.kind === 'podcast') || {};
  const ep = results.find((r) => String(r.trackId) === String(episodeId)) || null;
  return {
    feedUrl: show.feedUrl || ep?.feedUrl || '',
    guid: ep?.episodeGuid || '',
    title: ep?.trackName || '',
    description: String(ep?.description || ep?.shortDescription || '').trim(),
    audioUrl: ep?.episodeUrl || '',
    collectionName: show.collectionName || ep?.collectionName || '',
    imageUrl: ep?.artworkUrl600 || show.artworkUrl600 || '',
  };
}

const feedCache = new Map();
async function feedItems(feedUrl, fetchImpl) {
  const hit = feedCache.get(feedUrl);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.items;
  const xml = await get(fetchImpl, feedUrl, { ms: 9000, accept: 'application/rss+xml, application/xml, text/xml, */*' });
  const items = xml ? parseRssItems(xml) : [];
  if (xml) feedCache.set(feedUrl, { at: Date.now(), items });
  if (feedCache.size > 200) feedCache.delete(feedCache.keys().next().value);
  return items;
}

/** Does this episode publish a transcript? (no download of the transcript itself) */
export async function podcastTranscriptInfo({ feedUrl, guid, title, audioUrl }, { fetchImpl = fetch } = {}) {
  if (!feedUrl) return null;
  const ep = findEpisode(await feedItems(feedUrl, fetchImpl), { guid, title, audioUrl });
  return ep ? pickTranscript(ep.transcripts) : null;
}

/** Fetch + parse the episode transcript. → { transcript, timed, url } | null */
export async function fetchPodcastTranscript(ref, { fetchImpl = fetch } = {}) {
  const pick = await podcastTranscriptInfo(ref, { fetchImpl });
  if (!pick) return null;
  const body = await get(fetchImpl, pick.url, { ms: 10000 });
  const transcript = parseTranscriptBody(body, pick.type);
  if (!transcript || transcript.split(/\s+/).length < 30) return null;
  return { transcript, timed: /\[\d+:\d{2}\]/.test(transcript), url: pick.url };
}

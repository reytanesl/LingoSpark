import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const MAX_CHARS = 60_000;
const MAX_CHARS_TRANSCRIPT = 120_000;

export function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function youtubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const parts = u.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    /* fall through */
  }
  const m = String(url || '').match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{6,})/i
  );
  return m?.[1] || null;
}

function looksLikeMedia(url) {
  const lower = String(url || '').toLowerCase();
  if (!lower) return false;
  if (youtubeId(url)) return true;
  if (/\.(mp3|m4a|wav|ogg|mp4|webm|mov|m4v)(\?|$)/i.test(lower)) return true;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const mediaHosts = [
      'vimeo.com', 'player.vimeo.com',
      'soundcloud.com', 'on.soundcloud.com',
      'spotify.com', 'open.spotify.com',
      'ted.com', 'embed.ted.com',
      'dailymotion.com', 'dai.ly',
      'twitch.tv', 'clips.twitch.tv',
      'loom.com', 'www.loom.com',
      'tiktok.com', 'vm.tiktok.com',
      'facebook.com', 'fb.watch',
      'instagram.com',
      'bbc.co.uk', 'bbc.com',
      'ed.ted.com',
      'coursera.org', 'khanacademy.org',
      'wistia.com', 'wi.st',
      'brightcove.com', 'brightcove.net',
      'cloudflarestream.com',
    ];
    if (mediaHosts.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  } catch {
    /* fall through */
  }
  return /\/(watch|video|videos|embed|player|listen|episode)\b/i.test(lower);
}

function pageMetaFromHtml(html) {
  return youtubeMetaFromHtml(html);
}

async function fetchMediaPageMeta(link) {
  const out = { title: '', description: '', imageUrl: '' };
  const oembedUrls = [
    `https://noembed.com/embed?url=${encodeURIComponent(link)}`,
  ];
  try {
    const host = new URL(link).hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      oembedUrls.unshift(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(link)}`);
    }
  } catch {
    /* ignore */
  }
  for (const url of oembedUrls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.error) continue;
      out.title = String(data?.title || '').trim() || out.title;
      out.description = String(data?.description || data?.author_name || '').trim() || out.description;
      out.imageUrl = String(data?.thumbnail_url || '').trim() || out.imageUrl;
      if (out.title) break;
    } catch {
      /* try next */
    }
  }
  try {
    const html = await fetchHtml(link);
    const meta = pageMetaFromHtml(html);
    if (!out.title && meta.title) out.title = meta.title;
    if (!out.description && meta.description) out.description = meta.description;
    if (!out.imageUrl) {
      const img = String(html || '').match(/property="og:image"\s+content="([^"]+)"/i)
        || String(html || '').match(/content="([^"]+)"\s+property="og:image"/i);
      if (img?.[1]) {
        try {
          out.imageUrl = new URL(decodeEntities(img[1]), link).href;
        } catch {
          out.imageUrl = decodeEntities(img[1]);
        }
      }
    }
  } catch {
    /* title/topic fallback is fine */
  }
  return out;
}

async function resolveGenericMedia(link, {
  titleHint = '',
  topicTitle = '',
  pastedAsTranscript = '',
} = {}) {
  const pasted = (pastedAsTranscript || '').trim();
  const isDirectFile = /\.(mp3|m4a|wav|ogg|mp4|webm|mov|m4v)(\?|$)/i.test(link);
  let meta = { title: '', description: '', imageUrl: '' };
  if (!isDirectFile) {
    try {
      meta = await fetchMediaPageMeta(link);
    } catch {
      /* keep empty */
    }
  } else {
    try {
      const name = decodeURIComponent(new URL(link).pathname.split('/').filter(Boolean).pop() || '');
      meta.title = name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
    } catch {
      /* ignore */
    }
  }
  const resolvedTitle = titleHint || meta.title || topicTitle || 'Audio / video source';
  const hasTranscript = Boolean(pasted);
  const fallback = youtubeFallbackText({
    title: resolvedTitle,
    description: meta.description,
    topic: topicTitle,
  }) || resolvedTitle;
  const text = pasted || fallback;
  let warning = '';
  if (hasTranscript) {
    warning = 'Using the pasted text as the listening transcript for this media link.';
  } else if (meta.description) {
    warning = 'No captions were available for this media link. The lesson uses the page title and description — students should watch or listen; paste a transcript for richer tasks.';
  } else {
    warning = 'No captions or page description were available for this media link. The lesson uses the title/topic — students should watch or listen; paste a transcript or add a topic for richer tasks.';
  }
  return {
    url: link,
    title: resolvedTitle,
    text,
    transcriptFound: hasTranscript,
    captionsAuto: false,
    videoWithoutCaptions: !hasTranscript,
    transcriptionMode: true,
    imageUrl: meta.imageUrl || '',
    youtubeId: '',
    warning,
  };
}

const YT_CONSENT_COOKIE = 'CONSENT=YES+; SOCS=CAI';

async function fetchHtml(url, { cookies = '' } = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9,de;q=0.8,pl;q=0.7',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Could not open the link (${res.status}). Try pasting the text instead.`);
  }
  return res.text();
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ');
}

function parseCaptionXml(xml) {
  const chunks = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  );
  return chunks.filter(Boolean).join(' ');
}

function parseCaptionJson3(body) {
  try {
    const data = JSON.parse(body);
    const chunks = [];
    for (const ev of data.events || []) {
      if (!Array.isArray(ev.segs)) continue;
      const line = ev.segs.map((s) => s.utf8 || '').join('');
      if (line.trim() && !/^\[[^\]]+\]$/.test(line.trim())) chunks.push(line.trim());
    }
    return chunks.join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

function parseCaptionVtt(body) {
  return String(body || '')
    .replace(/^WEBVTT[^\n]*\n+/i, '')
    .replace(/\d{2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->\s*\d{2}:\d{2}(?::\d{2})?[.,]\d{3}[^\n]*/g, '')
    .replace(/^\d+\s*$/gm, '')
    .replace(/<\/?c[^>]*>/gi, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCaptionPayload(body) {
  const raw = String(body || '').trim();
  if (!raw) return '';
  if (raw.startsWith('{')) return parseCaptionJson3(raw);
  if (/^WEBVTT/i.test(raw) || raw.includes('-->')) {
    const vtt = parseCaptionVtt(raw);
    if (vtt) return vtt;
  }
  return parseCaptionXml(raw);
}

function extractJsonBlob(html, marker) {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const braceStart = html.indexOf('{', idx);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(braceStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractPlayerResponse(html) {
  return extractJsonBlob(html, 'ytInitialPlayerResponse');
}

function youtubeMetaFromPlayer(player) {
  const vd = player?.videoDetails || {};
  const title = String(vd.title || '').trim();
  const description = String(vd.shortDescription || '').trim();
  return { title, description };
}

function youtubeMetaFromHtml(html) {
  const pick = (re) => {
    const m = String(html || '').match(re);
    return m ? decodeEntities(m[1]).trim() : '';
  };
  const titleRaw = pick(/property="og:title"\s+content="([^"]+)"/i)
    || pick(/content="([^"]+)"\s+property="og:title"/i)
    || pick(/<meta[^>]+name="title"[^>]+content="([^"]+)"/i)
    || pick(/<title>([^<]+)<\/title>/i);
  const title = titleRaw.replace(/\s*-\s*YouTube\s*$/i, '').trim();
  const description = pick(/property="og:description"\s+content="([^"]+)"/i)
    || pick(/content="([^"]+)"\s+property="og:description"/i)
    || pick(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
  return { title, description };
}

async function youtubeOEmbed(videoId) {
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const urls = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
    `https://noembed.com/embed?url=${encodeURIComponent(watch)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const title = String(data?.title || '').trim();
      const author = String(data?.author_name || '').trim();
      if (title) {
        return {
          title,
          description: author ? `Channel: ${author}` : '',
        };
      }
    } catch {
      /* try next */
    }
  }
  return { title: '', description: '' };
}

async function youtubeInnertubePlayer(videoId) {
  const clients = [
    {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20250313.00.00',
        hl: 'en',
        gl: 'US',
      },
      headers: {
        'X-Youtube-Client-Name': '1',
        'X-Youtube-Client-Version': '2.20250313.00.00',
      },
    },
    {
      client: {
        clientName: 'MWEB',
        clientVersion: '2.20250313.00.00',
        hl: 'en',
        gl: 'US',
      },
      headers: {
        'X-Youtube-Client-Name': '2',
        'X-Youtube-Client-Version': '2.20250313.00.00',
      },
    },
  ];
  for (const entry of clients) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'User-Agent': BROWSER_UA,
          'Content-Type': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          ...entry.headers,
        },
        body: JSON.stringify({
          context: { client: entry.client },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.videoDetails?.title || data?.captions) return data;
    } catch {
      /* try next client */
    }
  }
  return null;
}

function captionTrackScore(track, preferredLang) {
  let s = 0;
  const code = String(track.languageCode || '').toLowerCase();
  const kind = String(track.kind || '').toLowerCase();
  if (code.startsWith(preferredLang)) s += 8;
  if (code.startsWith('en')) s += 3;
  if (code.startsWith('de') || code.startsWith('pl')) s += 1;
  // Prefer human captions slightly, but keep auto-generated (asr) fully usable.
  if (!kind) s += 2;
  if (kind === 'asr') s += 1;
  return s;
}

function withCaptionFmt(url, fmt) {
  try {
    const u = new URL(url);
    u.searchParams.set('fmt', fmt);
    return u.toString();
  } catch {
    const join = url.includes('?') ? '&' : '?';
    return `${url}${join}fmt=${encodeURIComponent(fmt)}`;
  }
}

async function fetchCaptionUrl(url, videoId = '') {
  if (!url) return null;
  const formats = ['json3', 'srv3', 'vtt', ''];
  const variants = [];
  for (const fmt of formats) {
    variants.push(fmt ? withCaptionFmt(url, fmt) : url);
  }
  const referer = videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    : 'https://www.youtube.com/';
  for (const u of variants) {
    try {
      const captionRes = await fetch(u, {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: '*/*',
          'Accept-Language': 'en-GB,en;q=0.9',
          Referer: referer,
          Origin: 'https://www.youtube.com',
          Cookie: YT_CONSENT_COOKIE,
        },
      });
      if (!captionRes.ok) continue;
      const text = parseCaptionPayload(await captionRes.text());
      if (text && text.split(/\s+/).length >= 8) return text;
      if (text) return text;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function fetchTimedText(videoId, lang, kind = '', fmt = 'json3') {
  const q = new URLSearchParams({ v: videoId });
  if (lang) q.set('lang', lang);
  if (kind) q.set('kind', kind);
  if (fmt) q.set('fmt', fmt);
  try {
    const res = await fetch(`https://www.youtube.com/api/timedtext?${q}`, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: '*/*',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    return parseCaptionPayload(await res.text()) || null;
  } catch {
    return null;
  }
}

async function listTimedTextTracks(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`, {
      headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<track\b([^>]+)\/>/gi)].map((m) => {
      const attrs = m[1];
      const get = (name) => {
        const hit = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'));
        return hit ? decodeEntities(hit[1]) : '';
      };
      return {
        languageCode: get('lang_code') || get('lang_original'),
        kind: get('kind'),
        name: get('name'),
      };
    }).filter((t) => t.languageCode);
  } catch {
    return [];
  }
}

/**
 * Fetch captions (manual or auto-generated / ASR) and basic video metadata.
 * Uses watch-page player JSON, Innertube, HTML meta, and oEmbed so title is rarely empty
 * even when captions or datacenter scrapes fail.
 * @returns {{ transcript: string|null, title: string, description: string, captionKind: string }}
 */
async function youtubeTranscript(videoId, { preferredLang = 'en' } = {}) {
  const lang = String(preferredLang || 'en').slice(0, 2).toLowerCase();
  let html = '';
  let player = null;

  try {
    html = await fetchHtml(`https://www.youtube.com/watch?v=${videoId}`, {
      cookies: YT_CONSENT_COOKIE,
    });
    player = extractPlayerResponse(html);
  } catch {
    /* watch page blocked — continue with other sources */
  }

  if (!player?.videoDetails) {
    try {
      player = await youtubeInnertubePlayer(videoId);
    } catch {
      /* ignore */
    }
  }

  const fromPlayer = youtubeMetaFromPlayer(player);
  const fromHtml = youtubeMetaFromHtml(html);
  // Prefer player title; HTML og:title is OK. Avoid HTML og:description — consent/marketing
  // pages often inject unrelated blurbs.
  let title = fromPlayer.title || fromHtml.title;
  let description = fromPlayer.description;

  if (!title || !description) {
    const oe = await youtubeOEmbed(videoId);
    title = title || oe.title;
    description = description || oe.description;
  }

  const empty = {
    transcript: null,
    title: title || '',
    description: description || '',
    captionKind: '',
  };

  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (Array.isArray(tracks) && tracks.length) {
    const ranked = [...tracks].sort((a, b) => captionTrackScore(b, lang) - captionTrackScore(a, lang));
    // Try the best few tracks only — empty timedtext responses are common without a PoToken.
    for (const track of ranked.slice(0, 4)) {
      const text = await fetchCaptionUrl(track.baseUrl, videoId);
      if (text) {
        return {
          ...empty,
          transcript: text,
          captionKind: String(track.kind || '').toLowerCase() === 'asr' ? 'auto' : 'manual',
        };
      }
    }
  }

  // Lightweight timedtext fallback (avoid lang×kind×fmt explosion — often empty on servers).
  const listed = await listTimedTextTracks(videoId);
  const listedLangs = listed
    .map((t) => String(t.languageCode || '').toLowerCase())
    .filter(Boolean)
    .slice(0, 4);
  const langs = [...new Set([lang, ...listedLangs, 'en'].filter(Boolean))].slice(0, 4);
  for (const code of langs) {
    for (const kind of ['asr', '']) {
      const text = await fetchTimedText(videoId, code, kind, 'json3')
        || await fetchTimedText(videoId, code, kind, 'srv3');
      if (text) {
        return {
          ...empty,
          transcript: text,
          captionKind: kind === 'asr' ? 'auto' : 'manual',
        };
      }
    }
  }

  return empty;
}

function youtubeFallbackText({ title, description, topic } = {}) {
  const parts = [];
  if (title) parts.push(title);
  if (description) parts.push(description);
  if (topic && !parts.some((p) => p.toLowerCase().includes(String(topic).toLowerCase()))) {
    parts.push(`Classroom topic: ${topic}`);
  }
  return parts.join('\n\n').trim();
}

function extractLeadImage(dom, url) {
  const doc = dom.window.document;
  const pick = (sel) => doc.querySelector(sel)?.getAttribute('content') || '';
  const raw = pick('meta[property="og:image"]')
    || pick('meta[property="og:image:url"]')
    || pick('meta[name="twitter:image"]')
    || pick('meta[name="twitter:image:src"]');
  if (!raw) return '';
  try {
    return new URL(raw, url).href;
  } catch {
    return '';
  }
}

function extractArticle(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const title = article?.title || dom.window.document.title || 'Untitled source';
  let text = (article?.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) {
    const paras = [...dom.window.document.querySelectorAll('p')]
      .map((p) => p.textContent.trim())
      .filter((p) => p.length > 40);
    text = paras.join('\n\n');
  }

  return { title, text, imageUrl: extractLeadImage(dom, url) };
}

function clip(text, maxChars = MAX_CHARS) {
  if (!text || text.length <= maxChars) return { text: text || '', clipped: false };
  const slice = text.slice(0, maxChars);
  const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
  return {
    text: (lastBreak > maxChars * 0.7 ? slice.slice(0, lastBreak + 1) : slice).trim(),
    clipped: true,
  };
}

async function resolveYoutubeVideo(id, {
  titleHint = '',
  topicTitle = '',
  pastedAsTranscript = '',
  preferredLang = 'en',
  wantTranscript = false,
} = {}) {
  let yt = { transcript: null, title: '', description: '', captionKind: '' };
  try {
    yt = await youtubeTranscript(id, { preferredLang });
  } catch {
    /* keep empty meta — still recover via oEmbed below */
  }
  if (!yt.title) {
    try {
      const oe = await youtubeOEmbed(id);
      yt = { ...yt, title: oe.title || yt.title, description: yt.description || oe.description };
    } catch {
      /* ignore */
    }
  }
  const transcript = yt.transcript || null;
  const pasted = (pastedAsTranscript || '').trim();
  const hasCaptions = Boolean(transcript || pasted);
  const resolvedTitle = titleHint || yt.title || topicTitle || 'YouTube video';
  const fallback = hasCaptions
    ? ''
    : youtubeFallbackText({
      title: resolvedTitle,
      description: yt.description,
      topic: topicTitle,
    }) || resolvedTitle;
  const text = pasted || transcript || fallback;
  let warning = '';
  if (!hasCaptions) {
    warning = yt.description
      ? 'No captions (including auto-generated) were available. The lesson uses the video title and description — students should watch the video; comprehension is based on the topic, not a verbatim transcript.'
      : 'No captions were available and the description could not be fetched. The lesson uses the video title — students should watch the video; add a topic or paste a transcript for richer tasks.';
  } else if (yt.captionKind === 'auto' && !pasted) {
    warning = 'Using YouTube auto-generated captions as the transcript.';
  } else if (wantTranscript && transcript) {
    warning = 'Using video captions as the lesson transcript.';
  }
  return {
    url: `https://www.youtube.com/watch?v=${id}`,
    title: resolvedTitle,
    text,
    transcriptFound: hasCaptions,
    captionsAuto: yt.captionKind === 'auto' && !pasted,
    videoWithoutCaptions: !hasCaptions,
    transcriptionMode: wantTranscript || Boolean(transcript),
    imageUrl: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    youtubeId: id,
    warning,
  };
}

async function resolveReadingText({
  articleLink = '',
  pasted = '',
  titleHint = '',
} = {}) {
  const link = (articleLink || '').trim();
  const body = (pasted || '').trim();
  if (!link && !body) return null;

  if (!link && body) {
    return {
      url: '',
      title: titleHint || 'Teacher-provided text',
      text: body,
      imageUrl: '',
      warning: '',
    };
  }

  const html = await fetchHtml(link);
  const article = extractArticle(html, link);
  const text = [article.text, body].filter(Boolean).join('\n\n').trim();
  if (!text) {
    throw new Error('Could not extract readable text from that page. Paste the article text and try again.');
  }
  return {
    url: link,
    title: titleHint || article.title,
    text,
    imageUrl: article.imageUrl || '',
    warning: '',
  };
}

function mergeCombinedSource({ video, reading, maxChars }) {
  const videoBlock = (video?.text || '').trim();
  const readingBlock = (reading?.text || '').trim();
  const parts = [];
  if (videoBlock) {
    parts.push(`[VIDEO — listening source]\nTitle: ${video.title || 'Video'}\n${videoBlock}`);
  }
  if (readingBlock) {
    parts.push(`[READING TEXT]\nTitle: ${reading.title || 'Reading'}\n${readingBlock}`);
  }
  const { text, clipped } = clip(parts.join('\n\n'), maxChars);
  const warnings = [video?.warning, reading?.warning].filter(Boolean);
  if (clipped) warnings.push('The combined sources were long, so a coherent opening stretch was kept for generation.');
  const title = [reading?.title, video?.title].filter(Boolean).join(' · ')
    || video?.title
    || reading?.title
    || 'Combined sources';
  return {
    url: video?.url || reading?.url || '',
    articleUrl: reading?.url || '',
    videoUrl: video?.url || '',
    title,
    skillHint: 'combined',
    text,
    clipped,
    wordCount: wordCount(text),
    media: true,
    transcriptFound: Boolean(video?.transcriptFound),
    captionsAuto: Boolean(video?.captionsAuto),
    videoWithoutCaptions: Boolean(video?.videoWithoutCaptions),
    transcriptionMode: Boolean(video?.transcriptionMode || video?.transcriptFound),
    combinedSources: true,
    imageUrl: reading?.imageUrl || video?.imageUrl || '',
    youtubeId: video?.youtubeId || '',
    warning: warnings.join(' '),
  };
}

export async function loadSource({
  url,
  videoUrl,
  pastedText,
  titleHint,
  pdfText,
  topic,
  allowTopicOnly = false,
  transcriptionMode = false,
  preferredLang = 'en',
} = {}) {
  const pastedOnly = String(pastedText || '').trim();
  const pdfOnly = String(pdfText || '').trim();
  const readingBody = [pdfOnly, pastedOnly].filter(Boolean).join('\n\n').trim();
  let articleLink = (url || '').trim();
  let videoLink = (videoUrl || '').trim();
  const topicTitle = (topic || titleHint || '').trim();
  const wantTranscript = Boolean(transcriptionMode);

  // Media URLs belong in the video slot (backward compatible with a single URL field).
  if (articleLink && (youtubeId(articleLink) || looksLikeMedia(articleLink))) {
    if (!videoLink) videoLink = articleLink;
    articleLink = '';
  }

  const maxChars = (wantTranscript || videoLink)
    ? MAX_CHARS_TRANSCRIPT
    : MAX_CHARS;

  if (!videoLink && !articleLink && !readingBody) {
    if (allowTopicOnly && topicTitle) {
      return {
        url: '',
        title: topicTitle,
        skillHint: 'reading',
        text: '',
        clipped: false,
        wordCount: 0,
        media: false,
        transcriptFound: false,
        transcriptionMode: false,
        topicOnly: true,
        imageUrl: '',
        youtubeId: '',
        warning: '',
      };
    }
    throw new Error(allowTopicOnly
      ? 'Paste a link, PDF, source text, or a topic.'
      : 'Paste a link, the source text, or both.');
  }

  const id = youtubeId(videoLink);
  // Video + article/PDF → always combine.
  // Video + paste only → combine when captions exist; otherwise paste is the transcript.
  // Any non-empty videoUrl is treated as a listening source (YouTube or other links).

  let video = null;
  let reading = null;

  if (id) {
    const ytVideo = await resolveYoutubeVideo(id, {
      titleHint,
      topicTitle,
      pastedAsTranscript: '',
      preferredLang,
      wantTranscript: true,
    });

    if (articleLink || pdfOnly || (pastedOnly && ytVideo.transcriptFound)) {
      video = ytVideo;
      reading = await resolveReadingText({
        articleLink,
        pasted: readingBody,
        titleHint,
      });
    } else if (pastedOnly && !ytVideo.transcriptFound) {
      video = await resolveYoutubeVideo(id, {
        titleHint,
        topicTitle,
        pastedAsTranscript: pastedOnly,
        preferredLang,
        wantTranscript: true,
      });
    } else {
      video = ytVideo;
    }
  } else if (videoLink) {
    if (articleLink || pdfOnly) {
      video = await resolveGenericMedia(videoLink, { titleHint, topicTitle, pastedAsTranscript: '' });
      reading = await resolveReadingText({
        articleLink,
        pasted: readingBody,
        titleHint,
      });
    } else if (pastedOnly) {
      // No captions on non-YouTube links — paste is the listening transcript.
      video = await resolveGenericMedia(videoLink, {
        titleHint,
        topicTitle,
        pastedAsTranscript: pastedOnly,
      });
    } else {
      video = await resolveGenericMedia(videoLink, { titleHint, topicTitle, pastedAsTranscript: '' });
    }
  } else if (articleLink || readingBody) {
    reading = await resolveReadingText({ articleLink, pasted: readingBody, titleHint });
  }

  if (video && reading && (reading.text || '').trim()) {
    return mergeCombinedSource({ video, reading, maxChars });
  }

  if (video) {
    const { text, clipped } = clip(video.text, maxChars);
    return {
      url: video.url,
      videoUrl: video.url,
      title: video.title,
      skillHint: 'listening',
      text,
      clipped,
      wordCount: wordCount(text),
      media: true,
      transcriptFound: video.transcriptFound,
      captionsAuto: video.captionsAuto,
      videoWithoutCaptions: video.videoWithoutCaptions,
      transcriptionMode: video.transcriptionMode,
      imageUrl: video.imageUrl,
      youtubeId: video.youtubeId,
      warning: clipped
        ? (video.warning ? `${video.warning} The transcript was long, so a coherent opening stretch was kept.` : 'The transcript was long, so a coherent opening stretch was kept for generation.')
        : video.warning,
    };
  }

  if (reading) {
    const { text, clipped } = clip(reading.text, maxChars);
    return {
      url: reading.url,
      articleUrl: reading.url,
      title: reading.title,
      skillHint: 'reading',
      text,
      clipped,
      wordCount: wordCount(text),
      media: false,
      transcriptFound: false,
      transcriptionMode: false,
      imageUrl: reading.imageUrl,
      youtubeId: '',
      warning: clipped
        ? 'The article was very long, so a coherent opening stretch was kept. Tick Adapt only if you want a shorter, levelled version.'
        : reading.warning,
    };
  }

  throw new Error(allowTopicOnly
    ? 'Paste a link, PDF, source text, or a topic.'
    : 'Paste a link, the source text, or both.');
}

const UA = 'LessonCreator/1.0 (classroom ESL/DaF worksheets; educational use)';
const MAX_BYTES = 2_200_000;

function wikiHost(language) {
  const lang = String(language || '').toLowerCase();
  if (lang.startsWith('de')) return 'de.wikipedia.org';
  if (lang.startsWith('pl')) return 'pl.wikipedia.org';
  return 'en.wikipedia.org';
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'of', 'in', 'on', 'for', 'to', 'with', 'at', 'from', 'how', 'why',
  'what', 'when', 'who', 'is', 'are', 'was', 'were', 'this', 'that', 'into', 'over', 'about',
  'after', 'before', 'their', 'your', 'our', 'not', 'but', 'or', 'as', 'by', 'its',
  'und', 'der', 'die', 'das', 'dem', 'den', 'ein', 'eine', 'einer', 'einem', 'einen',
  'bei', 'mit', 'von', 'für', 'im', 'auf', 'aus', 'zum', 'zur', 'ist', 'sind', 'wie',
  'was', 'warum', 'wenn', 'oder', 'nicht', 'des', 'als',
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'klasa', 'klasy', 'lekcja', 'temat',
  'oraz', 'lub', 'czy', 'się', 'jest', 'są', 'być', 'nie', 'tak', 'jak', 'dla', 'przez',
  'który', 'która', 'które', 'tego', 'tej', 'tych', 'podstawowa', 'szkoła', 'ćwiczenie',
  'karta', 'pracy', 'zadanie', 'zadania', 'uczeń', 'ucznia', 'nauczyciel',
]);

function keywords(text) {
  return String(text || '')
    .split(/[^\p{L}0-9-]+/u)
    .map((w) => w.trim())
    .filter((w) => w.replace(/-/g, '').length > 2 && !STOP.has(w.toLowerCase()));
}

function keywordScore(hay, needles) {
  const text = String(hay || '').toLowerCase();
  return needles.filter((n) => text.includes(n)).length;
}

function searchQuery({ title, topic }) {
  const raw = String(topic || title || '')
    .replace(/\s*[|–—]\s*.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const keys = keywords(raw);
  // Keep image searches short — long phrases often match nothing on Commons.
  return (keys.length ? keys.slice(0, 3).join(' ') : raw).slice(0, 60);
}

function cleanUrl(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return String(url || '').split('?')[0];
  }
}

function creditFor(kind, language) {
  const lang = String(language || '').toLowerCase();
  const de = lang.startsWith('de');
  const pl = lang.startsWith('pl');
  if (kind === 'youtube') {
    if (de) return 'Foto: YouTube';
    if (pl) return 'Zdjęcie: YouTube';
    return 'Photo: YouTube';
  }
  if (kind === 'source') {
    if (de) return 'Foto: Quelle';
    if (pl) return 'Zdjęcie: źródło';
    return 'Photo: source';
  }
  if (kind === 'openverse') {
    if (de) return 'Foto: Openverse';
    if (pl) return 'Zdjęcie: Openverse';
    return 'Photo: Openverse';
  }
  if (de) return 'Foto: Wikimedia Commons';
  if (pl) return 'Zdjęcie: Wikimedia Commons';
  return 'Photo: Wikimedia Commons';
}

async function fetchJson(url, signal) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    redirect: 'follow',
    signal,
  });
  if (!res.ok) return null;
  return res.json();
}

function isPhotoMime(mime, url) {
  const m = String(mime || '').toLowerCase();
  const u = String(url || '').toLowerCase();
  if (m.includes('svg') || u.endsWith('.svg')) return false;
  if (m.includes('gif')) return false;
  return /image\/(jpeg|jpg|png|webp)/.test(m) || /\.(jpe?g|png|webp)(\?|$)/.test(u);
}

async function downloadAsDataUrl(url, signal) {
  if (!url) return null;
  const variants = [url];
  const cleaned = cleanUrl(url);
  if (cleaned && cleaned !== url) variants.push(cleaned);
  for (const candidate of variants) {
    try {
      const res = await fetch(candidate, {
        headers: { 'User-Agent': UA, Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8' },
        redirect: 'follow',
        signal,
      });
      if (!res.ok) continue;
      const mime = (res.headers.get('content-type') || '').split(';')[0].trim();
      if (!isPhotoMime(mime, candidate)) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX_BYTES) continue;
      return `data:${mime || 'image/jpeg'};base64,${buf.toString('base64')}`;
    } catch {
      /* try next variant */
    }
  }
  return null;
}

function commonsThumb(url, width = 1400) {
  try {
    const u = new URL(cleanUrl(url));
    if (!u.hostname.includes('upload.wikimedia.org')) return cleanUrl(url);
    if (u.pathname.includes('/thumb/')) return u.toString();
    const m = u.pathname.match(/^(\/wikipedia\/[^/]+)\/(.+\/)([^/]+)$/);
    if (!m) return u.toString();
    const [, prefix, hashPath, name] = m;
    return `${u.origin}${prefix}/thumb/${hashPath}${name}/${width}px-${name}`;
  } catch {
    return cleanUrl(url);
  }
}

function isClassroomPhoto(src, summary) {
  const url = String(src || '');
  if (/\.svg($|\?)/i.test(url) || /\/thumb\/.*\.svg\//i.test(url)) return false;
  if (/\/wikipedia\/(en|de)\//i.test(url) && !/\/commons\//i.test(url)) return false;
  const w = summary?.originalimage?.width || summary?.thumbnail?.width || 0;
  const h = summary?.originalimage?.height || summary?.thumbnail?.height || 0;
  if (w && h && w < 400 && h < 400) return false;
  const title = String(summary?.title || '');
  if (/^List of\b/i.test(title) || /\b(film|album|soundtrack|TV series)\b/i.test(title)) return false;
  if (summary?.type && summary.type !== 'standard') return false;
  return true;
}

async function fromDirectUrl(url, { alt, credit, signal }) {
  const dataUrl = await downloadAsDataUrl(url, signal);
  if (dataUrl) return { dataUrl, alt, credit };
  return null;
}

/** Download a classroom photo from a direct image URL (teacher paste). */
export async function imageFromUrl(url, { language = 'en', alt = '', timeoutMs = 12000 } = {}) {
  const link = String(url || '').trim();
  if (!link) return null;
  const signal = AbortSignal.timeout(Math.max(3000, timeoutMs));
  const hit = await fromDirectUrl(link, {
    alt: alt || 'Topic image',
    credit: creditFor('source', language),
    signal,
  });
  if (!hit?.dataUrl) return null;
  return {
    id: `img-url-${Date.now()}`,
    dataUrl: hit.dataUrl,
    alt: hit.alt || alt || 'Topic image',
    credit: hit.credit || creditFor('source', language),
    sourceUrl: cleanUrl(link),
  };
}

async function fromWikipedia(query, language, signal, { limit = 1 } = {}) {
  if (!query) return [];
  const host = wikiHost(language);
  const data = await fetchJson(
    `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json`,
    signal
  );
  const needles = keywords(query).map((w) => w.toLowerCase());
  const titles = [...new Set((data?.query?.search || []).map((row) => row.title).filter(Boolean))]
    .slice(0, 6);
  const summaries = (await Promise.all(titles.map(async (title) => {
    const summary = await fetchJson(
      `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      signal
    );
    const src = summary?.originalimage?.source || summary?.thumbnail?.source;
    if (!src || !isClassroomPhoto(src, summary)) return null;
    const titleScore = needles.filter((n) => title.toLowerCase().includes(n)).length;
    if (needles.length && titleScore < 1) return null;
    return { summary, src, titleScore };
  }))).filter(Boolean);
  summaries.sort((a, b) => b.titleScore - a.titleScore);

  const out = [];
  for (const hit of summaries) {
    if (out.length >= limit) break;
    const dataUrl = await downloadAsDataUrl(commonsThumb(hit.src, 1200), signal)
      || await downloadAsDataUrl(hit.src, signal);
    if (!dataUrl) continue;
    out.push({
      dataUrl,
      alt: hit.summary?.title || query,
      credit: creditFor('wiki', language),
      sourceUrl: cleanUrl(hit.src),
    });
  }
  return out;
}

async function fromCommons(query, language, signal, { limit = 1 } = {}) {
  if (!query) return [];
  const data = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*`
      + `&generator=search&gsrsearch=${encodeURIComponent(`filetype:bitmap ${query}`)}`
      + `&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1200`,
    signal
  );
  const pages = Object.values(data?.query?.pages || {});
  const needles = keywords(query).map((w) => w.toLowerCase());
  pages.sort((a, b) => {
    const scoreA = keywordScore(`${a.title || ''} ${a.imageinfo?.[0]?.url || ''}`, needles);
    const scoreB = keywordScore(`${b.title || ''} ${b.imageinfo?.[0]?.url || ''}`, needles);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (b.imageinfo?.[0]?.width || 0) - (a.imageinfo?.[0]?.width || 0);
  });
  const ranked = pages.filter((page) => {
    const info = page.imageinfo?.[0];
    if (!info?.url && !info?.thumburl) return false;
    if (!isPhotoMime(info.mime, info.url || info.thumburl)) return false;
    if ((info.width || 0) && info.width < 500) return false;
    return true;
  });
  const scored = ranked.filter((page) => {
    const info = page.imageinfo?.[0];
    return !needles.length || keywordScore(`${page.title || ''} ${info.url || ''}`, needles) >= 1;
  });
  // Prefer keyword matches; do not fall back to unrelated Commons hits.
  const pool = scored.length ? scored : (needles.length ? [] : ranked);
  const out = [];
  for (const page of pool) {
    if (out.length >= limit) break;
    const info = page.imageinfo?.[0];
    const candidates = [
      info.thumburl,
      info.url,
      commonsThumb(info.url, 1200),
    ].filter(Boolean);
    let dataUrl = null;
    for (const candidate of candidates) {
      dataUrl = await downloadAsDataUrl(candidate, signal);
      if (dataUrl) break;
    }
    if (!dataUrl) continue;
    out.push({
      dataUrl,
      alt: String(page.title || query).replace(/^File:/i, ''),
      credit: creditFor('wiki', language),
      sourceUrl: cleanUrl(info.url || info.thumburl || ''),
    });
  }
  return out;
}

async function youtubeThumb(videoId, signal) {
  if (!videoId) return null;
  for (const name of ['maxresdefault', 'sddefault', 'hqdefault']) {
    const dataUrl = await downloadAsDataUrl(`https://i.ytimg.com/vi/${videoId}/${name}.jpg`, signal);
    if (dataUrl) return dataUrl;
  }
  return null;
}

/**
 * Search query from the article's main idea, not abstract lesson themes.
 */
export function lessonImageQuery(lesson = {}, extraTopic = '', source = {}) {
  const idea = String(lesson.imageSearch || extraTopic || '').trim();
  const headline = String(lesson.sourceTitle || source.title || lesson.title || '').trim();
  return searchQuery({
    title: idea || headline,
    topic: idea,
  });
}

function looksEnglish(text) {
  const s = String(text || '');
  if (!s.trim()) return false;
  const letters = s.replace(/[^a-zA-ZąćęłńóśźżÄÖÜäöüß]/g, '');
  const ascii = (s.match(/[a-zA-Z]/g) || []).length;
  return ascii >= Math.max(3, letters.length * 0.55);
}

function buildImageQueries({ imageSearch, topic, sourceTitle, title, primary }) {
  const idea = String(imageSearch || '').trim();
  const keyFromIdea = keywords(idea);
  const keyPool = keywords(idea || topic || sourceTitle || title || primary || '');
  const list = [];
  if (idea) {
    list.push(idea.slice(0, 72));
    if (keyFromIdea.length) {
      list.push(keyFromIdea.slice(0, 3).join(' '));
      list.push(keyFromIdea.slice(0, 2).join(' '));
    }
  }
  list.push(primary);
  if (!idea) {
    list.push(keyPool.slice(0, 3).join(' '));
    list.push(keyPool.slice(0, 2).join(' '));
    list.push(searchQuery({ title: sourceTitle || title || '', topic: '' }));
  }
  list.push(keyPool.slice(0, 1).join(' '));
  return [...new Set(list.map((q) => String(q || '').trim()).filter((q) => q.length >= 3))];
}

async function fromOpenverse(query, language, signal, { limit = 1 } = {}) {
  if (!query) return [];
  const data = await fetchJson(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=12&mature=false`,
    signal
  );
  const needles = keywords(query).map((w) => w.toLowerCase());
  const score = (item) => {
    const hay = `${item.title || ''} ${item.tags?.map((t) => t.name || t).join(' ') || ''}`.toLowerCase();
    return needles.filter((n) => hay.includes(n)).length;
  };
  const results = [...(data?.results || [])].sort((a, b) => score(b) - score(a));
  const out = [];
  for (const item of results) {
    if (out.length >= limit) break;
    const url = item.url || item.thumbnail;
    if (!url || !isPhotoMime(item.filetype ? `image/${item.filetype}` : '', url)) continue;
    if (/svg|gif/i.test(item.filetype || '') || /\.svg($|\?)/i.test(url)) continue;
    if (needles.length && score(item) < 1) continue;
    const dataUrl = await downloadAsDataUrl(item.thumbnail || item.url, signal)
      || await downloadAsDataUrl(item.url, signal);
    if (!dataUrl) continue;
    out.push({
      dataUrl,
      alt: item.title || query,
      credit: creditFor('openverse', language),
      sourceUrl: cleanUrl(item.url || item.thumbnail || ''),
    });
  }
  return out;
}

/**
 * Find several classroom-safe photos of the article's main idea for the teacher to pick from.
 */
export async function findTopicImages({
  title,
  topic,
  themes,
  vocabulary,
  introduction,
  imageSearch,
  sourceTitle,
  imageUrl,
  youtubeId,
  language = 'en',
  timeoutMs = 22000,
  limit = 5,
} = {}) {
  const max = Math.min(8, Math.max(1, Number(limit) || 5));
  const deadline = Date.now() + Math.max(5000, timeoutMs);
  const lesson = { title, themes, vocabulary, introduction, imageSearch, sourceTitle };
  const primary = lessonImageQuery(lesson, topic, { title: sourceTitle || title });
  const queries = buildImageQueries({
    imageSearch,
    topic,
    sourceTitle,
    title,
    primary,
  });
  const alt = queries[0] || title || topic || 'Lesson';
  const preferEn = looksEnglish(imageSearch || primary || '');

  const seen = new Set();
  const out = [];
  const pushAll = (items) => {
    for (const item of items || []) {
      if (out.length >= max) return;
      if (!item?.dataUrl) continue;
      const key = item.sourceUrl || `${item.alt}|${item.dataUrl.length}|${item.dataUrl.slice(32, 64)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `img-${out.length + 1}`,
        dataUrl: item.dataUrl,
        alt: item.alt || alt,
        credit: item.credit || creditFor('wiki', language),
        sourceUrl: item.sourceUrl || '',
        query: item.query || '',
      });
    }
  };

  for (const query of queries) {
    if (out.length >= max) break;
    const remaining = deadline - Date.now();
    if (remaining < 1500) break;
    const signal = AbortSignal.timeout(Math.min(remaining, 10000));
    const need = max - out.length;
    try {
      // Concrete English photo keywords → search English Commons/Wikipedia first.
      if (preferEn) {
        pushAll(await fromCommons(query, 'en', signal, { limit: need }));
        if (out.length >= max) break;
        pushAll(await fromWikipedia(query, 'en', signal, { limit: Math.max(1, need) }));
        if (out.length >= max) break;
        pushAll(await fromOpenverse(query, language, signal, { limit: Math.max(1, need) }));
      } else {
        pushAll(await fromCommons(query, language, signal, { limit: need }));
        if (out.length >= max) break;
        pushAll(await fromWikipedia(query, language, signal, { limit: Math.max(1, need) }));
        if (out.length >= max) break;
        if (!String(language || '').toLowerCase().startsWith('en')) {
          pushAll(await fromWikipedia(query, 'en', signal, { limit: Math.max(1, need) }));
        }
        if (out.length >= max) break;
        pushAll(await fromOpenverse(query, language, signal, { limit: Math.max(1, need) }));
      }
    } catch {
      /* try a shorter query with remaining time */
    }
  }

  const remaining = deadline - Date.now();
  if (out.length < max && remaining > 800) {
    const signal = AbortSignal.timeout(remaining);
    try {
      if (imageUrl) {
        const hit = await fromDirectUrl(imageUrl, {
          alt,
          credit: creditFor('source', language),
          signal,
        });
        if (hit) pushAll([{ ...hit, sourceUrl: cleanUrl(imageUrl) }]);
      }
      if (out.length < max && youtubeId) {
        const dataUrl = await youtubeThumb(youtubeId, signal);
        if (dataUrl) {
          pushAll([{
            dataUrl,
            alt,
            credit: creditFor('youtube', language),
            sourceUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
          }]);
        }
      }
    } catch {
      /* ignore fallbacks */
    }
  }

  return out;
}

/**
 * Find a classroom-safe photo of the article's main idea.
 * Searches Wikimedia Commons, Wikipedia, and Openverse first.
 * The article/YouTube image is only a last resort.
 */
export async function findTopicImage(opts = {}) {
  const images = await findTopicImages({ ...opts, limit: 1 });
  return images[0] || null;
}

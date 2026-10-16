/**
 * Shared helpers for lesson video links and pasted embed codes.
 */

export function extractYoutubeId(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^[\w-]{6,20}$/.test(text) && !/[./]/.test(text)) return text;
  try {
    const u = new URL(text);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || '';
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const parts = u.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) return parts[1] || '';
    }
  } catch {
    /* fall through */
  }
  const m = text.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{6,})/i
  );
  return m?.[1] || '';
}

/** Canonical watch / media URL shown on the worksheet listen box and on slides. */
export function resolveMediaUrl(source = {}, lesson = {}) {
  const videoDirect = String(source?.videoUrl || '').trim();
  if (videoDirect) return videoDirect;
  const direct = String(source?.url || lesson?.sourceUrl || '').trim();
  if (direct && extractYoutubeId(direct)) return direct;
  // Prefer an explicit media URL even in combined lessons (non-YouTube video + article).
  if (direct && (source?.media || source?.skillHint === 'listening' || source?.skillHint === 'combined')) {
    return direct;
  }
  if (direct && !source?.combinedSources) return direct;
  const id = extractYoutubeId(source?.youtubeId) || extractYoutubeId(lesson?.youtubeId);
  if (id) return `https://www.youtube.com/watch?v=${id}`;
  return direct || '';
}

/**
 * Parse a pasted iframe embed snippet (or a bare embed URL).
 * Returns { embedSrc, embedHtml, youtubeId, sourceUrl } or null.
 */
export function parseVideoEmbed(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  let src = '';
  const iframeMatch = raw.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i);
  if (iframeMatch) {
    src = iframeMatch[1].trim();
  } else if (/^https?:\/\//i.test(raw)) {
    src = raw;
  } else {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(src);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const youtubeId = extractYoutubeId(src) || extractYoutubeId(parsed.href);
  const sourceUrl = youtubeId
    ? `https://www.youtube.com/watch?v=${youtubeId}`
    : parsed.href;

  // Prefer privacy-enhanced YouTube embed when we know the id.
  const embedSrc = youtubeId
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?rel=0&modestbranding=1`
    : parsed.href;

  const embedHtml = `<iframe src="${embedSrc}" title="Lesson video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;

  return { embedSrc, embedHtml, youtubeId, sourceUrl };
}

import { extractText, getDocumentProxy } from 'unpdf';

/** pdf.js rejects Node Buffer even though it extends Uint8Array — use a plain Uint8Array. */
export function pdfBinaryData(input) {
  if (!input) return new Uint8Array(0);
  if (Buffer.isBuffer(input)) return Uint8Array.from(input);
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

export async function extractPdfText(buffer) {
  const bytes = pdfBinaryData(buffer);
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: true });
  const raw = Array.isArray(result.text) ? result.text.join('\n\n') : result.text || '';
  const text = cleanPdfContent(raw);
  if (!text) throw new Error('Could not read text from that PDF. Paste the text instead.');
  return text;
}

/** Strip PDF noise (page numbers, repeated headers/footers, broken spaces). */
export function cleanPdfContent(raw) {
  const lines = String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim());

  const counts = new Map();
  for (const line of lines) {
    if (line.length < 4 || line.length > 90) continue;
    counts.set(line, (counts.get(line) || 0) + 1);
  }
  const repeated = new Set(
    [...counts.entries()]
      .filter(([, n]) => n >= 3)
      .map(([line]) => line),
  );

  const kept = [];
  for (const line of lines) {
    if (!line) {
      if (kept.length && kept[kept.length - 1] !== '') kept.push('');
      continue;
    }
    if (/^\d{1,3}$/.test(line)) continue;
    if (/^(strona|page|s\.|p\.)\s*\d+/i.test(line)) continue;
    if (/^\d+\s*\/\s*\d+$/.test(line)) continue;
    if (repeated.has(line)) continue;
    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Guess a short classroom topic from PDF text when the teacher left the topic blank.
 */
export function inferTopicFromPdfText(text, { maxLen = 80 } = {}) {
  const raw = String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n');
  if (!raw.trim()) return '';

  const lines = raw
    .split(/\n+/)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);

  const skip = /^(spis treści|spis tresci|copyright|©|wydawnictwo|isbn|www\.|http|strona\s+\d|page\s+\d)/i;
  // Prefer short title-like lines from the opening pages (even if they later repeat as headers).
  for (const line of lines.slice(0, 40)) {
    if (skip.test(line)) continue;
    if (/^\d{1,3}$/.test(line) || /^\d+\s*\/\s*\d+$/.test(line)) continue;
    if (line.length < 4 || line.length > 100) continue;
    if (/^[•\-\d.)\s]+$/.test(line)) continue;
    if (line.length <= 80 && !/[.!?].+[.!?]/.test(line) && /[A-Za-zÀ-žĄąĆćĘęŁłŃńÓóŚśŹźŻż]/.test(line)) {
      return clipTopic(line, maxLen);
    }
  }

  const cleaned = cleanPdfContent(raw);
  const firstSentence = cleaned
    .replace(/\s+/g, ' ')
    .match(/[^.!?\n]{12,120}[.!?]/);
  if (firstSentence) return clipTopic(firstSentence[0].replace(/[.!?]\s*$/, ''), maxLen);

  return clipTopic((cleaned.split(/\n+/).find(Boolean) || lines[0] || ''), maxLen);
}

function clipTopic(s, maxLen) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf(','));
  return `${(at > 40 ? cut.slice(0, at) : cut).trim()}…`;
}

export function pdfFromBase64(data) {
  if (!data || typeof data !== 'string') return null;
  const comma = data.indexOf(',');
  const payload = data.startsWith('data:') && comma !== -1 ? data.slice(comma + 1) : data;
  const buf = Buffer.from(payload, 'base64');
  if (!buf.length) return null;
  if (buf.length > 12_000_000) throw new Error('PDF is too large (max 8 MB).');
  return pdfBinaryData(buf);
}

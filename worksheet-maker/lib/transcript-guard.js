/**
 * Transcript guard: a video/audio transcript is teacher-only assistance. It must never reach the
 * student sheet, print/PDF, Drive PDF or student slides. Browser + server (no Node APIs).
 */

const TS = /\[\d{1,2}:\d{2}(?::\d{2})?\]/;
const words = (s) => String(s || '').toLowerCase().replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, ' ').match(/[\p{L}\p{N}']+/gu) || [];

/** True when the lesson's only source is a video/audio (no reading text for students). */
export function isMediaOnlyLesson(lesson, source) {
  const combined = lesson?.skill === 'combined' || Boolean(source?.combinedSources) || source?.skillHint === 'combined';
  if (combined) return false;
  return lesson?.skill === 'listening' || source?.skillHint === 'listening' || source?.media === true;
}

/** The media transcript the lesson was built from (with [m:ss] markers when available), or ''. */
export function mediaTranscriptOf(lesson, source) {
  const raw = String(source?.text || '');
  const combined = lesson?.skill === 'combined' || Boolean(source?.combinedSources);
  if (combined) {
    const m = raw.match(/\[VIDEO — listening source\]\n(?:Title:[^\n]*\n)?([\s\S]*?)(?:\n\n\[READING TEXT\]|$)/);
    return m && source?.transcriptFound !== false ? m[1].trim() : '';
  }
  if (!isMediaOnlyLesson(lesson, source)) return '';
  if (raw.trim() && source?.transcriptFound !== false) return raw.trim();
  const paras = Array.isArray(lesson?.sourceParagraphs) && lesson.sourceParagraphs.length
    ? lesson.sourceParagraphs : String(lesson?.sourceText || '').split(/\n\s*\n/);
  return paras.map((p) => String(p).trim()).filter(Boolean).join('\n\n');
}

function shingles(list, n) {
  const out = new Set();
  for (let i = 0; i + n <= list.length; i += 1) out.add(list.slice(i, i + n).join(' '));
  return out;
}

/** Share (0..1) of a paragraph's 6-word runs that also occur in the transcript. */
export function transcriptOverlap(text, transcript) {
  const a = words(text);
  if (a.length < 6) return 0;
  const t = shingles(words(transcript), 6);
  if (!t.size) return 0;
  const s = [...shingles(a, 6)];
  return s.filter((x) => t.has(x)).length / s.length;
}

export function looksLikeTranscript(p) {
  return TS.test(String(p || '')) || /^\s*(SPEAKER_\d+|Speaker \d+)\s*:/m.test(String(p || ''));
}

/** Paragraphs safe to show students as "source text": none for media-only lessons; no transcript paragraphs for combined ones. */
export function studentSourceParagraphs(lesson, source) {
  if (isMediaOnlyLesson(lesson, source)) return [];
  const list = Array.isArray(lesson?.sourceParagraphs) && lesson.sourceParagraphs.length
    ? lesson.sourceParagraphs
    : String(lesson?.sourceText || '').split(/\n\s*\n/);
  const paras = list.map((p) => String(p).trim()).filter(Boolean);
  const transcript = mediaTranscriptOf(lesson, source);
  return paras.filter((p) => !looksLikeTranscript(p) && !(transcript && transcriptOverlap(p, transcript) >= 0.5));
}

const SOURCE_KEYS = new Set(['sourceParagraphs', 'sourceText', 'teacherNotes', 'companionMedia', 'sourceUrl', 'title', 'themes']);

/** Shorten any student-facing string that pastes a long transcript chunk (> maxRun words verbatim). Short quotes stay. */
export function stripLongTranscriptChunks(lesson, transcript, { maxRun = 25, keep = 12 } = {}) {
  const tw = words(transcript);
  if (!lesson || tw.length < maxRun) return 0;
  const runs = shingles(tw, maxRun);
  let changed = 0;
  const fix = (s) => {
    const w = words(s);
    if (w.length <= maxRun) return s;
    for (let i = 0; i + maxRun <= w.length; i += 1) {
      if (runs.has(w.slice(i, i + maxRun).join(' '))) {
        changed += 1;
        const toks = String(s).replace(TS, '').trim().split(/\s+/);
        return `${toks.slice(0, keep).join(' ')} …`;
      }
    }
    return s;
  };
  const walk = (v, key) => {
    if (SOURCE_KEYS.has(key) || /answer|explanation|evidence|key$/i.test(String(key || ''))) return v;
    if (typeof v === 'string') return fix(v);
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = walk(v[k], k); return v; }
    return v;
  };
  for (const k of Object.keys(lesson)) lesson[k] = walk(lesson[k], k);
  return changed;
}

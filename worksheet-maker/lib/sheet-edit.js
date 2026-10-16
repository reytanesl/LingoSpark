/**
 * Apply a dotted path edit to the lesson JSON (e.g. "vocabulary.0.word").
 * Returns true if the value changed.
 */
export function applyLessonPath(lesson, path, value) {
  if (!lesson || !path) return false;
  const keys = String(path).split('.').filter(Boolean);
  if (!keys.length) return false;

  // Normalize string lists that the UI edits by index.
  if (keys[0] === 'introduction' && typeof lesson.introduction === 'string') {
    lesson.introduction = [lesson.introduction];
  }
  if (keys[0] === 'discussion' && Array.isArray(lesson.discussion)) {
    lesson.discussion = lesson.discussion.map((q) => (
      typeof q === 'string' ? q : (q?.prompt || q?.question || '')
    ));
  }

  let cur = lesson;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    const nextKey = keys[i + 1];
    const asIndex = /^\d+$/.test(key);
    const nextAsIndex = /^\d+$/.test(nextKey);
    if (asIndex) {
      const idx = Number(key);
      if (!Array.isArray(cur)) return false;
      if (cur[idx] == null) cur[idx] = nextAsIndex ? [] : {};
      cur = cur[idx];
      continue;
    }
    if (cur[key] == null || typeof cur[key] !== 'object') {
      cur[key] = nextAsIndex ? [] : {};
    }
    cur = cur[key];
  }

  const last = keys[keys.length - 1];
  const nextVal = value;
  if (/^\d+$/.test(last)) {
    if (!Array.isArray(cur)) return false;
    const idx = Number(last);
    if (cur[idx] === nextVal) return false;
    cur[idx] = nextVal;
  } else {
    if (cur[last] === nextVal) return false;
    cur[last] = nextVal;
  }

  if (path.startsWith('sourceParagraphs.') || path === 'sourceParagraphs') {
    const paras = Array.isArray(lesson.sourceParagraphs) ? lesson.sourceParagraphs : [];
    lesson.sourceText = paras.map((p) => String(p || '').trim()).filter(Boolean).join('\n\n');
  }
  if (path === 'sourceText' && !Array.isArray(lesson.sourceParagraphs)?.length) {
    lesson.sourceParagraphs = String(nextVal || '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return true;
}

export function editableText(path, text, { tag = 'span', multiline = false } = {}) {
  const safePath = String(path || '').replace(/"/g, '');
  const body = escapeHtml(text ?? '');
  const ml = multiline ? ' data-multiline="1"' : '';
  return `<${tag} class="sheet-edit" contenteditable="true" spellcheck="true" data-edit="${safePath}"${ml}>${body}</${tag}>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

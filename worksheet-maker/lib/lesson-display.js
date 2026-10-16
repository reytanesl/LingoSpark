/** Word-bank entries that each have a matching gap — no unused extras. */
export function exactAnswerBank(answers) {
  return (answers || [])
    .map((a) => {
      if (a && typeof a === 'object') return a.answer || a.word || '';
      return a == null ? '' : String(a);
    })
    .map((w) => String(w).trim())
    .filter(Boolean);
}
export function splitIntro(value) {
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }
  const text = String(value || '').trim();
  if (!text) return [];
  if (/\n/.test(text)) {
    return text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  return text
    .split(/(?<=[.!?…])\s+(?=[^\s])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function stripSummaryCue(text) {
  return String(text || '')
    .replace(/\s*Do not look up a summary\.?/gi, '')
    .replace(/\s*Do not read a summary(?: of the recording)?\.?/gi, '')
    .replace(/\s*Schau nicht in einer Zusammenfassung nach\.?/gi, '')
    .replace(/\s*Schauen Sie nicht in einer Zusammenfassung nach\.?/gi, '')
    .replace(/\s*Lesen Sie keine Zusammenfassung(?: der Aufnahme)?\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripWriteTheLetter(text) {
  return String(text || '')
    .replace(/\s*Write the letter\.?/gi, '')
    .replace(/\s*Schreibe den Buchstaben(?: hin)?\.?/gi, '')
    .replace(/\s*Schreiben Sie den Buchstaben(?: hin)?\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove markdown bold/italic noise and "Zadanie N (…)" prefixes from student-facing copy. */
export function sanitizeStudentFacingText(text) {
  let s = String(text ?? '');
  if (!s) return '';
  s = s.replace(/\*\*/g, '');
  s = s.replace(/__(.+?)__/g, '$1');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*([\s).,;:!?]|$)/g, '$1$2$3');
  s = s.replace(/^\s*#+\s*/gm, '');
  s = s.replace(/^\s*Zadanie\s+\d+\s*/i, '');
  const onlyParen = s.match(/^\s*[\(（]\s*(.+?)\s*[\)）]\s*\.?\s*$/u);
  if (onlyParen) {
    s = onlyParen[1];
    s = s.replace(/^\s*(?:ćwiczenie\s+)?dodatkowe\s*[–—\-:.]?\s*/i, '').trim();
  } else {
    s = s.replace(/^\s*[\(（][^)）]*[\)）]\s*\.?\s*/u, '');
    s = s.replace(/^\s*(?:ćwiczenie\s+)?dodatkowe\s*[–—\-:.]?\s*/i, '');
  }
  s = s.replace(/^\s*[–—\-:.]+\s*/, '');
  return s.replace(/\s+/g, ' ').trim();
}

function hashSeed(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable shuffle so the same sentence keeps the same scrambled order across renders. */
export function scrambleSentenceWords(sentence, { separator = ' / ' } = {}) {
  const words = String(sentence || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words.join(' ');
  const original = words.join(' ');
  const arr = [...words];
  let seed = hashSeed(original) || 1;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (arr.join(' ') !== original) break;
  }
  if (arr.join(' ') === original && arr.length > 1) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }
  return arr.join(separator);
}

function foldLoose(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s*[/·|]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isScramblePracticeKind(kind, instruction = '') {
  const blob = `${kind || ''} ${instruction || ''}`.toLowerCase();
  return /scramble|rozsyp|word.?salad|word.?order/.test(blob);
}

/** Ensure rozsypywanka prompts show words in random order; answer is the full sentence. */
export function normalizeScramblePracticeItem(item) {
  const it = item && typeof item === 'object' ? { ...item } : { prompt: String(item || ''), answer: '' };
  let answer = String(it.answer ?? '').trim();
  let prompt = String(it.prompt || it.question || '').trim();
  if (!answer && prompt && !/[\/·|]/.test(prompt)) {
    answer = prompt;
  }
  if (!answer && prompt) {
    answer = foldLoose(prompt).split(' ').filter(Boolean).join(' ');
  }
  const promptLoose = foldLoose(prompt);
  const answerLoose = foldLoose(answer);
  const needsScramble = Boolean(answer)
    && (!prompt || promptLoose === answerLoose || !/[\/·|]/.test(prompt));
  if (needsScramble) {
    prompt = scrambleSentenceWords(answer);
  }
  return {
    ...it,
    prompt,
    answer,
    space: it.space || 'lines',
  };
}

const SANITIZE_SKIP_KEYS = new Set([
  'dataUrl', 'thumbnailUrl', 'embedSrc', 'embedHtml', 'youtubeId', 'id',
  'sourceUrl', 'imageSearch', 'mode', 'polishSubject', 'language', 'skill', 'cefr',
]);

/** Strip markdown / "Zadanie N" noise from lesson strings (skip binary/url fields). */
export function sanitizeLessonStudentText(lesson) {
  if (!lesson || typeof lesson !== 'object') return lesson;

  const walk = (node, key = '') => {
    if (node == null) return node;
    if (typeof node === 'string') {
      if (SANITIZE_SKIP_KEYS.has(key)) return node;
      if (/^https?:\/\//i.test(node) || node.startsWith('data:')) return node;
      return sanitizeStudentFacingText(node);
    }
    if (Array.isArray(node)) return node.map((x) => walk(x, key));
    if (typeof node === 'object') {
      const out = Array.isArray(node) ? [] : { ...node };
      for (const [k, v] of Object.entries(node)) {
        out[k] = walk(v, k);
      }
      return out;
    }
    return node;
  };

  return walk(lesson, '');
}

export function definitionText(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item;
  return item.text || item.definition || item.word || '';
}

export function definitionLetter(item) {
  if (!item || typeof item === 'string') return '';
  return String(item.letter || '').trim();
}

export function matchUsesLetters(definitions = []) {
  return (definitions || []).some((item) => definitionLetter(item));
}

/**
 * "Missing sentences" (gapped text, matura / FCE Part 6 style): a text with N numbered sentence gaps
 * and N+1 lettered sentences — exactly one extra. Pure helpers, safe in the browser and in Node.
 *
 * The model returns { text with [1]..[N] markers, gapSentences[N] in gap order, extraSentence }.
 * normalizeMissingSentences() validates, enforces the rules and builds the shuffled lettered box.
 */

export const MS_MARKER = /\[(\d{1,2})\]/g;
const LETTERS = 'ABCDEFGHIJ';

/** Gaps per CEFR level: A1–A2 4, B1 5, B2+ 6. */
export function missingSentenceGapCount(cefr = 'B1') {
  const c = String(cefr || '').toUpperCase();
  if (/^A/.test(c)) return 4;
  if (/^B1/.test(c) || !c || c === 'AUTO') return 5;
  return 6;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const cleanSentence = (s) => String(s || '').replace(/^\s*[A-J][).:]\s+/, '').replace(/\s+/g, ' ').trim();

export function missingSentencesInstruction(lang, n) {
  const last = LETTERS[n] || 'G';
  const L = String(lang || 'en').toLowerCase();
  if (L === 'pl') return `Przeczytaj tekst. Wybierz zdanie (A–${last}), które pasuje do każdej luki (1–${n}). Jedno zdanie jest dodatkowe i nie pasuje do żadnej luki.`;
  if (L === 'de') return `Lies den Text. Welcher Satz (A–${last}) passt in welche Lücke (1–${n})? Ein Satz ist zu viel und passt in keine Lücke.`;
  return `Read the text. Choose the sentence (A–${last}) that fits each gap (1–${n}). There is one extra sentence that you do not need.`;
}

function seededRandom(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

/**
 * @returns {object|null} normalized task, or null when it cannot be made valid (task is dropped).
 */
export function normalizeMissingSentences(task, { cefr = 'B1', language = 'en', random = null } = {}) {
  if (!task || typeof task !== 'object') return null;
  if (task.normalized && Array.isArray(task.options) && Array.isArray(task.answers)) return task;
  let text = String(task.text || (Array.isArray(task.paragraphs) ? task.paragraphs.join('\n\n') : '')).trim();
  const given = (Array.isArray(task.gapSentences) ? task.gapSentences : []).map(cleanSentence);
  const extra = cleanSentence(task.extraSentence);
  if (!text || !extra) return null;

  // Walk the markers in text order; each one takes the sentence named by its number.
  const order = [];
  text = text.replace(MS_MARKER, (m, d) => {
    const s = given[Number(d) - 1];
    if (!s || order.some((o) => o.n === Number(d))) return ' ';
    order.push({ n: Number(d), sentence: s });
    return `\u0000${order.length - 1}\u0000`;
  });
  let gaps = order.map((o) => o.sentence);
  const keep = new Set(gaps.map((_, i) => i));
  const inline = (i) => keep.delete(i);

  // A gap must not open the text: fill it back in.
  const firstTok = text.indexOf('\u0000');
  if (firstTok >= 0 && !text.slice(0, firstTok).replace(/\s+/g, '')) inline(Number(text.slice(firstTok + 1, text.indexOf('\u0000', firstTok + 1))));
  // Too many gaps for the level: fill the last ones back in.
  const max = missingSentenceGapCount(cefr);
  const live = () => [...keep].sort((a, b) => a - b);
  while (live().length > max) inline(live()[live().length - 1]);

  // Duplicates / extra equal to a gap sentence make the key ambiguous.
  const kept = live().map((i) => gaps[i]);
  const keys = kept.map(norm);
  if (new Set(keys).size !== keys.length) return null;
  if (keys.includes(norm(extra))) return null;
  if (kept.length < 3) return null;

  let num = 0;
  const finalGaps = [];
  text = text.replace(/\u0000(\d+)\u0000/g, (m, i) => {
    const idx = Number(i);
    if (!keep.has(idx)) return gaps[idx];
    finalGaps.push(gaps[idx]);
    num += 1;
    return `[${num}]`;
  }).replace(/[ \t]{2,}/g, ' ').trim();
  gaps = finalGaps;

  const rnd = random || seededRandom(`${text.length}|${gaps.join('|')}|${extra}`);
  const pool = [...gaps.map((s, i) => ({ s, gap: i })), { s: extra, gap: -1 }];
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    if (pool.some((p, i) => p.gap !== i)) break; // never in gap order
  }
  const options = pool.map((p) => p.s);
  const answers = gaps.map((_, g) => LETTERS[pool.findIndex((p) => p.gap === g)]);
  const extraLetter = LETTERS[pool.findIndex((p) => p.gap === -1)];
  return {
    instruction: missingSentencesInstruction(language, gaps.length),
    text,
    options,
    answers,
    extra: extraLetter,
    gapSentences: gaps,
    extraSentence: extra,
    normalized: true,
  };
}

/** Split the gapped text into parts: { text } and { gap: n } (n is 1-based). */
export function missingSentenceParts(text) {
  const parts = [];
  let last = 0;
  for (const m of String(text || '').matchAll(MS_MARKER)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ gap: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < String(text || '').length) parts.push({ text: text.slice(last) });
  return parts;
}

export const MS_LETTERS = LETTERS;

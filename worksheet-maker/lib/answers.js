import { correctDeckFromSource, correctLessonFromSource } from './verify-answers.js';
import {
  exactAnswerBank,
  splitIntro,
  stripSummaryCue,
  stripWriteTheLetter,
  sanitizeLessonStudentText,
  isScramblePracticeKind,
  normalizeScramblePracticeItem,
} from './lesson-display.js';

/** Resolve closed-task answers whether the model used a letter, a word, or a boolean. */

export function optionIndex(answer, options = []) {
  const raw = String(answer ?? '').trim();
  if (!raw) return -1;
  const letter = raw.toUpperCase().match(/^([A-H])(?:[).:\s]|$)/);
  if (letter) {
    const idx = letter[1].charCodeAt(0) - 65;
    if (!options.length || idx < options.length) return idx;
  }
  const needle = raw.toLowerCase().replace(/^[a-h][).:]\s*/i, '');
  return options.findIndex((o) => String(o).trim().toLowerCase() === needle);
}

export function isTrue(answer) {
  if (answer === true || answer === 1) return true;
  const s = String(answer ?? '').trim().toLowerCase();
  return s === 'true' || s === 't' || s === 'yes';
}

export function isFalse(answer) {
  if (answer === false || answer === 0) return true;
  const s = String(answer ?? '').trim().toLowerCase();
  return s === 'false' || s === 'f' || s === 'no';
}

export function tfLabel(answer) {
  if (isTrue(answer)) return 'True';
  if (isFalse(answer)) return 'False';
  return '';
}

export function answerWord(value) {
  if (value && typeof value === 'object') return value.answer || value.word || '';
  return value == null ? '' : String(value);
}

export function keyList(key, ...names) {
  for (const name of names) {
    if (Array.isArray(key?.[name]) && key[name].length) return key[name];
  }
  return [];
}

export function resolveChoice(item = {}, keyItem = {}, preferKey = false) {
  const options = item.options || [];
  const raw = preferKey
    ? (keyItem.word || keyItem.answer || item.answer || '')
    : (item.answer || keyItem.word || keyItem.answer || '');
  const idx = optionIndex(raw, options);
  const word = (preferKey ? keyItem.word : '')
    || item.word
    || keyItem.word
    || (idx >= 0 ? options[idx] : '')
    || (!/^[A-H](?:[).:\s]|$)/i.test(String(raw).trim()) ? answerWord(raw) : '');
  return {
    ...item,
    answer: idx >= 0 ? String.fromCharCode(65 + idx) : raw,
    word,
  };
}

export function formatChoiceAnswer(item = {}, keyItem = {}) {
  const resolved = resolveChoice(item, keyItem, true);
  const letter = String(resolved.answer || '').trim();
  const word = String(resolved.word || '').replace(/^[A-H][).:]\s*/i, '').trim();
  if (/^[A-H]$/i.test(letter) && word) return `${letter.toUpperCase()}) ${word}`;
  return word || letter;
}

function nonEmptyLists(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (Array.isArray(v) && v.length) out[k] = v;
  }
  return out;
}

export function answerKeyFromLesson(lesson) {
  if (!lesson) return {};
  const mc = lesson.comprehension?.multipleChoice || [];
  const tf = lesson.comprehension?.trueFalse || [];
  const gap = lesson.comprehension?.gapFill || {};
  const cloze = lesson.cloze || {};
  const wb = lesson.wordBankTask || {};
  const match = lesson.vocabMatch || {};
  const wf = lesson.wordFormation || {};
  const vocabItems = (lesson.vocabBuilding || [])
    .filter((task) => task && String(task.kind || '').toLowerCase() !== 'match')
    .flatMap((task) => task.items || []);
  const collocateItems = vocabCollocateTasks(lesson).flatMap((task) => task.items || []);
  const wfItems = (wf.items || []).length
    ? wf.items
    : (wf.answers || []).map((answer) => ({ answer }));
  return nonEmptyLists({
    multipleChoice: mc.map((q, i) => {
      const r = resolveChoice(q);
      return { item: i + 1, answer: r.answer, word: r.word };
    }),
    trueFalse: tf.map((item, i) => ({
      item: i + 1,
      answer: isTrue(item.answer) ? true : isFalse(item.answer) ? false : item.answer,
      correction: item.correction || '',
    })),
    gapFill: (gap.answers || []).map((a, i) => ({ blank: i + 1, answer: answerWord(a) })),
    cloze: (cloze.items || []).map((item, i) => {
      const r = resolveChoice(item);
      return { blank: item.blank || i + 1, answer: r.answer, word: r.word };
    }),
    wordBank: (wb.answers || []).map((a, i) => ({ sentence: i + 1, answer: answerWord(a) })),
    match: (match.answers || []).map((a, i) => ({ item: i + 1, answer: answerWord(a) })),
    collocate: collocateItems.map((it, i) => ({
      item: i + 1,
      left: it.prompt || it.word || it.left || '',
      answer: answerWord(it.answer),
    })),
    wordForm: wfItems.map((it, i) => ({ item: i + 1, answer: answerWord(it.answer || it) })),
    vocabBuild: vocabItems.map((it, i) => ({ item: i + 1, answer: answerWord(it.answer) })),
    grammar: (lesson.grammarPractice || []).flatMap((task) => task.items || []).map((it, i) => {
      const r = (it.options || []).length ? resolveChoice(it) : null;
      return {
        item: i + 1,
        answer: r ? (r.word || answerWord(it.answer)) : answerWord(it.answer),
      };
    }),
    practice: (lesson.practiceExercises || []).flatMap((block) => block.items || []).map((it, i) => ({
      item: i + 1,
      answer: typeof it === 'string' ? '' : answerWord(it.answer),
    })),
  });
}

function applyKeyToSlide(slide, key) {
  const s = slide || {};
  if (s.role === 'mcq') {
    const list = keyList(key, 'multipleChoice', 'mcq');
    if (!list.length) return s;
    return {
      ...s,
      mcqs: (s.mcqs || []).map((q, i) => {
        const matched = resolveChoice({
          ...q,
          answer: list[i]?.word || list[i]?.answer || q.answer,
        }, list[i] || {}, true);
        return list[i]?.answer ? placeChoiceAtLetter(matched, list[i].answer) : matched;
      }),
    };
  }
  if (s.role === 'tf') {
    const list = keyList(key, 'trueFalse', 'tf');
    if (!list.length) return s;
    const raw = s.statements?.length ? s.statements : s.bullets;
    return {
      ...s,
      statements: (raw || []).map((item, i) => {
        const text = item && typeof item === 'object' ? (item.text || item.statement || '') : String(item || '');
        const fromItem = item && typeof item === 'object' ? item.answer : undefined;
        return { text, answer: list[i]?.answer ?? fromItem };
      }),
    };
  }
  if (s.role === 'cloze') {
    const clozeKey = keyList(key, 'cloze');
    if (!clozeKey.length) return s;
    const items = (s.clozeItems || []).map((item, i) => {
      const keyItem = clozeKey[i] || {};
      const matched = resolveChoice(item, keyItem, true);
      return keyItem.answer ? placeChoiceAtLetter(matched, keyItem.answer) : matched;
    });
    return { ...s, clozeItems: items };
  }
  if (s.role === 'gapfill') {
    const gapKey = keyList(key, 'gapFill', 'gapfill');
    const fromKey = gapKey.map((x) => answerWord(x.answer || x.word || x));
    if (!fromKey.some((w) => String(w).trim())) return s;
    return { ...s, answers: fromKey };
  }
  if (s.role === 'wordbank' || s.role === 'vocabbuild' || s.role === 'wordform' || s.role === 'match' || s.role === 'grammar') {
    if (s.role === 'match' && !isLetterMatchSlide(s)) return s;
    const count = (s.sentences || s.words || s.bullets || []).length;
    if (s.role !== 'match' && slideAlreadyKeyed(s, count)) return s;
    const fromKey = s.role === 'match'
      ? keyList(key, 'match').map((x) => answerWord(x.answer || x))
      : s.role === 'wordform'
        ? keyList(key, 'wordForm', 'wordform').map((x) => answerWord(x.answer || x))
        : s.role === 'vocabbuild'
          ? keyList(key, 'vocabBuild', 'vocabbuild').map((x) => answerWord(x.answer || x))
          : s.role === 'grammar'
            ? keyList(key, 'grammar').map((x) => answerWord(x.answer || x))
            : keyList(key, 'wordBank', 'wordbank').map((x) => answerWord(x.answer || x));
    if (!fromKey.length) return s;
    if (s.role === 'match' && looksLikeLetterAnswers(fromKey) && !isLetterMatchSlide(s)) return s;
    return { ...s, answers: fromKey };
  }
  return s;
}

/** Prefer the worksheet teacher key so presentation Answers match the printed key. */
export function overlayLessonAnswers(deck, lesson) {
  if (!deck) return deck;
  const fromLesson = answerKeyFromLesson(lesson);
  const answerKey = { ...(deck.answerKey || {}), ...fromLesson };
  return {
    ...deck,
    answerKey,
    slides: (deck.slides || []).map((slide) => {
      const next = applyKeyToSlide(slide, answerKey);
      if (next.role === 'match' && !isLetterMatchSlide(next)) {
        return answersFromCollocates(next, lesson);
      }
      return next;
    }),
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function seededShuffle(items, seed) {
  const list = [...items];
  let s = hashSeed(seed);
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Word bank in a stable scrambled order, never the same order as the answers. */
export function scrambleBank(words, answers = []) {
  const list = [...(words || [])].map((w) => String(w).trim()).filter(Boolean);
  if (list.length < 2) return list;
  const seed = list.slice().sort().join('\0');
  let out = seededShuffle(list.slice().sort(), seed);
  const ans = (answers || []).map((a) => answerWord(a).toLowerCase()).filter(Boolean);
  const sameAsAnswers = ans.length && ans.every((a, i) => (out[i] || '').toLowerCase() === a);
  const stillSorted = out.every((w, i) => w === list.slice().sort()[i]);
  if (sameAsAnswers || stillSorted) out = out.slice(1).concat(out[0]);
  return out;
}

function tfAnswerFlags(items = []) {
  return (items || []).map((it) => {
    if (isTrue(it?.answer)) return true;
    if (isFalse(it?.answer)) return false;
    return null;
  });
}

/** Detect predictable T/F key sequences students can game. */
export function trueFalsePatternLooksPredictable(items = []) {
  const flags = tfAnswerFlags(items).filter((v) => v === true || v === false);
  const n = flags.length;
  if (n < 3) return false;
  if (flags.every((v) => v === flags[0])) return true;
  let alternating = true;
  for (let i = 1; i < n; i += 1) {
    if (flags[i] === flags[i - 1]) {
      alternating = false;
      break;
    }
  }
  if (alternating) return true;
  const mid = Math.floor(n / 2);
  if (mid >= 2) {
    const first = flags.slice(0, mid);
    const second = flags.slice(mid);
    if (
      first.every((v) => v === first[0])
      && second.every((v) => v === second[0])
      && first[0] !== second[0]
    ) {
      return true;
    }
  }
  let run = 1;
  for (let i = 1; i < n; i += 1) {
    run = flags[i] === flags[i - 1] ? run + 1 : 1;
    if (run >= 3 && n >= 4) return true;
  }
  const trues = flags.filter(Boolean).length;
  const falses = n - trues;
  if (n >= 4 && (trues <= 1 || falses <= 1)) return true;
  return false;
}

/**
 * Reorder T/F items with a stable seeded shuffle so the answer key
 * is not a predictable pattern (while keeping the same statements).
 */
export function diversifyTrueFalseOrder(items = []) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length < 3) return list;
  const baseSeed = list
    .map((it) => `${String(it.statement || it.text || '')}\0${String(it.answer)}`)
    .join('\n');
  let best = list;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = seededShuffle(list, `${baseSeed}::tf:${attempt}`);
    if (!trueFalsePatternLooksPredictable(candidate)) return candidate;
    best = candidate;
  }
  return best;
}

export function vocabCollocateTasks(lesson) {
  return (lesson?.vocabBuilding || []).filter((task) => task && String(task.kind || '').toLowerCase() === 'match');
}

/** Left/right columns for a collocation match — same scramble as the worksheet. */
export function collocateColumns(items = []) {
  const pairs = (items || []).map((it) => ({
    word: String(it?.prompt || it.word || it.left || '').trim(),
    answer: answerWord(it?.answer),
  })).filter((p) => p.word || p.answer);
  const answers = pairs.map((p) => p.answer);
  return {
    words: pairs.map((p) => p.word),
    definitions: scrambleBank(answers, answers),
    answers,
  };
}

export function isLetterMatchSlide(slide) {
  if (!slide || slide.role !== 'match') return false;
  if (slide.matchByLetter === false) return false;
  if (slide.matchByLetter === true) return true;
  return (slide.definitions || []).some((d) => d && typeof d === 'object' && String(d.letter || '').trim());
}

function looksLikeLetterAnswers(answers = []) {
  const list = (answers || []).map((a) => String(answerWord(a) || '').trim()).filter(Boolean);
  return list.length > 0 && list.every((a) => /^[A-H]$/i.test(a));
}

/** Copy collocation partners from the worksheet, matched by the left-hand word. */
export function answersFromCollocates(slide, lesson) {
  if (!slide || slide.role !== 'match' || isLetterMatchSlide(slide)) return slide;
  const items = vocabCollocateTasks(lesson).flatMap((task) => task.items || []);
  if (!items.length) return { ...slide, matchByLetter: false };
  const cols = collocateColumns(items);
  const byLeft = new Map(cols.words.map((w, i) => [w.toLowerCase(), cols.answers[i]]));
  const answers = (slide.words || cols.words).map((w, i) => (
    byLeft.get(String(w || '').trim().toLowerCase())
    || cols.answers[i]
    || answerWord((slide.answers || [])[i])
  ));
  return {
    ...slide,
    matchByLetter: false,
    words: (slide.words || []).length ? slide.words : cols.words,
    definitions: (slide.definitions || []).length ? slide.definitions : cols.definitions,
    answers,
  };
}

function slideAlreadyKeyed(s, count) {
  const answers = s.answers || [];
  if (!answers.some((a) => String(answerWord(a) || '').trim())) return false;
  if (count && answers.length && answers.length !== count) return false;
  return true;
}

function balancedSlots(count, optionCount, seed) {
  if (count <= 0 || optionCount <= 0) return [];
  const unique = seededShuffle([...Array(optionCount).keys()], `${seed}:u`).slice(0, Math.min(count, optionCount));
  const bag = [...unique];
  let round = 0;
  while (bag.length < count) {
    bag.push(...seededShuffle([...Array(optionCount).keys()], `${seed}:r${round}`));
    round += 1;
  }
  return bag.slice(0, count);
}

/** Move correct options so A–D (or A–C) are all used when there are enough items. */
export function spreadChoiceItems(items, seed = 'choices') {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return list;
  const k = Math.max(...list.map((it) => (it.options || []).length), 2);
  const slots = balancedSlots(list.length, k, `${seed}:${list.length}:${k}`);
  return list.map((item, i) => {
    const resolved = resolveChoice(item);
    const options = [...(resolved.options || [])];
    if (options.length < 2) return resolved;
    const src = optionIndex(resolved.answer, options);
    if (src < 0) return resolved;
    const target = Math.min(slots[i], options.length - 1);
    if (src !== target) [options[src], options[target]] = [options[target], options[src]];
    return {
      ...resolved,
      options,
      answer: String.fromCharCode(65 + target),
      word: options[target],
    };
  });
}

const TYPED_GAP_RE = /\((\d{1,2})\)(\s*_{2,})?|_{2,}|\[\s*\]|\(\s*\)/;

export function hasTypedGap(text) {
  return TYPED_GAP_RE.test(String(text || ''));
}

/** Add a visible ______ blank when a typed-answer sentence has none. */
export function ensureTypedGap(text) {
  const s = String(text || '');
  return hasTypedGap(s) ? s : `${s} ______`;
}

export function gapFillParts(sentence, word, { fill = true } = {}) {
  const src = ensureTypedGap(sentence);
  const w = fill ? String(word || '') : '';
  const parts = [];
  const re = /\((\d{1,2})\)(\s*_{2,})?|_{2,}|\[\s*\]|\(\s*\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index), fill: false });
    if (m[1]) {
      parts.push({ text: `(${m[1]}) `, fill: false });
      parts.push({ text: w, fill: true });
    } else {
      parts.push({ text: w, fill: true });
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ text: src.slice(last), fill: false });
  if (!parts.some((p) => p.fill)) {
    parts.push({ text: w, fill: true });
  }
  return parts.length ? parts : [{ text: src, fill: false }];
}

export function clozeFillParts(text, items = [], answers = [], { fill = true, fillUpTo = null } = {}) {
  const byNum = new Map();
  const ordered = [];
  const count = Math.max(items.length, answers.length);
  const allow = (i) => fill && (fillUpTo == null || i <= fillUpTo);
  for (let i = 0; i < count; i += 1) {
    const item = items[i] || {};
    const idx = optionIndex(item.answer, item.options);
    const word = allow(i)
      ? (item.word
        || (idx >= 0 ? (item.options || [])[idx] : '')
        || answerWord(answers[i])
        || '')
      : '';
    const n = Number(item.blank || item.num || i + 1);
    byNum.set(n, word);
    ordered.push(word);
  }
  const indexByNum = new Map();
  for (let i = 0; i < count; i += 1) {
    const n = Number((items[i] || {}).blank || (items[i] || {}).num || i + 1);
    if (!indexByNum.has(n)) indexByNum.set(n, i);
  }
  const src = String(text || '');
  const parts = [];
  const re = /\((\d{1,2})\)(\s*_{2,})?|_{2,}|\[\s*\]/g;
  let last = 0;
  let fallback = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index), fill: false });
    if (m[1]) {
      const blank = Number(m[1]);
      const i = indexByNum.has(blank) ? indexByNum.get(blank) : blank - 1;
      const word = allow(i) ? (byNum.get(blank) || '') : '';
      parts.push({ text: `(${m[1]}) `, fill: false });
      parts.push({ text: word, fill: true });
    } else {
      const i = fallback;
      const word = allow(i) ? (ordered[fallback] || '') : '';
      fallback += 1;
      parts.push({ text: word, fill: true });
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ text: src.slice(last), fill: false });
  if (!parts.some((p) => p.fill) && count > 0) {
    for (let i = 0; i < count; i += 1) {
      const n = Number((items[i] || {}).blank || (items[i] || {}).num || i + 1);
      parts.push({ text: `${parts.length ? ' ' : ''}(${n}) `, fill: false });
      parts.push({ text: allow(i) ? (ordered[i] || '') : '', fill: true });
    }
  }
  return parts.length ? parts : [{ text: src, fill: false }];
}

export function partsToPlain(parts) {
  return (parts || []).map((p) => p.text).join('');
}

export function placeChoiceAtLetter(item, letter) {
  const resolved = resolveChoice(item);
  const options = [...(resolved.options || [])];
  const src = optionIndex(resolved.word || resolved.answer, options);
  const target = String(letter || '').trim().toUpperCase().charCodeAt(0) - 65;
  if (src < 0 || target < 0 || target >= options.length || src === target) return resolved;
  [options[src], options[target]] = [options[target], options[src]];
  return {
    ...resolved,
    options,
    answer: String.fromCharCode(65 + target),
    word: options[target],
  };
}

function foldWordForm(text) {
  return String(text || '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, '');
}

function wordFormationStem(item = {}) {
  const fromField = String(item.prompt || '').trim();
  if (fromField) return fromField;
  const m = String(item.sentence || '').match(/\(([^)]+)\)\s*$/);
  return String(m?.[1] || '').trim();
}

/** Keep only items where the gap answer differs from the bracketed stem. */
export function normalizeWordFormation(wf) {
  if (!wf || typeof wf !== 'object') return wf;
  const raw = (wf.items || []).length
    ? wf.items
    : (wf.sentences || []).map((sentence, i) => ({
      sentence,
      answer: (wf.answers || [])[i],
    }));
  const cleaned = raw.map((it) => {
    const prompt = wordFormationStem(it);
    const answer = answerWord(it?.answer);
    return {
      ...it,
      prompt: prompt || it.prompt || '',
      answer,
    };
  }).filter((it) => {
    const stem = foldWordForm(it.prompt);
    const ans = foldWordForm(it.answer);
    return stem && ans && stem !== ans;
  });
  if (!cleaned.length) return wf;
  return {
    ...wf,
    instruction: wf.instruction || '',
    items: cleaned,
    answers: cleaned.map((it) => it.answer),
  };
}

export function prepareLessonAnswers(lesson, sourceText = '') {
  if (!lesson) return lesson;
  const cleaned = sanitizeLessonStudentText(lesson);
  const verified = correctLessonFromSource(cleaned, sourceText);
  const next = { ...verified, comprehension: { ...(verified.comprehension || {}) } };
  const mc = next.comprehension.multipleChoice;
  if (mc?.length) {
    next.comprehension.multipleChoice = spreadChoiceItems(
      mc.map((q) => resolveChoice(q)),
      'lesson-mcq',
    );
  }
  if (next.vocabMatch?.words?.length) {
    next.vocabMatch = {
      ...next.vocabMatch,
      answers: (next.vocabMatch.answers || []).map((a) => {
        const letter = String(a || '').trim().toUpperCase().replace(/[^A-H]/g, '');
        return letter || a;
      }),
    };
  }
  if (next.comprehension.trueFalse?.length) {
    next.comprehension.trueFalse = diversifyTrueFalseOrder(next.comprehension.trueFalse);
  }
  if (verified.cloze?.items?.length) {
    next.cloze = { ...verified.cloze, items: spreadChoiceItems(verified.cloze.items, 'lesson-cloze') };
  }
  const introLines = splitIntro(next.introduction);
  if (introLines.length) next.introduction = introLines;
  if (next.sourceInstruction) {
    next.sourceInstruction = stripSummaryCue(next.sourceInstruction);
  }
  if (Array.isArray(next.vocabBuilding)) {
    next.vocabBuilding = next.vocabBuilding.map((task) => {
      if (!task || task.kind !== 'match') return task;
      return { ...task, instruction: stripWriteTheLetter(task.instruction) };
    });
  }
  if (next.wordFormation) {
    next.wordFormation = normalizeWordFormation(next.wordFormation);
  }
  if (Array.isArray(next.practiceExercises)) {
    const rawBlocks = Array.isArray(lesson.practiceExercises) ? lesson.practiceExercises : [];
    next.practiceExercises = next.practiceExercises.map((block, bi) => {
      if (!block || typeof block !== 'object') return block;
      const raw = rawBlocks[bi] || {};
      const scramble = isScramblePracticeKind(block.kind, block.instruction)
        || isScramblePracticeKind(raw.kind, raw.instruction);
      const items = Array.isArray(block.items) ? block.items.map((it) => {
        if (typeof it === 'string') {
          const base = { prompt: it, answer: '', space: 'lines' };
          return scramble ? normalizeScramblePracticeItem(base) : base;
        }
        if (!it || typeof it !== 'object') {
          return scramble
            ? normalizeScramblePracticeItem({ prompt: '', answer: '', space: 'lines' })
            : { prompt: '', answer: '', space: 'lines' };
        }
        const normalized = {
          ...it,
          prompt: it.prompt || it.question || '',
          answer: it.answer == null ? '' : it.answer,
          space: it.space || 'lines',
        };
        return scramble ? normalizeScramblePracticeItem(normalized) : normalized;
      }) : [];
      let instruction = String(block.instruction || '').trim();
      if (scramble && (!instruction || /^rozsypywank/i.test(instruction))) {
        instruction = 'Ułóż wyrazy w poprawnej kolejności.';
      }
      return {
        ...block,
        kind: scramble ? 'scramble' : block.kind,
        instruction,
        items,
      };
    });
  }
  const gap = { ...(next.comprehension.gapFill || {}) };
  const gapAnswers = gap.answers || [];
  if (gapAnswers.length || gap.wordBank?.length) {
    gap.wordBank = scrambleBank(exactAnswerBank(gapAnswers), gap.answers);
    next.comprehension.gapFill = gap;
  }
  if (verified.wordBankTask?.wordBank?.length) {
    next.wordBankTask = {
      ...verified.wordBankTask,
      wordBank: scrambleBank(verified.wordBankTask.wordBank, verified.wordBankTask.answers),
    };
  }
  if (Array.isArray(next.grammarPractice)) {
    next.grammarPractice = next.grammarPractice.map((task, ti) => {
      if (!task) return task;
      const items = task.items || [];
      if (String(task.kind || '').toLowerCase() === 'choose' || items.some((it) => (it.options || []).length)) {
        return { ...task, items: spreadChoiceItems(items, `lesson-grammar-${ti}`) };
      }
      return task;
    });
  }
  return next;
}

export function prepareDeckAnswers(deck, { spreadChoices = true, sourceText = '', lesson = null } = {}) {
  if (!deck?.slides) return deck;
  const verified = correctDeckFromSource(deck, sourceText, lesson);
  return {
    ...verified,
    slides: verified.slides.map((slide) => {
      if (spreadChoices && slide.role === 'mcq' && slide.mcqs?.length) {
        return { ...slide, mcqs: spreadChoiceItems(slide.mcqs, `deck-mcq:${slide.header || ''}`) };
      }
      if (spreadChoices && slide.role === 'cloze' && slide.clozeItems?.length) {
        return { ...slide, clozeItems: spreadChoiceItems(slide.clozeItems, `deck-cloze:${slide.header || ''}`) };
      }
      if ((slide.role === 'gapfill' || slide.role === 'wordbank') && slide.wordBank?.length) {
        return { ...slide, wordBank: scrambleBank(slide.wordBank, slide.answers) };
      }
      return slide;
    }),
  };
}

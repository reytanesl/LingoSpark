import { answerWord, keyList, resolveChoice, isLetterMatchSlide } from './answers.js';

export function firstAccent(deck) {
  const a = deck?.themeNote?.accents?.[0];
  if (!a) return '#012169';
  return a.hex || a;
}

export function secondAccent(deck) {
  const a = deck?.themeNote?.accents?.[1];
  if (!a) return '#C8102E';
  return a.hex || a;
}

export function themeOf(deck) {
  const t = deck?.themeNote || {};
  return {
    background: t.background || '#F8FAFC',
    text: t.bodyText || '#012169',
    accent: firstAccent(deck),
    accent2: secondAccent(deck),
    cefr: deck?.cefr || '',
  };
}

function asList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value).split(/\n+/).map((s) => s.trim()).filter(Boolean);
}

export function normalizeSlide(slide) {
  const s = slide || {};
  const questions = (s.questions || []).map((q) => {
    if (typeof q === 'string') return { text: q, hints: [] };
    return { text: q.text || q.prompt || '', hints: asList(q.hints), sampleAnswer: q.sampleAnswer || q.answer || '' };
  });
  return {
    role: s.role || 'title',
    header: s.header || s.title || '',
    subhead: s.subhead || s.subtitle || '',
    bullets: asList(s.bullets || s.items),
    vocab: Array.isArray(s.vocab) ? s.vocab : [],
    leftText: s.leftText || (s.role === 'chunk' ? s.bodyContent : '') || '',
    questions,
    quote: s.quote || '',
    question: s.question || '',
    hints: asList(s.hints),
    dilemma: s.dilemma || '',
    optionA: s.optionA || s.optiona || '',
    optionB: s.optionB || s.optionb || '',
    task: s.task || '',
    thesis: s.thesis || '',
    pro: asList(s.pro),
    con: asList(s.con),
    clozeText: s.clozeText || '',
    clozeItems: Array.isArray(s.clozeItems) ? s.clozeItems : [],
    wordBank: asList(s.wordBank),
    sentences: asList(s.sentences),
    words: asList(s.words),
    definitions: Array.isArray(s.definitions) ? s.definitions : [],
    sourceTitle: s.sourceTitle || '',
    publisher: s.publisher || '',
    date: s.date || '',
    bodyContent: s.bodyContent || '',
    mcqs: Array.isArray(s.mcqs) ? s.mcqs : [],
    statements: Array.isArray(s.statements)
      ? s.statements
      : asList(s.trueFalse),
    revealAnswers: Boolean(s.revealAnswers),
    revealUpTo: Number.isInteger(s.revealUpTo) ? s.revealUpTo : null,
    answers: asList(s.answers),
    sampleAnswers: asList(s.sampleAnswers),
    kind: s.kind || '',
    itemOptions: Array.isArray(s.itemOptions) ? s.itemOptions : [],
    matchByLetter: s.matchByLetter !== false && (
      s.matchByLetter === true
      || (Array.isArray(s.definitions) && s.definitions.some((d) => d && typeof d === 'object' && d.letter))
    ),
    thumbnailUrl: s.thumbnailUrl || '',
    youtubeId: s.youtubeId || '',
    sourceUrl: s.sourceUrl || '',
    embedSrc: s.embedSrc || '',
    topicImage: s.topicImage && s.topicImage.dataUrl ? s.topicImage : null,
  };
}

export function normalizeDeck(deck) {
  return {
    ...deck,
    slides: (deck.slides || []).map(normalizeSlide),
  };
}

export function dropReadingChunks(deck) {
  if (!deck?.slides) return deck;
  return {
    ...deck,
    slides: deck.slides.filter((s) => (s.role || '') !== 'chunk'),
  };
}

const CLOSED_ROLES = new Set(['gapfill', 'cloze', 'wordbank', 'vocabbuild', 'mcq', 'tf', 'match', 'wordform', 'grammar', 'practice', 'guidedwriting']);

function gapCount(text) {
  const src = String(text || '');
  const numbered = [...src.matchAll(/\((\d{1,2})\)/g)].map((m) => Number(m[1]));
  if (numbered.length) return Math.max(...numbered);
  return (src.match(/_{2,}|\[\s*\]/g) || []).length;
}

/** How many closed items a task slide can reveal one-by-one. */
export function answerItemCount(slide) {
  if (!slide) return 0;
  const role = slide.role || '';
  if (role === 'guidedwriting') return String(slide.sampleAnswer || '').trim() ? 1 : 0;
  if (role === 'mcq') return (slide.mcqs || []).length;
  if (role === 'tf') return (slide.statements || slide.bullets || []).length;
  if (role === 'cloze') {
    return Math.max(
      (slide.clozeItems || []).length,
      (slide.answers || []).length,
      gapCount(slide.clozeText || slide.bodyContent),
    );
  }
  if (role === 'gapfill') {
    return Math.max(
      (slide.answers || []).length,
      gapCount(slide.clozeText || slide.bodyContent),
    );
  }
  if (role === 'match') {
    return Math.max((slide.words || []).length, (slide.answers || []).length);
  }
  if (role === 'wordbank' || role === 'vocabbuild' || role === 'wordform' || role === 'grammar') {
    return Math.max(
      (slide.sentences || []).length,
      (slide.bullets || []).length,
      (slide.answers || []).length,
    );
  }
  if (role === 'practice') {
    const answers = (slide.answers || []).filter((a) => String(answerWord(a) || '').trim());
    if (!answers.length) return 0;
    return Math.max((slide.bullets || []).length, (slide.answers || []).length);
  }
  return 0;
}

function statementParts(item) {
  if (item && typeof item === 'object') {
    return { text: item.text || item.statement || '', answer: item.answer };
  }
  return { text: String(item || ''), answer: undefined };
}

function enrichForAnswers(slide, key) {
  const s = { ...slide };
  if (s.role === 'mcq') {
    const list = keyList(key, 'multipleChoice', 'mcq');
    if (list.length) {
      s.mcqs = (s.mcqs || []).map((q, i) => resolveChoice(q, list[i] || {}, true));
    }
  }
  if (s.role === 'tf') {
    const list = keyList(key, 'trueFalse', 'tf');
    const raw = s.statements?.length ? s.statements : s.bullets;
    s.statements = (raw || []).map((item, i) => {
      const parts = statementParts(item);
      return { text: parts.text, answer: list[i]?.answer ?? parts.answer };
    });
  }
  if (s.role === 'cloze') {
    const clozeKey = keyList(key, 'cloze');
    if (clozeKey.length) {
      s.clozeItems = (s.clozeItems || []).map((item, i) => resolveChoice(item, clozeKey[i] || {}, true));
    }
  }
  if (s.role === 'gapfill') {
    const gapKey = keyList(key, 'gapFill', 'gapfill');
    const fromKey = gapKey.map((x) => answerWord(x.answer || x.word || x));
    if (fromKey.some((w) => String(w).trim())) s.answers = fromKey;
  }
  if (s.role === 'wordbank' || s.role === 'vocabbuild' || s.role === 'wordform' || s.role === 'match' || s.role === 'grammar') {
    if (s.role === 'match' && !isLetterMatchSlide(s)) {
      // collocation partners stay on the slide; overlayLessonAnswers syncs from the worksheet
    } else if (!(s.role !== 'match' && (s.answers || []).some((a) => String(answerWord(a) || '').trim()))) {
      const fromKey = s.role === 'match'
        ? keyList(key, 'match').map((x) => answerWord(x.answer || x))
        : s.role === 'wordform'
          ? keyList(key, 'wordForm', 'wordform').map((x) => answerWord(x.answer || x))
          : s.role === 'vocabbuild'
            ? keyList(key, 'vocabBuild', 'vocabbuild').map((x) => answerWord(x.answer || x))
            : s.role === 'grammar'
              ? keyList(key, 'grammar').map((x) => answerWord(x.answer || x))
              : keyList(key, 'wordBank', 'wordbank').map((x) => answerWord(x.answer || x));
      if (fromKey.length) s.answers = fromKey;
    }
  }
  return s;
}

function isStrayAnswerSlide(slide) {
  if (slide?.revealAnswers) return false;
  return /[—–-]\s*(answers|lösungen|loesungen)\s*$/i.test(slide?.header || '');
}

function isAnswerSlide(slide) {
  if (slide?.revealAnswers) return true;
  return isStrayAnswerSlide(slide);
}

/** Drop Answers follow-up slides (legacy decks / tests). */
export function dropAnswerSlides(deck) {
  if (!deck?.slides) return deck;
  return {
    ...deck,
    slides: deck.slides.filter((s) => !isAnswerSlide(s)),
  };
}

/** After each closed task, insert same-layout slides that reveal one new answer at a time. */
export function insertAnswerSlides(deck) {
  if (!deck?.slides) return deck;
  const slides = deck.slides.map(normalizeSlide).filter((s) => !isStrayAnswerSlide(s));
  if (slides.some((s) => s.revealAnswers && Number.isInteger(s.revealUpTo))) {
    return { ...deck, slides };
  }
  const base = slides.filter((s) => !s.revealAnswers);
  const key = deck.answerKey || {};
  const out = [];
  for (const slide of base) {
    const enriched = enrichForAnswers(slide, key);
    out.push(enriched);
    if (!CLOSED_ROLES.has(enriched.role)) continue;
    const n = answerItemCount(enriched);
    if (n <= 0) {
      // Practice blocks without keys (e.g. draw) skip an empty answer follow-up.
      if (enriched.role === 'practice') continue;
      out.push({ ...enriched, revealAnswers: true, revealUpTo: null });
      continue;
    }
    for (let i = 0; i < n; i += 1) {
      out.push({ ...enriched, revealAnswers: true, revealUpTo: i });
    }
  }
  return { ...deck, slides: out };
}

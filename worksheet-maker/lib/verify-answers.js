/** Recover closed-task keys from the source and reverse-test filled gaps. */

function answerWord(value) {
  if (value && typeof value === 'object') return value.answer || value.word || '';
  return value == null ? '' : String(value);
}

function stripOptionPrefix(value) {
  return String(value || '').replace(/^[A-H][).:]\s*/i, '').trim();
}

function optionIndex(answer, options = []) {
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

function tokenOverlapScore(text, sources) {
  const words = tokens(text);
  if (!words.length) return 0;
  const joined = (sources || []).join(' ');
  let hits = 0;
  for (const w of words) {
    if (w.length < 3) continue;
    if (joined.includes(w)) hits += 1;
  }
  return hits / words.length;
}

function optionSupportScore(optionText, sources) {
  const body = stripOptionPrefix(optionText);
  const folded = foldText(body);
  if (!folded) return 0;
  if ((sources || []).some((src) => src.includes(folded))) return 1;
  return tokenOverlapScore(body, sources);
}

function correctMultipleChoice(items, sources) {
  if (!sources?.length) return items;
  return (items || []).map((item) => {
    const options = item.options || [];
    if (!options.length) return item;
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < options.length; i += 1) {
      const score = optionSupportScore(options[i], sources);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const claimedIdx = optionIndex(item.answer, options);
    const claimedScore = claimedIdx >= 0 ? optionSupportScore(options[claimedIdx], sources) : 0;
    let idx = claimedIdx;
    if (bestIdx >= 0 && bestScore >= 0.45 && (claimedIdx < 0 || claimedScore + 0.12 < bestScore)) {
      idx = bestIdx;
    }
    if (idx < 0) idx = claimedIdx >= 0 ? claimedIdx : 0;
    return {
      ...item,
      answer: String.fromCharCode(65 + idx),
      word: stripOptionPrefix(options[idx]),
    };
  });
}

function definitionLetter(def) {
  if (def == null || typeof def === 'string') return '';
  return String(def.letter || '').trim().toUpperCase();
}

function definitionBody(def) {
  if (def == null) return '';
  if (typeof def === 'string') return def;
  return String(def.text || def.definition || '').trim();
}

function correctVocabMatch(match, vocabulary = [], sources = []) {
  const words = match?.words || [];
  const defs = match?.definitions || [];
  if (!words.length || !defs.length) return match;
  const answers = [...(match.answers || [])];
  const vocabByWord = new Map(
    (vocabulary || []).map((v) => [foldText(v.word), foldText(v.definition)]),
  );
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const targetDef = vocabByWord.get(foldText(word));
    let letter = String(answers[i] || '').trim().toUpperCase().replace(/[^A-H]/g, '');
    if (targetDef) {
      const hit = defs.find((d) => foldText(definitionBody(d)) === targetDef);
      if (hit) letter = definitionLetter(hit) || letter;
    }
    if (!letter) {
      const wordFold = foldText(word);
      let best = '';
      let bestScore = 0;
      for (const d of defs) {
        const body = definitionBody(d);
        const score = tokenOverlapScore(`${word} ${body}`, sources);
        if (score > bestScore) {
          bestScore = score;
          best = definitionLetter(d);
        }
        if (body && (foldText(body).includes(wordFold) || wordFold.includes(foldText(body).slice(0, 12)))) {
          best = definitionLetter(d);
          break;
        }
      }
      if (best) letter = best;
    }
    if (letter && defs.some((d) => definitionLetter(d) === letter)) {
      answers[i] = letter;
    }
  }
  return { ...match, answers };
}

export function foldText(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  return foldText(s).split(/\s+/).filter(Boolean);
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lastWords(s, n) {
  return tokens(s).slice(-n).join(' ');
}

function firstWords(s, n) {
  return tokens(s).slice(0, n).join(' ');
}

const ANY_BLANK_SPLIT = /\(\s*\d+\s*\)\s*(?:_{2,}|\[[\s_]*\]|\(\s*\))?|_{2,}|\[\s*\]/;

export function blankNumbers(text) {
  return [...new Set([...String(text || '').matchAll(/\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1])))]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
}

function findNumberedBlank(text, n) {
  const re = new RegExp(`\\(\\s*${n}\\s*\\)\\s*(_{2,}|\\[[\\s_]*\\]|\\(\\s*\\))?`);
  const src = String(text || '');
  const m = src.match(re);
  if (!m) return null;
  return { index: src.search(re), length: m[0].length };
}

function findUnnumberedBlank(text, occurrence) {
  const re = /_{2,}|\[\s*\]|\(\s*\)/g;
  const src = String(text || '');
  let i = 0;
  let m;
  while ((m = re.exec(src))) {
    if (i === occurrence) return { index: m.index, length: m[0].length };
    i += 1;
  }
  return null;
}

function contextAround(text, index, length, window = 6) {
  const src = String(text || '');
  const beforeRaw = src.slice(0, index);
  const afterRaw = src.slice(index + length);
  const beforeCut = beforeRaw.split(ANY_BLANK_SPLIT).pop() || '';
  const afterCut = afterRaw.split(ANY_BLANK_SPLIT)[0] || '';
  return {
    before: lastWords(beforeCut, window),
    after: firstWords(afterCut, window),
  };
}

function windowNeedle(before, word, after) {
  return [foldText(before), foldText(word), foldText(after)].filter(Boolean).join(' ');
}

function inAnySource(sources, needle) {
  if (!needle || needle.length < 2) return false;
  return (sources || []).some((src) => src.includes(needle));
}

function rankSources(gapped, sources) {
  const stripped = foldText(String(gapped || '')
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/_{2,}|\[\s*\]/g, ' '));
  const words = stripped.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i + 4 <= words.length; i += 4) chunks.push(words.slice(i, i + 6).join(' '));
  if (!chunks.length && stripped) chunks.push(stripped);
  return [...(sources || [])].sort((a, b) => {
    const sa = chunks.filter((c) => a.includes(c)).length;
    const sb = chunks.filter((c) => b.includes(c)).length;
    return sb - sa;
  });
}

function passageSources(gapped, sources) {
  const ranked = rankSources(gapped, sources);
  if (!ranked.length) return [];
  const stripped = foldText(String(gapped || '')
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/_{2,}|\[\s*\]/g, ' '));
  const sample = stripped.split(/\s+/).filter(Boolean).slice(0, 8).join(' ');
  const matching = sample ? ranked.filter((s) => s.includes(sample)) : [];
  return matching.length ? matching : ranked.slice(0, 1);
}

function strongNeedle(before, word, after) {
  const n = windowNeedle(before, word, after);
  if (!n) return '';
  const hasCtx = Boolean(foldText(before) || foldText(after));
  if (!hasCtx && foldText(word).length < 5) return '';
  return n;
}

function bankByLength(bank) {
  return [...(bank || [])]
    .map((w) => String(w || '').trim())
    .filter(Boolean)
    .sort((a, b) => foldText(b).split(/\s+/).length - foldText(a).split(/\s+/).length || b.length - a.length);
}

function canonicalFromBank(word, bank) {
  const f = foldText(word);
  if (!f) return String(word || '').trim();
  return (bank || []).find((w) => foldText(w) === f) || String(word || '').trim();
}

function extractBetween(sourceFold, before, after) {
  const b = foldText(before);
  const a = foldText(after);
  const hits = [];
  if (b && a) {
    const re = new RegExp(`${escapeRe(b)}\\s+(.{1,80}?)\\s+${escapeRe(a)}`, 'g');
    let m;
    while ((m = re.exec(sourceFold))) hits.push(m[1].trim());
  } else if (b) {
    const m = sourceFold.match(new RegExp(`${escapeRe(b)}\\s+(\\S+(?:\\s+\\S+){0,2})`));
    if (m) hits.push(m[1].trim());
  } else if (a) {
    const m = sourceFold.match(new RegExp(`(\\S+(?:\\s+\\S+){0,2})\\s+${escapeRe(a)}`));
    if (m) hits.push(m[1].trim());
  }
  return hits;
}

function windowAttempts(before, after) {
  return [
    [before, after],
    [lastWords(before, 4), firstWords(after, 4)],
    [lastWords(before, 3), firstWords(after, 3)],
    [lastWords(before, 2), firstWords(after, 2)],
    [lastWords(before, 1), firstWords(after, 1)],
    [lastWords(before, 4), ''],
    ['', firstWords(after, 4)],
    [lastWords(before, 2), ''],
    ['', firstWords(after, 2)],
  ];
}

function recoverAtContext(sources, before, after, bank = [], claimed = '') {
  const claimedWord = String(claimed || '').trim();
  const bankWords = bankByLength(bank);

  for (const [b, a] of windowAttempts(before, after)) {
    if (claimedWord && inAnySource(sources, strongNeedle(b, claimedWord, a))) {
      return canonicalFromBank(claimedWord, bank);
    }
  }

  for (const [b, a] of windowAttempts(before, after)) {
    for (const w of bankWords) {
      if (inAnySource(sources, strongNeedle(b, w, a))) return w;
    }
  }

  for (const src of sources) {
    for (const [b, a] of windowAttempts(before, after)) {
      const hits = extractBetween(src, b, a);
      const bankHit = hits
        .map((hit) => bankWords.find((w) => {
          const bw = foldText(w);
          return hit === bw || hit.startsWith(`${bw} `) || ` ${hit} `.includes(` ${bw} `);
        }))
        .find(Boolean);
      if (bankHit) return bankHit;
      const short = hits.find((hit) => hit.split(/\s+/).length <= 3 && hit.length <= 40);
      if (short) return canonicalFromBank(short, bank);
    }
  }

  return claimedWord;
}

export function sourceCorpus(lesson, extraText = '') {
  const chunks = [
    lesson?.sourceText,
    ...(Array.isArray(lesson?.sourceParagraphs) ? lesson.sourceParagraphs : []),
    extraText,
  ].map((s) => String(s || '').trim()).filter(Boolean);
  const seen = new Set();
  return chunks.filter((s) => {
    const key = foldText(s).slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Pull one labelled block from a combined [VIDEO] / [READING TEXT] corpus. */
export function extractSourceSection(text, focus) {
  const raw = String(text || '');
  const f = String(focus || '').toLowerCase();
  if (!f || (!raw.includes('[VIDEO') && !raw.includes('[READING'))) return raw;
  const videoMatch = raw.match(/\[VIDEO[^\]]*\]([\s\S]*?)(?=\[READING TEXT\]|$)/i);
  const readingMatch = raw.match(/\[READING TEXT\]([\s\S]*)$/i);
  if (f === 'video' || f === 'listening' || f === 'listen') {
    return (videoMatch?.[1] || '').trim() || raw;
  }
  if (f === 'reading' || f === 'text' || f === 'read') {
    return (readingMatch?.[1] || '').trim() || raw;
  }
  return raw;
}

function isVideoFocus(focus) {
  const f = String(focus || '').toLowerCase();
  return f === 'video' || f === 'listening' || f === 'listen';
}

function isReadingFocus(focus) {
  const f = String(focus || '').toLowerCase();
  return f === 'reading' || f === 'text' || f === 'read';
}

function foldedSources(lesson, extraText = '', focus = '') {
  if (!focus) {
    return sourceCorpus(lesson, extraText).map(foldText).filter(Boolean);
  }
  const section = extractSourceSection(extraText, focus);
  if (isVideoFocus(focus)) {
    // Video items must not be "fixed" against the reading paragraphs on the sheet.
    return [foldText(section)].filter(Boolean);
  }
  if (isReadingFocus(focus)) {
    return sourceCorpus(lesson, section).map(foldText).filter(Boolean);
  }
  return sourceCorpus(lesson, extraText).map(foldText).filter(Boolean);
}

export function reverseTestPassage(gapped, answers, sources) {
  const nums = blankNumbers(gapped);
  let filled = String(gapped || '');
  if (nums.length) {
    for (const n of nums) {
      const word = answerWord(answers[n - 1] || answers[n] || '');
      filled = filled.replace(
        new RegExp(`\\(\\s*${n}\\s*\\)\\s*(_{2,}|\\[[\\s_]*\\]|\\(\\s*\\))?`),
        word,
      );
    }
  } else {
    let i = 0;
    filled = filled.replace(/_{2,}|\[\s*\]|\(\s*\)/g, () => answerWord(answers[i++] || ''));
  }
  const folded = foldText(filled);
  const words = folded.split(/\s+/).filter(Boolean);
  if (words.length < 8) return inAnySource(sources, folded);
  let hits = 0;
  let chunks = 0;
  for (let i = 0; i + 6 <= words.length; i += 5) {
    chunks += 1;
    if (inAnySource(sources, words.slice(i, i + 8).join(' '))) hits += 1;
  }
  return chunks ? hits / chunks >= 0.55 : inAnySource(sources, folded);
}

function correctGappedText(gapped, answers, bank, sources) {
  const text = String(gapped || '');
  if (!text || !sources.length) return (answers || []).map(answerWord);
  const ranked = passageSources(text, sources);

  const nums = blankNumbers(text);
  const slots = nums.length
    ? nums.map((n) => ({ n, loc: findNumberedBlank(text, n) }))
    : (answers || []).map((_, i) => ({ n: i + 1, loc: findUnnumberedBlank(text, i) }));

  const recovered = [];
  for (const slot of slots) {
    const claimed = answerWord(answers?.[slot.n - 1] || answers?.[recovered.length] || '');
    if (!slot.loc) {
      recovered[slot.n - 1] = claimed;
      continue;
    }
    const ctx = contextAround(text, slot.loc.index, slot.loc.length);
    recovered[slot.n - 1] = recoverAtContext(ranked, ctx.before, ctx.after, bank, claimed);
  }

  const dense = [];
  const maxN = Math.max(0, ...(slots.map((s) => s.n)), (answers || []).length);
  for (let i = 0; i < maxN; i += 1) dense[i] = recovered[i] || answerWord(answers?.[i] || '');

  if (!reverseTestPassage(text, dense, ranked)) {
    for (const slot of slots) {
      if (!slot.loc) continue;
      const ctx = contextAround(text, slot.loc.index, slot.loc.length);
      dense[slot.n - 1] = recoverAtContext(ranked, ctx.before, ctx.after, bank, '') || dense[slot.n - 1];
    }
  }
  return dense;
}

function syncBank(bank, answers) {
  const out = [...(bank || [])].map((w) => String(w).trim()).filter(Boolean);
  for (const a of answers) {
    const word = String(a || '').trim();
    if (word && !out.some((w) => foldText(w) === foldText(word))) out.push(word);
  }
  return out;
}

function sentenceGapContext(sentence) {
  const loc = findUnnumberedBlank(sentence, 0) || findNumberedBlank(sentence, 1);
  if (loc) return contextAround(sentence, loc.index, loc.length, 5);
  return { before: lastWords(sentence, 5), after: '' };
}

function correctSentenceAnswers(sentences, answers, bank, sources) {
  return (sentences || []).map((sentence, i) => {
    const claimed = answerWord(answers?.[i] || '');
    const ctx = sentenceGapContext(sentence);
    return recoverAtContext(passageSources(sentence, sources), ctx.before, ctx.after, bank, claimed) || claimed;
  });
}

function correctClozeItems(clozeText, items, sources) {
  const ranked = passageSources(clozeText, sources);
  return (items || []).map((item, i) => {
    const n = Number(item.blank || item.num || i + 1);
    const loc = findNumberedBlank(clozeText, n);
    if (!loc) return item;
    const ctx = contextAround(clozeText, loc.index, loc.length, 6);
    const options = item.options || [];
    let best = -1;
    for (const [b, a] of windowAttempts(ctx.before, ctx.after)) {
      for (let oi = 0; oi < options.length; oi += 1) {
        const w = stripOptionPrefix(options[oi]);
        if (w && inAnySource(ranked, strongNeedle(b, w, a))) {
          best = oi;
          break;
        }
      }
      if (best >= 0) break;
    }
    if (best < 0) return item;
    return {
      ...item,
      answer: String.fromCharCode(65 + best),
      word: stripOptionPrefix(options[best]),
    };
  });
}

function correctTrueFalse(items, sources) {
  const joined = (sources || []).join(' ');
  return (items || []).map((item) => {
    if (!item || typeof item !== 'object') return item;
    const text = item.statement || item.text || '';
    const folded = foldText(text);
    if (folded.length >= 24 && joined.includes(folded)) {
      return { ...item, answer: true };
    }
    return item;
  });
}

export function correctLessonFromSource(lesson, extraText = '') {
  if (!lesson) return lesson;
  const sources = foldedSources(lesson, extraText);
  if (!sources.length) return lesson;

  const next = { ...lesson, comprehension: { ...(lesson.comprehension || {}) } };
  const gap = { ...(next.comprehension.gapFill || {}) };
  if (gap.text) {
    const gapSources = gap.sourceFocus
      ? foldedSources(lesson, extraText, gap.sourceFocus)
      : sources;
    const answers = correctGappedText(
      gap.text,
      gap.answers || [],
      gap.wordBank || [],
      gapSources.length ? gapSources : sources,
    );
    gap.answers = answers;
    gap.wordBank = syncBank(gap.wordBank || [], answers);
    next.comprehension.gapFill = gap;
  }

  if (next.comprehension.multipleChoice?.length) {
    next.comprehension.multipleChoice = next.comprehension.multipleChoice.map((item) => {
      const itemSources = item?.sourceFocus
        ? foldedSources(lesson, extraText, item.sourceFocus)
        : sources;
      return correctMultipleChoice([item], itemSources.length ? itemSources : sources)[0];
    });
  }

  if (next.comprehension.trueFalse?.length) {
    next.comprehension.trueFalse = next.comprehension.trueFalse.map((item) => {
      const itemSources = item?.sourceFocus
        ? foldedSources(lesson, extraText, item.sourceFocus)
        : sources;
      return correctTrueFalse([item], itemSources.length ? itemSources : sources)[0];
    });
  }

  if (next.vocabMatch?.words?.length) {
    next.vocabMatch = correctVocabMatch(next.vocabMatch, lesson.vocabulary || [], sources);
  }

  if (lesson.cloze?.text && lesson.cloze?.items?.length) {
    next.cloze = {
      ...lesson.cloze,
      items: correctClozeItems(lesson.cloze.text, lesson.cloze.items, sources),
    };
  }

  if (lesson.wordBankTask?.sentences?.length) {
    const answers = correctSentenceAnswers(
      lesson.wordBankTask.sentences,
      lesson.wordBankTask.answers || [],
      lesson.wordBankTask.wordBank || [],
      sources,
    );
    next.wordBankTask = {
      ...lesson.wordBankTask,
      answers,
      wordBank: syncBank(lesson.wordBankTask.wordBank || [], answers),
    };
  }

  return next;
}

export function correctDeckFromSource(deck, extraText = '', lesson = null) {
  if (!deck?.slides) return deck;
  const sources = foldedSources(lesson, extraText);
  if (!sources.length) return deck;

  return {
    ...deck,
    slides: deck.slides.map((slide) => {
      if (slide.role === 'gapfill' && (slide.clozeText || slide.bodyContent)) {
        const text = slide.clozeText || slide.bodyContent || '';
        const answers = correctGappedText(text, slide.answers || [], slide.wordBank || [], sources);
        return {
          ...slide,
          answers,
          wordBank: (answers || []).map((w) => String(w || '').trim()).filter(Boolean),
        };
      }
      if (slide.role === 'wordbank' && slide.sentences?.length) {
        const answers = correctSentenceAnswers(slide.sentences, slide.answers || [], slide.wordBank || [], sources);
        return {
          ...slide,
          answers,
          wordBank: slide.wordBank?.length ? syncBank(slide.wordBank, answers) : slide.wordBank,
        };
      }
      if (slide.role === 'cloze' && (slide.clozeText || slide.bodyContent) && slide.clozeItems?.length) {
        return {
          ...slide,
          clozeItems: correctClozeItems(slide.clozeText || slide.bodyContent, slide.clozeItems, sources),
        };
      }
      if (slide.role === 'tf') {
        const raw = slide.statements?.length ? slide.statements : slide.bullets;
        return { ...slide, statements: correctTrueFalse(raw, sources) };
      }
      return slide;
    }),
  };
}

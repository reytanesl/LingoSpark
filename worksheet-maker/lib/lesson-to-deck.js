import { worksheetTaskOrder, expandGroupedTaskIds, parseTaskId } from './lesson-prompt.js';
import { t, taskLabel, normalizeLanguage } from './ui-strings.js';
import { resolveChoice, answerWord, answerKeyFromLesson, collocateColumns } from './answers.js';
import { splitIntro, stripSummaryCue, stripWriteTheLetter } from './lesson-display.js';
import { resolvePolishSheetTheme } from './polish-sheet-theme.js';
import { extractYoutubeId, resolveMediaUrl, parseVideoEmbed } from './video-embed.js';
import { themeNoteFromScheme } from './slide-themes.js';

function practiceKindStringKey(kind) {
  const map = {
    calculate: 'practiceKindCalculate',
    measure: 'practiceKindMeasure',
    draw: 'practiceKindDraw',
    construct: 'practiceKindConstruct',
    wordproblem: 'practiceKindWordProblem',
    table: 'practiceKindTable',
    scramble: 'practiceKindScramble',
    rozsypywanka: 'practiceKindScramble',
  };
  return map[String(kind || '').toLowerCase()] || '';
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function sourceFocusLabel(focus, lang, lesson, source) {
  const combined = lesson?.skill === 'combined' || Boolean(source?.combinedSources);
  if (!combined) return '';
  const f = String(focus || '').toLowerCase();
  if (f === 'video' || f === 'listening' || f === 'listen') {
    return `${t(lang, 'fromVideo')} `;
  }
  if (f === 'reading' || f === 'text' || f === 'read') {
    return `${t(lang, 'fromReading')} `;
  }
  return '';
}

function paragraphsOf(lesson) {
  const list = (lesson?.sourceParagraphs || []).map((p) => String(p).trim()).filter(Boolean);
  if (list.length) return list;
  return String(lesson?.sourceText || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function chunkParagraphs(paragraphs, target = 110) {
  const chunks = [];
  let current = [];
  let words = 0;
  for (const p of paragraphs) {
    const w = wordCount(p);
    if (current.length && words + w > target * 1.35) {
      chunks.push(current.join('\n\n'));
      current = [p];
      words = w;
    } else {
      current.push(p);
      words += w;
    }
  }
  if (current.length) chunks.push(current.join('\n\n'));
  return chunks;
}

function publisherOf(source) {
  try {
    if (!source?.url) return '';
    return new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function youtubeIdOf(source, lesson) {
  return extractYoutubeId(source?.youtubeId)
    || extractYoutubeId(lesson?.youtubeId)
    || extractYoutubeId(source?.url)
    || extractYoutubeId(lesson?.sourceUrl)
    || extractYoutubeId(source?.embedSrc || lesson?.videoEmbedSrc)
    || extractYoutubeId(lesson?.videoEmbedHtml || source?.embedHtml)
    || '';
}

function header(instruction, fallback) {
  const s = String(instruction || '').trim();
  return s || fallback;
}

/**
 * Build the presentation from the worksheet JSON so tasks and keys match.
 * Slide order follows the worksheet (including teacher up/down moves).
 */
export function lessonToDeck(lesson, source = {}, {
  includeSourceOnSlides = true,
  language,
  tasks,
  preserveOrder = false,
  videoEmbed = '',
  colourScheme = '',
} = {}) {
  const lang = normalizeLanguage(language || lesson?.language);
  const order = expandGroupedTaskIds(
    worksheetTaskOrder(tasks || lesson?.includedTasks, {
      includeSource: includeSourceOnSlides,
      preserveOrder,
    }),
    lesson,
  );
  const label = (id) => taskLabel(lang, id);
  const slides = [];
  const parsedEmbed = parseVideoEmbed(
    videoEmbed
    || lesson?.videoEmbedHtml
    || lesson?.videoEmbedSrc
    || source?.embedHtml
    || source?.embedSrc
    || ''
  );
  const videoId = youtubeIdOf(source, lesson) || parsedEmbed?.youtubeId || '';
  const watchUrl = resolveMediaUrl(
    { ...source, url: source?.url || parsedEmbed?.sourceUrl || '' },
    { ...lesson, sourceUrl: lesson?.sourceUrl || parsedEmbed?.sourceUrl || '' },
  );
  const embedSrc = String(
    parsedEmbed?.embedSrc
    || lesson?.videoEmbedSrc
    || source?.embedSrc
    || ''
  ).trim();
  const wantsVideo = Boolean(
    videoId
    || embedSrc
    || watchUrl
    || /youtube\.com|youtu\.be/i.test(watchUrl)
    || lesson?.skill === 'listening'
    || lesson?.skill === 'combined'
    || source?.combinedSources
  );
  let videoSlideAdded = false;
  const videoSlide = () => ({
    role: 'video',
    header: t(lang, 'videoWatch'),
    youtubeId: videoId,
    sourceUrl: watchUrl,
    thumbnailUrl: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '',
    embedSrc: embedSrc || (videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1` : ''),
  });
  const pushVideoBeforeComprehension = () => {
    if (!wantsVideo || videoSlideAdded) return;
    if (!videoId && !watchUrl && !embedSrc) return;
    slides.push(videoSlide());
    videoSlideAdded = true;
  };

  slides.push({
    role: 'title',
    header: lesson.title || source.title || t(lang, 'fallbackTitle'),
    subhead: (lesson.themes || []).filter(Boolean).slice(0, 2).join(' · '),
    topicImage: lesson.topicImage?.dataUrl ? lesson.topicImage : null,
  });

  const add = {
    intro() {
      const lines = splitIntro(lesson.introduction);
      if (!lines.length) return;
      slides.push({
        role: 'intro',
        header: label('intro'),
        bullets: lines,
      });
    },
    vocab() {
      if (!(lesson.vocabulary || []).length) return;
      slides.push({ role: 'vocab', header: t(lang, 'vocabNeed'), vocab: lesson.vocabulary });
    },
    preReading() {
      const pre = lesson.preReading || lesson.warmUp || {};
      const bullets = (pre.items || [])
        .map((item) => (typeof item === 'string' ? item : item.prompt || item.question || ''))
        .filter(Boolean);
      if (pre.prompt && !bullets.length) bullets.push(pre.prompt);
      if (pre.instruction || bullets.length) {
        slides.push({
          role: 'preread',
          header: header(pre.instruction, t(lang, 'preReadFallback')),
          bullets,
        });
      }
    },
    source() {
      if (!includeSourceOnSlides) return;
      for (const leftText of chunkParagraphs(paragraphsOf(lesson))) {
        slides.push({
          role: 'chunk',
          header: stripSummaryCue(lesson.sourceInstruction) || t(lang, 'sourceReadFallback'),
          leftText,
          questions: [],
        });
      }
    },
    gapFill() {
      const gap = lesson.comprehension?.gapFill || {};
      if (!(gap.text || (gap.answers || []).length)) return;
      pushVideoBeforeComprehension();
      const focusPrefix = sourceFocusLabel(gap.sourceFocus, lang, lesson, source);
      slides.push({
        role: 'gapfill',
        header: header(`${focusPrefix}${gap.instruction || ''}`.trim(), t(lang, 'gapFallback')),
        clozeText: gap.text || '',
        wordBank: gap.wordBank || [],
        answers: (gap.answers || []).map((a) => answerWord(a)),
        sourceFocus: gap.sourceFocus || '',
      });
    },
    mcq() {
      if (!(lesson.comprehension?.multipleChoice || []).length) return;
      const items = lesson.comprehension.multipleChoice;
      pushVideoBeforeComprehension();
      slides.push({
        role: 'mcq',
        header: t(lang, 'mcqPrompt'),
        mcqs: items.map((q) => {
          const r = resolveChoice(q);
          const focusPrefix = sourceFocusLabel(q.sourceFocus, lang, lesson, source);
          return {
            question: `${focusPrefix}${q.question || ''}`.trim(),
            options: r.options || q.options || [],
            answer: r.answer,
            word: r.word,
            sourceFocus: q.sourceFocus || '',
          };
        }),
      });
    },
    tf() {
      if (!(lesson.comprehension?.trueFalse || []).length) return;
      pushVideoBeforeComprehension();
      slides.push({
        role: 'tf',
        header: t(lang, 'tfPrompt'),
        statements: lesson.comprehension.trueFalse.map((item) => {
          const focusPrefix = sourceFocusLabel(item.sourceFocus, lang, lesson, source);
          return {
            text: `${focusPrefix}${item.statement || item.text || ''}`.trim(),
            answer: item.answer,
            sourceFocus: item.sourceFocus || '',
          };
        }),
      });
    },
    open() {
      const items = lesson.comprehension?.openEnded || [];
      if (!items.length) return;
      pushVideoBeforeComprehension();
      slides.push({
        role: 'open',
        header: t(lang, 'openPrompt'),
        bullets: items.map((it) => {
          const focusPrefix = sourceFocusLabel(it.sourceFocus, lang, lesson, source);
          return `${focusPrefix}${it.question || ''}`.trim();
        }),
        sampleAnswers: items.map((it) => it.sampleAnswer || ''),
      });
    },
    vocabBuild(onlyIndex = null) {
      const list = lesson.vocabBuilding || [];
      const indices = onlyIndex == null ? list.map((_, i) => i) : [onlyIndex];
      for (const ti of indices) {
        const task = list[ti];
        if (!task) continue;
        const items = task.items || [];
        if (!items.length && !(task.instruction || '').trim()) continue;
        if (task.kind === 'match') {
          const cols = collocateColumns(items);
          slides.push({
            role: 'match',
            header: header(stripWriteTheLetter(task.instruction), t(lang, 'collocateFallback')),
            words: cols.words,
            definitions: cols.definitions,
            answers: cols.answers,
            matchByLetter: false,
          });
          continue;
        }
        slides.push({
          role: 'vocabbuild',
          header: header(task.instruction, label('vocabBuild')),
          wordBank: task.kind === 'box' ? (task.wordBank || []) : [],
          sentences: items.map((it) => it.prompt || it.sentence || ''),
          answers: items.map((it) => answerWord(it.answer)),
        });
      }
    },
    vocabMatch() {
      const match = lesson.vocabMatch || {};
      if (!((match.words || []).length || (match.definitions || []).length)) return;
      slides.push({
        role: 'match',
        header: header(match.instruction, t(lang, 'matchFallback')),
        words: match.words || [],
        definitions: match.definitions || [],
        answers: (match.answers || []).map((a) => answerWord(a)),
        matchByLetter: true,
      });
    },
    wordFormation() {
      const wf = lesson.wordFormation || {};
      const wfItems = (wf.items || []).length
        ? wf.items
        : (wf.sentences || []).map((sentence, i) => ({ sentence, answer: (wf.answers || [])[i] }));
      if (!wfItems.length) return;
      slides.push({
        role: 'wordform',
        header: header(wf.instruction, t(lang, 'wordFormFallback')),
        sentences: wfItems.map((it) => {
          const sentence = it.sentence || '';
          const prompt = it.prompt && sentence && !sentence.includes(it.prompt) ? ` (${it.prompt})` : '';
          return `${sentence}${prompt}`;
        }),
        answers: wfItems.map((it) => answerWord(it.answer)),
      });
    },
    whatIf() {
      const hyp = lesson.whatIf || {};
      const hypItems = hyp.items || hyp.prompts || [];
      if (!hypItems.length) return;
      slides.push({
        role: 'whatif',
        header: header(hyp.instruction, t(lang, 'whatIfFallback')),
        bullets: hypItems.map((it) => (typeof it === 'string' ? it : it.prompt || it.question || '')),
        sampleAnswers: hypItems.map((it) => (typeof it === 'string' ? '' : it.sampleAnswer || '')),
      });
    },
    cloze() {
      const cloze = lesson.cloze || {};
      if (!(cloze.text || (cloze.items || []).length)) return;
      slides.push({
        role: 'cloze',
        header: header(cloze.instruction, t(lang, 'clozeFallback')),
        clozeText: cloze.text || '',
        clozeItems: (cloze.items || []).map((item, i) => {
          const r = resolveChoice(item);
          return {
            blank: item.blank || item.num || i + 1,
            options: r.options || item.options || [],
            answer: r.answer,
            word: r.word,
          };
        }),
      });
    },
    wordBank() {
      const wb = lesson.wordBankTask || {};
      if (!((wb.sentences || []).length || (wb.wordBank || []).length)) return;
      slides.push({
        role: 'wordbank',
        header: header(wb.instruction, t(lang, 'wordBankFallback')),
        wordBank: wb.wordBank || [],
        sentences: wb.sentences || [],
        answers: (wb.answers || []).map((a) => answerWord(a)),
      });
    },
    grammar(onlyIndex = null) {
      const activities = lesson.grammarPractice || [];
      if (!activities.length) return;
      const indices = onlyIndex == null ? activities.map((_, i) => i) : [onlyIndex];
      for (const gi of indices) {
        const task = activities[gi];
        if (!task) continue;
        const items = task.items || [];
        if (!items.length) continue;
        const kind = String(task.kind || 'gap').toLowerCase();
        slides.push({
          role: 'grammar',
          header: header(task.instruction, t(lang, 'grammarFallback')),
          kind,
          sentences: items.map((it) => it.prompt || it.sentence || ''),
          itemOptions: items.map((it) => it.options || []),
          answers: items.map((it) => {
            if ((it.options || []).length) {
              const r = resolveChoice(it);
              return r.word || answerWord(it.answer);
            }
            return answerWord(it.answer);
          }),
        });
      }
    },
    reflection() {
      const ref = lesson.reflection || {};
      if (!(ref.quote || ref.question)) return;
      slides.push({
        role: 'reflection',
        header: label('reflection'),
        quote: ref.quote || '',
        question: ref.question || '',
        hints: [],
      });
    },
    guidedWriting() {
      const gw = lesson.guidedWriting || {};
      const bullets = gw.bullets || gw.checklist || [];
      if (!(gw.instruction || bullets.length)) return;
      slides.push({
        role: 'guidedwriting',
        header: header(gw.instruction, label('guidedWriting')),
        bullets: bullets.map((b) => (typeof b === 'string' ? b : (b.prompt || b.text || ''))),
        sampleAnswer: gw.sampleAnswer || '',
      });
    },
    scenario() {
      const scen = lesson.scenario || {};
      if (!(scen.dilemma || scen.optionA)) return;
      slides.push({
        role: 'scenario',
        header: label('scenario'),
        dilemma: scen.dilemma || '',
        optionA: scen.optionA || '',
        optionB: scen.optionB || '',
        task: scen.task || t(lang, 'scenarioTask'),
        hints: [],
      });
    },
    debate() {
      const deb = lesson.debate || {};
      if (!(deb.thesis || (deb.pro || []).length)) return;
      slides.push({
        role: 'debate',
        header: label('debate'),
        thesis: deb.thesis || '',
        pro: deb.pro || [],
        con: deb.con || [],
      });
    },
    discussion() {
      if (!(lesson.discussion || []).length) return;
      slides.push({
        role: 'discussion',
        header: t(lang, 'discussionPrompt'),
        bullets: lesson.discussion.map((q) => (typeof q === 'string' ? q : q.prompt || q.question || '')),
      });
    },
    practice(onlyIndex = null) {
      const blocks = Array.isArray(lesson.practiceExercises) ? lesson.practiceExercises : [];
      if (!blocks.length) return;
      const indices = onlyIndex == null ? blocks.map((_, i) => i) : [onlyIndex];
      for (const bi of indices) {
        const block = blocks[bi];
        if (!block) continue;
        const items = block.items || [];
        if (!items.length && !(block.instruction || '').trim()) continue;
        const kindKey = practiceKindStringKey(block.kind);
        const kindLabel = kindKey ? t(lang, kindKey) : '';
        const instruction = String(block.instruction || '').trim();
        const head = [kindLabel, instruction].filter(Boolean).join(' · ') || t(lang, 'practiceFallback');
        slides.push({
          role: 'practice',
          header: head,
          kind: String(block.kind || '').toLowerCase(),
          bullets: items.map((it) => (typeof it === 'string' ? it : it.prompt || it.question || '')),
          answers: items.map((it) => (typeof it === 'string' ? '' : answerWord(it.answer))),
          spaces: items.map((it) => (typeof it === 'string' ? '' : String(it.space || '').toLowerCase())),
        });
      }
    },
  };

  for (const id of order) {
    const { base, index } = parseTaskId(id);
    if (index != null && (base === 'vocabBuild' || base === 'grammar' || base === 'practice')) {
      add[base]?.(index);
    } else {
      add[base]?.();
    }
  }

  if (wantsVideo && !videoSlideAdded && (videoId || watchUrl || embedSrc)) {
    let insertAt = 1;
    for (let i = 1; i < slides.length; i += 1) {
      if (['intro', 'vocab', 'preread', 'chunk'].includes(slides[i].role)) insertAt = i + 1;
      else break;
    }
    slides.splice(insertAt, 0, videoSlide());
    videoSlideAdded = true;
  }

  slides.push({
    role: 'source',
    header: t(lang, 'sourceLabel').replace(/:$/, ''),
    sourceTitle: lesson.sourceTitle || source.title || lesson.title || '',
    publisher: publisherOf(source),
    date: t(lang, 'dateUnknown'),
  });

  const polish = lesson?.mode === 'polishPrimary';
  const schemeId = colourScheme || lesson?.slideColourScheme || source?.slideColourScheme || '';
  let themeNote = themeNoteFromScheme(schemeId || 'navy');
  if (polish && !schemeId) {
    const th = resolvePolishSheetTheme({
      grade: lesson.polishClass,
      subjectId: lesson.polishSubject,
    });
    themeNote = {
      schemeId: 'polish',
      background: '#FFFFFF',
      bodyText: '#1a1a1a',
      accents: [
        { name: 'Accent', hex: th.accent || '#012169' },
        { name: 'Accent2', hex: th.accent2 || '#C8102E' },
      ],
    };
  } else if (schemeId) {
    themeNote = themeNoteFromScheme(schemeId);
  }

  return {
    cefr: polish && lesson.polishClass
      ? `Klasa ${lesson.polishClass}`
      : (lesson.cefr || ''),
    language: lang,
    topicImage: lesson.topicImage?.dataUrl ? lesson.topicImage : null,
    themeNote,
    answerKey: answerKeyFromLesson(lesson),
    slides,
  };
}

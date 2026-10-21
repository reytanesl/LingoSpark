import { taskLabel, normalizeLanguage } from './ui-strings.js';
import { languageDirective } from './language-prompt.js';

const READING_TIME = {
  A1: { minutes: 3, wpm: 70 },
  A2: { minutes: 3.5, wpm: 90 },
  B1: { minutes: 4.5, wpm: 120 },
  B2: { minutes: 5, wpm: 150 },
  C1: { minutes: 6, wpm: 170 },
  C2: { minutes: 6, wpm: 190 },
};

export const LESSON_TASKS = [
  { id: 'intro', label: 'Introduction' },
  { id: 'vocab', label: 'Pre-teach vocabulary' },
  { id: 'preReading', label: 'Pre-reading / pre-watching' },
  { id: 'gapFill', label: 'Gap-fill' },
  { id: 'mcq', label: 'Multiple choice' },
  { id: 'tf', label: 'True / false' },
  { id: 'open', label: 'Open-ended questions' },
  { id: 'vocabBuild', label: 'Vocabulary building' },
  { id: 'vocabMatch', label: 'Vocab and definition match' },
  { id: 'wordFormation', label: 'Word formation' },
  { id: 'whatIf', label: 'Hypothesizing (What if…?)' },
  { id: 'discussion', label: 'Discussion / critical thinking' },
  { id: 'cloze', label: 'Use of English (cloze)' },
  { id: 'wordBank', label: 'Use of English (word bank)' },
  { id: 'grammar', label: 'Grammar practice' },
  { id: 'scenario', label: 'Scenario' },
  { id: 'debate', label: 'Debate' },
  { id: 'reflection', label: 'Reflection' },
  { id: 'guidedWriting', label: 'Guided writing' },
];

export const WORKSHEET_TASKS = LESSON_TASKS;

const TASK_IDS = LESSON_TASKS.map((t) => t.id);

export const SOURCE_TASK = 'source';

/** Synthetic Polish SP practical-task block (not in LESSON_TASKS). */
export const PRACTICE_TASK = 'practice';

/** Task types that may expand into individually movable activities. */
export const GROUPED_TASK_BASES = new Set(['vocabBuild', 'grammar', PRACTICE_TASK]);

/** Default student-sheet order (source sits after pre-reading). */
export const WORKSHEET_SEQUENCE = [
  'intro', 'vocab', 'preReading', SOURCE_TASK,
  'gapFill', 'mcq', 'tf', 'open', 'vocabBuild', 'vocabMatch',
  'wordFormation', 'whatIf', 'cloze', 'wordBank', 'grammar',
  'reflection', 'guidedWriting', 'scenario', 'debate', 'discussion',
];

/** Parse `vocabBuild:1` → `{ base, index }`; plain ids keep `index: null`. */
export function parseTaskId(id) {
  const s = String(id || '');
  const m = s.match(/^(vocabBuild|grammar|practice):(\d+)$/);
  if (m) return { base: m[1], index: Number(m[2]) };
  return { base: s, index: null };
}

export function groupArrayKey(base) {
  if (base === 'vocabBuild') return 'vocabBuilding';
  if (base === 'grammar') return 'grammarPractice';
  if (base === PRACTICE_TASK) return 'practiceExercises';
  return null;
}

/**
 * Expand grouped task ids (vocabBuild / grammar / practice) into per-activity
 * ids so each activity can be moved or removed on its own.
 */
export function expandGroupedTaskIds(tasks, lesson, removed = []) {
  const removedSet = removed instanceof Set ? removed : new Set(removed || []);
  const out = [];
  const seen = new Set();
  const push = (id) => {
    if (!id || seen.has(id) || removedSet.has(id)) return;
    const { base } = parseTaskId(id);
    if (removedSet.has(base) && !String(id).includes(':')) return;
    seen.add(id);
    out.push(id);
  };
  for (const raw of Array.isArray(tasks) ? tasks : []) {
    if (removedSet.has(raw)) continue;
    const { base, index } = parseTaskId(raw);
    if (GROUPED_TASK_BASES.has(base) && index == null) {
      if (removedSet.has(base)) continue;
      const key = groupArrayKey(base);
      const n = Array.isArray(lesson?.[key]) ? lesson[key].length : 0;
      for (let i = 0; i < n; i += 1) push(`${base}:${i}`);
      continue;
    }
    push(raw);
  }
  return out;
}

/** After splicing one grouped activity, renumber remaining `base:n` ids. */
export function reindexAfterRemove(tasks, base, removedIndex) {
  const out = [];
  for (const id of Array.isArray(tasks) ? tasks : []) {
    const p = parseTaskId(id);
    if (p.base !== base || p.index == null) {
      if (id !== base) out.push(id);
      continue;
    }
    if (p.index === removedIndex) continue;
    out.push(p.index > removedIndex ? `${base}:${p.index - 1}` : id);
  }
  return out;
}

export function normalizeTasks(tasks) {
  const list = [];
  const seen = new Set();
  for (const raw of Array.isArray(tasks) ? tasks : []) {
    const { base } = parseTaskId(raw);
    if (!TASK_IDS.includes(base)) continue;
    if (seen.has(base)) continue;
    seen.add(base);
    list.push(base);
  }
  return list.length ? list : [...TASK_IDS];
}

/**
 * Set includedTasks from fields that were actually filled (used when teacher extras
 * override the default checkbox palette).
 */
export function syncLessonIncludedTasks(lesson) {
  if (!lesson || typeof lesson !== 'object') return lesson;
  const ids = [];
  const hasIntro = Array.isArray(lesson.introduction)
    ? lesson.introduction.some((x) => String(x || '').trim())
    : Boolean(String(lesson.introduction || '').trim());
  if (hasIntro) ids.push('intro');
  if ((lesson.vocabulary || []).length) ids.push('vocab');
  if (lesson.preReading?.instruction || (lesson.preReading?.items || []).length) ids.push('preReading');
  const gap = lesson.comprehension?.gapFill;
  if (gap?.text || (gap?.wordBank || []).length) ids.push('gapFill');
  if ((lesson.comprehension?.multipleChoice || []).length) ids.push('mcq');
  if ((lesson.comprehension?.trueFalse || []).length) ids.push('tf');
  if ((lesson.comprehension?.openEnded || []).length) ids.push('open');
  if ((lesson.vocabBuilding || []).length) ids.push('vocabBuild');
  if ((lesson.vocabMatch?.words || []).length || (lesson.vocabMatch?.definitions || []).length) ids.push('vocabMatch');
  if ((lesson.wordFormation?.items || lesson.wordFormation?.sentences || []).length) ids.push('wordFormation');
  if ((lesson.whatIf?.items || lesson.whatIf?.prompts || lesson.hypothesizing?.items || []).length) ids.push('whatIf');
  if ((lesson.discussion || []).length) ids.push('discussion');
  if (lesson.cloze?.text || (lesson.cloze?.items || []).length) ids.push('cloze');
  if ((lesson.wordBankTask?.sentences || []).length || (lesson.wordBankTask?.wordBank || []).length) ids.push('wordBank');
  if ((lesson.grammarPractice || []).length) ids.push('grammar');
  if (lesson.scenario?.dilemma || lesson.scenario?.optionA) ids.push('scenario');
  if (lesson.debate?.thesis || (lesson.debate?.pro || []).length) ids.push('debate');
  if (lesson.reflection?.quote || lesson.reflection?.question) ids.push('reflection');
  if (lesson.guidedWriting?.instruction || (lesson.guidedWriting?.bullets || lesson.guidedWriting?.checklist || []).length) {
    ids.push('guidedWriting');
  }
  lesson.includedTasks = ids;
  return lesson;
}

/**
 * Extra-instructions block for ESL/DaF — when present, overrides checkbox defaults.
 */
export function extraInstructionsDirective(extraInstructions = '') {
  const extra = String(extraInstructions || '').trim();
  if (!extra) {
    return `TEACHER INSTRUCTIONS: (none)
Use the ticked task list and default item counts.`;
  }
  return `TEACHER EXTRA INSTRUCTIONS — HIGHEST PRIORITY (override the ticked task list and default counts):
"""
${extra}
"""

You MUST follow these instructions for:
- which task types appear (and which to skip),
- how many items in each type,
- length / lesson time,
- focus (e.g. only grammar, no discussion, shorter sheet, more vocab).

Rules when extras are present:
- If the teacher names task types or counts, match them as closely as the JSON schema allows.
- Omit task types they asked to skip (empty arrays / empty strings; do NOT invent filler tasks).
- If they ask for a short sheet, cut fluff and keep the requested exercises.
- Put the final list of generated task ids in includedTasks (only what you actually filled).
- Defaults and the ticked list apply ONLY where the extras are silent.`;
}

/**
 * Order of numbered blocks on the worksheet (and matching slides).
 * `preserveOrder` keeps a teacher’s up/down arrangement.
 */
export function worksheetTaskOrder(tasks, { includeSource = true, preserveOrder = false } = {}) {
  const raw = Array.isArray(tasks) ? tasks : [];
  const isPracticeId = (id) => parseTaskId(id).base === PRACTICE_TASK;
  const hasPractice = raw.some(isPracticeId);
  const picked = new Set(normalizeTasks(
    raw.filter((id) => id !== SOURCE_TASK && !isPracticeId(id)).map((id) => parseTaskId(id).base)
  ));
  const hasPickedOrSpecial = raw.some((id) => {
    const { base } = parseTaskId(id);
    return picked.has(base) || id === SOURCE_TASK || isPracticeId(id);
  });
  if (preserveOrder && hasPickedOrSpecial) {
    const order = [];
    const seen = new Set();
    for (const id of raw) {
      const { base, index } = parseTaskId(id);
      if (id === SOURCE_TASK) {
        if (includeSource && !seen.has(SOURCE_TASK)) {
          order.push(SOURCE_TASK);
          seen.add(SOURCE_TASK);
        }
        continue;
      }
      if (isPracticeId(id)) {
        const key = index != null ? id : PRACTICE_TASK;
        if (!seen.has(key)) {
          order.push(key);
          seen.add(key);
        }
        continue;
      }
      if (!picked.has(base)) continue;
      const key = index != null ? id : base;
      if (!seen.has(key)) {
        order.push(key);
        seen.add(key);
      }
    }
    if (includeSource && !order.includes(SOURCE_TASK)) {
      const at = order.findIndex((id) => parseTaskId(id).base === 'preReading');
      order.splice(at >= 0 ? at + 1 : Math.min(2, order.length), 0, SOURCE_TASK);
    }
    return includeSource ? order : order.filter((id) => id !== SOURCE_TASK);
  }
  const order = WORKSHEET_SEQUENCE.filter((id) => (id === SOURCE_TASK ? includeSource : picked.has(id)));
  if (hasPractice && !order.some(isPracticeId)) {
    const afterOpen = order.indexOf('open');
    const afterMcq = order.indexOf('mcq');
    const beforeRefl = order.indexOf('reflection');
    let insertAt = order.length;
    if (afterOpen >= 0) insertAt = afterOpen + 1;
    else if (afterMcq >= 0) insertAt = afterMcq + 1;
    else if (beforeRefl >= 0) insertAt = beforeRefl;
    order.splice(insertAt, 0, PRACTICE_TASK);
  }
  return order;
}

export function targetWordCount(cefr) {
  const band = READING_TIME[cefr] || READING_TIME.B1;
  return Math.round(band.minutes * band.wpm);
}

/** Split a teacher vocab list (lines / commas / semicolons) into clean items. */
export function normalizeVocabList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 40);
  }
  return String(raw || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

export function wordCountForMinutes(cefr, minutes) {
  const band = READING_TIME[cefr] || READING_TIME.B1;
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) return targetWordCount(cefr);
  return Math.round(mins * band.wpm);
}

/** Resolve teacher adapt length: reading minutes or word range. */
export function resolveAdaptTarget(adapt, adaptTarget, cefr) {
  if (!adapt) return null;
  const raw = adaptTarget && typeof adaptTarget === 'object' ? adaptTarget : {};
  const mode = raw.mode === 'words' ? 'words' : 'minutes';
  if (mode === 'words') {
    let min = Math.round(Number(raw.minWords || raw.min || 0));
    let max = Math.round(Number(raw.maxWords || raw.max || 0));
    if (!Number.isFinite(min) || min < 40) min = Math.round(targetWordCount(cefr) * 0.75);
    if (!Number.isFinite(max) || max < min) max = Math.max(min + 40, Math.round(targetWordCount(cefr) * 1.15));
    return { mode: 'words', minWords: min, maxWords: max, targetWords: Math.round((min + max) / 2) };
  }
  let minutes = Number(raw.minutes);
  if (!Number.isFinite(minutes) || minutes < 2) {
    minutes = (READING_TIME[cefr] || READING_TIME.B1).minutes;
  }
  minutes = Math.min(8, Math.max(2, Math.round(minutes * 2) / 2));
  const targetWords = wordCountForMinutes(cefr, minutes);
  return { mode: 'minutes', minutes, targetWords };
}

function difficultyNote(cefr) {
  const band = cefr && cefr !== 'auto' ? cefr : 'the CEFR level you declare';
  return `Question difficulty MUST match ${band}:
- A1: short, literal, gist and clearly stated detail. Simple wording. Options stay short.
- A2 / A2+: mostly literal plus one gentle inference (who/why in the text).
- B1: mix of detail, gist, and inference. Paraphrase the text; do not copy a full sentence as the correct option.
- B2: implied meaning, attitude, purpose, or cause. Students must read carefully.
- C1–C2: nuance, hedging, tone, assumption, or synthesis across paragraphs. Still fair and answerable from the text.

Multiple choice — challenging distractors:
- All four options must be plausible at this CEFR and similar in length and grammar.
- Distractors should reuse ideas, names, numbers, or paraphrases from the text but twist one precise detail (wrong person, time, degree, cause, or scope).
- Never use absurd, joke, or obviously impossible options. Never use “all of the above” / “none of the above”.
- The correct option must be clearly best, but only after checking the text.

True / false — incorrect sentences must not be obvious:
- False items change one careful detail (quantity, agent, reason, time, modality: may vs will, some vs all).
- Do not use cartoonish contradictions, silly facts, or giveaway words like always/never unless the text itself uses them.
- True items should not be word-for-word copies of a whole source sentence; paraphrase slightly.
- Students should need the text to decide. Include a short correction in the answer key for every false item.
- ANSWER PATTERN: mix true and false with no predictable sequence. Roughly half true / half false (±1). Do NOT use all true, all false, strict alternation (T/F/T/F…), or blocks (TTTTFFFF / FFFFTTTT). Order items so the key looks random.`;
}

export function buildLessonPrompt({
  source,
  cefr,
  adapt,
  adaptTarget,
  extraInstructions,
  tasks,
  includeSourceOnWorksheet = true,
  language = 'en',
  grammarPoint = '',
  transcriptionMode = false,
  suggestionsOnly = false,
  vocabList = [],
}) {
  const selected = normalizeTasks(tasks);
  const levelNote = cefr && cefr !== 'auto'
    ? `Use CEFR level ${cefr}.`
    : (suggestionsOnly || source.suggestionsOnly)
      ? 'Choose a suitable CEFR level (default B1 unless the grammar or vocabulary clearly points higher or lower).'
      : 'Choose the most appropriate CEFR level (A1–C2) from the complexity of the material.';

  const resolvedAdapt = resolveAdaptTarget(adapt, adaptTarget, cefr && cefr !== 'auto' ? cefr : 'B1');
  let adaptNote = 'Do not summarise. Work on the unabridged source text. Do not abridge, simplify, or rewrite unless a sentence is unsafe to reproduce.';
  if (resolvedAdapt?.mode === 'words') {
    adaptNote = `The teacher asked you to adapt. Rewrite the source at the target CEFR. Keep the original meaning and sequence. Do not summarise. Target ${resolvedAdapt.minWords}–${resolvedAdapt.maxWords} words (aim near ${resolvedAdapt.targetWords}).`;
  } else if (resolvedAdapt?.mode === 'minutes') {
    adaptNote = `The teacher asked you to adapt. Rewrite the source at the target CEFR. Keep the original meaning and sequence. Do not summarise. Target about ${resolvedAdapt.targetWords} words so reading time is about ${resolvedAdapt.minutes} minutes at this level (typical band: 3 minutes at A1 up to about 6 minutes at C1).`;
  }

  const extra = (extraInstructions || '').trim();
  const focus = String(grammarPoint || source.grammarPoint || '').trim();
  const vocabItems = normalizeVocabList(vocabList.length ? vocabList : source.vocabList);
  const taskList = selected.map((id) => `- ${id}: ${taskLabel(language, id)}`).join('\n');

  const fromSuggestions = Boolean(suggestionsOnly || source.suggestionsOnly);
  const topicNote = fromSuggestions
    ? ''
    : (source.topicOnly
      ? `There is no source article. Write an original classroom reading at the target CEFR about "${source.title}", then build every task from that reading. Put the full reading in sourceParagraphs / sourceText.`
      : '');

  const suggestionsNote = fromSuggestions
    ? `SUGGESTIONS-ONLY WORKSHEET (no article or video was provided):
- Build a practice worksheet from the teacher's focus — not from a news article or video.
- Title focus: "${source.title}"
- Grammar focus: ${focus ? `"${focus}"` : '(none named — if grammar tasks are selected, choose one clear CEFR-appropriate point and put it in grammarFocus)'}
- Vocabulary / phrases to feature (use these verbatim where possible; you may add a few related items if the list is short):
${vocabItems.length ? vocabItems.map((w) => `  - ${w}`).join('\n') : '  (none listed — invent a tight CEFR-appropriate set from the grammar/theme)'}
- Theme / context: "${String(source.theme || '').trim() || source.title}"
- skill must be "reading" (classroom practice). Do not invent a listening/YouTube lesson.
- Prefer practice-oriented selected tasks (grammar, vocab, vocabBuild, vocabMatch, wordFormation, cloze, wordBank, discussion, scenario, reflection).
- ${includeSourceOnWorksheet
    ? 'The teacher wants a short original practice text on the sheet: write one coherent text at the target CEFR that naturally uses the target grammar and vocabulary; put it in sourceParagraphs / sourceText; showSourceToStudents true; base gap-fill / MCQ / T-F / open items on that text.'
    : 'Do NOT put a reading passage on the student worksheet (showSourceToStudents false). Build closed tasks as standalone sentences or short exchanges that practise the target grammar/vocab. You may still keep a brief internal sourceParagraphs block for answer checking if helpful, but students must not need an article.'}
- Do not invent a fake newspaper/publisher story unless a short practice text is required on the sheet.`
    : '';

  let transcriptionNote = '';
  if (source.combinedSources || source.skillHint === 'combined') {
    transcriptionNote = `COMBINED VIDEO + TEXT WORKSHEET: The SOURCE TEXT has two labelled parts — [VIDEO — listening source] and [READING TEXT]. Set skill to "combined".
- Build ONE worksheet that uses BOTH sources, but keep every comprehension item tied to EXACTLY ONE source — never to both.
- COMPREHENSION SOURCE FOCUS (mandatory for gapFill / mcq / tf / open):
  - Put "sourceFocus": "video" OR "sourceFocus": "reading" on comprehension.gapFill AND on EVERY multipleChoice, trueFalse, and openEnded item.
  - A "video" item must be answerable from the [VIDEO] section alone (captions/title/description). Instruction language: "Watch/Listen…"
  - A "reading" item must be answerable from the [READING TEXT] section alone. Instruction language: "Read…"
  - Do NOT write questions, statements, or gaps that mix facts from both sources or that need both sources to answer.
  - Prefer a clear split of the selected comprehension tasks (e.g. some MCQs on the video, others on the reading; or gap-fill on reading + T/F on video). Within one task type you may mix items, but each item still has its own sourceFocus.
  - Reverse-test each closed key ONLY against the section named in sourceFocus.
- sourceParagraphs / sourceText for the student sheet must be the READING TEXT only (paragraph-segmented). Do NOT put the video transcript on the student sheet.
- showSourceToStudents should follow the teacher flag for the reading text (true if they included source on the worksheet).
- Intro / vocab / discussion / reflection may bridge themes, but comprehension must stay single-source.
- sourceInstruction should tell students to watch/listen and then read (or the reverse if that fits the task order).
- Title may reflect both sources. Prefer pre-watching + pre-reading style warm-ups when preReading is selected.
${source.videoWithoutCaptions ? '- Video captions were unavailable: video-focus items use the video title/description topic only — do not invent spoken wording.' : ''}
${source.captionsAuto ? '- Video captions are auto-generated (ASR): prefer clear gist/detail items; avoid fragile tiny gaps from the transcript.' : ''}`;
  } else if (source.videoWithoutCaptions) {
    transcriptionNote = `VIDEO WITHOUT CAPTIONS: No transcript (manual or auto-generated) was available. Prefer skill "listening". The SOURCE TEXT is only the video title and/or description — NOT spoken wording. Students watch/listen to the video in class. Build listening-style tasks that a teacher can check against the video topic (prediction, gist, detail they can hear, vocabulary from the topic). Put a short teacher-facing summary of the topic in sourceParagraphs for the key; showSourceToStudents must be false. Do not invent a fake full transcript or claim words were said that are not in the title/description. Mark teacherNotes that captions were unavailable.`;
  } else if (transcriptionMode || source.transcriptionMode || source.transcriptFound) {
    transcriptionNote = `VIDEO TRANSCRIPTION MODE: The source is a video transcript${source.captionsAuto ? ' (YouTube auto-generated captions — may contain ASR errors; prefer clear gist/detail items and avoid tiny fragile gaps)' : ' (captions)'}. Prefer skill "listening". Keep spoken wording verbatim in sourceParagraphs / sourceText unless adapting was requested. Build comprehension from what was said (gap-fill from speech, true/false on spoken detail, open questions about the talk). Do not invent a second article. If the teacher included the source on the worksheet, students may see the transcript; otherwise showSourceToStudents must be false.`;
  }

  if (fromSuggestions) {
    adaptNote = includeSourceOnWorksheet
      ? (resolvedAdapt
        ? adaptNote
        : 'Write the original practice text at the target CEFR. Keep it short and usable in class (about 3–5 minutes of reading).')
      : 'There is no source article to adapt. Ignore unabridged-source rules; invent only the practice items needed.';
  }

  return `You are a professional educator dedicated to creating comprehensive, engaging, and pedagogically sound ${normalizeLanguage(language) === 'de' ? 'DaF (Deutsch als Fremdsprache)' : 'ESL/EFL'} lesson plans and student worksheets.

${fromSuggestions ? 'Build a suggestions-based practice worksheet (no external article/video).' : 'Analyse the source and decide whether the lesson should focus on reading or listening comprehension.'}

SOURCE TITLE: ${source.title}
SOURCE URL: ${source.url || '(none)'}
SKILL HINT FROM THE LINK TYPE: ${source.skillHint}
WORD COUNT OF PROVIDED TEXT: ${source.wordCount}
${source.transcriptFound ? (source.captionsAuto ? 'TRANSCRIPT/CAPTIONS: auto-generated (ASR)' : 'TRANSCRIPT/CAPTIONS: available') : ''}
${source.videoWithoutCaptions ? 'CAPTIONS: none — using title/description only' : ''}

SOURCE TEXT:
"""
${source.text || '(no body text)'}
"""

${languageDirective(language)}
${levelNote}
${adaptNote}
${suggestionsNote}
${transcriptionNote}
${topicNote}

Include ONLY these student tasks${includeSourceOnWorksheet ? ' (plus the reading or listening source on the student sheet)' : ''}:
${taskList}

${includeSourceOnWorksheet
    ? 'Put the source on the student worksheet: reading students see the paragraph text (showSourceToStudents true); listening students do not see the transcript (showSourceToStudents false); combined lessons show the reading paragraphs on the sheet plus a listen/watch box for the video (never the transcript).'
    : 'Do NOT put the article or transcript on the student worksheet. showSourceToStudents must be false. Still write sourceParagraphs / sourceText in the JSON for the teacher key and so questions stay accurate. Students work from a text the teacher provides separately, or from a recording.'}

Do not generate skipped task types. Put empty arrays / empty strings / null for anything not selected — unless TEACHER EXTRA INSTRUCTIONS override the list above.

${extraInstructionsDirective(extra)}

${difficultyNote(cefr)}

Behaviours you must follow:

Resource analysis is internal only. Identify core themes, key vocabulary, and appropriate CEFR level from the complexity of the material. Do not include section subheadings.

Always:
- Segment the source into clear paragraphs. Return sourceParagraphs as an array of paragraph strings (one idea-group per paragraph). Never return one undifferentiated block.
- Do not provide a summary. Unabridged text unless adapting was requested.
- When adapting, reading time 3 minutes (A1) to about 6 minutes (C1).
- Student-friendly numbered activity instructions. No pedagogical section subheadings.
- Listening: students do not get the transcript; showSourceToStudents false.
- Reading: students get the paragraph text only if the teacher asked for the source on the worksheet; otherwise showSourceToStudents false.
- Combined (video + text): skill "combined"; student sheet shows reading paragraphs (when included) and a watch/listen prompt for the video — never the transcript. Every comprehension item (gapFill / mcq / tf / open) must set sourceFocus to "video" or "reading" and be answerable from that section alone — never from both.
- Definitions must not be harder than the target level.

If intro is selected: 2–4 sentences or questions to spark interest. Put each sentence or question on its own line (return introduction as an array of strings, one line each).

If vocab is selected: 5–8 essential words/phrases in two columns with CEFR-appropriate definitions.

ALWAYS also build lingoSparkList: a separate, copy-ready glossary for LingoSpark vocab games — NOT the same as the short pre-teach table. Include 15–25 items (aim for about 20). Mix single words, multi-word phrases, collocations, and idioms as appropriate for this CEFR (more concrete single words at A1–A2; more collocations, multi-word verbs, and idioms at B2–C2). Prefer high-value lexis from or tightly related to the source. Each item is { "word": "term or phrase", "definition": "short CEFR-appropriate definition or paraphrase students can study" }. Definitions must be clear enough for flashcards (Term = Definition). Do not pad with ultra-rare or off-topic items. Deduplicate; do not repeat the same headword.

If preReading is selected: a pre-reading or pre-watching task BEFORE the text/video. For articles: prediction, title/heading thinking, or activating knowledge — do not give away article details. For video/audio: pre-watching/listening questions about what students expect to see or hear. Give 2–3 prompts with answer space. This is separate from the introduction.

If gapFill is selected: numbered blanks (1), (2), (3), plus a word bank. Take a continuous excerpt from ONE source only (or from sourceParagraphs if you adapted the reading). For combined lessons set gapFill.sourceFocus to "video" or "reading" and take the excerpt only from that section; the instruction must name that source (Watch/Listen… or Read…). Delete the exact source words; do not replace them with synonyms. The word bank must contain exactly the missing words — one bank word per gap, no unused extras, no distractors. Reverse-test before you return JSON: put answers[] back into the blanks — the filled text must match that source section word-for-word (ignoring blank numbers). Scramble the word bank so it is NOT in the same order as the answers. Pitch the missing items to the CEFR (function words / obvious content at A1–A2; collocations and precise lexis at B2–C1).

If mcq is selected: 3–5 items, four options A–D, one correct answer, challenging distractors as above. Across the set, vary the correct letter — use A, B, C and D at least once when there are four or more items. Never make every item the same letter. For combined lessons each item needs sourceFocus "video" or "reading"; the question must be answerable from that section alone.

If tf is selected: 4–6 items. Mix true and false. False sentences are subtle, not obvious. For combined lessons each item needs sourceFocus "video" or "reading"; check the statement only against that section.

If open is selected: 3–4 questions at the CEFR (short factual at A1; justified opinion and inference at B2+). For combined lessons each item needs sourceFocus "video" or "reading"; do not ask learners to compare or combine both sources here.

If vocabBuild is selected: three practice tasks on idioms, collocations, and phrases from the text, at this CEFR. One of them must be a collocation match (kind "match"): left column = one part of each collocation (numbered); right column = the other parts in scrambled order, with no letters. Instruction e.g. "Match each word on the left with the word it collocates with in the text." Do NOT add "Write the letter." items[].prompt is the left part; items[].answer is the right-hand collocate.
The other two vocabBuilding tasks are fixed formats:
- kind "box": instruction "Complete the sentences with one word from the box." ALWAYS include wordBank[] — the exact answer words (one per sentence) plus at most one distractor, scrambled (not in answer order). 5–6 items; each items[].prompt is a sentence based on the source with ONE inline gap "____"; items[].answer is the missing word (must be in wordBank). Never write this instruction without a wordBank.
- kind "translate": instruction "Translate the words in brackets into English to finish each phrase from the video." (say "text" instead of "video" for a reading source; German lessons: "into German"). 5–6 items; each items[].prompt is a useful phrase from the source with ONE inline gap "____" and the Polish meaning of the missing word(s) in brackets right after the gap, e.g. "I ____ (zgadzam się) with you." items[].answer is the English (or German) word(s) that fill the gap exactly as in the source. Do not put the answer anywhere in the prompt.

If vocabMatch is selected: 6–8 words from the text. Number the words 1, 2, 3… Definitions must be lettered A, B, C… in a DIFFERENT order from the words so students can match. answers[i] is the letter for word i. Definitions stay CEFR-appropriate.

If wordFormation is selected: 6 gapped sentences. Each sentence has one gap and a CAPITAL stem in brackets, e.g. “Her idea was very ____. (CREATE)”. The student MUST change the form of that stem — never leave it unchanged. items[].answer must be a different word from the bracketed stem (ignore case): add or change a prefix/suffix, or change word class (noun ↔ verb ↔ adjective ↔ adverb), e.g. CREATE → creative, HAPPY → happiness, EMPLOY → unemployment. Do NOT use items where the gap answer is the same string as the stem (no CREATE → create, no HAPPY → happy). A1–A2: common patterns (-er, -ing, un-, -ly, -ness). B2+: less obvious affixes. Put the stem in items[].prompt (CAPITALS) and the transformed word in items[].answer.

If whatIf is selected: 4–5 hypothesizing prompts tied to the source. Calibrate to the CEFR — A1: concrete, present simple (“Imagine you are late. What do you say?”); A2: simple first conditional / going to; B1: first and second conditional; B2: second/third, speculation; C1–C2: mixed conditionals, hedging, implications. Do NOT start every item with “What if”. Vary stems: Imagine…, Suppose…, How would…, What might happen if…, In your position… Include a short sampleAnswer for the teacher key.

If discussion is selected: 3–5 questions. At A1–A2 keep them concrete and personal; at B2+ they may be critical and abstract.

If cloze is selected: a Use of English cloze. One or two short paragraphs with (1)(2)(3) blanks (4–6 blanks). Each blank has three options A/B/C that test grammar or precise lexis at this CEFR. Put the correct letter in items[].answer. Vary the correct letters so A, B and C are all used.

If wordBank is selected: a second Use of English task. A word bank (6–8 words, 1–2 distractors allowed) and 5–6 gapped sentences based on the source. Answers in wordBankTask.answers are the exact missing source words. Reverse-test: filling each sentence must restore wording that appears in the source. Scramble the word bank so it is not in answer order.

If grammar is selected: exactly TWO practice activities on one grammar point, using the lesson topic. Grammar point: ${focus ? `"${focus}"` : '(choose one high-value point that appears in the source at this CEFR)'}. Put that point in grammarFocus. The two activities MUST be different kinds (not two gap-fills). Choose two from: gap (complete the correct form), choose (pick the correct option A/B/C), rewrite (rewrite the sentence with the target structure), error (correct the mistake). 5–6 items in the first; 4–5 in the second. Pitch to this CEFR. Tie examples to the source topic. No grammar-rule box or metalanguage heading on the student sheet — only a do-this instruction. Put the correct form in items[].answer.

If scenario is selected: a realistic dilemma connected to the text, Option A vs Option B, and a pair/group task.

If debate is selected: a clear thesis plus 3 Team PRO points and 3 Team CON points students can argue.

If reflection is selected: a short synthesis quote or line from/about the text, plus one thinking question.

If guidedWriting is selected: a LONGER guided writing task (substantial paragraph(s), not a short note). instruction tells students what to write (genre, length, audience). Set length by CEFR: A1–A2 ≈ 80–100 words; A2+/B1 ≈ 100–140 words; B2 ≈ 140–180 words; C1–C2 ≈ 180–220 words. bullets[] are 5–8 concrete points they must include. sampleAnswer is a FULL teacher model of that length covering every bullet. No markdown; do not write "Task 1" in the instruction.

ANSWER ACCURACY (mandatory). Check every closed-task key against the source before you return JSON. The teacher copy uses these fields as-is. Do not fill answers on the student presentation slides; keep keys in the JSON. Reverse-test gap-fill and word-bank items: substitute the answers into the gaps and confirm the restored wording appears in the source (or in sourceParagraphs if you adapted). If it does not, change the answer to the exact source word. For combined lessons, reverse-test each item only against the section in its sourceFocus ("video" or "reading") — never against the merged text as a whole.
- multipleChoice[].answer MUST be the letter A, B, C, or D of the option that is factually correct from the named sourceFocus section. Never put the option wording in "answer".
- trueFalse[].answer MUST be a JSON boolean (true or false), never the strings "True"/"False". If false, correction names the inaccurate detail from that same section. Mix true/false with no special pattern (not alternating, not blocked, not all one value).
- gapFill.answers[] and wordBankTask.answers[] are the exact missing source words in numbered order — not paraphrases, not a different inflection unless that form is what the source uses.
- cloze.items[].answer is A, B, or C. The matching option text must actually fit the gap and match the source grammar/lexis.
- vocabMatch.answers[i] is the letter of the definition that matches words[i]. Confirm each pair.
- wordFormation items[].answer is the correctly formed word that fits the sentence. It MUST differ from items[].prompt / the bracketed stem (case-insensitive) — the student always changes the form.

Return ONLY valid JSON (the first character of your reply must be { and the last must be }). Do not write any prose before or after the JSON — no sentences such as "The full lesson…", no markdown fences, no commentary:
{
  "title": "student-facing lesson title",
  "sourceTitle": "original source title",
  "skill": "reading" or "listening" or "combined",
  "cefr": "A1" | "A2" | "A2+" | "B1" | "B2" | "C1" | "C2",
  "themes": ["theme"],
  "estimatedMinutes": 4.5,
  "wordCount": 0,
  "showSourceToStudents": true,
  "includedTasks": ${JSON.stringify(selected)},
  "introduction": ["sentence or question 1", "sentence or question 2"],
  "imageSearch": "2–6 concrete ENGLISH nouns for a PHOTO of the article MAIN IDEA (visible scene/object/people), e.g. plastic ocean turtle — NEVER abstract words like friendship, freedom, education, climate change alone",
  "vocabulary": [{"word": "term", "definition": "CEFR-appropriate definition"}],
  "lingoSparkList": [{"word": "term or phrase", "definition": "short study definition"}],
  "preReading": {
    "instruction": "Before you read / watch…",
    "items": [{"prompt": "question or prediction task"}]
  },
  "sourceInstruction": "Read the text. / Watch or listen carefully.",
  "sourceParagraphs": ["paragraph 1", "paragraph 2"],
  "sourceText": "full text with blank lines between paragraphs",
  "comprehension": {
    "gapFill": {"instruction": "...", "sourceFocus": "reading|video (required when skill is combined)", "wordBank": ["..."], "text": "paragraphs with (1) blanks", "answers": ["..."]},
    "multipleChoice": [{"question": "...", "sourceFocus": "reading|video (required when skill is combined)", "options": ["A option", "B option", "C option", "D option"], "answer": "B"}],
    "trueFalse": [{"statement": "...", "sourceFocus": "reading|video (required when skill is combined)", "answer": true, "correction": ""}],
    "openEnded": [{"question": "...", "sourceFocus": "reading|video (required when skill is combined)", "sampleAnswer": "brief teacher model"}]
  },
  "vocabBuilding": [
    {"instruction": "Match each word on the left with the word it collocates with in the text.", "kind": "match", "items": [{"prompt": "left part", "answer": "right-hand collocate"}]},
    {"instruction": "Complete the sentences with one word from the box.", "kind": "box", "wordBank": ["scrambled", "answer", "words"], "items": [{"prompt": "She ____ the bus every morning.", "answer": "catches"}]},
    {"instruction": "Translate the words in brackets into English to finish each phrase from the text.", "kind": "translate", "items": [{"prompt": "I ____ (zgadzam się) with you.", "answer": "agree"}]}
  ],
  "vocabMatch": {
    "instruction": "Match each word to its meaning. Write the letter.",
    "words": ["term"],
    "definitions": [{"letter": "A", "text": "meaning"}],
    "answers": ["B"]
  },
  "wordFormation": {
    "instruction": "Complete each sentence with a different form of the word in brackets.",
    "items": [{"sentence": "Her idea was very ____. (CREATE)", "prompt": "CREATE", "answer": "creative"}]
  },
  "whatIf": {
    "instruction": "Think about these situations. Use your ideas.",
    "items": [{"prompt": "Imagine you lost your phone for a day. What would you do first?", "sampleAnswer": "brief teacher model"}]
  },
  "discussion": ["question 1"],
  "cloze": {
    "instruction": "Choose the best option for each gap.",
    "text": "paragraph with (1) and (2)",
    "items": [{"blank": 1, "options": ["optA", "optB", "optC"], "answer": "B"}]
  },
  "wordBankTask": {
    "instruction": "Complete the sentences with words from the box.",
    "wordBank": ["word"],
    "sentences": ["The team showed great ____ under pressure."],
    "answers": ["word"]
  },
  "grammarFocus": "present perfect vs past simple",
  "grammarPractice": [
    {"kind": "gap", "instruction": "Complete with the present perfect or past simple.", "items": [{"prompt": "They ____ (live) here since 2019.", "answer": "have lived"}]},
    {"kind": "choose", "instruction": "Choose the correct option.", "items": [{"prompt": "She ____ the job in 2020.", "options": ["has started", "started", "had started"], "answer": "B"}]}
  ],
  "scenario": {
    "dilemma": "...",
    "optionA": "...",
    "optionB": "...",
    "task": "Discuss in pairs…"
  },
  "debate": {
    "thesis": "...",
    "pro": ["argument"],
    "con": ["argument"]
  },
  "reflection": {
    "quote": "short synthesis line",
    "question": "thinking question"
  },
  "guidedWriting": {
    "instruction": "Write a … (about N words). Include all the points below.",
    "bullets": ["point 1", "point 2", "point 3", "point 4", "point 5"],
    "sampleAnswer": "full-length teacher model covering every bullet"
  },
  "teacherNotes": "short practical notes. No Resource Analysis heading."
}`;
}

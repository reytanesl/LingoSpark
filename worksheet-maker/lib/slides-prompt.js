import { normalizeTasks } from './lesson-prompt.js';
import { taskLabel, normalizeLanguage } from './ui-strings.js';
import { languageDirective } from './language-prompt.js';

const SLIDE_FOR_TASK = {
  intro: 'intro',
  preReading: 'preread',
  vocab: 'vocab',
  gapFill: 'gapfill',
  mcq: 'mcq',
  tf: 'tf',
  open: 'open',
  vocabBuild: 'vocabbuild',
  vocabMatch: 'match',
  wordFormation: 'wordform',
  whatIf: 'whatif',
  cloze: 'cloze',
  wordBank: 'wordbank',
  grammar: 'grammar',
  reflection: 'reflection',
  scenario: 'scenario',
  debate: 'debate',
  discussion: 'discussion',
};

export function buildSlidesPrompt({ source, cefr, adapt, extraInstructions, tasks, includeSourceOnSlides = true, language = 'en' }) {
  const selected = normalizeTasks(tasks);
  const levelNote = cefr && cefr !== 'auto'
    ? `The teacher requested CEFR ${cefr}. Calibrate every instruction, question, definition, and task to that level.`
    : 'No CEFR was requested. Evaluate the source complexity and declare an appropriate default from A2, A2+, B1, B2, C1, C2.';

  const adaptNote = includeSourceOnSlides
    ? (adapt
      ? 'The teacher asked you to adapt. You may adapt the reading chunks to the target CEFR. Keep meaning and sequence. Do not summarise. The adapted text must still appear in full across the reading-chunk slides.'
      : 'Do not paraphrase the source. Break the entire provided text down sequentially into verbatim reading chunks. Do not summarise.')
    : 'The teacher does NOT want the source article on the slides. Do not create any reading-chunk slides (no role "chunk"). Still use the source to write the other tasks. Do not paste long source excerpts onto any slide.';

  const topicNote = source.topicOnly
    ? (includeSourceOnSlides
      ? `This is a topic-only request. Write an original classroom reading at the target CEFR about: "${source.title}". Then treat that original reading as the source text and place it verbatim (or adapted if requested) across the reading-chunk slides.`
      : `This is a topic-only request. Invent an original classroom reading at the target CEFR about "${source.title}" to base the tasks on, but do not put that reading on the slides.`)
    : '';

  const extra = (extraInstructions || '').trim();
  const taskList = selected.map((id) => `- ${id}: ${taskLabel(language, id)} → slide role "${SLIDE_FOR_TASK[id]}"`).join('\n');
  const extraRoles = selected.map((id) => SLIDE_FOR_TASK[id]).filter(Boolean);

  return `You are an expert ${normalizeLanguage(language) === 'de' ? 'teacher of German as a foreign language (DaF)' : 'English language teacher (ESL/EFL)'} and instructional designer. Convert the source into a finished classroom slide deck. The app will render real 16:9 slides and a PDF download. Do NOT write blueprints, setup notes, or labels such as [Slide Layout Type], [Visual / Image Suggestion], or [Slide Body Content]. Return structured slide content only.

SOURCE TITLE: ${source.title}
SOURCE URL: ${source.url || '(none)'}
PUBLISHER / PLATFORM HINT: ${source.url || source.title}
WORD COUNT: ${source.wordCount || 0}

SOURCE TEXT:
"""
${source.text || '(no source body — write an original reading from the topic, then chunk it)'}
"""

${languageDirective(language)}
${levelNote}
${adaptNote}
${topicNote}
${extra ? `TEACHER INSTRUCTIONS:\n${extra}\n` : ''}

Lower levels (A2 to B1): minimize heavy specialized jargon and focus on practical, real-life consequences, while keeping critical thinking challenging.

Tone: warm, encouraging, expert-peer. Every field fully written. No placeholders. Body copy short enough for a classroom screen (4–6 items max). Reading-chunk leftText: about 80–140 words, split into paragraphs with \\n\\n. Do NOT put hints under reading-chunk comprehension questions.

Build slides from the ticked tasks. Always include:
1. Title (role "title") — header, subhead, CEFR is on the deck.
${includeSourceOnSlides ? '2. Reading chunks (role "chunk") — 2 to 5 two-column slides, more if needed so the full text appears. leftText = verbatim (or adapted) excerpt. questions = exactly 2 open-ended items.\n3. ' : '2. Do NOT include reading-chunk slides.\n3. '}Source (role "source") — sourceTitle, publisher, date ("Date not stated" if unknown). Never invent a fake date. Do not paste the article body on the source slide.

Also include a slide for EACH ticked task below (one role, in this order, after the matching pedagogical moment: pre-read and vocab before chunks; comprehension and Use of English after chunks; reflection / scenario / debate / discussion near the end; source last):
${taskList}

Do NOT add slides for unticked tasks. Extra slide roles to include: ${JSON.stringify(extraRoles)}.

Do NOT add Answers slides yourself, and do not append "— Answers" or "— Lösungen" to headers. The app inserts a follow-up slide after each closed task (gapfill, cloze, wordbank, vocabbuild, mcq, tf, match, wordform, grammar) that keeps the same header and layout and only reveals the answers.

On student task slides, every typed answer must show a visible gap. Use (1) ______ in running text (not a bare (1)), ______ in gapped sentences, and leave match items as numbered words only (the app draws a letter blank). Do not fill those gaps. Do not tick or highlight MCQ / true-false / cloze options. Keep the answer fields in the JSON for the reveal slide and the teacher worksheet.

ANSWER ACCURACY (mandatory). Every closed-task answer must be correct against the source. Reverse-test gap-fill and word-bank items: put answers[] back into the gaps; the filled wording must match the source (or the adapted reading chunks) exactly — never a synonym. Use letters for MCQ (A–D) and cloze (A–C), JSON booleans for trueFalse, exact source words for gapFill / wordBank / wordForm, and letters for match. Do not put option wording in MCQ or cloze answer fields. clozeItems[].word must be the text of the correct option. If a statement is false, answer is false.

Role fields:
- intro: header, bullets (2–4 short lines — one sentence or question per line).
- preread: header, bullets (2–3 warm-up questions that do not give away the article).
- vocab: header, vocab[] all pre-teach items {word, definition} on one slide.
- chunk: leftText, questions = exactly 2 items {text, sampleAnswer}. No hints under the questions.
- gapfill: header, wordBank[] exactly the missing words (one per gap, no unused extras), scrambled (not in answer order), clozeText copied from the source with (1) ______ blanks in place of the exact deleted words (always include the underline after the number), answers[] the exact source words for each blank. Reverse-test the filled clozeText against the source before returning JSON.
- mcq: header, mcqs[] {question, options[4], answer: "A"|"B"|"C"|"D"}. Vary the correct letter across items so A–D are all used when there are four or more questions. Do not show the answer on the student slide; still include the answer field.
- tf: header, statements[] as {text, answer: true|false}.
- open: header, bullets (the questions), sampleAnswers[] matching each bullet.
- vocabbuild: header, bullets or sentences[] for the practice items (each sentence must contain ______), answers[].
- match: header, words[] (numbered), definitions[] {letter, text} in shuffled order, answers[] (letter for each word).
- wordform: header, sentences[] each with a ______ gap and a CAPITAL prompt word in brackets, answers[].
- whatif: header, bullets (hypothesizing prompts; not all “What if…”), sampleAnswers[].
- cloze: header, clozeText with (1) ______ blanks, clozeItems[] {blank, options[3], answer: "A"|"B"|"C", word}. Vary A/B/C across the blanks.
- wordbank: header, wordBank[] scrambled (not in answer order), sentences[] taken from or closely based on the source, each with a ______ gap, answers[] (the exact missing source word for each sentence).
- grammar: header (the student instruction), sentences[] for one of the two grammar activities, itemOptions[][] if the activity is choose (A/B/C), answers[]. Gap items must contain ______. Two grammar slides if the worksheet has two activities; they must be different kinds.
- reflection: header, quote, question, hints if A2/A2+. Keep quote and question short enough for one slide with no overlapping text.
- scenario: header, dilemma, optionA, optionB, task, hints if A2/A2+.
- debate: header, thesis, pro[], con[].
- discussion: header, bullets (3–5 questions).
- source: as above.

themeNote is used to colour the finished slides (not teacher setup instructions): accessible background (#F4F6F8 or #F8FAFC), navy body text (#012169), 1–2 topic accent hex colours.

Return ONLY valid JSON:
{
  "cefr": "A2" | "A2+" | "B1" | "B2" | "C1" | "C2",
  "themeNote": {
    "background": "#F8FAFC",
    "bodyText": "#012169",
    "accents": [{"name": "Tech Blue", "hex": "#012169"}]
  },
  "slides": [
    { "role": "title", "header": "Lesson title", "subhead": "Focus line" }
  ],
  "answerKey": {
    "cloze": [{"blank": 1, "answer": "B", "word": "optB"}],
    "wordBank": [{"sentence": 1, "answer": "word"}],
    "gapFill": [{"blank": 1, "answer": "word"}],
    "multipleChoice": [{"item": 1, "answer": "B"}],
    "trueFalse": [{"item": 1, "answer": true}],
    "open": [{"item": 1, "answer": "brief model"}],
    "match": [{"item": 1, "answer": "B"}],
    "wordForm": [{"item": 1, "answer": "creative"}],
    "whatIf": [{"item": 1, "answer": "brief model"}],
    "grammar": [{"item": 1, "answer": "have lived"}]
  }
}`;
}

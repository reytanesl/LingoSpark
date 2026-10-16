import { normalizeLanguage } from './ui-strings.js';

/** Extra model instructions when the teacher is on the German (DaF) tab. */
export function languageDirective(language) {
  if (normalizeLanguage(language) !== 'de') return '';
  return `
OUTPUT LANGUAGE (mandatory): German.
You are writing a DaF (Deutsch als Fremdsprache) lesson, not ESL/EFL.
- Every student-facing string in the JSON must be German: title, introduction, instructions, questions, options, definitions, discussion prompts, scenario, debate points, reflection, teacherNotes, sourceInstruction, lingoSparkList definitions, and all slide headers.
- imageSearch stays in English: 2–6 words naming what a photo of the article's main idea would show.
- Keep the source reading/listening text in its original wording unless the teacher asked to adapt. If adapting, rewrite in German at the target CEFR (keep German if the source is already German).
- Topic-only: write an original classroom reading in German.
- True/false statements in German. The JSON answer field is still a boolean true/false, never the words Wahr/Falsch.
- Word formation uses German stems in CAPITALS, e.g. „Ihre Idee war sehr ____. (SCHÖN)“ → answer „schön“ is WRONG (same word); use a changed form such as „Schönheit“ or „verschönern“. The answer must always differ from the bracketed stem (ignore case). A1–A2: common patterns (ge-, un-, -ung, -heit, -er). B2+: less obvious affixes, Umlaut, trennbare Verben.
- Cloze and word bank are Sprachbausteine (grammar and precise lexis), not "Use of English".
- Grammar practice: two different activity kinds on the stated grammar point (Grammatikschwerpunkt), student instructions in German.
- Slide headers in German (Lückentext, Multiple Choice, Wahr oder Falsch, Wortbildung, Diskussion, Grammatikübung, …).
- Source slide: date "Datum unbekannt" if unknown (not "Date not stated").
- Teacher notes in German.
`;
}

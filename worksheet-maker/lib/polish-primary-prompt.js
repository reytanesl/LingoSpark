import { POLISH_PRIMARY_TASKS, normalizePolishTasks } from './polish-primary.js';

/**
 * Silent design constraints for ASD / Asperger-profile learners.
 * Must NEVER appear on the student worksheet or in student-facing JSON strings.
 */
function asdSilentDesign() {
  return `
INTERNAL DESIGN CONSTRAINTS (teacher tooling only — NEVER mention autism, Asperger,
ASD, spektrum, zaburzenie, niepełnosprawność, or similar on the worksheet, in titles,
instructions, teacherNotes themes that students might see, or any student-facing field):
- One clear instruction per task; say exactly what to do and how many answers to write.
- Concrete, literal wording. Avoid sarcasm, vague prompts, and idioms unless the subject
  is język polski / język obcy and the topic is precisely about figurative language.
- Predictable structure: same pattern of number + bold instruction + writing lines for answers (never answer boxes).
- Prefer closed tasks (gap-fill, MCQ, T/F, matching) over open social discussion — unless the
  teacher extras explicitly ask for open / discussion-style work.
- Open questions must be concrete and answerable from the material (not “co czujesz”).
- Short paragraphs; chunk information; avoid long unbroken walls of text.
- Explicit answer format (np. „Napisz jedną odpowiedź.” / „Zaznacz literę A–D.”).
- Do not require reading social cues or guessing unspoken classroom norms.
`;
}

function gradeLevelNote(grade) {
  const map = {
    4: 'klasa 4 — prosty język, konkret, krótkie zdania, podstawowe pojęcia wprowadzane w tym roku',
    5: 'klasa 5 — nieco dłuższe teksty, proste wnioskowanie, utrwalanie i rozwijanie pojęć z klasy 4–5',
    6: 'klasa 6 — samodzielna praca z tekstem, terminologia przedmiotowa na poziomie końcówki II etapu niższych klas',
    7: 'klasa 7 — język przedmiotowy, związki przyczynowo-skutkowe, przygotowanie pod wymagania klas 7–8',
    8: 'klasa 8 — poziom egzaminu ósmoklasisty w zakresie danego przedmiotu (tam gdzie dotyczy), precyzja, synteza',
  };
  return map[grade] || `klasa ${grade}`;
}

function subjectPracticeNote(subjectId) {
  const notes = {
    'jezyk-polski': 'Ćwiczenia językowe, czytanie ze zrozumieniem, ortografia/fleksja gdy temat tego wymaga, tworzenie krótkiej wypowiedzi.',
    historia: 'Fakty, chronologia, przyczyny i skutki, praca z krótkim tekstem źródłowym lub opisem wydarzenia.',
    wos: 'Instytucje, prawa i obowiązki obywatela, życie społeczne — konkretne przykłady z życia ucznia.',
    etyka: 'Dylematy w jasnych scenariuszach, argumenty „za” i „przeciw” bez oceniania ucznia.',
    'jezyk-obcy': 'Ćwiczenia leksykalno-gramatyczne i krótkie czytanie na poziomie typowym dla SP w danej klasie (CEFR orientacyjnie: kl.4–5 ≈ A1; kl.6–7 ≈ A2; kl.8 ≈ A2+/B1). Instrukcje zadań po polsku; treść ćwiczeń w języku obcym gdy temat tego wymaga — domyślnie angielski, chyba że temat wskazuje inny język.',
    'drugi-jezyk': 'Jak język obcy, ale na poziomie wprowadzającym drugiego języka (prostsze).',
    lacina: 'Podstawy łaciny szkolnej: formy, słownictwo, krótkie zdania — bez przeładowania.',
    matematyka: `MATEMATYKA — domyślnie (gdy nauczyciel nie napisze inaczej w dodatkowych wskazówkach):
1) Krótki tekst wyjaśniający pojęcie (sourceParagraphs).
2) Zadania zamknięte (MCQ / T-F / luki), jeśli pasują.
3) practiceExercises: 2–4 bloki zadań PRAKTYCZNYCH (calculate, measure, draw, construct, wordProblem, table).
Jeśli dodatkowe wskazówki określają inne rodzaje lub liczbę zadań — stosuj wskazówki nauczyciela, nie ten domyślny zestaw.
Wszystkie obliczenia w kluczu MUSZĄ być poprawne arytmetycznie.`,
    przyroda: 'Obserwacje przyrody, zjawiska, bezpieczeństwo — konkret i przykłady z otoczenia ucznia.',
    biologia: 'Budowa, funkcje, procesy — dokładna terminologia na poziomie SP.',
    geografia: 'Mapy (opisowo), krajobrazy, ludność, klimat — fakty zgodne z wiedzą szkolną.',
    fizyka: 'Pojęcia, jednostki, proste obliczenia i przykłady z życia; poprawność liczbowa obowiązkowa.',
    chemia: 'Wzory, reakcje na poziomie SP, bezpieczeństwo; bez treści ponad podstawę.',
    informatyka: 'Algorytmy opisowo, bezpieczeństwo w sieci, narzędzia — ćwiczenia praktyczne na papierze.',
    muzyka: 'Elementy muzyki, słuchanie opisowe, notacja na poziomie SP.',
    plastyka: 'Techniki, barwa, kompozycja — zadania i krótkie zadania praktyczne.',
    technika: 'Materiały, narzędzia, bezpieczeństwo, proste projekty opisane krok po kroku.',
    wf: 'Zasady gier, bezpieczeństwo, zdrowie — bez wymagania ruchu na kartce; wiedza o WF.',
    edb: 'Bezpieczeństwo, pierwsza pomoc na poziomie SP, procedury — konkretne kroki.',
    wdz: 'Treści zgodne z WDŻ w SP: relacje, zdrowie, odpowiedzialność — taktownie, bez treści nieodpowiednich wiekowo.',
  };
  return notes[subjectId] || 'Ćwiczenia zgodne z przedmiotem i klasą.';
}

function guidedTaskOrderNote(selected, wantsPractice, subjectId) {
  const order = [
    'intro',
    'vocab',
    'preReading',
    'source (tekst — showSourceToStudents)',
    'tf',
    'mcq',
    'gapFill',
    'vocabMatch',
    'vocabBuild',
    'wordFormation',
    'grammar',
    'cloze',
    'wordBank',
    ...(wantsPractice ? ['practiceExercises'] : []),
    'open',
    'scenario',
    'reflection',
    'guidedWriting',
  ];
  const active = order.filter((step) => {
    if (step.startsWith('source') || step.startsWith('practice')) return true;
    return selected.includes(step);
  });
  return `
GUIDED LEARNING (induced learning — mandatory for Po polsku):
- Build a step-by-step path: easiest → harder. Do NOT jump to hard open tasks before closed support.
- Suggested flow for this sheet (only steps the teacher selected): ${active.join(' → ')}.
- intro: 2–3 krótkie zdania — temat, cel pracy, co uczeń zrobi krok po kroku (bez metajęzyka „lekcja”).
- preReading: 2–3 konkretne pytania / przewidywania powiązane z nadchodzącym tekstem (np. „Szukaj w tekście…”, „Zapisz jedno słowo…”).
- vocab: tabela pojęć — każda definicja prosta; w instrukcji napisz „Przeczytaj tabelę. Te słowa pojawią się w zadaniach.”
- Po tekście źródłowym: najpierw prostsze zamknięte (T/F lub MCQ), potem luki, potem dopasowanie, na końcu otwarte / pisanie.
- Każda instrukcja zadania: powiedz DOKŁADNIE ile odpowiedzi (np. „Wybierz jedną odpowiedź”, „Uzupełnij 6 luk”, „Napisz 2 zdania”).
- Wstaw krótkie wskazówki w treści instrukcji (np. „Najpierw przeczytaj akapit 2”, „Porównaj z ramką”) — bez osobnych nagłówków.
- Dla ${subjectId}: pierwsze zadanie po tekście powinno utrwalać podstawowe fakty; trudniejsze wnioskowanie dopiero później.
- practiceExercises (gdy wybrane): pierwszy item w bloku może być wzorem („Przykład: …”) z rozwiązaniem tylko w kluczu; kolejne — samodzielne, stopniowane trudnością.
- reflection / guidedWriting: tylko gdy wybrane — kończą kartę, nie zastępują ćwiczeń wstępnych.
`;
}

function teacherExtrasBlock(extra) {
  if (!extra) {
    return `
TEACHER EXTRA INSTRUCTIONS: (none)
Use the default task palette and default item counts below.
`;
  }
  return `
TEACHER EXTRA INSTRUCTIONS — HIGHEST PRIORITY (override defaults):
"""
${extra}
"""

You MUST follow these instructions for:
- which task types appear (and which to skip),
- how many items / exercises in each type,
- which practiceExercises kinds to use (calculate, measure, draw, construct, wordProblem, table, scramble/rozsypywanka),
- length / time (np. krótka karta, 15 minut, dużo ćwiczeń),
- focus (np. tylko obliczenia, bez słownictwa, bez tekstu źródłowego, więcej rysowania, same zamknięte).

Rules when extras are present:
- If the teacher names task types or counts, match them as closely as the JSON schema allows.
- Omit task types they asked to skip (empty arrays / empty strings; do NOT invent filler tasks).
- If they ask for a short sheet, cut intro/reflection/vocab fluff and keep the requested exercises.
- If they ask only for practical math (obliczenia / mierzenie / rysowanie), you may leave MCQ/T-F/gapFill empty and put the work in practiceExercises.
- If they ask to omit the reading text, still put a minimal sourceParagraphs for the key, but set showSourceToStudents to false and keep sourceInstruction empty or very short.
- Put the final list of generated task ids in includedTasks (only what you actually filled).
- Defaults below apply ONLY where the extras are silent.
`;
}

/**
 * After generation: set includedTasks from what was actually produced.
 */
export function syncPolishIncludedTasks(lesson) {
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
  if ((lesson.hypothesizing?.items || lesson.hypothesizing?.prompts || []).length) ids.push('whatIf');
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
  if ((lesson.practiceExercises || []).some((b) => (b?.items || []).length)) {
    ids.push('practice');
  }
  lesson.includedTasks = ids;
  return lesson;
}

/**
 * Build the AI prompt for a Polish primary practice worksheet.
 */
export function buildPolishPrimaryPrompt({
  grade,
  subject,
  topic,
  extraInstructions = '',
  tasks = POLISH_PRIMARY_TASKS,
  sourceText = '',
} = {}) {
  const normalized = normalizePolishTasks(tasks?.length ? tasks : POLISH_PRIMARY_TASKS, subject.id);
  const wantsPractice = normalized.includes('practice');
  const selected = normalized.filter((id) => id !== 'practice');
  const taskList = [
    ...selected.map((id) => `- ${id}`),
    ...(wantsPractice ? ['- practice → wypełnij practiceExercises (zadania praktyczne)'] : []),
  ].join('\n');
  const extra = String(extraInstructions || '').trim();
  const guidedOrder = guidedTaskOrderNote(selected, wantsPractice, subject.id);
  const pdfSource = String(sourceText || '').trim();
  const topicLine = topic
    ? `Topic entered by the teacher: "${topic}"`
    : 'Topic: NOT provided by the teacher — infer a clear classroom topic from the PDF source below and put it in title, sourceTitle, and themes[0].';

  const sourceBlock = pdfSource
    ? `
PDF / TEACHER SOURCE TEXT (mandatory base for the worksheet):
"""
${pdfSource.slice(0, 45000)}
"""

SOURCE RULES when PDF text is present:
- Extract the MEANINGFUL educational content only (ignore page numbers, headers/footers, copyright, ads, exercise numbers from the original book if they clash with our sheet numbering).
- Infer the worksheet topic from this material if the teacher did not type one; keep it short and classroom-ready (np. "Ułamki zwykłe", "Bitwa pod Grunwaldem").
- Build sourceParagraphs / sourceText from this PDF: keep the core facts and wording suitable for class ${grade}. You may lightly adapt / shorten for age, but do NOT invent a different topic or contradict the PDF.
- Every closed-task key must reverse-test against YOUR sourceParagraphs (which themselves must stay faithful to the PDF).
- If the PDF mixes several themes, focus on the main teaching idea that fits ${subject.name} in class ${grade}.
`
    : `
There is no external article. Write an original short explanatory / reading text about the topic
at class-${grade} level for ${subject.name}, then build every task from that text (and from
practice items that fit the subject). Put the full text in sourceParagraphs / sourceText.
`;

  return `You are an experienced Polish primary-school (szkoła podstawowa) teacher and worksheet author.
Create a practice worksheet (karta pracy) for Polish classroom use.

CONTEXT (mandatory):
- School stage: II etap edukacyjny, szkoła podstawowa
- Class (klasa): ${grade}
- Subject (przedmiot): ${subject.name} (id: ${subject.id})
- ${topicLine}
- Curriculum: align content with the valid Polish podstawa programowa kształcenia ogólnego
  for szkoła podstawowa (MEN; reduced/updated base in force from 1 September 2024).
  Stay within typical expectations for this subject in class ${grade}. Do not introduce
  liceum/technikum content or topics clearly outside the SP syllabus for this grade.
- Level pitch: ${gradeLevelNote(grade)}
- Subject focus: ${subjectPracticeNote(subject.id)}

OUTPUT LANGUAGE (mandatory): Polish.
Every student-facing string must be Polish: title, introduction, instructions, questions,
options, definitions, reflection, source text, teacherNotes, sourceInstruction, lingoSparkList.
Exception: imageSearch stays in English (2–6 concrete nouns for a PHOTO of the topic’s main idea — visible object/scene, not abstract school words).
Exception: for język obcy / drugi język, exercise items may use the foreign language while
task instructions stay in Polish.

${asdSilentDesign()}

VISUAL / AGE FIT (content tone — the app adds colourful doodle margins separately):
- Class ${grade}: write in a voice and task density that fit this age (younger = shorter stems, more concrete; class 8 = tighter, exam-like clarity).
- Subject ${subject.name}: examples and contexts should feel typical for that subject (not generic ESL travel topics).
- Do NOT put decoration instructions, CSS, or “doodle” notes in student-facing text.

${sourceBlock}
showSourceToStudents true by default (set false only if teacher extras ask to hide the text).
skill must be "reading".
Set cefr to a rough analogue only for schema compatibility (kl.4–5 → A2, kl.6 → A2+, kl.7 → B1, kl.8 → B1) — do not print CEFR on the sheet.

${teacherExtrasBlock(extra)}

${guidedOrder}

DEFAULT task palette (only where extras do not decide otherwise):
${taskList}
If "practice" is listed, you MUST fill practiceExercises (unless extras forbid it). If practice is NOT listed, practiceExercises must be [].

Default item counts when extras are silent:
- Vocabulary: 5–8 terms (+ lingoSparkList 12–20).
- Gap-fill: continuous excerpt with numbered blanks; reverse-test answers.
- MCQ: 3–5 items, options A–D, vary correct letters.
- T/F: 4–6 items; subtle false items; JSON boolean answers; mix true/false with no predictable pattern (not T/F/T/F…, not all true, not blocked halves).
- Open: 3 concrete questions.
- vocabMatch: 6–8 terms.
- reflection: one short line + one concrete question.
- guidedWriting: when selected or when teacher extras ask for wypowiedź / pisanie / guided writing — a LONGER writing task (not a short note): instruction in Polish describing what to write; bullets with required content points; full sampleAnswer for the key.
- matematyka practiceExercises: 2–4 blocks, 3–6 items each (unless extras say otherwise).

Always:
- No pedagogical section subheadings on the student sheet.
- Numbered activities; number and instruction on one bold line.
- Segment sourceParagraphs clearly.
- For matematyka / fizyka / chemia: every calculation in the key must be arithmetically correct.
- Never mention autism, Asperger, ASD, or special educational needs anywhere in the JSON student fields or title.
- includedTasks must list ONLY the task ids you actually generated (subset of: ${[...selected, ...(wantsPractice ? ['practice'] : [])].join(', ')}).
- Never use markdown in student-facing strings (no **bold**, *italic*, # headings). The app numbers tasks — do NOT write "Zadanie 1", "Zadanie 10 (ćwiczenie dodatkowe…)" in instructions or prompts.
- Rozsypywanka / word scramble: use practiceExercises kind "scramble". Instruction e.g. "Ułóż wyrazy w poprawnej kolejności." Each item.prompt MUST show the sentence words in RANDOM order separated by " / " (never the correct order). item.answer MUST be the correctly ordered full sentence. Example prompt: "szkołę / Ania / do / idzie" → answer: "Ania idzie do szkoły."
- Guided writing (guidedWriting): this is a LONGER, substantial writing task (not 5–7 sentences). instruction MUST be in Polish and tell the pupil exactly what to write (form/gatunek, length, for whom). Set length by class: klasy 4–5 → ok. 10–12 zdań lub ok. 100–130 słów; klasy 6–8 → ok. 12–16 zdań lub ok. 140–180 słów. bullets[] = 5–8 concrete required points in Polish (content, structure, and language). sampleAnswer = a FULL model text of that length covering every bullet — not a stub. Example instruction: "Napisz informację na gazetkę szkolną (ok. 12–14 zdań). Uwzględnij wszystkie poniższe punkty."

ANSWER ACCURACY (mandatory — triple-check before returning JSON):
1) Read each question / gap / statement again after writing the key.
2) Reverse-test every gap-fill and word-bank item: put answers[] back into the blanks; the restored wording must match sourceParagraphs / sourceText exactly (not a synonym).
3) For MCQ: verify the keyed letter is the ONLY option supported by the text/topic; distractors must be plausible but wrong.
- multipleChoice[].answer MUST be the letter A–D of the option that is factually correct from the text / topic. Never put the option wording alone in "answer".
- trueFalse[].answer MUST be a JSON boolean. If false, fill correction with the accurate detail.
- vocabMatch.answers[i] is the letter of the definition that matches words[i] — verify each pair against the vocabulary table and the text.
- openEnded[].sampleAnswer must actually answer the question in 1–3 short sentences.
- guidedWriting.sampleAnswer must be a full-length model (matching the instructed word/sentence range) that covers every required bullet in coherent Polish.
- practiceExercises[].items[].answer is mandatory for every item that has a definite key (calculate, measure, wordProblem, table, construct with a measurable result, scramble). The answer must correctly solve the prompt (check arithmetic and units). For draw items, put a brief teacher description of the expected drawing. For scramble, answer is the correctly ordered sentence.
- Do not leave empty answer strings for closed tasks. Do not invent keys that contradict the prompt.

Return ONLY valid JSON with the same schema as ESL worksheets, plus Polish fields and optional practiceExercises (the first character of your reply must be { and the last must be }; no prose before/after):
{
  "title": "tytuł karty pracy",
  "sourceTitle": "temat",
  "skill": "reading",
  "cefr": "A2" | "A2+" | "B1",
  "mode": "polishPrimary",
  "polishClass": ${grade},
  "polishSubject": "${subject.id}",
  "polishSubjectName": "${subject.name}",
  "themes": ["temat"],
  "estimatedMinutes": 35,
  "wordCount": 0,
  "showSourceToStudents": true,
  "includedTasks": ["only","tasks","you","filled"],
  "introduction": ["zdanie lub pytanie 1", "zdanie lub pytanie 2"],
  "imageSearch": "english photo keywords",
  "vocabulary": [{"word": "pojęcie", "definition": "proste wyjaśnienie"}],
  "lingoSparkList": [{"word": "hasło", "definition": "krótka definicja"}],
  "preReading": {
    "instruction": "Zanim przeczytasz tekst…",
    "items": [{"prompt": "pytanie"}]
  },
  "sourceInstruction": "Przeczytaj tekst.",
  "sourceParagraphs": ["akapit 1", "akapit 2"],
  "sourceText": "pełny tekst z pustymi liniami między akapitami",
  "comprehension": {
    "gapFill": {"instruction": "...", "wordBank": ["..."], "text": "tekst z (1) lukami", "answers": ["..."]},
    "multipleChoice": [{"question": "...", "options": ["A …", "B …", "C …", "D …"], "answer": "B"}],
    "trueFalse": [{"statement": "...", "answer": true, "correction": ""}],
    "openEnded": [{"question": "...", "sampleAnswer": "..."}]
  },
  "vocabMatch": {
    "instruction": "Dopasuj pojęcie do definicji. Wpisz literę.",
    "words": ["pojęcie"],
    "definitions": [{"letter": "A", "text": "znaczenie"}],
    "answers": ["B"]
  },
  "practiceExercises": [
    {
      "kind": "calculate|measure|draw|construct|wordProblem|table|scramble",
      "instruction": "np. Oblicz. / Narysuj. / Ułóż wyrazy w poprawnej kolejności.",
      "items": [
        {"prompt": "treść zadania LUB wyrazy w losowej kolejności oddzielone „ / ”", "answer": "wynik / poprawne zdanie / opis rysunku", "space": "lines"}
      ]
    }
  ],
  "reflection": { "quote": "krótka myśl", "question": "konkretne pytanie" },
  "guidedWriting": {
    "instruction": "Napisz informację na gazetkę szkolną (ok. 12–14 zdań). Uwzględnij wszystkie poniższe punkty.",
    "bullets": ["punkt 1", "punkt 2", "punkt 3", "punkt 4", "punkt 5", "punkt 6"],
    "sampleAnswer": "pełny wzór wypowiedzi o wymaganej długości (wszystkie punkty)"
  },
  "teacherNotes": "krótkie uwagi dla nauczyciela po polsku (bez wzmianki o ASD); wspomnij jak uwzględniono dodatkowe wskazówki",
  "answerKey": {}
}

Leave unused task fields empty. practiceExercises may be [] when not needed.
Fill answerKey with the closed-task answers for the teacher. No markdown fences.`;
}

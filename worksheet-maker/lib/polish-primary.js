/**
 * Polish szkoła podstawowa (klasy IV–VIII) subjects aligned with the
 * current podstawa programowa (MEN, in force from 1 Sep 2024).
 * Subjects are offered only in grades where they are typically taught.
 */

import { normalizeTasks } from './lesson-prompt.js';

export const POLISH_PRIMARY_CLASSES = [4, 5, 6, 7, 8];

/** Synthetic worksheet block id (not in ESL LESSON_TASKS). */
export const POLISH_PRACTICE_TASK = 'practice';

/** @typedef {{ id: string, name: string, classes: number[] }} PolishSubject */

/** @type {{ id: string, label: string, subjects: PolishSubject[] }[]} */
export const POLISH_SUBJECT_GROUPS = [
  {
    id: 'humanistyczne',
    label: 'Przedmioty humanistyczne',
    subjects: [
      { id: 'jezyk-polski', name: 'Język polski', classes: [4, 5, 6, 7, 8] },
      { id: 'historia', name: 'Historia', classes: [4, 5, 6, 7, 8] },
      { id: 'wos', name: 'Wiedza o społeczeństwie', classes: [8] },
      { id: 'etyka', name: 'Etyka', classes: [4, 5, 6, 7, 8] },
    ],
  },
  {
    id: 'jezyki',
    label: 'Języki obce',
    subjects: [
      { id: 'jezyk-obcy', name: 'Język obcy nowożytny', classes: [4, 5, 6, 7, 8] },
      { id: 'drugi-jezyk', name: 'Drugi język obcy nowożytny', classes: [7, 8] },
      { id: 'lacina', name: 'Język łaciński', classes: [7, 8] },
    ],
  },
  {
    id: 'scisle',
    label: 'Przedmioty matematyczno-przyrodnicze',
    subjects: [
      { id: 'matematyka', name: 'Matematyka', classes: [4, 5, 6, 7, 8] },
      { id: 'przyroda', name: 'Przyroda', classes: [4] },
      { id: 'biologia', name: 'Biologia', classes: [5, 6, 7, 8] },
      { id: 'geografia', name: 'Geografia', classes: [5, 6, 7, 8] },
      { id: 'fizyka', name: 'Fizyka', classes: [7, 8] },
      { id: 'chemia', name: 'Chemia', classes: [7, 8] },
      { id: 'informatyka', name: 'Informatyka', classes: [4, 5, 6, 7, 8] },
    ],
  },
  {
    id: 'artystyczne',
    label: 'Przedmioty artystyczne i techniczne',
    subjects: [
      { id: 'muzyka', name: 'Muzyka', classes: [4, 5, 6, 7] },
      { id: 'plastyka', name: 'Plastyka', classes: [4, 5, 6, 7] },
      { id: 'technika', name: 'Technika', classes: [4, 5, 6] },
    ],
  },
  {
    id: 'inne',
    label: 'Inne przedmioty',
    subjects: [
      { id: 'wf', name: 'Wychowanie fizyczne', classes: [4, 5, 6, 7, 8] },
      { id: 'edb', name: 'Edukacja dla bezpieczeństwa', classes: [8] },
      { id: 'wdz', name: 'Wychowanie do życia w rodzinie', classes: [4, 5, 6, 7, 8] },
    ],
  },
];

const STEM = new Set([
  'matematyka', 'przyroda', 'biologia', 'geografia', 'fizyka', 'chemia', 'informatyka',
]);
const LANGUAGES = new Set(['jezyk-polski', 'jezyk-obcy', 'drugi-jezyk', 'lacina']);
const HUMANITIES = new Set(['historia', 'wos', 'etyka']);
const ARTS_TECH = new Set(['muzyka', 'plastyka', 'technika']);
const CIVICS_LIFE = new Set(['wos', 'etyka', 'edb', 'wdz', 'wf']);

/** All task ids offered in the Po polsku picker (subset of ESL schema + practice). */
export const POLISH_TASK_IDS = [
  'intro',
  'vocab',
  'preReading',
  'gapFill',
  'mcq',
  'tf',
  'open',
  'vocabMatch',
  'vocabBuild',
  'wordFormation',
  'grammar',
  'cloze',
  'wordBank',
  'practice',
  'scenario',
  'reflection',
  'guidedWriting',
];

function taskAllowedForSubject(taskId, subjectId) {
  switch (taskId) {
    case 'practice':
      return STEM.has(subjectId) || ARTS_TECH.has(subjectId) || subjectId === 'informatyka';
    case 'wordFormation':
    case 'grammar':
    case 'cloze':
    case 'wordBank':
    case 'vocabBuild':
      return LANGUAGES.has(subjectId) || subjectId === 'jezyk-polski';
    case 'scenario':
      return CIVICS_LIFE.has(subjectId) || HUMANITIES.has(subjectId);
    case 'guidedWriting':
      return !STEM.has(subjectId) || subjectId === 'informatyka';
    default:
      return true;
  }
}

const DEFAULT_BY_SUBJECT = {
  'jezyk-polski': ['intro', 'vocab', 'preReading', 'gapFill', 'wordFormation', 'grammar', 'vocabMatch', 'mcq', 'guidedWriting'],
  historia: ['intro', 'vocab', 'preReading', 'gapFill', 'mcq', 'tf', 'vocabMatch', 'open', 'guidedWriting'],
  wos: ['intro', 'vocab', 'preReading', 'mcq', 'tf', 'scenario', 'open', 'guidedWriting'],
  etyka: ['intro', 'preReading', 'scenario', 'mcq', 'open', 'reflection'],
  'jezyk-obcy': ['intro', 'vocab', 'preReading', 'vocabMatch', 'gapFill', 'grammar', 'mcq', 'tf'],
  'drugi-jezyk': ['intro', 'vocab', 'vocabMatch', 'gapFill', 'grammar', 'mcq'],
  lacina: ['intro', 'vocab', 'vocabMatch', 'gapFill', 'mcq'],
  matematyka: ['intro', 'vocab', 'preReading', 'tf', 'mcq', 'practice', 'open'],
  przyroda: ['intro', 'vocab', 'preReading', 'gapFill', 'mcq', 'tf', 'practice'],
  biologia: ['intro', 'vocab', 'preReading', 'gapFill', 'mcq', 'tf', 'practice', 'open'],
  geografia: ['intro', 'vocab', 'preReading', 'gapFill', 'mcq', 'tf', 'open'],
  fizyka: ['intro', 'vocab', 'preReading', 'mcq', 'tf', 'practice', 'open'],
  chemia: ['intro', 'vocab', 'preReading', 'mcq', 'tf', 'practice', 'open'],
  informatyka: ['intro', 'vocab', 'preReading', 'mcq', 'tf', 'practice', 'open'],
  muzyka: ['intro', 'vocab', 'preReading', 'mcq', 'open', 'practice'],
  plastyka: ['intro', 'vocab', 'preReading', 'open', 'practice'],
  technika: ['intro', 'vocab', 'preReading', 'mcq', 'practice'],
  wf: ['intro', 'vocab', 'preReading', 'mcq', 'tf', 'open', 'scenario'],
  edb: ['intro', 'vocab', 'preReading', 'mcq', 'tf', 'scenario', 'open'],
  wdz: ['intro', 'vocab', 'preReading', 'mcq', 'open', 'scenario'],
};

/**
 * Subject-relevant task palette for the Po polsku UI.
 * @returns {{ available: string[], defaultChecked: string[] }}
 */
export function polishTaskPalette(subjectId) {
  const id = String(subjectId || '').trim();
  const available = POLISH_TASK_IDS.filter((taskId) => taskAllowedForSubject(taskId, id));
  const preset = DEFAULT_BY_SUBJECT[id] || [
    'intro', 'vocab', 'preReading', 'gapFill', 'mcq', 'tf', 'open', 'vocabMatch', 'reflection',
  ];
  const defaultChecked = preset.filter((taskId) => available.includes(taskId));
  return {
    available,
    defaultChecked: defaultChecked.length ? defaultChecked : available.slice(0, 8),
  };
}

/** Legacy default when no subject context (server fallback). */
export const POLISH_PRIMARY_TASKS = polishTaskPalette('historia').defaultChecked;

/** Normalize Po polsku task list (includes optional practice block). */
export function normalizePolishTasks(tasks, subjectId = '') {
  const arr = Array.isArray(tasks) ? tasks : [];
  const palette = subjectId ? polishTaskPalette(subjectId) : { defaultChecked: POLISH_PRIMARY_TASKS };
  if (!arr.length) {
    return [...palette.defaultChecked];
  }
  const wantsPractice = arr.some((t) => String(t) === POLISH_PRACTICE_TASK || String(t).startsWith('practice:'));
  const core = normalizeTasks(arr.filter((t) => {
    const s = String(t);
    return s !== POLISH_PRACTICE_TASK && !s.startsWith('practice:');
  }));
  let out = core.filter((id) => POLISH_TASK_IDS.includes(id));
  if (!out.length) out = [...palette.defaultChecked.filter((id) => id !== POLISH_PRACTICE_TASK)];
  if (wantsPractice && taskAllowedForSubject(POLISH_PRACTICE_TASK, subjectId) && !out.includes(POLISH_PRACTICE_TASK)) {
    out.push(POLISH_PRACTICE_TASK);
  }
  return out;
}

export function normalizePolishClass(value) {
  const n = Number(value);
  return POLISH_PRIMARY_CLASSES.includes(n) ? n : 0;
}

export function findPolishSubject(subjectId) {
  const id = String(subjectId || '').trim();
  for (const group of POLISH_SUBJECT_GROUPS) {
    const found = group.subjects.find((s) => s.id === id);
    if (found) return { ...found, groupId: group.id, groupLabel: group.label };
  }
  return null;
}

export function subjectsForClass(classNum) {
  const grade = normalizePolishClass(classNum);
  if (!grade) return [];
  return POLISH_SUBJECT_GROUPS.map((group) => ({
    ...group,
    subjects: group.subjects.filter((s) => s.classes.includes(grade)),
  })).filter((g) => g.subjects.length);
}

export function subjectAllowedInClass(subjectId, classNum) {
  const subject = findPolishSubject(subjectId);
  const grade = normalizePolishClass(classNum);
  return Boolean(subject && grade && subject.classes.includes(grade));
}

export function validatePolishPrimaryRequest(body = {}) {
  const grade = normalizePolishClass(body.polishClass ?? body.class);
  const subject = findPolishSubject(body.polishSubject ?? body.subject);
  const topic = String(body.topic || '').trim();
  const hasPdf = Boolean(body.pdfBase64);
  if (!grade) return { ok: false, error: 'Wybierz klasę (4–8).' };
  if (!subject) return { ok: false, error: 'Wybierz przedmiot.' };
  if (!subject.classes.includes(grade)) {
    return { ok: false, error: `Przedmiot „${subject.name}” nie jest typowy dla klasy ${grade}.` };
  }
  if (!topic && !hasPdf) {
    return { ok: false, error: 'Wpisz temat karty pracy albo wgraj PDF.' };
  }
  return { ok: true, grade, subject, topic, hasPdf };
}

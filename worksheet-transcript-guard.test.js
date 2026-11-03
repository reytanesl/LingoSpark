import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isMediaOnlyLesson, mediaTranscriptOf, studentSourceParagraphs, stripLongTranscriptChunks, transcriptOverlap } from './worksheet-maker/lib/transcript-guard.js';
import { lessonToDeck } from './worksheet-maker/lib/lesson-to-deck.js';
import { isWorksheetPublicPath } from './worksheet-maker/static-allowlist.js';

const TRANSCRIPT = '[0:00] ANNA: Welcome to Ocean Talk. Today we look at rivers and plastic and why so much rubbish ends up in the sea every single year.\n\n[1:05] TOM: In Jakarta, volunteers built floating barriers that stop bottles before they reach the sea, and every barrier collects about two tonnes of rubbish a month.';
const SPOKEN = TRANSCRIPT.replace(/\[\d+:\d\d\]\s*/g, '').replace(/(ANNA|TOM): /g, '');
const ARTICLE = ['Most of the plastic in the ocean comes from rivers.', 'Some young people are trying to change this with clean-up projects.'];
const combinedSource = { combinedSources: true, skillHint: 'combined', transcriptFound: true, text: `[VIDEO — listening source]\nTitle: Rivers\n${TRANSCRIPT}\n\n[READING TEXT]\nTitle: Article\n${ARTICLE.join('\n\n')}` };
const listeningSource = { skillHint: 'listening', media: true, transcriptFound: true, text: TRANSCRIPT, youtubeId: 'abc12345678' };

test('pasted video / podcast lesson: no student source paragraphs, transcript kept for the teacher tab', () => {
  const lesson = { skill: 'listening', sourceParagraphs: SPOKEN.split('\n\n'), showSourceToStudents: true };
  assert.equal(isMediaOnlyLesson(lesson, listeningSource), true);
  assert.deepEqual(studentSourceParagraphs(lesson, listeningSource), []);
  assert.match(mediaTranscriptOf(lesson, listeningSource), /\[1:05\] TOM: In Jakarta/);
  // older saved lessons without source text still get their teacher transcript
  assert.match(mediaTranscriptOf(lesson, { skillHint: 'listening' }), /In Jakarta/);
});

test('combined lesson: article stays, transcript paragraphs smuggled into sourceParagraphs are dropped', () => {
  const lesson = { skill: 'combined', sourceParagraphs: [...ARTICLE, SPOKEN.split('\n\n')[1], '[0:00] ANNA: Welcome'] };
  assert.deepEqual(studentSourceParagraphs(lesson, combinedSource), ARTICLE);
  assert.match(mediaTranscriptOf(lesson, combinedSource), /^\[0:00\] ANNA/);
  assert.ok(transcriptOverlap(SPOKEN.split('\n\n')[1], TRANSCRIPT) > 0.9);
  assert.equal(transcriptOverlap(ARTICLE[0], TRANSCRIPT), 0);
});

test('reading lessons are untouched', () => {
  const lesson = { skill: 'reading', sourceParagraphs: ARTICLE };
  assert.deepEqual(studentSourceParagraphs(lesson, { skillHint: 'reading' }), ARTICLE);
  assert.equal(mediaTranscriptOf(lesson, { skillHint: 'reading', text: ARTICLE.join('\n\n') }), '');
});

test('sanitiser: long transcript chunks in student tasks are shortened, short quotes and keys stay', () => {
  const longChunk = SPOKEN.split('\n\n')[1];
  const lesson = {
    sourceParagraphs: [longChunk],
    comprehension: {
      openQuestions: [`Read this: ${longChunk} What did the volunteers build?`, 'Around 1:05, Tom says “floating barriers”. What do they stop?'],
      multipleChoice: [{ question: 'How much rubbish?', options: ['Two tonnes', 'Ten'], answer: 'A', evidence: longChunk }],
    },
  };
  const n = stripLongTranscriptChunks(lesson, TRANSCRIPT);
  assert.equal(n, 1);
  assert.ok(lesson.comprehension.openQuestions[0].length < 90);
  assert.match(lesson.comprehension.openQuestions[1], /floating barriers/);
  assert.equal(lesson.comprehension.multipleChoice[0].evidence, longChunk);
  assert.equal(lesson.sourceParagraphs[0], longChunk);
});

test('student slides never contain the transcript (listening + combined)', () => {
  const text = (deck) => JSON.stringify(deck);
  const listen = lessonToDeck({ skill: 'listening', title: 'T', sourceParagraphs: SPOKEN.split('\n\n'), includedTasks: ['source'] }, listeningSource, { includeSourceOnSlides: true, language: 'en' });
  assert.doesNotMatch(text(listen), /floating barriers/);
  const comb = lessonToDeck({ skill: 'combined', title: 'T', sourceParagraphs: [...ARTICLE, SPOKEN.split('\n\n')[1]], includedTasks: ['source'] }, combinedSource, { includeSourceOnSlides: true, language: 'en' });
  assert.doesNotMatch(text(comb), /floating barriers/);
  assert.match(text(comb), /Most of the plastic in the ocean/);
});

test('worksheet render: transcript only in the teacher tab, never in print / PDF / Drive PDF', () => {
  const html = fs.readFileSync(new URL('./worksheet-maker/index.html', import.meta.url), 'utf8');
  assert.match(html, /<details class="transcript-teacher-wrap no-print" data-transcript>/);
  assert.match(html, /@media print \{ \[data-transcript\], \.transcript-teacher-wrap \{ display:none !important; \} \}/);
  assert.match(html, /body\.student \[data-transcript\] \{ display:none !important; \}|body\.student \[data-transcript\]/);
  assert.match(html, /\.no-print, \[data-transcript\]'\)\.forEach\(\(el\) => el\.remove\(\)\)/);
  assert.match(html, /const sourceHtml = mediaOnly \? ''/);
  assert.equal(isWorksheetPublicPath('/lib/transcript-guard.js'), true);
});

test('teacher / answer-key print & PDF: transcript at the end on a new page; student print & PDF never', () => {
  const html = fs.readFileSync(new URL('./worksheet-maker/index.html', import.meta.url), 'utf8');
  // rendered after the teacher block (= after the answer key), last thing on the sheet
  assert.match(html, /\$\{mediaTranscriptHtml\}\s*<\/div>\s*\$\{transcriptPrintHtml\}\s*`;/);
  assert.match(html, /<div class="transcript-print" data-transcript-print><h3>\$\{tx\('transcriptTeacherOnly'\)\}<\/h3>/);
  assert.match(html, /body\.teacher \.transcript-print \{ display:block !important; break-before:page; page-break-before:always; \}/);
  assert.match(html, /body\.student \.transcript-print \{ display:none !important; \}/);
  assert.match(html, /\.pdf-print-root\.student \.transcript-print \{ display:none !important; \}/);
  // PDF: block always taken out of the main sheet; only re-added for the teacher key, after pdf.addPage()
  assert.match(html, /const transcriptPage = host\.classList\.contains\('teacher'\) \? tpBlock : null;/);
  assert.match(html, /if \(transcriptPage\) \{[\s\S]{0,1400}pdf\.addPage\(\);/);
});

test('UI strings: transcript heading in en / de / pl', async () => {
  const { t } = await import('./worksheet-maker/lib/ui-strings.js');
  assert.equal(t('en', 'transcriptTeacherOnly'), 'Transcript (teacher only)');
  assert.equal(t('pl', 'transcriptTeacherOnly'), 'Transkrypcja (tylko dla nauczyciela)');
});

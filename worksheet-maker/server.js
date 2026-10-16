import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadProjectEnv } from './lib/load-env.js';
import { loadSource } from './lib/fetch-source.js';
import { buildLessonPrompt, normalizeTasks, syncLessonIncludedTasks, normalizeVocabList } from './lib/lesson-prompt.js';
import { buildPolishPrimaryPrompt, syncPolishIncludedTasks } from './lib/polish-primary-prompt.js';
import {
  POLISH_PRIMARY_TASKS,
  POLISH_TASK_IDS,
  normalizePolishTasks,
  validatePolishPrimaryRequest,
} from './lib/polish-primary.js';
import { generateJson } from './lib/generate.js';
import { extractPdfText, pdfFromBase64, inferTopicFromPdfText } from './lib/pdf-text.js';
import { overlayLessonAnswers, prepareLessonAnswers, prepareDeckAnswers } from './lib/answers.js';
import { normalizeLanguage } from './lib/ui-strings.js';
import { findTopicImages, imageFromUrl } from './lib/topic-image.js';
import { lessonToDeck } from './lib/lesson-to-deck.js';
import {
  listSavedLessons,
  getSavedLesson,
  saveLesson,
  deleteSavedLesson,
} from './lib/saved-lessons.js';
import { startJob, getJobStatus, getJobResult } from './lib/jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
dotenv.config({ path: path.join(__dirname, '.env'), override: true, quiet: true });
loadProjectEnv(__dirname);
// Also pick up the parent LingoSpark .env when mounted as worksheet-maker/
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

function apiKey() {
  return (process.env.CURSOR_API_KEY || '').trim();
}

function requireApiKey(res) {
  const key = apiKey();
  if (!key) {
    res.status(503).json({ error: 'Server not configured: CURSOR_API_KEY is missing.' });
    return null;
  }
  return key;
}

/** Express router: APIs under /api/* plus static files (index.html). Mount at /worksheet-maker. */
export function createWorksheetMakerRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '16mb' }));
  registerWorksheetMakerRoutes(router);
  router.use(express.static(__dirname, { index: ['index.html'] }));
  return router;
}

function registerWorksheetMakerRoutes(app) {

async function buildLessonPayload(body, key, update = () => {}) {
  if (body?.mode === 'polishPrimary') {
    return buildPolishPrimaryPayload(body, key, update);
  }

  update({ stage: 'source' });
  const source = await sourceFromRequest(body, { allowTopicOnly: true });
  if (!source.text && !source.topicOnly && !source.suggestionsOnly && !(source.media && source.youtubeId)) {
    const err = new Error(
      source.warning || 'No source text to build a lesson from. Paste the article, upload a PDF, enter a topic, or use suggestions-only mode.'
    );
    err.source = source;
    throw err;
  }

  update({ stage: 'generate' });
  const language = normalizeLanguage(body?.language);
  const selectedTasks = normalizeTasks(body?.tasks);
  const includeSourceOnWorksheet = body?.includeSourceOnWorksheet !== false;
  const includeTopicImage = Boolean(body?.includeTopicImage);
  const vocabList = normalizeVocabList(body?.vocabList || source?.vocabList);
  const shared = {
    source,
    cefr: body?.cefr || 'auto',
    adapt: Boolean(body?.adapt),
    adaptTarget: body?.adaptTarget || null,
    extraInstructions: body?.extraInstructions,
    tasks: selectedTasks,
    includeSourceOnWorksheet,
    language,
    grammarPoint: body?.grammarPoint || '',
    transcriptionMode: Boolean(body?.transcriptionMode || source?.transcriptionMode),
    suggestionsOnly: Boolean(body?.suggestionsOnly || source?.suggestionsOnly),
    vocabList,
  };
  const lesson = prepareLessonAnswers(
    await generateJson(buildLessonPrompt(shared), { apiKey: key, cwd: __dirname }),
    source.text
  );
  lesson.language = language;
  const extras = String(body?.extraInstructions || '').trim();
  if (extras) {
    syncLessonIncludedTasks(lesson);
    const detected = lesson.includedTasks || [];
    lesson.includedTasks = detected.length ? detected : selectedTasks;
  } else {
    lesson.includedTasks = selectedTasks;
  }
  if (shared.grammarPoint && !lesson.grammarFocus) lesson.grammarFocus = shared.grammarPoint;
  if (!includeSourceOnWorksheet) lesson.showSourceToStudents = false;
  if (source.youtubeId) lesson.youtubeId = source.youtubeId;
  if (source.url) lesson.sourceUrl = source.url;
  if (source.skillHint === 'combined' || source.combinedSources) {
    lesson.skill = 'combined';
  } else if (source.skillHint === 'listening') {
    lesson.skill = 'listening';
  }

  update({ stage: 'image' });
  const topicImages = await topicImagesFor({
    source,
    lesson,
    language,
    include: includeTopicImage,
    extraTopic: body?.topic,
  });
  attachTopicImage(lesson, topicImages[0] || null);
  if (topicImages.length) lesson.topicImageChoices = topicImages;

  return {
    lesson,
    deck: null,
    source,
    tasks: lesson.includedTasks || selectedTasks,
    slidesError: '',
    includeSourceOnWorksheet,
    includeTopicImage,
    topicImageChoices: topicImages,
    language,
  };
}

async function buildPolishPrimaryPayload(body, key, update = () => {}) {
  const checked = validatePolishPrimaryRequest(body);
  if (!checked.ok) {
    const err = new Error(checked.error);
    throw err;
  }
  const { grade, subject } = checked;
  let topic = checked.topic;
  const includeTopicImage = Boolean(body?.includeTopicImage);
  const selectedTasks = normalizePolishTasks(
    body?.tasks?.length ? body.tasks : POLISH_PRIMARY_TASKS,
    subject.id,
  );

  update({ stage: 'source' });
  let pdfText = '';
  if (body?.pdfBase64) {
    const buf = pdfFromBase64(body.pdfBase64);
    if (buf) pdfText = await extractPdfText(buf);
  }
  if (!topic && pdfText) {
    topic = inferTopicFromPdfText(pdfText) || 'Materiał z PDF';
  }
  if (!topic) {
    throw new Error('Wpisz temat karty pracy albo wgraj PDF z treścią.');
  }

  const source = await sourceFromRequest(
    {
      topic,
      title: `${subject.name} · klasa ${grade}: ${topic}`,
      pdfBase64: undefined,
      pastedText: pdfText || undefined,
    },
    { allowTopicOnly: !pdfText }
  );
  if (pdfText && !source.text) {
    source.text = pdfText;
    source.wordCount = pdfText.split(/\s+/).filter(Boolean).length;
  }

  update({ stage: 'generate' });
  const lesson = prepareLessonAnswers(
    await generateJson(
      buildPolishPrimaryPrompt({
        grade,
        subject,
        topic,
        extraInstructions: body?.extraInstructions,
        tasks: selectedTasks,
        sourceText: pdfText,
      }),
      { apiKey: key, cwd: __dirname }
    ),
    source.text || pdfText
  );
  syncPolishIncludedTasks(lesson);
  lesson.language = 'pl';
  lesson.mode = 'polishPrimary';
  lesson.polishClass = grade;
  lesson.polishSubject = subject.id;
  lesson.polishSubjectName = subject.name;
  if (topic) {
    if (!Array.isArray(lesson.themes) || !lesson.themes.length) lesson.themes = [topic];
    if (!lesson.sourceTitle) lesson.sourceTitle = topic;
  }
  const detected = (lesson.includedTasks || []).filter(
    (id) => selectedTasks.includes(id) || POLISH_TASK_IDS.includes(id),
  );
  const finalTasks = detected.length ? detected : selectedTasks;
  lesson.includedTasks = finalTasks;
  if (lesson.showSourceToStudents !== false) {
    lesson.showSourceToStudents = true;
  }
  lesson.skill = 'reading';
  if (Array.isArray(lesson.sourceParagraphs) && lesson.sourceParagraphs.length) {
    source.text = lesson.sourceParagraphs.join('\n\n');
    source.paragraphs = lesson.sourceParagraphs;
  } else if (lesson.sourceText) {
    source.text = lesson.sourceText;
  }

  update({ stage: 'image' });
  const topicImages = await topicImagesFor({
    source,
    lesson,
    language: 'pl',
    include: includeTopicImage,
    extraTopic: topic,
  });
  attachTopicImage(lesson, topicImages[0] || null);
  if (topicImages.length) lesson.topicImageChoices = topicImages;

  return {
    lesson,
    deck: null,
    source,
    tasks: finalTasks,
    slidesError: '',
    includeSourceOnWorksheet: lesson.showSourceToStudents !== false,
    includeTopicImage,
    topicImageChoices: topicImages,
    language: 'pl',
    mode: 'polishPrimary',
    polishClass: grade,
    polishSubject: subject.id,
    polishSubjectName: subject.name,
    inferredTopic: topic,
  };
}

function attachTopicImage(target, image) {
  if (!target || !image?.dataUrl) return target;
  target.topicImage = image;
  return target;
}

async function topicImagesFor({ source, lesson, language, include, extraTopic = '' } = {}) {
  if (!include) return [];
  try {
    return await findTopicImages({
      title: lesson?.title || source?.title,
      topic: extraTopic || (source?.topicOnly ? source.title : ''),
      themes: lesson?.themes,
      vocabulary: lesson?.vocabulary,
      introduction: lesson?.introduction,
      imageSearch: lesson?.imageSearch,
      sourceTitle: lesson?.sourceTitle || source?.title,
      imageUrl: source?.imageUrl,
      youtubeId: source?.youtubeId,
      language,
      limit: 5,
    });
  } catch (error) {
    console.warn('Topic images skipped:', error.message);
    return [];
  }
}

async function topicImageFor({ source, lesson, language, include, extraTopic = '' } = {}) {
  const images = await topicImagesFor({ source, lesson, language, include, extraTopic });
  return images[0] || null;
}
async function sourceFromRequest(body, { allowTopicOnly = false } = {}) {
  let pdfText = '';
  if (body?.pdfBase64) {
    const buf = pdfFromBase64(body.pdfBase64);
    if (buf) pdfText = await extractPdfText(buf);
  }

  const suggestionsOnly = Boolean(body?.suggestionsOnly);
  const vocabList = normalizeVocabList(body?.vocabList);
  const grammarPoint = String(body?.grammarPoint || '').trim();
  const topic = String(body?.topic || '').trim();
  const titleHint = String(body?.title || '').trim();
  const extras = String(body?.extraInstructions || '').trim();
  const link = String(body?.url || '').trim();
  const videoLink = String(body?.videoUrl || '').trim();
  const pasted = String(body?.pastedText || '').trim();
  const hasMediaSource = Boolean(link || videoLink || pasted || pdfText);

  if (suggestionsOnly && !hasMediaSource) {
    if (!vocabList.length && !grammarPoint && !topic && !extras && !titleHint) {
      throw new Error(
        'Suggestions-only mode needs a grammar point, vocabulary list, theme, title, or extra instructions.'
      );
    }
    const title = titleHint
      || topic
      || grammarPoint
      || (vocabList.length ? `Vocabulary: ${vocabList.slice(0, 4).join(', ')}` : '')
      || 'Practice worksheet';
    return {
      url: '',
      title,
      skillHint: 'reading',
      text: '',
      clipped: false,
      wordCount: 0,
      media: false,
      transcriptFound: false,
      transcriptionMode: false,
      topicOnly: true,
      suggestionsOnly: true,
      vocabList,
      grammarPoint,
      theme: topic,
      imageUrl: '',
      youtubeId: '',
      warning: '',
    };
  }

  const source = await loadSource({
    url: body?.url,
    videoUrl: body?.videoUrl,
    pastedText: body?.pastedText,
    titleHint: body?.title,
    pdfText,
    topic: body?.topic,
    allowTopicOnly,
    transcriptionMode: Boolean(body?.transcriptionMode || body?.videoUrl),
    preferredLang: normalizeLanguage(body?.language || 'en'),
  });
  if (vocabList.length) source.vocabList = vocabList;
  if (grammarPoint) source.grammarPoint = grammarPoint;
  if (suggestionsOnly) source.suggestionsOnly = true;
  if (topic) source.theme = topic;
  return source;
}

app.get('/api/health', (_req, res) => {
  const forced = String(process.env.CURSOR_AGENT_RUNTIME || '').toLowerCase();
  const agentRuntime = forced === 'local'
    ? 'local'
    : (forced === 'cloud' || process.env.RENDER ? 'cloud' : 'local');
  res.json({
    ok: true,
    cursorConfigured: Boolean(apiKey()),
    agentRuntime,
    render: Boolean(process.env.RENDER),
    googleDriveConfigured: Boolean((process.env.GOOGLE_CLIENT_ID || '').trim()),
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    googleClientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  });
});

app.get('/api/saved-lessons', async (_req, res) => {
  try {
    res.json({ items: await listSavedLessons() });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not list saved worksheets.' });
  }
});

app.get('/api/saved-lessons/:id', async (req, res) => {
  try {
    res.json(await getSavedLesson(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error.message || 'Saved worksheet not found.' });
  }
});

app.post('/api/saved-lessons', async (req, res) => {
  try {
    const meta = await saveLesson({
      id: req.body?.id,
      title: req.body?.title,
      payload: req.body?.payload,
    });
    res.json(meta);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not save the worksheet.' });
  }
});

app.delete('/api/saved-lessons/:id', async (req, res) => {
  try {
    res.json(await deleteSavedLesson(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error.message || 'Saved worksheet not found.' });
  }
});

app.post('/api/source', async (req, res) => {
  try {
    const source = await sourceFromRequest(req.body, { allowTopicOnly: false });
    res.json(source);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not read that source.' });
  }
});

app.post('/api/topic-images', async (req, res) => {
  try {
    const query = String(req.body?.query || req.body?.imageSearch || req.body?.topic || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Enter a short photo search phrase.' });
    }
    const language = String(req.body?.language || 'en');
    const images = await findTopicImages({
      title: req.body?.title || query,
      topic: query,
      imageSearch: query,
      sourceTitle: req.body?.sourceTitle || '',
      language,
      youtubeId: req.body?.youtubeId || '',
      limit: Math.min(8, Number(req.body?.limit) || 6),
      timeoutMs: 20000,
    });
    res.json({ images, query });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not find photos.' });
  }
});

app.post('/api/fetch-image', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (!url) return res.status(400).json({ error: 'Paste an image link.' });
    const language = String(req.body?.language || 'en');
    const image = await imageFromUrl(url, {
      language,
      alt: req.body?.alt || '',
      timeoutMs: 15000,
    });
    if (!image?.dataUrl) {
      return res.status(400).json({ error: 'Could not download that image. Try another link or upload a file.' });
    }
    res.json({ image });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not download that image.' });
  }
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJobStatus(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found. It may have expired — try creating the worksheet again.' });
  }
  res.json(job);
});

app.get('/api/jobs/:id/result', (req, res) => {
  const job = getJobResult(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found. It may have expired — try creating the worksheet again.' });
  }
  if (job.status === 'error') {
    return res.status(500).json({ error: job.error || 'Job failed' });
  }
  if (job.status !== 'done') {
    return res.status(409).json({ error: job.error || 'Job is not finished yet.', status: job.status, stage: job.stage });
  }
  res.json(job.result);
});

app.post('/api/create-lesson', async (req, res) => {
  const key = requireApiKey(res);
  if (!key) return;

  const body = req.body || {};
  if (!body.url && !body.videoUrl && !body.pastedText && !body.topic && !body.pdfBase64) {
    return res.status(400).json({
      error: 'Add a video link, article link, pasted text, PDF, or a topic first.',
    });
  }
  if (!normalizeTasks(body.tasks).length) {
    return res.status(400).json({ error: 'Tick at least one task type.' });
  }

  // Return immediately so reverse proxies (e.g. Render ~60s limit) do not cut the AI call.
  const job = startJob(async (update) => buildLessonPayload(body, key, update));
  res.status(202).json({ jobId: job.id, status: job.status });
});

app.post('/api/create-slides', async (req, res) => {
  const incomingLesson = req.body?.lesson;
  let source = req.body?.source && (req.body.source.text || req.body.source.title || req.body.source.topicOnly)
    ? req.body.source
    : null;
  if (!source) {
    try {
      source = await sourceFromRequest(req.body, { allowTopicOnly: true });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Could not read that source.' });
    }
  }

  if (!incomingLesson && !source.text && !source.topicOnly && !source.suggestionsOnly) {
    return res.status(400).json({
      error: source.warning || 'No source text. Paste the article, upload a PDF, or enter a topic.',
      source,
    });
  }

  try {
    const includeSourceOnSlides = req.body?.includeSourceOnSlides !== false;
    const includeTopicImage = req.body?.includeTopicImage !== false && Boolean(
      req.body?.includeTopicImage || incomingLesson?.topicImage
    );
    const language = normalizeLanguage(req.body?.language || incomingLesson?.language);
    const selectedTasks = req.body?.tasks || incomingLesson?.includedTasks;
    let lesson;
    if (incomingLesson) {
      lesson = prepareLessonAnswers(incomingLesson, source?.text);
    } else {
      const apiKey = requireApiKey(res);
      if (!apiKey) return;
      lesson = prepareLessonAnswers(
        await generateJson(
          buildLessonPrompt({
            source,
            cefr: req.body?.cefr || 'auto',
            adapt: Boolean(req.body?.adapt),
            adaptTarget: req.body?.adaptTarget || null,
            extraInstructions: req.body?.extraInstructions,
            tasks: selectedTasks,
            includeSourceOnWorksheet: true,
            language,
            grammarPoint: req.body?.grammarPoint || incomingLesson?.grammarFocus || '',
            transcriptionMode: Boolean(req.body?.transcriptionMode || source?.transcriptionMode),
          }),
          { apiKey, cwd: __dirname }
        ),
        source.text
      );
    }
    if (lesson) lesson.language = language;
    const deck = lessonToDeck(lesson, source || {}, {
      includeSourceOnSlides,
      language,
      tasks: selectedTasks,
      preserveOrder: true,
    });
    const prepared = prepareDeckAnswers(overlayLessonAnswers(deck, lesson), {
      spreadChoices: false,
      sourceText: source?.text,
      lesson,
    });
    if (prepared) prepared.language = language;
    const topicImage = lesson.topicImage || await topicImageFor({
      source,
      lesson,
      language,
      include: includeTopicImage || Boolean(req.body?.includeTopicImage),
      extraTopic: req.body?.topic,
    });
    attachTopicImage(lesson, topicImage);
    attachTopicImage(prepared, topicImage);
    res.json({
      deck: prepared,
      lesson,
      source,
      language,
    });
  } catch (error) {
    console.error('Slide generation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to create the slides.',
      source,
    });
  }
});

} // registerWorksheetMakerRoutes

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const PORT = Number(process.env.PORT) || 3050;
  const app = express();
  app.use(createWorksheetMakerRouter());
  app.listen(PORT, '0.0.0.0', () => {
    const runtime = process.env.CURSOR_AGENT_RUNTIME
      || (process.env.RENDER ? 'cloud (RENDER)' : 'local');
    console.log(`Lesson Creator running at http://localhost:${PORT}`);
    console.log(apiKey() ? 'CURSOR_API_KEY: loaded' : 'CURSOR_API_KEY: MISSING — check .env in this folder');
    console.log(`Agent runtime: ${runtime}`);
  });
}

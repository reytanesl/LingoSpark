import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVED_DIR = path.join(__dirname, '..', 'lessons', 'saved');

function slugify(text) {
  return String(text || 'lesson')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'lesson';
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function ensureDir() {
  await fs.mkdir(SAVED_DIR, { recursive: true });
}

function filePath(id) {
  const safe = String(id || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe || safe !== id) throw new Error('Invalid saved lesson id.');
  return path.join(SAVED_DIR, `${safe}.json`);
}

function metaFromRecord(record, id) {
  const lesson = record?.payload?.lesson || {};
  return {
    id,
    title: record?.title || lesson.title || 'Lesson',
    cefr: lesson.cefr || '',
    skill: lesson.skill || '',
    language: record?.payload?.language || lesson.language || 'en',
    savedAt: record?.savedAt || '',
    updatedAt: record?.updatedAt || record?.savedAt || '',
  };
}

export async function listSavedLessons() {
  await ensureDir();
  const names = await fs.readdir(SAVED_DIR);
  const items = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const id = name.slice(0, -5);
    try {
      const raw = await fs.readFile(path.join(SAVED_DIR, name), 'utf8');
      const record = JSON.parse(raw);
      items.push(metaFromRecord(record, id));
    } catch {
      /* skip broken files */
    }
  }
  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return items;
}

export async function getSavedLesson(id) {
  const raw = await fs.readFile(filePath(id), 'utf8');
  const record = JSON.parse(raw);
  return { ...metaFromRecord(record, id), payload: record.payload };
}

function worksheetFingerprint(payload, title = '') {
  const lesson = payload?.lesson || {};
  const source = payload?.source || {};
  const src = String(
    source.videoUrl
    || source.youtubeId
    || source.url
    || source.articleUrl
    || lesson.sourceUrl
    || lesson.youtubeId
    || ''
  ).trim().toLowerCase();
  const topic = String(source.theme || source.title || lesson.themes?.[0] || '').trim().toLowerCase();
  const named = String(title || lesson.title || '').trim().toLowerCase();
  const lang = String(payload?.language || lesson.language || 'en').toLowerCase();
  const skill = String(lesson.skill || '').toLowerCase();
  return [named, src || topic, lang, skill].join('||');
}

async function findSavedIdByFingerprint(fingerprint) {
  const needle = String(fingerprint || '');
  if (!needle) return '';
  const items = await listSavedLessons();
  let best = null;
  for (const item of items) {
    try {
      const full = await getSavedLesson(item.id);
      const fp = worksheetFingerprint(full.payload, full.title);
      if (fp !== needle) continue;
      if (!best || String(full.updatedAt || '') > String(best.updatedAt || '')) best = full;
    } catch {
      /* skip */
    }
  }
  return best?.id || '';
}

export async function saveLesson({ id, title, payload } = {}) {
  if (!payload?.lesson) throw new Error('Nothing to save — create a worksheet first.');
  await ensureDir();
  const now = new Date().toISOString();
  const resolvedTitle = String(title || payload.lesson.title || 'Lesson').trim() || 'Lesson';
  let recordId = id;
  let savedAt = now;

  if (recordId) {
    try {
      const existing = JSON.parse(await fs.readFile(filePath(recordId), 'utf8'));
      savedAt = existing.savedAt || now;
    } catch {
      recordId = '';
    }
  }

  if (!recordId) {
    recordId = await findSavedIdByFingerprint(worksheetFingerprint(payload, resolvedTitle));
    if (recordId) {
      try {
        const existing = JSON.parse(await fs.readFile(filePath(recordId), 'utf8'));
        savedAt = existing.savedAt || now;
      } catch {
        recordId = '';
      }
    }
  }

  if (!recordId) {
    recordId = `${stamp()}-${slugify(resolvedTitle)}`;
  }

  const record = {
    title: resolvedTitle,
    savedAt,
    updatedAt: now,
    payload,
  };
  await fs.writeFile(filePath(recordId), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return metaFromRecord(record, recordId);
}

export async function deleteSavedLesson(id) {
  await fs.unlink(filePath(id));
  return { ok: true, id };
}

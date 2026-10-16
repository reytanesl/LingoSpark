/**
 * Durable browser store for worksheets. Survives Render redeploys / free-tier disk wipes.
 */

const DB_NAME = 'lesson-creator';
const DB_VERSION = 1;
const STORE = 'worksheets';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open local worksheet store.'));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Local worksheet store failed.'));
    tx.onabort = () => reject(tx.error || new Error('Local worksheet store aborted.'));
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Local worksheet store request failed.'));
  });
}

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

function metaFromRecord(record) {
  const lesson = record?.payload?.lesson || {};
  return {
    id: record.id,
    title: record?.title || lesson.title || 'Lesson',
    cefr: lesson.cefr || '',
    skill: lesson.skill || '',
    language: record?.payload?.language || lesson.language || 'en',
    savedAt: record?.savedAt || '',
    updatedAt: record?.updatedAt || record?.savedAt || '',
    local: true,
  };
}

/** Stable key so re-saving the same worksheet updates one copy instead of adding another. */
export function worksheetFingerprint(payload, title = '') {
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

export async function findBrowserLessonIdByFingerprint(fingerprint) {
  const needle = String(fingerprint || '');
  if (!needle) return '';
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const rows = await reqToPromise(tx.objectStore(STORE).getAll());
  await txDone(tx);
  db.close();
  let best = null;
  for (const row of rows || []) {
    const fp = worksheetFingerprint(row.payload, row.title);
    if (fp !== needle) continue;
    if (!best || String(row.updatedAt || '') > String(best.updatedAt || '')) best = row;
  }
  return best?.id || '';
}

/** Keep the newest record per fingerprint; delete older duplicates. */
export async function dedupeBrowserLessons() {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const rows = await reqToPromise(store.getAll());
  const byFp = new Map();
  const removed = [];
  for (const row of rows || []) {
    const fp = worksheetFingerprint(row.payload, row.title);
    const prev = byFp.get(fp);
    if (!prev) {
      byFp.set(fp, row);
      continue;
    }
    const newer = String(row.updatedAt || '') >= String(prev.updatedAt || '') ? row : prev;
    const older = newer === row ? prev : row;
    byFp.set(fp, newer);
    store.delete(older.id);
    removed.push(older.id);
  }
  await txDone(tx);
  db.close();
  return removed;
}

export async function listBrowserLessons() {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const rows = await reqToPromise(tx.objectStore(STORE).getAll());
  await txDone(tx);
  db.close();
  const items = (rows || []).map(metaFromRecord);
  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return items;
}

export async function getBrowserLesson(id) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const record = await reqToPromise(tx.objectStore(STORE).get(String(id || '')));
  await txDone(tx);
  db.close();
  if (!record) throw new Error('Saved worksheet not found locally.');
  return { ...metaFromRecord(record), payload: record.payload };
}

export async function saveBrowserLesson({ id, title, payload } = {}) {
  if (!payload?.lesson) throw new Error('Nothing to save — create a worksheet first.');
  const now = new Date().toISOString();
  const resolvedTitle = String(title || payload.lesson.title || 'Lesson').trim() || 'Lesson';
  let recordId = id ? String(id) : '';
  let savedAt = now;

  if (recordId) {
    try {
      const existing = await getBrowserLesson(recordId);
      savedAt = existing.savedAt || now;
    } catch {
      recordId = '';
    }
  }
  if (!recordId) {
    // Reuse an existing copy of the same worksheet instead of creating a second one.
    recordId = await findBrowserLessonIdByFingerprint(worksheetFingerprint(payload, resolvedTitle));
    if (recordId) {
      try {
        const existing = await getBrowserLesson(recordId);
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
    id: recordId,
    title: resolvedTitle,
    savedAt,
    updatedAt: now,
    payload,
  };

  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(record);
  await txDone(tx);
  db.close();
  // Drop any older duplicates that share the same worksheet identity.
  await dedupeBrowserLessons();
  return metaFromRecord(record);
}

export async function deleteBrowserLesson(id) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(String(id || ''));
  await txDone(tx);
  db.close();
  return { ok: true, id };
}

/** Put a full server record into the browser store (import / sync). */
export async function upsertBrowserLesson(record) {
  if (!record?.id || !record?.payload?.lesson) return null;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const existing = await reqToPromise(store.get(record.id));
  const next = {
    id: record.id,
    title: record.title || record.payload.lesson.title || 'Lesson',
    savedAt: record.savedAt || existing?.savedAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.savedAt || new Date().toISOString(),
    payload: record.payload,
  };
  // Keep the newer copy if both exist.
  if (existing && String(existing.updatedAt) > String(next.updatedAt)) {
    await txDone(tx);
    db.close();
    return metaFromRecord(existing);
  }
  store.put(next);
  await txDone(tx);
  db.close();
  return metaFromRecord(next);
}

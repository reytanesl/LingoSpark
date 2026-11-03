import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import { createWorksheetMakerRouter } from './worksheet-maker/server.js';
import { PUBLIC_LIB_MODULES, isWorksheetPublicPath } from './worksheet-maker/static-allowlist.js';

const dir = new URL('./worksheet-maker/', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, dir), 'utf8');

function browserModules() {
  const seen = new Set();
  const walk = (rel, src) => {
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*'(\.\.?\/[^']+\.js)'/g)) {
      const next = new URL(m[1], new URL(rel, dir)).pathname.split('/worksheet-maker/')[1];
      if (seen.has(next)) continue;
      seen.add(next);
      walk(next, read(next));
    }
  };
  walk('index.html', read('index.html'));
  return seen;
}

test('allowlist = exactly the lib modules index.html imports (transitively); none is server-only', () => {
  const mods = browserModules();
  assert.deepEqual([...mods].sort(), [...PUBLIC_LIB_MODULES].sort());
  for (const rel of mods) {
    const src = read(rel);
    assert.doesNotMatch(src, /from\s+'(?:node:)?(?:fs|path|os|child_process|crypto|url|fs\/promises)'|from\s+'(?:jsdom|@cursor\/sdk|@mozilla\/readability|unpdf|dotenv|express)'|process\.env/, rel);
  }
});

test('router serves browser files and 404s server code, package files, docs, fixtures, dotfiles', async () => {
  const app = express();
  app.use('/worksheet-maker', createWorksheetMakerRouter());
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/worksheet-maker`;
  try {
    for (const p of ['/', '/index.html', '/assets/lingospark-logo.png', ...[...PUBLIC_LIB_MODULES].map((m) => `/${m}`)]) {
      assert.equal((await fetch(base + p)).status, 200, p);
    }
    for (const p of ['/server.js', '/static-allowlist.js', '/package.json', '/package-lock.json', '/AGENTS.md', '/README.md',
      '/lib/generate.js', '/lib/generate-worker.js', '/lib/load-env.js', '/lib/jobs.js', '/lib/fetch-source.js', '/lib/media-search.js',
      '/lib/saved-lessons.js', '/lib/topic-image.js', '/lib/pdf-text.js', '/lib/extract-json.js', '/lib/slides-prompt.js', '/lib/polish-primary-prompt.js',
      '/.env', '/.env.example', '/node_modules/express/package.json', '/lib/', '/assets/', '/%2e%2e/server.js', '/lib/../server.js']) {
      assert.equal((await fetch(base + p)).status, 404, p);
    }
  } finally { server.close(); }
});

test('path checks', () => {
  assert.equal(isWorksheetPublicPath('/lib/ui-strings.js'), true);
  assert.equal(isWorksheetPublicPath('/lib/media-search.js'), false);
  assert.equal(isWorksheetPublicPath('/assets/x.md'), false);
  assert.equal(isWorksheetPublicPath('/.git/config'), false);
});

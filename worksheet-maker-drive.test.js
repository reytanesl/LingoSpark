import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyGisError, classifyDriveStatus, DriveError, loadGoogleDriveConfig, googleDriveConfigured } from './worksheet-maker/lib/google-drive.js';
import { t } from './worksheet-maker/lib/ui-strings.js';

test('Drive config is fetched relative to the /worksheet-maker mount', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ googleClientId: 'abc.apps.googleusercontent.com' }) };
  };
  await loadGoogleDriveConfig();
  assert.deepEqual(calls, ['api/config']);
  assert.equal(googleDriveConfigured(), true);
});

test('GIS errors map to stable codes', () => {
  assert.equal(classifyGisError({ type: 'popup_failed_to_open' }), 'popup_blocked');
  assert.equal(classifyGisError({ type: 'popup_closed' }), 'cancelled');
  assert.equal(classifyGisError({ error: 'access_denied' }), 'cancelled');
  assert.equal(classifyGisError({ error: 'invalid_client' }), 'origin');
  assert.equal(classifyGisError({ error: 'weird' }), 'auth_failed');
  assert.equal(new DriveError('popup_blocked').code, 'popup_blocked');
});

test('Drive HTTP status maps to codes', () => {
  assert.equal(classifyDriveStatus(401), 'not_connected');
  assert.equal(classifyDriveStatus(403), 'forbidden');
  assert.equal(classifyDriveStatus(429), 'rate_limited');
  assert.equal(classifyDriveStatus(500), 'upload_failed');
});

test('every Drive error key has EN and PL strings', () => {
  const html = fs.readFileSync(new URL('./worksheet-maker/index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/:\s*'(errDrive\w+)'/g)].map((m) => m[1]);
  assert.ok(keys.includes('errDrivePopupBlocked'));
  for (const k of keys) {
    assert.notEqual(t('en', k), k, `en ${k}`);
    assert.notEqual(t('pl', k), t('en', k), `pl ${k}`);
  }
});

test('index.html signs in to Drive before building the PDF', () => {
  const html = fs.readFileSync(new URL('./worksheet-maker/index.html', import.meta.url), 'utf8');
  const fn = html.slice(html.indexOf('async function ensureDriveReady'));
  assert.ok(fn.indexOf('connectGoogleDrive()') < fn.indexOf('function driveErrorMessage'));
  assert.ok(!/fetch\('\/api\/config'\)/.test(fs.readFileSync(new URL('./worksheet-maker/lib/google-drive.js', import.meta.url), 'utf8')));
});

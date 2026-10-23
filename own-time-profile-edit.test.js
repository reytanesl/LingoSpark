import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeOwnTimeProfileInput } from './db.js';
import { sanitizeOwnTimeAvatar, OWN_TIME_AVATAR_TONES } from './own-time-profiles.js';

const ot = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
const srv = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');
const db = fs.readFileSync(new URL('./db.js', import.meta.url), 'utf8');

test('profile input accepts name + avatar (null = keep), sanitised', () => {
    const p = sanitizeOwnTimeProfileInput({ age: 14, cefr: 'b1', name: '  Ola <b> ', avatar: 'TEAL' });
    assert.equal(p.name, 'Ola b');
    assert.equal(p.avatar, 'teal');
    const q = sanitizeOwnTimeProfileInput({ age: 14 });
    assert.equal(q.name, null);
    assert.equal(q.avatar, null);
    assert.equal(sanitizeOwnTimeAvatar('purple-hack'), '');
    assert.ok(OWN_TIME_AVATAR_TONES.includes('amber'));
});

test('db: avatar column migration; update keeps name/avatar/voice when not sent and never touches progress', () => {
    assert.match(db, /ADD COLUMN IF NOT EXISTS avatar TEXT NOT NULL DEFAULT ''/);
    const upd = db.slice(db.indexOf('export async function upsertOwnTimeProfile'), db.indexOf('export async function listOwnTimeLessons'));
    assert.match(upd, /name = COALESCE\(\$14, name\), avatar = COALESCE\(\$15, avatar\)/);
    assert.doesNotMatch(upd, /progress\s*=/);
});

test('server validates the full-profile PUT (name not empty, age 6–99)', () => {
    const r = srv.slice(srv.indexOf("app.put('/api/own-time/profile'"), srv.indexOf("app.get('/api/own-time/lessons'"));
    assert.match(r, /requireWritingAccess/);
    assert.match(r, /code: 'name'/);
    assert.match(r, /code: 'age'/);
});

test('client: Edytuj profil from the dropdown and from each picker card; prefilled full form; returns to the set', () => {
    assert.match(ot, /data-pact="edit"/);
    assert.match(ot, /else if \(act === 'edit'\) editProfile\(id\)/);
    assert.match(ot, /data-ppick-edit="\$\{p\.id\}"/);
    assert.match(ot, /async function editProfile\(id\)[\s\S]*?switchProfile\(id\)/);
    assert.match(ot, /id="ot-pname"/);
    assert.match(ot, /name="ot-avatar"/);
    assert.match(ot, /id="ot-level-note"/);
    assert.match(ot, /function profileFormError/);
    assert.match(ot, /if \(wasEdit\) leaveEdit\(\)/);
    assert.match(ot, /Zmiany obowiązują od następnego zestawu/);
});

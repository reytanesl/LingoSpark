import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OWN_TIME_PROFILE_LIMIT, OWN_TIME_ADMIN_PROFILE_LIMIT, ownTimeProfileLimit } from './own-time-profiles.js';

test('admin gets 15 own-time profiles, others keep 5', () => {
    assert.equal(OWN_TIME_PROFILE_LIMIT, 5);
    assert.equal(OWN_TIME_ADMIN_PROFILE_LIMIT, 15);
    assert.equal(ownTimeProfileLimit(), 5);
    assert.equal(ownTimeProfileLimit({ isAdmin: false }), 5);
    assert.equal(ownTimeProfileLimit({ isAdmin: true }), 15);
});

test('server passes admin-aware limit to every profile list/create call', () => {
    const s = readFileSync(new URL('./server.js', import.meta.url), 'utf8');
    assert.match(s, /ownTimeProfileLimit\(\{\s*isAdmin:\s*isAdminEmail\(req\.user\?\.email\)/);
    const calls = s.match(/(listOwnTimeProfiles|createOwnTimeProfile)\([^)]*\)/g) || [];
    assert.ok(calls.length >= 2);
    for (const c of calls) assert.match(c, /otLimit\(req\)/, c);
});

test('db enforces the passed limit', () => {
    const d = readFileSync(new URL('./db.js', import.meta.url), 'utf8');
    assert.match(d, /createOwnTimeProfile\(userId, body = \{\}, \{ limit = OWN_TIME_PROFILE_LIMIT \} = \{\}\)/);
    assert.match(d, />= limit/);
});

test('picker uses compact grid for many profiles', () => {
    const j = readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
    assert.match(j, /ot-ppicker-grid--many/);
    const h = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.match(h, /\.ot-ppicker-grid\.ot-ppicker-grid--many \{ grid-template-columns: 1fr 1fr/);
});

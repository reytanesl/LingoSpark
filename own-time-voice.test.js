import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeOwnTimeProfileInput, sanitizeOwnTimeVoice } from './db.js';

test('voice is sanitised; omitted voice keeps the saved one (null)', () => {
    assert.equal(sanitizeOwnTimeVoice('  Google UK English Female  '), 'Google UK English Female');
    assert.equal(sanitizeOwnTimeVoice('<b>x</b>\u0007'), 'bx/b');
    assert.equal(sanitizeOwnTimeVoice('a'.repeat(300)).length, 120);
    assert.equal(sanitizeOwnTimeProfileInput({}).voice, null);
    assert.equal(sanitizeOwnTimeProfileInput({ voice: '' }).voice, '');
    assert.equal(sanitizeOwnTimeProfileInput({ voice: 'Daniel' }).voice, 'Daniel');
});

test('db: voice column migration and COALESCE update', () => {
    const src = fs.readFileSync(new URL('./db.js', import.meta.url), 'utf8');
    assert.match(src, /ADD COLUMN IF NOT EXISTS voice TEXT/);
    assert.match(src, /voice = COALESCE\(\$13, voice\)/);
    assert.match(src, /voice: String\(row\.voice \|\| ''\)/);
});

test('client: read-aloud is feature-detected, toggles, stops on repaint and filters target-language voices', () => {
    const src = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
    assert.match(src, /'speechSynthesis' in window/);
    assert.match(src, /ttsSupported\(\) \? `<button type="button" class="ot-speak"/);
    assert.match(src, /stopSpeaking\(\); \/\/ leaving/);
    assert.match(src, /startsWith\(pre\)/);
    assert.match(src, /localStorage\.setItem\(VOICE_KEY\(profileId\)/);
    assert.match(src, /if \(want && !list\.some\(\(v\) => v\.name === want\)\) sel\.value = ''/);
});

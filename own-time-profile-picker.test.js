import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('initial setup shows the profile picker (not in edit mode) instead of the dropdown bar', () => {
    assert.match(src, /function renderPick\(\) \{\s*return `<div class="ot-card ot-pickscreen">\$\{profilePickerHtml\(\)\}/);
    assert.doesNotMatch(src.slice(src.indexOf('function renderOnboard'), src.indexOf('function profileIdentityHtml')), /profilePickerHtml\(\)/);
    assert.match(src, /view !== 'lesson' && view !== 'onboard' && view !== 'pick' && view !== 'edit' \? profileBarHtml\(\)/);
});

test('picker reuses the profile APIs: switch (activate + resume) and create', () => {
    const fn = src.slice(src.indexOf('function bindProfilePicker'), src.indexOf('function readForm'));
    assert.match(fn, /pickProfile\(Number\(card\.dataset\.ppick\)\)/);
    assert.match(src, /async function pickProfile\(id\)[\s\S]*?switchProfile\(id\)/);
    assert.match(fn, /profileAction\('create', null, v\)/);
    assert.match(src, /async function switchProfile[\s\S]*?\/activate[\s\S]*?loadActive\(\)/);
});

test('"+ Nowy profil" respects the profile cap', () => {
    const fn = src.slice(src.indexOf('function profilePickerHtml'), src.indexOf('function bindProfilePicker'));
    assert.match(fn, /const full = profiles\.length >= profileLimit/);
    assert.match(fn, /data-ppick-new\$\{full \? ' disabled' : ''\}/);
});

test('mobile: picker 2 columns, lesson title on its own row, tighter lexical sets', () => {
    assert.match(css, /\.ot-ppicker-grid \{ grid-template-columns: 1fr 1fr;/);
    assert.match(css, /\.ot-lesson-head \.ot-head-text \{ flex: 1 1 100%; \}/);
    assert.match(css, /\.ot-fmt--lexical_set \.ot-q-line \{ line-height: 1\.55; \}/);
});

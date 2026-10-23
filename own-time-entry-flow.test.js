import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');

test('every entry (tile, deep link, reload) starts at the "Kto ćwiczy?" step, even with one profile', () => {
    const i0 = src.indexOf('async function initOwnTime'); const init = src.slice(i0, i0 + 2000);
    assert.match(init, /if \(profiles\.length\) view = 'pick';/);
    assert.match(src, /if \(view === 'pick'\) html = renderPick\(\);/);
});
test('picking a profile opens its settings (or setup when new); resume state is kept', () => {
    const fn = src.slice(src.indexOf('async function pickProfile'), src.indexOf('function bindProfilePicker'));
    assert.match(fn, /if \(!profile\) \{ view = 'onboard'/);
    assert.match(fn, /editReturn = lesson \?/);
    assert.match(fn, /view = 'edit'/);
});
test('settings page: Zmień profil link, primary Kontynuuj zestaw / Zacznij, secondary Tylko zapisz', () => {
    assert.match(src, /data-change-profile/);
    assert.match(src, /lesson \? `[^`]*Kontynuuj zestaw[^`]*` : `[^`]*Zacznij/);
    assert.match(src, /id="ot-save-only"/);
    assert.match(src, /if \(wasEdit && mode === 'go'\) \{\s*if \(lesson\) \{[^\n]*leaveEdit\(\)[\s\S]*?startLesson\(\); return;/);
});
test('Od nowa reset is untouched', () => {
    assert.match(src, /function resetCurrentSet\(\)/);
});

test('"▶ Kontynuuj" shortcut on cards with a set in progress goes straight back into the set', () => {
    assert.match(src, /\$\{p\.progress \? `<button type="button" class="ot-ppick-go" data-ppick-go=/);
    assert.match(src, /if \(go\) \{ continueProfile\(Number\(go\.dataset\.ppickGo\)\); return; \}/);
    const fn = src.slice(src.indexOf('async function continueProfile'), src.indexOf('function bindProfilePicker'));
    assert.match(fn, /await switchProfile\(id\)/);
    assert.match(fn, /view = entryResumeView === 'feedback' \? 'feedback' : 'lesson'/);
    assert.match(src, /entryResumeView = resumed \? view : null;/);
});

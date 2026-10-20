// Word Sets — "Import from photo or list" panel (browser only; needs wordset-import-core.js).
// Flow: choose photo / typed list -> AI extracts terms + learner definitions -> review & edit cards
// -> create a new set or append to an existing one as consecutive cards (duplicates skipped).
(function () {
    'use strict';
    const C = window.WordSetImportCore;
    const LEVEL_KEY = 'lingospark.wsImport.level';
    let st = null;

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const host = () => document.getElementById('ws-import');
    const loggedIn = () => !!(window.authState && window.authState.user && window.authState.user.id);
    // Same check the Writing Suite uses on the client; the server enforces it with requireWritingAccess (403).
    function hasPlan() { return !!(window.authState && (window.authState.hasAccess || window.authState.isAdmin)); }
    const hasAi = hasPlan;

    function loadLevel() { try { return C.normaliseLevel(localStorage.getItem(LEVEL_KEY)); } catch { return 'B1'; } }
    function saveLevel(l) { try { localStorage.setItem(LEVEL_KEY, l); } catch { /* ignore */ } }

    function setPane(on) {
        const h = host();
        const browse = document.getElementById('mysets-browse');
        if (h) h.hidden = !on;
        if (browse) browse.style.display = on ? 'none' : '';
    }

    async function api(url, body) {
        const res = await fetch(url, {
            method: body ? 'POST' : 'GET',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            credentials: 'same-origin',
            body: body ? JSON.stringify(body) : undefined,
        });
        let data = {};
        try { data = await res.json(); } catch { /* ignore */ }
        if (!res.ok) {
            const err = new Error(data.error || (res.status === 403 ? 'AI import is part of the Writing Suite plan.' : `Request failed (${res.status})`));
            err.status = res.status;
            throw err;
        }
        return data;
    }

    function open(opts = {}) {
        if (!loggedIn()) { if (typeof window.openAuthModal === 'function') window.openAuthModal('login'); return; }
        if (!hasPlan()) { if (typeof window.openPaywallModal === 'function') window.openPaywallModal(); return; }
        st = {
            step: 'source', mode: opts.mode || 'photo', image: null, text: '', level: loadLevel(),
            items: [], dest: 'new', setId: opts.setId ? String(opts.setId) : '', newName: '', category: '', className: '',
            sets: [], existing: new Map(), busy: false, status: null, result: null,
        };
        if (opts.setId) st.dest = 'existing';
        setPane(true);
        render();
        loadSets();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function close() {
        st = null;
        setPane(false);
        const h = host();
        if (h) h.innerHTML = '';
        if (typeof window.loadMySets === 'function') window.loadMySets();
    }

    async function loadSets() {
        try {
            const data = await api('/api/word-sets');
            if (!st) return;
            st.sets = (data.sets || []).map((s) => ({ id: String(s.id), name: s.name, count: s.item_count || 0 }));
            if (st.dest === 'existing' && st.setId) await loadExisting(st.setId);
            if (st.step === 'review') render(); // the source step does not show sets; don't swap its file inputs
        } catch { /* list stays empty; "new set" still works */ }
    }

    async function loadExisting(id) {
        if (!id || st.existing.has(id)) return;
        const data = await api(`/api/word-sets/${encodeURIComponent(id)}`);
        st.existing.set(id, (data.set && data.set.items ? data.set.items : []).map((it) => it.term));
    }

    // ---------- photo handling ----------
    function decode(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { resolve({ img, url }); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This browser cannot open that image format. Take a screenshot or save it as JPG/PNG and try again.')); };
            img.src = url;
        });
    }

    async function downscale(file) {
        const { img, url } = await decode(file);
        try {
            const attempts = [[C.LIMITS.maxSide, C.LIMITS.jpegQuality], [1280, 0.72], [1024, 0.65]];
            for (const [side, q] of attempts) {
                const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
                const w = Math.max(1, Math.round(img.naturalWidth * scale));
                const h = Math.max(1, Math.round(img.naturalHeight * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', q);
                if (dataUrl.length < 1_900_000) return { dataUrl, width: w, height: h, name: file.name || 'photo' };
            }
            throw new Error('The photo is too detailed to upload. Crop it to the word list and try again.');
        } finally { URL.revokeObjectURL(url); }
    }

    async function onFile(input) {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file || !st) return;
        const okType = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name || '');
        if (!okType) return setStatus('error', 'Choose an image file (JPG, PNG, WebP or HEIC).');
        if (file.size > C.LIMITS.maxFileBytes) return setStatus('error', 'That file is over 15 MB. Choose a smaller photo.');
        setStatus('info', 'Preparing photo…');
        try {
            st.image = await downscale(file);
            setStatus(null);
        } catch (err) { setStatus('error', err.message); }
    }

    function setStatus(kind, text) { if (!st) return; st.status = kind ? { kind, text } : null; render(); }

    // ---------- actions ----------
    async function extract() {
        syncDom();
        if (st.mode === 'photo') {
            if (!st.image) return setStatus('error', 'Add a photo of the word list first.');
            if (!hasAi()) return setStatus('error', 'Photo import is part of the Writing Suite plan.');
            st.busy = true; setStatus('info', 'Reading the list and writing definitions… (usually 10–30 s)');
            try {
                const data = await api('/api/word-sets/import/extract', { image: { data: st.image.dataUrl, mimeType: 'image/jpeg', width: st.image.width, height: st.image.height }, level: st.level });
                toReview(data.items, data.note);
            } catch (err) { st.busy = false; setStatus('error', err.message); }
            return;
        }
        const items = C.parseTypedList(st.text);
        if (!items.length) return setStatus('error', 'Type or paste at least one word (one per line).');
        toReview(items, '');
        if (items.some((it) => !it.definition) && hasAi()) fillMissing();
    }

    function toReview(items, note) {
        st.busy = false;
        st.items = (items || []).map((it) => ({ term: it.term, definition: it.definition || '', fromSource: !!it.fromSource }));
        if (!st.items.length) st.items.push({ term: '', definition: '' });
        st.step = 'review';
        st.status = note ? { kind: 'info', text: note } : null;
        render();
    }

    async function fillMissing() {
        syncDom();
        const todo = st.items.filter((it) => it.term.trim() && !it.definition.trim());
        if (!todo.length) return;
        if (!hasAi()) return setStatus('error', 'AI definitions are part of the Writing Suite plan. Type the missing definitions instead.');
        st.busy = true; todo.forEach((it) => { it.loading = true; }); setStatus('info', `Writing ${todo.length} definition${todo.length === 1 ? '' : 's'}…`);
        try {
            for (let i = 0; i < todo.length; i += 30) {
                const chunk = todo.slice(i, i + 30);
                const data = await api('/api/word-sets/import/define', { terms: chunk.map((it) => it.term), level: st.level });
                const map = new Map((data.items || []).map((d) => [C.keyOf(d.term), d.definition]));
                chunk.forEach((it) => { if (!st || it.definition) return; it.definition = map.get(C.keyOf(C.cleanTerm(it.term))) || ''; });
            }
            st.busy = false; todo.forEach((it) => { it.loading = false; }); setStatus(null);
        } catch (err) { st.busy = false; todo.forEach((it) => { it.loading = false; }); setStatus('error', err.message); }
    }

    async function regenerate(i) {
        syncDom();
        const it = st.items[i];
        if (!it || !it.term.trim()) return;
        if (!hasAi()) return setStatus('error', 'AI definitions are part of the Writing Suite plan.');
        it.loading = true; render();
        try {
            const data = await api('/api/word-sets/import/define', { terms: [{ term: it.term, previous: it.definition }], level: st.level });
            const d = data.items && data.items[0] && data.items[0].definition;
            if (d) { it.definition = d; it.fromSource = false; }
            it.loading = false; setStatus(null);
        } catch (err) { it.loading = false; setStatus('error', err.message); }
    }

    function dupSet() {
        if (st.dest !== 'existing' || !st.setId) return new Set();
        return new Set((st.existing.get(st.setId) || []).map(C.keyOf));
    }

    async function save() {
        syncDom();
        const items = C.normaliseItems(st.items, C.LIMITS.setCap);
        if (!items.length) return setStatus('error', 'Add at least one term.');
        st.busy = true; setStatus('info', 'Saving…');
        try {
            if (st.dest === 'new') {
                const name = st.newName.trim();
                if (!name) { st.busy = false; return setStatus('error', 'Name the new set.'); }
                const data = await api('/api/word-sets', { name, items, category: st.category, className: st.className });
                st.result = { setId: data.set.id, setName: data.set.name, added: items.map((it, idx) => ({ term: it.term, position: idx })), skipped: [], itemCount: items.length, created: true };
            } else {
                if (!st.setId) { st.busy = false; return setStatus('error', 'Pick the set to add the cards to.'); }
                const data = await api(`/api/word-sets/${encodeURIComponent(st.setId)}/append-items`, { items });
                st.result = { setId: data.set.id, setName: data.set.name, added: data.added || [], skipped: data.skipped || [], itemCount: data.itemCount, created: false };
            }
            st.busy = false; st.step = 'done'; st.status = null; render();
        } catch (err) { st.busy = false; setStatus('error', err.message); }
    }

    function syncDom() {
        const h = host();
        if (!h || !st) return;
        const q = (sel) => h.querySelector(sel);
        if (q('#wsi-text')) st.text = q('#wsi-text').value;
        if (q('#wsi-name')) st.newName = q('#wsi-name').value;
        if (q('#wsi-category')) st.category = q('#wsi-category').value;
        if (q('#wsi-class')) st.className = q('#wsi-class').value;
        h.querySelectorAll('.wsi-row').forEach((row) => {
            const it = st.items[Number(row.dataset.i)];
            if (!it) return;
            it.term = row.querySelector('[data-f="term"]').value;
            const def = row.querySelector('[data-f="def"]').value;
            if (def !== it.definition) it.fromSource = false;
            it.definition = def;
        });
    }

    // ---------- rendering ----------
    function statusHtml() {
        if (!st.status) return '';
        const cls = st.status.kind === 'error' ? 'feedback error' : 'wsi-info';
        return `<p class="${cls}" role="status">${st.busy ? '<i class="fa-solid fa-spinner fa-spin"></i> ' : ''}${esc(st.status.text)}</p>`;
    }

    function levelSelect() {
        return `<label class="wsi-level">Definition level
            <select id="wsi-level" data-act="level">${C.LEVELS.map((l) => `<option value="${l}"${l === st.level ? ' selected' : ''}>${l}${l === 'B1' ? ' (simple)' : ''}</option>`).join('')}</select></label>`;
    }

    function renderSource() {
        const photo = st.mode === 'photo';
        const aiNote = '';
        return `
            <div class="wsi-tabs" role="tablist">
                <button type="button" role="tab" aria-selected="${photo}" class="wsi-tab${photo ? ' is-on' : ''}" data-act="mode" data-v="photo"><i class="fa-solid fa-camera"></i> Photo</button>
                <button type="button" role="tab" aria-selected="${!photo}" class="wsi-tab${!photo ? ' is-on' : ''}" data-act="mode" data-v="text"><i class="fa-solid fa-keyboard"></i> Typed list</button>
            </div>
            ${aiNote}
            ${photo ? `
                <p class="wsi-help">Photograph a word list, textbook page or whiteboard. Numbers and bullets are removed; phrases are kept. If the list already has translations or definitions, they are used.</p>
                <div class="wsi-drop">
                    ${st.image ? `<img class="wsi-preview" src="${st.image.dataUrl}" alt="Selected word list photo"><p class="wsi-file">${esc(st.image.name)} · ${st.image.width}×${st.image.height}px</p>` : '<i class="fa-regular fa-image wsi-drop-icon" aria-hidden="true"></i>'}
                    <div class="wsi-pick">
                        <label class="btn btn-blue"><i class="fa-solid fa-camera"></i> Take photo<input type="file" accept="image/*" capture="environment" data-act="file" hidden></label>
                        <label class="btn btn-outline"><i class="fa-solid fa-upload"></i> ${st.image ? 'Choose another' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" data-act="file" hidden></label>
                    </div>
                    <p class="wsi-limits">JPG, PNG, WebP or HEIC · up to 15 MB · up to ${C.LIMITS.maxItems} words per photo</p>
                </div>` : `
                <p class="wsi-help">One word or phrase per line. Add your own definition after <code>=</code>, <code> - </code>, <code>:</code> or a tab, or leave it out and let AI write a short one.</p>
                <textarea id="wsi-text" class="wsi-text" placeholder="1. run out of&#10;2. reliable = you can trust it&#10;3. take up">${esc(st.text)}</textarea>`}
            <div class="wsi-row-actions">
                ${levelSelect()}
                <button type="button" class="btn btn-blue" data-act="extract"${st.busy ? ' disabled' : ''}><i class="fa-solid fa-wand-magic-sparkles"></i> ${photo ? 'Read words' : 'Review list'}</button>
            </div>`;
    }

    function renderReview() {
        const dups = dupSet();
        const filled = st.items.filter((it) => it.term.trim()).length;
        const missing = st.items.filter((it) => it.term.trim() && !it.definition.trim()).length;
        const dupCount = st.items.filter((it) => it.term.trim() && dups.has(C.keyOf(C.cleanTerm(it.term)))).length;
        const rows = st.items.map((it, i) => {
            const dup = it.term.trim() && dups.has(C.keyOf(C.cleanTerm(it.term)));
            return `
            <div class="wsi-row${dup ? ' is-dup' : ''}" data-i="${i}">
                <div class="wsi-row-top">
                    <span class="ws-edit-num">${i + 1}</span>
                    ${dup ? '<span class="wsi-badge wsi-badge--dup"><i class="fa-solid fa-clone"></i> Already in set: will be skipped</span>' : ''}
                    ${it.fromSource ? '<span class="wsi-badge">From the list</span>' : ''}
                    <span class="wsi-row-tools">
                        <button type="button" class="wsi-icon" data-act="regen" data-i="${i}" title="Regenerate definition" aria-label="Regenerate definition ${i + 1}"${it.loading ? ' disabled' : ''}><i class="fa-solid fa-rotate${it.loading ? ' fa-spin' : ''}"></i></button>
                        <button type="button" class="wsi-icon" data-act="remove" data-i="${i}" title="Remove card" aria-label="Remove card ${i + 1}"><i class="fa-solid fa-xmark"></i></button>
                    </span>
                </div>
                <div class="ws-edit-fields">
                    <label class="ws-field"><input type="text" data-f="term" maxlength="${C.LIMITS.maxTerm}" value="${esc(it.term)}" placeholder="Term" aria-label="Term ${i + 1}"><span class="ws-field-label">Term</span></label>
                    <label class="ws-field"><textarea data-f="def" rows="1" maxlength="${C.LIMITS.maxDefinition}" placeholder="${it.loading ? 'Writing…' : 'Definition'}" aria-label="Definition ${i + 1}">${esc(it.definition)}</textarea><span class="ws-field-label">Definition</span></label>
                </div>
            </div>`;
        }).join('');
        const setOpts = st.sets.map((s) => `<option value="${esc(s.id)}"${s.id === st.setId ? ' selected' : ''}>${esc(s.name)} (${s.count})</option>`).join('');
        return `
            <p class="wsi-help"><strong>${filled}</strong> card${filled === 1 ? '' : 's'} found. Check the spelling, edit any definition, remove what you don't need.${missing ? ` <strong>${missing}</strong> still need a definition.` : ''}</p>
            <div class="wsi-row-actions wsi-row-actions--top">
                ${levelSelect()}
                ${missing ? `<button type="button" class="btn btn-outline" data-act="fill"${st.busy ? ' disabled' : ''}><i class="fa-solid fa-wand-magic-sparkles"></i> Write missing definitions</button>` : ''}
            </div>
            <div class="wsi-rows">${rows}</div>
            <button type="button" class="ws-add-card" data-act="add"><i class="fa-solid fa-plus"></i> Add a card</button>
            <fieldset class="wsi-dest">
                <legend>Save to</legend>
                <label class="wsi-radio"><input type="radio" name="wsi-dest" value="new" data-act="dest"${st.dest === 'new' ? ' checked' : ''}> Create new set</label>
                <label class="wsi-radio"><input type="radio" name="wsi-dest" value="existing" data-act="dest"${st.dest === 'existing' ? ' checked' : ''}${st.sets.length ? '' : ' disabled'}> Add to existing set${st.sets.length ? '' : ' (no sets yet)'}</label>
                ${st.dest === 'new' ? `
                    <input type="text" id="wsi-name" class="wsi-input" maxlength="80" placeholder="Name the new set" value="${esc(st.newName)}" aria-label="New set name">
                    <div class="ws-meta-fields">
                        <label>Category <input type="text" id="wsi-category" list="ws-category-suggestions" maxlength="80" placeholder="e.g. Jobs, Food" value="${esc(st.category)}"></label>
                        <label>Class <input type="text" id="wsi-class" list="ws-class-suggestions" maxlength="80" placeholder="e.g. 8A" value="${esc(st.className)}"></label>
                    </div>` : `
                    <select id="wsi-set" class="wsi-input" data-act="set" aria-label="Existing set"><option value="">Choose a set…</option>${setOpts}</select>
                    <p class="wsi-limits">New terms are added as consecutive cards at the end of the set.${dupCount ? ` ${dupCount} term${dupCount === 1 ? ' is' : 's are'} already in it and will be skipped.` : ''}</p>`}
            </fieldset>
            <div class="wsi-row-actions">
                <button type="button" class="btn btn-grey" data-act="back"><i class="fa-solid fa-arrow-left"></i> Start over</button>
                <button type="button" class="btn btn-blue" data-act="save"${st.busy ? ' disabled' : ''}><i class="fa-solid fa-floppy-disk"></i> ${st.dest === 'new' ? 'Create set' : 'Add cards'}</button>
            </div>`;
    }

    function renderDone() {
        const r = st.result;
        const n = r.added.length;
        const first = n ? Number(r.added[0].position) + 1 : 0;
        const last = n ? Number(r.added[n - 1].position) + 1 : 0;
        const list = r.added.slice(0, 12).map((a) => `<li><span class="ws-edit-num">${Number(a.position) + 1}</span> ${esc(a.term)}</li>`).join('');
        return `
            <div class="wsi-done">
                <i class="fa-solid fa-circle-check wsi-done-icon" aria-hidden="true"></i>
                <h4>${r.created ? `Created “${esc(r.setName)}” with ${n} card${n === 1 ? '' : 's'}` : `Added ${n} card${n === 1 ? '' : 's'} to “${esc(r.setName)}”`}</h4>
                ${n && !r.created ? `<p>New cards ${first}${last !== first ? `–${last}` : ''} of ${r.itemCount}.</p>` : ''}
                ${n ? `<ol class="wsi-added">${list}${n > 12 ? `<li class="wsi-more">…and ${n - 12} more</li>` : ''}</ol>` : ''}
                ${r.skipped.length ? `<p class="wsi-skipped"><i class="fa-solid fa-clone"></i> Skipped ${r.skipped.length} already in the set: ${r.skipped.map((s) => esc(s.term)).join(', ')}</p>` : ''}
                <div class="wsi-row-actions wsi-row-actions--center">
                    <button type="button" class="btn btn-blue" data-act="open-set"><i class="fa-solid fa-pen"></i> Open the set</button>
                    <button type="button" class="btn btn-outline" data-act="again"><i class="fa-solid fa-camera"></i> Import more</button>
                    <button type="button" class="btn btn-grey" data-act="close">Back to lists</button>
                </div>
            </div>`;
    }

    function render() {
        const h = host();
        if (!h || !st) return;
        const steps = ['Add words', 'Review cards', 'Saved'];
        const idx = { source: 0, review: 1, done: 2 }[st.step];
        h.innerHTML = `
            <div class="ws-editor-head">
                <div><h3><i class="fa-solid fa-camera"></i> Import from photo or list</h3>
                <ol class="wsi-steps">${steps.map((s, i) => `<li class="${i === idx ? 'is-on' : i < idx ? 'is-done' : ''}">${s}</li>`).join('')}</ol></div>
                <button type="button" class="btn btn-grey" data-act="close"><i class="fa-solid fa-arrow-left"></i> Back to lists</button>
            </div>
            ${statusHtml()}
            ${st.step === 'source' ? renderSource() : st.step === 'review' ? renderReview() : renderDone()}`;
        h.querySelectorAll('textarea[data-f="def"]').forEach((el) => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; });
    }

    async function onClick(e) {
        const b = e.target.closest('[data-act]');
        if (!b || !st || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
        const act = b.dataset.act;
        const i = Number(b.dataset.i);
        if (act === 'close') return close();
        if (act === 'mode') { syncDom(); st.mode = b.dataset.v; st.status = null; return render(); }
        if (act === 'extract') return extract();
        if (act === 'fill') return fillMissing();
        if (act === 'regen') return regenerate(i);
        if (act === 'remove') { syncDom(); st.items.splice(i, 1); if (!st.items.length) st.items.push({ term: '', definition: '' }); return render(); }
        if (act === 'add') {
            syncDom();
            st.items.push({ term: '', definition: '' }); render();
            const t = host().querySelectorAll('[data-f="term"]'); if (t.length) t[t.length - 1].focus();
            return;
        }
        if (act === 'save') return save();
        if (act === 'back') { syncDom(); st.step = 'source'; st.status = null; return render(); }
        if (act === 'again') { open({ setId: st.result ? String(st.result.setId) : '' }); return; }
        if (act === 'open-set') { const id = st.result.setId; close(); if (typeof window.editWordSet === 'function') window.editWordSet(id); }
    }

    async function onChange(e) {
        const el = e.target;
        if (!st || !el.dataset) return;
        const act = el.dataset.act;
        if (act === 'file') return onFile(el);
        if (act === 'level') { st.level = C.normaliseLevel(el.value); saveLevel(st.level); return; }
        if (act === 'dest') { syncDom(); st.dest = el.value; render(); if (st.dest === 'existing' && st.setId) { await loadExisting(st.setId).catch(() => {}); render(); } return; }
        if (act === 'set') {
            syncDom(); st.setId = el.value; render();
            if (st.setId) { try { await loadExisting(st.setId); } catch (err) { st.status = { kind: 'error', text: err.message }; } render(); }
        }
    }

    function onInput(e) {
        if (e.target.matches && e.target.matches('textarea[data-f="def"]')) { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }
        if (st && e.target.matches && e.target.matches('[data-f="term"]') && st.dest === 'existing') {
            const row = e.target.closest('.wsi-row');
            const dup = dupSet().has(C.keyOf(C.cleanTerm(e.target.value)));
            if (row) row.classList.toggle('is-dup', dup);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const h = host();
        if (!h) return;
        h.addEventListener('click', onClick);
        h.addEventListener('change', onChange);
        h.addEventListener('input', onInput);
    });

    function syncButton() {
        const unlocked = hasPlan();
        const btn = document.getElementById('ws-import-open');
        if (btn) { btn.classList.toggle('is-unlocked', hasPlan()); btn.title = hasPlan() ? '' : 'Writing Suite plan'; }
        const up = document.getElementById('ws-import-upsell');
        if (up) up.hidden = unlocked;
        if (st && !hasPlan()) close();
    }
    document.addEventListener('DOMContentLoaded', syncButton);

    window.WordSetImport = { open, close, syncButton, hasPlan, _state: () => st };
})();

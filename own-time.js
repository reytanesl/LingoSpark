/**
 * In your own time — personalized practice coach (Writing Suite): every lesson / extra set = 5–6 tasks.
 */
(function () {
    'use strict';

    const TASK_TYPES = [
        { id: 'writing', pl: 'Pisanie', en: 'Writing' },
        { id: 'drill', pl: 'Ćwiczenia / drill', en: 'Drills' },
        { id: 'uoe', pl: 'Use of English', en: 'Use of English' },
        { id: 'reading', pl: 'Czytanie + rozumienie', en: 'Reading + comprehension' },
        { id: 'vocab', pl: 'Słownictwo', en: 'Vocabulary' },
    ];

    const INTEREST_CHIPS = [
        'sport', 'muzyka', 'gry', 'filmy', 'zwierzęta', 'podróże',
        'technologia', 'moda', 'gotowanie', 'nauka', 'książki', 'przyjaciele',
    ];

    let profile = null;
    let lessons = [];
    let lesson = null;
    let taskIndex = 0;
    let answers = {};
    let startedAt = 0;
    let view = 'loading'; // loading | onboard | dash | lesson | feedback | done
    let today = null; // { lessonDone, extrasUsed, extrasLimit, extrasLeft } from the server
    let lastFinished = null; // { lesson, answers } of the set just completed — context for "Keep going"
    let capMessage = '';
    // Several named profiles per account; each keeps its own in-progress lesson on the server.
    let profiles = [];
    let profileId = null;
    let profileLimit = 5;
    const pmenu = { open: false, renaming: null, deleting: null, creating: false };
    let progressTimer = null;

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function lang() {
        return profile && profile.instrLang === 'en' ? 'en' : 'pl';
    }

    function t(pl, en) {
        return lang() === 'en' ? en : pl;
    }

    function canOfferEnglish(p) {
        if (!p) return false;
        if (typeof p.canOfferEnglish === 'boolean') return p.canOfferEnglish;
        const a = Number(p.age);
        const c = String(p.cefr || '').toUpperCase();
        return (Number.isFinite(a) && a >= 15) || ['B1', 'B2', 'C1', 'C2'].includes(c);
    }

    function root() {
        return document.getElementById('own-time-root');
    }

    function setStatus(msg, kind) {
        const el = document.getElementById('own-time-status');
        if (!el) return;
        el.className = 'feedback' + (kind ? ' ' + kind : '');
        el.innerHTML = msg || '';
    }

    async function api(path, opts) {
        const res = await fetch(path, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
            ...opts,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || res.statusText || 'Request failed');
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    function toggleLoading(on) {
        const loader = document.getElementById('own-time-loading');
        const content = document.getElementById('own-time-content');
        if (loader) loader.style.display = on ? 'block' : 'none';
        if (content) content.style.display = on ? 'none' : 'block';
    }

    /* ---------- Read aloud (browser speechSynthesis) ---------- */
    const VOICE_KEY = (pid) => `ls-ot-voice-${pid || 'default'}`;
    function ttsSupported() {
        return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
    }
    /** Language the student practises (own time is English; a German profile/lesson would use de-*). */
    function targetLangCode() {
        return (profile?.targetLang || lesson?.targetLang) === 'de' ? 'de' : 'en';
    }
    function voicesForTarget() {
        if (!ttsSupported()) return [];
        const pre = targetLangCode();
        return (window.speechSynthesis.getVoices() || [])
            .filter((v) => String(v.lang || '').toLowerCase().replace('_', '-').startsWith(pre))
            .sort((a, b) => String(a.lang).localeCompare(String(b.lang)) || String(a.name).localeCompare(String(b.name)));
    }
    function savedVoiceName() {
        if (profile?.voice) return profile.voice;
        try { return localStorage.getItem(VOICE_KEY(profileId)) || ''; } catch (_) { return ''; }
    }
    /** Saved voice if this device has it, else the default voice for the target language. */
    function pickVoice(name = savedVoiceName()) {
        const list = voicesForTarget();
        return list.find((v) => v.name === name)
            || list.find((v) => v.default)
            || list.find((v) => /^(en-GB|de-DE)$/i.test(String(v.lang).replace('_', '-')))
            || list[0] || null;
    }
    let speakingBtn = null;
    function setSpeakBtn(b, on) {
        if (!b) return;
        b.classList.toggle('is-playing', on);
        b.setAttribute('aria-pressed', String(on));
        const label = on ? t('Zatrzymaj czytanie', 'Stop reading') : t('Przeczytaj tekst na głos', 'Read the text aloud');
        b.setAttribute('aria-label', label);
        b.title = label;
        const i = b.querySelector('i');
        if (i) i.className = `fa-solid ${on ? 'fa-stop' : 'fa-volume-high'}`;
    }
    function stopSpeaking() {
        if (!ttsSupported()) return;
        try { window.speechSynthesis.cancel(); } catch (_) { /* ignore */ }
        setSpeakBtn(speakingBtn, false);
        speakingBtn = null;
    }
    function speakText(text, btn, voiceName) {
        if (!ttsSupported() || !String(text || '').trim()) return;
        stopSpeaking();
        const u = new window.SpeechSynthesisUtterance(String(text));
        const v = pickVoice(voiceName);
        u.lang = v?.lang || (targetLangCode() === 'de' ? 'de-DE' : 'en-GB');
        if (v) { try { u.voice = v; } catch (_) { /* voice list changed: keep lang only */ } }
        u.rate = 0.95;
        const done = () => { if (speakingBtn === btn) { setSpeakBtn(btn, false); speakingBtn = null; } };
        u.onend = done;
        u.onerror = done;
        speakingBtn = btn || null;
        setSpeakBtn(btn, true);
        window.speechSynthesis.speak(u);
    }
    function voicePickerHtml() {
        if (!ttsSupported()) return '';
        return `<div class="ot-voice" id="ot-voice-wrap">
                    <label class="ot-block-label" for="ot-voice">${esc(t('Głos lektora (czytanie tekstów)', 'Reading voice'))}</label>
                    <div class="ot-voice-row">
                        <select id="ot-voice" class="pe-input"><option value="">${esc(t('Domyślny głos', 'Default voice'))}</option></select>
                        <button type="button" class="btn btn-outline ot-voice-preview" id="ot-voice-preview" aria-pressed="false" aria-label="${esc(t('Posłuchaj głosu', 'Preview voice'))}" title="${esc(t('Posłuchaj głosu', 'Preview voice'))}"><i class="fa-solid fa-volume-high"></i> <span>${esc(t('Posłuchaj', 'Preview'))}</span></button>
                    </div>
                </div>`;
    }
    function fillVoiceSelect() {
        const sel = document.getElementById('ot-voice');
        if (!sel) return;
        const want = savedVoiceName();
        const list = voicesForTarget();
        sel.innerHTML = `<option value="">${esc(t('Domyślny głos', 'Default voice'))}</option>${list.map((v) => `<option value="${esc(v.name)}"${v.name === want ? ' selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}`;
        // A saved voice this device doesn't have falls back to the default.
        if (want && !list.some((v) => v.name === want)) sel.value = '';
    }
    if (ttsSupported()) {
        window.speechSynthesis.addEventListener?.('voiceschanged', fillVoiceSelect);
        window.addEventListener('pagehide', stopSpeaking);
    }

    /* ---------- Profile picker on the initial setup screen ---------- */
    let pickCreating = false;
    function profilePickerHtml() {
        if (!profiles.length) return '';
        const full = profiles.length >= profileLimit;
        const cards = profiles.map((p) => {
            const meta = p.configured ? `${p.cefr}${p.age != null ? ` · ${t('wiek', 'age')} ${p.age}` : ''}` : t('do uzupełnienia', 'not set up yet');
            const on = p.id === profileId;
            return `<div class="ot-ppick-wrap"><button type="button" class="ot-ppick${on ? ' is-active' : ''}" data-ppick="${p.id}" aria-pressed="${on}">
                ${avatarHtml(p)}<span class="ot-pinfo"><strong>${esc(p.name)}</strong><span>${esc(meta)}</span>${p.progress ? `<em class="ot-ppick-prog"><i class="fa-solid fa-circle-play" aria-hidden="true"></i> ${esc(progressLabel(p.progress))}</em>` : ''}</span>
                ${on ? `<i class="fa-solid fa-check ot-ppick-check" aria-hidden="true"></i>` : ''}
            </button><button type="button" class="ot-ppick-edit" data-ppick-edit="${p.id}" title="${esc(t('Edytuj profil', 'Edit profile'))}" aria-label="${esc(t(`Edytuj profil: ${p.name}`, `Edit profile: ${p.name}`))}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button></div>`;
        }).join('');
        const add = pickCreating
            ? `<form class="ot-ppick ot-ppick--form" data-pickform="create"><input type="text" class="pe-input" id="ot-ppick-new" maxlength="40" placeholder="${esc(t('Imię, np. Ola', 'Name, e.g. Ola'))}" aria-label="${esc(t('Nazwa nowego profilu', 'New profile name'))}" required>
                <button type="submit" class="ot-pbtn is-primary">${esc(t('Utwórz', 'Create'))}</button><button type="button" class="ot-pbtn" data-ppick-cancel>${esc(t('Anuluj', 'Cancel'))}</button></form>`
            : `<button type="button" class="ot-ppick ot-ppick--add" data-ppick-new${full ? ' disabled' : ''} title="${esc(full ? t(`Limit: ${profileLimit} profili`, `Limit: ${profileLimit} profiles`) : '')}"><i class="fa-solid fa-plus" aria-hidden="true"></i> <span>${esc(full ? t(`Limit ${profileLimit} profili`, `${profileLimit} profiles max`) : t('Nowy profil', 'New profile'))}</span></button>`;
        return `<div class="ot-ppicker" role="group" aria-label="${esc(t('Wybierz profil', 'Choose a profile'))}">
            <div class="ot-ppicker-head"><strong>${esc(t('Kto ćwiczy?', 'Who is practising?'))}</strong><span>${esc(t(`Wybierz profil albo utwórz nowy (${profiles.length} z ${profileLimit}).`, `Pick a profile or create a new one (${profiles.length} of ${profileLimit}).`))}</span></div>
            <div class="ot-ppicker-grid">${cards}${add}</div>
        </div>`;
    }
    function bindProfilePicker(el) {
        const host = el.querySelector('.ot-ppicker');
        if (!host) return;
        host.addEventListener('click', (ev) => {
            const ed = ev.target.closest('[data-ppick-edit]');
            if (ed) { editProfile(Number(ed.dataset.ppickEdit)); return; }
            const card = ev.target.closest('[data-ppick]');
            if (card) { const id = Number(card.dataset.ppick); if (id !== profileId) switchProfile(id); return; }
            if (ev.target.closest('[data-ppick-new]')) { pickCreating = true; paint(); document.getElementById('ot-ppick-new')?.focus(); return; }
            if (ev.target.closest('[data-ppick-cancel]')) { pickCreating = false; paint(); }
        });
        host.addEventListener('submit', (ev) => {
            const f = ev.target.closest('[data-pickform]');
            if (!f) return;
            ev.preventDefault();
            const v = String(f.querySelector('input')?.value || '').trim();
            if (!v) return;
            pickCreating = false;
            profileAction('create', null, v);
        });
    }

    function readForm() {
        const age = Number(document.getElementById('ot-age')?.value);
        const cefr = document.getElementById('ot-cefr')?.value || 'A2';
        const interests = [];
        document.querySelectorAll('#ot-interests-chips input:checked').forEach((inp) => interests.push(inp.value));
        const extra = String(document.getElementById('ot-interests-extra')?.value || '').trim();
        if (extra) interests.push(...extra.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean));
        const taskPrefs = [];
        document.querySelectorAll('#ot-task-prefs input:checked').forEach((inp) => taskPrefs.push(inp.value));
        let instrLang = document.querySelector('input[name="ot-instr-lang"]:checked')?.value || 'pl';
        if (instrLang === 'en' && !canOfferEnglish({ age, cefr })) instrLang = 'pl';
        return {
            age: Number.isFinite(age) ? age : null,
            classLabel: String(document.getElementById('ot-class')?.value || '').trim(),
            cefr,
            interests,
            taskPrefs,
            purpose: String(document.getElementById('ot-purpose')?.value || '').trim(),
            intensity: document.getElementById('ot-intensity')?.value || 'standard',
            instrLang,
            topic: String(document.getElementById('ot-topic')?.value || '').trim(),
            vocab: String(document.getElementById('ot-vocab')?.value || '').trim(),
            ...(document.getElementById('ot-voice') ? { voice: document.getElementById('ot-voice').value } : {}),
            ...(document.getElementById('ot-pname') ? { name: String(document.getElementById('ot-pname').value || '').trim() } : {}),
            ...(document.querySelector('input[name="ot-avatar"]') ? { avatar: document.querySelector('input[name="ot-avatar"]:checked')?.value || '' } : {}),
        };
    }
    function profileFormError(f) {
        if (f.name !== undefined && !f.name) return { field: 'ot-pname', msg: t('Podaj nazwę profilu.', 'Enter a profile name.') };
        if (f.age == null || f.age < 6 || f.age > 99) return { field: 'ot-age', msg: t('Podaj wiek (6–99).', 'Enter an age (6–99).') };
        if (!f.taskPrefs.length) return { field: 'ot-task-prefs', msg: t('Wybierz przynajmniej jeden typ zadań.', 'Pick at least one task type.') };
        return null;
    }

    function renderOnboard(editMode) {
        const p = profile || {};
        const L = (p.instrLang === 'en' && canOfferEnglish(p)) ? 'en' : 'pl';
        const offerEn = canOfferEnglish({ age: p.age ?? 14, cefr: p.cefr || 'A2' });
        const interestSet = new Set((p.interests || []).map((x) => String(x).toLowerCase()));
        const prefSet = new Set(p.taskPrefs || ['writing', 'vocab']);

        const chips = INTEREST_CHIPS.map((c) => {
            const checked = interestSet.has(c) ? ' checked' : '';
            return `<label class="ot-chip"><input type="checkbox" value="${esc(c)}"${checked}> ${esc(c)}</label>`;
        }).join('');

        const prefs = TASK_TYPES.map((tt) => {
            const checked = prefSet.has(tt.id) ? ' checked' : '';
            const label = L === 'en' ? tt.en : tt.pl;
            return `<label class="ot-chip"><input type="checkbox" value="${esc(tt.id)}"${checked}> ${esc(label)}</label>`;
        }).join('');

        const active = profiles.find((x) => x.id === profileId);
        const title = editMode
            ? (L === 'en' ? 'Edit your profile' : 'Edytuj profil')
            : (active && profiles.length > 1
                ? t(`Nowy profil „${active.name}” — opowiedz o sobie`, `New profile “${active.name}” — tell us about you`)
                : (L === 'en' ? 'Tell us about you' : 'Opowiedz o sobie'));

        return `
            <div class="ot-card">
                ${editMode ? '' : profilePickerHtml()}
                <h3 class="ot-heading">${esc(title)}</h3>
                <p class="ot-lead">${esc(L === 'en'
                    ? 'We will build practice lessons of 5–6 short tasks for you.'
                    : 'Przygotujemy dla Ciebie lekcje z 5–6 krótkich zadań.')}</p>
                ${editMode ? profileIdentityHtml(active, L) : ''}
                <div class="ot-form-grid">
                    <label>${esc(L === 'en' ? 'Age' : 'Wiek')}
                        <input type="number" id="ot-age" class="pe-input" min="6" max="99" value="${p.age != null ? esc(p.age) : ''}" required>
                    </label>
                    <label>${esc(L === 'en' ? 'Class / year' : 'Klasa / rok')}
                        <input type="text" id="ot-class" class="pe-input" placeholder="np. 7a / 2 LO" value="${esc(p.classLabel || '')}">
                    </label>
                    <label>${esc(L === 'en' ? 'Level (CEFR)' : 'Poziom (CEFR)')}
                        <select id="ot-cefr" class="pe-input">
                            ${['A0', 'A1', 'A2', 'B1', 'B2', 'C1'].map((c) =>
                                `<option value="${c}"${(p.cefr || 'A2') === c ? ' selected' : ''}>${c}</option>`).join('')}
                        </select>
                        ${editMode ? `<span class="ot-level-note" id="ot-level-note" hidden>${esc(t('Nowy poziom obowiązuje od następnego zestawu — trwający zestaw i postępy zostają.', 'The new level applies from the next set — your current set and progress stay.'))}</span>` : ''}
                    </label>
                    <label>${esc(L === 'en' ? 'Difficulty' : 'Poziom trudności')}
                        <select id="ot-intensity" class="pe-input">
                            ${['light', 'standard', 'stretch'].map((d) => `<option value="${d}"${(p.intensity || 'standard') === d ? ' selected' : ''}>${esc(difficultyLabel(d))}</option>`).join('')}
                        </select>
                    </label>
                </div>
                <label class="ot-block-label">${esc(L === 'en' ? 'Interests' : 'Zainteresowania')}</label>
                <div class="ot-chips" id="ot-interests-chips">${chips}</div>
                <input type="text" id="ot-interests-extra" class="pe-input" placeholder="${esc(L === 'en' ? 'Other interests…' : 'Inne zainteresowania…')}" value="">
                <label class="ot-block-label">${esc(L === 'en' ? 'Task types you like' : 'Jakie zadania lubisz')}</label>
                <div class="ot-chips" id="ot-task-prefs">${prefs}</div>
                <label class="ot-block-label">${esc(L === 'en' ? 'What do you need English for?' : 'Do czego potrzebujesz angielskiego?')}
                    <input type="text" id="ot-purpose" class="pe-input" placeholder="${esc(L === 'en' ? 'e.g. school exam, travel…' : 'np. egzamin, podróże…')}" value="${esc(p.purpose || '')}">
                </label>
                <label class="ot-block-label">${esc(L === 'en' ? 'Topic for next time (optional)' : 'Temat na następny raz (opcjonalnie)')}
                    <input type="text" id="ot-topic" class="pe-input" value="${esc(p.topic || '')}">
                </label>
                <label class="ot-block-label">${esc(L === 'en' ? 'Vocabulary to practise (optional)' : 'Słownictwo do ćwiczenia (opcjonalnie)')}
                    <textarea id="ot-vocab" class="pe-input" rows="3" placeholder="${esc(L === 'en' ? 'One word or phrase per line' : 'Jedno słowo lub zwrot w linii')}">${esc(p.vocab || '')}</textarea>
                </label>
                <div class="ot-instr-lang" id="ot-instr-lang-wrap" style="${offerEn || canOfferEnglish(p) ? '' : 'display:none'}">
                    <p class="ot-block-label">${esc('Czy chcesz instrukcje po angielsku? / Do you want instructions in English?')}</p>
                    <label class="ot-chip"><input type="radio" name="ot-instr-lang" value="pl"${(p.instrLang || 'pl') !== 'en' ? ' checked' : ''}> Polski</label>
                    <label class="ot-chip"><input type="radio" name="ot-instr-lang" value="en"${p.instrLang === 'en' ? ' checked' : ''}> English</label>
                </div>
                ${voicePickerHtml()}
                <div class="ot-actions">
                    <button type="button" class="btn btn-blue" id="ot-save-profile">${esc(editMode
                        ? (L === 'en' ? 'Save' : 'Zapisz')
                        : (L === 'en' ? 'Save & continue' : 'Zapisz i dalej'))}</button>
                    ${editMode ? `<button type="button" class="btn btn-grey" id="ot-cancel-edit">${esc(L === 'en' ? 'Cancel' : 'Anuluj')}</button>` : ''}
                </div>
            </div>`;
    }

    function profileIdentityHtml(active, L) {
        const cur = active || {};
        const chosen = cur.avatar || (profile && profile.avatar) || '';
        const sw = Object.entries(AVATAR_PICK).map(([k, col]) => `<label class="ot-swatch" style="--ot-av:${col}" title="${esc(k)}"><input type="radio" name="ot-avatar" value="${k}"${chosen === k ? ' checked' : ''}><span aria-hidden="true">${esc(initials(cur.name))}</span><span class="sr-only">${esc(k)}</span></label>`).join('');
        return `<div class="ot-identity">
            <label class="ot-identity-name">${esc(L === 'en' ? 'Profile name' : 'Nazwa profilu')}
                <input type="text" id="ot-pname" class="pe-input" maxlength="40" value="${esc(cur.name || '')}" required>
            </label>
            <fieldset class="ot-identity-av"><legend>${esc(L === 'en' ? 'Avatar colour' : 'Kolor awatara')}</legend><div class="ot-swatches">
                <label class="ot-swatch is-auto" title="${esc(t('Automatyczny', 'Automatic'))}"><input type="radio" name="ot-avatar" value=""${chosen ? '' : ' checked'}><span aria-hidden="true">A</span><span class="sr-only">${esc(t('Automatyczny', 'Automatic'))}</span></label>${sw}</div></fieldset>
        </div>
        ${lesson ? `<p class="ot-edit-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${esc(t('Zmiany obowiązują od następnego zestawu. Trwający zestaw i postępy nie zostaną usunięte.', 'Changes apply from the next set. Your current set and progress are kept.'))}</p>` : ''}`;
    }

    /** The stored "intensity" setting is difficulty only — every lesson has 5–6 tasks. */
    function difficultyLabel(d) {
        return ({ light: t('Łatwiej', 'Easier'), stretch: t('Wyzwanie', 'Challenge') })[d] || t('Standard', 'Standard');
    }

    function renderDash() {
        const p = profile;
        const L = lang();
        const last = lessons[0];
        const lastNote = last?.feedback?.note || last?.feedback?.freeNote || '';
        const lastLevel = last?.feedback?.levelOk || '';
        return `
            <div class="ot-card">
                <h3 class="ot-heading">${esc(L === 'en' ? 'In your own time' : 'We własnym tempie')}</h3>
                <p class="ot-lead">${esc(L === 'en'
                    ? 'A practice lesson of 5–6 short tasks, tailored to you.'
                    : 'Lekcja z 5–6 krótkich zadań, dopasowana do Ciebie.')}</p>
                <ol class="ot-how">
                    <li><span class="ot-how-n">1</span><strong>${esc(t('Zrób 5–6 krótkich zadań', 'Do 5–6 short tasks'))}</strong><span>${esc(t('Każde ma kroki, przykład i podpowiedź.', 'Each has steps, an example and a hint.'))}</span></li>
                    <li><span class="ot-how-n">2</span><strong>${esc(t('Sprawdź odpowiedzi', 'Check your answers'))}</strong><span>${esc(t('„Sprawdź” pokaże błędy; potrzebujesz pomocy? Rozwiń podpowiedzi.', '“Check” marks mistakes; need help? Open the hints.'))}</span></li>
                    <li><span class="ot-how-n">3</span><strong>${esc(t('Powiedz, jak było', 'Tell us how it went'))}</strong><span>${esc(t('Twoja opinia ustawia następną lekcję.', 'Your feedback shapes the next lesson.'))}</span></li>
                </ol>
                <p class="ot-time-note"><i class="fa-solid fa-list-check"></i> ${esc(t('5–6 zadań · każde mieści się na jednym ekranie · pracuj we własnym tempie', '5–6 tasks · each fits on one screen · work at your own pace'))}</p>
                <ul class="ot-summary">
                    <li><strong>${esc(L === 'en' ? 'Level' : 'Poziom')}:</strong> ${esc(p.cefr)} · ${esc(p.classLabel || '—')} · ${esc(L === 'en' ? 'age' : 'wiek')} ${esc(p.age ?? '—')}</li>
                    <li><strong>${esc(L === 'en' ? 'Difficulty' : 'Trudność')}:</strong> ${esc(difficultyLabel(p.intensity))}</li>
                    <li><strong>${esc(L === 'en' ? 'Likes' : 'Lubisz')}:</strong> ${esc((p.taskPrefs || []).join(', ') || '—')}</li>
                    <li><strong>${esc(L === 'en' ? 'Interests' : 'Zainteresowania')}:</strong> ${esc((p.interests || []).join(', ') || '—')}</li>
                    ${p.topic ? `<li><strong>${esc(L === 'en' ? 'Topic' : 'Temat')}:</strong> ${esc(p.topic)}</li>` : ''}
                </ul>
                ${today?.lessonDone ? `<div class="ot-today-done"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${esc(t('Dzisiejsza lekcja zrobiona.', "Today's lesson is done."))}</div>${keepGoingHtml({ title: t('Chcesz poćwiczyć więcej?', 'Want more practice?') })}` : ''}
                ${lastNote || lastLevel ? `<p class="ot-last-fb"><strong>${esc(L === 'en' ? 'Last feedback' : 'Ostatnia opinia')}:</strong> ${esc(lastLevel)} ${esc(lastNote)}</p>` : ''}
                <div class="ot-form-grid">
                    <label>${esc(L === 'en' ? 'Topic this time (optional)' : 'Temat tym razem (opcjonalnie)')}
                        <input type="text" id="ot-session-topic" class="pe-input" value="${esc(p.topic || '')}">
                    </label>
                    <label>${esc(L === 'en' ? 'Vocabulary this time (optional)' : 'Słownictwo tym razem (opcjonalnie)')}
                        <textarea id="ot-session-vocab" class="pe-input" rows="2">${esc(p.vocab || '')}</textarea>
                    </label>
                </div>
                <div class="ot-actions">
                    <button type="button" class="btn btn-blue" id="ot-start">${esc(L === 'en' ? 'Start practice (5–6 tasks)' : 'Zacznij ćwiczenia (5–6 zadań)')}</button>
                    <button type="button" class="btn btn-outline" id="ot-edit-profile">${esc(L === 'en' ? 'Edit profile' : 'Edytuj profil')}</button>
                </div>
            </div>`;
    }

    /** Case-, punctuation- and spacing-insensitive key (mirrors looseKey in own-time-prompts.js). */
    function looseKey(s) {
        return String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
    }

    const AC = window.AnswerCheck;
    /** ok | almost | wrong | empty | alt (AI: correct, other than the key). Options/tiles keep loose exact matching. */
    function gradeItem(item, value, verdict) {
        if (Array.isArray(item.options) || Array.isArray(item.tiles) || !AC) {
            const v = looseKey(value);
            if (!v) return 'empty';
            return [item.answer, ...(item.alts || [])].map(looseKey).includes(v) ? 'ok' : 'wrong';
        }
        const g = AC.gradeAnswer(item, value).status;
        if (g !== 'ok' && g !== 'empty' && verdict && AC.normAnswer(verdict.value) === AC.normAnswer(value)) return verdict.correct ? 'alt' : 'wrong';
        return g;
    }
    function checkItem(item, value, verdict) {
        const g = gradeItem(item, value, verdict);
        return g === 'ok' || g === 'alt';
    }
    function appealsUsed() { return Number(answers._appeals) || 0; }
    /** Layer 3: one batched AI re-check per task for typed items that did not match the key. */
    async function recheckOpen(task, key, list, appeal) {
        const a = answers[key] || (answers[key] = {});
        a.verdicts = a.verdicts || {};
        try {
            const r = await api('/api/own-time/check-open', { method: 'POST', body: JSON.stringify({
                format: task.format || 'simple', cefr: lesson.cefr || profile?.cefr || '', prompt: task.prompt || '', appeal: !!appeal,
                items: list.map(({ it, i, given }) => ({ i, q: it.q, lead: it.lead, key: it.key, cue: it.cue, pl: it.pl, answer: it.answer, accepted: it.alts || [], given })),
            }) });
            list.forEach(({ i, given }) => { const v = r.results?.[i] || { correct: false, explanation: '' }; a.verdicts[i] = { value: given, correct: !!v.correct, why: v.explanation || '' }; });
        } catch (e) {
            list.forEach(({ i, given }) => { a.verdicts[i] = { value: given, correct: false, why: t('Nie udało się sprawdzić — spróbuj później.', 'Could not re-check — try later.'), failed: true }; });
        }
        saveProgressNow();
        document.getElementById('ot-check')?.click();
    }

    /* ---------- Tile tasks: word order + unscramble ---------- */
    const tileState = {}; // `${taskIndex}:${i}` -> array of tile indexes placed in the answer line (word order)
    function placed(i) {
        const k = `${taskIndex}:${i}`;
        if (!tileState[k]) tileState[k] = [];
        return tileState[k];
    }
    function sentenceFrom(it, order) {
        const words = order.map((k) => it.tiles[k]);
        if (!words.length) return '';
        const txt = words.join(' ');
        return txt.charAt(0).toUpperCase() + txt.slice(1) + (order.length === it.tiles.length ? (it.end || '.') : '');
    }
    function wordOrderInner(it, i) {
        const order = placed(i);
        const inLine = new Set(order);
        const tile = (k, where) => `<button type="button" class="ot-tile" data-k="${k}" data-where="${where}" draggable="true" aria-label="${esc(it.tiles[k])}${where === 'line' ? esc(t(' — kliknij, by cofnąć', ' — click to remove')) : ''}">${esc(it.tiles[k])}</button>`;
        return `
            ${it.q ? `<div class="ot-tiles-cue">${esc(it.q)}</div>` : ''}
            <div class="ot-line-wrap">
                <div class="ot-line${order.length ? '' : ' is-empty'}" data-zone="line" data-i="${i}" aria-label="${esc(t('Twoje zdanie', 'Your sentence'))}" role="group">${order.map((k) => tile(k, 'line')).join('')}${order.length ? '' : `<span class="ot-line-ph">${esc(t('Klikaj lub przeciągaj słowa tutaj', 'Tap or drag words here'))}</span>`}</div>
                <span class="ot-mark" data-mark="${i}" aria-live="polite"></span>
            </div>
            <div class="ot-bank" data-zone="bank" data-i="${i}" role="group" aria-label="${esc(t('Słowa do ułożenia', 'Words to use'))}">${it.tiles.map((w, k) => (inLine.has(k) ? '' : tile(k, 'bank'))).join('')}${inLine.size === it.tiles.length ? `<span class="ot-bank-done">${esc(t('Wszystkie słowa użyte', 'All words placed'))}</span>` : ''}
                <button type="button" class="ot-tile-reset" data-reset="${i}" title="${esc(t('Zacznij od nowa', 'Reset'))}" aria-label="${esc(t('Zacznij od nowa', 'Reset'))}"><i class="fa-solid fa-rotate-left"></i></button>
            </div>
            <input type="hidden" class="ot-item" data-i="${i}" value="${esc(sentenceFrom(it, order))}">`;
    }
    function letterUse(it, value) {
        // Greedily mark which letter tiles the typed/built word already uses.
        const pool = it.tiles.map((l, k) => ({ l: l.toLowerCase(), k }));
        const used = new Set();
        for (const ch of String(value || '').toLowerCase()) {
            const hit = pool.find((p) => !used.has(p.k) && p.l === ch);
            if (hit) used.add(hit.k);
        }
        return used;
    }
    function unscrambleInner(it, i, value) {
        const used = letterUse(it, value);
        return `
            <div class="ot-tiles-cue">${it.emoji ? `<span class="ot-emoji" aria-hidden="true">${esc(it.emoji)}</span>` : ''}${esc(it.q || t('Ułóż słowo', 'Build the word'))}</div>
            <div class="ot-unscr-row"><div class="ot-line-wrap">
                <input type="text" class="pe-input ot-item ot-gap-input ot-unscramble-input" data-i="${i}" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="${it.tiles.length + 2}" style="width:${Math.max(4, it.tiles.length + 1)}ch" aria-label="${esc(t(`Słowo ${i + 1}`, `Word ${i + 1}`))}" value="${esc(value || '')}">
                <span class="ot-mark" data-mark="${i}" aria-live="polite"></span>
                <button type="button" class="ot-tile-reset" data-reset="${i}" title="${esc(t('Wyczyść', 'Clear'))}" aria-label="${esc(t('Wyczyść', 'Clear'))}"><i class="fa-solid fa-delete-left"></i></button>
            </div>
            <div class="ot-bank ot-bank--letters" data-zone="letters" data-i="${i}" role="group" aria-label="${esc(t('Litery', 'Letters'))}">${it.tiles.map((l, k) => `<button type="button" class="ot-tile ot-tile--letter${used.has(k) ? ' is-used' : ''}" data-l="${k}"${used.has(k) ? ' disabled' : ''}>${esc(l)}</button>`).join('')}</div></div>`;
    }

    const TYPE_LABELS = {
        vocab_drill: { pl: 'Słownictwo', en: 'Vocabulary', icon: 'fa-spell-check' },
        word_order: { pl: 'Szyk zdania', en: 'Word order', icon: 'fa-shuffle' },
        unscramble: { pl: 'Rozsypanka', en: 'Unscramble', icon: 'fa-font' },
        uoe: { pl: 'Gramatyka i słowa', en: 'Use of English', icon: 'fa-puzzle-piece' },
        reading: { pl: 'Czytanie', en: 'Reading', icon: 'fa-book-open' },
        writing: { pl: 'Pisanie', en: 'Writing', icon: 'fa-pen' },
    };
    function typeLabel(type) {
        const x = TYPE_LABELS[type] || TYPE_LABELS.writing;
        return lang() === 'en' ? x.en : x.pl;
    }

    /** Guidance with safe fallbacks for older lessons. A saved successCriteria field is ignored (checklist removed). */
    function guidance(task) {
        const steps = Array.isArray(task.steps) && task.steps.length ? task.steps : (task.type === 'writing'
            ? [t('Zaplanuj 2–3 pomysły.', 'Plan 2–3 ideas.'), t('Napisz tekst.', 'Write your text.'), t('Przeczytaj go jeszcze raz.', 'Read it again.')]
            : [t('Przeczytaj polecenie.', 'Read the instruction.'), t('Odpowiedz na każdy punkt.', 'Answer every item.'), t('Kliknij „Sprawdź” i popraw błędy.', 'Press “Check” and fix mistakes.')]);
        return {
            steps,
            example: task.example || '',
            useful: Array.isArray(task.usefulLanguage) ? task.usefulLanguage : [],
            hint: task.hint || '',
            target: task.target || null,
        };
    }

    function countText(text) {
        const s = String(text || '').trim();
        if (!s) return { words: 0, sentences: 0 };
        const words = s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
        const sentences = s.split(/[.!?]+(?:\s|$)/).filter((x) => /[\p{L}]/u.test(x)).length;
        return { words, sentences };
    }

    function counterHtml(target, text) {
        if (!target) return '';
        const c = countText(text);
        const min = Number(target.minSentences) || 0;
        const max = Number(target.maxSentences) || min;
        const state = c.sentences === 0 ? '' : (c.sentences < min ? 'low' : (c.sentences > max + 1 ? 'high' : 'ok'));
        const words = target.minWords ? ` · ${t('ok.', 'about')} ${target.minWords}–${target.maxWords} ${t('słów', 'words')}` : '';
        return `<span class="ot-count ${state}"><strong>${c.sentences}</strong> ${t('zdań', 'sentences')} · <strong>${c.words}</strong> ${t('słów', 'words')}</span>
            <span class="ot-count-target">${t('Cel', 'Target')}: ${esc(min)}–${esc(max)} ${t('zdań', 'sentences')}${esc(words)}</span>`;
    }

    /** Guidance panels are collapsed by default; remember what the student opened within this lesson. */
    const openPanels = new Set();
    function panel(id, icon, title, inner, cls) {
        const key = `${taskIndex}:${id}`;
        return `<details class="ot-panel ${cls || ''}" data-panel="${esc(id)}"${openPanels.has(key) ? ' open' : ''}>
            <summary><i class="fa-solid ${esc(icon)}" aria-hidden="true"></i> <span>${esc(title)}</span><i class="fa-solid fa-chevron-down ot-panel-chev" aria-hidden="true"></i></summary>
            <div class="ot-panel-body">${inner}</div>
        </details>`;
    }

    /** Mirrors buildOwnTimeExtraContext in own-time-prompts.js: items to avoid + weak spots from the set just done. */
    function extraContextFrom(src) {
        if (!src) return {};
        if (src.saved) return { previousTitle: src.saved.title || '', focus: src.saved.focus || '', avoid: src.saved.avoid || [], weak: src.saved.weak || [] };
        const avoid = [];
        const weak = [];
        (src.lesson?.tasks || []).forEach((tk, i) => {
            const a = src.answers?.[`t${i}`] || {};
            (tk.items || []).forEach((it, j) => {
                if (it.answer) avoid.push(String(it.answer));
                if (it.q) avoid.push(String(it.q).slice(0, 80));
                const given = String((a.items || [])[j] || '').trim();
                if (it.answer && !checkItem(it, given)) weak.push(`${it.q} → ${it.answer}${given ? ` (wrote: ${given})` : ' (blank)'}`);
            });
        });
        return { previousTitle: src.lesson?.title || '', focus: src.lesson?.focus || '', avoid: avoid.slice(0, 40), weak: weak.slice(0, 12) };
    }

    function keepGoingHtml(opts = {}) {
        const left = today ? today.extrasLeft : null;
        const limit = today?.extrasLimit || 3;
        if (capMessage || left === 0) {
            return `<div class="ot-keep ot-keep--cap" role="status"><i class="fa-solid fa-moon" aria-hidden="true"></i>
                <div><strong>${esc(t('To wszystko na dziś — świetna robota!', "That's all for today — great work!"))}</strong>
                <p>${esc(t(`Zrobiłeś/aś już ${limit} dodatkowe zestawy. Odpocznij — jutro czeka nowa lekcja.`, `You've done ${limit} extra sets today. Have a rest — a new lesson is waiting tomorrow.`))}</p></div></div>`;
        }
        return `<div class="ot-keep">
            <div><strong>${esc(opts.title || t('Masz jeszcze siłę?', 'Still got energy?'))}</strong>
            <p>${esc(t('Dodatkowy zestaw w tym samym formacie i na tym samym poziomie — nowe zadania, powtórka trudniejszych miejsc.', 'An extra set in the same format and level — new items that revisit your tricky spots.'))}</p></div>
            <button type="button" class="btn btn-blue ot-keep-going" id="ot-keep-going"><i class="fa-solid fa-forward" aria-hidden="true"></i> ${esc(t('Ćwicz dalej', 'Keep going'))}</button>
            ${left != null ? `<span class="ot-keep-left">${esc(t(`Zostało dziś: ${left} z ${limit}`, `${left} of ${limit} extra sets left today`))}</span>` : ''}
        </div>`;
    }

    function renderDone() {
        const wasExtra = !!lastFinished?.lesson?.extra;
        return `
            <div class="ot-card ot-done">
                <div class="ot-done-icon" aria-hidden="true"><i class="fa-solid fa-circle-check"></i></div>
                <h3 class="ot-heading">${esc(wasExtra ? t('Dodatkowy zestaw zrobiony!', 'Extra set done!') : t('Dzisiejsza lekcja zrobiona!', "Today's lesson is done!"))}</h3>
                <p class="ot-lead">${esc(t('Zapisaliśmy Twoje odpowiedzi i opinię.', 'Your answers and feedback are saved.'))}</p>
                ${keepGoingHtml()}
                <div class="ot-actions"><button type="button" class="btn btn-outline" id="ot-to-dash">${esc(t('Wróć do panelu', 'Back to dashboard'))}</button></div>
            </div>`;
    }

    function stepperHtml(tasks) {
        const cur = view === 'feedback' ? tasks.length : taskIndex;
        return `<ol class="ot-stepper" aria-label="${esc(t('Postęp lekcji', 'Lesson progress'))}">
            ${tasks.map((tk, i) => `<li class="${i < cur ? 'done' : (i === cur ? 'current' : '')}"${i === cur ? ' aria-current="step"' : ''}>
                <span class="ot-step-dot">${i < cur ? '<i class="fa-solid fa-check"></i>' : i + 1}</span>
                <span class="ot-step-name">${esc(typeLabel(tk.type))}</span></li>`).join('')}
            <li class="${view === 'feedback' ? 'current' : ''}"><span class="ot-step-dot"><i class="fa-solid fa-flag-checkered"></i></span><span class="ot-step-name">${esc(t('Podsumowanie', 'Wrap-up'))}</span></li>
        </ol>`;
    }

    /** Normalise gap markers: ___ / ____ / {{n}} / […] → one canonical "___" (sentence items). */
    const GAP_RE = /_{3,}|\{\{\s*\d*\s*\}\}|\[\s*(?:…|\.\.\.)\s*\]/;
    function gapWidth(it) {
        const longest = [it.answer, ...(it.alts || [])].reduce((m, x) => Math.max(m, String(x || '').length), 0);
        return Math.max(4, Math.min(24, longest + 2));
    }
    function gapInput(it, i, saved) {
        return `<span class="ot-gap"><input type="text" id="ot-item-${i}" class="pe-input ot-item ot-gap-input" data-i="${i}" autocomplete="off" spellcheck="false" aria-label="${esc(t(`Luka ${i + 1}`, `Gap ${i + 1}`))}" style="width:${gapWidth(it)}ch" value="${esc((saved.items && saved.items[i]) || '')}"><span class="ot-mark" data-mark="${i}" aria-live="polite"></span></span>`;
    }
    /** Sentence with its gap rendered as an inline input; old items without a marker get the input after the text. */
    function inlineItem(it, i, saved) {
        const q = String(it.q || '');
        const m = q.match(GAP_RE);
        if (m) {
            const before = q.slice(0, m.index);
            const after = q.slice(m.index + m[0].length);
            const cue = it.cue ? ` <span class="ot-cue">(${esc(it.cue)})</span>` : '';
            return `${esc(before)}${gapInput(it, i, saved)}${cue}${esc(after)}`;
        }
        return `<span class="ot-q-text">${esc(q || t(`Punkt ${i + 1}`, `Item ${i + 1}`))}</span> ${gapInput(it, i, saved)}`;
    }
    /** Gapped text: prompt contains {{1}}, {{2}}… for items 1, 2… Returns null when the markers don't cover every item. */
    function gappedPrompt(task, saved) {
        const items = task.items || [];
        const prompt = String(task.prompt || '');
        if (!items.length || !/\{\{\s*\d+\s*\}\}/.test(prompt)) return null;
        const seen = new Set();
        const html = esc(prompt).replace(/\{\{\s*(\d+)\s*\}\}/g, (all, n) => {
            const i = Number(n) - 1;
            const it = items[i];
            if (!it) return all;
            seen.add(i);
            if (Array.isArray(it.options)) return `<span class="ot-gap-n">${i + 1}</span>${slotHtml(it, i, saved)}`;
            const cueText = it.cue || (it.q && !GAP_RE.test(it.q) && it.q.length <= 24 ? it.q.replace(/^\(|\)$/g, '') : '');
            const cue = cueText ? ` <span class="ot-cue${task.format === 'word_formation' ? ' ot-cue--caps' : ''}">(${esc(cueText)})</span>` : '';
            return `<span class="ot-gap-n">${i + 1}</span>${gapInput(it, i, saved)}${cue}`;
        }).replace(/\n/g, '<br>');
        return seen.size === items.length ? html : null;
    }

    /* ---------- Use of English in CKE exam formats ---------- */
    const UOE_FORMAT_NAMES = {
        simple: 'Luki', mc_sentences: 'Wybór wielokrotny', mc_dialogue: 'Minidialogi', mc_translation: 'Tłumaczenie — wybór',
        mc_text: 'Tekst z lukami — wybór', two_sentences: 'Jeden wyraz, dwa zdania', brackets: 'Wyrazy z nawiasu',
        translation: 'Tłumaczenie fragmentów', word_formation: 'Słowotwórstwo', open_cloze: 'Tekst z lukami',
        transformation: 'Transformacje', lexical_set: 'Set leksykalny',
    };
    const EXAM_SHORT = { E8: 'E8', MP: 'Matura PP', MR: 'Matura PR', MD: 'Matura DJ' };
    const EXAM_NAMES = { E8: 'Egzamin ósmoklasisty', MP: 'Matura — poziom podstawowy', MR: 'Matura — poziom rozszerzony', MD: 'Matura — poziom dwujęzyczny' };
    const LETTERS = 'ABCD';
    function savedVal(saved, i) { return (saved.items && saved.items[i]) || ''; }
    /** The gap of a closed item: shows the chosen option (or a blank line) and carries the hidden value. */
    function slotHtml(it, i, saved) {
        const v = savedVal(saved, i);
        return `<span class="ot-slot${v ? ' is-filled' : ''}" data-slot="${i}">${v ? esc(v) : '&nbsp;'}</span><span class="ot-mark" data-mark="${i}" aria-live="polite"></span>`;
    }
    function optionsHtml(it, i, saved) {
        const v = savedVal(saved, i);
        return `<span class="ot-opts" role="radiogroup" aria-label="${esc(t(`Odpowiedzi do luki ${i + 1}`, `Options for gap ${i + 1}`))}">${it.options.map((o, k) => `<button type="button" class="ot-opt${v === o ? ' is-picked' : ''}" role="radio" aria-checked="${v === o}" data-opt="${i}" data-v="${esc(o)}"><b>${LETTERS[k]}</b> ${esc(o)}</button>`).join('')}</span><input type="hidden" class="ot-item" data-i="${i}" value="${esc(v)}">`;
    }
    /** Item text with every gap rendered; the first gap is the answer field, the others mirror it (two-sentence / lexical sets). */
    function gapLines(it, i, saved, task) {
        const mc = Array.isArray(it.options);
        const parts = String(it.q || '').split(/_{3,}|\{\{\s*\d*\s*\}\}/);
        if (parts.length === 1) return `<span class="ot-q-text">${esc(it.q || '')}</span> ${mc ? slotHtml(it, i, saved) : gapInput(it, i, saved)}`;
        const pl = it.pl ? `<span class="ot-pl">(${esc(it.pl)})</span> ` : '';
        const cue = it.cue ? ` <span class="ot-cue">(${esc(it.cue)})</span>` : '';
        return parts.map((txt, k) => {
            const lineHtml = esc(txt).replace(/\n/g, '<br>');
            if (k === parts.length - 1) return lineHtml;
            const gap = k === 0 ? `${pl}${mc ? slotHtml(it, i, saved) : gapInput(it, i, saved)}${cue}` : `<span class="ot-mirror" data-mirror="${i}">${esc(savedVal(saved, i)) || '&nbsp;'}</span>`;
            return lineHtml + gap;
        }).join('');
    }
    function uoeItemHtml(task, it, i, saved) {
        if (task.format === 'transformation' && it.lead) {
            return `<div class="ot-tf-lead">${esc(it.lead)} <span class="ot-tf-key">${esc(it.key || '')}</span></div><div class="ot-tf-line">${gapLines(it, i, saved, task)}</div>`;
        }
        const lines = `<div class="ot-q-line">${gapLines(it, i, saved, task)}</div>`;
        return Array.isArray(it.options) ? `${lines}${optionsHtml(it, i, saved)}` : lines;
    }

    /** Long CKE-style instructions: first sentence always visible; the exam rules fold away on phones. */
    function instructionHtml(text) {
        const s = String(text || '');
        const m = s.match(/^(.+?[.!?])\s+(.{40,})$/s);
        if (!m) return `<span class="ot-instruction">${esc(s)}</span>`;
        return `<span class="ot-instruction ot-instruction--long">${esc(m[1])} <span class="ot-instr-rest">${esc(m[2])}</span><button type="button" class="ot-instr-more" aria-expanded="false">${esc(t('więcej', 'more'))}</button></span>`;
    }

    /** Word box above a gap-fill task's items (the cue when gaps have no bracket cue). */
    function wordBoxHtml(task) {
        const words = Array.isArray(task.wordBank) ? task.wordBank.filter(Boolean) : [];
        if (!words.length) return '';
        return `<div class="ot-wordbox" role="note" aria-label="${esc(t('Słowa do wykorzystania', 'Words to use'))}"><span class="ot-wordbox-label">${esc(t('Użyj słów', 'Use these words'))}</span>${words.map((w) => `<span class="ot-wordbox-word">${esc(w)}</span>`).join('')}</div>`;
    }

    function renderTask() {
        const L = lang();
        const tasks = lesson.tasks || [];
        const task = tasks[taskIndex];
        if (!task) return renderFeedback();

        const key = `t${taskIndex}`;
        const saved = answers[key] || {};
        const g = guidance(task);
        const items = task.items || [];
        const isWriting = task.type === 'writing' || !items.length;
        let layout = 'single';
        let body = '';

        if (task.type === 'word_order' || task.type === 'unscramble') {
            layout = task.type === 'word_order' ? 'words' : 'letters';
            body = `<ol class="ot-qs ot-qs--tiles ot-qs--${layout}">${items.map((it, i) => `<li class="ot-q ot-tiles-item" data-row="${i}" data-kind="${layout}">${layout === 'words'
                ? wordOrderInner(it, i)
                : unscrambleInner(it, i, (saved.items && saved.items[i]) || '')}</li>`).join('')}</ol>`;
        } else if (isWriting) {
            layout = 'writing';
            body = `
                <div class="ot-col-main">
                    ${task.prompt ? `<p class="ot-prompt">${esc(task.prompt).replace(/\n/g, '<br>')}</p>` : ''}
                    <textarea class="pe-input ot-write" id="ot-answer" rows="6" aria-label="${esc(t('Twoja odpowiedź', 'Your answer'))}" placeholder="${esc(g.useful[0] || (L === 'en' ? 'Write here…' : 'Napisz tutaj…'))}">${esc(saved.text || '')}</textarea>
                    <div class="ot-counter" id="ot-counter">${counterHtml(g.target, saved.text)}</div>
                </div>`;
        } else if (task.type === 'reading' && task.prompt) {
            layout = 'reading';
            body = `
                <div class="ot-reading">${ttsSupported() ? `<button type="button" class="ot-speak" id="ot-speak" aria-pressed="false" aria-label="${esc(t('Przeczytaj tekst na głos', 'Read the text aloud'))}" title="${esc(t('Przeczytaj tekst na głos', 'Read the text aloud'))}"><i class="fa-solid fa-volume-high"></i></button>` : ''}${esc(task.prompt).replace(/\n/g, '<br>')}</div>
                <ol class="ot-qs">${items.map((it, i) => `<li class="ot-q" data-row="${i}">${inlineItem(it, i, saved)}</li>`).join('')}</ol>`;
        } else {
            const gapped = gappedPrompt(task, saved);
            if (gapped) {
                layout = 'gapped';
                body = `<div class="ot-gapped-text">${gapped}</div>`;
                // Closed text formats (CKE "tekst z lukami — wybór"): one row of A/B/C(/D) options per gap under the text.
                if (items.some((it) => Array.isArray(it.options))) {
                    layout = 'gapped-mc';
                    body += `<ol class="ot-opt-rows">${items.map((it, i) => `<li class="ot-q" data-row="${i}"><span class="ot-gap-n">${i + 1}</span>${optionsHtml(it, i, saved)}</li>`).join('')}</ol>`;
                }
            } else {
                if (task.prompt) body += `<p class="ot-prompt">${esc(task.prompt).replace(/\n/g, '<br>')}</p>`;
                const sentences = items.some((it) => GAP_RE.test(String(it.q || '')));
                if (task.type === 'uoe' && task.format && task.format !== 'simple') {
                    layout = 'exam';
                    body += `<ol class="ot-qs ot-qs--exam ot-fmt--${esc(task.format)}">${items.map((it, i) => `<li class="ot-q" data-row="${i}">${uoeItemHtml(task, it, i, saved)}</li>`).join('')}</ol>`;
                } else {
                layout = sentences ? 'sentences' : 'grid';
                body += `<ol class="ot-qs ${sentences ? 'ot-qs--sentences' : 'ot-qs--grid'}">${items.map((it, i) => `<li class="ot-q" data-row="${i}">${inlineItem(it, i, saved)}</li>`).join('')}</ol>`;
                }
            }
        }

        const panels = [
            panel('steps', 'fa-shoe-prints', t('Jak to zrobić', 'How to do it'), `<ol class="ot-steps">${g.steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol>`, 'ot-steps-panel'),
            g.example ? panel('example', 'fa-eye', t('Przykład', 'Example'), `<p>${esc(g.example)}</p>`, 'ot-example') : '',
            g.useful.length ? panel('useful', 'fa-comment-dots', isWriting ? t('Przydatne zwroty', 'Useful language') : t('Przydatne słowa', 'Useful words'),
                `${isWriting ? `<p class="ot-panel-tip">${esc(t('Kliknij zwrot, by wstawić go do tekstu.', 'Click a phrase to insert it.'))}</p>` : ''}<div class="ot-phrases">${g.useful.map((ph) => isWriting
                    ? `<button type="button" class="ot-phrase" data-phrase="${esc(ph)}">${esc(ph)}</button>`
                    : `<span class="ot-phrase is-static">${esc(ph)}</span>`).join('')}</div>`, 'ot-useful') : '',
            g.hint ? panel('hint', 'fa-circle-question', t('Podpowiedź', 'Hint'), `<p>${esc(g.hint)}</p>`, 'ot-hint') : '',
            isWriting ? panel('plan', 'fa-lightbulb', t('Plan', 'Plan'),
                `<textarea id="ot-plan" class="pe-input" rows="2" placeholder="${esc(t('2–3 pomysły, np. sklep z lodami · klienci · telefon', '2–3 ideas, e.g. ice-cream shop · customers · phone'))}">${esc(saved.plan || '')}</textarea>`, 'ot-plan') : '',
            isWriting && (task.modelAnswers || []).length
                ? panel('model', 'fa-star', t('Przykładowa odpowiedź', 'Model answer'), task.modelAnswers.map((m) => `<p>${esc(m)}</p>`).join(''), 'ot-model') : '',
        ].filter(Boolean).join('');

        return `
            <div class="ot-card ot-lesson" data-type="${esc(task.type)}" data-layout="${layout}">
                <div class="ot-lesson-head">
                    <div class="ot-head-text">
                        <div class="ot-eyebrow">${lesson.extra ? `<span class="ot-extra-badge">${esc(t('Dodatkowy zestaw', 'Extra set'))}</span> ` : ''}${esc(lesson.focus || t('Twoja lekcja', 'Your lesson'))} · ${esc(lesson.cefr || '')}</div>
                        <h3 class="ot-heading">${esc(lesson.title || '')}</h3>
                    </div>
                    ${profiles.length ? profileBarHtml(true) : ''}
                    <button type="button" class="ot-reset-set" id="ot-reset-set" title="${esc(t('Zacznij ten zestaw od nowa', 'Restart this set'))}" aria-label="${esc(t('Zacznij ten zestaw od nowa', 'Restart this set'))}"><i class="fa-solid fa-rotate-left"></i><span class="ot-reset-label">${esc(t('Od nowa', 'Restart'))}</span></button>
                    <div class="ot-time" aria-live="polite">${esc(t(`Zadanie ${taskIndex + 1} z ${tasks.length}`, `Task ${taskIndex + 1} of ${tasks.length}`))}</div>
                </div>
                ${lesson.goal && taskIndex === 0 ? `<p class="ot-goal"><i class="fa-solid fa-bullseye"></i> ${esc(lesson.goal)}</p>` : ''}
                ${stepperHtml(tasks)}
                <div class="ot-task-line">
                    <span class="ot-badge"><i class="fa-solid ${esc((TYPE_LABELS[task.type] || TYPE_LABELS.writing).icon)}"></i> ${esc(typeLabel(task.type))}</span>
                    ${instructionHtml(task.instruction)}
                    ${task.format && UOE_FORMAT_NAMES[task.format] && task.format !== 'simple' ? `<span class="ot-exam-tag" title="${esc(EXAM_NAMES[task.exam] || '')}">${esc(task.exam ? `${EXAM_SHORT[task.exam] || task.exam} · ` : '')}${esc(UOE_FORMAT_NAMES[task.format])}</span>` : ''}
                    ${g.target ? `<span class="ot-task-meta">${esc(g.target.minSentences)}–${esc(g.target.maxSentences)} ${esc(t('zdań', 'sentences'))}</span>` : ''}
                </div>
                <div class="ot-work ot-work--${layout}">
                    <div class="ot-panels" role="group" aria-label="${esc(t('Pomoc', 'Help'))}">${panels}</div>
                    <div class="ot-body ot-body--${layout}">${wordBoxHtml(task)}${body}</div>
                </div>
                <div id="ot-task-check" class="ot-check-msg" hidden></div>
                <div class="ot-actions">
                    ${taskIndex > 0 ? `<button type="button" class="btn btn-grey" id="ot-prev"><i class="fa-solid fa-arrow-left"></i> <span class="ot-long">${esc(t('Wstecz', 'Back'))}</span></button>` : ''}
                    ${items.length ? `<button type="button" class="btn btn-outline" id="ot-check"><i class="fa-solid fa-check-double"></i> ${esc(L === 'en' ? 'Check' : 'Sprawdź')}</button>` : ''}
                    <button type="button" class="btn btn-blue" id="ot-next">${taskIndex + 1 < tasks.length
                        ? `<span class="ot-long">${esc(L === 'en' ? 'Next task' : 'Następne zadanie')}</span><span class="ot-short">${esc(L === 'en' ? 'Next' : 'Dalej')}</span>`
                        : esc(L === 'en' ? 'Finish' : 'Zakończ')} <i class="fa-solid fa-arrow-right"></i></button>
                    ${lesson.coachNote && taskIndex === 0 ? `<span class="ot-coach"><i class="fa-solid fa-heart"></i> ${esc(lesson.coachNote)}</span>` : ''}
                </div>
            </div>`;
    }

    function renderFeedback() {
        const L = lang();
        const tasks = (lesson && lesson.tasks) || [];
        const summary = tasks.map((tk, i) => {
            const a = answers[`t${i}`] || {};
            let res = '';
            if (a.checked) res = `${a.checked.ok}/${a.checked.total} ${t('poprawnie', 'correct')}`;
            else if (tk.type === 'writing' || !(tk.items || []).length) { const c = countText(a.text); res = `${c.sentences} ${t('zdań', 'sentences')} · ${c.words} ${t('słów', 'words')}`; }
            else res = t('nie sprawdzono', 'not checked');
            return `<li><span class="ot-badge">${esc(typeLabel(tk.type))}</span> <span>${esc(res)}</span></li>`;
        }).join('');
        return `
            <div class="ot-card">
                ${tasks.length ? stepperHtml(tasks) : ''}
                ${tasks.length ? `<div class="ot-results"><div class="ot-side-title"><i class="fa-solid fa-trophy"></i> ${esc(t('Twoje wyniki', 'Your results'))}</div><ul>${summary}</ul></div>` : ''}
                <h3 class="ot-heading">${esc(L === 'en' ? 'How was this lesson?' : 'Jak było na lekcji?')}</h3>
                <p class="ot-lead">${esc(L === 'en'
                    ? 'Your answers help us plan the next session.'
                    : 'Twoje odpowiedzi pomogą zaplanować następną sesję.')}</p>
                <label class="ot-block-label">${esc(L === 'en' ? 'Was the level OK?' : 'Czy poziom był OK?')}</label>
                <div class="ot-chips" id="ot-fb-level">
                    <label class="ot-chip"><input type="radio" name="ot-level" value="too_easy"> ${esc(L === 'en' ? 'Too easy' : 'Za łatwo')}</label>
                    <label class="ot-chip"><input type="radio" name="ot-level" value="ok" checked> ${esc(L === 'en' ? 'OK' : 'OK')}</label>
                    <label class="ot-chip"><input type="radio" name="ot-level" value="too_hard"> ${esc(L === 'en' ? 'Too hard' : 'Za trudno')}</label>
                </div>
                <label class="ot-block-label">${esc(L === 'en' ? 'Next time' : 'Następnym razem')}</label>
                <div class="ot-chips" id="ot-fb-mode">
                    <label class="ot-chip"><input type="radio" name="ot-mode" value="new" checked> ${esc(L === 'en' ? 'Something new' : 'Coś nowego')}</label>
                    <label class="ot-chip"><input type="radio" name="ot-mode" value="revise"> ${esc(L === 'en' ? 'Revise' : 'Powtórka')}</label>
                </div>
                <label class="ot-block-label">${esc(L === 'en' ? 'I want to practise' : 'Chcę ćwiczyć')}</label>
                <div class="ot-chips" id="ot-fb-focus">
                    <label class="ot-chip"><input type="radio" name="ot-focus" value="drill"> ${esc(L === 'en' ? 'Drills' : 'Drill')}</label>
                    <label class="ot-chip"><input type="radio" name="ot-focus" value="uoe" checked> Use of English</label>
                    <label class="ot-chip"><input type="radio" name="ot-focus" value="reading"> ${esc(L === 'en' ? 'Reading' : 'Czytanie')}</label>
                    <label class="ot-chip"><input type="radio" name="ot-focus" value="writing"> ${esc(L === 'en' ? 'Writing' : 'Pisanie')}</label>
                    <label class="ot-chip"><input type="radio" name="ot-focus" value="vocab"> ${esc(L === 'en' ? 'Vocabulary' : 'Słownictwo')}</label>
                </div>
                <label class="ot-block-label">${esc(L === 'en' ? 'Note for next time (optional)' : 'Notatka na następny raz (opcjonalnie)')}
                    <textarea id="ot-fb-note" class="pe-input" rows="2"></textarea>
                </label>
                <div class="ot-actions">
                    <button type="button" class="btn btn-blue" id="ot-save-fb">${esc(L === 'en' ? 'Save & finish' : 'Zapisz i zakończ')}</button>
                    ${today && today.extrasLeft === 0 ? '' : `<button type="button" class="btn btn-outline ot-keep-going" id="ot-save-keep"><i class="fa-solid fa-forward" aria-hidden="true"></i> ${esc(t('Zapisz i ćwicz dalej', 'Save & keep going'))}</button>`}
                </div>
            </div>`;
    }

    /* ---------- Profiles: switcher + server-side progress ---------- */
    function initials(name) {
        const s = String(name || '?').trim();
        const words = s.split(/\s+/).filter((w) => /\p{L}/u.test(w));
        return (words.slice(0, 2).map((w) => w.match(/\p{L}/u)[0]).join('') || '?').toUpperCase();
    }
    const AVATAR_TONES = ['#1B2A4A', '#2C6E8F', '#7A4FA0', '#B5651D', '#2F7D5B'];
    // Chosen avatar colours (same keys as OWN_TIME_AVATAR_TONES on the server).
    const AVATAR_PICK = { navy: '#1B2A4A', teal: '#2C6E8F', violet: '#7A4FA0', amber: '#B5651D', green: '#2F7D5B', rose: '#B23A5B' };
    function avatarHtml(p, cls) {
        const tone = AVATAR_PICK[p?.avatar] || AVATAR_TONES[(Number(p?.id) || 0) % AVATAR_TONES.length];
        return `<span class="ot-avatar ${cls || ''}" style="--ot-av:${tone}" aria-hidden="true">${esc(initials(p?.name))}</span>`;
    }
    function progressLabel(pr) {
        if (!pr) return '';
        return pr.view === 'feedback' ? t('Podsumowanie', 'Wrap-up') : t(`Zadanie ${pr.taskIndex + 1} z ${pr.tasks}`, `Task ${pr.taskIndex + 1} of ${pr.tasks}`);
    }
    function profileBarHtml(compact) {
        const cur = profiles.find((x) => x.id === profileId) || profiles[0];
        if (!cur) return '';
        return `<div class="ot-pbar${compact ? ' ot-pbar--compact' : ''}">
            <button type="button" class="ot-pchip" id="ot-pswitch" aria-haspopup="dialog" aria-expanded="${pmenu.open}" aria-controls="ot-pmenu">
                ${avatarHtml(cur)}<span class="ot-pchip-text"><span class="ot-pchip-label">${esc(t('Profil', 'Profile'))}</span><strong>${esc(cur.name)}</strong></span>
                ${cur.configured ? `<span class="ot-plevel">${esc(cur.cefr)}</span>` : ''}<i class="fa-solid fa-chevron-down ot-pchip-chev" aria-hidden="true"></i>
            </button>
            ${profiles.length > 1 && !compact ? `<span class="ot-pcount">${esc(t(`${profiles.length} ${profiles.length < 5 ? 'profile' : 'profili'}`, `${profiles.length} profiles`))}</span>` : ''}
            <div id="ot-pmenu-host">${pmenu.open ? profileMenuHtml() : ''}</div>
        </div>`;
    }
    function profileMenuHtml() {
        // The active profile's progress comes from the live lesson (the list may be a few seconds old).
        const live = lesson && (view === 'lesson' || view === 'feedback')
            ? { title: lesson.title || '', taskIndex, tasks: (lesson.tasks || []).length, view } : null;
        const rows = profiles.map((p0) => {
            const p = p0.id === profileId ? { ...p0, progress: live } : p0;
            if (pmenu.deleting === p.id) {
                return `<li class="ot-prow is-confirm" data-pid="${p.id}">
                    <div class="ot-pconfirm" role="alertdialog" aria-label="${esc(t('Potwierdź usunięcie', 'Confirm delete'))}">
                        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                        <span>${esc(t(`Usunąć profil „${p.name}” razem z historią lekcji?`, `Delete “${p.name}” and its lesson history?`))}</span>
                        <span class="ot-prow-actions"><button type="button" class="ot-pbtn is-danger" data-pact="confirm-delete" data-pid="${p.id}">${esc(t('Usuń', 'Delete'))}</button>
                        <button type="button" class="ot-pbtn" data-pact="cancel">${esc(t('Anuluj', 'Cancel'))}</button></span>
                    </div></li>`;
            }
            if (pmenu.renaming === p.id) {
                return `<li class="ot-prow is-edit" data-pid="${p.id}">${avatarHtml(p)}
                    <form class="ot-pform" data-pform="rename" data-pid="${p.id}"><input type="text" class="pe-input" id="ot-prename" maxlength="40" value="${esc(p.name)}" aria-label="${esc(t('Nowa nazwa profilu', 'New profile name'))}" required>
                    <button type="submit" class="ot-pbtn is-primary">${esc(t('Zapisz', 'Save'))}</button><button type="button" class="ot-pbtn" data-pact="cancel">${esc(t('Anuluj', 'Cancel'))}</button></form></li>`;
            }
            const meta = p.configured ? `${p.cefr}${p.age != null ? ` · ${t('wiek', 'age')} ${p.age}` : ''}` : t('do uzupełnienia', 'not set up yet');
            return `<li class="ot-prow${p.id === profileId ? ' is-active' : ''}" data-pid="${p.id}">
                <button type="button" class="ot-pmain" data-pact="switch" data-pid="${p.id}" ${p.id === profileId ? 'aria-current="true"' : ''}>
                    ${avatarHtml(p)}<span class="ot-pinfo"><strong>${esc(p.name)}</strong><span>${esc(meta)}</span></span>
                    ${p.progress ? `<span class="ot-pprog" title="${esc(p.progress.title)}"><i class="fa-solid fa-circle-play" aria-hidden="true"></i> ${esc(progressLabel(p.progress))}</span>` : ''}
                    ${p.id === profileId ? `<span class="ot-pactive" title="${esc(t('Aktywny', 'Active'))}"><i class="fa-solid fa-check" aria-hidden="true"></i><span class="ot-pactive-txt"> ${esc(t('Aktywny', 'Active'))}</span></span>` : ''}
                </button>
                <span class="ot-prow-actions">
                    <button type="button" class="ot-picon" data-pact="edit" data-pid="${p.id}" title="${esc(t('Edytuj profil', 'Edit profile'))}" aria-label="${esc(t(`Edytuj profil: ${p.name}`, `Edit profile: ${p.name}`))}"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="ot-picon is-danger" data-pact="delete" data-pid="${p.id}" title="${esc(t('Usuń', 'Delete'))}" aria-label="${esc(t(`Usuń: ${p.name}`, `Delete ${p.name}`))}"${profiles.length <= 1 ? ' disabled' : ''}><i class="fa-solid fa-trash"></i></button>
                </span></li>`;
        }).join('');
        const full = profiles.length >= profileLimit;
        const create = pmenu.creating
            ? `<form class="ot-pform ot-pcreate" data-pform="create"><input type="text" class="pe-input" id="ot-pnew" maxlength="40" placeholder="${esc(t('np. Ola, Kuba, Matura', 'e.g. Ola, Kuba, Exam'))}" aria-label="${esc(t('Nazwa nowego profilu', 'New profile name'))}" required>
                <button type="submit" class="ot-pbtn is-primary">${esc(t('Utwórz', 'Create'))}</button><button type="button" class="ot-pbtn" data-pact="cancel">${esc(t('Anuluj', 'Cancel'))}</button></form>`
            : `<button type="button" class="ot-padd" data-pact="new"${full ? ' disabled' : ''}><i class="fa-solid fa-plus" aria-hidden="true"></i> ${esc(t('Nowy profil', 'New profile'))}</button>
               <span class="ot-plimit">${esc(full ? t(`Limit: ${profileLimit} profili`, `Limit: ${profileLimit} profiles`) : t(`${profiles.length} z ${profileLimit}`, `${profiles.length} of ${profileLimit}`))}</span>`;
        return `<div class="ot-pmenu" id="ot-pmenu" role="dialog" aria-label="${esc(t('Profile', 'Profiles'))}">
            <div class="ot-pmenu-head"><strong>${esc(t('Twoje profile', 'Your profiles'))}</strong><span>${esc(t('Postęp każdego profilu zapisuje się automatycznie.', 'Each profile’s progress is saved automatically.'))}</span></div>
            <ul class="ot-plist">${rows}</ul>
            <div class="ot-pfoot">${create}</div>
        </div>`;
    }
    function repaintMenu(focusSel) {
        const host = document.getElementById('ot-pmenu-host');
        if (!host) return;
        host.innerHTML = pmenu.open ? profileMenuHtml() : '';
        document.getElementById('ot-pswitch')?.setAttribute('aria-expanded', String(pmenu.open));
        if (focusSel) host.querySelector(focusSel)?.focus();
    }
    /** Full preferences edit for any profile (switches to it first; the in-progress set is kept). */
    let editReturn = 'dash';
    async function editProfile(id) {
        closeMenu();
        if (id && id !== profileId) await switchProfile(id);
        if (id && id !== profileId) return; // switch failed
        if (view === 'onboard') { paint(); return; } // not set up yet: the setup form is the editor
        editReturn = view === 'edit' ? editReturn : view;
        view = 'edit';
        paint();
        root()?.querySelector('.ot-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    function leaveEdit() {
        view = editReturn === 'lesson' && lesson ? 'lesson' : (editReturn === 'feedback' && lesson ? 'feedback' : 'dash');
        editReturn = 'dash';
    }
    function closeMenu() { Object.assign(pmenu, { open: false, renaming: null, deleting: null, creating: false }); repaintMenu(); }

    /** Back to task 1 of the same set with a clean slate; persisted immediately (server progress). */
    function resetCurrentSet() {
        if (!lesson) return;
        stopSpeaking();
        answers = {};
        Object.keys(tileState).forEach((k) => delete tileState[k]);
        openPanels.clear();
        taskIndex = 0;
        startedAt = Date.now();
        view = 'lesson';
        paint();
        root()?.querySelector('.ot-lesson')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
        saveProgressNow();
        setStatus(t('Zestaw zaczęty od nowa — te same zadania, czyste odpowiedzi.', 'Set restarted — same tasks, clean answers.'), 'success');
    }

    /** Snapshot of the current lesson (answers typed so far, current task, word-order tiles). */
    function progressSnapshot() {
        if (!lesson || (view !== 'lesson' && view !== 'feedback')) return null;
        if (view === 'lesson' && root()?.querySelector('.ot-lesson')) collectTaskAnswers();
        return { lesson, taskIndex, view, answers, tileState: { ...tileState }, openPanels: [...openPanels], startedAt };
    }
    async function saveProgressNow(opts = {}) {
        clearTimeout(progressTimer);
        progressTimer = null;
        const pid = profileId;
        if (!pid) return;
        const progress = progressSnapshot();
        if (!progress && !opts.clear) return;
        const body = JSON.stringify({ profileId: pid, progress: opts.clear ? null : progress });
        try {
            await fetch('/api/own-time/progress', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: !!opts.keepalive });
        } catch (_) { /* best effort; retried on the next change */ }
    }
    function scheduleProgressSave() {
        if (!lesson || (view !== 'lesson' && view !== 'feedback')) return;
        clearTimeout(progressTimer);
        progressTimer = setTimeout(() => saveProgressNow(), 1200);
    }
    function restoreProgress(pr) {
        if (!pr || !pr.lesson) return false;
        lesson = pr.lesson;
        taskIndex = Math.max(0, Math.min((lesson.tasks || []).length - 1, Number(pr.taskIndex) || 0));
        answers = pr.answers || {};
        Object.keys(tileState).forEach((k) => delete tileState[k]);
        Object.assign(tileState, pr.tileState || {});
        openPanels.clear();
        (pr.openPanels || []).forEach((k) => openPanels.add(k));
        startedAt = Number(pr.startedAt) || Date.now();
        view = pr.view === 'feedback' ? 'feedback' : 'lesson';
        return true;
    }
    async function loadProfiles() {
        const data = await api('/api/own-time/profiles');
        profiles = data.profiles || [];
        profileId = data.activeId || profiles[0]?.id || null;
        profileLimit = data.limit || profileLimit;
    }
    /** Load the active profile: settings, its history/today, and resume its in-progress lesson if any. */
    async function loadActive() {
        const [pRes, lRes] = await Promise.all([
            api('/api/own-time/profile'),
            api(`/api/own-time/lessons?limit=20${profileId ? `&profileId=${profileId}` : ''}`),
        ]);
        profile = pRes.profile;
        if (pRes.profileId) profileId = pRes.profileId;
        lessons = lRes.lessons || [];
        today = lRes.today || null;
        capMessage = '';
        lastFinished = null;
        lesson = null;
        answers = {};
        taskIndex = 0;
        if (!profile) { view = 'onboard'; return false; }
        if (restoreProgress(pRes.progress)) return true;
        view = 'dash';
        return false;
    }
    async function switchProfile(id) {
        if (id === profileId) { closeMenu(); return; }
        await saveProgressNow();
        try {
            toggleLoading(true);
            await api(`/api/own-time/profiles/${id}/activate`, { method: 'POST', body: '{}' });
            await loadProfiles();
            closeMenu();
            const resumed = await loadActive();
            toggleLoading(false);
            paint();
            const name = profiles.find((x) => x.id === profileId)?.name || '';
            setStatus(resumed
                ? esc(t(`Profil „${name}” — wznowiono: ${view === 'feedback' ? 'podsumowanie' : `zadanie ${taskIndex + 1} z ${lesson.tasks.length}`}.`, `Profile “${name}” — resumed at ${view === 'feedback' ? 'the wrap-up' : `task ${taskIndex + 1} of ${lesson.tasks.length}`}.`))
                : esc(t(`Przełączono na profil „${name}”.`, `Switched to “${name}”.`)), 'success');
        } catch (err) {
            toggleLoading(false);
            setStatus(esc(err.message || t('Nie udało się przełączyć profilu.', 'Could not switch profile.')), 'error');
        }
    }
    async function profileAction(act, id, value) {
        try {
            if (act === 'create') {
                await saveProgressNow();
                await api('/api/own-time/profiles', { method: 'POST', body: JSON.stringify({ name: value }) });
                await loadProfiles();
                closeMenu();
                await loadActive();
                paint();
                setStatus(esc(t(`Utworzono profil „${value}”. Uzupełnij go poniżej.`, `Created “${value}”. Fill it in below.`)), 'success');
            } else if (act === 'rename') {
                const data = await api(`/api/own-time/profiles/${id}`, { method: 'PATCH', body: JSON.stringify({ name: value }) });
                profiles = data.profiles || profiles;
                pmenu.renaming = null;
                const chip = document.querySelector('#ot-pswitch strong');
                if (chip && id === profileId) chip.textContent = value;
                repaintMenu(`[data-pact="switch"][data-pid="${id}"]`);
            } else if (act === 'delete') {
                const wasActive = id === profileId;
                await api(`/api/own-time/profiles/${id}`, { method: 'DELETE' });
                await loadProfiles();
                pmenu.deleting = null;
                if (wasActive) { closeMenu(); await loadActive(); paint(); } else { pmenu.open = true; repaintMenu(); }
                setStatus(esc(t('Profil usunięty.', 'Profile deleted.')), 'success');
            }
        } catch (err) {
            setStatus(esc(err.data?.code === 'limit'
                ? t(`Możesz mieć maksymalnie ${profileLimit} profili.`, `You can have up to ${profileLimit} profiles.`)
                : (err.message || t('Coś poszło nie tak.', 'Something went wrong.'))), 'error');
        }
    }
    function bindProfiles(el) {
        const bar = el.querySelector('.ot-pbar');
        if (!bar) return;
        document.getElementById('ot-pswitch')?.addEventListener('click', () => {
            pmenu.open = !pmenu.open;
            pmenu.renaming = pmenu.deleting = null;
            pmenu.creating = false;
            repaintMenu(pmenu.open ? '.ot-prow.is-active .ot-pmain, .ot-pmain' : null);
        });
        bar.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-pact]');
            if (!b || b.disabled) return;
            const id = Number(b.dataset.pid) || null;
            const act = b.dataset.pact;
            if (act === 'switch') switchProfile(id);
            else if (act === 'edit') editProfile(id);
            else if (act === 'rename') { pmenu.renaming = id; pmenu.deleting = null; pmenu.creating = false; repaintMenu('#ot-prename'); }
            else if (act === 'delete') { pmenu.deleting = id; pmenu.renaming = null; pmenu.creating = false; repaintMenu('[data-pact="cancel"]'); }
            else if (act === 'confirm-delete') profileAction('delete', id);
            else if (act === 'new') { pmenu.creating = true; pmenu.renaming = pmenu.deleting = null; repaintMenu('#ot-pnew'); }
            else if (act === 'cancel') { pmenu.renaming = pmenu.deleting = null; pmenu.creating = false; repaintMenu('#ot-pswitch'); }
        });
        bar.addEventListener('submit', (ev) => {
            const f = ev.target.closest('[data-pform]');
            if (!f) return;
            ev.preventDefault();
            const v = String(f.querySelector('input')?.value || '').trim();
            if (!v) return;
            if (f.dataset.pform === 'create') profileAction('create', null, v);
            else profileAction('rename', Number(f.dataset.pid), v);
        });
        bar.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && pmenu.open) { ev.preventDefault(); closeMenu(); document.getElementById('ot-pswitch')?.focus(); }
        });
    }

    function paint() {
        const el = root();
        if (!el) return;
        stopSpeaking(); // leaving / re-rendering a task always stops the read-aloud
        let html = '';
        if (view === 'onboard' || view === 'edit') html = renderOnboard(view === 'edit');
        else if (view === 'dash') html = renderDash();
        else if (view === 'lesson') html = renderTask();
        else if (view === 'feedback') html = renderFeedback();
        else if (view === 'done') html = renderDone();
        // The initial setup screen has its own profile picker, so the dropdown bar is not repeated there.
        el.innerHTML = html && profiles.length && view !== 'lesson' && view !== 'onboard' ? profileBarHtml() + html : html;
        bind();
        if (view === 'lesson') {
            // Bring the whole task card into view so the task fits on one screen.
            const card = el.querySelector('.ot-lesson');
            const top = card ? card.getBoundingClientRect().top + window.scrollY - 8 : 0;
            if (card && Math.abs(window.scrollY - top) > 4) window.scrollTo({ top, behavior: 'auto' });
        }
    }

    function collectTaskAnswers() {
        const key = `t${taskIndex}`;
        const task = lesson.tasks[taskIndex];
        const items = [];
        root().querySelectorAll('.ot-item').forEach((inp) => {
            items[Number(inp.dataset.i)] = inp.value;
        });
        const textEl = document.getElementById('ot-answer');
        const planEl = document.getElementById('ot-plan');
        const prev = answers[key] || {};
        answers[key] = {
            type: task.type,
            text: textEl ? textEl.value : '',
            items,
            plan: planEl ? planEl.value : '',
            ...(prev.checked ? { checked: prev.checked } : {}),
            ...(prev.verdicts ? { verdicts: prev.verdicts } : {}), // AI re-check results (layer 3), keyed by item
        };
        return answers[key];
    }

    function rerenderTileRow(i, focusSel) {
        const task = lesson?.tasks?.[taskIndex];
        const row = root()?.querySelector(`.ot-tiles-item[data-row="${i}"]`);
        if (!task || !row) return;
        const it = task.items[i];
        if (row.dataset.kind === 'words') row.innerHTML = wordOrderInner(it, i);
        else row.innerHTML = unscrambleInner(it, i, row.querySelector('.ot-unscramble-input')?.value || '');
        row.classList.remove('is-ok', 'is-wrong');
        const mark = row.querySelector('.ot-mark');
        if (mark) mark.innerHTML = '';
        if (focusSel) (row.querySelector(focusSel) || row.querySelector('.ot-tile, .ot-unscramble-input'))?.focus();
    }

    function revealTileRow(task, i) {
        const it = task.items[i];
        const row = root()?.querySelector(`.ot-tiles-item[data-row="${i}"]`);
        if (!it || !row) return;
        if (row.dataset.kind === 'words') {
            // Map the answer's words onto tile indexes (case/punctuation-insensitive).
            const want = looseKey(it.answer).split(' ');
            const free = it.tiles.map((w, k) => ({ w: looseKey(w), k }));
            const order = [];
            for (const w of want) {
                const hit = free.find((f) => f.w === w && !order.includes(f.k));
                if (hit) order.push(hit.k);
            }
            if (order.length === it.tiles.length) tileState[`${taskIndex}:${i}`] = order;
            rerenderTileRow(i);
        } else {
            const inp = row.querySelector('.ot-unscramble-input');
            if (inp) inp.value = it.answer;
            rerenderTileRow(i);
        }
        row.classList.add('is-revealed');
        const mark = row.querySelector('.ot-mark');
        if (mark) { mark.innerHTML = '<i class="fa-solid fa-eye"></i>'; mark.className = 'ot-mark revealed'; }
    }

    function bindTiles(el) {
        const items = () => lesson?.tasks?.[taskIndex]?.items || [];
        el.querySelectorAll('.ot-qs--tiles').forEach((list) => {
            list.addEventListener('click', (ev) => {
                const reset = ev.target.closest('[data-reset]');
                if (reset) {
                    const i = Number(reset.dataset.reset);
                    tileState[`${taskIndex}:${i}`] = [];
                    const inp = list.querySelector(`.ot-unscramble-input[data-i="${i}"]`);
                    if (inp) inp.value = '';
                    rerenderTileRow(i, '.ot-bank .ot-tile');
                    return;
                }
                const tile = ev.target.closest('button.ot-tile');
                if (!tile) return;
                const row = tile.closest('.ot-tiles-item');
                const i = Number(row.dataset.row);
                if (row.dataset.kind === 'words') {
                    const k = Number(tile.dataset.k);
                    const order = placed(i);
                    if (tile.dataset.where === 'bank') order.push(k);
                    else order.splice(order.indexOf(k), 1);
                    rerenderTileRow(i, tile.dataset.where === 'bank' ? '.ot-bank button.ot-tile' : '.ot-line .ot-tile:last-child');
                    const added = tile.dataset.where === 'bank' ? row.querySelector('.ot-line .ot-tile:last-child') : null;
                    added?.classList.add('pop');
                } else {
                    const it = items()[i];
                    const inp = row.querySelector('.ot-unscramble-input');
                    inp.value += it.tiles[Number(tile.dataset.l)];
                    rerenderTileRow(i, '.ot-tile--letter:not([disabled])');
                }
            });
            // Keyboard: arrows move a placed word left/right; Backspace/Delete sends it back.
            list.addEventListener('keydown', (ev) => {
                const tile = ev.target.closest('.ot-line .ot-tile');
                if (!tile) return;
                const row = tile.closest('.ot-tiles-item');
                const i = Number(row.dataset.row);
                const order = placed(i);
                const k = Number(tile.dataset.k);
                const pos = order.indexOf(k);
                let to = null;
                if (ev.key === 'ArrowLeft' && pos > 0) to = pos - 1;
                if (ev.key === 'ArrowRight' && pos < order.length - 1) to = pos + 1;
                if (to != null) {
                    ev.preventDefault();
                    order.splice(pos, 1);
                    order.splice(to, 0, k);
                    rerenderTileRow(i, `.ot-line .ot-tile[data-k="${k}"]`);
                } else if (ev.key === 'Backspace' || ev.key === 'Delete') {
                    ev.preventDefault();
                    order.splice(pos, 1);
                    rerenderTileRow(i, '.ot-line .ot-tile:last-child');
                }
            });
            list.addEventListener('input', (ev) => {
                const inp = ev.target.closest('.ot-unscramble-input');
                if (!inp) return;
                const row = inp.closest('.ot-tiles-item');
                const it = items()[Number(row.dataset.row)];
                const used = letterUse(it, inp.value);
                row.querySelectorAll('.ot-tile--letter').forEach((b) => {
                    const u = used.has(Number(b.dataset.l));
                    b.classList.toggle('is-used', u);
                    b.disabled = u;
                });
                row.classList.remove('is-ok', 'is-wrong');
            });
            // Desktop drag & drop (tap/click and keyboard work everywhere).
            let drag = null;
            list.addEventListener('dragstart', (ev) => {
                const tile = ev.target.closest('.ot-tile[data-k]');
                if (!tile) return;
                drag = { i: Number(tile.closest('.ot-tiles-item').dataset.row), k: Number(tile.dataset.k) };
                ev.dataTransfer.effectAllowed = 'move';
                ev.dataTransfer.setData('text/plain', String(drag.k));
                tile.classList.add('is-dragging');
            });
            list.addEventListener('dragend', () => { drag = null; list.querySelectorAll('.is-over').forEach((z) => z.classList.remove('is-over')); });
            list.addEventListener('dragover', (ev) => {
                const zone = ev.target.closest('[data-zone="line"], [data-zone="bank"]');
                if (!zone || !drag || Number(zone.dataset.i) !== drag.i) return;
                ev.preventDefault();
                zone.classList.add('is-over');
            });
            list.addEventListener('dragleave', (ev) => ev.target.closest?.('[data-zone]')?.classList.remove('is-over'));
            list.addEventListener('drop', (ev) => {
                const zone = ev.target.closest('[data-zone="line"], [data-zone="bank"]');
                if (!zone || !drag || Number(zone.dataset.i) !== drag.i) return;
                ev.preventDefault();
                const order = placed(drag.i);
                const from = order.indexOf(drag.k);
                if (from >= 0) order.splice(from, 1);
                if (zone.dataset.zone === 'line') {
                    const before = ev.target.closest('.ot-line .ot-tile');
                    let at = order.length;
                    if (before && Number(before.dataset.k) !== drag.k) {
                        const r = before.getBoundingClientRect();
                        at = order.indexOf(Number(before.dataset.k)) + (ev.clientX > r.left + r.width / 2 ? 1 : 0);
                    }
                    order.splice(at, 0, drag.k);
                }
                const i = drag.i;
                drag = null;
                rerenderTileRow(i);
            });
        });
    }

    /** Choose an option for a closed (A/B/C/D) item: hidden value, chips, gap slot and mirrors. */
    function pickOption(el, i, v) {
        const inp = el.querySelector(`.ot-item[data-i="${i}"]`);
        if (inp) { inp.value = v; inp.classList.remove('is-ok', 'is-wrong'); }
        el.querySelectorAll(`.ot-opt[data-opt="${i}"]`).forEach((b) => {
            const on = b.dataset.v === v;
            b.classList.toggle('is-picked', on);
            b.setAttribute('aria-checked', String(on));
            b.classList.remove('is-ok', 'is-wrong');
        });
        el.querySelectorAll(`[data-slot="${i}"], [data-mirror="${i}"]`).forEach((s) => {
            s.textContent = v || '\u00a0';
            s.classList.toggle('is-filled', !!v);
            s.classList.remove('is-ok', 'is-wrong', 'is-revealed', 'pop');
            void s.offsetWidth;
            s.classList.add('pop');
        });
        el.querySelectorAll(`[data-row="${i}"]`).forEach((r) => r.classList.remove('is-ok', 'is-wrong'));
        const mark = el.querySelector(`[data-mark="${i}"]`);
        if (mark) { mark.innerHTML = ''; mark.className = 'ot-mark'; }
    }

    function bind() {
        const el = root();
        if (!el) return;
        bindProfiles(el);
        bindProfilePicker(el);
        // Autosave the in-progress lesson (debounced) whenever the student types or taps something.
        if (view === 'lesson' || view === 'feedback') {
            const work = el.querySelector('.ot-lesson, .ot-card');
            work?.addEventListener('input', scheduleProgressSave);
            work?.addEventListener('click', (ev) => { if (ev.target.closest('.ot-tile, .ot-opt, [data-reset], #ot-check, #ot-show-answers, .ot-phrase')) scheduleProgressSave(); });
        }
        el.querySelectorAll('.ot-instr-more').forEach((b) => b.addEventListener('click', () => {
            const open = b.parentElement.classList.toggle('is-open');
            b.setAttribute('aria-expanded', String(open));
            b.textContent = open ? t('mniej', 'less') : t('więcej', 'more');
        }));
        el.querySelectorAll('.ot-opt').forEach((b) => b.addEventListener('click', () => pickOption(el, Number(b.dataset.opt), b.dataset.v)));
        // Two-sentence / lexical-set items: the typed word also appears in the other gaps.
        el.querySelectorAll('input.ot-item').forEach((inp) => inp.addEventListener('input', () => {
            el.querySelectorAll(`[data-mirror="${inp.dataset.i}"]`).forEach((m) => { m.textContent = inp.value || '\u00a0'; m.classList.toggle('is-filled', !!inp.value); });
        }));

        document.getElementById('ot-speak')?.addEventListener('click', (ev) => {
            const btn = ev.currentTarget;
            if (speakingBtn === btn) { stopSpeaking(); return; }
            speakText(lesson?.tasks?.[taskIndex]?.prompt || '', btn);
        });
        if (document.getElementById('ot-voice')) {
            fillVoiceSelect();
            document.getElementById('ot-voice').addEventListener('change', stopSpeaking);
            document.getElementById('ot-voice-preview')?.addEventListener('click', (ev) => {
                const btn = ev.currentTarget;
                if (speakingBtn === btn) { stopSpeaking(); return; }
                const sample = targetLangCode() === 'de' ? 'Hallo! So klingt diese Stimme beim Vorlesen.' : 'Hello! This is how this voice sounds when it reads a text to you.';
                speakText(sample, btn, document.getElementById('ot-voice').value);
            });
        }

        const ageEl = document.getElementById('ot-age');
        const cefrEl = document.getElementById('ot-cefr');
        const syncOffer = () => {
            const wrap = document.getElementById('ot-instr-lang-wrap');
            if (!wrap) return;
            const offer = canOfferEnglish({
                age: Number(ageEl?.value),
                cefr: cefrEl?.value,
            });
            wrap.style.display = offer ? '' : 'none';
            if (!offer) {
                const pl = wrap.querySelector('input[value="pl"]');
                if (pl) pl.checked = true;
            }
        };
        ageEl?.addEventListener('change', syncOffer);
        cefrEl?.addEventListener('change', syncOffer);

        document.getElementById('ot-save-profile')?.addEventListener('click', async () => {
            const form = readForm();
            const bad = profileFormError(form);
            if (bad) { setStatus(esc(bad.msg), 'error'); document.getElementById(bad.field)?.focus(); return; }
            const wasEdit = view === 'edit';
            try {
                setStatus(t('Zapisuję…', 'Saving…'), 'neutral');
                const data = await api('/api/own-time/profile', {
                    method: 'PUT',
                    body: JSON.stringify(form),
                });
                profile = data.profile;
                const voiceSel = document.getElementById('ot-voice');
                if (voiceSel) { try { localStorage.setItem(VOICE_KEY(profileId), voiceSel.value); } catch (_) { /* private mode */ } }
                await loadProfiles().catch(() => {});
                if (wasEdit) leaveEdit(); else view = 'dash';
                paint();
                setStatus(wasEdit && lesson ? t('Profil zapisany. Zmiany obowiązują od następnego zestawu.', 'Profile saved. Changes apply from the next set.') : t('Profil zapisany.', 'Profile saved.'), 'success');
            } catch (err) {
                setStatus(esc(err.message || t('Nie udało się zapisać.', 'Could not save.')), 'error');
            }
        });

        document.getElementById('ot-cancel-edit')?.addEventListener('click', () => {
            leaveEdit();
            paint();
        });

        document.getElementById('ot-edit-profile')?.addEventListener('click', () => {
            editReturn = view;
            view = 'edit';
            paint();
        });

        document.getElementById('ot-cefr')?.addEventListener('change', (ev) => {
            const note = document.getElementById('ot-level-note');
            if (note) note.hidden = !profile || ev.target.value === profile.cefr;
        });

        document.getElementById('ot-start')?.addEventListener('click', startLesson);

        document.getElementById('ot-check')?.addEventListener('click', () => {
            const task = lesson.tasks[taskIndex];
            const ans = collectTaskAnswers();
            let ok = 0;
            let total = 0;
            const mismatched = [];
            (task.items || []).forEach((it, i) => {
                const mark = el.querySelector(`[data-mark="${i}"]`);
                const input = el.querySelector(`.ot-item[data-i="${i}"]`);
                if (!it.answer) return;
                total += 1;
                const verdict = answers[`t${taskIndex}`].verdicts?.[i];
                const grade = gradeItem(it, ans.items[i], verdict);
                const good = grade === 'ok' || grade === 'alt';
                if (grade === 'wrong' && !verdict?.value && !Array.isArray(it.options) && !Array.isArray(it.tiles)) mismatched.push({ it, i, given: ans.items[i] });
                else if (grade === 'wrong' && verdict && AC && AC.normAnswer(verdict.value) !== AC.normAnswer(ans.items[i]) && !Array.isArray(it.options) && !Array.isArray(it.tiles)) mismatched.push({ it, i, given: ans.items[i] });
                if (good) ok += 1;
                input?.classList.toggle('is-ok', good);
                input?.classList.toggle('is-wrong', !good);
                if (Array.isArray(it.options)) {
                    el.querySelectorAll(`[data-slot="${i}"], [data-mirror="${i}"]`).forEach((s) => { s.classList.remove('is-ok', 'is-wrong', 'is-revealed'); s.classList.add(good ? 'is-ok' : 'is-wrong'); });
                    el.querySelectorAll(`.ot-opt[data-opt="${i}"].is-picked`).forEach((b) => { b.classList.toggle('is-ok', good); b.classList.toggle('is-wrong', !good); });
                }
                const row = el.querySelector(`.ot-tiles-item[data-row="${i}"]`);
                if (row) {
                    row.classList.remove('is-ok', 'is-wrong', 'is-revealed');
                    void row.offsetWidth; // restart the pop/shake animation
                    row.classList.add(good ? 'is-ok' : 'is-wrong');
                }
                if (mark) {
                    mark.innerHTML = good ? '<i class="fa-solid fa-check"></i>' : (grade === 'almost' ? '<i class="fa-solid fa-spell-check"></i>' : '<i class="fa-solid fa-xmark"></i>');
                    mark.className = 'ot-mark ' + (good ? 'ok' : (grade === 'almost' ? 'almost' : 'wrong'));
                    let note = el.querySelector(`[data-verdict="${i}"]`);
                    const typed = !Array.isArray(it.options) && !Array.isArray(it.tiles);
                    const pending = mismatched.some((m) => m.i === i);
                    const canAppeal = typed && !good && !pending && grade !== 'empty' && !(verdict?.appealed && AC?.normAnswer(verdict.value) === AC?.normAnswer(ans.items[i]));
                    let html = '';
                    if (grade === 'alt') html = `<strong>${esc(t('Poprawne — inna wersja niż w kluczu.', 'Correct — a different version from the key.'))}</strong> ${esc(verdict.why)}`;
                    else if (grade === 'almost') html = esc(t('Prawie — jedna litera się nie zgadza. Pisownia się liczy, popraw i sprawdź ponownie.', 'Almost — one letter is off. Spelling counts: fix it and check again.'));
                    else if (pending) html = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${esc(t('Sprawdzam, czy to też poprawna wersja…', 'Checking if this is also correct…'))}`;
                    else if (grade === 'wrong' && verdict?.why && AC?.normAnswer(verdict.value) === AC?.normAnswer(ans.items[i])) html = esc(verdict.why);
                    if (canAppeal) html += ` <button type="button" class="ot-appeal" data-appeal="${i}"${appealsUsed() >= (AC?.APPEALS_PER_SET || 3) ? ' disabled' : ''}>${esc(t('Moja odpowiedź też jest poprawna', 'My answer is also correct'))} <span>(${(AC?.APPEALS_PER_SET || 3) - appealsUsed()})</span></button>`;
                    if (html) {
                        if (!note) { note = document.createElement('span'); note.className = 'ot-verdict'; note.dataset.verdict = i; (el.querySelector(`.ot-q[data-row="${i}"]`) || mark.parentElement).appendChild(note); }
                        note.innerHTML = html; note.dataset.state = grade === 'alt' ? 'alt' : (pending ? 'pending' : grade);
                    } else note?.remove();
                }
            });
            const checkKey = `t${taskIndex}`;
            if (mismatched.length) recheckOpen(task, checkKey, mismatched);
            el.querySelectorAll('[data-appeal]').forEach((btn) => btn.addEventListener('click', () => {
                if (appealsUsed() >= (AC?.APPEALS_PER_SET || 3)) return;
                const i = Number(btn.dataset.appeal);
                answers._appeals = appealsUsed() + 1;
                btn.disabled = true;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(t('Sprawdzam…', 'Checking…'))}`;
                const given = collectTaskAnswers().items[i];
                recheckOpen(task, checkKey, [{ it: task.items[i], i, given }], true).then(() => {
                    const v = answers[checkKey].verdicts?.[i]; if (v) { v.appealed = true; document.getElementById('ot-check')?.click(); }
                });
            }));
            answers[`t${taskIndex}`].checked = { ok, total };
            const box = document.getElementById('ot-task-check');
            if (box) {
                box.hidden = false;
                const all = ok === total && total > 0;
                box.innerHTML = `<span>${esc(t(`Dobrze: ${ok}/${total}`, `Correct: ${ok}/${total}`))}${all ? ' 🎉' : `<span class="ot-long"> — ${esc(t('popraw czerwone pola i sprawdź ponownie.', 'fix the red ones and check again.'))}</span>`}</span>
                    ${all ? '' : `<button type="button" class="ot-link-btn" id="ot-show-answers">${esc(t('Pokaż odpowiedzi', 'Show answers'))}</button>`}`;
                box.className = 'ot-check-msg ' + (all ? 'ok' : 'partial');
                document.getElementById('ot-show-answers')?.addEventListener('click', () => {
                    // Fill the correct answer straight into each wrong gap (the student's attempt stays in the tooltip).
                    el.querySelectorAll('.ot-tiles-item.is-wrong').forEach((row) => revealTileRow(task, Number(row.dataset.row)));
                    (task.items || []).forEach((it, i) => {
                        if (!Array.isArray(it.options)) return;
                        const inp = el.querySelector(`.ot-item[data-i="${i}"]`);
                        if (!inp || checkItem(it, inp.value, answers[`t${taskIndex}`]?.verdicts?.[i])) return;
                        pickOption(el, i, it.answer);
                        el.querySelectorAll(`[data-slot="${i}"], [data-mirror="${i}"]`).forEach((s) => s.classList.add('is-revealed'));
                        const mark = el.querySelector(`[data-mark="${i}"]`);
                        if (mark) { mark.innerHTML = '<i class="fa-solid fa-eye"></i>'; mark.className = 'ot-mark revealed'; }
                    });
                    el.querySelectorAll('.ot-item.is-wrong').forEach((inp) => {
                        if (inp.type === 'hidden' || inp.classList.contains('ot-unscramble-input')) return;
                        const it = (task.items || [])[Number(inp.dataset.i)];
                        if (!it?.answer) return;
                        inp.title = t(`Twoja odpowiedź: ${inp.value || '—'}`, `You wrote: ${inp.value || '—'}`);
                        inp.value = it.answer;
                        inp.dispatchEvent(new Event('input'));
                        inp.classList.remove('is-wrong');
                        inp.classList.add('is-revealed');
                        const mark = el.querySelector(`[data-mark="${inp.dataset.i}"]`);
                        if (mark) { mark.innerHTML = '<i class="fa-solid fa-eye"></i>'; mark.className = 'ot-mark revealed'; }
                    });
                    document.getElementById('ot-show-answers')?.remove();
                });
            }
        });

        el.querySelectorAll('details.ot-panel').forEach((d) => d.addEventListener('toggle', () => {
            const k = `${taskIndex}:${d.dataset.panel}`;
            if (d.open) openPanels.add(k); else openPanels.delete(k);
        }));
        bindTiles(el);

        // Writing helpers: insert phrase, live counter
        const answerEl = document.getElementById('ot-answer');
        el.querySelectorAll('.ot-phrase[data-phrase]').forEach((btn) => btn.addEventListener('click', () => {
            if (!answerEl) return;
            const ph = btn.dataset.phrase.replace(/…$/, '').trim();
            const pos = answerEl.selectionStart ?? answerEl.value.length;
            const before = answerEl.value.slice(0, pos);
            const pad = before && !/\s$/.test(before) ? ' ' : '';
            answerEl.value = before + pad + ph + ' ' + answerEl.value.slice(pos);
            const caret = (before + pad + ph + ' ').length;
            answerEl.focus();
            answerEl.setSelectionRange(caret, caret);
            btn.classList.add('used');
            answerEl.dispatchEvent(new Event('input'));
        }));
        answerEl?.addEventListener('input', () => {
            const task = lesson?.tasks?.[taskIndex];
            const c = document.getElementById('ot-counter');
            if (c && task) c.innerHTML = counterHtml(guidance(task).target, answerEl.value);
        });

        // "Od nowa": reset ONLY the current set to its start (answers, checks, hints, tiles) — same tasks, no
        // new generation, no Keep going quota. Two taps (second within 4 s) so it can't happen by accident.
        document.getElementById('ot-reset-set')?.addEventListener('click', (ev) => {
            const btn = ev.currentTarget;
            if (!btn.classList.contains('is-confirm')) {
                btn.classList.add('is-confirm');
                btn.querySelector('.ot-reset-label').textContent = t('Na pewno? Kliknij znowu', 'Sure? Tap again');
                clearTimeout(btn._t);
                btn._t = setTimeout(() => { btn.classList.remove('is-confirm'); btn.querySelector('.ot-reset-label').textContent = t('Od nowa', 'Restart'); }, 4000);
                return;
            }
            resetCurrentSet();
        });

        document.getElementById('ot-prev')?.addEventListener('click', () => {
            collectTaskAnswers();
            taskIndex = Math.max(0, taskIndex - 1);
            paint();
            saveProgressNow();
        });

        document.getElementById('ot-next')?.addEventListener('click', () => {
            collectTaskAnswers();
            if (taskIndex + 1 < (lesson.tasks || []).length) {
                taskIndex += 1;
                paint();
            } else {
                view = 'feedback';
                paint();
            }
            saveProgressNow();
        });

        document.getElementById('ot-save-fb')?.addEventListener('click', () => saveFeedback(false));
        document.getElementById('ot-save-keep')?.addEventListener('click', () => saveFeedback(true));
        document.getElementById('ot-keep-going')?.addEventListener('click', keepGoing);
        document.getElementById('ot-to-dash')?.addEventListener('click', () => { view = 'dash'; paint(); });
    }

    async function keepGoing() {
        const src = lastFinished || (lessons[0]?.lesson ? { saved: lessons[0].lesson } : null);
        await startLesson({ extra: true, extraContext: extraContextFrom(src) });
    }

    async function startLesson(opts) {
        const extra = opts?.extra === true;
        const L = lang();
        try {
            toggleLoading(true);
            setStatus(extra ? t('Układam dodatkowy zestaw…', 'Building an extra set…') : (L === 'en' ? 'Building your lesson…' : 'Układam lekcję…'), 'neutral');
            const topic = document.getElementById('ot-session-topic')?.value ?? profile.topic;
            const vocab = document.getElementById('ot-session-vocab')?.value ?? profile.vocab;
            const recentFeedback = lessons.slice(0, 2).map((l) => l.feedback || {});
            const data = await api('/api/own-time/generate', {
                method: 'POST',
                body: JSON.stringify({
                    profile,
                    profileId,
                    topic,
                    vocab,
                    recentFeedback,
                    ...(extra ? { extra: true, extraContext: opts.extraContext || {} } : {}),
                }),
            });
            lesson = data.lesson;
            if (extra) {
                lesson.extra = true;
                if (today && data.extrasLimit) today = { ...today, extrasUsed: data.extrasUsed, extrasLeft: data.extrasLeft, extrasLimit: data.extrasLimit };
            }
            openPanels.clear();
            Object.keys(tileState).forEach((k) => delete tileState[k]);
            taskIndex = 0;
            openPanels.clear();
            answers = {};
            startedAt = Date.now();
            view = 'lesson';
            toggleLoading(false);
            paint();
            setStatus('');
            saveProgressNow();
        } catch (err) {
            toggleLoading(false);
            if (err.data?.code === 'own_time_extra_cap') {
                capMessage = err.message;
                if (today) today = { ...today, extrasLeft: 0, extrasUsed: err.data.extrasLimit };
                paint();
                setStatus(t('Na dziś wystarczy — limit dodatkowych zestawów osiągnięty.', 'That’s enough for today — extra set limit reached.'), 'neutral');
                return;
            }
            setStatus(esc(err.message || (L === 'en' ? 'Could not generate lesson.' : 'Nie udało się utworzyć lekcji.')), 'error');
        }
    }

    async function saveFeedback(keepGoingAfter) {
        const L = lang();
        const feedback = {
            levelOk: document.querySelector('input[name="ot-level"]:checked')?.value || 'ok',
            modeNext: document.querySelector('input[name="ot-mode"]:checked')?.value || 'new',
            focusNext: document.querySelector('input[name="ot-focus"]:checked')?.value || 'uoe',
            note: String(document.getElementById('ot-fb-note')?.value || '').trim(),
        };
        const durationMs = startedAt ? Date.now() - startedAt : 0;
        const lessonPayload = {
            title: lesson?.title,
            cefr: lesson?.cefr,
            focus: lesson?.focus,
            minutes: lesson?.minutes,
            extra: !!lesson?.extra,
            // Stored so "Keep going" from the dashboard (after reload) can avoid repeats and revisit weak spots.
            avoid: extraContextFrom({ lesson, answers }).avoid,
            weak: extraContextFrom({ lesson, answers }).weak,
            tasks: (lesson?.tasks || []).map((t, i) => ({
                n: t.n,
                type: t.type,
                student: answers[`t${i}`] || null,
            })),
        };
        try {
            setStatus(L === 'en' ? 'Saving…' : 'Zapisuję…', 'neutral');
            const saved = await api('/api/own-time/lessons', {
                method: 'POST',
                body: JSON.stringify({ lesson: lessonPayload, feedback, durationMs, profileId }),
            });
            if (saved.profile) profile = saved.profile;
            if (typeof recordGameSessionApi === 'function') {
                recordGameSessionApi('own_time', {
                    score: 1,
                    pointsEarned: 10,
                    durationMs,
                    result: { focus: lesson?.focus, levelOk: feedback.levelOk },
                });
            }
            clearTimeout(progressTimer);
            const list = await api(`/api/own-time/lessons?limit=20${profileId ? `&profileId=${profileId}` : ''}`);
            loadProfiles().catch(() => {});
            lessons = list.lessons || [];
            today = list.today || today;
            lastFinished = { lesson, answers };
            lesson = null;
            view = 'done';
            if (keepGoingAfter && !(today && today.extrasLeft === 0)) {
                setStatus('');
                await keepGoing();
                return;
            }
            view = 'done';
            paint();
            setStatus(L === 'en' ? 'Saved.' : 'Zapisano.', 'success');
        } catch (err) {
            setStatus(esc(err.message || (L === 'en' ? 'Could not save.' : 'Nie udało się zapisać.')), 'error');
        }
    }

    async function initOwnTime() {
        view = 'loading';
        capMessage = '';
        setStatus('');
        toggleLoading(true);
        const el = root();
        if (el) el.innerHTML = '';
        try {
            closeMenu();
            await loadProfiles();
            const resumed = await loadActive();
            toggleLoading(false);
            paint();
            if (resumed) setStatus(esc(t(`Wznowiono lekcję: ${view === 'feedback' ? 'podsumowanie' : `zadanie ${taskIndex + 1} z ${lesson.tasks.length}`}.`, `Lesson resumed: ${view === 'feedback' ? 'wrap-up' : `task ${taskIndex + 1} of ${lesson.tasks.length}`}.`)), 'success');
        } catch (err) {
            toggleLoading(false);
            if (err.status === 401) {
                setStatus(t('Zaloguj się, żeby korzystać z tej aktywności.', 'Sign in to use this activity.'), 'error');
            } else {
                setStatus(esc(err.message || t('Błąd ładowania.', 'Failed to load.')), 'error');
            }
        }
    }

    // Leaving the page mid-lesson: flush the latest answers so a reload resumes exactly here.
    window.addEventListener('pagehide', () => { if (lesson && (view === 'lesson' || view === 'feedback')) saveProgressNow({ keepalive: true }); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && lesson && (view === 'lesson' || view === 'feedback')) saveProgressNow({ keepalive: true }); });

    window.initOwnTime = initOwnTime;
    window.OwnTime = { init: initOwnTime };
})();

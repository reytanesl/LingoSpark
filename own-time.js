/**
 * In your own time — personalized 15–20 min practice coach (Writing Suite).
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
    let view = 'loading'; // loading | onboard | dash | lesson | feedback

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
        };
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

        const title = editMode
            ? (L === 'en' ? 'Edit your profile' : 'Edytuj profil')
            : (L === 'en' ? 'Tell us about you' : 'Opowiedz o sobie');

        return `
            <div class="ot-card">
                <h3 class="ot-heading">${esc(title)}</h3>
                <p class="ot-lead">${esc(L === 'en'
                    ? 'We will build short 15–20 minute practice sessions for you.'
                    : 'Przygotujemy krótkie ćwiczenia na 15–20 minut dopasowane do Ciebie.')}</p>
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
                    </label>
                    <label>${esc(L === 'en' ? 'Intensity' : 'Intensywność')}
                        <select id="ot-intensity" class="pe-input">
                            <option value="light"${p.intensity === 'light' ? ' selected' : ''}>${esc(L === 'en' ? 'Light' : 'Lekko')}</option>
                            <option value="standard"${!p.intensity || p.intensity === 'standard' ? ' selected' : ''}>${esc(L === 'en' ? 'Standard' : 'Standard')}</option>
                            <option value="stretch"${p.intensity === 'stretch' ? ' selected' : ''}>${esc(L === 'en' ? 'Stretch' : 'Więcej wyzwania')}</option>
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
                <div class="ot-actions">
                    <button type="button" class="btn btn-blue" id="ot-save-profile">${esc(editMode
                        ? (L === 'en' ? 'Save' : 'Zapisz')
                        : (L === 'en' ? 'Save & continue' : 'Zapisz i dalej'))}</button>
                    ${editMode ? `<button type="button" class="btn btn-grey" id="ot-cancel-edit">${esc(L === 'en' ? 'Cancel' : 'Anuluj')}</button>` : ''}
                </div>
            </div>`;
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
                    ? 'A short practice session (~15–20 minutes), tailored to you.'
                    : 'Krótka sesja ćwiczeń (~15–20 minut), dopasowana do Ciebie.')}</p>
                <ul class="ot-summary">
                    <li><strong>${esc(L === 'en' ? 'Level' : 'Poziom')}:</strong> ${esc(p.cefr)} · ${esc(p.classLabel || '—')} · ${esc(L === 'en' ? 'age' : 'wiek')} ${esc(p.age ?? '—')}</li>
                    <li><strong>${esc(L === 'en' ? 'Intensity' : 'Intensywność')}:</strong> ${esc(p.intensity)}</li>
                    <li><strong>${esc(L === 'en' ? 'Likes' : 'Lubisz')}:</strong> ${esc((p.taskPrefs || []).join(', ') || '—')}</li>
                    <li><strong>${esc(L === 'en' ? 'Interests' : 'Zainteresowania')}:</strong> ${esc((p.interests || []).join(', ') || '—')}</li>
                    ${p.topic ? `<li><strong>${esc(L === 'en' ? 'Topic' : 'Temat')}:</strong> ${esc(p.topic)}</li>` : ''}
                </ul>
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
                    <button type="button" class="btn btn-blue" id="ot-start">${esc(L === 'en' ? 'Start practice (~15–20 min)' : 'Zacznij ćwiczenia (~15–20 min)')}</button>
                    <button type="button" class="btn btn-outline" id="ot-edit-profile">${esc(L === 'en' ? 'Edit profile' : 'Edytuj profil')}</button>
                </div>
            </div>`;
    }

    function normalizeAns(s) {
        return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function checkItem(item, value) {
        const v = normalizeAns(value);
        if (!v) return false;
        const ok = [item.answer, ...(item.alts || [])].map(normalizeAns).filter(Boolean);
        return ok.some((a) => a === v);
    }

    function renderTask() {
        const L = lang();
        const tasks = lesson.tasks || [];
        const task = tasks[taskIndex];
        if (!task) return renderFeedback();

        const key = `t${taskIndex}`;
        const saved = answers[key] || {};
        let body = '';

        if (task.type === 'writing') {
            body = `
                <p class="ot-prompt">${esc(task.prompt)}</p>
                <textarea class="pe-input ot-write" id="ot-answer" rows="5" placeholder="${esc(L === 'en' ? 'Write here…' : 'Napisz tutaj…')}">${esc(saved.text || '')}</textarea>`;
        } else if (task.type === 'reading') {
            body = `
                <div class="ot-reading">${esc(task.prompt).replace(/\n/g, '<br>')}</div>
                ${(task.items || []).map((it, i) => `
                    <label class="ot-block-label">${esc(it.q)}
                        <input type="text" class="pe-input ot-item" data-i="${i}" value="${esc((saved.items && saved.items[i]) || '')}">
                    </label>`).join('')}`;
        } else {
            // vocab_drill / uoe
            if (task.prompt) body += `<p class="ot-prompt">${esc(task.prompt).replace(/\n/g, '<br>')}</p>`;
            body += (task.items || []).map((it, i) => `
                <label class="ot-block-label">${esc(it.q || (L === 'en' ? `Item ${i + 1}` : `Zadanie ${i + 1}`))}
                    <input type="text" class="pe-input ot-item" data-i="${i}" value="${esc((saved.items && saved.items[i]) || '')}">
                </label>`).join('');
            if (!(task.items || []).length) {
                body += `<textarea class="pe-input ot-write" id="ot-answer" rows="3">${esc(saved.text || '')}</textarea>`;
            }
        }

        return `
            <div class="ot-card">
                <div class="ot-task-meta">
                    <span class="ot-badge">${esc(task.type)}</span>
                    <span>${esc(L === 'en' ? `Task ${taskIndex + 1} of ${tasks.length}` : `Zadanie ${taskIndex + 1} z ${tasks.length}`)}</span>
                    <span>~${esc(lesson.minutes || 15)} min</span>
                </div>
                <h3 class="ot-heading">${esc(lesson.title || '')}</h3>
                <p class="ot-instruction">${esc(task.instruction)}</p>
                ${body}
                <div id="ot-task-check" class="ot-check-msg" hidden></div>
                <div class="ot-actions">
                    ${(task.items || []).length ? `<button type="button" class="btn btn-outline" id="ot-check">${esc(L === 'en' ? 'Check' : 'Sprawdź')}</button>` : ''}
                    <button type="button" class="btn btn-blue" id="ot-next">${esc(taskIndex + 1 < tasks.length
                        ? (L === 'en' ? 'Next' : 'Dalej')
                        : (L === 'en' ? 'Finish' : 'Zakończ'))}</button>
                </div>
                ${lesson.coachNote ? `<p class="ot-coach">${esc(lesson.coachNote)}</p>` : ''}
            </div>`;
    }

    function renderFeedback() {
        const L = lang();
        return `
            <div class="ot-card">
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
                </div>
            </div>`;
    }

    function paint() {
        const el = root();
        if (!el) return;
        if (view === 'onboard' || view === 'edit') el.innerHTML = renderOnboard(view === 'edit');
        else if (view === 'dash') el.innerHTML = renderDash();
        else if (view === 'lesson') el.innerHTML = renderTask();
        else if (view === 'feedback') el.innerHTML = renderFeedback();
        else el.innerHTML = '';
        bind();
    }

    function collectTaskAnswers() {
        const key = `t${taskIndex}`;
        const task = lesson.tasks[taskIndex];
        const items = [];
        root().querySelectorAll('.ot-item').forEach((inp) => {
            items[Number(inp.dataset.i)] = inp.value;
        });
        const textEl = document.getElementById('ot-answer');
        answers[key] = {
            type: task.type,
            text: textEl ? textEl.value : '',
            items,
        };
        return answers[key];
    }

    function bind() {
        const el = root();
        if (!el) return;

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
            try {
                setStatus(t('Zapisuję…', 'Saving…'), 'neutral');
                const data = await api('/api/own-time/profile', {
                    method: 'PUT',
                    body: JSON.stringify(readForm()),
                });
                profile = data.profile;
                view = 'dash';
                paint();
                setStatus(t('Profil zapisany.', 'Profile saved.'), 'success');
            } catch (err) {
                setStatus(esc(err.message || t('Nie udało się zapisać.', 'Could not save.')), 'error');
            }
        });

        document.getElementById('ot-cancel-edit')?.addEventListener('click', () => {
            view = 'dash';
            paint();
        });

        document.getElementById('ot-edit-profile')?.addEventListener('click', () => {
            view = 'edit';
            paint();
        });

        document.getElementById('ot-start')?.addEventListener('click', startLesson);

        document.getElementById('ot-check')?.addEventListener('click', () => {
            const task = lesson.tasks[taskIndex];
            const ans = collectTaskAnswers();
            let ok = 0;
            let total = 0;
            (task.items || []).forEach((it, i) => {
                if (!it.answer) return;
                total += 1;
                if (checkItem(it, ans.items[i])) ok += 1;
            });
            const box = document.getElementById('ot-task-check');
            if (box) {
                box.hidden = false;
                box.textContent = t(
                    `Dobrze: ${ok}/${total || (task.items || []).length}`,
                    `Correct: ${ok}/${total || (task.items || []).length}`
                );
                box.className = 'ot-check-msg ' + (ok === total && total > 0 ? 'ok' : 'partial');
            }
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
        });

        document.getElementById('ot-save-fb')?.addEventListener('click', saveFeedback);
    }

    async function startLesson() {
        const L = lang();
        try {
            toggleLoading(true);
            setStatus(L === 'en' ? 'Building your lesson…' : 'Układam lekcję…', 'neutral');
            const topic = document.getElementById('ot-session-topic')?.value ?? profile.topic;
            const vocab = document.getElementById('ot-session-vocab')?.value ?? profile.vocab;
            const recentFeedback = lessons.slice(0, 2).map((l) => l.feedback || {});
            const data = await api('/api/own-time/generate', {
                method: 'POST',
                body: JSON.stringify({
                    profile,
                    topic,
                    vocab,
                    recentFeedback,
                }),
            });
            lesson = data.lesson;
            taskIndex = 0;
            answers = {};
            startedAt = Date.now();
            view = 'lesson';
            toggleLoading(false);
            paint();
            setStatus('');
        } catch (err) {
            toggleLoading(false);
            setStatus(esc(err.message || (L === 'en' ? 'Could not generate lesson.' : 'Nie udało się utworzyć lekcji.')), 'error');
        }
    }

    async function saveFeedback() {
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
                body: JSON.stringify({ lesson: lessonPayload, feedback, durationMs }),
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
            const list = await api('/api/own-time/lessons?limit=20');
            lessons = list.lessons || [];
            lesson = null;
            view = 'dash';
            paint();
            setStatus(L === 'en' ? 'Saved. See you next time!' : 'Zapisano. Do następnego razu!', 'success');
        } catch (err) {
            setStatus(esc(err.message || (L === 'en' ? 'Could not save.' : 'Nie udało się zapisać.')), 'error');
        }
    }

    async function initOwnTime() {
        view = 'loading';
        setStatus('');
        toggleLoading(true);
        const el = root();
        if (el) el.innerHTML = '';
        try {
            const [pRes, lRes] = await Promise.all([
                api('/api/own-time/profile'),
                api('/api/own-time/lessons?limit=20'),
            ]);
            profile = pRes.profile;
            lessons = lRes.lessons || [];
            toggleLoading(false);
            if (!profile) {
                view = 'onboard';
            } else {
                view = 'dash';
            }
            paint();
        } catch (err) {
            toggleLoading(false);
            if (err.status === 401) {
                setStatus(t('Zaloguj się, żeby korzystać z tej aktywności.', 'Sign in to use this activity.'), 'error');
            } else {
                setStatus(esc(err.message || t('Błąd ładowania.', 'Failed to load.')), 'error');
            }
        }
    }

    window.initOwnTime = initOwnTime;
    window.OwnTime = { init: initOwnTime };
})();

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
                <ol class="ot-how">
                    <li><span class="ot-how-n">1</span><strong>${esc(t('Zrób 2–4 krótkie zadania', 'Do 2–4 short tasks'))}</strong><span>${esc(t('Każde ma kroki, przykład i podpowiedź.', 'Each has steps, an example and a hint.'))}</span></li>
                    <li><span class="ot-how-n">2</span><strong>${esc(t('Sprawdź odpowiedzi', 'Check your answers'))}</strong><span>${esc(t('„Sprawdź” pokaże błędy; potrzebujesz pomocy? Rozwiń podpowiedzi.', '“Check” marks mistakes; need help? Open the hints.'))}</span></li>
                    <li><span class="ot-how-n">3</span><strong>${esc(t('Powiedz, jak było', 'Tell us how it went'))}</strong><span>${esc(t('Twoja opinia ustawia następną lekcję.', 'Your feedback shapes the next lesson.'))}</span></li>
                </ol>
                <p class="ot-time-note"><i class="fa-regular fa-clock"></i> ${esc(({ light: t('ok. 12–15 min', 'about 12–15 min'), stretch: t('ok. 18–20 min', 'about 18–20 min') })[p.intensity] || t('ok. 15–18 min', 'about 15–18 min'))} · ${esc(t('znajdź ciche miejsce i miej pod ręką słownik', 'find a quiet place; a dictionary is allowed'))}</p>
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

    const TYPE_LABELS = {
        vocab_drill: { pl: 'Słownictwo', en: 'Vocabulary', icon: 'fa-spell-check' },
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
            minutes: Number(task.minutes) || 0,
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

    function stepperHtml(tasks) {
        const cur = view === 'feedback' ? tasks.length : taskIndex;
        return `<ol class="ot-stepper" aria-label="${esc(t('Postęp lekcji', 'Lesson progress'))}">
            ${tasks.map((tk, i) => `<li class="${i < cur ? 'done' : (i === cur ? 'current' : '')}"${i === cur ? ' aria-current="step"' : ''}>
                <span class="ot-step-dot">${i < cur ? '<i class="fa-solid fa-check"></i>' : i + 1}</span>
                <span class="ot-step-name">${esc(typeLabel(tk.type))}</span></li>`).join('')}
            <li class="${view === 'feedback' ? 'current' : ''}"><span class="ot-step-dot"><i class="fa-solid fa-flag-checkered"></i></span><span class="ot-step-name">${esc(t('Podsumowanie', 'Wrap-up'))}</span></li>
        </ol>`;
    }

    function renderTask() {
        const L = lang();
        const tasks = lesson.tasks || [];
        const task = tasks[taskIndex];
        if (!task) return renderFeedback();

        const key = `t${taskIndex}`;
        const saved = answers[key] || {};
        const g = guidance(task);
        const isWriting = task.type === 'writing' || !(task.items || []).length;
        const itemRow = (it, i) => `
            <li class="ot-item-row">
                <label class="ot-item-q" for="ot-item-${i}"><span class="ot-item-n">${i + 1}</span>${esc(it.q || t(`Punkt ${i + 1}`, `Item ${i + 1}`))}</label>
                <div class="ot-item-field">
                    <input type="text" id="ot-item-${i}" class="pe-input ot-item" data-i="${i}" autocomplete="off" spellcheck="false" value="${esc((saved.items && saved.items[i]) || '')}">
                    <span class="ot-mark" data-mark="${i}" aria-live="polite"></span>
                </div>
                <div class="ot-solution" data-sol="${i}" hidden>${esc(t('Odpowiedź', 'Answer'))}: <strong>${esc(it.answer || '')}</strong></div>
            </li>`;

        let body = '';
        if (task.type === 'reading' && task.prompt) {
            body += `<div class="ot-panel-label">${esc(t('Tekst', 'Text'))}</div><div class="ot-reading">${esc(task.prompt).replace(/\n/g, '<br>')}</div>`;
        } else if (task.prompt) {
            body += `<div class="ot-panel-label">${esc(isWriting ? t('Zadanie', 'Task') : t('Materiał', 'Material'))}</div><p class="ot-prompt">${esc(task.prompt).replace(/\n/g, '<br>')}</p>`;
        }
        if (!isWriting) {
            body += `<ol class="ot-items">${(task.items || []).map(itemRow).join('')}</ol>`;
        } else {
            body += `
                ${panel('plan', 'fa-lightbulb', t('Plan (opcjonalnie) — zapisz 2–3 pomysły', 'Plan (optional) — note 2–3 ideas'),
                    `<textarea id="ot-plan" class="pe-input" rows="2" placeholder="${esc(t('np. sklep z lodami · obsługa klientów · pieniądze na telefon', 'e.g. ice-cream shop · serve customers · save for a phone'))}">${esc(saved.plan || '')}</textarea>`, 'ot-plan')}
                <label class="ot-panel-label" for="ot-answer">${esc(t('Twoja odpowiedź', 'Your answer'))}</label>
                <textarea class="pe-input ot-write" id="ot-answer" rows="6" placeholder="${esc(g.useful[0] ? `${g.useful[0]}` : (L === 'en' ? 'Write here…' : 'Napisz tutaj…'))}">${esc(saved.text || '')}</textarea>
                <div class="ot-counter" id="ot-counter">${counterHtml(g.target, saved.text)}</div>`;
        }

        const help = [
            g.example ? panel('example', 'fa-eye', t('Przykład', 'Example'), `<p>${esc(g.example)}</p>`, 'ot-example') : '',
            g.useful.length ? panel('useful', 'fa-comment-dots', isWriting ? t('Przydatne zwroty', 'Useful language') : t('Przydatne słowa', 'Useful words'),
                `${isWriting ? `<p class="ot-panel-tip">${esc(t('Kliknij zwrot, by wstawić go do tekstu.', 'Click a phrase to insert it.'))}</p>` : ''}<div class="ot-phrases">${g.useful.map((ph) => isWriting
                    ? `<button type="button" class="ot-phrase" data-phrase="${esc(ph)}">${esc(ph)}</button>`
                    : `<span class="ot-phrase is-static">${esc(ph)}</span>`).join('')}</div>`, 'ot-useful') : '',
            g.hint ? panel('hint', 'fa-circle-question', t('Utknąłeś/aś? Podpowiedź', 'Stuck? Hint'), `<p>${esc(g.hint)}</p>`, 'ot-hint') : '',
        ].join('');

        const modelBtn = isWriting && (task.modelAnswers || []).length
            ? panel('model', 'fa-star', t('Przykładowa odpowiedź (zajrzyj po napisaniu)', 'Model answer (look after you write)'), task.modelAnswers.map((m) => `<p>${esc(m)}</p>`).join(''), 'ot-model') : '';

        return `
            <div class="ot-card ot-lesson">
                <div class="ot-lesson-head">
                    <div>
                        <div class="ot-eyebrow">${esc(lesson.focus || t('Twoja lekcja', 'Your lesson'))} · ${esc(lesson.cefr || '')}</div>
                        <h3 class="ot-heading">${esc(lesson.title || '')}</h3>
                        ${lesson.goal ? `<p class="ot-goal"><i class="fa-solid fa-bullseye"></i> ${esc(lesson.goal)}</p>` : ''}
                    </div>
                    <div class="ot-time" title="${esc(t('Cała lekcja', 'Whole lesson'))}"><i class="fa-regular fa-clock"></i> ~${esc(lesson.minutes || 15)} min</div>
                </div>
                ${stepperHtml(tasks)}
                <div class="ot-task-meta">
                    <span class="ot-badge"><i class="fa-solid ${esc((TYPE_LABELS[task.type] || TYPE_LABELS.writing).icon)}"></i> ${esc(typeLabel(task.type))}</span>
                    <span>${esc(L === 'en' ? `Task ${taskIndex + 1} of ${tasks.length}` : `Zadanie ${taskIndex + 1} z ${tasks.length}`)}</span>
                    ${g.minutes ? `<span><i class="fa-regular fa-clock"></i> ~${esc(g.minutes)} min</span>` : ''}
                    ${g.target ? `<span><i class="fa-solid fa-ruler-horizontal"></i> ${esc(g.target.minSentences)}–${esc(g.target.maxSentences)} ${esc(t('zdań', 'sentences'))}</span>` : ''}
                </div>
                <p class="ot-instruction">${esc(task.instruction)}</p>
                <div class="ot-task-grid">
                    <div class="ot-task-main">
                        ${panel('steps', 'fa-shoe-prints', t(`Jak to zrobić (${g.steps.length} kroki)`, `How to do it (${g.steps.length} steps)`), `<ol class="ot-steps">${g.steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol>`, 'ot-steps-panel')}
                        ${body}
                        <div id="ot-task-check" class="ot-check-msg" hidden></div>
                        ${modelBtn}
                    </div>
                    ${help ? `<aside class="ot-task-side">${help}</aside>` : ''}
                </div>
                <div class="ot-actions">
                    ${taskIndex > 0 ? `<button type="button" class="btn btn-grey" id="ot-prev"><i class="fa-solid fa-arrow-left"></i> ${esc(t('Wstecz', 'Back'))}</button>` : ''}
                    ${(task.items || []).length ? `<button type="button" class="btn btn-outline" id="ot-check"><i class="fa-solid fa-check-double"></i> ${esc(L === 'en' ? 'Check' : 'Sprawdź')}</button>` : ''}
                    <button type="button" class="btn btn-blue" id="ot-next">${esc(taskIndex + 1 < tasks.length
                        ? (L === 'en' ? 'Next task' : 'Następne zadanie')
                        : (L === 'en' ? 'Finish' : 'Zakończ'))} <i class="fa-solid fa-arrow-right"></i></button>
                </div>
                ${lesson.coachNote ? `<p class="ot-coach"><i class="fa-solid fa-heart"></i> ${esc(lesson.coachNote)}</p>` : ''}
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
        const planEl = document.getElementById('ot-plan');
        const prev = answers[key] || {};
        answers[key] = {
            type: task.type,
            text: textEl ? textEl.value : '',
            items,
            plan: planEl ? planEl.value : '',
            ...(prev.checked ? { checked: prev.checked } : {}),
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
                const mark = el.querySelector(`[data-mark="${i}"]`);
                const input = el.querySelector(`.ot-item[data-i="${i}"]`);
                if (!it.answer) return;
                total += 1;
                const good = checkItem(it, ans.items[i]);
                if (good) ok += 1;
                input?.classList.toggle('is-ok', good);
                input?.classList.toggle('is-wrong', !good);
                if (mark) {
                    mark.innerHTML = good ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>';
                    mark.className = 'ot-mark ' + (good ? 'ok' : 'wrong');
                }
            });
            answers[`t${taskIndex}`].checked = { ok, total };
            const box = document.getElementById('ot-task-check');
            if (box) {
                box.hidden = false;
                const all = ok === total && total > 0;
                box.innerHTML = `<span>${esc(t(`Dobrze: ${ok}/${total}`, `Correct: ${ok}/${total}`))}${all ? ' 🎉' : ` — ${esc(t('popraw czerwone pola i sprawdź ponownie.', 'fix the red ones and check again.'))}`}</span>
                    ${all ? '' : `<button type="button" class="ot-link-btn" id="ot-show-answers">${esc(t('Pokaż odpowiedzi', 'Show answers'))}</button>`}`;
                box.className = 'ot-check-msg ' + (all ? 'ok' : 'partial');
                document.getElementById('ot-show-answers')?.addEventListener('click', () => {
                    el.querySelectorAll('.ot-item.is-wrong').forEach((inp) => {
                        const sol = el.querySelector(`[data-sol="${inp.dataset.i}"]`);
                        if (sol) sol.hidden = false;
                    });
                });
            }
        });

        el.querySelectorAll('details.ot-panel').forEach((d) => d.addEventListener('toggle', () => {
            const k = `${taskIndex}:${d.dataset.panel}`;
            if (d.open) openPanels.add(k); else openPanels.delete(k);
        }));
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

        document.getElementById('ot-prev')?.addEventListener('click', () => {
            collectTaskAnswers();
            taskIndex = Math.max(0, taskIndex - 1);
            paint();
        });

        document.getElementById('ot-next')?.addEventListener('click', () => {
            collectTaskAnswers();
            window.scrollTo?.({ top: 0, behavior: 'smooth' });
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
            openPanels.clear();
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

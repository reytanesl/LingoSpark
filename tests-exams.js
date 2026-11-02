// Tests & Exams suite ("Testy i egzaminy"): the #/writing home, exam skill pickers and
// game pickers. It only routes into existing activities (their scoring, paywall and plan
// checks are untouched). Pure config + routing helpers are exported for node tests.
(function (root) {
    const EXAMS = {
        e8: { level: 'A2', icon: 'school', color: '#2f6fde', name: ['Egzamin ósmoklasisty (E8)', 'Egzamin ósmoklasisty (E8)'], mock: ['Próbny egzamin ósmoklasisty', 'E8 mock exam'] },
        podst: { level: 'B1', icon: 'file-lines', color: '#1d7a43', name: ['Matura podstawowa', 'Matura – basic'], mock: ['Próbna matura podstawowa', 'Mock Matura – basic'] },
        rozsz: { level: 'B2', icon: 'feather', color: '#C8102E', name: ['Matura rozszerzona', 'Matura – extended'], mock: ['Próbna matura rozszerzona', 'Mock Matura – extended'] },
        dwuj: { level: 'C1', icon: 'globe', color: '#6b2bbf', name: ['Matura dwujęzyczna', 'Matura – bilingual'], mock: ['Próbna matura dwujęzyczna', 'Mock Matura – bilingual'] },
    };

    /** What each exam skill tile opens. Kinds: hash | pe (PE game + CEFR) | adv (Advanced Text Gaps + level) | own (In your own time + focus) | soon. */
    function skillAction(exam, skill) {
        const lvl = EXAMS[exam]?.level;
        if (!lvl) return null;
        const advLevel = exam === 'dwuj' ? 'B2+' : 'B2';
        switch (skill) {
            case 'check': return exam === 'rozsz' ? { kind: 'hash', hash: '#/setup/matura' } : { kind: 'soon' };
            case 'clock': return (exam === 'e8' || exam === 'podst') ? { kind: 'pe', game: 'pe-exam', level: lvl } : { kind: 'soon' };
            case 'gaps': return (exam === 'e8' || exam === 'podst') ? { kind: 'pe', game: 'pe-e8-gaps', level: lvl } : { kind: 'adv', game: 'adv-gaps', level: advLevel };
            case 'uoe': return { kind: 'own', focus: 'uoe', cefr: lvl };
            case 'reading': return { kind: 'own', focus: 'reading', cefr: lvl };
            case 'vocab': return { kind: 'own', focus: 'vocab', cefr: lvl };
            case 'mock': return { kind: 'soon' };
            case 'results': return { kind: 'hash', hash: '#/progress' };
            default: return null;
        }
    }

    const SKILLS = [
        ['check', 'camera', '#C8102E', ['Sprawdź wypracowanie', 'Check my writing'], ['Zdjęcie/PDF + temat → ocena wg kryteriów CKE', 'Photo/PDF + task → scored on CKE criteria']],
        ['clock', 'pen-to-square', '#8f0b20', ['Napisz na czas', 'Timed writing'], ['Zadanie egzaminacyjne, pisz lub wgraj pracę', 'Exam task — type or upload your work']],
        ['gaps', 'align-left', '#2f6fde', ['Luki w tekście', 'Text gaps'], ['Wzorcowe teksty: tłumacz fragmenty', 'Model texts: translate phrases']],
        ['uoe', 'spell-check', '#1d7a43', ['Środki językowe', 'Use of English'], ['Krótka lekcja na Twoim poziomie', 'A short lesson at your level']],
        ['reading', 'book-open', '#1B2A4A', ['Czytanie', 'Reading'], ['Tekst + pytania', 'Text + questions']],
        ['vocab', 'list-check', '#e07a1f', ['Słownictwo', 'Vocabulary'], ['Słówka na Twoim poziomie', 'Words at your level']],
    ];

    const PICKERS = {
        primary: { icon: 'children', color: '#f2a900', title: ['Szkoła podstawowa', 'Primary school'], crumbs: [['A1–A2', 'A1–A2'], ['Wybierz grę', 'Choose a game']], groups: [
            [['Słówka', 'Words'], [
                ['microphone', '#2f6fde', ['Dyktando', 'Dictation'], ['Posłuchaj i zapisz słówko', 'Listen and write the word'], { kind: 'pe', game: 'pe-dictation' }],
                ['palette', '#e07a1f', ['Kolorowe klocki', 'Colour Blocks'], ['Ułóż zdanie z kolorowych części', 'Build a sentence from coloured parts'], { kind: 'pe', game: 'pe-colour' }],
                ['image', '#1d7a43', ['Sceny słówek', 'Vocab Scenes'], ['Znajdź słówka na obrazku', 'Find the words in the picture'], { kind: 'url', url: 'vocab-scenes.html' }]]],
            [['Rozmowa', 'Talk'], [
                ['comments', '#C8102E', ['Wyzwanie tematyczne', 'Topic Challenge'], ['Porozmawiaj na wybrany temat', 'Chat about a chosen topic'], { kind: 'pe', game: 'pe-topic' }],
                ['robot', '#6b2bbf', ['Czatbot powtórkowy', 'Review Chatbot'], ['Powtórz słówka w rozmowie', 'Revise words in a conversation'], { kind: 'pe', game: 'pe-review' }]]],
            [['Pisanie', 'Writing'], [
                ['magnifying-glass', '#1B2A4A', ['Detektyw szczegółów', 'Detail Detective'], ['Dodaj szczegóły do zdań', 'Add details to sentences'], { kind: 'pe', game: 'pe-detail' }],
                ['link', '#8f0b20', ['Mistrz łączenia', 'Link Master'], ['Łącz zdania spójnikami', 'Join sentences with linkers'], { kind: 'pe', game: 'pe-link' }]]]] },
        workshop: { icon: 'pen-nib', color: '#8f0b20', title: ['Warsztat pisania', 'Writing workshop'], crumbs: [['B1–C1', 'B1–C1'], ['Wybierz ćwiczenie', 'Choose an exercise']], groups: [
            [['Słownictwo i styl', 'Vocabulary & style'], [
                ['arrow-up-right-dots', '#1d7a43', ['Vocab Upgrade', 'Vocab Upgrade'], ['Zamień proste słowa na lepsze', 'Swap plain words for better ones'], { kind: 'hash', hash: '#/setup/vocab' }],
                ['scissors', '#e07a1f', ['Bloat Slasher', 'Bloat Slasher'], ['Wytnij zbędne słowa', 'Cut unnecessary words'], { kind: 'hash', hash: '#/setup/bloat' }],
                ['compress', '#1B2A4A', ['Tight Write', 'Tight Write'], ['Powiedz to krócej', 'Say it more briefly'], { kind: 'hash', hash: '#/setup/tight' }]]],
            [['Spójność i argumentacja', 'Coherence & argument'], [
                ['link', '#2f6fde', ['Spójniki (Transitions)', 'Transitions'], ['Wybierz właściwy łącznik', 'Pick the right linker'], { kind: 'hash', hash: '#/setup/trans' }],
                ['scale-balanced', '#C8102E', ['Adwokat diabła', "Devil's Advocate"], ['Znajdź kontrargument', 'Find the rebuttal'], { kind: 'hash', hash: '#/setup/devil' }],
                ['puzzle-piece', '#6b2bbf', ['Frankenstein', 'Frankenstein'], ['Złóż tekst z fragmentów', 'Build a text from parts'], { kind: 'hash', hash: '#/setup/frank' }]]]] },
        games: { icon: 'gamepad', color: '#0e8a8a', title: ['Gry słówkowe', 'Word games'], crumbs: [['Bez oceniania', 'Not graded'], ['Wybierz grę', 'Choose a game']], groups: [
            [['Sam', 'Solo'], [
                ['futbol', '#1d7a43', ['Penalty Match', 'Penalty Match'], ['Łap prawdziwe pary słowo–znaczenie', 'Catch real word–meaning pairs'], { kind: 'hash', hash: '#/penalty-match' }],
                ['hourglass-half', '#e07a1f', ['Test Countdown', 'Test Countdown'], ['Plan nauki słówek do testu', 'A word plan up to your test'], { kind: 'hash', hash: '#/setup/test-countdown' }],
                ['rotate', '#2f6fde', ['Powtórki słówek', 'Vocab Review'], ['Fiszki, Bomb, Grid, Auction', 'Flashcards, Bomb, Grid, Auction'], { kind: 'hash', hash: '#/vocab' }]]],
            [['Z klasą', 'With your class'], [
                ['bolt', '#C8102E', ['Live Spark', 'Live Spark'], ['Gra na żywo dla całej klasy', 'Live game for the whole class'], { kind: 'hash', hash: '#/live/host' }]]]] },
        ai: { icon: 'robot', color: '#6b2bbf', title: ['Porozmawiaj z AI', 'Talk with AI'], crumbs: [['B1–C1', 'B1–C1'], ['Wybierz rozmowę', 'Choose a conversation']], note: ['Dla młodszych: Wyzwanie tematyczne i Czatbot powtórkowy są w „Szkoła podstawowa”.', 'For younger learners: Topic Challenge and Review Chatbot are in “Primary school”.'], groups: [
            [null, [
                ['comments', '#C8102E', ['Mission: Chat', 'Mission: Chat'], ['Odegraj scenkę i osiągnij cel rozmowy', 'Role-play a scene and reach your goal'], { kind: 'hash', hash: '#/setup/mission' }],
                ['compass', '#2f6fde', ['Odyseja', 'Odyssey'], ['Przygoda, w której używasz swoich słówek', 'An adventure that uses your words'], { kind: 'hash', hash: '#/setup/odyssey' }]]]] },
    };

    const HOME = [
        ['primary', 'children', '#f2a900', ['Szkoła podstawowa', 'Primary school'], ['Gry dla młodszych: słówka, rozmowa, pisanie', 'Games for younger learners: words, talk, writing'], 'A1–A2'],
        ['e8', 'school', '#2f6fde', ['Egzamin ósmoklasisty (E8)', 'Egzamin ósmoklasisty (E8)'], ['E-mail, blog, środki językowe', 'Email, blog, use of English'], 'A2'],
        ['podst', 'file-lines', '#1d7a43', ['Matura podstawowa', 'Matura – basic'], ['E-mail, zadania zamknięte', 'Email, closed tasks'], 'B1'],
        ['rozsz', 'feather', '#C8102E', ['Matura rozszerzona', 'Matura – extended'], ['Rozprawka, artykuł, list, UoE', 'Essay, article, letter, UoE'], 'B2'],
        ['dwuj', 'globe', '#6b2bbf', ['Matura dwujęzyczna', 'Matura – bilingual'], ['Wypracowanie, transformacje', 'Essay, transformations'], 'C1'],
        ['school-test', 'calendar-check', '#e07a1f', ['Sprawdzian w szkole', 'School test'], ['Wklej listę słówek · plan na X dni', 'Paste your word list · plan for X days'], ''],
        ['own', 'clock', '#1B2A4A', ['Ćwicz w swoim tempie', 'Practise at your own pace'], ['Krótkie lekcje 5–6 zadań', 'Short lessons of 5–6 tasks'], ''],
        ['workshop', 'pen-nib', '#8f0b20', ['Warsztat pisania', 'Writing workshop'], ['Akapity, spójniki, zwięzłość', 'Paragraphs, linkers, concision'], ''],
        ['games', 'gamepad', '#0e8a8a', ['Gry słówkowe', 'Word games'], ['Penalty Match, Test Countdown, powtórki', 'Penalty Match, Test Countdown, review'], ''],
    ];

    /** Home tile → sub-screen id or a direct action. */
    function homeAction(id) {
        if (EXAMS[id] || PICKERS[id]) return { kind: 'sub', sub: id };
        if (id === 'school-test') return { kind: 'own', testPrep: true };
        if (id === 'own') return { kind: 'hash', hash: '#/setup/own-time' };
        return null;
    }

    // Mirrors index.html: Writing Suite games need a plan / teacher approval except these.
    const WRITING_SETUPS = new Set(['frank', 'trans', 'devil', 'bloat', 'tight', 'vocab', 'odyssey', 'mission', 'matura', 'adv-gaps', 'own-time', 'pe-boring', 'pe-detail', 'pe-link', 'pe-exam', 'pe-e8-gaps', 'pe-dictation', 'pe-colour', 'pe-topic', 'pe-review']);
    const FREE_SETUPS = new Set(['pe-dictation', 'pe-colour']);
    /** True when the action opens a plan-gated (Writing Suite) activity. */
    function isGated(a) {
        if (!a) return false;
        if (a.kind === 'own' || a.kind === 'adv') return true;
        if (a.kind === 'pe') return !FREE_SETUPS.has(a.game);
        if (a.kind === 'hash') {
            const m = /^#\/setup\/([\w-]+)$/.exec(a.hash);
            return !!(m && WRITING_SETUPS.has(m[1]) && !FREE_SETUPS.has(m[1]));
        }
        return false;
    }
    /** Home tile shows a lock when every activity behind it is gated. */
    function homeGated(id) {
        if (id === 'school-test' || id === 'own') return true;
        if (EXAMS[id]) return SKILLS.every(([sk]) => { const a = skillAction(id, sk); return a.kind === 'soon' || isGated(a); });
        if (PICKERS[id]) return PICKERS[id].groups.every((g) => g[1].every((x) => isGated(x[4])));
        return false;
    }

    const api = { EXAMS, SKILLS, PICKERS, HOME, skillAction, homeAction, isGated, homeGated, WRITING_SETUPS, FREE_SETUPS };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

    // ---------------- browser ----------------
    const LS_KEY = 'ls_te_lang';
    let current = '';
    function lang() { try { return localStorage.getItem(LS_KEY) === 'pl' ? 'pl' : 'en'; } catch { return 'en'; } }
    function L(pair) { return pair ? (lang() === 'pl' ? pair[0] : pair[1]) : ''; }
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    const SOON = ['wkrótce', 'soon'];

    function hasAccess() { const a = root.authState; return !!(a && a.hasAccess); }
    function lockHtml(gated) { return gated && !hasAccess() ? `<span class="te-lock" title="${esc(L(['Wymaga planu Premium lub zgody nauczyciela', 'Needs a Premium plan or teacher approval']))}"><i class="fa-solid fa-lock"></i> Premium</span>` : ''; }
    function card(id, icon, color, name, sub, tag, extra = '', gated = false) {
        return `<button type="button" class="te-card${extra}" data-te="${esc(id)}"${gated && !hasAccess() ? ' data-te-locked="1"' : ''}><span class="te-ic" style="background:${color}"><i class="fa-solid fa-${icon}"></i></span><span class="te-txt"><b>${esc(L(name))}${tag ? ` <span class="te-tag">${esc(tag)}</span>` : ''}${lockHtml(gated)}</b><small>${esc(L(sub))}</small></span></button>`;
    }
    function top(back, icon, color, title) {
        return `<div class="te-top"><button type="button" class="te-back" data-te-back="${esc(back)}" aria-label="${esc(L(['Wróć', 'Back']))}">←<span class="te-back-l"> ${esc(back ? L(['Testy i egzaminy', 'Tests & Exams']) : L(['Wróć', 'Back']))}</span></button><h2><span class="te-ic te-ic--sm" style="background:${color}"><i class="fa-solid fa-${icon}"></i></span>${esc(title)}</h2>
            <div class="te-lang" role="group" aria-label="Language"><button type="button" data-te-lang="en" class="${lang() === 'en' ? 'on' : ''}" aria-pressed="${lang() === 'en'}">EN</button><button type="button" data-te-lang="pl" class="${lang() === 'pl' ? 'on' : ''}" aria-pressed="${lang() === 'pl'}">PL</button></div></div>`;
    }
    function crumbs(list) { return `<div class="te-crumbs">${list.map((c, i) => `<span class="te-crumb${i ? '' : ' on'}">${esc(c)}</span>`).join('')}</div>`; }

    function homeHtml() {
        return top('', 'graduation-cap', '#C8102E', L(['Testy i egzaminy', 'Tests & Exams']))
            + `<p class="te-lead">${esc(L(['Do czego się przygotowujesz?', 'What are you preparing for?']))}</p>`
            + `<div class="te-grid">${HOME.map(([id, ic, c, n, s, tag]) => card(id, ic, c, n, s, tag, '', homeGated(id))).join('')}</div>`
            + `<button type="button" class="te-ai" data-te="ai"><span class="te-bot"><i class="fa-solid fa-robot"></i><i class="fa-solid fa-star te-spark"></i></span><span class="te-bubble">${esc(L(['Porozmawiaj z AI', 'Talk with AI']))}${lockHtml(homeGated('ai'))}</span></button>`;
    }
    function examHtml(exam) {
        const e = EXAMS[exam];
        const tiles = SKILLS.map(([sk, ic, c, n, s]) => {
            const a = skillAction(exam, sk);
            const soon = a.kind === 'soon';
            return card(`skill:${exam}:${sk}`, ic, c, n, soon ? SOON : s, soon ? L(SOON) : '', soon ? ' is-soon' : '', isGated(a));
        }).join('');
        return top('home', e.icon, e.color, L(e.name)) + crumbs([e.level, L(['Co ćwiczysz?', 'What do you want to practise?'])])
            + `<div class="te-grid">${tiles}</div><p class="te-sec">${esc(L(['Pełny egzamin', 'Full exam']))}</p>`
            + `<div class="te-mini"><button type="button" class="is-soon" data-te="skill:${exam}:mock"><i class="fa-solid fa-stopwatch"></i> ${esc(L(e.mock))} (${esc(L(SOON))})</button><button type="button" data-te="skill:${exam}:results">${esc(L(['Moje wyniki i błędy', 'My results & mistakes']))}</button></div>`;
    }
    function pickerHtml(id) {
        const p = PICKERS[id];
        let i = 0;
        const groups = p.groups.map(([g, games]) => (g ? `<p class="te-sec">${esc(L(g))}</p>` : '') + `<div class="te-grid">${games.map((x) => card(`game:${id}:${i++}`, x[0], x[1], x[2], x[3], '', '', isGated(x[4]))).join('')}</div>`).join('');
        return top('home', p.icon, p.color, L(p.title)) + crumbs(p.crumbs.map(L)) + groups + (p.note ? `<p class="te-lead" style="margin-top:12px">${esc(L(p.note))}</p>` : '');
    }

    function rootEl() {
        const sec = document.getElementById('section-writing');
        if (!sec) return null;
        let el = document.getElementById('te-suite');
        if (!el) { el = document.createElement('div'); el.id = 'te-suite'; el.className = 'te'; sec.prepend(el); bind(el); }
        sec.classList.add('te-on');
        return el;
    }
    function render() {
        const el = rootEl();
        if (!el) return;
        el.setAttribute('lang', lang());
        el.innerHTML = EXAMS[current] ? examHtml(current) : PICKERS[current] ? pickerHtml(current) : homeHtml();
    }
    function show(sub) {
        current = (EXAMS[sub] || PICKERS[sub]) ? sub : '';
        render();
        // Re-render once the plan state is known so lock badges are right.
        if (typeof root.refreshAuth === 'function') Promise.resolve(root.refreshAuth()).then(render, () => {});
    }
    function go(sub) { location.hash = sub ? `#/writing/${sub}` : '#/writing'; }

    async function run(a) {
        if (!a) return;
        if (a.kind === 'sub') return go(a.sub);
        if (a.kind === 'soon') { (root.appAlert || alert)(L(['Ta aktywność będzie dostępna wkrótce.', 'This activity is coming soon.'])); return; }
        if (a.kind === 'hash') { location.hash = a.hash; return; }
        if (a.kind === 'url') { location.href = a.url; return; }
        if (a.kind === 'own') {
            try { sessionStorage.setItem('ls_te_focus', JSON.stringify(a.testPrep ? { testPrep: true } : { focus: a.focus, cefr: a.cefr })); } catch { /* ignore */ }
            location.hash = '#/setup/own-time';
            return;
        }
        if (a.kind === 'adv') {
            document.querySelectorAll(`input[name="adv-gaps-setup-level"],input[name="adv-gaps-play-level"]`).forEach((r) => { r.checked = r.value === a.level; });
            location.hash = `#/setup/${a.game}`;
            return;
        }
        if (a.kind === 'pe') {
            const lvl = a.level || 'A2';
            if (typeof root.selectPeLevel === 'function' && (a.level || typeof peCefrLevel === 'undefined' || !peCefrLevel)) root.selectPeLevel(lvl);
            if (typeof root.goToPeGame === 'function') { await root.goToPeGame(a.game); return; }
            location.hash = `#/setup/${a.game}`;
        }
    }
    function actionFor(key) {
        const [type, a, b] = key.split(':');
        if (type === 'skill') return skillAction(a, b);
        if (type === 'game') { const flat = PICKERS[a].groups.flatMap((g) => g[1]); return flat[Number(b)]?.[4]; }
        return homeAction(key) || (key === 'ai' ? { kind: 'sub', sub: 'ai' } : null);
    }
    function bind(el) {
        el.addEventListener('click', (ev) => {
            const langBtn = ev.target.closest('[data-te-lang]');
            if (langBtn) { try { localStorage.setItem(LS_KEY, langBtn.dataset.teLang); } catch { /* ignore */ } render(); return; }
            const back = ev.target.closest('[data-te-back]');
            if (back) { if (back.dataset.teBack === 'home') go(''); else if (typeof root.goBack === 'function') root.goBack(); else location.hash = '#/home'; return; }
            const t = ev.target.closest('[data-te]');
            if (t) run(actionFor(t.dataset.te));
        });
    }
    root.TestsExams = { ...api, show, lang, actionFor };
})(typeof window !== 'undefined' ? window : globalThis);

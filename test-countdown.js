import * as S from './test-countdown-scheduler.js';

const STORE_KEY = 'ls_tc_plans_v1';
const LANG_KEY = 'ls_tc_lang';
const MODE_KEY = 'ls_tc_mode';
const ACTIVE_KEY = 'ls_tc_active';

const STR = {
    en: {
        title: 'Test Countdown',
        back: 'Back',
        exit: 'Exit',
        lang: 'Language',
        lead: 'Pick a word set and the day of the test. The plan mixes new words and reviews so practice peaks on that day.',
        wordSet: 'Word set',
        testDate: 'Test date',
        dateHint: 'Tomorrow is the earliest test date.',
        budget: 'Daily budget',
        min10: '10 min',
        min15: '15 min',
        min20: '20 min',
        custom: 'Custom',
        minutes: 'Minutes',
        intensity: 'Intensity',
        calm: 'Calm',
        calmHelp: 'Fewer cards, wider gaps. Still aims for 3 correct reviews.',
        standard: 'Standard',
        standardHelp: 'Balanced pace. Aims for 3 correct reviews before the test.',
        cram: 'Cram',
        cramHelp: 'Tighter gaps. If the window is tiny, 2 correct reviews can be enough.',
        build: 'Build my plan',
        update: 'Update my plan',
        wordsN: '{n} words',
        loading: 'Loading word sets…',
        noSet: 'Choose a word set with at least one word.',
        date_too_soon: 'The test date has to be tomorrow or later.',
        no_terms: 'Add at least one word.',
        too_many_terms: 'A set can have at most 500 words.',
        pastedList: 'Pasted list',
        demoGroup: 'Demo word sets',
        savedGroup: 'Your word sets',
        glossaryOption: 'List pasted in Vocab Review',
        signInSets: 'Sign in to use your saved word sets. Demo sets work without an account.',
        guest: 'This plan is saved in this browser. Sign in to keep it on your account.',
        signIn: 'Sign in',
        warningTitle: 'This plan does not fit the budget',
        warningBody: 'These {terms} words need about {needed} reviews before the test. At {minutes} minutes a day there is room for about {available}. Not every word can get enough successful reviews.',
        warningIntro: 'About {fit} new words fit into the days before the test.',
        useDate: 'Move test to {date}',
        useMinutes: 'Study {n} min a day',
        useTrim: 'Keep {n} words',
        buildAnyway: 'Build the plan anyway',
        chooseWords: 'Choose which words to keep',
        selectedN: '{n} selected',
        daysToGo: '{n} days to go',
        testTomorrow: 'Tomorrow',
        testToday: 'Test day',
        testPassed: 'Test date has passed',
        readyExplain: 'Ready: {ready} of {total}. A word counts when it has at least 2 correct reviews in the last 14 days and is not overdue.',
        leftN: '{n} left',
        disclaimer: 'This is a study signal, not a guarantee you will pass.',
        onTrack: 'On track',
        behind: 'Behind',
        atRisk: 'At risk',
        today: 'Today',
        newN: '{n} new',
        reviewN: '{n} review',
        finalLine: 'Final run · {weak} weak · {sample} already in good shape',
        nothingDue: 'Nothing is due today.',
        nextOn: 'Next practice is on {date}.',
        missedOne: 'You missed a day. Today includes a short catch-up.',
        missedMany: 'You missed {n} days. Today includes a short catch-up.',
        catchCap: 'Catch-up is capped so today stays doable. The rest stays overdue.',
        modeKnow: 'Know / Don’t know',
        modeKnowHelp: 'Flip the card, then mark it.',
        modeTyped: 'Typed recall',
        modeTypedHelp: 'Read the gloss and type the term.',
        modeMixed: 'Mixed',
        modeMixedHelp: 'Half flip cards, half typing.',
        start: 'Start today’s session',
        startFinal: 'Start final run',
        edit: 'Change date or budget',
        otherPlans: 'Your countdowns',
        newPlan: 'New countdown',
        deletePlan: 'Delete plan',
        deleteAsk: 'Delete this Test Countdown? Saved reviews in the plan will be removed.',
        continue: 'Continue',
        check: 'Check',
        know: 'Know',
        dont: 'Don’t know',
        flipHint: 'Tap the card to flip',
        typeTerm: 'Type the term',
        correct: 'Correct',
        answerIs: 'Answer',
        next: 'Continue',
        newBadge: 'New',
        reviewBadge: 'Review',
        weakBadge: 'Weak',
        sampleBadge: 'Check',
        sessionDone: 'Session complete',
        finalDone: 'Final run complete',
        studied: 'Cards',
        knew: 'Knew',
        again: 'To review',
        backPlan: 'Back to plan',
        emptyFinal: 'Test day does not add new words. Move the date if these words still need a first look.',
        unscheduled: '{n} words could not be placed before the test.',
        passedHint: 'Pick a new test date if you are still studying this set.',
        noPlans: 'No countdown yet.',
        open: 'Open',
        planListLead: 'Continue a countdown, or start one for another word set.',
        catchSummary: 'Today included a catch-up from missed days.',
        modeLabel: 'Session style',
    },
    pl: {
        title: 'Odliczanie do testu',
        back: 'Wstecz',
        exit: 'Wyjdź',
        lang: 'Język',
        lead: 'Wybierz zestaw słówek i dzień testu. Plan miesza nowe słówka i powtórki tak, żeby nauka narastała do tego dnia.',
        wordSet: 'Zestaw słówek',
        testDate: 'Data testu',
        dateHint: 'Najwcześniejszy termin to jutro.',
        budget: 'Dzienny czas nauki',
        min10: '10 min',
        min15: '15 min',
        min20: '20 min',
        custom: 'Własny',
        minutes: 'Minuty',
        intensity: 'Intensywność',
        calm: 'Spokojnie',
        calmHelp: 'Mniej kart, większe odstępy. Cel to nadal 3 poprawne powtórki.',
        standard: 'Standard',
        standardHelp: 'Równe tempo. Cel to 3 poprawne powtórki przed testem.',
        cram: 'Intensywnie',
        cramHelp: 'Krótsze odstępy. Przy bardzo krótkim czasie wystarczą 2 poprawne powtórki.',
        build: 'Ułóż mój plan',
        update: 'Zaktualizuj plan',
        wordsN: '{n} słówek',
        loading: 'Wczytuję zestawy…',
        noSet: 'Wybierz zestaw, w którym jest choć jedno słówko.',
        date_too_soon: 'Data testu musi być najwcześniej jutro.',
        no_terms: 'Dodaj co najmniej jedno słówko.',
        too_many_terms: 'Zestaw może mieć najwyżej 500 słówek.',
        pastedList: 'Wklejona lista',
        demoGroup: 'Zestawy demo',
        savedGroup: 'Twoje zestawy',
        glossaryOption: 'Lista wklejona w Vocab Review',
        signInSets: 'Zaloguj się, aby użyć zapisanych zestawów. Zestawy demo działają bez konta.',
        guest: 'Plan jest zapisany w tej przeglądarce. Zaloguj się, aby trzymać go na koncie.',
        signIn: 'Zaloguj się',
        warningTitle: 'Ten plan nie mieści się w czasie',
        warningBody: 'Te słówka ({terms}) potrzebują około {needed} powtórek przed testem. Przy {minutes} minutach dziennie mieści się około {available}. Nie każde słówko zdąży dostać dość poprawnych powtórek.',
        warningIntro: 'Przed testem mieści się około {fit} nowych słówek.',
        useDate: 'Przesuń test na {date}',
        useMinutes: 'Ucz się {n} min dziennie',
        useTrim: 'Zostaw {n} słówek',
        buildAnyway: 'Ułóż plan mimo to',
        chooseWords: 'Wybierz, które słówka zostawić',
        selectedN: 'Wybrano {n}',
        daysToGo: '{n} dni do testu',
        testTomorrow: 'Jutro',
        testToday: 'Dzień testu',
        testPassed: 'Data testu minęła',
        readyExplain: 'Gotowe: {ready} z {total}. Słówko liczy się, gdy ma co najmniej 2 poprawne powtórki z ostatnich 14 dni i nie zalega.',
        leftN: 'Zostało {n}',
        disclaimer: 'To sygnał nauki, a nie gwarancja, że zdasz.',
        onTrack: 'W dobrym tempie',
        behind: 'Z tyłu planu',
        atRisk: 'Zagrożone',
        today: 'Dziś',
        newN: '{n} nowych',
        reviewN: '{n} powtórek',
        finalLine: 'Próba generalna · {weak} słabych · {sample} już opanowanych',
        nothingDue: 'Na dziś nic nie czeka.',
        nextOn: 'Następna nauka: {date}.',
        missedOne: 'Pominięto jeden dzień. Dziś doszła krótka sesja nadrabiająca.',
        missedMany: 'Pominięto {n} dni. Dziś doszła krótka sesja nadrabiająca.',
        catchCap: 'Nadrabianie ma limit, żeby dzisiejsza sesja dała się skończyć. Reszta zostaje zaległa.',
        modeKnow: 'Znam / Nie znam',
        modeKnowHelp: 'Odwróć kartę i oceń.',
        modeTyped: 'Pisanie z pamięci',
        modeTypedHelp: 'Czytasz objaśnienie i wpisujesz słówko.',
        modeMixed: 'Mieszany',
        modeMixedHelp: 'Połowa kart, połowa pisania.',
        start: 'Zacznij dzisiejszą sesję',
        startFinal: 'Zacznij próbę generalną',
        edit: 'Zmień datę lub czas',
        otherPlans: 'Twoje odliczania',
        newPlan: 'Nowe odliczanie',
        deletePlan: 'Usuń plan',
        deleteAsk: 'Usunąć to odliczanie? Zapisane powtórki w planie znikną.',
        continue: 'Kontynuuj',
        check: 'Sprawdź',
        know: 'Znam',
        dont: 'Nie znam',
        flipHint: 'Dotknij karty, aby ją odwrócić',
        typeTerm: 'Wpisz słówko',
        correct: 'Dobrze',
        answerIs: 'Odpowiedź',
        next: 'Dalej',
        newBadge: 'Nowe',
        reviewBadge: 'Powtórka',
        weakBadge: 'Słabe',
        sampleBadge: 'Kontrola',
        sessionDone: 'Sesja skończona',
        finalDone: 'Próba generalna skończona',
        studied: 'Karty',
        knew: 'Znam',
        again: 'Do powtórki',
        backPlan: 'Wróć do planu',
        emptyFinal: 'W dzień testu nie dokładamy nowych słówek. Przesuń datę, jeśli te słówka potrzebują jeszcze pierwszego spotkania.',
        unscheduled: '{n} słówek nie udało się ułożyć przed testem.',
        passedHint: 'Ustal nową datę, jeśli nadal uczysz się tego zestawu.',
        noPlans: 'Nie ma jeszcze odliczania.',
        open: 'Otwórz',
        planListLead: 'Wróć do odliczania albo zacznij nowe dla innego zestawu.',
        catchSummary: 'Dziś była sesja nadrabiająca po przerwie.',
        modeLabel: 'Tryb sesji',
    },
};

const state = {
    lang: 'en',
    plans: [],
    planId: null,
    view: 'setup',
    hubGlossary: '',
    hubWordSetId: null,
    savedSets: [],
    setup: {
        source: '',
        testDate: '',
        preset: 15,
        customMinutes: 25,
        intensity: 'standard',
    },
    editingId: null,
    draft: null,
    keep: null,
    error: '',
    preview: null,
    session: null,
    summary: null,
    mode: 'mixed',
    termCount: null,
};

let revealTimer = null;

function t(key, vars) {
    const table = STR[state.lang] || STR.en;
    let s = table[key] ?? STR.en[key] ?? key;
    if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function loggedIn() {
    return typeof isLoggedIn === 'function' && isLoggedIn();
}

function demos() {
    return Array.isArray(window.LINGOSPARK_DEMO_SETS) ? window.LINGOSPARK_DEMO_SETS : [];
}

function termsFromGlossary(text) {
    if (typeof parseGlossaryRaw !== 'function') return [];
    return parseGlossaryRaw(text).map((item) => ({
        term: item.term,
        definition: item.definition || '',
    }));
}

function readLocal() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function writeLocal(plans) {
    localStorage.setItem(STORE_KEY, JSON.stringify(plans));
}

function mergePlans(local, remote) {
    const map = new Map();
    for (const plan of [...local, ...remote]) {
        if (!plan || !plan.id) continue;
        const cur = map.get(plan.id);
        if (!cur || String(plan.updatedAt || '') > String(cur.updatedAt || '')) map.set(plan.id, plan);
    }
    return [...map.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

async function pushPlan(plan) {
    if (!loggedIn() || !plan?.id) return;
    try {
        await fetch(`/api/test-countdown/${encodeURIComponent(plan.id)}`, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan }),
        });
    } catch {
        /* local copy still stands */
    }
}

async function loadPlans() {
    let plans = readLocal();
    if (loggedIn()) {
        try {
            const res = await fetch('/api/test-countdown', { credentials: 'same-origin' });
            if (res.ok) {
                const data = await res.json();
                plans = mergePlans(plans, Array.isArray(data.plans) ? data.plans : []);
                writeLocal(plans);
                for (const plan of plans) pushPlan(plan);
            }
        } catch {
            /* stay on local */
        }
    }
    state.plans = plans;
    const active = localStorage.getItem(ACTIVE_KEY);
    if (!state.planId && active && plans.some((p) => p.id === active)) state.planId = active;
}

function current() {
    return state.plans.find((p) => p.id === state.planId) || null;
}

async function savePlan(plan) {
    plan.updatedAt = new Date().toISOString();
    const idx = state.plans.findIndex((p) => p.id === plan.id);
    if (idx >= 0) state.plans[idx] = plan;
    else state.plans.unshift(plan);
    state.planId = plan.id;
    localStorage.setItem(ACTIVE_KEY, plan.id);
    writeLocal(state.plans);
    pushPlan(plan);
    return plan;
}

async function deletePlan(id) {
    state.plans = state.plans.filter((p) => p.id !== id);
    writeLocal(state.plans);
    if (state.planId === id) state.planId = state.plans[0]?.id || null;
    if (loggedIn()) {
        try {
            await fetch(`/api/test-countdown/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                credentials: 'same-origin',
            });
        } catch {
            /* removed locally */
        }
    }
}

function formatDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(state.lang === 'pl' ? 'pl-PL' : 'en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
    });
}

function formatShort(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(state.lang === 'pl' ? 'pl-PL' : 'en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
    });
}

function weekdayNarrow(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(state.lang === 'pl' ? 'pl-PL' : 'en-GB', { weekday: 'narrow' });
}

function planName(plan) {
    if (!plan) return '';
    if (plan.setKind === 'glossary') return t('pastedList');
    return plan.setName || t('title');
}

function statusLabel(status) {
    if (status === 'behind') return t('behind');
    if (status === 'at-risk') return t('atRisk');
    return t('onTrack');
}

function countdownLabel(daysLeft) {
    if (daysLeft < 0) return t('testPassed');
    if (daysLeft === 0) return t('testToday');
    if (daysLeft === 1) return t('testTomorrow');
    return t('daysToGo', { n: daysLeft });
}

function langToggle() {
    return `<div class="tc-lang" role="group" aria-label="${esc(t('lang'))}">
        <button type="button" data-tc="lang" data-id="en" class="${state.lang === 'en' ? 'on' : ''}">EN</button>
        <button type="button" data-tc="lang" data-id="pl" class="${state.lang === 'pl' ? 'on' : ''}">PL</button>
    </div>`;
}

function topBar(title, exitLabel) {
    return `<div class="tc-top">
        <button type="button" class="btn btn-grey" data-tc="back"><i class="fa-solid fa-arrow-left"></i> ${esc(exitLabel || t('back'))}</button>
        <h2>${esc(title || t('title'))}</h2>
        ${langToggle()}
    </div>`;
}

function matchDemo(text) {
    const terms = termsFromGlossary(text);
    if (!terms.length) return null;
    const sig = terms.map((item) => S.termKey(item.term)).join('|');
    return demos().find((set) => (set.items || []).map((item) => S.termKey(item.term)).join('|') === sig) || null;
}

async function loadSavedSets() {
    state.savedSets = [];
    if (!loggedIn()) return;
    try {
        const res = await fetch('/api/word-sets', { credentials: 'same-origin' });
        if (!res.ok) return;
        const data = await res.json();
        state.savedSets = Array.isArray(data.sets) ? data.sets : [];
    } catch {
        state.savedSets = [];
    }
}

async function termsForSource(source) {
    if (!source) return null;
    if (source.startsWith('demo:')) {
        const set = demos().find((s) => s.id === source.slice(5));
        if (!set) return null;
        return {
            terms: (set.items || []).map((item) => ({ term: item.term, definition: item.definition || '' })),
            name: set.name,
            kind: 'demo',
            setKey: source,
            demoId: set.id,
            wordSetId: null,
        };
    }
    if (source.startsWith('saved:')) {
        const id = Number(source.slice(6));
        if (!loggedIn() || !id) return null;
        const res = await fetch(`/api/word-sets/${id}`, { credentials: 'same-origin' });
        if (!res.ok) return null;
        const data = await res.json();
        const set = data.set;
        if (!set) return null;
        return {
            terms: (set.items || []).map((item) => ({ term: item.term, definition: item.definition || '' })),
            name: set.name,
            kind: 'saved',
            setKey: source,
            demoId: null,
            wordSetId: set.id,
        };
    }
    if (source === 'glossary:current') {
        const fromBox = termsFromGlossary(state.hubGlossary);
        const editing = state.plans.find((p) => p.id === state.editingId && p.setKind === 'glossary');
        const terms = fromBox.length ? fromBox : (editing ? editing.cards.map((c) => ({ term: c.term, definition: c.definition })) : []);
        if (!terms.length) return null;
        return {
            terms,
            name: t('pastedList'),
            kind: 'glossary',
            setKey: 'glossary:current',
            demoId: null,
            wordSetId: null,
        };
    }
    return null;
}

function defaultSource() {
    if (state.hubWordSetId) return `saved:${state.hubWordSetId}`;
    const demo = matchDemo(state.hubGlossary);
    if (demo) return `demo:${demo.id}`;
    if (termsFromGlossary(state.hubGlossary).length) return 'glossary:current';
    const first = demos()[0];
    return first ? `demo:${first.id}` : '';
}

async function prepareSetup(opts = {}) {
    await loadSavedSets();
    if (!opts.keep) {
        state.draft = null;
        state.keep = null;
        state.error = '';
        if (!state.setup.testDate) state.setup.testDate = S.addDays(S.todayISO(), 1);
    }
    if (!state.setup.source) state.setup.source = defaultSource();
    const meta = await termsForSource(state.setup.source);
    state.termCount = meta ? meta.terms.length : null;
}

function renderSetup() {
    const today = S.todayISO();
    const tomorrow = S.addDays(today, 1);
    const editing = state.plans.find((p) => p.id === state.editingId);
    const minDate = editing && editing.testDate === today ? today : tomorrow;
    const demoOpts = demos().map((set) => `<option value="demo:${esc(set.id)}"${state.setup.source === `demo:${set.id}` ? ' selected' : ''}>${esc(set.name)} (${set.items.length})</option>`).join('');
    const savedOpts = state.savedSets.map((set) => `<option value="saved:${set.id}"${state.setup.source === `saved:${set.id}` ? ' selected' : ''}>${esc(set.name)} (${set.item_count})</option>`).join('');
    const glossTerms = termsFromGlossary(state.hubGlossary);
    const showGloss = glossTerms.length > 0 || (editing && editing.setKind === 'glossary');
    const glossOpt = showGloss ? `<option value="glossary:current"${state.setup.source === 'glossary:current' ? ' selected' : ''}>${esc(t('glossaryOption'))}${glossTerms.length ? ` (${glossTerms.length})` : ''}</option>` : '';
    const presets = [
        [10, t('min10')],
        [15, t('min15')],
        [20, t('min20')],
        ['custom', t('custom')],
    ];
    const intensities = [
        ['calm', t('calm'), t('calmHelp')],
        ['standard', t('standard'), t('standardHelp')],
        ['cram', t('cram'), t('cramHelp')],
    ];
    return `${topBar(t('title'))}
        <p class="tc-lead">${esc(t('lead'))}</p>
        ${state.error ? `<div class="tc-error">${esc(state.error)}</div>` : ''}
        <form data-tc-form="setup">
            <div class="tc-field">
                <label class="tc-label" for="tc-source">${esc(t('wordSet'))}</label>
                <select id="tc-source" class="tc-select">
                    ${glossOpt}
                    <optgroup label="${esc(t('demoGroup'))}">${demoOpts}</optgroup>
                    ${savedOpts ? `<optgroup label="${esc(t('savedGroup'))}">${savedOpts}</optgroup>` : ''}
                </select>
                <p class="tc-hint">${state.termCount ? esc(t('wordsN', { n: state.termCount })) : ''}</p>
                ${loggedIn() ? '' : `<p class="tc-hint">${esc(t('signInSets'))}</p>`}
            </div>
            <div class="tc-field">
                <label class="tc-label" for="tc-date">${esc(t('testDate'))}</label>
                <input id="tc-date" class="tc-date" type="date" min="${minDate}" value="${esc(state.setup.testDate || tomorrow)}" required>
                <p class="tc-hint">${esc(t('dateHint'))}</p>
            </div>
            <div class="tc-field">
                <span class="tc-label">${esc(t('budget'))}</span>
                <div class="tc-pills">
                    ${presets.map(([id, label]) => `<button type="button" class="tc-pill${state.setup.preset === id ? ' on' : ''}" data-tc="preset" data-id="${id}">${esc(label)}</button>`).join('')}
                </div>
                ${state.setup.preset === 'custom' ? `<input id="tc-minutes" class="tc-minutes" type="number" min="5" max="180" value="${esc(state.setup.customMinutes)}" aria-label="${esc(t('minutes'))}">` : ''}
            </div>
            <div class="tc-field">
                <span class="tc-label">${esc(t('intensity'))}</span>
                <div class="tc-pills">
                    ${intensities.map(([id, label]) => `<button type="button" class="tc-pill${state.setup.intensity === id ? ' on' : ''}" data-tc="intensity" data-id="${id}">${esc(label)}</button>`).join('')}
                </div>
                <p class="tc-hint">${esc(intensities.find((row) => row[0] === state.setup.intensity)?.[2] || '')}</p>
            </div>
            ${renderWarning()}
            <button type="submit" class="btn btn-blue">${esc(editing || findPlanForSource(state.setup.source) ? t('update') : t('build'))}</button>
        </form>
        ${guestNote()}`;
}

function findPlanForSource(source) {
    return state.plans.find((p) => p.setKey === source) || null;
}

function renderWarning() {
    const warning = state.draft?.plan?.warning;
    if (!warning) return '';
    const actions = [];
    if (warning.suggestedTestDate && warning.suggestedTestDate !== state.draft.plan.testDate) {
        actions.push(`<button type="button" class="btn btn-blue" data-tc="use-date">${esc(t('useDate', { date: formatDate(warning.suggestedTestDate) }))}</button>`);
    }
    if (warning.suggestedMinutes && warning.suggestedMinutes !== state.draft.plan.minutes) {
        actions.push(`<button type="button" class="btn btn-outline" data-tc="use-minutes">${esc(t('useMinutes', { n: warning.suggestedMinutes }))}</button>`);
    }
    if (warning.maxTerms > 0 && warning.maxTerms < warning.termCount) {
        actions.push(`<button type="button" class="btn btn-outline" data-tc="use-trim">${esc(t('useTrim', { n: warning.maxTerms }))}</button>`);
    }
    actions.push(`<button type="button" class="btn btn-grey" data-tc="force">${esc(t('buildAnyway'))}</button>`);
    const cards = state.draft.plan.cards;
    if (!state.keep) {
        state.keep = {};
        for (const card of cards) state.keep[card.key] = !card.skipped;
    }
    const selected = cards.filter((c) => state.keep[c.key]).length;
    const words = `<details><summary>${esc(t('chooseWords'))} · ${esc(t('selectedN', { n: selected }))}</summary>
        <div class="tc-words">${cards.map((c) => `<label><input type="checkbox" data-tc="keep" data-id="${esc(c.key)}"${state.keep[c.key] ? ' checked' : ''}> <span>${esc(c.term)}</span></label>`).join('')}</div>
        <div class="tc-actions-row"><button type="button" class="btn btn-outline" data-tc="build-selected">${esc(t('build'))}</button></div>
    </details>`;
    return `<div class="tc-warning">
        <h3>${esc(t('warningTitle'))}</h3>
        <p>${esc(t('warningBody', {
            terms: warning.termCount,
            needed: warning.neededSlots,
            minutes: state.draft.plan.minutes,
            available: warning.availableSlots,
        }))}</p>
        ${warning.unscheduled ? `<p>${esc(t('warningIntro', { fit: warning.introCapacity }))}</p>` : ''}
        <div class="tc-warning-actions">${actions.join('')}</div>
        ${words}
    </div>`;
}

function guestNote() {
    if (loggedIn()) return '';
    return `<div class="tc-guest">${esc(t('guest'))} <button type="button" class="btn btn-outline" data-tc="sign-in">${esc(t('signIn'))}</button></div>`;
}

function renderList() {
    const cards = state.plans.map((plan) => {
        const ready = S.readiness(plan, S.todayISO());
        const left = S.diffDays(S.todayISO(), plan.testDate);
        return `<article class="tc-plan-card">
            <div>
                <h3>${esc(planName(plan))}</h3>
                <p class="tc-hint">${esc(formatDate(plan.testDate))} · ${esc(countdownLabel(left))} · ${esc(statusLabel(ready.status))} ${ready.percent}%</p>
            </div>
            <div class="tc-inline">
                <button type="button" class="btn btn-blue" data-tc="open-plan" data-id="${esc(plan.id)}">${esc(t('open'))}</button>
                <button type="button" class="btn btn-grey" data-tc="delete" data-id="${esc(plan.id)}" aria-label="${esc(t('deletePlan'))}"><i class="fa-solid fa-trash"></i></button>
            </div>
        </article>`;
    }).join('');
    return `${topBar(t('title'))}
        <p class="tc-lead">${esc(t('planListLead'))}</p>
        <div class="tc-list">${cards || `<p>${esc(t('noPlans'))}</p>`}</div>
        <div class="tc-actions-row"><button type="button" class="btn btn-outline" data-tc="new-plan"><i class="fa-solid fa-plus"></i> ${esc(t('newPlan'))}</button></div>`;
}

function renderPlan() {
    const plan = state.preview?.plan || current();
    if (!plan) return renderSetup();
    const preview = state.preview;
    const ready = preview?.readiness || S.readiness(plan, S.todayISO());
    const daysLeft = preview?.daysLeft ?? S.diffDays(S.todayISO(), plan.testDate);
    const cal = S.calendarStrip(plan, S.todayISO());
    const catchUp = preview?.catchUp;
    let catchMsg = '';
    if (catchUp?.missedDays === 1) catchMsg = t('missedOne');
    else if (catchUp?.missedDays > 1) catchMsg = t('missedMany', { n: catchUp.missedDays });
    if (catchUp?.capped) catchMsg = `${catchMsg} ${t('catchCap')}`.trim();
    const todayLine = preview?.isFinal
        ? t('finalLine', { weak: preview.finalWeak || 0, sample: preview.finalSample || 0 })
        : `${t('newN', { n: preview?.newCount || 0 })} · ${t('reviewN', { n: preview?.reviewCount || 0 })}`;
    const empty = preview && preview.queue.length === 0;
    let emptyMsg = '';
    if (empty && preview.isFinal) emptyMsg = t('emptyFinal');
    else if (empty) {
        emptyMsg = t('nothingDue');
        if (preview.nextDate) emptyMsg += ` ${t('nextOn', { date: formatDate(preview.nextDate) })}`;
    }
    const modes = [
        ['know', t('modeKnow'), t('modeKnowHelp')],
        ['typed', t('modeTyped'), t('modeTypedHelp')],
        ['mixed', t('modeMixed'), t('modeMixedHelp')],
    ];
    return `${topBar(t('title'))}
        <p class="tc-lead" style="margin-bottom:0.4rem;">${esc(planName(plan))}</p>
        <div class="tc-hero">
            <div class="tc-count"><strong>${esc(countdownLabel(daysLeft))}</strong><span>${esc(formatDate(plan.testDate))}</span></div>
            <div class="tc-ready ${esc(ready.status)}">
                <div class="tc-ready-row"><span class="tc-pct">${ready.percent}%</span><span class="tc-badge ${esc(ready.status)}">${esc(statusLabel(ready.status))}</span></div>
                <div class="tc-bar" aria-hidden="true"><span style="width:${ready.percent}%"></span></div>
                <p class="tc-explain">${esc(t('readyExplain', { ready: ready.ready, total: ready.total }))}</p>
                <p class="tc-disclaimer">${esc(t('disclaimer'))}</p>
            </div>
        </div>
        <div class="tc-cal-wrap"><div class="tc-cal">${cal.map((day) => `<div class="tc-day${day.isPast ? ' past' : ''}${day.isToday ? ' today' : ''}${day.isTest ? ' test' : ''}">
            <span>${esc(weekdayNarrow(day.date))}</span><b>${Number(day.date.slice(8))}</b>
            <i class="tc-dot${day.studied ? ' done' : day.newCount ? ' on' : ''}"></i>
        </div>`).join('')}</div></div>
        <div class="tc-today">
            <strong>${esc(t('today'))}</strong> — ${esc(todayLine)}
            ${catchMsg ? `<p class="tc-hint">${esc(catchMsg)}</p>` : ''}
            ${emptyMsg ? `<p class="tc-hint">${esc(emptyMsg)}</p>` : ''}
            ${daysLeft < 0 ? `<p class="tc-hint">${esc(t('passedHint'))}</p>` : ''}
            ${plan.warning ? `<p class="tc-hint">${esc(t('warningTitle'))}</p>` : ''}
        </div>
        <p class="tc-label">${esc(t('modeLabel'))}</p>
        <div class="tc-modes">
            ${modes.map(([id, label, help]) => `<button type="button" class="tc-mode${state.mode === id ? ' on' : ''}" data-tc="mode" data-id="${id}"><b>${esc(label)}</b><span>${esc(help)}</span></button>`).join('')}
        </div>
        <div class="tc-actions-row">
            <button type="button" class="btn btn-blue" data-tc="start" ${empty ? 'disabled' : ''}>${esc(preview?.isFinal ? t('startFinal') : t('start'))}</button>
            <button type="button" class="btn btn-outline" data-tc="edit">${esc(t('edit'))}</button>
            <button type="button" class="btn btn-grey" data-tc="plans">${esc(t('otherPlans'))}</button>
        </div>
        ${guestNote()}`;
}

function cardByKey(key) {
    return current()?.cards?.find((c) => c.key === key) || null;
}

function renderSession() {
    const session = state.session;
    const plan = current();
    if (!session || !plan) return renderPlan();
    const item = session.queue[session.index];
    if (!item) return renderSummary();
    const card = cardByKey(item.key);
    const done = session.stats.cards;
    const width = Math.min(100, Math.round((done / Math.max(1, done + (session.queue.length - session.index))) * 100));
    const badge = item.role === 'new' ? t('newBadge')
        : item.role === 'final-weak' ? t('weakBadge')
        : item.role === 'final-sample' ? t('sampleBadge')
        : t('reviewBadge');
    const kickerClass = item.role === 'new' ? 'new' : '';
    let body = '';
    if (item.mode === 'typed') {
        if (session.reveal) {
            body = `<div class="tc-reveal ${session.reveal.correct ? 'ok' : 'bad'}">
                <span>${esc(session.reveal.correct ? t('correct') : t('answerIs'))}</span>
                <b>${esc(card?.term || '')}</b>
            </div>
            <div class="tc-answer-row"><button type="button" class="btn btn-blue" data-tc="continue">${esc(t('next'))}</button></div>`;
        } else {
            body = `<form data-tc-form="typed">
                <input id="tc-typed" class="game-input" type="text" autocomplete="off" autocapitalize="off" placeholder="${esc(t('typeTerm'))}" value="${esc(session.draft || '')}">
                <div class="tc-answer-row"><button type="submit" class="btn btn-blue">${esc(t('check'))}</button></div>
            </form>`;
        }
    } else if (session.reveal) {
        body = '';
    } else {
        const flipped = session.flipped ? ' flipped' : '';
        body = `<div class="flip-card${flipped}" data-tc="flip" id="tc-flip">
                <div class="flip-card-inner">
                    <div class="flip-card-front">${esc(card?.definition || card?.term || '')}</div>
                    <div class="flip-card-back">${esc(card?.term || '')}</div>
                </div>
            </div>
            <p class="tc-hint" style="text-align:center;">${esc(t('flipHint'))}</p>
            <div class="tc-answer-row">
                <button type="button" class="btn btn-red" data-tc="dont"${session.flipped ? '' : ' disabled'}>${esc(t('dont'))}</button>
                <button type="button" class="btn btn-green" data-tc="know"${session.flipped ? '' : ' disabled'}>${esc(t('know'))}</button>
            </div>`;
    }
    if (item.mode === 'typed' && !session.reveal) {
        body = `<p class="tc-typed-prompt">${esc(card?.definition || '')}</p>${body}`;
    }
    return `${topBar(t('title'), t('exit'))}
        <div class="tc-session-meta"><span>${esc(t('leftN', { n: session.queue.length - session.index }))}</span><span>${esc(planName(plan))}</span></div>
        <div class="tc-progress" aria-hidden="true"><span style="width:${width}%"></span></div>
        <p class="tc-kicker ${kickerClass}">${esc(badge)}${session.isFinal ? ` · ${esc(t('startFinal'))}` : ''}</p>
        ${body}`;
}

function renderSummary() {
    const summary = state.summary;
    if (!summary) return renderPlan();
    const ready = summary.readiness;
    return `${topBar(t('title'))}
        <h2 style="color:var(--royal-blue);margin:0 0 0.4rem;">${esc(summary.isFinal ? t('finalDone') : t('sessionDone'))}</h2>
        <div class="tc-summary-grid">
            <div class="tc-stat"><b>${summary.stats.cards}</b>${esc(t('studied'))}</div>
            <div class="tc-stat"><b>${summary.stats.know}</b>${esc(t('knew'))}</div>
            <div class="tc-stat"><b>${summary.stats.miss}</b>${esc(t('again'))}</div>
        </div>
        <div class="tc-ready ${esc(ready.status)}">
            <div class="tc-ready-row"><span class="tc-pct">${ready.percent}%</span><span class="tc-badge ${esc(ready.status)}">${esc(statusLabel(ready.status))}</span></div>
            <p class="tc-explain">${esc(t('readyExplain', { ready: ready.ready, total: ready.total }))}</p>
            <p class="tc-disclaimer">${esc(t('disclaimer'))}</p>
        </div>
        ${summary.catchUp?.missedDays > 0 ? `<p class="tc-hint">${esc(t('catchSummary'))}${summary.catchUp.capped ? ` ${esc(t('catchCap'))}` : ''}</p>` : ''}
        <div class="tc-actions-row"><button type="button" class="btn btn-blue" data-tc="back-plan">${esc(t('backPlan'))}</button></div>`;
}

function render() {
    const root = document.getElementById('tc-root');
    if (!root) return;
    const scroll = document.querySelector('.tc-words')?.scrollTop || 0;
    let html = '';
    if (state.view === 'list') html = renderList();
    else if (state.view === 'session') html = renderSession();
    else if (state.view === 'summary') html = renderSummary();
    else if (state.view === 'plan') html = renderPlan();
    else html = renderSetup();
    root.innerHTML = html;
    const words = document.querySelector('.tc-words');
    if (words) words.scrollTop = scroll;
    document.querySelector('.tc-day.today')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    if (state.view === 'session' && state.session && !state.session.reveal) {
        const input = document.getElementById('tc-typed');
        if (input) input.focus();
    }
}

function paint() {
    render();
    if (typeof showScreen === 'function') showScreen('countdown');
}

function clearRevealTimer() {
    if (revealTimer) {
        clearTimeout(revealTimer);
        revealTimer = null;
    }
}

async function refreshTerms(plan) {
    let terms = null;
    let name = plan.setName;
    if (plan.setKind === 'demo' && plan.demoId) {
        const set = demos().find((s) => s.id === plan.demoId);
        if (set) {
            terms = (set.items || []).map((item) => ({ term: item.term, definition: item.definition || '' }));
            name = set.name;
        }
    } else if (plan.setKind === 'saved' && plan.wordSetId && loggedIn()) {
        try {
            const res = await fetch(`/api/word-sets/${plan.wordSetId}`, { credentials: 'same-origin' });
            if (res.ok) {
                const data = await res.json();
                if (data.set) {
                    terms = (data.set.items || []).map((item) => ({ term: item.term, definition: item.definition || '' }));
                    name = data.set.name || name;
                }
            }
        } catch {
            terms = null;
        }
    }
    if (!terms) return plan;
    const same = terms.length === plan.cards.length && terms.every((term, i) => {
        const card = plan.cards[i];
        return card && S.termKey(term.term) === card.key && term.definition === card.definition;
    });
    if (same && name === plan.setName) return plan;
    const rebuilt = S.syncTerms({ ...plan, setName: name }, terms, S.todayISO());
    if (rebuilt.error) return plan;
    rebuilt.plan.setName = name;
    return savePlan(rebuilt.plan);
}

function scheduleSig(plan) {
    return JSON.stringify(plan.cards.map((c) => [c.key, c.plannedIntro, c.skipped, c.nextDue, c.introduced, c.definition]));
}

async function showPlan() {
    let plan = current();
    if (!plan) {
        state.view = 'setup';
        await prepareSetup();
        paint();
        return;
    }
    plan = await refreshTerms(plan);
    const today = S.todayISO();
    const preview = S.previewToday(plan, today);
    if (scheduleSig(preview.plan) !== scheduleSig(plan) || preview.plan.cardsPerDay !== plan.cardsPerDay) {
        plan = await savePlan(preview.plan);
        state.preview = { ...preview, plan };
    } else {
        state.preview = preview;
    }
    state.view = 'plan';
    state.summary = null;
    paint();
}

function minutesNow() {
    return state.setup.preset === 'custom' ? Math.round(Number(state.setup.customMinutes) || 25) : state.setup.preset;
}

async function buildPlan(opts = {}) {
    state.error = '';
    const dateEl = document.getElementById('tc-date');
    if (dateEl) state.setup.testDate = dateEl.value;
    const meta = await termsForSource(state.setup.source);
    if (!meta || !meta.terms.length) {
        state.error = t('noSet');
        render();
        return;
    }
    let skippedKeys = opts.skippedKeys;
    if (!skippedKeys && state.keep && opts.useKeep) {
        skippedKeys = meta.terms.map((term) => S.termKey(term.term)).filter((key) => !state.keep[key]);
    }
    let previous = findPlanForSource(meta.setKey);
    if (!previous && state.editingId) {
        const editing = state.plans.find((p) => p.id === state.editingId);
        if (editing && editing.setKey === meta.setKey) previous = editing;
    }
    const result = S.createPlan({
        previousPlan: previous,
        terms: meta.terms,
        testDate: state.setup.testDate,
        minutes: minutesNow(),
        intensity: state.setup.intensity,
        today: S.todayISO(),
        setKey: meta.setKey,
        setName: meta.name,
        setKind: meta.kind,
        wordSetId: meta.wordSetId,
        demoId: meta.demoId,
        sessionMode: state.mode,
        skippedKeys,
    });
    if (result.error) {
        state.error = t(result.error);
        state.draft = null;
        render();
        return;
    }
    if (result.plan.warning && !opts.force) {
        state.draft = result;
        if (!opts.useKeep) state.keep = null;
        render();
        return;
    }
    result.plan.sessionMode = state.mode;
    await savePlan(result.plan);
    state.draft = null;
    state.keep = null;
    state.editingId = result.plan.id;
    await showPlan();
}

function startSession() {
    const plan = state.preview?.plan || current();
    if (!plan) return;
    const preview = S.previewToday(plan, S.todayISO());
    if (!preview.queue.length) {
        state.preview = preview;
        render();
        return;
    }
    clearRevealTimer();
    state.session = {
        queue: S.withModes(preview.queue, state.mode),
        index: 0,
        flipped: false,
        reveal: null,
        pending: null,
        draft: '',
        isFinal: preview.isFinal,
        catchUp: preview.catchUp,
        startedAt: Date.now(),
        stats: { know: 0, miss: 0, cards: 0 },
    };
    plan.sessionMode = state.mode;
    localStorage.setItem(MODE_KEY, state.mode);
    savePlan(plan);
    state.view = 'session';
    paint();
}

function finishSession(partial) {
    clearRevealTimer();
    const session = state.session;
    if (!session) {
        showPlan();
        return;
    }
    let plan = current();
    if (plan && session.stats.cards > 0) {
        plan = S.logSession(plan, S.todayISO(), session.stats);
        plan.sessionMode = state.mode;
        savePlan(plan);
    }
    const readiness = S.readiness(plan || current(), S.todayISO());
    if (!partial && session.stats.cards > 0) {
        if (typeof incrementGameCount === 'function') incrementGameCount();
        if (typeof recordGameSessionApi === 'function') {
            recordGameSessionApi('test_countdown', {
                score: session.stats.know,
                pointsEarned: session.stats.know,
                durationMs: Date.now() - session.startedAt,
                wordsTotal: session.stats.cards,
                wordsMastered: readiness.ready,
                wordSetId: plan?.wordSetId || null,
            });
        }
    }
    state.summary = {
        stats: session.stats,
        catchUp: session.catchUp,
        isFinal: session.isFinal,
        readiness,
    };
    state.session = null;
    if (partial) {
        state.summary = null;
        showPlan();
        return;
    }
    state.view = 'summary';
    paint();
}

function grade(correct, typed) {
    const session = state.session;
    if (!session || session.reveal || session.busy) return;
    session.busy = true;
    const item = session.queue[session.index];
    if (!item) return;
    let plan = current();
    plan = S.applyAnswer(plan, { key: item.key, correct, typed, today: S.todayISO() });
    savePlan(plan);
    session.stats.cards += 1;
    if (correct) session.stats.know += 1;
    else session.stats.miss += 1;
    session.pending = { correct, typed };
    const card = plan.cards.find((c) => c.key === item.key);
    if (typed) {
        session.reveal = { correct, term: card?.term || '' };
        session.draft = '';
        session.busy = false;
        render();
        if (correct) {
            revealTimer = setTimeout(() => continueSession(), 650);
        }
        return;
    }
    stepQueue();
}

function continueSession() {
    clearRevealTimer();
    if (!state.session) return;
    state.session.reveal = null;
    stepQueue();
}

function stepQueue() {
    const session = state.session;
    if (!session) return;
    const pending = session.pending || { correct: true, typed: false };
    const moved = S.advanceQueue(session.queue, session.index, pending);
    session.queue = moved.queue;
    session.index = moved.index;
    session.flipped = false;
    session.pending = null;
    session.draft = '';
    session.busy = false;
    if (session.index >= session.queue.length) finishSession(false);
    else render();
}

async function openSetupFresh() {
    state.editingId = null;
    state.draft = null;
    state.keep = null;
    state.error = '';
    state.setup = {
        source: defaultSource(),
        testDate: S.addDays(S.todayISO(), 1),
        preset: 15,
        customMinutes: 25,
        intensity: 'standard',
    };
    state.view = 'setup';
    await prepareSetup({ keep: true });
    paint();
}

async function editCurrent() {
    const plan = current();
    if (!plan) return openSetupFresh();
    state.editingId = plan.id;
    state.draft = null;
    state.keep = null;
    state.error = '';
    state.hubWordSetId = plan.wordSetId || state.hubWordSetId;
    const preset = [10, 15, 20].includes(plan.minutes) ? plan.minutes : 'custom';
    state.setup = {
        source: plan.setKey,
        testDate: plan.testDate,
        preset,
        customMinutes: plan.minutes,
        intensity: plan.intensity,
    };
    state.view = 'setup';
    await prepareSetup({ keep: true });
    state.setup.source = plan.setKey;
    const meta = await termsForSource(plan.setKey);
    state.termCount = meta ? meta.terms.length : null;
    paint();
}

function hashPath() {
    if (state.view === 'setup') return 'countdown/setup';
    if (state.view === 'session') return 'countdown/session';
    if (state.view === 'summary') return 'countdown/summary';
    if (state.view === 'list') return 'countdown';
    return 'countdown/plan';
}

async function open(ctx) {
    if (ctx) {
        state.hubGlossary = ctx.glossary || '';
        state.hubWordSetId = ctx.wordSetId || null;
    }
    await loadPlans();
    state.mode = localStorage.getItem(MODE_KEY) || state.mode || 'mixed';
    if (!['know', 'typed', 'mixed'].includes(state.mode)) state.mode = 'mixed';
    const source = defaultSource();
    const existing = source ? findPlanForSource(source) : null;
    if (existing && (state.hubWordSetId || termsFromGlossary(state.hubGlossary).length)) {
        state.planId = existing.id;
        await showPlan();
        return;
    }
    if (!state.hubWordSetId && !termsFromGlossary(state.hubGlossary).length) {
        if (state.plans.length === 1) {
            state.planId = state.plans[0].id;
            await showPlan();
            return;
        }
        if (state.plans.length > 1) {
            state.view = 'list';
            paint();
            return;
        }
    }
    await openSetupFresh();
}

async function openFromSet(kind, id) {
    await loadPlans();
    const setKey = `${kind}:${id}`;
    state.hubWordSetId = kind === 'saved' ? id : null;
    if (kind === 'demo') {
        const set = demos().find((s) => s.id === id);
        state.hubGlossary = set ? (set.items || []).map((item) => `${item.term} = ${item.definition || ''}`).join('\n') : '';
    }
    const existing = state.plans.find((p) => p.setKey === setKey);
    if (existing) {
        state.planId = existing.id;
        await showPlan();
        return;
    }
    state.editingId = null;
    state.setup.source = setKey;
    state.setup.testDate = S.addDays(S.todayISO(), 1);
    state.view = 'setup';
    await prepareSetup({ keep: true });
    state.setup.source = setKey;
    const meta = await termsForSource(setKey);
    state.termCount = meta ? meta.terms.length : null;
    paint();
}

async function openRoute(sub) {
    await loadPlans();
    state.mode = localStorage.getItem(MODE_KEY) || 'mixed';
    if (sub === 'setup') {
        if (!state.setup.source) await openSetupFresh();
        else {
            state.view = 'setup';
            await prepareSetup({ keep: true });
            paint();
        }
        return;
    }
    if (sub === 'session' && state.session) {
        state.view = 'session';
        paint();
        return;
    }
    if (sub === 'summary' && state.summary) {
        state.view = 'summary';
        paint();
        return;
    }
    if (sub === 'plan' || state.planId || state.plans.length === 1) {
        if (!state.planId && state.plans[0]) state.planId = state.plans[0].id;
        if (current()) {
            await showPlan();
            return;
        }
    }
    await open({ glossary: state.hubGlossary, wordSetId: state.hubWordSetId });
}

function goBack() {
    if (state.view === 'session') {
        finishSession(true);
        return true;
    }
    if (state.view === 'summary') {
        showPlan();
        return true;
    }
    if (state.view === 'setup' && current() && state.editingId) {
        showPlan();
        return true;
    }
    if (state.view === 'list') return false;
    if (state.view === 'plan') return false;
    return false;
}

async function onClick(event) {
    const el = event.target.closest('[data-tc]');
    if (!el) return;
    const action = el.dataset.tc;
    if (action === 'lang') {
        state.lang = el.dataset.id === 'pl' ? 'pl' : 'en';
        localStorage.setItem(LANG_KEY, state.lang);
        render();
        return;
    }
    if (action === 'back') {
        if (typeof window.goBack === 'function') window.goBack();
        return;
    }
    if (action === 'preset') {
        state.setup.preset = el.dataset.id === 'custom' ? 'custom' : Number(el.dataset.id);
        render();
        return;
    }
    if (action === 'intensity') {
        state.setup.intensity = el.dataset.id;
        render();
        return;
    }
    if (action === 'mode') {
        state.mode = el.dataset.id;
        localStorage.setItem(MODE_KEY, state.mode);
        const plan = current();
        if (plan) {
            plan.sessionMode = state.mode;
            savePlan(plan);
        }
        render();
        return;
    }
    if (action === 'use-date' && state.draft?.plan?.warning?.suggestedTestDate) {
        const next = state.draft.plan.warning.suggestedTestDate;
        state.setup.testDate = next;
        const dateEl = document.getElementById('tc-date');
        if (dateEl) dateEl.value = next;
        state.draft = null;
        await buildPlan();
        return;
    }
    if (action === 'use-minutes' && state.draft?.plan?.warning?.suggestedMinutes) {
        const mins = state.draft.plan.warning.suggestedMinutes;
        state.setup.preset = [10, 15, 20].includes(mins) ? mins : 'custom';
        state.setup.customMinutes = mins;
        state.draft = null;
        await buildPlan();
        return;
    }
    if (action === 'use-trim' && state.draft?.plan?.warning) {
        const trimmed = S.trimToMaxTerms(state.draft.plan, state.draft.plan.warning.maxTerms, S.todayISO());
        if (!trimmed.error) {
            await savePlan(trimmed.plan);
            state.draft = null;
            state.editingId = trimmed.plan.id;
            await showPlan();
        }
        return;
    }
    if (action === 'force') {
        await buildPlan({ force: true });
        return;
    }
    if (action === 'build-selected') {
        await buildPlan({ useKeep: true, force: false });
        return;
    }
    if (action === 'start') {
        startSession();
        return;
    }
    if (action === 'edit') {
        await editCurrent();
        return;
    }
    if (action === 'plans') {
        state.view = 'list';
        paint();
        return;
    }
    if (action === 'new-plan') {
        await openSetupFresh();
        return;
    }
    if (action === 'open-plan') {
        state.planId = el.dataset.id;
        localStorage.setItem(ACTIVE_KEY, state.planId);
        await showPlan();
        return;
    }
    if (action === 'delete') {
        const id = el.dataset.id;
        const ok = typeof appConfirm === 'function' ? await appConfirm(t('deleteAsk'), t('deletePlan')) : true;
        if (!ok) return;
        await deletePlan(id);
        if (!state.plans.length) await openSetupFresh();
        else if (state.view === 'plan') await showPlan();
        else render();
        return;
    }
    if (action === 'sign-in' && typeof openAuthModal === 'function') {
        openAuthModal('login');
        return;
    }
    if (action === 'flip') {
        if (state.session) {
            state.session.flipped = !state.session.flipped;
            render();
        }
        return;
    }
    if (action === 'know') grade(true, false);
    if (action === 'dont') grade(false, false);
    if (action === 'continue') continueSession();
    if (action === 'back-plan') showPlan();
}

function leaveOrInner() {
    if (state.view === 'session') {
        finishSession(true);
        return true;
    }
    if (state.view === 'summary') {
        showPlan();
        return true;
    }
    if (state.view === 'setup' && state.editingId && current()) {
        showPlan();
        return true;
    }
    return false;
}

function onChange(event) {
    const el = event.target;
    if (el.id === 'tc-source') {
        state.setup.source = el.value;
        state.draft = null;
        state.keep = null;
        termsForSource(el.value).then((meta) => {
            state.termCount = meta ? meta.terms.length : null;
            render();
        });
        return;
    }
    if (el.id === 'tc-date') state.setup.testDate = el.value;
    if (el.dataset.tc === 'keep') {
        state.keep = state.keep || {};
        state.keep[el.dataset.id] = el.checked;
        const summary = el.closest('details')?.querySelector('summary');
        if (summary && state.draft) {
            const selected = state.draft.plan.cards.filter((c) => state.keep[c.key]).length;
            summary.textContent = `${t('chooseWords')} · ${t('selectedN', { n: selected })}`;
        }
    }
}

function onInput(event) {
    if (event.target.id === 'tc-minutes') {
        state.setup.customMinutes = event.target.value;
    }
    if (event.target.id === 'tc-typed' && state.session) {
        state.session.draft = event.target.value;
    }
}

function onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (form.dataset.tcForm === 'setup') {
        buildPlan();
        return;
    }
    if (form.dataset.tcForm === 'typed' && state.session) {
        const card = cardByKey(state.session.queue[state.session.index]?.key);
        const typedValue = document.getElementById('tc-typed')?.value || '';
        const ok = S.answersMatch(typedValue, card?.term || '');
        grade(ok, true);
    }
}

const api = {
    open,
    openFromSet,
    openRoute,
    goBack() { return leaveOrInner(); },
    hashPath,
    onAuthChanged() { loadPlans(); },
};

function boot() {
    state.lang = localStorage.getItem(LANG_KEY) === 'pl' ? 'pl' : 'en';
    state.mode = localStorage.getItem(MODE_KEY) || 'mixed';
    const root = document.getElementById('tc-root');
    if (root) {
        root.addEventListener('click', onClick);
        root.addEventListener('change', onChange);
        root.addEventListener('input', onInput);
        root.addEventListener('submit', onSubmit);
    }
    window.TestCountdown = api;
    window.dispatchEvent(new Event('tc-ready'));
    if (window.__tcPendingSet) {
        const pending = window.__tcPendingSet;
        window.__tcPendingSet = null;
        window.__tcPendingRoute = null;
        api.openFromSet(pending.kind, pending.id);
        return;
    }
    if (window.__tcPendingRoute != null) {
        const sub = window.__tcPendingRoute;
        const ctx = window.__tcHubContext;
        window.__tcPendingRoute = null;
        window.__tcHubContext = null;
        if (ctx) api.open(ctx);
        else api.openRoute(sub);
    }
}

boot();

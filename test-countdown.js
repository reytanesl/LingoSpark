/**
 * Test Countdown — Vocab Review planner.
 * Schedules new words + reviews toward a learner-chosen test date.
 */
(function (global) {
    'use strict';

    const STORAGE_PLANS = 'ls_tc_plans';
    const STORAGE_MODE = 'ls_tc_session_mode';
    const STORAGE_LANG = 'ls_tc_lang';

    const I18N = {
        en: {
            hubTitle: 'Test Countdown',
            hubBlurb: 'Set a vocab test date and get a daily plan of new words and reviews that peaks on the day.',
            setupTitle: 'Plan for your vocab test',
            setupHelper: 'We’ll schedule new words and reviews so you’re sharp on the day.',
            testDate: 'Test date',
            dailyBudget: 'Daily budget',
            intensity: 'Intensity',
            calm: 'Calm',
            standard: 'Standard',
            cram: 'Cram',
            custom: 'Custom',
            min: 'min',
            build: 'Build my plan',
            cramWarn: 'Less than 2 days left — Cram mode is required so every word can still get a quick pass.',
            daysUntil: 'Days until test',
            dayOf: 'Test day',
            readiness: 'Readiness',
            onTrack: 'On track',
            behind: 'Behind',
            atRisk: 'At risk',
            todayLoad: 'Today’s load',
            newCards: 'new',
            reviewCards: 'review',
            catchUp: 'Catching up yesterday’s leftovers (capped so today stays doable).',
            startToday: 'Start today’s session',
            finalRun: 'Start Final run',
            goodLuck: 'Good luck on your test!',
            weakList: 'Still weak — give these a last look:',
            modeLabel: 'Session mode',
            modeKnow: 'Know / Don’t know',
            modeTyped: 'Typed recall',
            modeMixed: 'Mixed',
            tapFlip: 'Tap card to flip',
            know: 'Know',
            dontKnow: "Don't know",
            typeTerm: 'Type the term',
            check: 'Check',
            reveal: 'The answer was',
            next: 'Next',
            summaryTitle: 'Session done',
            correct: 'Correct',
            wrong: 'Wrong',
            backHome: 'Back to plan',
            rebuild: 'Rebuild plan',
            editSetup: 'Change settings',
            noCards: 'Nothing due today — enjoy the break, or open Final run if it’s test day.',
            needGlossary: 'Add at least 4 vocabulary pairs first.',
            needDate: 'Pick a test date (tomorrow or later).',
            impossible: 'This plan won’t fit: too many words for the days and daily budget.',
            extendHint: 'Extend the test date, raise the daily budget, or trim some terms.',
            trimmed: 'Trimmed to {n} terms so the plan fits your budget and date.',
            progress: 'Card {i} of {n}',
            exit: 'Exit',
        },
        pl: {
            hubTitle: 'Test Countdown',
            hubBlurb: 'Ustaw datę sprawdzianu ze słówek i otrzymaj dzienny plan nowych haseł i powtórek.',
            setupTitle: 'Plan pod sprawdzian ze słówek',
            setupHelper: 'Ułożymy nowe i powtórki tak, żebyś był/a w formie w dniu testu.',
            testDate: 'Data sprawdzianu',
            dailyBudget: 'Budżet dzienny',
            intensity: 'Intensywność',
            calm: 'Spokojnie',
            standard: 'Standard',
            cram: 'Cram',
            custom: 'Własny',
            min: 'min',
            build: 'Ułóż plan',
            cramWarn: 'Zostało mniej niż 2 dni — włączamy tryb Cram, żeby każde słowo zdążyło przejść szybką powtórkę.',
            daysUntil: 'Dni do sprawdzianu',
            dayOf: 'Dzień sprawdzianu',
            readiness: 'Gotowość',
            onTrack: 'Na dobrej drodze',
            behind: 'Do nadrobienia',
            atRisk: 'Ryzyko',
            todayLoad: 'Na dziś',
            newCards: 'nowe',
            reviewCards: 'powtórki',
            catchUp: 'Dokładamy wczorajsze zaległości (z limitem, żeby dzień nie był bez końca).',
            startToday: 'Zacznij dzisiejszą sesję',
            finalRun: 'Start Final run',
            goodLuck: 'Powodzenia na sprawdzianie!',
            weakList: 'Jeszcze słabe — zerknij na nie na koniec:',
            modeLabel: 'Tryb sesji',
            modeKnow: 'Znam / Nie znam',
            modeTyped: 'Pisanie z pamięci',
            modeMixed: 'Mieszany',
            tapFlip: 'Dotknij karty, żeby odwrócić',
            know: 'Znam',
            dontKnow: 'Nie znam',
            typeTerm: 'Wpisz hasło',
            check: 'Sprawdź',
            reveal: 'Poprawna odpowiedź',
            next: 'Dalej',
            summaryTitle: 'Koniec sesji',
            correct: 'Poprawne',
            wrong: 'Błędne',
            backHome: 'Wróć do planu',
            rebuild: 'Przelicz plan',
            editSetup: 'Zmień ustawienia',
            noCards: 'Na dziś nic nie zaplanowano — odpocznij albo uruchom Final run w dniu testu.',
            needGlossary: 'Najpierw dodaj co najmniej 4 pary słówek.',
            needDate: 'Wybierz datę sprawdzianu (najwcześniej jutro).',
            impossible: 'Ten plan się nie zmieści: za dużo słówek na liczbę dni i budżet.',
            extendHint: 'Przesuń datę, zwiększ budżet albo skróć listę.',
            trimmed: 'Skróciliśmy listę do {n} haseł, żeby plan się zmieścił.',
            progress: 'Karta {i} z {n}',
            exit: 'Wyjdź',
        },
    };

    let lang = 'en';
    let plan = null;
    let phase = 'setup'; // setup | home | session | summary
    let session = null;
    let flipped = false;

    function t(key, vars) {
        const table = I18N[lang] || I18N.en;
        let s = table[key] || I18N.en[key] || key;
        if (vars) {
            Object.keys(vars).forEach((k) => {
                s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
            });
        }
        return s;
    }

    function $(id) {
        return document.getElementById(id);
    }

    function todayISO(d) {
        const x = d ? new Date(d) : new Date();
        const y = x.getFullYear();
        const m = String(x.getMonth() + 1).padStart(2, '0');
        const day = String(x.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function parseISO(iso) {
        const [y, m, d] = String(iso).split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function addDays(iso, n) {
        const d = parseISO(iso);
        d.setDate(d.getDate() + n);
        return todayISO(d);
    }

    function daysBetween(a, b) {
        const ms = parseISO(b) - parseISO(a);
        return Math.round(ms / 86400000);
    }

    function hashString(str) {
        let h = 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
        return 'tc_' + (h >>> 0).toString(36);
    }

    function cardKey(term, definition) {
        return `${String(term || '').trim().toLowerCase()}||${String(definition || '').trim().toLowerCase()}`;
    }

    function budgetToCards(minutes) {
        const m = Math.max(5, Number(minutes) || 15);
        return Math.max(4, Math.round(m * 0.8));
    }

    function intensityFactor(intensity) {
        if (intensity === 'calm') return 0.75;
        if (intensity === 'cram') return 1.35;
        return 1;
    }

    function minSuccessTarget(intensity, daysLeft) {
        if (intensity === 'cram' || daysLeft < 2) return 2;
        return 3;
    }

    function loadAllPlans() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_PLANS) || '{}') || {};
        } catch {
            return {};
        }
    }

    function saveAllPlans(all) {
        try {
            localStorage.setItem(STORAGE_PLANS, JSON.stringify(all));
        } catch { /* ignore */ }
    }

    function savePlan(p) {
        if (!p?.id) return;
        const all = loadAllPlans();
        all[p.id] = p;
        saveAllPlans(all);
        plan = p;
    }

    function getSavedMode() {
        try {
            return localStorage.getItem(STORAGE_MODE) || 'mixed';
        } catch {
            return 'mixed';
        }
    }

    function setSavedMode(mode) {
        try {
            localStorage.setItem(STORAGE_MODE, mode);
        } catch { /* ignore */ }
    }

    function loadLang() {
        try {
            const v = localStorage.getItem(STORAGE_LANG);
            if (v === 'pl' || v === 'en') lang = v;
        } catch { /* ignore */ }
    }

    function setLang(next) {
        lang = next === 'pl' ? 'pl' : 'en';
        try { localStorage.setItem(STORAGE_LANG, lang); } catch { /* ignore */ }
        applyI18n();
        if (phase === 'home') renderHome();
        else if (phase === 'setup') syncSetupCopy();
    }

    function feasibilityCheck({ termCount, days, budgetCards, intensity }) {
        const target = minSuccessTarget(intensity, days);
        // Rough capacity: intro days (~65%) * daily intros + total review slots
        const introDays = Math.max(1, Math.floor(days * 0.65));
        const introPerDay = Math.max(1, Math.floor((budgetCards * intensityFactor(intensity)) * 0.45));
        const maxIntros = introDays * introPerDay;
        const reviewSlots = days * budgetCards;
        const neededReviews = termCount * target;
        const ok = termCount <= maxIntros && neededReviews <= reviewSlots * 1.15;
        const maxTerms = Math.max(4, Math.min(termCount, maxIntros, Math.floor(reviewSlots / target)));
        return { ok, maxTerms, target, neededReviews, reviewSlots };
    }

    function buildCardsFromVocab(vocab, previousCards) {
        const prevByKey = new Map();
        (previousCards || []).forEach((c) => prevByKey.set(cardKey(c.term, c.definition), c));
        return vocab.map((v, i) => {
            const pair = v.term != null ? v : vocabPair(v);
            const term = pair.term;
            const definition = pair.definition;
            const key = cardKey(term, definition);
            const prev = prevByKey.get(key);
            if (prev) {
                return {
                    ...prev,
                    id: prev.id || `c${i}`,
                    term,
                    definition,
                };
            }
            return {
                id: `c${i}_${hashString(key).slice(0, 8)}`,
                term,
                definition,
                state: 'new',
                ease: 2.4,
                nextDue: null,
                introDay: null,
                failCount: 0,
                successCount: 0,
                recentCorrect: 0,
                lastResultAt: null,
            };
        });
    }

    function assignIntroDays(cards, days, intensity) {
        const introWindow = Math.max(1, Math.floor(days * 0.65));
        const ordered = [...cards].sort((a, b) => a.id.localeCompare(b.id));
        const factor = intensityFactor(intensity);
        // Front-load slightly for cram
        ordered.forEach((card, idx) => {
            if (card.state !== 'new' && card.introDay != null) return;
            let slot;
            if (intensity === 'cram') {
                slot = Math.floor((idx / Math.max(1, ordered.length - 1)) * (introWindow * 0.85));
            } else if (intensity === 'calm') {
                slot = Math.floor((idx / Math.max(1, ordered.length - 1)) * (introWindow - 1));
            } else {
                slot = Math.floor((idx / Math.max(1, ordered.length)) * introWindow);
            }
            card.introDay = Math.min(introWindow - 1, Math.max(0, slot));
            // unused factor keeps API symmetric
            void factor;
        });
    }

    function vocabPair(v) {
        return {
            term: String(v.rawTerm || v.originalTerm || v.term || v.answer || '').trim(),
            definition: String(v.rawDef || v.def || v.definition || v.prompt || '').trim(),
        };
    }

    function createPlan({ vocab, testDate, budgetMin, intensity, trimTo }) {
        const created = todayISO();
        const days = daysBetween(created, testDate);
        if (days < 1) throw new Error(t('needDate'));

        let list = vocab.map(vocabPair).filter((v) => v.term && v.definition);

        if (list.length < 4) throw new Error(t('needGlossary'));

        const budgetCards = budgetToCards(budgetMin);
        let check = feasibilityCheck({
            termCount: list.length,
            days,
            budgetCards,
            intensity,
        });

        let trimmed = false;
        if (!check.ok) {
            if (trimTo != null) {
                list = list.slice(0, Math.max(4, trimTo));
                trimmed = true;
                check = feasibilityCheck({
                    termCount: list.length,
                    days,
                    budgetCards,
                    intensity,
                });
            }
            if (!check.ok) {
                const err = new Error(t('impossible') + ' ' + t('extendHint'));
                err.code = 'impossible';
                err.maxTerms = check.maxTerms;
                throw err;
            }
        }

        const cards = buildCardsFromVocab(list, []);
        assignIntroDays(cards, days, intensity);

        const id = hashString(`${list.map((x) => cardKey(x.term, x.definition)).join('|')}|${testDate}|${budgetMin}|${intensity}`);
        return {
            id,
            created,
            testDate,
            budgetMin,
            budgetCards,
            intensity,
            cards,
            missedDays: [],
            lastSessionDate: null,
            trimmed,
            trimmedTo: trimmed ? list.length : null,
            setFingerprint: hashString(list.map((x) => cardKey(x.term, x.definition)).join('|')),
        };
    }

    function rebuildPlanKeepingProgress(existing, vocab) {
        const list = vocab.map(vocabPair).filter((v) => v.term && v.definition);
        const cards = buildCardsFromVocab(list, existing.cards);
        const days = Math.max(1, daysBetween(todayISO(), existing.testDate));
        assignIntroDays(cards.filter((c) => c.state === 'new'), days, existing.intensity);
        existing.cards = cards;
        existing.setFingerprint = hashString(list.map((x) => cardKey(x.term, x.definition)).join('|'));
        savePlan(existing);
        return existing;
    }

    function daysUntilTest(p, asOf) {
        return daysBetween(asOf || todayISO(), p.testDate);
    }

    function dayIndex(p, asOf) {
        return daysBetween(p.created, asOf || todayISO());
    }

    function isTestDay(p, asOf) {
        return (asOf || todayISO()) === p.testDate;
    }

    function isPastTest(p, asOf) {
        return daysBetween(asOf || todayISO(), p.testDate) < 0;
    }

    function compressInterval(baseDays, daysLeft) {
        if (daysLeft <= 0) return 0;
        return Math.max(0, Math.min(baseDays, Math.max(1, Math.floor(daysLeft * 0.45))));
    }

    function applyAnswer(card, { correct, mode, testDate, asOf }) {
        const today = asOf || todayISO();
        const left = Math.max(0, daysBetween(today, testDate));
        const typedFailBoost = mode === 'typed' && !correct;

        card.lastResultAt = today;
        if (correct) {
            card.successCount = (card.successCount || 0) + 1;
            card.recentCorrect = (card.recentCorrect || 0) + 1;
            card.ease = Math.min(2.9, (card.ease || 2.4) + 0.05);
            if (card.state === 'new') card.state = 'learning';
            else if (card.state === 'learning' && card.successCount >= 2) card.state = 'reviewing';
            else if (card.state === 'reviewing' && card.successCount >= 3 && card.failCount <= 1) card.state = 'mastered';

            let gap = card.state === 'mastered' ? Math.round(card.ease + 1) : Math.max(1, Math.round(card.ease - 0.5));
            gap = compressInterval(gap, left);
            card.nextDue = gap === 0 ? today : addDays(today, gap);
        } else {
            card.failCount = (card.failCount || 0) + (typedFailBoost ? 1.5 : 1);
            card.recentCorrect = 0;
            card.ease = Math.max(1.7, (card.ease || 2.4) - 0.2);
            if (card.state === 'mastered') card.state = 'reviewing';
            if (card.state === 'new') card.state = 'learning';
            // Same day if morning fail room; else next day — keep simple: same day first fail cluster
            card.nextDue = today;
            if (typedFailBoost) {
                // denser: still today
                card.nextDue = today;
            }
        }
        return card;
    }

    function readiness(p, asOf) {
        const today = asOf || todayISO();
        const cards = p.cards || [];
        if (!cards.length) return { pct: 0, label: 'atRisk' };
        let ready = 0;
        cards.forEach((c) => {
            const overdue = c.nextDue && c.nextDue < today && c.state !== 'new';
            const enough = (c.successCount || 0) >= 2 || (c.recentCorrect || 0) >= 2;
            if (enough && !overdue) ready += 1;
            else if (c.state === 'mastered' && !overdue) ready += 1;
        });
        const pct = Math.round((ready / cards.length) * 100);
        const daysLeft = daysUntilTest(p, today);
        let label = 'onTrack';
        if (pct < 40 || (daysLeft <= 2 && pct < 60)) label = 'atRisk';
        else if (pct < 65) label = 'behind';
        return { pct, label, ready, total: cards.length };
    }

    function queueForDay(p, asOf) {
        const today = asOf || todayISO();
        const idx = dayIndex(p, today);
        const daysLeft = daysUntilTest(p, today);
        const introWindow = Math.max(1, Math.floor(Math.max(1, daysBetween(p.created, p.testDate)) * 0.65));
        const inIntroPhase = idx < introWindow && !isTestDay(p, today);
        const budget = p.budgetCards || 12;

        if (isTestDay(p, today) || isPastTest(p, today)) {
            const weak = p.cards.filter((c) => c.state !== 'mastered' || (c.failCount || 0) > 1);
            const mastered = p.cards.filter((c) => c.state === 'mastered');
            const sample = shuffle(mastered).slice(0, Math.min(6, Math.ceil(mastered.length * 0.2)));
            const queue = [...weak, ...sample];
            return {
                queue: queue.map((c) => ({ ...c, kind: c.state === 'new' ? 'review' : 'review' })),
                newCount: 0,
                reviewCount: queue.length,
                catchUp: 0,
                finalRun: true,
                weakTerms: weak.map((c) => c.term),
            };
        }

        const dueReviews = p.cards.filter((c) => {
            if (c.state === 'new') return false;
            if (!c.nextDue) return c.state === 'learning';
            return c.nextDue <= today;
        });

        let intros = [];
        if (inIntroPhase) {
            intros = p.cards.filter((c) => c.state === 'new' && (c.introDay == null || c.introDay <= idx));
        }

        // Catch-up from missed days
        let catchUpExtra = 0;
        if (p.lastSessionDate) {
            const gap = daysBetween(p.lastSessionDate, today);
            if (gap > 1) {
                catchUpExtra = Math.min(8, Math.ceil(budget * 0.4));
            }
        }

        const introCap = Math.max(1, Math.floor(budget * 0.45 * intensityFactor(p.intensity)));
        const reviewCap = budget - Math.min(introCap, intros.length) + catchUpExtra;

        const pickedIntros = shuffle(intros).slice(0, introCap).map((c) => ({ ...c, kind: 'new' }));
        const pickedReviews = shuffle(dueReviews).slice(0, Math.max(0, reviewCap)).map((c) => ({ ...c, kind: 'review' }));

        // Prefer reviews first, then new
        const queue = [...pickedReviews, ...pickedIntros];
        return {
            queue,
            newCount: pickedIntros.length,
            reviewCount: pickedReviews.length,
            catchUp: catchUpExtra,
            finalRun: false,
            weakTerms: [],
        };
    }

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function normalizeAnswer(s) {
        return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function answersMatch(typed, term) {
        return normalizeAnswer(typed) === normalizeAnswer(term);
    }

    // ——— UI ———

    function syncSetupCopy() {
        const title = $('tc-setup-title');
        const helper = $('tc-setup-helper');
        if (title) title.textContent = t('setupTitle');
        if (helper) helper.textContent = t('setupHelper');
        const buildBtn = $('tc-build-btn') || document.querySelector('#screen-setup .btn.btn-blue[onclick*="launchSelectedGame"]');
        // Launch button updated from goToSetup hook
        const dateLabel = $('tc-date-label');
        if (dateLabel) dateLabel.innerHTML = `<i class="fa-solid fa-calendar-day"></i> ${t('testDate')}`;
        const budgetLabel = $('tc-budget-label');
        if (budgetLabel) budgetLabel.innerHTML = `<i class="fa-solid fa-clock"></i> ${t('dailyBudget')}`;
        const intensityLabel = $('tc-intensity-label');
        if (intensityLabel) intensityLabel.innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${t('intensity')}`;
        document.querySelectorAll('[data-tc-i18n]').forEach((el) => {
            const key = el.getAttribute('data-tc-i18n');
            if (key) el.textContent = t(key);
        });
        const warn = $('tc-cram-warn');
        if (warn && !warn.hidden) warn.textContent = t('cramWarn');
    }

    function applyI18n() {
        syncSetupCopy();
        document.querySelectorAll('[data-tc-i18n]').forEach((el) => {
            const key = el.getAttribute('data-tc-i18n');
            if (key) el.textContent = t(key);
        });
        const flag = $('tc-lang-btn');
        if (flag) flag.textContent = lang === 'pl' ? '🇬🇧' : '🇵🇱';
    }

    function minDateTomorrow() {
        return addDays(todayISO(), 1);
    }

    function syncDateConstraints() {
        const input = $('tc-test-date');
        if (!input) return;
        input.min = minDateTomorrow();
        if (!input.value || input.value < input.min) input.value = input.min;
        onSetupDateChange();
    }

    function getSetupBudgetMin() {
        const checked = document.querySelector('input[name="tc-budget"]:checked');
        if (!checked) return 15;
        if (checked.value === 'custom') {
            const n = Number($('tc-budget-custom')?.value || 15);
            return Math.max(5, Math.min(90, n));
        }
        return Number(checked.value) || 15;
    }

    function getSetupIntensity() {
        return document.querySelector('input[name="tc-intensity"]:checked')?.value || 'standard';
    }

    function onSetupDateChange() {
        const input = $('tc-test-date');
        const warn = $('tc-cram-warn');
        if (!input) return;
        const days = daysBetween(todayISO(), input.value);
        const forceCram = days < 2;
        if (warn) {
            warn.hidden = !forceCram;
            warn.textContent = t('cramWarn');
        }
        if (forceCram) {
            document.querySelectorAll('input[name="tc-intensity"]').forEach((el) => {
                el.checked = el.value === 'cram';
                el.disabled = el.value !== 'cram';
            });
        } else {
            document.querySelectorAll('input[name="tc-intensity"]').forEach((el) => {
                el.disabled = false;
            });
        }
    }

    function onBudgetChange() {
        const custom = document.querySelector('input[name="tc-budget"]:checked')?.value === 'custom';
        const wrap = $('tc-budget-custom-wrap');
        if (wrap) wrap.hidden = !custom;
    }

    function showPhase(next) {
        phase = next;
        ['tc-panel-home', 'tc-panel-session', 'tc-panel-summary'].forEach((id) => {
            const el = $(id);
            if (el) el.hidden = true;
        });
        if (next === 'home') {
            const el = $('tc-panel-home');
            if (el) el.hidden = false;
        } else if (next === 'session') {
            const el = $('tc-panel-session');
            if (el) el.hidden = false;
        } else if (next === 'summary') {
            const el = $('tc-panel-summary');
            if (el) el.hidden = false;
        }
    }

    function openScreen() {
        if (typeof showScreen === 'function') showScreen('test-countdown');
        showPhase('home');
        renderHome();
    }

    function buildPlanFromSetup(opts = {}) {
        if (typeof parseGlossary !== 'function' || !parseGlossary()) {
            alert(t('needGlossary'));
            return false;
        }
        const vocab = typeof vocabulary !== 'undefined' ? vocabulary : [];
        const testDate = $('tc-test-date')?.value;
        if (!testDate || testDate < minDateTomorrow()) {
            alert(t('needDate'));
            return false;
        }
        let intensity = getSetupIntensity();
        const days = daysBetween(todayISO(), testDate);
        if (days < 2) intensity = 'cram';
        const budgetMin = getSetupBudgetMin();

        try {
            plan = createPlan({
                vocab,
                testDate,
                budgetMin,
                intensity,
                trimTo: opts.trimTo,
            });
            savePlan(plan);
            if (plan.trimmed) {
                alert(t('trimmed', { n: plan.trimmedTo }));
            }
            if (typeof setAppHash === 'function') setAppHash('game/test-countdown');
            else if (typeof history !== 'undefined') history.replaceState(null, '', '#/game/test-countdown');
            openScreen();
            return true;
        } catch (err) {
            if (err.code === 'impossible' && err.maxTerms >= 4) {
                const ok = confirm(`${err.message}\n\nTrim to ${err.maxTerms} terms for this plan?`);
                if (ok) return buildPlanFromSetup({ trimTo: err.maxTerms });
            } else {
                alert(err.message || t('impossible'));
            }
            return false;
        }
    }

    function renderHome() {
        if (!plan) return;
        applyI18n();
        const today = todayISO();
        const left = daysUntilTest(plan, today);
        const ready = readiness(plan, today);
        const dayQ = queueForDay(plan, today);

        const countdown = $('tc-countdown');
        if (countdown) {
            countdown.textContent = left === 0 ? t('dayOf') : `${t('daysUntil')}: ${Math.max(0, left)}`;
        }

        const readyEl = $('tc-readiness');
        if (readyEl) {
            const labelKey = ready.label === 'onTrack' ? 'onTrack' : ready.label === 'behind' ? 'behind' : 'atRisk';
            readyEl.innerHTML = `<strong>${t('readiness')}: ${ready.pct}%</strong> · ${t(labelKey)}`;
            readyEl.dataset.level = ready.label;
        }

        const strip = $('tc-day-strip');
        if (strip) {
            const totalDays = Math.max(1, daysBetween(plan.created, plan.testDate));
            const cur = Math.min(totalDays, Math.max(0, dayIndex(plan, today)));
            const start = Math.max(0, cur - 3);
            const end = Math.min(totalDays, start + 7);
            let html = '';
            for (let i = start; i <= end; i++) {
                const iso = addDays(plan.created, i);
                const isToday = iso === today;
                const isTest = iso === plan.testDate;
                html += `<button type="button" class="tc-day-pill${isToday ? ' is-today' : ''}${isTest ? ' is-test' : ''}" title="${iso}">${i === totalDays ? 'T' : (i + 1)}</button>`;
            }
            strip.innerHTML = html;
        }

        const load = $('tc-today-load');
        if (load) {
            if (dayQ.finalRun) {
                load.textContent = `${t('todayLoad')}: Final run · ${dayQ.reviewCount} ${t('reviewCards')}`;
            } else {
                load.textContent = `${t('todayLoad')}: ${dayQ.newCount} ${t('newCards')} · ${dayQ.reviewCount} ${t('reviewCards')}`;
            }
        }

        const catchEl = $('tc-catchup');
        if (catchEl) {
            catchEl.hidden = !(dayQ.catchUp > 0);
            catchEl.textContent = t('catchUp');
        }

        const weak = $('tc-weak-list');
        if (weak) {
            if (dayQ.finalRun && dayQ.weakTerms.length) {
                weak.hidden = false;
                weak.innerHTML = `<p><strong>${t('goodLuck')}</strong></p><p>${t('weakList')}</p><ul>${dayQ.weakTerms.slice(0, 12).map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`;
            } else {
                weak.hidden = true;
                weak.innerHTML = '';
            }
        }

        const startBtn = $('tc-start-btn');
        if (startBtn) {
            startBtn.textContent = dayQ.finalRun ? t('finalRun') : t('startToday');
            startBtn.disabled = dayQ.queue.length === 0 && !dayQ.finalRun;
        }

        const mode = getSavedMode();
        document.querySelectorAll('input[name="tc-mode"]').forEach((el) => {
            el.checked = el.value === mode;
        });
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function startSession() {
        if (!plan) return;
        const mode = document.querySelector('input[name="tc-mode"]:checked')?.value || getSavedMode();
        setSavedMode(mode);
        const dayQ = queueForDay(plan);
        if (!dayQ.queue.length) {
            alert(t('noCards'));
            return;
        }
        session = {
            mode,
            queue: dayQ.queue.map((c) => ({ ...c })),
            index: 0,
            correct: 0,
            wrong: 0,
            newSeen: 0,
            reviewSeen: 0,
            finalRun: dayQ.finalRun,
            revealed: false,
            itemMode: null,
        };
        showPhase('session');
        renderSessionCard();
    }

    function currentItemMode() {
        if (!session) return 'know';
        if (session.mode === 'know') return 'know';
        if (session.mode === 'typed') return 'typed';
        // mixed: alternate
        return session.index % 2 === 0 ? 'know' : 'typed';
    }

    function renderSessionCard() {
        if (!session) return;
        const item = session.queue[session.index];
        if (!item) {
            endSession();
            return;
        }
        session.itemMode = currentItemMode();
        flipped = false;
        session.revealed = false;

        const progress = $('tc-session-progress');
        if (progress) progress.textContent = t('progress', { i: session.index + 1, n: session.queue.length });

        const knowWrap = $('tc-know-wrap');
        const typedWrap = $('tc-typed-wrap');
        if (session.itemMode === 'know') {
            if (knowWrap) knowWrap.hidden = false;
            if (typedWrap) typedWrap.hidden = true;
            const card = $('tc-flip-card');
            if (card) card.classList.remove('flipped');
            const front = $('tc-flip-front');
            const back = $('tc-flip-back');
            // Prompt with definition, answer is term (standard vocab review)
            if (front) front.textContent = item.definition;
            if (back) back.textContent = item.term;
            const controls = $('tc-know-controls');
            if (controls) controls.classList.remove('visible');
            const hint = $('tc-flip-hint');
            if (hint) hint.textContent = t('tapFlip');
        } else {
            if (knowWrap) knowWrap.hidden = true;
            if (typedWrap) typedWrap.hidden = false;
            const prompt = $('tc-typed-prompt');
            if (prompt) prompt.textContent = item.definition;
            const input = $('tc-typed-input');
            if (input) {
                input.value = '';
                input.disabled = false;
                setTimeout(() => input.focus(), 50);
            }
            const fb = $('tc-typed-feedback');
            if (fb) fb.textContent = '';
            const nextBtn = $('tc-typed-next');
            if (nextBtn) nextBtn.hidden = true;
            const checkBtn = $('tc-typed-check');
            if (checkBtn) checkBtn.hidden = false;
        }
    }

    function flipSessionCard() {
        if (!session || session.itemMode !== 'know') return;
        const card = $('tc-flip-card');
        if (!card) return;
        flipped = !flipped;
        card.classList.toggle('flipped', flipped);
        const controls = $('tc-know-controls');
        if (controls) controls.classList.toggle('visible', flipped);
    }

    function markKnow(knowIt) {
        if (!session || session.itemMode !== 'know') return;
        const item = session.queue[session.index];
        if (!item) return;
        const card = plan.cards.find((c) => c.id === item.id);
        if (card) {
            if (item.kind === 'new' && card.state === 'new') {
                card.introDay = dayIndex(plan);
                session.newSeen += 1;
            } else session.reviewSeen += 1;
            applyAnswer(card, { correct: knowIt, mode: 'know', testDate: plan.testDate });
        }
        if (knowIt) session.correct += 1;
        else session.wrong += 1;
        savePlan(plan);
        session.index += 1;
        if (session.index >= session.queue.length) endSession();
        else renderSessionCard();
    }

    function checkTyped() {
        if (!session || session.itemMode !== 'typed' || session.revealed) return;
        const item = session.queue[session.index];
        const input = $('tc-typed-input');
        const typed = input?.value || '';
        const ok = answersMatch(typed, item.term);
        const card = plan.cards.find((c) => c.id === item.id);
        if (card) {
            if (item.kind === 'new' && card.state === 'new') {
                card.introDay = dayIndex(plan);
                session.newSeen += 1;
            } else session.reviewSeen += 1;
            applyAnswer(card, { correct: ok, mode: 'typed', testDate: plan.testDate });
        }
        if (ok) session.correct += 1;
        else session.wrong += 1;
        savePlan(plan);
        session.revealed = true;
        const fb = $('tc-typed-feedback');
        if (fb) {
            fb.className = ok ? 'feedback success' : 'feedback error';
            fb.textContent = ok ? '✓' : `${t('reveal')}: ${item.term}`;
        }
        if (input) input.disabled = true;
        const checkBtn = $('tc-typed-check');
        if (checkBtn) checkBtn.hidden = true;
        const nextBtn = $('tc-typed-next');
        if (nextBtn) nextBtn.hidden = false;
    }

    function nextTyped() {
        if (!session) return;
        session.index += 1;
        if (session.index >= session.queue.length) endSession();
        else renderSessionCard();
    }

    function endSession() {
        if (!plan || !session) return;
        plan.lastSessionDate = todayISO();
        savePlan(plan);
        const ready = readiness(plan);
        const sum = $('tc-summary-body');
        if (sum) {
            sum.innerHTML = `
                <h3>${t('summaryTitle')}</h3>
                <p>${t('correct')}: <strong>${session.correct}</strong> · ${t('wrong')}: <strong>${session.wrong}</strong></p>
                <p>${t('newCards')}: ${session.newSeen} · ${t('reviewCards')}: ${session.reviewSeen}</p>
                <p>${t('readiness')}: <strong>${ready.pct}%</strong> · ${t(ready.label === 'onTrack' ? 'onTrack' : ready.label === 'behind' ? 'behind' : 'atRisk')}</p>
                ${session.finalRun ? `<p><strong>${t('goodLuck')}</strong></p>` : ''}
            `;
        }
        if (typeof recordGameSessionApi === 'function') {
            try {
                recordGameSessionApi('test_countdown', {
                    score: session.correct,
                    pointsEarned: session.correct,
                    wordsTotal: session.queue.length,
                    wordsMastered: plan.cards.filter((c) => c.state === 'mastered').length,
                });
            } catch { /* ignore */ }
        }
        session = null;
        showPhase('summary');
    }

    function backToHome() {
        showPhase('home');
        renderHome();
    }

    function exitToVocab() {
        plan = null;
        session = null;
        if (typeof goBack === 'function') goBack();
        else if (typeof showScreen === 'function') {
            showScreen('home');
            if (typeof openHomeSection === 'function') openHomeSection('vocab');
        }
    }

    function initFromRoute() {
        loadLang();
        const all = loadAllPlans();
        const ids = Object.keys(all);
        let fingerprint = null;
        if (typeof vocabulary !== 'undefined' && vocabulary.length) {
            fingerprint = hashString(vocabulary.map(vocabPair).map((x) => cardKey(x.term, x.definition)).join('|'));
        }
        if (fingerprint) {
            const match = ids.map((id) => all[id]).filter((p) => p.setFingerprint === fingerprint)
                .sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
            if (match) plan = match;
        }
        if (!plan && ids.length) {
            plan = ids.map((id) => all[id]).sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
        }
        if (plan) {
            if (typeof vocabulary !== 'undefined' && vocabulary.length) {
                rebuildPlanKeepingProgress(plan, vocabulary);
            }
            openScreen();
        } else if (typeof goToSetup === 'function') {
            goToSetup('test-countdown');
        }
    }

    function prepareSetup() {
        loadLang();
        syncDateConstraints();
        onBudgetChange();
        syncSetupCopy();
        const launch = document.querySelector('#screen-setup button.btn.btn-blue[onclick*="launchSelectedGame"]');
        if (launch) {
            launch.innerHTML = `${t('build')} <i class="fa-solid fa-rocket"></i>`;
        }
    }

    // Public API
    const api = {
        t,
        prepareSetup,
        buildPlanFromSetup,
        initFromRoute,
        openScreen,
        onSetupDateChange,
        onBudgetChange,
        setLang,
        toggleLang() { setLang(lang === 'en' ? 'pl' : 'en'); },
        startSession,
        flipSessionCard,
        markKnow,
        checkTyped,
        nextTyped,
        backToHome,
        exitToVocab,
        syncSetupCopy,
        get lang() { return lang; },
        get plan() { return plan; },
    };

    global.TestCountdown = api;
})(typeof window !== 'undefined' ? window : globalThis);

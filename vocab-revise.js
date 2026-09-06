/**
 * Vocab Revise games: Phrase Builder, Category Sort, Gap Fill, Revision Path.
 * Depends on globals from index.html: vocabulary, parseGlossary, vocabMatchesAnswer,
 * showScreen, appAlert, recordGameSessionApi, fcCurrentSetId, fcReadAllProgress, fcTermKey.
 */
(function () {
    const PATH_LEN = 12;
    const dictCache = new Map();

    const state = {
        game: null,
        queue: [],
        index: 0,
        score: 0,
        answered: 0,
        phraseChips: [],
        phraseBuilt: [],
        phraseTarget: [],
        categories: [],
        sortItems: [],
        sortPlaced: {},
        gapLoading: false,
    };

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function $(id) {
        return document.getElementById(id);
    }

    function baseTerms() {
        return (window.vocabulary || []).map((v) => ({
            term: v.rawTerm || v.originalTerm || '',
            definition: v.rawDef || '',
            prompt: v.prompt,
            answer: v.answer,
            card: v,
        })).filter((t) => t.term && t.definition);
    }

    async function fetchDict(term) {
        const key = String(term || '').trim().toLowerCase();
        if (!key) return null;
        if (dictCache.has(key)) return dictCache.get(key);
        try {
            const res = await fetch(`/api/dictionary/${encodeURIComponent(key)}`);
            if (!res.ok) {
                dictCache.set(key, null);
                return null;
            }
            const data = await res.json();
            dictCache.set(key, data);
            return data;
        } catch {
            dictCache.set(key, null);
            return null;
        }
    }

    function pickExample(dict, term) {
        const examples = Array.isArray(dict?.examples) ? dict.examples : [];
        const t = String(term || '').toLowerCase();
        const withTerm = examples.find((ex) => String(ex).toLowerCase().includes(t));
        return withTerm || examples[0] || null;
    }

    function blankExample(example, term) {
        const raw = String(example || '');
        const t = String(term || '').trim();
        if (!raw || !t) return { sentence: raw, blanked: raw, ok: false };
        const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (!re.test(raw)) {
            return { sentence: raw, blanked: raw.replace(/\S+$/, '_____'), ok: false };
        }
        return { sentence: raw, blanked: raw.replace(re, '_____'), ok: true };
    }

    function phraseWindow(example, term) {
        const words = String(example || '').split(/\s+/).filter(Boolean);
        const t = String(term || '').toLowerCase();
        let idx = words.findIndex((w) => w.replace(/[^\w'-]/g, '').toLowerCase() === t);
        if (idx < 0) idx = words.findIndex((w) => w.toLowerCase().includes(t));
        if (idx < 0) return words.slice(0, Math.min(6, words.length));
        const start = Math.max(0, idx - 2);
        const end = Math.min(words.length, idx + 3);
        return words.slice(start, end);
    }

    function syntheticPhrase(term, definition) {
        const def = String(definition || '').replace(/\.+$/, '').trim();
        return [`The`, `_____`, `is`, def.split(/\s+/).slice(0, 4).join(' ')].filter(Boolean);
        // Better: return words for "I need to remember _____."
    }

    function syntheticPhraseChips(term) {
        return ['Remember', 'to', 'use', term, 'today.'];
    }

    function setStatus(elId, html, cls) {
        const el = $(elId);
        if (!el) return;
        el.className = `vr-status${cls ? ` ${cls}` : ''}`;
        el.innerHTML = html || '';
    }

    function updateScoreHud(prefix) {
        const scoreEl = $(`${prefix}-score`);
        const progEl = $(`${prefix}-progress`);
        if (scoreEl) scoreEl.textContent = `Score: ${state.score}`;
        if (progEl) {
            const total = state.queue.length || 1;
            const n = Math.min(state.index + 1, total);
            progEl.textContent = `${Math.min(state.index + (state.game === 'category' ? 0 : 1), total)} / ${total}`;
            const fill = $(`${prefix}-bar-fill`);
            if (fill) fill.style.width = `${Math.round((state.answered / total) * 100)}%`;
        }
    }

    function finishGame(gameKey, title) {
        const total = state.queue.length || state.answered || 1;
        const pct = Math.round((state.score / Math.max(total, 1)) * 100);
        const overlay = $('vr-finish');
        if (overlay) {
            overlay.hidden = false;
            overlay.innerHTML = `
                <div class="vr-finish-card">
                    <h2>${esc(title)}</h2>
                    <p>You scored <strong>${state.score}</strong> / ${total} (${pct}%).</p>
                    <div class="btn-group" style="justify-content:center;margin-top:1rem;">
                        <button type="button" class="btn btn-blue" id="vr-finish-again">Play again</button>
                        <button type="button" class="btn btn-grey" id="vr-finish-exit">Exit</button>
                    </div>
                </div>`;
            $('vr-finish-again')?.addEventListener('click', () => {
                overlay.hidden = true;
                if (gameKey === 'phrase') initPhraseBuilder();
                else if (gameKey === 'category') initCategorySort();
                else if (gameKey === 'gapfill') initGapFill();
                else if (gameKey === 'revise') initRevisionPath();
            });
            $('vr-finish-exit')?.addEventListener('click', () => {
                overlay.hidden = true;
                showScreen('home');
                if (typeof openHomeSection === 'function') openHomeSection('vocab');
            });
        }
        if (typeof recordGameSessionApi === 'function') {
            recordGameSessionApi(gameKey === 'phrase' ? 'phrase_builder'
                : gameKey === 'category' ? 'category_sort'
                : gameKey === 'gapfill' ? 'gap_fill'
                : 'revision_path', {
                score: state.score,
                pointsEarned: state.score,
                wordsTotal: total,
                wordsMastered: state.score,
            });
        }
    }

    // ——— Phrase Builder ———
    async function initPhraseBuilder() {
        if (!window.vocabulary?.length && typeof parseGlossary === 'function' && !parseGlossary()) return;
        const terms = shuffle(baseTerms());
        if (terms.length < 4) {
            appAlert('Please provide at least 4 unique word/definition pairs to play.');
            return;
        }
        state.game = 'phrase';
        state.queue = terms.slice(0, Math.min(PATH_LEN, terms.length));
        state.index = 0;
        state.score = 0;
        state.answered = 0;
        $('vr-finish').hidden = true;
        showScreen('phrase');
        await renderPhraseRound();
    }

    async function renderPhraseRound() {
        if (state.index >= state.queue.length) {
            finishGame('phrase', 'Phrase Builder complete!');
            return;
        }
        const item = state.queue[state.index];
        updateScoreHud('phrase');
        $('phrase-def').textContent = item.definition;
        $('phrase-hint').textContent = 'Rebuild the phrase — tap words in order.';
        setStatus('phrase-status', 'Loading example…');
        $('phrase-bank').innerHTML = '';
        $('phrase-build').innerHTML = '';
        $('phrase-check-btn').disabled = true;

        const dict = await fetchDict(item.term);
        const example = pickExample(dict, item.term);
        let chips;
        if (example) {
            chips = phraseWindow(example, item.term);
            $('phrase-hint').textContent = 'Rebuild this short phrase from the example.';
        } else {
            chips = syntheticPhraseChips(item.term);
            $('phrase-hint').textContent = 'No online example found — rebuild this practice phrase.';
        }
        state.phraseTarget = chips.map((w) => w.replace(/[^\w'-]/g, '') === item.term.replace(/[^\w'-]/g, '')
            ? item.term
            : w);
        // Keep original tokens for display/order check (case-insensitive compare)
        state.phraseTarget = chips;
        state.phraseBuilt = [];
        state.phraseChips = shuffle(chips.map((w, i) => ({ id: `${i}-${w}`, text: w })));
        setStatus('phrase-status', '');
        drawPhraseChips();
        $('phrase-check-btn').disabled = false;
    }

    function drawPhraseChips() {
        const bank = $('phrase-bank');
        const build = $('phrase-build');
        if (!bank || !build) return;
        bank.innerHTML = state.phraseChips.map((c) =>
            `<button type="button" class="vr-chip" data-chip-id="${esc(c.id)}">${esc(c.text)}</button>`).join('');
        build.innerHTML = state.phraseBuilt.length
            ? state.phraseBuilt.map((c, i) =>
                `<button type="button" class="vr-chip vr-chip--built" data-built-idx="${i}">${esc(c.text)}</button>`).join('')
            : '<span class="vr-placeholder">Tap chips below to build the phrase</span>';

        bank.querySelectorAll('[data-chip-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-chip-id');
                const idx = state.phraseChips.findIndex((c) => c.id === id);
                if (idx < 0) return;
                state.phraseBuilt.push(state.phraseChips[idx]);
                state.phraseChips.splice(idx, 1);
                drawPhraseChips();
            });
        });
        build.querySelectorAll('[data-built-idx]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.getAttribute('data-built-idx'));
                const [chip] = state.phraseBuilt.splice(i, 1);
                if (chip) state.phraseChips.push(chip);
                drawPhraseChips();
            });
        });
    }

    function checkPhrase() {
        const built = state.phraseBuilt.map((c) => c.text.toLowerCase().replace(/[^\w'-]/g, ''));
        const target = state.phraseTarget.map((w) => w.toLowerCase().replace(/[^\w'-]/g, ''));
        const ok = built.length === target.length && built.every((w, i) => w === target[i]);
        state.answered++;
        if (ok) {
            state.score++;
            setStatus('phrase-status', 'Correct!', 'ok');
        } else {
            setStatus('phrase-status', `Not quite. Target: <strong>${esc(state.phraseTarget.join(' '))}</strong>`, 'bad');
        }
        updateScoreHud('phrase');
        $('phrase-check-btn').disabled = true;
        setTimeout(() => {
            state.index++;
            renderPhraseRound();
        }, ok ? 700 : 1600);
    }

    // ——— Category Sort ———
    function parseCategorizedGlossary(raw) {
        const lines = String(raw || '').split('\n').map((l) => l.trim()).filter(Boolean);
        const groups = new Map();
        let current = 'General';
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const header = line.match(/^#{1,3}\s+(.+)$/) || line.match(/^\[(.+)\]$/) || line.match(/^Category:\s*(.+)$/i);
            if (header) {
                current = header[1].trim();
                if (!groups.has(current)) groups.set(current, []);
                continue;
            }
            let term = '';
            let def = '';
            const sepMatch = line.match(/(=|-|:|\t)/);
            if (sepMatch) {
                const sep = sepMatch[0];
                const parts = line.split(sep);
                term = parts[0].trim();
                def = parts.slice(1).join(sep).trim();
            } else if (i + 1 < lines.length && !/^(#{1,3}\s|\[|Category:)/i.test(lines[i + 1])) {
                term = line;
                def = lines[i + 1];
                i++;
            }
            if (term && def) {
                if (!groups.has(current)) groups.set(current, []);
                groups.get(current).push({ term, definition: def, category: current });
            }
        }
        return groups;
    }

    async function initCategorySort() {
        const raw = $('glossary-input')?.value || '';
        let groups = parseCategorizedGlossary(raw);
        let items = [];
        for (const [cat, list] of groups) {
            if (cat === 'General' && groups.size === 1) continue;
            list.forEach((it) => items.push(it));
        }

        // Fallback: POS buckets via dictionary API
        if (items.length < 4) {
            if (!window.vocabulary?.length && typeof parseGlossary === 'function' && !parseGlossary()) return;
            const terms = baseTerms();
            setStatus('category-status', 'No category headers found — sorting by part of speech (online)…');
            showScreen('category');
            $('vr-finish').hidden = true;
            const byPos = { Noun: [], Verb: [], Adjective: [], Other: [] };
            for (const t of terms.slice(0, 24)) {
                const dict = await fetchDict(t.term);
                const pos = String(dict?.partOfSpeech || 'other').toLowerCase();
                let bucket = 'Other';
                if (pos.includes('noun')) bucket = 'Noun';
                else if (pos.includes('verb')) bucket = 'Verb';
                else if (pos.includes('adj')) bucket = 'Adjective';
                byPos[bucket].push({ term: t.term, definition: t.definition, category: bucket });
            }
            items = Object.values(byPos).flat();
            groups = new Map(Object.entries(byPos).filter(([, list]) => list.length));
        }

        const cats = [...new Set(items.map((i) => i.category))];
        if (cats.length < 2 || items.length < 4) {
            appAlert('Category Sort needs at least 2 categories and 4 terms. Add headers like [Jobs] or ## Food above your word pairs — or use common English words for automatic Noun/Verb/Adjective sorting.');
            return;
        }

        state.game = 'category';
        state.categories = cats;
        state.sortItems = shuffle(items).slice(0, Math.min(16, items.length));
        state.sortPlaced = {};
        state.score = 0;
        state.answered = 0;
        state.queue = state.sortItems;
        state.index = 0;
        $('vr-finish').hidden = true;
        showScreen('category');
        renderCategoryBoard();
    }

    function renderCategoryBoard() {
        const placedCount = Object.keys(state.sortPlaced).length;
        const total = state.sortItems.length || 1;
        const scoreEl = $('category-score');
        const progEl = $('category-progress');
        if (scoreEl) scoreEl.textContent = `Placed: ${placedCount}/${total}`;
        if (progEl) progEl.textContent = `${placedCount} / ${total}`;
        const fill = $('category-bar-fill');
        if (fill) fill.style.width = `${Math.round((placedCount / total) * 100)}%`;

        const buckets = $('category-buckets');
        const pool = $('category-pool');
        if (!buckets || !pool) return;

        buckets.innerHTML = state.categories.map((cat) => `
            <div class="vr-bucket" data-category="${esc(cat)}">
                <h3>${esc(cat)}</h3>
                <div class="vr-bucket-drop" data-drop="${esc(cat)}"></div>
            </div>`).join('');

        const remaining = state.sortItems.filter((it) => !state.sortPlaced[it.term.toLowerCase()]);
        pool.innerHTML = remaining.length
            ? remaining.map((it) => `
                <button type="button" class="vr-sort-card" data-term="${esc(it.term)}" title="${esc(it.definition)}">
                    <strong>${esc(it.term)}</strong>
                    <span>${esc(it.definition)}</span>
                </button>`).join('')
            : '<p class="vr-placeholder">All words placed — check your answers!</p>';

        // Show placed cards in buckets
        buckets.querySelectorAll('[data-drop]').forEach((drop) => {
            const cat = drop.getAttribute('data-drop');
            const placed = Object.entries(state.sortPlaced)
                .filter(([, c]) => c === cat)
                .map(([term]) => term);
            drop.innerHTML = placed.map((term) => {
                const it = state.sortItems.find((x) => x.term.toLowerCase() === term);
                return `<button type="button" class="vr-sort-card vr-sort-card--placed" data-unplace="${esc(it?.term || term)}">${esc(it?.term || term)}</button>`;
            }).join('');
        });

        let selected = null;
        pool.querySelectorAll('[data-term]').forEach((btn) => {
            btn.addEventListener('click', () => {
                pool.querySelectorAll('.vr-sort-card').forEach((b) => b.classList.remove('selected'));
                btn.classList.add('selected');
                selected = btn.getAttribute('data-term');
            });
        });
        buckets.querySelectorAll('.vr-bucket').forEach((bucket) => {
            bucket.addEventListener('click', () => {
                if (!selected) return;
                const cat = bucket.getAttribute('data-category');
                state.sortPlaced[selected.toLowerCase()] = cat;
                selected = null;
                renderCategoryBoard();
            });
        });
        buckets.querySelectorAll('[data-unplace]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const term = btn.getAttribute('data-unplace');
                delete state.sortPlaced[term.toLowerCase()];
                renderCategoryBoard();
            });
        });

        const left = remaining.length;
        setStatus('category-status', left
            ? `Tap a word, then tap a category. ${left} left.`
            : 'All placed — press Check.');
        $('category-check-btn').disabled = left > 0;
    }

    function checkCategorySort() {
        let correct = 0;
        state.sortItems.forEach((it) => {
            const placed = state.sortPlaced[it.term.toLowerCase()];
            if (placed === it.category) correct++;
        });
        state.score = correct;
        state.answered = state.sortItems.length;
        updateScoreHud('category');

        // Mark buckets
        document.querySelectorAll('.vr-sort-card--placed').forEach((btn) => {
            const term = btn.getAttribute('data-unplace');
            const it = state.sortItems.find((x) => x.term.toLowerCase() === String(term).toLowerCase());
            const placed = state.sortPlaced[String(term).toLowerCase()];
            btn.classList.add(placed === it?.category ? 'ok' : 'bad');
        });

        setStatus('category-status',
            `Correct: ${correct} / ${state.sortItems.length}`,
            correct === state.sortItems.length ? 'ok' : 'bad');
        $('category-check-btn').disabled = true;
        setTimeout(() => finishGame('category', 'Category Sort complete!'), 1200);
    }

    // ——— Gap Fill ———
    async function initGapFill() {
        if (!window.vocabulary?.length && typeof parseGlossary === 'function' && !parseGlossary()) return;
        const terms = shuffle(baseTerms());
        if (terms.length < 4) {
            appAlert('Please provide at least 4 unique word/definition pairs to play.');
            return;
        }
        state.game = 'gapfill';
        state.queue = terms.slice(0, Math.min(PATH_LEN, terms.length));
        state.index = 0;
        state.score = 0;
        state.answered = 0;
        $('vr-finish').hidden = true;
        showScreen('gapfill');
        await renderGapRound();
    }

    async function renderGapRound() {
        if (state.index >= state.queue.length) {
            finishGame('gapfill', 'Gap Fill complete!');
            return;
        }
        const item = state.queue[state.index];
        updateScoreHud('gapfill');
        $('gapfill-def').textContent = item.definition;
        $('gapfill-answer').value = '';
        $('gapfill-answer').disabled = true;
        $('gapfill-check-btn').disabled = true;
        setStatus('gapfill-status', 'Fetching example sentence…');
        $('gapfill-sentence').textContent = '…';

        const dict = await fetchDict(item.term);
        const example = pickExample(dict, item.term);
        let blanked;
        if (example) {
            const b = blankExample(example, item.term);
            blanked = b.blanked;
            item._gapAnswer = item.term;
            item._gapSource = 'api';
        } else {
            blanked = `A good example: people often talk about _____. (${item.definition})`;
            item._gapAnswer = item.term;
            item._gapSource = 'fallback';
        }
        $('gapfill-sentence').textContent = blanked;
        setStatus('gapfill-status', item._gapSource === 'api'
            ? 'Type the missing word from the online example.'
            : 'No dictionary example found — type the target word for this definition.');
        $('gapfill-answer').disabled = false;
        $('gapfill-check-btn').disabled = false;
        $('gapfill-answer').focus();
    }

    function checkGapFill() {
        const item = state.queue[state.index];
        const input = $('gapfill-answer')?.value || '';
        const ok = typeof vocabMatchesAnswer === 'function'
            ? vocabMatchesAnswer(input, item._gapAnswer || item.term)
            : input.trim().toLowerCase() === String(item.term).toLowerCase();
        state.answered++;
        if (ok) {
            state.score++;
            setStatus('gapfill-status', 'Correct!', 'ok');
        } else {
            setStatus('gapfill-status', `Answer: <strong>${esc(item.term)}</strong>`, 'bad');
        }
        updateScoreHud('gapfill');
        $('gapfill-check-btn').disabled = true;
        $('gapfill-answer').disabled = true;
        setTimeout(() => {
            state.index++;
            renderGapRound();
        }, ok ? 650 : 1400);
    }

    // ——— Revision Path ———
    function weakestTerms(terms) {
        const setId = typeof fcCurrentSetId === 'function' ? fcCurrentSetId() : null;
        const all = typeof fcReadAllProgress === 'function' ? fcReadAllProgress() : {};
        const words = all[setId]?.words || {};
        return [...terms].sort((a, b) => {
            const wa = words[a.term.toLowerCase()] || {};
            const wb = words[b.term.toLowerCase()] || {};
            const scoreA = (wa.totalMisses || 0) * 3 + (wa.pendingMisses || 0) * 2 - (wa.totalKnows || 0) - (wa.mastered ? 10 : 0);
            const scoreB = (wb.totalMisses || 0) * 3 + (wb.pendingMisses || 0) * 2 - (wb.totalKnows || 0) - (wb.mastered ? 10 : 0);
            return scoreB - scoreA;
        });
    }

    async function initRevisionPath() {
        if (!window.vocabulary?.length && typeof parseGlossary === 'function' && !parseGlossary()) return;
        const terms = baseTerms();
        if (terms.length < 4) {
            appAlert('Please provide at least 4 unique word/definition pairs to play.');
            return;
        }
        const ranked = weakestTerms(terms);
        const pick = ranked.slice(0, Math.min(PATH_LEN, ranked.length));
        // Mix modes: type, reverse, gap
        state.queue = pick.map((t, i) => {
            const mode = i % 3 === 0 ? 'gap' : (i % 3 === 1 ? 'reverse' : 'type');
            return { ...t, mode };
        });
        state.game = 'revise';
        state.index = 0;
        state.score = 0;
        state.answered = 0;
        $('vr-finish').hidden = true;
        showScreen('revise');
        await renderReviseRound();
    }

    async function renderReviseRound() {
        if (state.index >= state.queue.length) {
            finishGame('revise', 'Revision Path complete!');
            return;
        }
        const item = state.queue[state.index];
        updateScoreHud('revise');
        $('revise-answer').value = '';
        $('revise-answer').disabled = false;
        $('revise-check-btn').disabled = false;
        $('revise-mode').textContent = item.mode === 'gap' ? 'Gap fill'
            : item.mode === 'reverse' ? 'Term → definition'
            : 'Definition → term';

        if (item.mode === 'type') {
            $('revise-prompt').textContent = item.definition;
            item._expected = item.term;
            setStatus('revise-status', 'Type the matching term.');
        } else if (item.mode === 'reverse') {
            $('revise-prompt').textContent = item.term;
            item._expected = item.definition;
            setStatus('revise-status', 'Type the definition (or a clear synonym from your list).');
        } else {
            setStatus('revise-status', 'Fetching example…');
            $('revise-prompt').textContent = '…';
            const dict = await fetchDict(item.term);
            const example = pickExample(dict, item.term);
            if (example) {
                $('revise-prompt').textContent = blankExample(example, item.term).blanked;
            } else {
                $('revise-prompt').textContent = item.definition;
            }
            item._expected = item.term;
            setStatus('revise-status', 'Type the missing / matching term.');
        }
        $('revise-answer').focus();
    }

    function checkRevise() {
        const item = state.queue[state.index];
        const input = $('revise-answer')?.value || '';
        let ok;
        if (item.mode === 'reverse') {
            // Soft match: accept if input shares significant overlap or exact synonym match
            const exp = String(item._expected || '').toLowerCase();
            const got = input.trim().toLowerCase();
            ok = got.length >= 3 && (exp.includes(got) || got.includes(exp.slice(0, Math.min(12, exp.length)))
                || (typeof vocabMatchesAnswer === 'function' && vocabMatchesAnswer(input, item._expected)));
        } else {
            ok = typeof vocabMatchesAnswer === 'function'
                ? vocabMatchesAnswer(input, item._expected)
                : input.trim().toLowerCase() === String(item._expected).toLowerCase();
        }
        state.answered++;
        if (ok) {
            state.score++;
            setStatus('revise-status', 'Correct!', 'ok');
        } else {
            setStatus('revise-status', `Answer: <strong>${esc(item._expected)}</strong>`, 'bad');
        }
        updateScoreHud('revise');
        $('revise-check-btn').disabled = true;
        $('revise-answer').disabled = true;
        setTimeout(() => {
            state.index++;
            renderReviseRound();
        }, ok ? 650 : 1400);
    }

    function bindUi() {
        $('phrase-check-btn')?.addEventListener('click', checkPhrase);
        $('category-check-btn')?.addEventListener('click', checkCategorySort);
        $('gapfill-check-btn')?.addEventListener('click', checkGapFill);
        $('revise-check-btn')?.addEventListener('click', checkRevise);
        $('gapfill-answer')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); checkGapFill(); }
        });
        $('revise-answer')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); checkRevise(); }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindUi);
    } else {
        bindUi();
    }

    window.VocabRevise = {
        initPhraseBuilder,
        initCategorySort,
        initGapFill,
        initRevisionPath,
        GAME_IDS: ['phrase', 'category', 'gapfill', 'revise'],
    };
})();

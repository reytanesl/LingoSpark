/**
 * Topic Challenge — Primary English (premium).
 * Modes: Picture / Tiles / Text / Transform + Write | Speak | Both response path.
 */
(function (global) {
    'use strict';

    const CSS_ID = 'pe-topic-challenge-css';
    const POINTS_KEY = 'topic';

    const TILE_COLORS = [
        '#1d4ed8', '#15803d', '#7c3aed', '#b45309', '#be123c',
        '#0f766e', '#0369a1', '#475569', '#ca8a04', '#c2410c'
    ];

    let state = {
        topic: 'school',
        grammar: 'be',
        mode: 'picture',
        response: 'write', // write | speak | both
        lang: 'en',
        task: null,
        usedIds: [],
        streak: 0,
        tileOrder: [],
        chosenMcq: null,
        checked: false,
        speakHeard: false,
        speakOk: false,
        recognition: null,
        listening: false,
        lastTranscript: '',
        sceneSrc: null,
        sceneId: null,
        highlightBoxes: []
    };

    const STOP_WORDS = new Set([
        'this', 'that', 'these', 'those', 'what', 'where', 'who', 'how', 'when', 'why',
        'are', 'is', 'am', 'was', 'were', 'the', 'and', 'for', 'with', 'from', 'into',
        'your', 'her', 'his', 'their', 'our', 'about', 'talk', 'make', 'does', 'did',
        'don', "don't", 'like', 'have', 'has', 'got', 'can', 'not', 'negative', 'question',
        'every', 'day', 'here', 'there', 'very', 'also', 'just', 'some', 'any', 'all'
    ]);

    const WORD_ALIASES = {
        pupil: ['boy', 'girl'],
        student: ['boy', 'girl'],
        children: ['boy', 'girl'],
        child: ['boy', 'girl'],
        kids: ['boy', 'girl'],
        kid: ['boy', 'girl'],
        people: ['boy', 'girl', 'man', 'woman'],
        person: ['boy', 'girl', 'man', 'woman'],
        he: ['boy', 'man', 'grandfather', 'father'],
        she: ['girl', 'woman', 'teacher', 'grandmother', 'mother'],
        him: ['boy', 'man'],
        bag: ['backpack', 'bag', 'suitcase'],
        bags: ['backpack', 'bag', 'suitcase'],
        pencil: ['pencil case'],
        pens: ['pencil case'],
        pen: ['pencil case'],
        rubber: ['pencil case'],
        eraser: ['pencil case'],
        mum: ['woman', 'grandmother'],
        mom: ['woman', 'grandmother'],
        mother: ['woman', 'grandmother'],
        dad: ['man', 'grandfather'],
        father: ['man', 'grandfather'],
        sister: ['girl'],
        brother: ['boy'],
        friend: ['boy', 'girl'],
        friends: ['boy', 'girl'],
        tv: ['television'],
        fridge: ['fridge'],
        refrigerator: ['fridge'],
        jumper: ['sweater'],
        trainers: ['shoes'],
        sneakers: ['shoes'],
        bike: ['bicycle'],
        bicycle: ['bicycle'],
        rain: ['umbrella', 'raincoat', 'puddle', 'cloud'],
        rainy: ['umbrella', 'raincoat', 'puddle'],
        sunny: ['sun'],
        snow: ['snowman', 'sled'],
        winter: ['snowman', 'sled', 'scarf', 'mittens'],
        summer: ['sun', 'ice cream', 'swimsuit'],
        spring: ['flower', 'flowers', 'rainbow'],
        autumn: ['rake'],
        birthday: ['cake', 'balloon', 'gift'],
        party: ['cake', 'balloon', 'gift'],
        clock: ['clock'],
        time: ['clock'],
        meal: ['plate', 'table', 'bowl'],
        breakfast: ['cereal', 'toast', 'egg'],
        dinner: ['plate', 'table', 'soup'],
        kitchen: ['stove', 'fridge', 'sink'],
        bedroom: ['bed', 'wardrobe', 'pillow'],
        bathroom: ['bathtub', 'sink', 'towel', 'soap'],
        living: ['sofa', 'armchair', 'television'],
        park: ['tree', 'bench', 'ball'],
        beach: ['sandcastle', 'shell', 'bucket', 'boat'],
        animal: ['dog', 'cat', 'bird', 'cow', 'pig', 'horse', 'lion', 'tiger', 'monkey', 'elephant'],
        animals: ['dog', 'cat', 'bird', 'cow', 'pig', 'horse', 'lion', 'tiger', 'monkey', 'elephant'],
        pet: ['dog', 'cat'],
        zoo: ['zookeeper', 'lion', 'tiger', 'elephant', 'monkey', 'zebra', 'giraffe'],
        farm: ['cow', 'pig', 'horse', 'chicken', 'sheep', 'tractor', 'barn'],
        forest: ['tree', 'fox', 'owl', 'squirrel', 'bird'],
        teacher: ['teacher'],
        chef: ['chef'],
        waiter: ['waiter'],
        door: ['door'],
        window: ['window'],
        book: ['book', 'notebook'],
        desk: ['desk'],
        table: ['table'],
        chair: ['chair'],
        house: ['house'],
        home: ['house'],
        school: ['school', 'whiteboard', 'chalkboard'],
        classroom: ['whiteboard', 'chalkboard', 'desk'],
        bus: ['bus'],
        train: ['train'],
        taxi: ['taxi'],
        car: ['car'],
        apple: ['apple'],
        banana: ['banana'],
        bread: ['bread', 'baguette'],
        cake: ['cake', 'cupcake'],
        dog: ['dog'],
        cat: ['cat'],
        cow: ['cow'],
        pig: ['pig'],
        horse: ['horse'],
        bird: ['bird'],
        fish: ['fish'],
        ball: ['ball', 'basketball', 'football'],
        football: ['ball'],
        hat: ['hat', 'cap'],
        coat: ['coat'],
        dress: ['dress'],
        shoes: ['shoes', 'boots', 'sandals'],
        umbrella: ['umbrella'],
        sun: ['sun'],
        moon: ['moon'],
        tree: ['tree', 'pine tree'],
        flower: ['flower', 'flowers', 'tulip'],
        flowers: ['flower', 'flowers', 'tulip']
    };

    function bank() {
        return global.PE_TOPIC_CHALLENGE_BANK || [];
    }

    function topics() {
        return global.PE_TOPIC_CHALLENGE_TOPICS || [];
    }

    function grammars() {
        return global.PE_TOPIC_CHALLENGE_GRAMMARS || [];
    }

    function scenesForTopic(topicId) {
        const map = global.PE_TOPIC_CHALLENGE_SCENES || {};
        return map[topicId] || [];
    }

    function sceneIdFromSrc(src) {
        const base = String(src || '').split('/').pop() || '';
        return base.replace(/\.(png|jpe?g|webp)$/i, '');
    }

    function hotspotsForScene(sceneId) {
        const map = global.PE_TOPIC_CHALLENGE_HOTSPOTS || {};
        return map[sceneId] || [];
    }

    function taskSearchTokens(task) {
        const text = [
            task.answer,
            task.promptEn,
            task.promptPl,
            ...(task.tiles || []),
            ...(task.accept || [])
        ].join(' ').toLowerCase();
        const raw = text.replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(Boolean);
        const tokens = [];
        raw.forEach((w) => {
            if (w.length < 2 || STOP_WORDS.has(w)) return;
            tokens.push(w);
            (WORD_ALIASES[w] || []).forEach((a) => tokens.push(a));
        });
        // Gender preference from pronouns in answer/prompt
        const joined = text;
        if (/\b(he|him|his|boy|man|brother|father|dad)\b/.test(joined)) {
            tokens.push('boy', 'man', 'grandfather');
        }
        if (/\b(she|her|girl|woman|sister|mother|mum|mom)\b/.test(joined)) {
            tokens.push('girl', 'woman', 'teacher', 'grandmother');
        }
        return [...new Set(tokens)];
    }

    function hotspotMatchesToken(hotspotWord, token) {
        const hw = String(hotspotWord || '').toLowerCase();
        const t = String(token || '').toLowerCase();
        if (!hw || !t) return false;
        if (hw === t) return 3;
        if (hw.startsWith(t + ' ') || hw.endsWith(' ' + t) || hw.includes(' ' + t + ' ')) return 2;
        if (t.length >= 4 && (hw.includes(t) || t.includes(hw))) return 1;
        return 0;
    }

    function scoreHotspot(hs, tokens) {
        let best = 0;
        tokens.forEach((tok) => {
            best = Math.max(best, hotspotMatchesToken(hs.w, tok));
        });
        return best;
    }

    function pickHighlights(sceneId, task) {
        const hs = hotspotsForScene(sceneId);
        if (!hs.length) return [];
        const tokens = taskSearchTokens(task);
        if (!tokens.length) return [];
        const scored = hs
            .map((h, idx) => ({ h, idx, score: scoreHotspot(h, tokens) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score || a.idx - b.idx);
        if (!scored.length) return [];
        const topScore = scored[0].score;
        // Prefer a single best target; if several share top score and same word, pick one
        const top = scored.filter((x) => x.score === topScore);
        const chosen = top[0];
        return [{ w: chosen.h.w, b: chosen.h.b }];
    }

    function pickSceneForTask(topicId, task) {
        const list = scenesForTopic(topicId);
        if (!list.length) return { src: null, id: null, highlights: [] };
        const ranked = list.map((src) => {
            const id = sceneIdFromSrc(src);
            const highlights = pickHighlights(id, task);
            return { src, id, highlights, score: highlights.length ? 2 : 0 };
        }).sort((a, b) => b.score - a.score);
        const winners = ranked.filter((r) => r.score === ranked[0].score);
        const pick = winners[Math.floor(Math.random() * winners.length)];
        return pick;
    }

    function pickScene(topicId) {
        const list = scenesForTopic(topicId);
        if (!list.length) return null;
        return list[Math.floor(Math.random() * list.length)];
    }

    function t(en, pl) {
        return state.lang === 'pl' ? (pl || en) : en;
    }

    function injectCss() {
        if (document.getElementById(CSS_ID)) return;
        const style = document.createElement('style');
        style.id = CSS_ID;
        style.textContent = `
#topic-challenge-root { --tc-accent: #0e7490; --tc-ink: #0f172a; }
.tc-wrap { font-family: var(--font-secondary, Inter, sans-serif); color: var(--tc-ink); }
.tc-toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 0.85rem; }
.tc-tabs { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.75rem; }
.tc-tab { border: 2px solid #cbd5e1; background: #fff; color: #334155; border-radius: 0.55rem; padding: 0.4rem 0.75rem; font-weight: 700; cursor: pointer; font-family: var(--font-primary, Poppins, sans-serif); font-size: 0.9rem; }
.tc-tab.active { background: var(--tc-accent); border-color: var(--tc-accent); color: #fff; }
.tc-meta { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: center; color: #64748b; font-size: 0.9rem; margin-bottom: 0.75rem; }
.tc-streak { font-weight: 700; color: var(--tc-accent); }
.tc-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 0.85rem; padding: 1.1rem 1.15rem; box-shadow: 0 1px 0 rgba(15,23,42,0.04); }
.tc-cue { font-size: 3.2rem; line-height: 1; text-align: center; margin: 0.35rem 0 0.75rem; }
.tc-scene { margin: 0 0 0.9rem; border-radius: 0.75rem; overflow: hidden; border: 1px solid #e2e8f0; background: #0f172a0d; }
.tc-scene-frame { width: 100%; background: #f1f5f9; display: flex; justify-content: center; align-items: center; min-height: 160px; padding: 0.35rem; }
.tc-scene-stage { position: relative; display: inline-block; max-width: 100%; line-height: 0; }
.tc-scene-stage img { display: block; width: auto; max-width: 100%; max-height: min(52vh, 420px); height: auto; }
.tc-scene-overlay { position: absolute; inset: 0; pointer-events: none; }
.tc-hotspot {
  position: absolute;
  border: 3px solid #ef4444;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(255,255,255,0.9), 0 0 0 6px rgba(239,68,68,0.35), 0 8px 18px rgba(15,23,42,0.25);
  background: rgba(239, 68, 68, 0.12);
  animation: tcPulse 1.4s ease-in-out infinite;
}
@keyframes tcPulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(255,255,255,0.9), 0 0 0 6px rgba(239,68,68,0.3), 0 8px 18px rgba(15,23,42,0.25); }
  50% { box-shadow: 0 0 0 3px rgba(255,255,255,0.95), 0 0 0 10px rgba(239,68,68,0.18), 0 8px 18px rgba(15,23,42,0.25); }
}
.tc-scene-caption { font-size: 0.8rem; color: #64748b; text-align: center; padding: 0.35rem 0.5rem 0.5rem; }
.tc-scene-caption strong { color: #0e7490; }
.tc-prompt { font-size: 1.05rem; font-weight: 600; margin-bottom: 0.85rem; color: #0f172a; }
.tc-pair { background: #ecfeff; border-left: 3px solid var(--tc-accent); padding: 0.55rem 0.75rem; border-radius: 0 0.45rem 0.45rem 0; margin-bottom: 0.85rem; font-size: 0.92rem; color: #155e75; }
.tc-transform-from { background: #f8fafc; border: 1px dashed #94a3b8; border-radius: 0.55rem; padding: 0.65rem 0.8rem; margin-bottom: 0.85rem; font-size: 1.05rem; }
.tc-input { width: 100%; padding: 0.75rem 0.9rem; border: 2px solid #cbd5e1; border-radius: 0.55rem; font-size: 1.05rem; font-family: inherit; }
.tc-input:focus { outline: none; border-color: var(--tc-accent); }
.tc-mcq { display: grid; gap: 0.45rem; margin-top: 0.5rem; }
.tc-mcq button { text-align: left; padding: 0.65rem 0.85rem; border: 2px solid #e2e8f0; border-radius: 0.55rem; background: #fff; cursor: pointer; font-size: 0.98rem; }
.tc-mcq button.picked { border-color: var(--tc-accent); background: #ecfeff; }
.tc-mcq button.correct { border-color: #00823B; background: #ecfdf5; }
.tc-mcq button.wrong { border-color: #C8102E; background: #fef2f2; }
.tc-tiles-pool, .tc-tiles-build { display: flex; flex-wrap: wrap; gap: 0.4rem; min-height: 2.6rem; margin: 0.4rem 0 0.7rem; padding: 0.55rem; border-radius: 0.55rem; border: 2px dashed #cbd5e1; background: #f8fafc; }
.tc-tiles-build { border-style: solid; background: #fff; }
.tc-tile { border: none; border-radius: 0.45rem; padding: 0.45rem 0.65rem; color: #fff; font-weight: 700; cursor: pointer; font-size: 0.95rem; }
.tc-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.9rem; }
.tc-actions .btn { font-size: 0.95rem; }
.tc-feedback { margin-top: 0.85rem; padding: 0.7rem 0.85rem; border-radius: 0.55rem; display: none; font-weight: 600; }
.tc-feedback.ok { display: block; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
.tc-feedback.bad { display: block; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.tc-feedback.info { display: block; background: #eff6ff; color: #1e3a8a; border: 1px solid #bfdbfe; }
.tc-speak-panel { margin-top: 0.75rem; padding: 0.75rem; border-radius: 0.55rem; background: #f0f9ff; border: 1px solid #bae6fd; }
.tc-speak-panel .tc-transcript { margin-top: 0.45rem; font-size: 0.92rem; color: #0369a1; min-height: 1.2em; }
.tc-lang-toggle { margin-left: auto; }
.tc-gap { font-size: 1.1rem; line-height: 1.7; margin-bottom: 0.6rem; }
.tc-gap .blank { display: inline-block; min-width: 4.5rem; border-bottom: 2px solid var(--tc-accent); margin: 0 0.15rem; text-align: center; color: var(--tc-accent); font-weight: 700; }
.tc-why { margin-top: 0.55rem; font-size: 0.92rem; font-weight: 500; color: #334155; white-space: pre-wrap; }
`;
        document.head.appendChild(style);
    }

    function normalize(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/['']/g, "'")
            .replace(/[?!.,]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function answersMatch(user, task) {
        const n = normalize(user);
        if (!n) return false;
        const opts = [task.answer].concat(task.accept || []);
        return opts.some((a) => normalize(a) === n);
    }

    function filterPool(mode) {
        const m = mode || state.mode;
        return bank().filter((item) => {
            if (item.topic !== state.topic || item.grammar !== state.grammar) return false;
            const hints = item.modeHints || [];
            if (m === 'transform') return hints.includes('transform') && item.transformFrom;
            if (m === 'tiles') return hints.includes('tiles') && Array.isArray(item.tiles) && item.tiles.length;
            if (m === 'picture') return hints.includes('picture');
            return hints.includes('text') || hints.includes('picture') || hints.includes('tiles');
        });
    }

    function pickTask() {
        let pool = filterPool(state.mode);
        if (!pool.length && state.mode === 'tiles') {
            pool = bank().filter((i) => i.topic === state.topic && i.grammar === state.grammar && i.tiles && i.tiles.length);
        }
        if (!pool.length && state.mode === 'transform') {
            // Prefer same topic transform cards from any grammar
            pool = bank().filter((i) => i.topic === state.topic && (i.modeHints || []).includes('transform') && i.transformFrom);
        }
        if (!pool.length && (state.mode === 'picture' || state.mode === 'tiles')) {
            // Negatives/questions banks are transform-heavy — use text-capable items
            pool = bank().filter((i) => i.topic === state.topic && i.grammar === state.grammar);
        }
        if (!pool.length) {
            pool = bank().filter((i) => i.topic === state.topic && i.grammar === state.grammar);
        }
        if (!pool.length) return null;
        const fresh = pool.filter((i) => !state.usedIds.includes(i.id));
        const list = fresh.length ? fresh : pool;
        if (!fresh.length) state.usedIds = [];
        const task = list[Math.floor(Math.random() * list.length)];
        state.usedIds.push(task.id);
        return task;
    }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function speakText(text) {
        if (!text || !global.speechSynthesis) return;
        global.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-GB';
        u.rate = 0.92;
        global.speechSynthesis.speak(u);
    }

    function getSpeechRecognition() {
        const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
        if (!SR) return null;
        try {
            const rec = new SR();
            rec.lang = 'en-GB';
            rec.interimResults = false;
            rec.maxAlternatives = 3;
            return rec;
        } catch {
            return null;
        }
    }

    function stopListening() {
        if (state.recognition && state.listening) {
            try { state.recognition.stop(); } catch { /* */ }
        }
        state.listening = false;
    }

    function rootEl() {
        return document.getElementById('topic-challenge-root');
    }

    function readSetupFromDom() {
        const topicEl = document.getElementById('topic-setup-topic');
        const gramEl = document.getElementById('topic-setup-grammar');
        const speakEl = document.getElementById('topic-setup-speak');
        const modeEl = document.querySelector('input[name="topic-setup-mode"]:checked');
        const respEl = document.querySelector('input[name="topic-setup-response"]:checked');
        if (topicEl && topicEl.value) state.topic = topicEl.value;
        if (gramEl && gramEl.value) state.grammar = gramEl.value;
        // Modes can still be switched in-game; setup defaults to Picture
        state.mode = (modeEl && modeEl.value) ? modeEl.value : 'picture';
        if (speakEl) {
            state.response = speakEl.checked ? 'both' : 'write';
        } else if (respEl && respEl.value) {
            state.response = respEl.value;
        } else {
            state.response = 'write';
        }
    }

    function labelTopic(id) {
        const row = topics().find((x) => x.id === id);
        return row ? t(row.label, row.labelPl) : id;
    }

    function labelGrammar(id) {
        const row = grammars().find((x) => x.id === id);
        return row ? t(row.label, row.labelPl) : id;
    }

    function buildMcqOptions(task) {
        const opts = [task.answer].concat((task.distractors || []).slice(0, 3));
        return shuffle([...new Set(opts)]).slice(0, 4);
    }

    function gapPrompt(task) {
        // Replace one content word in answer with blank for text mode variety
        const words = task.answer.replace(/[.?!,]/g, '').split(/\s+/).filter(Boolean);
        if (words.length < 3) return null;
        const skip = new Set(['a', 'an', 'the', 'to', 'at', 'in', 'on', 'of', 'is', 'are', 'am', 'i', 'you', 'he', 'she', 'we', 'they']);
        const candidates = words
            .map((w, i) => ({ w, i }))
            .filter((x) => !skip.has(x.w.toLowerCase()) && x.w.length > 2);
        if (!candidates.length) return null;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const shown = task.answer.replace(new RegExp('\\b' + pick.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'), '___');
        return { shown, blank: pick.w };
    }

    function render() {
        const root = rootEl();
        if (!root) return;
        injectCss();
        const task = state.task;
        if (!task) {
            root.innerHTML = `<div class="tc-wrap"><p>${t('No tasks for this topic and grammar yet.', 'Brak zadań dla tego tematu i gramatyki.')}</p>
                <button type="button" class="btn btn-outline" id="tc-retry">${t('Try again', 'Spróbuj ponownie')}</button></div>`;
            root.querySelector('#tc-retry')?.addEventListener('click', () => newRound());
            return;
        }

        const showWrite = state.response === 'write' || state.response === 'both';
        const showSpeak = state.response === 'speak' || state.response === 'both';
        const prompt = state.lang === 'pl' ? task.promptPl : task.promptEn;
        const pair = state.lang === 'pl' ? task.pairCuePl : task.pairCueEn;

        let body = '';
        if (state.mode === 'picture') {
            if (state.sceneSrc) {
                const hasFocus = (state.highlightBoxes || []).length > 0;
                const caption = hasFocus
                    ? t('Look at the circled part of the picture', 'Spójrz na zakreśloną część obrazka')
                    : t('Look at the whole picture', 'Spójrz na cały obrazek');
                body += `<div class="tc-scene">
                    <div class="tc-scene-frame" id="tc-scene-frame">
                        <div class="tc-scene-stage" id="tc-scene-stage">
                            <img id="tc-scene-img" src="${escapeAttr(state.sceneSrc)}" alt="${escapeAttr(labelTopic(state.topic))} scene" loading="lazy">
                            <div class="tc-scene-overlay" id="tc-scene-overlay"></div>
                        </div>
                    </div>
                    <div class="tc-scene-caption"><strong>${escapeHtml(caption)}</strong></div>
                </div>`;
            } else {
                body += `<div class="tc-cue" aria-hidden="true">${task.cue || '📝'}</div>`;
            }
        } else if (state.sceneSrc) {
            body += `<div class="tc-scene" style="max-width:260px;margin-left:auto;margin-right:auto;">
                <div class="tc-scene-frame">
                    <div class="tc-scene-stage" id="tc-scene-stage">
                        <img id="tc-scene-img" src="${escapeAttr(state.sceneSrc)}" alt="" loading="lazy" style="max-height:140px;">
                        <div class="tc-scene-overlay" id="tc-scene-overlay"></div>
                    </div>
                </div>
            </div>`;
        }
        body += `<div class="tc-prompt">${escapeHtml(prompt)}</div>`;
        if (pair && showSpeak) {
            body += `<div class="tc-pair"><i class="fa-solid fa-comments"></i> ${escapeHtml(pair)}</div>`;
        }
        if (state.mode === 'transform' && task.transformFrom) {
            const kind = task.transformTo === 'question'
                ? t('Make a question', 'Zrób pytanie')
                : t('Make it negative', 'Zrób przeczenie');
            body += `<div class="tc-transform-from"><strong>${kind}:</strong> ${escapeHtml(task.transformFrom)}</div>`;
        }

        if (state.mode === 'tiles') {
            const built = state.tileOrder.map((idx) => {
                const word = task.tiles[idx];
                const color = TILE_COLORS[idx % TILE_COLORS.length];
                return `<button type="button" class="tc-tile" data-build="${idx}" style="background:${color}">${escapeHtml(word)}</button>`;
            }).join('');
            const poolIdx = task.tiles.map((_, i) => i).filter((i) => !state.tileOrder.includes(i));
            const pool = shuffle(poolIdx).map((idx) => {
                const word = task.tiles[idx];
                const color = TILE_COLORS[idx % TILE_COLORS.length];
                return `<button type="button" class="tc-tile" data-pool="${idx}" style="background:${color}">${escapeHtml(word)}</button>`;
            }).join('');
            // add distractor word tiles if available
            const extra = (task.distractors || []).slice(0, 2).flatMap((d) => d.split(/\s+/).slice(0, 2));
            const extraHtml = shuffle(extra).slice(0, 3).map((w, i) =>
                `<button type="button" class="tc-tile" data-extra="${escapeHtml(w)}" style="background:#94a3b8">${escapeHtml(w)}</button>`
            ).join('');
            body += `<div class="tc-label">${t('Build the sentence', 'Ułóż zdanie')}</div>
                <div class="tc-tiles-build" id="tc-build">${built || ''}</div>
                <div class="tc-label">${t('Word bank', 'Bank słów')}</div>
                <div class="tc-tiles-pool" id="tc-pool">${pool}${extraHtml}</div>`;
        } else if (state.mode === 'text' && state._gap) {
            body += `<div class="tc-gap">${escapeHtml(state._gap.shown).replace('___', '<span class="blank">___</span>')}</div>`;
            if (showWrite) {
                body += `<input type="text" class="tc-input" id="tc-answer" autocomplete="off" placeholder="${t('Type the missing word', 'Wpisz brakujące słowo')}" ${state.checked ? 'disabled' : ''}>`;
            }
        } else if (state.mode === 'text' || state.mode === 'picture' || state.mode === 'transform') {
            const useMcq = (state.mode === 'picture' || state.mode === 'text') && (task.distractors || []).length >= 2 && Math.random() < 0.55 && !state._forceType;
            // Use state flag so it stays stable for this task
            if (state._useMcq == null) state._useMcq = useMcq && showWrite && state.mode !== 'transform';
            if (state._useMcq && showWrite) {
                const opts = state._mcqOpts || buildMcqOptions(task);
                state._mcqOpts = opts;
                body += `<div class="tc-mcq" id="tc-mcq">${opts.map((o) =>
                    `<button type="button" data-mcq="${escapeAttr(o)}" class="${state.chosenMcq === o ? 'picked' : ''}">${escapeHtml(o)}</button>`
                ).join('')}</div>`;
            } else if (showWrite) {
                body += `<input type="text" class="tc-input" id="tc-answer" autocomplete="off" placeholder="${t('Type your answer', 'Wpisz odpowiedź')}" ${state.checked ? 'disabled' : ''}>`;
            }
        }

        if (showSpeak) {
            const micOk = !!(global.SpeechRecognition || global.webkitSpeechRecognition);
            body += `<div class="tc-speak-panel">
                <strong>${t('Speaking', 'Mówienie')}</strong>
                <div class="tc-actions" style="margin-top:0.5rem;">
                    <button type="button" class="btn btn-outline" id="tc-hear"><i class="fa-solid fa-volume-high"></i> ${t('Hear model', 'Posłuchaj wzoru')}</button>
                    ${micOk
                        ? `<button type="button" class="btn btn-blue" id="tc-mic"><i class="fa-solid fa-microphone"></i> ${state.listening ? t('Listening…', 'Słucham…') : t('Say it', 'Powiedz')}</button>`
                        : ''}
                    <button type="button" class="btn btn-outline" id="tc-said-it"><i class="fa-solid fa-hand"></i> ${t('I said it', 'Powiedziałem/am')}</button>
                </div>
                <div class="tc-transcript" id="tc-transcript">${escapeHtml(state.lastTranscript || (micOk ? t('Tap Say it and speak clearly.', 'Dotknij Powiedz i mów wyraźnie.') : t('No mic recognition here — use Hear + I said it (teacher/partner check).', 'Brak rozpoznawania mowy — użyj Posłuchaj + Powiedziałem/am (sprawdza nauczyciel/partner).')))}</div>
            </div>`;
        }

        body += `<div class="tc-actions">
            <button type="button" class="btn btn-blue" id="tc-check" ${state.checked ? 'disabled' : ''}><i class="fa-solid fa-check"></i> ${t('Check', 'Sprawdź')}</button>
            <button type="button" class="btn btn-outline" id="tc-new"><i class="fa-solid fa-rotate"></i> ${t('New task', 'Nowe zadanie')}</button>
            <button type="button" class="btn btn-outline tc-lang-toggle" id="tc-lang">${state.lang === 'en' ? 'PL' : 'EN'}</button>
            <button type="button" class="btn btn-outline" id="tc-why" style="display:none;"><i class="fa-solid fa-robot"></i> ${t('Ask why', 'Dopytaj AI')}</button>
        </div>
        <div class="tc-feedback" id="tc-feedback"></div>
        <div class="tc-why" id="tc-why-box" hidden></div>`;

        const modeTabs = ['picture', 'tiles', 'text', 'transform'].map((m) => {
            const labels = {
                picture: t('Picture', 'Obrazek'),
                tiles: t('Tiles', 'Kafelki'),
                text: t('Text', 'Tekst'),
                transform: t('Transform', 'Przekształć')
            };
            return `<button type="button" class="tc-tab ${state.mode === m ? 'active' : ''}" data-mode="${m}">${labels[m]}</button>`;
        }).join('');

        root.innerHTML = `<div class="tc-wrap">
            <div class="tc-tabs">${modeTabs}</div>
            <div class="tc-meta">
                <span><i class="fa-solid fa-book"></i> ${escapeHtml(labelTopic(state.topic))}</span>
                <span><i class="fa-solid fa-language"></i> ${escapeHtml(labelGrammar(state.grammar))}</span>
                <span class="tc-streak"><i class="fa-solid fa-fire"></i> ${state.streak}</span>
                <span>${t('Path', 'Tryb')}: ${state.response === 'write' ? t('Write', 'Pisanie') : state.response === 'speak' ? t('Speak', 'Mówienie') : t('Both', 'Oba')}</span>
            </div>
            <div class="tc-card">${body}</div>
        </div>`;

        bindUi();
        placeSceneHighlights();
    }

    function placeSceneHighlights() {
        const overlay = document.getElementById('tc-scene-overlay');
        const img = document.getElementById('tc-scene-img');
        if (!overlay || !img) return;
        overlay.innerHTML = '';
        const boxes = state.highlightBoxes || [];
        if (!boxes.length) return;

        const draw = () => {
            overlay.innerHTML = '';
            boxes.forEach((box) => {
                const [x0, y0, x1, y1] = box.b;
                const el = document.createElement('div');
                el.className = 'tc-hotspot';
                el.setAttribute('aria-hidden', 'true');
                // Expand slightly so the circle clearly covers the target
                const padX = Math.max(0.012, (x1 - x0) * 0.08);
                const padY = Math.max(0.012, (y1 - y0) * 0.08);
                const left = Math.max(0, x0 - padX) * 100;
                const top = Math.max(0, y0 - padY) * 100;
                const width = Math.min(1, x1 + padX) * 100 - left;
                const height = Math.min(1, y1 + padY) * 100 - top;
                el.style.left = left + '%';
                el.style.top = top + '%';
                el.style.width = width + '%';
                el.style.height = height + '%';
                overlay.appendChild(el);
            });
        };

        if (img.complete && img.naturalWidth) draw();
        else img.addEventListener('load', draw, { once: true });
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(s) {
        return escapeHtml(s).replace(/'/g, '&#39;');
    }

    function bindUi() {
        const root = rootEl();
        if (!root) return;

        root.querySelectorAll('.tc-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.mode = btn.getAttribute('data-mode');
                newRound();
            });
        });

        root.querySelector('#tc-lang')?.addEventListener('click', () => {
            state.lang = state.lang === 'en' ? 'pl' : 'en';
            render();
        });

        root.querySelector('#tc-new')?.addEventListener('click', () => newRound());

        root.querySelectorAll('[data-pool]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (state.checked) return;
                const idx = Number(btn.getAttribute('data-pool'));
                state.tileOrder.push(idx);
                render();
            });
        });
        root.querySelectorAll('[data-build]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (state.checked) return;
                const idx = Number(btn.getAttribute('data-build'));
                state.tileOrder = state.tileOrder.filter((x) => x !== idx);
                render();
            });
        });
        root.querySelectorAll('[data-extra]').forEach((btn) => {
            btn.addEventListener('click', () => {
                // distractors: ignore / flash — don't add to build
                btn.style.opacity = '0.4';
            });
        });

        root.querySelectorAll('[data-mcq]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (state.checked) return;
                state.chosenMcq = btn.getAttribute('data-mcq');
                render();
            });
        });

        root.querySelector('#tc-check')?.addEventListener('click', () => checkAnswer());
        root.querySelector('#tc-hear')?.addEventListener('click', () => {
            state.speakHeard = true;
            speakText(state.task.answer);
        });
        root.querySelector('#tc-said-it')?.addEventListener('click', () => {
            // Classroom self-check: reveal model and award if path is speak-only or after hear
            const fb = root.querySelector('#tc-feedback');
            if (!state.speakHeard) {
                if (fb) {
                    fb.className = 'tc-feedback info';
                    fb.textContent = t('Hear the model first, then say it and tap I said it.', 'Najpierw posłuchaj wzoru, potem powiedz i kliknij Powiedziałem/am.');
                }
                return;
            }
            state.speakOk = true;
            if (state.response === 'speak') {
                finishCorrect(t('Nice speaking! Check with your teacher if unsure.', 'Świetnie! W razie wątpliwości sprawdź z nauczycielem.'), true);
            } else {
                if (fb) {
                    fb.className = 'tc-feedback info';
                    fb.textContent = t('Spoken — now type or check your written answer too.', 'Powiedziane — teraz wpisz lub sprawdź też odpowiedź pisemną.');
                }
            }
        });
        root.querySelector('#tc-mic')?.addEventListener('click', () => startMic());
        root.querySelector('#tc-why')?.addEventListener('click', () => askWhy());

        const input = root.querySelector('#tc-answer');
        if (input && !state.checked) {
            input.focus();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') checkAnswer();
            });
        }
    }

    function getUserAnswer() {
        if (state.mode === 'tiles') {
            return state.tileOrder.map((i) => state.task.tiles[i]).join(' ');
        }
        if (state._useMcq && state.chosenMcq) return state.chosenMcq;
        const input = rootEl()?.querySelector('#tc-answer');
        if (input) {
            if (state._gap) return String(input.value || '').trim();
            return String(input.value || '').trim();
        }
        return '';
    }

    function expectedForGap() {
        return state._gap ? state._gap.blank : null;
    }

    function checkAnswer() {
        if (!state.task || state.checked) return;
        const root = rootEl();
        const fb = root?.querySelector('#tc-feedback');
        const whyBtn = root?.querySelector('#tc-why');

        if (state.response === 'speak') {
            // Prefer recognition result; else require I said it after hear
            if (state.lastTranscript && answersMatch(state.lastTranscript, state.task)) {
                finishCorrect(t('Great speaking!', 'Świetne mówienie!'), false);
                return;
            }
            if (state.speakOk) {
                finishCorrect(t('Marked as said — well done!', 'Oznaczone jako powiedziane — brawo!'), true);
                return;
            }
            if (fb) {
                fb.className = 'tc-feedback bad';
                fb.textContent = t('Say the sentence (mic or I said it after Hear), then Check.', 'Powiedz zdanie (mikrofon lub Powiedziałem/am po Posłuchaj), potem Sprawdź.');
            }
            return;
        }

        let user = getUserAnswer();
        let ok = false;
        if (state._gap) {
            ok = normalize(user) === normalize(expectedForGap());
            // also accept full sentence
            if (!ok) ok = answersMatch(user, state.task);
        } else if (state.mode === 'tiles') {
            const built = normalize(user);
            const target = normalize(state.task.tiles.join(' '));
            ok = built === target || answersMatch(user.replace(/\s+([.?!,])/g, '$1'), state.task);
        } else {
            ok = answersMatch(user, state.task);
        }

        if (state.response === 'both' && !state.speakOk && !(state.lastTranscript && answersMatch(state.lastTranscript, state.task))) {
            if (fb) {
                fb.className = 'tc-feedback info';
                fb.textContent = t('Speak first (mic or I said it after Hear), then Check your writing.', 'Najpierw powiedz (mikrofon lub Powiedziałem/am po Posłuchaj), potem Sprawdź pismo.');
            }
            return;
        }

        if (ok) {
            finishCorrect(t('Correct!', 'Dobrze!'), false);
        } else {
            state.checked = true;
            state.streak = 0;
            if (fb) {
                fb.className = 'tc-feedback bad';
                fb.textContent = t('Not quite. Model: ', 'Niezupełnie. Wzór: ') + state.task.answer;
            }
            if (whyBtn) whyBtn.style.display = '';
            // colour mcq
            root?.querySelectorAll('[data-mcq]').forEach((btn) => {
                const v = btn.getAttribute('data-mcq');
                if (answersMatch(v, state.task)) btn.classList.add('correct');
                else if (v === state.chosenMcq) btn.classList.add('wrong');
            });
            if (typeof global.recordGameSessionApi === 'function') {
                global.recordGameSessionApi('pe_topic', { score: 0, pointsEarned: 0 });
            }
        }
    }

    function finishCorrect(msg, soft) {
        state.checked = true;
        state.streak += 1;
        const pts = soft ? 10 : (15 + Math.min(state.streak, 5) * 2);
        if (typeof global.peAddPoints === 'function') global.peAddPoints(POINTS_KEY, pts);
        if (typeof global.incrementGameCount === 'function') global.incrementGameCount();
        if (typeof global.recordGameSessionApi === 'function') {
            global.recordGameSessionApi('pe_topic', { score: pts, pointsEarned: pts });
        }
        const fb = rootEl()?.querySelector('#tc-feedback');
        if (fb) {
            fb.className = 'tc-feedback ok';
            fb.textContent = msg + ' +' + pts;
        }
        rootEl()?.querySelectorAll('[data-mcq]').forEach((btn) => {
            if (answersMatch(btn.getAttribute('data-mcq'), state.task)) btn.classList.add('correct');
        });
    }

    function startMic() {
        stopListening();
        const rec = getSpeechRecognition();
        if (!rec) return;
        state.recognition = rec;
        state.listening = true;
        render();
        rec.onresult = (ev) => {
            let best = '';
            try {
                const res = ev.results[0];
                best = res[0].transcript || '';
                for (let i = 0; i < res.length; i++) {
                    if (answersMatch(res[i].transcript, state.task)) {
                        best = res[i].transcript;
                        break;
                    }
                }
            } catch { /* */ }
            state.lastTranscript = best;
            state.listening = false;
            if (answersMatch(best, state.task)) {
                state.speakOk = true;
                if (state.response === 'speak') {
                    finishCorrect(t('Great speaking!', 'Świetne mówienie!'), false);
                    return;
                }
            }
            render();
            const tr = rootEl()?.querySelector('#tc-transcript');
            if (tr) {
                tr.textContent = answersMatch(best, state.task)
                    ? t('Heard — matches! ', 'Uschwycono — pasuje! ') + best
                    : t('Heard: ', 'Uschwycono: ') + (best || '—') + (best ? t(' — try again or use I said it.', ' — spróbuj jeszcze lub użyj Powiedziałem/am.') : '');
            }
        };
        rec.onerror = () => {
            state.listening = false;
            render();
            const tr = rootEl()?.querySelector('#tc-transcript');
            if (tr) tr.textContent = t('Mic error — use Hear + I said it.', 'Błąd mikrofonu — użyj Posłuchaj + Powiedziałem/am.');
        };
        rec.onend = () => {
            state.listening = false;
        };
        try {
            rec.start();
        } catch {
            state.listening = false;
            render();
        }
    }

    async function askWhy() {
        const box = rootEl()?.querySelector('#tc-why-box');
        const btn = rootEl()?.querySelector('#tc-why');
        if (!box || !state.task) return;
        if (typeof global.fetchGenerativeAI !== 'function') {
            box.hidden = false;
            box.textContent = t('AI help needs Writing Suite access and the server.', 'Pomoc AI wymaga Writing Suite i serwera.');
            return;
        }
        if (btn) btn.disabled = true;
        box.hidden = false;
        box.textContent = t('Thinking…', 'Myślę…');
        const user = getUserAnswer() || state.lastTranscript || '';
        const prompt = `Primary English Topic Challenge — short "why" for ages 9–11 (CEFR A1–A2).
Topic: ${state.topic}. Grammar: ${state.grammar}. Mode: ${state.mode}.
Prompt: ${state.task.promptEn}
Correct answer: ${state.task.answer}
Learner attempt: ${user || '(empty)'}
Explain in simple English (max 3 short sentences) why the model is right and what to fix. Then one Polish sentence summary. No new examples beyond the model answer.`;
        const data = await global.fetchGenerativeAI(prompt);
        if (btn) btn.disabled = false;
        if (!data || data.__error) {
            box.textContent = (data && data.__error) || t('Could not get help.', 'Nie udało się uzyskać pomocy.');
            return;
        }
        const text = data.text || data.content || data.message || JSON.stringify(data);
        box.textContent = typeof text === 'string' ? text : String(text);
    }

    function newRound() {
        stopListening();
        state.task = pickTask();
        state.tileOrder = [];
        state.chosenMcq = null;
        state.checked = false;
        state.speakHeard = false;
        state.speakOk = false;
        state.lastTranscript = '';
        state.listening = false;
        state._useMcq = null;
        state._mcqOpts = null;
        state._gap = null;
        state._forceType = false;
        state.sceneSrc = null;
        state.sceneId = null;
        state.highlightBoxes = [];
        if (state.task) {
            const picked = pickSceneForTask(state.topic, state.task);
            state.sceneSrc = picked.src;
            state.sceneId = picked.id;
            state.highlightBoxes = picked.highlights || [];
        }
        if (state.task && state.mode === 'text' && Math.random() < 0.45) {
            state._gap = gapPrompt(state.task);
        }
        render();
    }

    function initTopicChallenge() {
        readSetupFromDom();
        state.usedIds = [];
        state.streak = 0;
        injectCss();
        newRound();
        if (typeof global.showScreen === 'function') {
            // caller shows screen
        }
    }

    global.initTopicChallenge = initTopicChallenge;
    global.PETopicChallenge = {
        init: initTopicChallenge,
        newRound,
        setLang(lang) { state.lang = lang === 'pl' ? 'pl' : 'en'; render(); },
        getState() { return Object.assign({}, state); }
    };
})(typeof window !== 'undefined' ? window : globalThis);

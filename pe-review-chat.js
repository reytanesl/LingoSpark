/**
 * Review Chatbot — Primary English (Writing Suite / premium).
 * Easy-first live conversation practising a grammar point + vocab (topic pack or custom list).
 * Text and/or speech mode; reuses Mission Chat AI loop + Topic Challenge mic/TTS patterns.
 */
(function (global) {
    'use strict';

    const CSS_ID = 'pe-review-chat-css';
    const POINTS_KEY = 'review';
    const MIN_CUSTOM = 4;
    const MAX_VOCAB = 14;

    const STOP = new Set([
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
        'a', 'an', 'the', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
        'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'got', 'do', 'does', 'did', 'can', 'can\'t', 'cannot',
        'like', 'likes', 'don\'t', 'doesn\'t', 'isn\'t', 'aren\'t', 'haven\'t', 'hasn\'t',
        'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'and', 'or', 'but',
        'this', 'that', 'these', 'those', 'not', 'yes', 'no', 'what', 'where', 'who',
        'when', 'why', 'how', 'there', 'here', 'very', 'too', 'also', 'just'
    ]);

    const EASE_STEPS = [
        {
            id: 'starter',
            label: 'Starter',
            hint: 'Ultra-short — one word answers, heavy modelling',
            guide: 'STARTER: Use the simplest English possible. Ask for ONE concrete word (a noun from the vocab) — e.g. "What is this?" / "Who is this?" / "pizza or pasta?". Model the exact word they can copy. Avoid yes/no-only questions. One tiny question only.'
        },
        {
            id: 'beginner',
            label: 'Beginner',
            hint: 'Copy-friendly phrases and one-word answers',
            guide: 'BEGINNER: Short modelled phrases. Prefer What/Who/Where/How many questions that need a word or short phrase. Finish-the-sentence is OK. Rare yes/no only as a warm-up — then ask for a real word. Celebrate every attempt.'
        },
        {
            id: 'very_easy',
            label: 'Very easy',
            hint: 'Short answers with a model phrase',
            guide: 'VERY EASY: Prefer one-word or short-phrase answers (not yes/no chains). Use What/Who/Where/colour/choice-of-two-words. Model a short phrase the student can copy. Celebrate every attempt.'
        },
        {
            id: 'easy',
            label: 'Easy',
            hint: 'Short answers using grammar + one vocab word',
            guide: 'EASY: Ask for short answers that use the target grammar and one vocab word (What/Who/Where/Why-simple). Offer a starter phrase if they struggle. Do not rely on yes/no.'
        },
        {
            id: 'normal',
            label: 'Normal',
            hint: 'Short PE sentences, still kind and scaffolded',
            guide: 'NORMAL: Ask for a full short sentence with grammar + vocab. Still kind and scaffolded — never jump to exam difficulty. Prefer open questions over yes/no.'
        }
    ];

    const CLASS_GUIDE = {
        1: { maxWords: 5, band: 'early starter', relevance: 'Klasa 1: tiny concrete words (family people, toys, colours, school bag). Chat about mummy/daddy, classroom objects, pets — very here-and-now.' },
        2: { maxWords: 6, band: 'early primary', relevance: 'Klasa 2: simple school and home words. Chat about friends, toys, food likes, classroom routines.' },
        3: { maxWords: 8, band: 'lower primary', relevance: 'Klasa 3: everyday school life, family, food, free time. Keep topics childlike and concrete.' },
        4: { maxWords: 10, band: 'mid primary', relevance: 'Klasa 4: school subjects, hobbies, home rooms, town places kids know. Conversation should feel like a real klasa 4 chat.' },
        5: { maxWords: 11, band: 'mid–upper primary', relevance: 'Klasa 5: slightly wider everyday vocab (routines, clothes, weather, animals). Still primary — no teen slang or abstract essays.' },
        6: { maxWords: 12, band: 'upper primary', relevance: 'Klasa 6: richer everyday topics (plans, free time, town, routines) but keep language PE-simple and age-fit.' },
        7: { maxWords: 13, band: 'early lower secondary', relevance: 'Klasa 7: school life, hobbies, home, opinions in very simple English. Stay practical and teenage-primary, not academic.' },
        8: { maxWords: 14, band: 'lower secondary', relevance: 'Klasa 8: everyday life, school, free time, future plans in short PE sentences. Still concrete — not Matura style.' }
    };

    const REVIEW_TOPIC_LABELS = {
        school: 'School',
        family: 'Family',
        home: 'Home',
        family_home: 'Family & home',
        food: 'Food',
        free_time: 'Free time',
        clothes_weather: 'Clothes & weather',
        town: 'Town',
        animals: 'Animals',
        routines: 'Routines',
        time: 'Time'
    };

    const FAMILY_FOCUS = new Set([
        'mum', 'mom', 'mother', 'dad', 'father', 'brother', 'sister', 'baby', 'grandma', 'grandmother',
        'grandpa', 'grandfather', 'family', 'parents', 'cousin', 'uncle', 'aunt', 'child', 'children',
        'son', 'daughter', 'friend', 'dog', 'cat', 'pet', 'happy', 'tall', 'small'
    ]);
    const HOME_FOCUS = new Set([
        'house', 'home', 'flat', 'apartment', 'room', 'kitchen', 'bedroom', 'bathroom', 'living', 'garden',
        'sofa', 'table', 'bed', 'door', 'window', 'chair', 'lamp', 'cup', 'cups', 'sink', 'stove', 'fridge',
        'television', 'tv', 'plant', 'plants', 'upstairs', 'downstairs', 'floor', 'wall', 'cook', 'clean',
        'wash', 'washes', 'eat', 'sleep', 'watch', 'watching'
    ]);
    const FAMILY_SEED = ['mum', 'dad', 'brother', 'sister', 'baby', 'grandma', 'family', 'dog', 'cat', 'happy'];
    const HOME_SEED = ['house', 'kitchen', 'bedroom', 'sofa', 'table', 'bed', 'door', 'garden', 'window', 'fridge'];

    const SCENE_SEEDS = [
        { setting: 'classroom before the lesson', vibe: 'curious classmate', topics: ['school'] },
        { setting: 'school break in the playground', vibe: 'playful friend', topics: ['school', 'free_time', 'animals'] },
        { setting: 'lunch in the school canteen', vibe: 'hungry buddy', topics: ['school', 'food'] },
        { setting: 'walking home from school', vibe: 'chatty neighbour', topics: ['school', 'town', 'routines'] },
        { setting: 'at a birthday party', vibe: 'excited party guest', topics: ['family', 'food', 'free_time'] },
        { setting: 'in a shop with a parent', vibe: 'helpful shop helper', topics: ['town', 'food', 'clothes_weather'] },
        { setting: 'at the park after school', vibe: 'sporty friend', topics: ['free_time', 'animals', 'town'] },
        { setting: 'doing homework together online', vibe: 'study buddy', topics: ['school', 'routines', 'time'] },
        { setting: 'waiting for the school bus', vibe: 'sleepy morning friend', topics: ['school', 'routines', 'time', 'town'] },
        { setting: 'in the school library', vibe: 'quiet book friend', topics: ['school'] },
        { setting: 'at a sports club', vibe: 'team-mate', topics: ['free_time', 'routines'] },
        { setting: 'visiting grandparents at the weekend', vibe: 'cousin visiting', topics: ['family'] },
        { setting: 'talking about brothers and sisters', vibe: 'family friend', topics: ['family'] },
        { setting: 'showing photos of family', vibe: 'proud classmate', topics: ['family'] },
        { setting: 'at home in the kitchen', vibe: 'home buddy', topics: ['home', 'food', 'routines'] },
        { setting: 'tidying a bedroom', vibe: 'helpful flatmate', topics: ['home', 'routines'] },
        { setting: 'on the sofa after school', vibe: 'relaxed friend', topics: ['home', 'free_time', 'routines'] },
        { setting: 'in the garden at home', vibe: 'outdoor neighbour', topics: ['home', 'animals'] }
    ];

    const OPENING_STYLES = [
        'Start with a short hello and one easy open question that needs a word (What/Who/Where), not yes/no.',
        'Start by sharing one tiny fact about yourself, then ask a matching open question that needs a word or short phrase.',
        'Start by pointing at something imaginary in the scene and asking what/who it is.',
        'Start with "Look!" / "Wow!" energy, then ask a very easy What/Who/Where question.',
        'Start by offering a simple choice with TWO WORDS (never letters), e.g. "pizza or pasta?", then wait for the student to say the word.'
    ];

    const VOICE_STORAGE_KEY = 'ls_review_voice';
    const CONFUSION_RE = /\b(i\s+don'?t\s+understand|dont\s+understand|don'?t\s+get\s+it|what\s+does\s+.*\s+mean|can\s+you\s+explain|explain\s+(please|in\s+polish)|po\s+polsku|nie\s+rozumiem|nie\s+rozumie|co\s+to\s+znaczy|wyja[sś]nij|pomocy|help\s+me|too\s+hard|za\s+trudn)/i;
    const PL_CHAR_RE = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
    const PL_WORD_RE = /\b(jestem|jest|mam|lubie|lubię|mogę|moge|nie|tak|to|moja|moj|mój|moje|chce|chcę|lubisz|kocham|szkoła|szkola|dom|mama|tata|brat|siostra|bo|ale|jak|gdzie|co|dlaczego|prosze|proszę|dziekuje|dziękuję|cześć|czesc)\b/i;

    let state = {
        age: 'young',
        schoolYear: 4,
        ease: 2,
        grammarId: 'be',
        vocabMode: 'topic',
        topicId: 'school',
        wordList: [],
        inputMode: 'text',
        messages: [],
        turns: 0,
        difficultyStep: 0,
        vocabTouched: [],
        grammarHits: 0,
        lastBotReply: '',
        loading: false,
        listening: false,
        recognition: null,
        ended: false,
        sessionRecorded: false,
        feedback: null,
        sceneSeed: null,
        openingStyle: '',
        sessionId: '',
        voiceURI: '',
        voiceMenuOpen: false,
        lastRepeatLine: '',
        micStream: null,
        micInterim: '',
        micFinal: '',
        sceneSrc: '',
        sceneId: '',
        sceneLabels: [],
        scenePayload: null
    };

    let cachedVoices = [];
    let micStopTimer = null;

    function grammars() {
        return global.PE_TOPIC_CHALLENGE_GRAMMARS || [];
    }

    function topics() {
        return global.PE_TOPIC_CHALLENGE_TOPICS || [];
    }

    function bank() {
        return global.PE_TOPIC_CHALLENGE_BANK || [];
    }

    function grammarLabel(id) {
        const row = grammars().find((g) => g.id === id);
        return row ? row.label : id;
    }

    function topicLabel(id) {
        if (REVIEW_TOPIC_LABELS[id]) return REVIEW_TOPIC_LABELS[id];
        const row = topics().find((t) => t.id === id);
        return row ? row.label : id;
    }

    function bankTopicId(topicId) {
        if (topicId === 'family' || topicId === 'home') return 'family_home';
        return topicId;
    }

    function scenesMap() {
        return global.PE_TOPIC_CHALLENGE_SCENES || {};
    }

    function scenesForTopic(topicId) {
        const map = scenesMap();
        if (topicId === 'family') {
            return (map.family_home || []).filter((src) => /family-/i.test(src));
        }
        if (topicId === 'home') {
            return (map.family_home || []).filter((src) => /home-/i.test(src));
        }
        return map[bankTopicId(topicId)] || map[topicId] || [];
    }

    function sceneIdFromSrc(src) {
        const base = String(src || '').split('/').pop() || '';
        return base.replace(/\.(png|jpe?g|webp)$/i, '');
    }

    function sceneTitleFromSrc(src) {
        const id = sceneIdFromSrc(src);
        return id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function hotspotLabels(sceneId) {
        const map = global.PE_TOPIC_CHALLENGE_HOTSPOTS || {};
        const list = map[sceneId] || [];
        const seen = new Set();
        const out = [];
        list.forEach((hs) => {
            const w = String(hs && hs.w ? hs.w : '').trim().toLowerCase();
            if (!w || seen.has(w)) return;
            seen.add(w);
            out.push(w);
        });
        return out;
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/'/g, '&#39;');
    }

    function classProfile(year) {
        const y = Math.max(1, Math.min(8, Number(year) || 4));
        return CLASS_GUIDE[y] || CLASS_GUIDE[4];
    }

    function easeInfo(idx) {
        const i = Math.max(0, Math.min(EASE_STEPS.length - 1, Number(idx) || 0));
        return EASE_STEPS[i];
    }

    function currentEaseIndex() {
        return Math.max(0, Math.min(EASE_STEPS.length - 1, (Number(state.ease) || 0) + (Number(state.difficultyStep) || 0)));
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function injectCss() {
        if (document.getElementById(CSS_ID)) return;
        const style = document.createElement('style');
        style.id = CSS_ID;
        style.textContent = `
            .review-wrap { max-width: 720px; margin: 0 auto; }
            .review-hud {
                display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem;
            }
            .review-hud-card {
                flex: 1; min-width: 140px; background: var(--light-grey, #f3f4f6);
                border-radius: 10px; padding: 0.75rem 1rem;
                border-left: 4px solid var(--royal-blue, #012169);
            }
            .review-hud-card strong {
                display: block; font-size: 0.72rem; text-transform: uppercase;
                letter-spacing: 0.4px; color: var(--royal-blue, #012169); margin-bottom: 0.25rem;
            }
            .review-hud-card span { font-size: 0.92rem; color: var(--text-dark, #1f2937); line-height: 1.35; }
            .review-scene-panel {
                margin: 0 0 1rem; border: 2px solid var(--border-light, #e5e7eb); border-radius: 12px;
                overflow: hidden; background: #fff;
            }
            .review-scene-panel img {
                display: block; width: 100%; max-height: 260px; object-fit: contain; background: #eef2f7;
            }
            .review-scene-caption {
                font-size: 0.82rem; color: var(--text-muted, #6b7280); padding: 0.55rem 0.75rem; line-height: 1.35;
                border-top: 1px solid var(--border-light, #e5e7eb);
            }
            .review-chat-log {
                background: #f7f8fb; border: 2px solid var(--border-light, #e5e7eb); border-radius: 12px;
                padding: 1.1rem; min-height: 260px; max-height: 420px; overflow-y: auto;
                margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.75rem;
            }
            .review-bubble { max-width: 88%; padding: 0.7rem 0.95rem; border-radius: 14px; line-height: 1.5; font-size: 0.98rem; }
            .review-bubble.bot { align-self: flex-start; background: #fff; border: 1px solid #dde3ea; border-bottom-left-radius: 4px; }
            .review-bubble.you { align-self: flex-end; background: rgba(1,33,105,0.08); border: 1px solid rgba(1,33,105,0.2); border-bottom-right-radius: 4px; }
            .review-bubble.system { align-self: center; font-style: italic; color: var(--text-muted, #6b7280); font-size: 0.88rem; text-align: center; max-width: 95%; }
            .review-bubble .bubble-label {
                display: block; font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
                letter-spacing: 0.4px; margin-bottom: 0.25rem; color: var(--royal-blue, #012169);
            }
            .review-bubble.you .bubble-label { color: var(--pillarbox-red, #c8102e); text-align: right; }
            .review-compose {
                background: #fff; border: 2px solid var(--border-light, #e5e7eb); border-radius: 12px;
                padding: 1rem; border-top: 4px solid var(--pillarbox-red, #c8102e);
                display: flex; flex-direction: column; gap: 0.75rem;
            }
            .review-compose textarea {
                width: 100%; box-sizing: border-box; padding: 0.85rem 1rem; border: 2px solid var(--royal-blue, #012169);
                border-radius: 8px; font-size: 1rem; font-family: inherit; resize: vertical; min-height: 64px;
            }
            .review-compose-actions { display: flex; flex-wrap: wrap; gap: 0.55rem; justify-content: center; align-items: center; }
            .review-voice-wrap { position: relative; display: inline-flex; flex-direction: column; align-items: stretch; }
            .review-voice-menu {
                display: none; position: absolute; left: 50%; bottom: calc(100% + 0.4rem); transform: translateX(-50%);
                z-index: 20; min-width: min(92vw, 300px); background: #fff; border: 2px solid var(--royal-blue, #012169);
                border-radius: 10px; padding: 0.65rem 0.75rem; box-shadow: 0 8px 24px rgba(1,33,105,0.15);
            }
            .review-voice-menu.open { display: block; }
            .review-voice-menu label {
                display: block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
                color: var(--royal-blue, #012169); margin-bottom: 0.35rem;
            }
            .review-voice-menu select {
                width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--border-light, #e5e7eb);
                border-radius: 0.4rem; font-size: 0.85rem; background: #fff;
            }
            .review-nudge { font-size: 0.88rem; color: var(--text-muted, #6b7280); min-height: 1.2em; text-align: center; }
            .review-help-btn {
                border-color: #b45309 !important; color: #9a3412 !important; background: #fff7ed !important;
            }
            .review-help-btn:hover:not(:disabled) { background: #ffedd5 !important; }
            .review-feedback {
                display: none; margin: 0 0 1rem; background: #fff; border: 2px solid var(--royal-blue, #012169);
                border-radius: 12px; padding: 1.1rem 1.25rem;
            }
            .review-feedback.visible { display: block; }
            .review-feedback h3 { margin: 0 0 0.5rem; color: var(--royal-blue, #012169); font-size: 1.1rem; }
            .review-feedback-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; margin-top: 0.65rem; }
            @media (max-width: 700px) { .review-feedback-cols { grid-template-columns: 1fr; } }
            .review-feedback ul { margin: 0; padding-left: 1.1rem; }
            .review-feedback li { margin-bottom: 0.35rem; line-height: 1.4; }
            .review-listening { outline: 2px solid var(--pillarbox-red, #c8102e); }
        `;
        document.head.appendChild(style);
    }

    function rootEl() {
        return document.getElementById('review-chat-root');
    }

    function statusEl() {
        return document.getElementById('review-status');
    }

    function setStatus(msg, kind) {
        const el = statusEl();
        if (!el) return;
        el.className = 'feedback' + (kind ? ' ' + kind : '');
        el.textContent = msg || '';
    }

    function parseCustomList(raw) {
        if (typeof global.parsePeCustomGlossary === 'function') {
            return global.parsePeCustomGlossary(raw);
        }
        const items = [];
        String(raw || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((line) => {
            const eq = line.split(/\s*=\s*/);
            if (eq.length >= 2 && eq[0].trim()) items.push(eq[0].trim());
            else line.split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => items.push(x));
        });
        const unique = [];
        const seen = new Set();
        items.forEach((item) => {
            const key = item.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(item);
            }
        });
        return unique;
    }

    function collectTopicCounts(topicId, grammarId, focusSet) {
        const bankId = bankTopicId(topicId);
        const rows = bank().filter((r) => r.topic === bankId && (!grammarId || r.grammar === grammarId));
        const pool = rows.length ? rows : bank().filter((r) => r.topic === bankId);
        const counts = new Map();
        pool.forEach((row) => {
            (row.tiles || []).forEach((tile) => {
                const w = String(tile || '').trim().toLowerCase().replace(/[.?!,]/g, '');
                if (!w || STOP.has(w) || w.length < 2) return;
                if (focusSet && !focusSet.has(w)) return;
                counts.set(w, (counts.get(w) || 0) + 1);
            });
            String(row.answer || '').toLowerCase().split(/[^a-z']+/).forEach((w) => {
                if (!w || STOP.has(w) || w.length < 3) return;
                if (focusSet && !focusSet.has(w)) return;
                counts.set(w, (counts.get(w) || 0) + 1);
            });
        });
        return counts;
    }

    function vocabFromTopic(topicId, grammarId, maxWords) {
        const limit = Math.max(4, Math.min(MAX_VOCAB, maxWords || MAX_VOCAB));
        let focusSet = null;
        let seed = [];
        if (topicId === 'family') {
            focusSet = FAMILY_FOCUS;
            seed = FAMILY_SEED;
        } else if (topicId === 'home') {
            focusSet = HOME_FOCUS;
            seed = HOME_SEED;
        }

        let counts = collectTopicCounts(topicId, grammarId, focusSet);
        let words = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);

        if (focusSet && words.length < 4) {
            // Softer pass: any family_home content, then keep focus + seed
            counts = collectTopicCounts(topicId, grammarId, null);
            const soft = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w)
                .filter((w) => focusSet.has(w));
            words = [...new Set(soft.concat(seed))];
        }

        if (!words.length && seed.length) words = seed.slice();
        if (words.length < 4 && seed.length) {
            words = [...new Set(words.concat(seed))];
        }

        return words.slice(0, limit);
    }

    function readSetupFromDom() {
        const ageEl = document.querySelector('input[name="review-setup-age"]:checked');
        const yearEl = document.getElementById('review-setup-year');
        const easeEl = document.getElementById('review-setup-ease');
        const gramEl = document.getElementById('review-setup-grammar');
        const vocabModeEl = document.querySelector('input[name="review-setup-vocab-mode"]:checked');
        const topicEl = document.getElementById('review-setup-topic');
        const customEl = document.getElementById('review-setup-custom');
        const modeEl = document.querySelector('input[name="review-setup-mode"]:checked');

        state.age = ageEl ? ageEl.value : 'young';
        state.schoolYear = yearEl ? Math.max(1, Math.min(8, parseInt(yearEl.value, 10) || 4)) : 4;
        state.ease = easeEl ? Math.max(0, Math.min(4, parseInt(easeEl.value, 10) || 2)) : 2;
        state.grammarId = gramEl ? gramEl.value : 'be';
        state.vocabMode = vocabModeEl ? vocabModeEl.value : 'topic';
        state.topicId = topicEl ? topicEl.value : 'school';
        if (state.topicId === 'family_home') state.topicId = 'family';
        state.inputMode = modeEl ? modeEl.value : 'text';

        const sceneEl = document.getElementById('review-setup-scene');
        const sceneSrc = state.vocabMode === 'topic' && sceneEl ? String(sceneEl.value || '').trim() : '';
        const available = scenesForTopic(state.topicId);
        if (sceneSrc && available.includes(sceneSrc)) {
            state.sceneSrc = sceneSrc;
            state.sceneId = sceneIdFromSrc(sceneSrc);
            state.sceneLabels = hotspotLabels(state.sceneId);
        } else {
            state.sceneSrc = '';
            state.sceneId = '';
            state.sceneLabels = [];
            if (sceneEl) sceneEl.value = '';
        }
        state.scenePayload = null;

        const profile = classProfile(state.schoolYear);
        const maxWords = profile.maxWords;

        if (state.vocabMode === 'custom') {
            state.wordList = shuffle(parseCustomList(customEl ? customEl.value : '')).slice(0, maxWords);
        } else {
            // Prefer picture hotspot labels when a scene is chosen; fill from topic bank.
            let words = [];
            if (state.sceneLabels.length) {
                words = state.sceneLabels.filter((w) => w && !STOP.has(w) && w.length > 1);
            }
            const fromTopic = vocabFromTopic(state.topicId, state.grammarId, maxWords);
            words = [...new Set(words.concat(fromTopic))];
            state.wordList = shuffle(words).slice(0, maxWords);
        }
    }

    function shuffle(arr) {
        const copy = [...(arr || [])];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function pickSceneSeed() {
        if (state.sceneSrc) {
            return {
                setting: `looking at the picture (${state.sceneId || 'scene'}) together`,
                vibe: 'curious picture partner',
                topics: [state.topicId]
            };
        }
        const topic = state.topicId;
        const matched = SCENE_SEEDS.filter((s) => !s.topics || s.topics.includes(topic));
        const pool = matched.length ? matched : SCENE_SEEDS;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function pickOpeningStyle() {
        return OPENING_STYLES[Math.floor(Math.random() * OPENING_STYLES.length)];
    }

    function looksConfused(text) {
        return CONFUSION_RE.test(String(text || ''));
    }

    /** Lone A/B/C/D (or "option A") — not a real spoken/typed word answer. */
    function isLetterOnlyAnswer(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (/^[a-d]([.)]?\s*)?$/i.test(t)) return true;
        if (/^(option|choice|odpowied[zź]|litera)\s*[a-d]\s*[.)]?$/i.test(t)) return true;
        return false;
    }

    function looksMixedPolishEnglish(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        const hasPl = PL_CHAR_RE.test(t) || PL_WORD_RE.test(t);
        if (!hasPl) return false;
        // Mixed: Polish cues plus some English letter words, OR mostly Polish answering in the chat
        const hasAsciiWord = /\b[a-z]{2,}\b/i.test(t.replace(PL_WORD_RE, ' '));
        return hasPl || hasAsciiWord;
    }

    function hasPolishContent(text) {
        const t = String(text || '');
        return PL_CHAR_RE.test(t) || PL_WORD_RE.test(t);
    }

    function loadSavedVoiceURI() {
        try {
            return localStorage.getItem(VOICE_STORAGE_KEY) || '';
        } catch {
            return '';
        }
    }

    function saveVoiceURI(uri) {
        state.voiceURI = uri || '';
        try {
            if (uri) localStorage.setItem(VOICE_STORAGE_KEY, uri);
            else localStorage.removeItem(VOICE_STORAGE_KEY);
        } catch { /* */ }
    }

    function voiceNaturalScore(v) {
        const name = String(v.name || '');
        const uri = String(v.voiceURI || '');
        const blob = (name + ' ' + uri).toLowerCase();
        let score = 0;
        if (/neural|natural|online|premium|enhanced|wavenet|studio|generative|super/.test(blob)) score += 40;
        if (/google|microsoft|apple|samantha|daniel|karen|moira|serena|martha|aria|jenny|guy|sonia|ryan/.test(blob)) score += 12;
        if (/en[-_]GB/i.test(v.lang)) score += 10;
        else if (/en[-_]US/i.test(v.lang)) score += 8;
        else if (/^en/i.test(v.lang)) score += 4;
        if (v.localService === false) score += 6; // cloud/online voices often sound more natural
        if (/compact|eloquence|espeak|robot|novelty/.test(blob)) score -= 25;
        return score;
    }

    function listEnglishVoices() {
        if (!global.speechSynthesis) return [];
        const all = global.speechSynthesis.getVoices() || [];
        return all
            .filter((v) => /^en([-_]|$)/i.test(v.lang || ''))
            .slice()
            .sort((a, b) => voiceNaturalScore(b) - voiceNaturalScore(a) || String(a.name).localeCompare(String(b.name)));
    }

    function refreshVoices() {
        cachedVoices = listEnglishVoices();
        if (!state.voiceURI) state.voiceURI = loadSavedVoiceURI();
        if (state.voiceURI && !cachedVoices.some((v) => v.voiceURI === state.voiceURI)) {
            // Saved voice missing on this device — fall back to best natural
            state.voiceURI = '';
        }
        if (!state.voiceURI && cachedVoices.length) {
            state.voiceURI = cachedVoices[0].voiceURI;
        }
        return cachedVoices;
    }

    function selectedVoice() {
        refreshVoices();
        if (!cachedVoices.length) return null;
        return cachedVoices.find((v) => v.voiceURI === state.voiceURI) || cachedVoices[0];
    }

    function voiceOptionsHtml() {
        const voices = refreshVoices();
        if (!voices.length) {
            return '<option value="">No English voices on this device</option>';
        }
        return voices.map((v) => {
            const natural = voiceNaturalScore(v) >= 40 ? ' · natural' : '';
            const label = `${v.name} (${v.lang})${natural}`;
            const sel = v.voiceURI === state.voiceURI ? ' selected' : '';
            return `<option value="${escapeHtml(v.voiceURI)}"${sel}>${escapeHtml(label)}</option>`;
        }).join('');
    }

    function validateSetup() {
        readSetupFromDom();
        if (state.vocabMode === 'custom' && state.wordList.length < MIN_CUSTOM) {
            return `Please enter at least ${MIN_CUSTOM} vocabulary words (one per line, or Term = Meaning).`;
        }
        if (state.vocabMode === 'topic' && !state.topicId) {
            return 'Please choose a topic.';
        }
        if (state.vocabMode === 'topic' && state.wordList.length < 3) {
            // Soft fallback — still allow with a tiny baked list
            state.wordList = ['friend', 'school', 'book', 'play', 'happy'].slice(0, MAX_VOCAB);
        }
        return null;
    }

    function difficultyLabel() {
        return easeInfo(currentEaseIndex()).label;
    }

    function buildSystemRules() {
        const ageBand = state.age === 'young' ? '8–9 years old' : '10–12 years old';
        const gLabel = grammarLabel(state.grammarId);
        const vocab = state.wordList.join(', ');
        const topicBit = state.vocabMode === 'topic'
            ? `Topic pack: ${topicLabel(state.topicId)}.`
            : 'Custom vocabulary list from the teacher/student.';
        const profile = classProfile(state.schoolYear);
        const ease = easeInfo(currentEaseIndex());
        const seed = state.sceneSeed || SCENE_SEEDS[0];
        const opening = state.openingStyle || OPENING_STYLES[0];
        const topicFocus = state.topicId === 'family'
            ? 'Stay on FAMILY people and relationships (mum, dad, brother, sister…) — not rooms or furniture.'
            : state.topicId === 'home'
                ? 'Stay on HOME places and objects (kitchen, bedroom, sofa, garden…) — not family members as the main focus.'
                : `Stay on the ${topicLabel(state.topicId)} topic.`;
        const pictureBit = state.sceneSrc
            ? `PICTURE MODE (critical): A Topic Challenge scene is attached (${state.sceneId || 'scene'}). Base the conversation on what is visible in the picture. Useful labels in the scene: ${(state.sceneLabels || []).slice(0, 18).join(', ') || 'people and objects in the scene'}. Ask about people/things in the picture using the target grammar. Do not invent objects that are clearly not there.`
            : 'No picture attached — use everyday scenes from the topic.';

        return `You are a friendly Primary English conversation partner for Polish school children.
Learner: age band ${ageBand}, school year (klasa) ${state.schoolYear} (${profile.band}), ease setting: ${ease.label}.
Class relevance (critical): ${profile.relevance}
Vocab range for this class: about ${profile.maxWords} concrete words max — keep the conversation inside that range so it feels relevant for klasa ${state.schoolYear}.
Ease guide: ${ease.guide}
Target grammar: ${gLabel} (id: ${state.grammarId}).
${topicBit}
${topicFocus}
${pictureBit}
Target vocabulary to weave in naturally (order is randomised this session): ${vocab}.
Input mode: ${state.inputMode} (keep replies short enough to speak aloud).
Session id: ${state.sessionId || 'new'} — make THIS chat feel unique; do not reuse the same greeting or questions as a generic template.
Scene for this chat: ${seed.setting}. Your vibe: ${seed.vibe}.
Opening style for this chat: ${opening}

YOUR JOB:
- Run a warm, motivating spoken conversation that practises the grammar and vocab.
- Match klasa ${state.schoolYear}: topics, examples, and vocab must feel relevant for that school year (not too babyish for older classes, not too advanced for younger ones).
- Randomise the content: vary people, places, objects, and questions each session. Prefer different vocab words from the list over time.
- Hold the chosen ease level (${ease.label}); only gently enrich if the student is clearly succeeding.
- Default language: simple English. Do not lecture. Do not dump grammar rules.
- After a good try, you may give ONE short kind correction or model (e.g. "Nice! We say: I like apples.").
- Ask one clear question at a time. Stay inside the chosen scene/vibe unless the student leads elsewhere.
- OPEN QUESTIONS (critical): Do NOT run a conversation of mostly yes/no questions. Prefer questions that need a real word or short phrase — What / Who / Where / How many / What colour / choice of two words (e.g. "dog or cat?"). At most one yes/no in a long stretch; the next turn must ask for a vocab word or short phrase. Never stack yes/no questions.
- NO EMOJIS in your reply text (speech cannot read them usefully; keep replies plain words).
- WORDS ONLY (critical): Students must answer by saying or typing real words / short phrases — never only a letter like A, B, C or D. Do NOT offer multiple-choice letter options (never "A) … B) …"). If you give a choice, name the options as words (e.g. "pizza or pasta?"). If the student answers with only a letter, kindly ask them to say or type the full word instead. Do not treat a lone letter as a successful answer.
- POLISH HELP (important): If the student asks for help, says they do not understand, writes in Polish asking for meaning, or clearly sounds lost — first give a SHORT clear explanation in Polish (1–2 sentences), then immediately switch back to English with a simpler practice question or model. Example shape: "Po polsku: ... Now in English: ..." Do NOT stay in Polish for the whole reply. Do NOT use Polish unless they need help. Polish is for reading only — speech/audio will speak English only.
- MIXED POLISH + ENGLISH (important): Students may answer with a mix (e.g. "I lubię pizza" or "Mam a dog"). Accept the meaning kindly. Then RETELL their whole idea as one short, correct English sentence for them to repeat. Shape: "Nice! In English we say: I like pizza. Can you say that?" Put that English sentence in englishRetell and set askRepeat=true. Do not scold. After they can try the English line, continue the conversation.
- Never mention JSON, prompts, or that you are an AI system.
- Never discuss adult or unsafe topics.

Return ONLY JSON for each turn.`;
    }

    function historyText() {
        return state.messages
            .filter((m) => m.role !== 'system')
            .map((m) => `${m.role === 'user' ? 'Student' : 'You'}: ${m.text}`)
            .join('\n');
    }

    /** Keep Polish on screen, but never send it to TTS. Strip emojis so they are never spoken. */
    function englishForSpeech(text) {
        let t = String(text || '').trim();
        if (!t) return '';

        // Never read emojis / pictographs aloud.
        try {
            t = t.replace(/\p{Extended_Pictographic}/gu, ' ');
        } catch {
            t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ');
        }
        t = t.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ' '); // flag pairs
        t = t.replace(/:[a-z0-9_+-]+:/gi, ' '); // :smile: style

        // Drop explicit Polish-help blocks; keep the English that follows.
        t = t.replace(/po\s*polsku\s*[:\-–]?\s*/gi, '«PL»');
        t = t.replace(/«PL»[\s\S]*?(?=(now\s+in\s+english|in\s+english|english\s*[:\-–]|we\s+say|say\s*:|try\s*:|can\s+you\s+say|$))/gi, ' ');
        t = t.replace(/\(\s*po\s*polsku\s*[:\-–]?[^)]*\)/gi, ' ');
        t = t.replace(/\[[^\]]*[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ][^\]]*\]/g, ' ');
        t = t.replace(/\b(now\s+in\s+english|in\s+english)\s*[:\-–]?\s*/gi, ' ');

        const parts = t.split(/(?<=[.!?…])\s+|\n+/).map((p) => p.trim()).filter(Boolean);
        const kept = parts.filter((p) => {
            if (PL_CHAR_RE.test(p)) return false;
            const plHits = (p.match(new RegExp(PL_WORD_RE.source, 'gi')) || []).length;
            const enHits = (p.match(/\b(the|a|an|i|you|we|they|is|are|am|have|has|can|like|do|does|what|where|who|my|your|this|that|yes|no|nice|say|try|hello|hi|ok|okay)\b/gi) || []).length;
            if (plHits >= 1 && enHits === 0) return false;
            return true;
        });

        let out = (kept.length ? kept.join(' ') : t)
            .replace(/«PL»/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Safety: drop any remaining tokens with Polish letters.
        if (PL_CHAR_RE.test(out)) {
            out = out
                .split(/\s+/)
                .filter((w) => !PL_CHAR_RE.test(w))
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        return out;
    }

    function speakText(text) {
        const spoken = englishForSpeech(text);
        if (!spoken || !global.speechSynthesis) return;
        global.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(spoken);
        const voice = selectedVoice();
        if (voice) {
            u.voice = voice;
            u.lang = voice.lang || 'en-GB';
        } else {
            u.lang = 'en-GB';
        }
        u.rate = 0.92;
        global.speechSynthesis.speak(u);
    }

    function getSpeechRecognition() {
        const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
        if (!SR) return null;
        try {
            const rec = new SR();
            // Match Topic Challenge: en-GB catches PE English far better than pl-PL.
            // Mixed Polish+English can still be typed; mic prioritises clear English.
            rec.lang = 'en-GB';
            rec.interimResults = true;
            rec.continuous = false;
            rec.maxAlternatives = 5;
            return rec;
        } catch {
            return null;
        }
    }

    function releaseMicStream() {
        if (state.micStream) {
            try {
                state.micStream.getTracks().forEach((t) => t.stop());
            } catch { /* */ }
            state.micStream = null;
        }
    }

    async function ensureMicAccess() {
        if (!global.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return true; // SpeechRecognition may still work without an explicit stream
        }
        try {
            releaseMicStream();
            state.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            return true;
        } catch (err) {
            const name = err && err.name;
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                setStatus('Please allow microphone access in the browser, then try Say it again.', 'error');
            } else if (name === 'NotFoundError') {
                setStatus('No microphone found. Check your device settings.', 'error');
            } else {
                setStatus('Could not open the microphone. Try Chrome/Edge, or type your answer.', 'error');
            }
            return false;
        }
    }

    function silenceBotSpeech() {
        if (global.speechSynthesis) {
            try { global.speechSynthesis.cancel(); } catch { /* */ }
        }
    }

    function setMicHint(text) {
        const nudge = rootEl()?.querySelector('#review-nudge');
        if (nudge) nudge.textContent = text || '';
    }

    function pickBestTranscript(result) {
        if (!result || !result.length) return '';
        let best = '';
        let bestScore = -1;
        for (let i = 0; i < result.length; i++) {
            const alt = result[i];
            const text = String((alt && alt.transcript) || '').trim();
            if (!text) continue;
            const conf = typeof alt.confidence === 'number' ? alt.confidence : 0.5;
            // Prefer clearer, slightly longer PE answers; do not prefer Polish mangling.
            const score = conf * 10 + Math.min(text.length, 40) / 40;
            if (score > bestScore) {
                bestScore = score;
                best = text;
            }
        }
        return best || String((result[0] && result[0].transcript) || '').trim();
    }

    function stopListening() {
        if (micStopTimer) {
            clearTimeout(micStopTimer);
            micStopTimer = null;
        }
        if (state.recognition && state.listening) {
            try { state.recognition.stop(); } catch { /* */ }
        }
        state.listening = false;
        releaseMicStream();
    }

    function maybeSpeak(reply) {
        if (state.inputMode === 'speech' || state.inputMode === 'both') {
            speakText(reply);
        }
    }

    function bumpDifficulty(data) {
        const usedG = !!data.usedGrammar;
        const usedV = Array.isArray(data.usedVocab) && data.usedVocab.length > 0;
        if (usedG) state.grammarHits += 1;
        if (usedV) {
            data.usedVocab.forEach((w) => {
                const key = String(w || '').toLowerCase();
                if (key && !state.vocabTouched.includes(key)) state.vocabTouched.push(key);
            });
        }
        if (usedG && (usedV || state.wordList.length === 0) && data.stepSuccess) {
            const room = (EASE_STEPS.length - 1) - (Number(state.ease) || 0);
            if (state.difficultyStep < Math.min(1, room)) {
                state.difficultyStep += 1;
            }
        }
    }

    function awardTurnPoints(data) {
        let pts = 8;
        if (data.usedGrammar) pts += 4;
        if (Array.isArray(data.usedVocab) && data.usedVocab.length) pts += 3;
        if (typeof global.peAddPoints === 'function') global.peAddPoints(POINTS_KEY, pts);
        return pts;
    }

    function renderHudHtml() {
        const vocabLabel = state.vocabMode === 'topic'
            ? topicLabel(state.topicId)
            : `Custom (${state.wordList.length})`;
        const profile = classProfile(state.schoolYear);
        const pic = state.sceneSrc ? ' · picture' : '';
        return `<div class="review-hud">
            <div class="review-hud-card"><strong>Focus</strong><span>${escapeHtml(grammarLabel(state.grammarId))} · ${escapeHtml(vocabLabel)}${pic}</span></div>
            <div class="review-hud-card"><strong>Learner</strong><span>Klasa ${state.schoolYear} · ${escapeHtml(difficultyLabel())} · ${state.age === 'young' ? '8–9' : '10–12'}</span></div>
            <div class="review-hud-card"><strong>Progress</strong><span>${state.turns} turns · ${state.vocabTouched.length}/${state.wordList.length} vocab · ${escapeHtml(profile.band)}</span></div>
        </div>`;
    }

    function renderSceneHtml() {
        if (!state.sceneSrc) return '';
        const labels = (state.sceneLabels || []).slice(0, 12).join(', ');
        return `<div class="review-scene-panel">
            <img src="${escapeAttr(state.sceneSrc)}" alt="${escapeAttr(sceneTitleFromSrc(state.sceneSrc))}" loading="lazy">
            <div class="review-scene-caption">Talk about the picture${labels ? ': ' + escapeHtml(labels) : ''}.</div>
        </div>`;
    }

    function renderChatHtml() {
        const bubbles = state.messages.map((msg) => {
            if (msg.role === 'system') {
                return `<div class="review-bubble system">${escapeHtml(msg.text)}</div>`;
            }
            if (msg.role === 'user') {
                return `<div class="review-bubble you"><span class="bubble-label">You</span>${escapeHtml(msg.text)}</div>`;
            }
            return `<div class="review-bubble bot"><span class="bubble-label">Partner</span>${escapeHtml(msg.text)}</div>`;
        }).join('');
        return `<div class="review-chat-log" id="review-chat-log">${bubbles || '<div class="review-bubble system">Starting…</div>'}</div>`;
    }

    function renderFeedbackHtml() {
        const fb = state.feedback;
        if (!fb) return '<div class="review-feedback" id="review-feedback"></div>';
        return `<div class="review-feedback visible" id="review-feedback">
            <h3><i class="fa-solid fa-clipboard-check"></i> Coach note</h3>
            <p>${escapeHtml(fb.summary || '')}</p>
            <div class="review-feedback-cols">
                <div><strong style="color:var(--success-green,#16a34a);">Strengths</strong>
                    <ul>${(fb.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('') || '<li>Nice try!</li>'}</ul>
                </div>
                <div><strong style="color:var(--pillarbox-red,#c8102e);">Next time</strong>
                    <ul>${(fb.improvements || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('') || '<li>Keep chatting!</li>'}</ul>
                </div>
            </div>
        </div>`;
    }

    function showWrite() {
        return state.inputMode === 'text' || state.inputMode === 'both';
    }

    function showSpeak() {
        return state.inputMode === 'speech' || state.inputMode === 'both';
    }

    function renderComposeHtml() {
        if (state.ended) {
            return `<div class="review-compose">
                <p style="margin:0; text-align:center;">Session ended. Start a new chat to practise again.</p>
                <div class="review-compose-actions">
                    <button type="button" class="btn btn-blue" id="review-restart-btn"><i class="fa-solid fa-rotate"></i> New chat</button>
                </div>
            </div>`;
        }
        const writeBlock = showWrite()
            ? `<textarea id="review-input" placeholder="English — or mix in Polish if you need to…" rows="2" ${state.loading ? 'disabled' : ''}></textarea>`
            : `<p style="margin:0; color:var(--text-muted,#6b7280); text-align:center; font-size:0.9rem;">Speech mode — wait for the partner to finish, then tap Say it. Use Voice for a natural voice. You can still type Polish + English if needed.</p>`;
        const voiceBtn = showSpeak()
            ? `<div class="review-voice-wrap">
                <button type="button" class="btn btn-outline" id="review-voice-btn" ${state.loading ? 'disabled' : ''} aria-expanded="${state.voiceMenuOpen ? 'true' : 'false'}" title="Choose voice">
                    <i class="fa-solid fa-volume-high"></i> Voice
                </button>
                <div class="review-voice-menu${state.voiceMenuOpen ? ' open' : ''}" id="review-voice-menu" role="dialog" aria-label="Voice">
                    <label for="review-voice-select">Choose a natural voice</label>
                    <select id="review-voice-select">${voiceOptionsHtml()}</select>
                </div>
            </div>`
            : '';
        return `<div class="review-compose ${state.listening ? 'review-listening' : ''}">
            ${writeBlock}
            <div class="review-nudge" id="review-nudge"></div>
            <div class="review-compose-actions">
                ${showWrite() ? `<button type="button" class="btn btn-blue" id="review-send-btn" ${state.loading ? 'disabled' : ''}><i class="fa-solid fa-paper-plane"></i> Send</button>` : ''}
                ${showSpeak() ? `<button type="button" class="btn btn-outline" id="review-mic-btn" ${state.loading ? 'disabled' : ''}><i class="fa-solid fa-microphone"></i> ${state.listening ? 'Listening…' : 'Say it'}</button>` : ''}
                ${showSpeak() ? `<button type="button" class="btn btn-outline" id="review-hear-btn" ${state.loading || !state.lastBotReply ? 'disabled' : ''}><i class="fa-solid fa-headphones"></i> Hear</button>` : ''}
                ${voiceBtn}
                <button type="button" class="btn btn-outline review-help-btn" id="review-help-btn" ${state.loading || !state.lastBotReply ? 'disabled' : ''} title="Poproś o krótkie wyjaśnienie po polsku"><i class="fa-solid fa-circle-question"></i> Nie rozumiem</button>
                <button type="button" class="btn btn-outline" id="review-end-btn" ${state.loading || state.turns < 1 ? 'disabled' : ''}><i class="fa-solid fa-flag-checkered"></i> End session</button>
            </div>
        </div>`;
    }

    function bindUi() {
        const root = rootEl();
        if (!root) return;

        const input = root.querySelector('#review-input');
        if (input) {
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                    ev.preventDefault();
                    submitMessage();
                }
            });
        }
        root.querySelector('#review-send-btn')?.addEventListener('click', () => submitMessage());
        root.querySelector('#review-mic-btn')?.addEventListener('click', () => startMic());
        root.querySelector('#review-hear-btn')?.addEventListener('click', () => {
            const line = state.lastRepeatLine || state.lastBotReply;
            if (line) speakText(line);
        });
        root.querySelector('#review-help-btn')?.addEventListener('click', () => askForHelp());
        root.querySelector('#review-end-btn')?.addEventListener('click', () => endSession());
        root.querySelector('#review-restart-btn')?.addEventListener('click', () => initPeReview());

        const voiceBtn = root.querySelector('#review-voice-btn');
        const voiceMenu = root.querySelector('#review-voice-menu');
        const voiceSel = root.querySelector('#review-voice-select');
        if (voiceBtn && voiceMenu) {
            voiceBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                state.voiceMenuOpen = !state.voiceMenuOpen;
                voiceMenu.classList.toggle('open', state.voiceMenuOpen);
                voiceBtn.setAttribute('aria-expanded', state.voiceMenuOpen ? 'true' : 'false');
            });
        }
        if (voiceSel) {
            voiceSel.addEventListener('change', () => {
                saveVoiceURI(voiceSel.value);
                state.voiceMenuOpen = false;
                if (voiceMenu) voiceMenu.classList.remove('open');
                if (voiceBtn) voiceBtn.setAttribute('aria-expanded', 'false');
                const line = state.lastRepeatLine || state.lastBotReply;
                if (line) speakText(line);
            });
            voiceSel.addEventListener('click', (ev) => ev.stopPropagation());
        }
        if (state.voiceMenuOpen) {
            const closer = (ev) => {
                if (ev.target.closest && ev.target.closest('.review-voice-wrap')) return;
                state.voiceMenuOpen = false;
                document.removeEventListener('click', closer);
                const menu = rootEl()?.querySelector('#review-voice-menu');
                const btn = rootEl()?.querySelector('#review-voice-btn');
                if (menu) menu.classList.remove('open');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            };
            setTimeout(() => document.addEventListener('click', closer), 0);
        }
    }

    function render() {
        const root = rootEl();
        if (!root) return;
        injectCss();
        root.innerHTML = `<div class="review-wrap">
            ${renderHudHtml()}
            ${renderSceneHtml()}
            ${renderFeedbackHtml()}
            ${renderChatHtml()}
            ${renderComposeHtml()}
        </div>`;
        const log = root.querySelector('#review-chat-log');
        if (log) log.scrollTop = log.scrollHeight;
        bindUi();
    }

    async function sceneImagePayload() {
        if (!state.sceneSrc) return null;
        if (state.scenePayload && state.scenePayload.dataUrl) return state.scenePayload;
        const maxSide = 720;
        const quality = 0.7;
        const draw = (el) => {
            const nw = el.naturalWidth || el.width;
            const nh = el.naturalHeight || el.height;
            if (!nw || !nh) return null;
            const scale = Math.min(1, maxSide / Math.max(nw, nh));
            const w = Math.max(1, Math.round(nw * scale));
            const h = Math.max(1, Math.round(nh * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(el, 0, 0, w, h);
            return { dataUrl: canvas.toDataURL('image/jpeg', quality), mimeType: 'image/jpeg', width: w, height: h };
        };
        try {
            const el = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = () => reject(new Error('scene load'));
                i.src = state.sceneSrc;
            });
            const payload = draw(el);
            if (payload) state.scenePayload = payload;
            return payload;
        } catch {
            return null;
        }
    }

    async function fetchAi(prompt) {
        if (typeof global.fetchGenerativeAI !== 'function') {
            return { __error: 'AI unavailable' };
        }
        const images = [];
        if (state.sceneSrc) {
            const scene = await sceneImagePayload();
            if (scene) images.push(scene);
        }
        return global.fetchGenerativeAI(prompt, images);
    }

    function aiErr(data) {
        if (typeof global.aiErrorMessage === 'function') return global.aiErrorMessage(data);
        return (data && data.__error) || 'Something went wrong. Try again.';
    }

    async function openConversation() {
        state.loading = true;
        render();
        setStatus('');

        const seed = state.sceneSeed || SCENE_SEEDS[0];
        const focusWord = state.wordList[0] || 'friend';
        const pictureOpen = state.sceneSrc
            ? `A picture is attached. Open by pointing at something visible in the picture and asking a very easy question about it (grammar + one vocab word from the labels if possible).`
            : `Write the FIRST line as the friendly partner in this scene (${seed.setting}, vibe: ${seed.vibe}).`;
        const prompt = `${buildSystemRules()}

The conversation is just beginning. ${pictureOpen}
Follow the opening style. Invite the target grammar and weave in one vocab word (try "${focusWord}" or another from the list).
Do not explain the task. Do not start with the same generic "Hi! How are you?" every time — make this opening feel fresh for session ${state.sessionId}.
Never offer letter choices (A/B/C). If you offer a choice, use real words the student must say or type.
Do NOT open with a yes/no question — ask What/Who/Where or a two-word choice so the student must say a real word. No emojis.

Also set usedGrammar=false, usedVocab=[] for the opening, and nudge as a short UI tip for the student (e.g. "Try: a dog" or "Try: I like pizza." ).

Return ONLY JSON:
{"reply":"...","usedGrammar":false,"usedVocab":[],"nudge":"short tip","stepSuccess":false,"askRepeat":false,"englishRetell":""}`;

        const data = await fetchAi(prompt);
        state.loading = false;

        if (!data || data.__error || !data.reply) {
            state.messages.push({ role: 'system', text: 'Could not start the chat. Check your connection and try New chat.' });
            setStatus(aiErr(data), 'error');
            render();
            return;
        }

        state.lastBotReply = data.reply;
        state.messages.push({ role: 'assistant', text: data.reply });
        render();
        const nudge = rootEl()?.querySelector('#review-nudge');
        if (nudge && data.nudge) nudge.textContent = data.nudge;
        maybeSpeak(data.reply);
    }

    async function askForHelp() {
        if (state.loading || state.ended) return;
        if (!state.lastBotReply) {
            setStatus('Wait for the partner to speak first.', 'error');
            return;
        }
        return submitMessage('Nie rozumiem', { helpRequest: true });
    }

    async function submitMessage(rawText, opts) {
        if (state.loading || state.ended) return;
        const input = rootEl()?.querySelector('#review-input');
        const text = (rawText != null ? String(rawText) : (input ? input.value : '')).trim();
        if (!text) {
            setStatus('Say or type something first.', 'error');
            return;
        }

        const helpRequest = !!(opts && opts.helpRequest);
        if (!helpRequest && isLetterOnlyAnswer(text)) {
            setStatus('Say or type the word — not just A or B.', 'error');
            const nudge = rootEl()?.querySelector('#review-nudge');
            if (nudge) nudge.textContent = 'Use a real word or short phrase (e.g. pizza), not a letter.';
            return;
        }

        state.loading = true;
        setStatus('');
        state.messages.push({ role: 'user', text });
        if (input) input.value = '';
        render();

        const needPolish = helpRequest || looksConfused(text);
        const mixed = !needPolish && (looksMixedPolishEnglish(text) || hasPolishContent(text));
        let supportBit = '';
        if (helpRequest) {
            supportBit = `\nHELP BUTTON: The student tapped "Nie rozumiem". They need help with YOUR LAST line (what it means / what to do). FIRST give a SHORT clear explanation in Polish (1–2 sentences) about that last partner message. THEN immediately switch back to simpler English with an easier practice question or a model answer. Do NOT stay in Polish. Do NOT raise difficulty. Set stepSuccess=false.`;
        } else if (needPolish) {
            supportBit = `\nThe student seems confused or asked for help. FIRST explain briefly in Polish, THEN switch back to simpler English with a practice prompt.`;
        } else if (mixed) {
            supportBit = `\nMIXED / POLISH DETECTED in the student's latest line. Accept their meaning. RETELL the full idea as one short English sentence for them to repeat. Set askRepeat=true and englishRetell to that exact English sentence (no Polish inside englishRetell). In reply, praise briefly then ask them to say the English line.`;
        } else {
            supportBit = `\nIf they mix Polish with English or answer partly in Polish, retell their idea in English for them to repeat (askRepeat=true). If they ask for help or say they do not understand, explain briefly in Polish then switch back to English.`;
        }

        const unusedVocab = state.wordList.filter((w) => !state.vocabTouched.includes(String(w).toLowerCase()));
        const prompt = `${buildSystemRules()}

Conversation so far:
${historyText()}

Student turns so far: ${state.turns}
Difficulty step: ${state.difficultyStep} (${difficultyLabel()})
Vocab already touched: ${state.vocabTouched.join(', ') || 'none'}
Prefer unused vocab next when natural: ${unusedVocab.slice(0, 6).join(', ') || 'any from the list'}
${supportBit}

Respond to the student's latest message.
- Keep practising grammar + vocab; vary your questions so the chat does not feel repetitive.
- Always expect WORD answers (spoken or typed) — never letter choices A/B/C/D.
- Prefer open questions (What/Who/Where/How many/two-word choice). Do not follow up with another yes/no if the last question was yes/no.
- No emojis in reply.
- If they did well with grammar and a vocab word (in English), set stepSuccess=true (we may raise difficulty next).
- usedGrammar: true if their turn used (or clearly attempted) the target grammar in English, or their meaning clearly aimed at it.
- usedVocab: list of target vocab words they used (English forms; subset of the list).
- nudge: one short tip for the UI (not spoken). If askRepeat, nudge should be like: Repeat: I like pizza.
- englishRetell: the exact English sentence to repeat when askRepeat is true; otherwise "".
- askRepeat: true when you retold a mixed/Polish answer into English for practice.

Return ONLY JSON:
{"reply":"...","usedGrammar":true,"usedVocab":["pizza"],"nudge":"Repeat: I like pizza.","stepSuccess":false,"askRepeat":true,"englishRetell":"I like pizza."}`;

        const data = await fetchAi(prompt);
        state.loading = false;

        if (!data || data.__error || !data.reply) {
            state.messages.pop();
            setStatus(aiErr(data), 'error');
            render();
            return;
        }

        state.turns += 1;
        bumpDifficulty(data);
        const pts = awardTurnPoints(data);
        const retell = String(data.englishRetell || '').trim();
        const askRepeat = !!data.askRepeat && !!retell;
        state.lastRepeatLine = askRepeat ? retell : '';
        state.lastBotReply = askRepeat ? retell : data.reply;
        state.messages.push({ role: 'assistant', text: data.reply });
        render();
        const nudge = rootEl()?.querySelector('#review-nudge');
        if (nudge) {
            const tip = askRepeat
                ? (`Repeat: ${retell}` + (pts ? ` · +${pts}` : ''))
                : ((data.nudge || '') + (pts ? ` · +${pts}` : ''));
            nudge.textContent = tip;
        }
        maybeSpeak(askRepeat ? retell : data.reply);

        if (state.turns >= 8 && !state.ended) {
            const n = rootEl()?.querySelector('#review-nudge');
            if (n && !data.nudge && !askRepeat) n.textContent = 'Great practice — you can End session for a coach note.';
        }
    }

    async function startMic() {
        if (state.loading || state.ended) return;

        // Stop any bot speech first — otherwise the mic hears TTS / audio is busy.
        stopListening();
        silenceBotSpeech();
        state.micInterim = '';
        state.micFinal = '';
        setStatus('');
        setMicHint('Getting microphone ready…');

        const ok = await ensureMicAccess();
        if (!ok) {
            setMicHint('');
            return;
        }

        // Brief settle so echoCancellation and cancelled TTS do not eat the first words.
        await new Promise((r) => setTimeout(r, 320));
        if (state.loading || state.ended) {
            releaseMicStream();
            return;
        }

        const rec = getSpeechRecognition();
        if (!rec) {
            releaseMicStream();
            setStatus('Speech recognition is not available in this browser. Use text mode or Chrome/Edge.', 'error');
            setMicHint('');
            return;
        }

        state.recognition = rec;
        state.listening = true;
        render();
        setMicHint('Listening… speak clearly in English');

        rec.onresult = (ev) => {
            try {
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    const res = ev.results[i];
                    const text = pickBestTranscript(res);
                    if (!text) continue;
                    if (res.isFinal) {
                        state.micFinal = (state.micFinal ? state.micFinal + ' ' : '') + text;
                        setMicHint('Heard: ' + state.micFinal.trim());
                    } else {
                        state.micInterim = text;
                        setMicHint('Listening… ' + text);
                    }
                }
            } catch { /* */ }
        };

        rec.onerror = (ev) => {
            const code = ev && ev.error;
            // aborted / no-speech: onend will submit any transcript or show a friendly empty message.
            if (code === 'aborted' || code === 'no-speech') return;
            state.listening = false;
            releaseMicStream();
            if (micStopTimer) {
                clearTimeout(micStopTimer);
                micStopTimer = null;
            }
            render();
            if (code === 'not-allowed' || code === 'service-not-allowed') {
                setStatus('Microphone blocked — allow mic access for this site, then try again.', 'error');
            } else if (code === 'audio-capture') {
                setStatus('Cannot capture audio — check that another app is not locking the mic.', 'error');
            } else if (code === 'network') {
                setStatus('Speech needs a network connection in this browser. Try again or type.', 'error');
            } else {
                setStatus('Mic error — try Say it again, or type your answer.', 'error');
            }
            setMicHint('');
        };

        rec.onend = () => {
            if (micStopTimer) {
                clearTimeout(micStopTimer);
                micStopTimer = null;
            }
            state.listening = false;
            releaseMicStream();
            const text = (state.micFinal || state.micInterim || '').trim();
            state.micFinal = '';
            state.micInterim = '';
            if (text) {
                submitMessage(text);
            } else {
                render();
                setStatus('Did not catch that — try Say it again a little louder, or type.', 'error');
                setMicHint('');
            }
        };

        try {
            rec.start();
            // Safety stop so continuous/slow browsers do not hang forever.
            micStopTimer = setTimeout(() => {
                micStopTimer = null;
                try { if (state.listening && state.recognition) state.recognition.stop(); } catch { /* */ }
            }, 9000);
        } catch {
            state.listening = false;
            releaseMicStream();
            render();
            setStatus('Could not start the mic. Try again or type your answer.', 'error');
            setMicHint('');
        }
    }

    async function endSession() {
        if (state.ended || state.loading) return;
        if (state.turns < 1) {
            setStatus('Have at least one turn first.', 'error');
            return;
        }
        stopListening();
        state.loading = true;
        render();

        const prompt = `You are a supportive Primary English coach for Polish children (klasa ${state.schoolYear}, ease ${easeInfo(state.ease).label}).
Review this short practice chat. Be kind, concrete, and brief. No adult jargon.

Grammar focus: ${grammarLabel(state.grammarId)}
Vocab focus: ${state.wordList.join(', ')}
Class relevance: ${classProfile(state.schoolYear).relevance}
Turns: ${state.turns}
Grammar hits (approx): ${state.grammarHits}
Vocab touched: ${state.vocabTouched.join(', ') || 'none'}

Transcript:
${historyText()}

Return ONLY JSON:
{
  "summary": "2 short encouraging sentences",
  "strengths": ["2–4 child-friendly strengths"],
  "improvements": ["2–4 tiny next-step tips"]
}`;

        const data = await fetchAi(prompt);
        state.loading = false;
        state.ended = true;
        state.messages.push({ role: 'system', text: 'Session ended — well done!' });

        if (data && !data.__error && Array.isArray(data.strengths)) {
            state.feedback = {
                summary: data.summary || 'Nice practice!',
                strengths: data.strengths,
                improvements: data.improvements || []
            };
        } else {
            state.feedback = {
                summary: 'Nice practice chatting in English!',
                strengths: ['You stayed in the conversation.', 'You tried the target language.'],
                improvements: ['Try one more sentence with the grammar next time.', 'Reuse two vocab words in your answers.']
            };
        }

        if (!state.sessionRecorded) {
            state.sessionRecorded = true;
            const score = Math.min(100, 20 + state.turns * 10 + state.vocabTouched.length * 5);
            if (typeof global.incrementGameCount === 'function') global.incrementGameCount();
            if (typeof global.peAddPoints === 'function') global.peAddPoints(POINTS_KEY, 20);
            if (typeof global.recordGameSessionApi === 'function') {
                global.recordGameSessionApi('pe_review', {
                    score,
                    pointsEarned: score,
                    result: {
                        turns: state.turns,
                        grammar: state.grammarId,
                        vocabMode: state.vocabMode,
                        topic: state.topicId,
                        scene: state.sceneId || null,
                        schoolYear: state.schoolYear,
                        ease: easeInfo(state.ease).id,
                        level: easeInfo(state.ease).id
                    }
                });
            }
        }

        render();
        setStatus('Session saved. Read your coach note above.', 'success');
    }

    function syncVocabModeUi() {
        const mode = document.querySelector('input[name="review-setup-vocab-mode"]:checked');
        const topicWrap = document.getElementById('review-setup-topic-wrap');
        const customWrap = document.getElementById('review-setup-custom-wrap');
        const isCustom = mode && mode.value === 'custom';
        if (topicWrap) topicWrap.style.display = isCustom ? 'none' : 'block';
        if (customWrap) customWrap.style.display = isCustom ? 'block' : 'none';
    }

    function syncClassHint() {
        const yearEl = document.getElementById('review-setup-year');
        const hint = document.getElementById('review-setup-class-hint');
        if (!hint) return;
        const year = yearEl ? Math.max(1, Math.min(8, parseInt(yearEl.value, 10) || 4)) : 4;
        const profile = classProfile(year);
        hint.textContent = `Vocab range for klasa ${year}: about ${profile.maxWords} words · ${profile.band}. ${profile.relevance}`;
    }

    function syncEaseLabel() {
        const easeEl = document.getElementById('review-setup-ease');
        const label = document.getElementById('review-setup-ease-label');
        if (!label) return;
        const idx = easeEl ? Math.max(0, Math.min(4, parseInt(easeEl.value, 10) || 2)) : 2;
        const info = easeInfo(idx);
        label.textContent = `${info.label} — ${info.hint}`;
    }

    function syncScenePicker() {
        const grid = document.getElementById('review-setup-scenes');
        const hidden = document.getElementById('review-setup-scene');
        const topicEl = document.getElementById('review-setup-topic');
        if (!grid) return;

        const topicId = topicEl ? topicEl.value : 'school';
        const scenes = scenesForTopic(topicId);
        const current = hidden ? String(hidden.value || '') : '';
        const stillValid = current && scenes.includes(current);
        if (hidden && current && !stillValid) hidden.value = '';

        const selected = hidden ? String(hidden.value || '') : '';
        let html = `<button type="button" class="review-setup-scene-btn${selected ? '' : ' selected'}" data-scene="">
            <div class="review-setup-scene-none">No picture</div>
        </button>`;
        scenes.forEach((src) => {
            const sel = src === selected ? ' selected' : '';
            html += `<button type="button" class="review-setup-scene-btn${sel}" data-scene="${escapeAttr(src)}">
                <img src="${escapeAttr(src)}" alt="${escapeAttr(sceneTitleFromSrc(src))}" loading="lazy">
                <span>${escapeHtml(sceneTitleFromSrc(src))}</span>
            </button>`;
        });
        grid.innerHTML = html;
        grid.querySelectorAll('.review-setup-scene-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const src = btn.getAttribute('data-scene') || '';
                if (hidden) hidden.value = src;
                grid.querySelectorAll('.review-setup-scene-btn').forEach((b) => {
                    b.classList.toggle('selected', (b.getAttribute('data-scene') || '') === src);
                });
            });
        });
    }

    function initPeReview() {
        const err = validateSetup();
        if (err) {
            if (typeof global.appAlert === 'function') global.appAlert(err);
            else alert(err);
            return false;
        }

        stopListening();
        if (global.speechSynthesis) global.speechSynthesis.cancel();

        state.messages = [];
        state.turns = 0;
        state.difficultyStep = 0;
        state.vocabTouched = [];
        state.grammarHits = 0;
        state.lastBotReply = '';
        state.loading = false;
        state.listening = false;
        state.ended = false;
        state.sessionRecorded = false;
        state.feedback = null;
        state.scenePayload = null;
        state.sceneSeed = pickSceneSeed();
        state.openingStyle = pickOpeningStyle();
        state.sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        state.voiceURI = loadSavedVoiceURI();
        state.voiceMenuOpen = false;
        state.lastRepeatLine = '';
        refreshVoices();

        injectCss();
        render();
        openConversation();
        return true;
    }

    // Setup helpers for index.html toggles
    function wireSetupListeners() {
        document.querySelectorAll('input[name="review-setup-vocab-mode"]').forEach((el) => {
            el.addEventListener('change', () => {
                syncVocabModeUi();
                syncScenePicker();
            });
        });
        const yearEl = document.getElementById('review-setup-year');
        if (yearEl) yearEl.addEventListener('change', syncClassHint);
        const easeEl = document.getElementById('review-setup-ease');
        if (easeEl) easeEl.addEventListener('input', syncEaseLabel);
        const topicEl = document.getElementById('review-setup-topic');
        if (topicEl) topicEl.addEventListener('change', syncScenePicker);
        syncVocabModeUi();
        syncClassHint();
        syncEaseLabel();
        syncScenePicker();
        if (global.speechSynthesis) {
            refreshVoices();
            if (typeof global.speechSynthesis.addEventListener === 'function') {
                global.speechSynthesis.addEventListener('voiceschanged', () => {
                    refreshVoices();
                    const sel = document.getElementById('review-voice-select');
                    if (sel) {
                        const current = sel.value;
                        sel.innerHTML = voiceOptionsHtml();
                        if (current) sel.value = current;
                    }
                });
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireSetupListeners);
    } else {
        wireSetupListeners();
    }

    global.initPeReview = initPeReview;
    global.validatePeReviewSetup = validateSetup;
    global.PEReviewChat = {
        init: initPeReview,
        submit: submitMessage,
        askHelp: askForHelp,
        end: endSession,
        syncVocabModeUi,
        syncClassHint,
        syncEaseLabel,
        syncScenePicker,
        getState() { return Object.assign({}, state, { wordList: state.wordList.slice(), sceneLabels: state.sceneLabels.slice() }); }
    };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Review Chatbot — Primary English (Writing Suite / premium).
 * Teaching chatbot: practises one grammar point + vocab through short, level-fit conversation.
 * Text and/or speech; Mission-style AI loop + Topic Challenge mic/TTS patterns.
 */
(function (global) {
    'use strict';

    const CSS_ID = 'pe-review-chat-css';
    const POINTS_KEY = 'review';
    const MIN_CUSTOM = 4;
    const MAX_VOCAB = 14;
    const HISTORY_TURNS = 6; // last N student+bot messages kept in the AI prompt (speed)

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
            hint: 'Very short bot lines; heavy modelling',
            maxWords: 10,
            guide: 'STARTER: YOUR reply max ~10 words. Teach by modelling one tiny sentence, then ask the student to copy or change one word. Example: "This is my mum. Your turn: This is my…" One ask only. No lectures.'
        },
        {
            id: 'beginner',
            label: 'Beginner',
            hint: 'Short bot lines; copy-friendly sentences',
            maxWords: 14,
            guide: 'BEGINNER: YOUR reply max ~14 words. Model a short sentence with the grammar, then ask for a similar sentence. Give a frame if needed ("Try: My brother is tall."). Keep words very simple.'
        },
        {
            id: 'very_easy',
            label: 'Very easy',
            hint: 'Short clear teaching turns',
            maxWords: 18,
            guide: 'VERY EASY: YOUR reply max ~18 words. Teach the grammar + one vocab word in a short chat turn. Model if stuck. Prefer What/Who/Where that need a short full sentence.'
        },
        {
            id: 'easy',
            label: 'Easy',
            hint: 'Short sentences; light scaffolding',
            maxWords: 22,
            guide: 'EASY: YOUR reply max ~22 words. Ask for a short full sentence with grammar + one vocab word. Scaffold only when they struggle. Still simple PE English.'
        },
        {
            id: 'normal',
            label: 'Normal',
            hint: 'Natural short PE teaching chat',
            maxWords: 28,
            guide: 'NORMAL: YOUR reply max ~28 words. Natural short PE chat that still teaches grammar + vocab. Never long, never exam-hard.'
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
        'Open by modelling one short teaching sentence with the target grammar, then ask the student to make a similar sentence.',
        'Open with a warm hello + one short model + one open question that needs a short full sentence.',
        'Open by pointing at the scene (or an everyday topic) and modelling a tiny sentence; invite the student to copy/change it.',
        'Open with one vocab word in a short modelled sentence, then ask for the student\'s sentence.',
        'Open as a patient coach: show the pattern once, then ask "Your turn" with a clear frame.'
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
        scenePayload: null,
        runInstructions: ''
    };

    const MAX_RUN_INSTRUCTIONS = 500;

    const RUN_INSTRUCTION_PRESETS = [
        { label: 'Possessive pronouns', text: 'Practise possessive pronouns (my, your, his, her, our) in natural talk about family and things people have — e.g. "my mum", "your bag".' },
        { label: 'Family members', text: 'Focus on family members (mum, dad, brother, sister, grandma…) — who people are and simple facts about them.' },
        { label: 'Home & rooms', text: 'Talk about rooms and objects at home (kitchen, bedroom, sofa, garden) using simple descriptions.' },
        { label: 'Likes & dislikes', text: 'Practise like / don\'t like with food and free-time activities in everyday chat.' },
        { label: 'Can / can\'t', text: 'Use can and can\'t for abilities and permission in a friendly scenario (school, sport, home).' },
        { label: 'Daily routines', text: 'Gentle practice of daily routines (get up, go to school, homework) with present simple — keep it conversational, not a drill.' }
    ];

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

    function sanitizeRunInstructions(raw) {
        return String(raw == null ? '' : raw)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_RUN_INSTRUCTIONS);
    }

    function runInstructionsPromptBlock() {
        const brief = sanitizeRunInstructions(state.runInstructions);
        if (!brief) return '';
        return `SESSION FOCUS: ${brief}
Honour this focus in natural teaching chat for klasa ${state.schoolYear} / ease "${easeInfo(currentEaseIndex()).label}". Do not announce the brief.`;
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
        const runEl = document.getElementById('review-setup-run-instructions');
        const modeEl = document.querySelector('input[name="review-setup-mode"]:checked');

        state.age = ageEl ? ageEl.value : 'young';
        state.schoolYear = yearEl ? Math.max(1, Math.min(8, parseInt(yearEl.value, 10) || 4)) : 4;
        state.ease = easeEl ? Math.max(0, Math.min(4, parseInt(easeEl.value, 10) || 2)) : 2;
        state.grammarId = gramEl ? gramEl.value : 'be';
        state.vocabMode = vocabModeEl ? vocabModeEl.value : 'topic';
        state.topicId = topicEl ? topicEl.value : 'school';
        if (state.topicId === 'family_home') state.topicId = 'family';
        state.inputMode = modeEl ? modeEl.value : 'text';
        state.runInstructions = sanitizeRunInstructions(runEl ? runEl.value : '');
        if (runEl && runEl.value !== state.runInstructions) runEl.value = state.runInstructions;

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
                vibe: 'curious picture coach',
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
        const ageBand = state.age === 'young' ? '8–9' : '10–12';
        const gLabel = grammarLabel(state.grammarId);
        const vocab = state.wordList.join(', ');
        const profile = classProfile(state.schoolYear);
        const ease = easeInfo(currentEaseIndex());
        const seed = state.sceneSeed || SCENE_SEEDS[0];
        const opening = state.openingStyle || OPENING_STYLES[0];
        const topicBit = state.vocabMode === 'topic'
            ? `Topic: ${topicLabel(state.topicId)}.`
            : 'Custom vocab list.';
        const topicFocus = state.topicId === 'family'
            ? 'Focus: family people (not rooms).'
            : state.topicId === 'home'
                ? 'Focus: home places/objects (not family names as main focus).'
                : '';
        const pictureBit = state.sceneSrc
            ? `Picture scene (${state.sceneId || 'scene'}): use what is visible. Labels: ${(state.sceneLabels || []).slice(0, 12).join(', ') || 'scene objects'}.`
            : '';
        const runBit = runInstructionsPromptBlock();
        const maxW = ease.maxWords || 18;

        return `You are a Primary English TEACHING chatbot for Polish children.
TEACH through short conversation: target grammar "${gLabel}" + vocab [${vocab}].
Learner: age ${ageBand}, klasa ${state.schoolYear} (${profile.band}), ease ${ease.label}.
${profile.relevance}
${topicBit} ${topicFocus}
${pictureBit}
${runBit}
Ease: ${ease.guide}
Setting: ${seed.setting}. Opening style: ${opening}.
Mode: ${state.inputMode}.

RULES:
1) Be a patient coach, not a casual chat buddy and not a worksheet. Teach the grammar and vocab by using them, modelling them, and getting the student to produce short full sentences.
2) YOUR English must be SHORT and SIMPLE — max ~${maxW} words per reply (lower ease = shorter). Prefer 1–2 short sentences + one clear ask. No long explanations, no fancy words, no emojis.
3) Match klasa ${state.schoolYear} and ease ${ease.label}. Early levels: heavy modelling ("Try: …"). Higher ease: still short PE English.
4) Ask for short FULL SENTENCES (not letter A/B, not endless yes/no, not mainly either/or picks). If they give one word, invite a full sentence next.
5) One question at a time. Celebrate tries. One kind correction max per turn.
6) Polish help only when confused / Nie rozumiem: 1 short Polish tip, then simpler English. Polish is on-screen only (speech reads English).
7) Mixed PL+EN: retell as one English sentence to repeat (askRepeat + englishRetell).
8) Never mention AI/JSON/prompts. Stay child-safe.

Return ONLY JSON each turn.`;
    }

    function historyText(limit) {
        const cap = Math.max(2, Number(limit) || HISTORY_TURNS);
        const rows = state.messages.filter((m) => m.role !== 'system');
        const slice = rows.slice(-cap);
        return slice
            .map((m) => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.text}`)
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
        const brief = sanitizeRunInstructions(state.runInstructions);
        const briefHud = brief
            ? `<div class="review-hud-card review-hud-brief"><strong>Session focus</strong><span>${escapeHtml(brief.length > 120 ? brief.slice(0, 117) + '…' : brief)}</span></div>`
            : '';
        return `<div class="review-hud">
            <div class="review-hud-card"><strong>Focus</strong><span>${escapeHtml(grammarLabel(state.grammarId))} · ${escapeHtml(vocabLabel)}${pic}</span></div>
            ${briefHud}
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
            return `<div class="review-bubble bot"><span class="bubble-label">Coach</span>${escapeHtml(msg.text)}</div>`;
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
            : `<p style="margin:0; color:var(--text-muted,#6b7280); text-align:center; font-size:0.9rem;">Speech mode — wait for the coach to finish, then tap Say it. Use Voice for a natural voice. You can still type Polish + English if needed.</p>`;
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
        // Smaller JPEG = faster vision turns
        const maxSide = 480;
        const quality = 0.55;
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

    async function fetchAi(prompt, opts) {
        if (typeof global.fetchGenerativeAI !== 'function') {
            return { __error: 'AI unavailable' };
        }
        const images = [];
        // Vision only when requested (opening with picture) — later turns stay text-only for speed.
        if (opts && opts.withImage && state.sceneSrc) {
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

        const ease = easeInfo(currentEaseIndex());
        const focusWord = state.wordList[0] || 'friend';
        const pictureOpen = state.sceneSrc
            ? 'A picture is attached this turn only. Point at something visible and teach with a short model + question.'
            : 'No picture — teach from the topic/scene.';
        const prompt = `${buildSystemRules()}

START. ${pictureOpen}
Open as the teaching coach. Use grammar + one vocab word (try "${focusWord}").
Keep YOUR reply under ~${ease.maxWords || 18} words. Model then ask for a short full sentence. No yes/no opener, no A/B, no emojis.
${state.runInstructions ? 'Fit the SESSION FOCUS without announcing it.' : ''}
nudge = short tip like "Try: This is my mum."

Return ONLY JSON:
{"reply":"...","usedGrammar":false,"usedVocab":[],"nudge":"Try: …","stepSuccess":false,"askRepeat":false,"englishRetell":""}`;

        const data = await fetchAi(prompt, { withImage: !!state.sceneSrc });
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
            setStatus('Wait for the coach to speak first.', 'error');
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
            setStatus('Say or type a short sentence — not just A or B.', 'error');
            const nudge = rootEl()?.querySelector('#review-nudge');
            if (nudge) nudge.textContent = 'Use a short sentence (e.g. I like pizza), not a letter.';
            return;
        }

        state.loading = true;
        setStatus('');
        state.messages.push({ role: 'user', text });
        if (input) input.value = '';
        render();

        const ease = easeInfo(currentEaseIndex());
        const needPolish = helpRequest || looksConfused(text);
        const mixed = !needPolish && (looksMixedPolishEnglish(text) || hasPolishContent(text));
        let supportBit = '';
        if (helpRequest) {
            supportBit = 'HELP: Student tapped Nie rozumiem. 1 short Polish tip about your last line, then simpler English + model. stepSuccess=false.';
        } else if (needPolish) {
            supportBit = 'Confused: brief Polish tip, then simpler English practice.';
        } else if (mixed) {
            supportBit = 'Mixed PL/EN: retell as one English sentence; askRepeat=true + englishRetell.';
        }

        const unusedVocab = state.wordList.filter((w) => !state.vocabTouched.includes(String(w).toLowerCase()));
        const prompt = `${buildSystemRules()}

Chat (recent):
${historyText(HISTORY_TURNS)}

Turns: ${state.turns}. Ease now: ${ease.label} (max ~${ease.maxWords || 18} words in YOUR reply).
Touched vocab: ${state.vocabTouched.join(', ') || 'none'}. Prefer next: ${unusedVocab.slice(0, 5).join(', ') || 'any'}.
${supportBit}

Reply as teaching coach. Keep teaching grammar + vocab with SHORT simple English. Ask for a short full sentence next. No A/B letters, no emoji spam.
JSON fields: reply, usedGrammar, usedVocab[], nudge, stepSuccess, askRepeat, englishRetell.

Return ONLY JSON:
{"reply":"...","usedGrammar":true,"usedVocab":["pizza"],"nudge":"Try: I like pizza.","stepSuccess":false,"askRepeat":false,"englishRetell":""}`;

        const data = await fetchAi(prompt, { withImage: false });
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

        const prompt = `Primary English coach note for klasa ${state.schoolYear}, ease ${easeInfo(state.ease).label}. Be brief and kind.
Grammar: ${grammarLabel(state.grammarId)}. Vocab: ${state.wordList.join(', ')}. Focus: ${sanitizeRunInstructions(state.runInstructions) || 'none'}.
Turns: ${state.turns}. Grammar hits: ${state.grammarHits}. Vocab touched: ${state.vocabTouched.join(', ') || 'none'}.

Transcript:
${historyText(10)}

Return ONLY JSON:
{"summary":"2 short encouraging sentences","strengths":["2–4 tips"],"improvements":["2–4 next steps"]}`;

        const data = await fetchAi(prompt, { withImage: false });
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
                        runInstructions: sanitizeRunInstructions(state.runInstructions) || null,
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

    function renderRunInstructionPresets() {
        const wrap = document.getElementById('review-setup-run-presets');
        if (!wrap) return;
        wrap.innerHTML = RUN_INSTRUCTION_PRESETS.map((p) =>
            `<button type="button" class="review-setup-run-chip" data-run-text="${escapeAttr(p.text)}">${escapeHtml(p.label)}</button>`
        ).join('');
    }

    function setRunInstruction(text, append) {
        const el = document.getElementById('review-setup-run-instructions');
        if (!el) return;
        const next = sanitizeRunInstructions(append && el.value.trim()
            ? `${el.value.trim()} ${text}`
            : text);
        el.value = next;
        state.runInstructions = next;
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
        const runEl = document.getElementById('review-setup-run-instructions');
        if (runEl) {
            runEl.addEventListener('input', () => {
                state.runInstructions = sanitizeRunInstructions(runEl.value);
            });
        }
        renderRunInstructionPresets();
        document.getElementById('review-setup-run-presets')?.addEventListener('click', (ev) => {
            const btn = ev.target.closest('.review-setup-run-chip');
            if (!btn) return;
            const text = btn.getAttribute('data-run-text') || '';
            if (text) setRunInstruction(text, false);
        });
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
        setRunInstruction,
        renderRunInstructionPresets,
        getState() { return Object.assign({}, state, { wordList: state.wordList.slice(), sceneLabels: state.sceneLabels.slice() }); }
    };
})(typeof window !== 'undefined' ? window : globalThis);

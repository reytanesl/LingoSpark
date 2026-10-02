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

    const LEVEL_GUIDE = {
        beginner: 'Very young / early PE (approx. A0–A1). Ultra-short sentences. Lots of yes/no and one-word answers. Model the phrase first.',
        a1: 'A1 PE. Short questions and answers. Simple present / to be / can / like. Clear models.',
        a2: 'A2 PE. Slightly longer turns, still simple. Keep vocabulary concrete and school-friendly.'
    };

    const SCENE_SEEDS = [
        { setting: 'classroom before the lesson', vibe: 'curious classmate' },
        { setting: 'school break in the playground', vibe: 'playful friend' },
        { setting: 'lunch in the school canteen', vibe: 'hungry buddy' },
        { setting: 'walking home from school', vibe: 'chatty neighbour' },
        { setting: 'at a birthday party', vibe: 'excited party guest' },
        { setting: 'in a shop with a parent', vibe: 'helpful shop helper' },
        { setting: 'at the park after school', vibe: 'sporty friend' },
        { setting: 'doing homework together online', vibe: 'study buddy' },
        { setting: 'waiting for the school bus', vibe: 'sleepy morning friend' },
        { setting: 'in the school library', vibe: 'quiet book friend' },
        { setting: 'at a sports club', vibe: 'team-mate' },
        { setting: 'visiting family at the weekend', vibe: 'cousin visiting' }
    ];

    const OPENING_STYLES = [
        'Start with a short hello and one easy yes/no question.',
        'Start by sharing one tiny fact about yourself, then ask a matching question.',
        'Start by pointing at something imaginary in the scene and asking about it.',
        'Start with "Look!" / "Wow!" energy, then ask a very easy question.',
        'Start by offering a simple choice (A or B), then wait for the student.'
    ];

    const VOICE_STORAGE_KEY = 'ls_review_voice';
    const CONFUSION_RE = /\b(i\s+don'?t\s+understand|dont\s+understand|don'?t\s+get\s+it|what\s+does\s+.*\s+mean|can\s+you\s+explain|explain\s+(please|in\s+polish)|po\s+polsku|nie\s+rozumiem|nie\s+rozumie|co\s+to\s+znaczy|wyja[sś]nij|pomocy|help\s+me|too\s+hard|za\s+trudn)/i;

    let state = {
        age: 'young',
        schoolYear: 4,
        level: 'a1',
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
        voiceURI: ''
    };

    let cachedVoices = [];

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
        const row = topics().find((t) => t.id === id);
        return row ? row.label : id;
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
            .review-voice-row {
                display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; justify-content: center;
                font-size: 0.85rem; color: var(--text-muted, #6b7280);
            }
            .review-voice-row label { font-weight: 600; color: var(--royal-blue, #012169); }
            .review-voice-row select {
                max-width: min(100%, 320px); padding: 0.35rem 0.55rem; border: 1px solid var(--border-light, #e5e7eb);
                border-radius: 0.4rem; font-size: 0.85rem; background: #fff;
            }
            .review-nudge { font-size: 0.88rem; color: var(--text-muted, #6b7280); min-height: 1.2em; text-align: center; }
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

    function vocabFromTopic(topicId, grammarId) {
        const rows = bank().filter((r) => r.topic === topicId && (!grammarId || r.grammar === grammarId));
        const pool = rows.length ? rows : bank().filter((r) => r.topic === topicId);
        const counts = new Map();
        pool.forEach((row) => {
            (row.tiles || []).forEach((tile) => {
                const w = String(tile || '').trim().toLowerCase().replace(/[.?!,]/g, '');
                if (!w || STOP.has(w) || w.length < 2) return;
                counts.set(w, (counts.get(w) || 0) + 1);
            });
            String(row.answer || '').toLowerCase().split(/[^a-z']+/).forEach((w) => {
                if (!w || STOP.has(w) || w.length < 3) return;
                counts.set(w, (counts.get(w) || 0) + 1);
            });
        });
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_VOCAB)
            .map(([w]) => w);
    }

    function readSetupFromDom() {
        const ageEl = document.querySelector('input[name="review-setup-age"]:checked');
        const yearEl = document.getElementById('review-setup-year');
        const levelEl = document.querySelector('input[name="review-setup-level"]:checked');
        const gramEl = document.getElementById('review-setup-grammar');
        const vocabModeEl = document.querySelector('input[name="review-setup-vocab-mode"]:checked');
        const topicEl = document.getElementById('review-setup-topic');
        const customEl = document.getElementById('review-setup-custom');
        const modeEl = document.querySelector('input[name="review-setup-mode"]:checked');

        state.age = ageEl ? ageEl.value : 'young';
        state.schoolYear = yearEl ? Math.max(1, Math.min(8, parseInt(yearEl.value, 10) || 4)) : 4;
        state.level = levelEl ? levelEl.value : 'a1';
        state.grammarId = gramEl ? gramEl.value : 'be';
        state.vocabMode = vocabModeEl ? vocabModeEl.value : 'topic';
        state.topicId = topicEl ? topicEl.value : 'school';
        state.inputMode = modeEl ? modeEl.value : 'text';

        if (state.vocabMode === 'custom') {
            state.wordList = shuffle(parseCustomList(customEl ? customEl.value : '')).slice(0, MAX_VOCAB);
        } else {
            state.wordList = shuffle(vocabFromTopic(state.topicId, state.grammarId)).slice(0, MAX_VOCAB);
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
        return SCENE_SEEDS[Math.floor(Math.random() * SCENE_SEEDS.length)];
    }

    function pickOpeningStyle() {
        return OPENING_STYLES[Math.floor(Math.random() * OPENING_STYLES.length)];
    }

    function looksConfused(text) {
        return CONFUSION_RE.test(String(text || ''));
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
        if (state.difficultyStep <= 0) return 'Very easy';
        if (state.difficultyStep === 1) return 'Easy';
        return 'A little harder';
    }

    function buildSystemRules() {
        const ageBand = state.age === 'young' ? '8–9 years old' : '10–12 years old';
        const gLabel = grammarLabel(state.grammarId);
        const vocab = state.wordList.join(', ');
        const topicBit = state.vocabMode === 'topic'
            ? `Topic pack: ${topicLabel(state.topicId)}.`
            : 'Custom vocabulary list from the teacher/student.';
        const stepGuide = state.difficultyStep <= 0
            ? 'DIFFICULTY: VERY EASY. Prefer yes/no or one-word answers. Model a short phrase the student can copy. Celebrate every attempt.'
            : state.difficultyStep === 1
                ? 'DIFFICULTY: EASY. Ask for short answers that use the target grammar and one vocab word. Offer a starter phrase if they struggle.'
                : 'DIFFICULTY: A LITTLE HARDER. Ask for a full short sentence with grammar + vocab. Still kind and scaffolded — never jump to exam difficulty.';
        const seed = state.sceneSeed || SCENE_SEEDS[0];
        const opening = state.openingStyle || OPENING_STYLES[0];

        return `You are a friendly Primary English conversation partner for Polish school children.
Learner: age band ${ageBand}, school year (klasa) ${state.schoolYear}, level ${state.level}.
Level guide: ${LEVEL_GUIDE[state.level] || LEVEL_GUIDE.a1}
Target grammar: ${gLabel} (id: ${state.grammarId}).
${topicBit}
Target vocabulary to weave in naturally (order is randomised this session): ${vocab}.
Input mode: ${state.inputMode} (keep replies short enough to speak aloud).
Session id: ${state.sessionId || 'new'} — make THIS chat feel unique; do not reuse the same greeting or questions as a generic template.
Scene for this chat: ${seed.setting}. Your vibe: ${seed.vibe}.
Opening style for this chat: ${opening}

YOUR JOB:
- Run a warm, motivating spoken conversation that practises the grammar and vocab.
- Randomise the content: vary people, places, objects, and questions each session. Prefer different vocab words from the list over time.
- Start easier than the learner's ceiling to build confidence, then step up only after success.
- ${stepGuide}
- Default language: simple English. Do not lecture. Do not dump grammar rules.
- After a good try, you may give ONE short kind correction or model (e.g. "Nice! We say: I like apples.").
- Ask one clear question at a time. Stay inside the chosen scene/vibe unless the student leads elsewhere.
- POLISH HELP (important): If the student asks for help, says they do not understand, writes in Polish asking for meaning, or clearly sounds lost — first give a SHORT clear explanation in Polish (1–2 sentences), then immediately switch back to English with a simpler practice question or model. Example shape: "Po polsku: ... Now in English: ..." Do NOT stay in Polish for the whole reply. Do NOT use Polish unless they need help.
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

    function speakText(text) {
        if (!text || !global.speechSynthesis) return;
        global.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
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
        if (usedG && (usedV || state.wordList.length === 0) && state.difficultyStep < 2) {
            state.difficultyStep += 1;
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
        return `<div class="review-hud">
            <div class="review-hud-card"><strong>Focus</strong><span>${escapeHtml(grammarLabel(state.grammarId))} · ${escapeHtml(vocabLabel)}</span></div>
            <div class="review-hud-card"><strong>Learner</strong><span>Klasa ${state.schoolYear} · ${escapeHtml(state.level.toUpperCase())} · ${state.age === 'young' ? '8–9' : '10–12'}</span></div>
            <div class="review-hud-card"><strong>Progress</strong><span>${state.turns} turns · ${state.vocabTouched.length} vocab · ${difficultyLabel()}</span></div>
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
            ? `<textarea id="review-input" placeholder="Type your answer…" rows="2" ${state.loading ? 'disabled' : ''}></textarea>`
            : `<p style="margin:0; color:var(--text-muted,#6b7280); text-align:center; font-size:0.9rem;">Speech mode — use the mic, or Hear the last question.</p>`;
        const voiceRow = showSpeak()
            ? `<div class="review-voice-row">
                <label for="review-voice-select"><i class="fa-solid fa-volume-high"></i> Voice</label>
                <select id="review-voice-select" title="Choose a natural English voice">${voiceOptionsHtml()}</select>
            </div>`
            : '';
        return `<div class="review-compose ${state.listening ? 'review-listening' : ''}">
            ${writeBlock}
            ${voiceRow}
            <div class="review-nudge" id="review-nudge"></div>
            <div class="review-compose-actions">
                ${showWrite() ? `<button type="button" class="btn btn-blue" id="review-send-btn" ${state.loading ? 'disabled' : ''}><i class="fa-solid fa-paper-plane"></i> Send</button>` : ''}
                ${showSpeak() ? `<button type="button" class="btn btn-outline" id="review-mic-btn" ${state.loading ? 'disabled' : ''}><i class="fa-solid fa-microphone"></i> ${state.listening ? 'Listening…' : 'Say it'}</button>` : ''}
                ${showSpeak() ? `<button type="button" class="btn btn-outline" id="review-hear-btn" ${state.loading || !state.lastBotReply ? 'disabled' : ''}><i class="fa-solid fa-volume-high"></i> Hear</button>` : ''}
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
            if (state.lastBotReply) speakText(state.lastBotReply);
        });
        root.querySelector('#review-end-btn')?.addEventListener('click', () => endSession());
        root.querySelector('#review-restart-btn')?.addEventListener('click', () => initPeReview());
        const voiceSel = root.querySelector('#review-voice-select');
        if (voiceSel) {
            voiceSel.addEventListener('change', () => {
                saveVoiceURI(voiceSel.value);
                if (state.lastBotReply) speakText(state.lastBotReply);
            });
        }
    }

    function render() {
        const root = rootEl();
        if (!root) return;
        injectCss();
        root.innerHTML = `<div class="review-wrap">
            ${renderHudHtml()}
            ${renderFeedbackHtml()}
            ${renderChatHtml()}
            ${renderComposeHtml()}
        </div>`;
        const log = root.querySelector('#review-chat-log');
        if (log) log.scrollTop = log.scrollHeight;
        bindUi();
    }

    async function fetchAi(prompt) {
        if (typeof global.fetchGenerativeAI !== 'function') {
            return { __error: 'AI unavailable' };
        }
        return global.fetchGenerativeAI(prompt);
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
        const prompt = `${buildSystemRules()}

The conversation is just beginning. Write the FIRST line as the friendly partner in this scene (${seed.setting}, vibe: ${seed.vibe}).
Follow the opening style. Invite the target grammar and weave in one vocab word (try "${focusWord}" or another from the list).
Do not explain the task. Do not start with the same generic "Hi! How are you?" every time — make this opening feel fresh for session ${state.sessionId}.

Also set usedGrammar=false, usedVocab=[] for the opening, and nudge as a short UI tip for the student (e.g. "Try: Yes, I am." ).

Return ONLY JSON:
{"reply":"...","usedGrammar":false,"usedVocab":[],"nudge":"short tip","stepSuccess":false}`;

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

    async function submitMessage(rawText) {
        if (state.loading || state.ended) return;
        const input = rootEl()?.querySelector('#review-input');
        const text = (rawText != null ? String(rawText) : (input ? input.value : '')).trim();
        if (!text) {
            setStatus('Say or type something first.', 'error');
            return;
        }

        state.loading = true;
        setStatus('');
        state.messages.push({ role: 'user', text });
        if (input) input.value = '';
        render();

        const needPolish = looksConfused(text);
        const polishBit = needPolish
            ? `\nThe student seems confused or asked for help. FIRST explain briefly in Polish, THEN switch back to simpler English with a practice prompt.`
            : `\nIf they ask for help or say they do not understand (also in Polish), explain briefly in Polish then switch back to English.`;

        const unusedVocab = state.wordList.filter((w) => !state.vocabTouched.includes(String(w).toLowerCase()));
        const prompt = `${buildSystemRules()}

Conversation so far:
${historyText()}

Student turns so far: ${state.turns}
Difficulty step: ${state.difficultyStep} (${difficultyLabel()})
Vocab already touched: ${state.vocabTouched.join(', ') || 'none'}
Prefer unused vocab next when natural: ${unusedVocab.slice(0, 6).join(', ') || 'any from the list'}
${polishBit}

Respond to the student's latest message.
- Keep practising grammar + vocab; vary your questions so the chat does not feel repetitive.
- If they did well with grammar and a vocab word, set stepSuccess=true (we may raise difficulty next).
- usedGrammar: true if their turn used (or clearly attempted) the target grammar.
- usedVocab: list of target vocab words they used (subset of the list).
- nudge: one short tip for the UI (not spoken).

Return ONLY JSON:
{"reply":"...","usedGrammar":true,"usedVocab":["apple"],"nudge":"short tip","stepSuccess":true}`;

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
        state.lastBotReply = data.reply;
        state.messages.push({ role: 'assistant', text: data.reply });
        render();
        const nudge = rootEl()?.querySelector('#review-nudge');
        if (nudge) {
            nudge.textContent = (data.nudge || '') + (pts ? ` · +${pts}` : '');
        }
        maybeSpeak(data.reply);

        if (state.turns >= 8 && !state.ended) {
            const n = rootEl()?.querySelector('#review-nudge');
            if (n && !data.nudge) n.textContent = 'Great practice — you can End session for a coach note.';
        }
    }

    function startMic() {
        if (state.loading || state.ended) return;
        stopListening();
        const rec = getSpeechRecognition();
        if (!rec) {
            setStatus('Speech recognition is not available in this browser. Use text mode or Chrome/Edge.', 'error');
            return;
        }
        state.recognition = rec;
        state.listening = true;
        render();
        rec.onresult = (ev) => {
            let best = '';
            try {
                const res = ev.results[0];
                best = (res[0] && res[0].transcript) || '';
            } catch { /* */ }
            state.listening = false;
            if (best.trim()) {
                submitMessage(best.trim());
            } else {
                render();
                setStatus('Did not catch that — try again.', 'error');
            }
        };
        rec.onerror = () => {
            state.listening = false;
            render();
            setStatus('Mic error — try again or type your answer.', 'error');
        };
        rec.onend = () => {
            state.listening = false;
        };
        try {
            rec.start();
        } catch {
            state.listening = false;
            render();
            setStatus('Could not start the mic.', 'error');
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

        const prompt = `You are a supportive Primary English coach for Polish children (klasa ${state.schoolYear}, level ${state.level}).
Review this short practice chat. Be kind, concrete, and brief. No adult jargon.

Grammar focus: ${grammarLabel(state.grammarId)}
Vocab focus: ${state.wordList.join(', ')}
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
                        schoolYear: state.schoolYear,
                        level: state.level
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
        state.sceneSeed = pickSceneSeed();
        state.openingStyle = pickOpeningStyle();
        state.sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        state.voiceURI = loadSavedVoiceURI();
        refreshVoices();

        injectCss();
        render();
        openConversation();
        return true;
    }

    // Setup helpers for index.html toggles
    function wireSetupListeners() {
        document.querySelectorAll('input[name="review-setup-vocab-mode"]').forEach((el) => {
            el.addEventListener('change', syncVocabModeUi);
        });
        syncVocabModeUi();
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
        end: endSession,
        syncVocabModeUi,
        getState() { return Object.assign({}, state, { wordList: state.wordList.slice() }); }
    };
})(typeof window !== 'undefined' ? window : globalThis);

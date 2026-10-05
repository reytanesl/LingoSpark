/**
 * Topic Challenge — Primary English (premium).
 * Modes: Picture (Spot & Say) / Tiles / Transform + Write | Speak | Both.
 * Picture: circle a real scene hotspot first, then ask about THAT label — no bank fuzzy match.
 * Near-miss typed answers can still be re-checked by AI for fair alternate readings.
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
        response: 'write',
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
        highlightBoxes: [],
        aiChecking: false
    };

    let advanceTimer = null;

    const FEMALE = new Set([
        'girl', 'woman', 'grandmother', 'mother', 'mum', 'mom', 'sister'
    ]);
    const MALE = new Set([
        'boy', 'man', 'grandfather', 'father', 'dad', 'brother', 'waiter'
    ]);
    const PEOPLE = new Set([
        ...FEMALE, ...MALE,
        'baby', 'teacher', 'cashier', 'chef', 'zookeeper', 'police officer'
    ]);
    /** Always plural / plural-only nouns — never take a/an. */
    const ALWAYS_PLURAL = new Set([
        'stairs', 'jeans', 'trousers', 'pants', 'shorts', 'glasses', 'goggles',
        'sunglasses', 'scissors', 'clothes', 'binoculars', 'overalls', 'pajamas',
        'pyjamas', 'shoes', 'boots', 'socks', 'sandals', 'mittens', 'gloves',
        'trainers', 'flowers', 'grapes', 'people', 'children', 'teeth', 'feet',
        'mice', 'sheep', 'roller skates'
    ]);
    /** End in -s/-ss/-us but are singular countable. */
    const SINGULAR_S = new Set([
        'bus', 'dress', 'glass', 'grass', 'class', 'circus', 'walrus', 'octopus',
        'cactus', 'gas', 'plus', 'bonus'
    ]);
    const UNCOUNTABLE = new Set([
        'water', 'milk', 'juice', 'rice', 'bread', 'cheese', 'butter', 'sand',
        'money', 'weather', 'homework', 'furniture', 'food', 'soup', 'tea', 'coffee'
    ]);
    // Tiny / decorative labels that make poor circle targets on their own
    const SKIP_HOTSPOTS = new Set([
        'cloud', 'splash', 'flame', 'headlight', 'weather vane', 'streamer',
        'rock', 'bee', 'lily pad', 'bow tie', 'necklace', 'collar', 'flag',
        'glasses', 'goggles', 'sunglasses', 'cap', 'helmet', 'hat', 'apron',
        'boot', 'boots', 'shoes', 'sandals', 'socks', 'sock', 'mittens',
        'wheel', 'tap', 'towel', 'soap', 'toothpaste', 'toothbrush',
        'spoon', 'fork', 'knife', 'spatula', 'cup', 'mug', 'glass', 'bowl',
        'plate', 'pitcher', 'tray', 'basket', 'box', 'bag', 'money',
        'egg', 'lemon', 'strawberry', 'tomato', 'onion', 'potato', 'carrot',
        'pepper', 'cucumber', 'orange', 'apple', 'cookie', 'cupcake',
        'shell', 'starfish', 'crab', 'snail', 'mushroom', 'flower', 'flowers',
        'tulip', 'butterfly', 'bird', 'frisbee', 'paintbrush', 'binoculars'
    ]);
    const MIN_HOTSPOT_AREA = 0.012;

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

    function hotspotArea(hs) {
        const b = hs && hs.b;
        if (!b || b.length < 4) return 0;
        return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
    }

    function article(word) {
        const w = String(word || '').toLowerCase().replace(/^(a|an|the|some)\s+/, '');
        return /^[aeiou]/.test(w) ? 'an' : 'a';
    }

    function personPronoun(word) {
        const w = String(word || '').toLowerCase();
        if (FEMALE.has(w)) return 'She';
        if (MALE.has(w)) return 'He';
        return null;
    }

    function isPerson(word) {
        return PEOPLE.has(String(word || '').toLowerCase());
    }

    function isPluralNoun(word) {
        const w = String(word || '').toLowerCase().trim();
        if (!w) return false;
        if (ALWAYS_PLURAL.has(w)) return true;
        if (SINGULAR_S.has(w) || UNCOUNTABLE.has(w) || isPerson(w)) return false;
        const last = w.split(/\s+/).pop();
        if (ALWAYS_PLURAL.has(last)) return true;
        if (SINGULAR_S.has(last)) return false;
        // Regular plurals (flowers, grapes) — not bus/dress/glass
        if (/s$/i.test(last) && !/(ss|us|is|oes|xes)$/i.test(last) && last.length > 3) return true;
        if (/(ches|shes|xes|zes|oes)$/i.test(last)) return true;
        return false;
    }

    function isUncountableNoun(word) {
        return UNCOUNTABLE.has(String(word || '').toLowerCase().trim());
    }

    /** Object noun phrase after verbs like see/have/like — grammatically safe. */
    function withArticle(word) {
        const w = String(word || '').toLowerCase().trim();
        if (!w) return w;
        if (isPluralNoun(w) || isUncountableNoun(w)) return 'the ' + w;
        return article(w) + ' ' + w;
    }

    /** Predicate after be (It is / They are …). */
    function beComplement(word) {
        const w = String(word || '').toLowerCase().trim();
        if (!w) return w;
        if (isPluralNoun(w)) return w; // They are stairs.
        if (isUncountableNoun(w)) return w; // It is water.
        return article(w) + ' ' + w; // It is a desk.
    }

    function beSubject(word) {
        return isPluralNoun(word) ? 'They' : 'It';
    }

    function beVerb(word) {
        return isPluralNoun(word) ? 'are' : 'is';
    }

    /** Reject clear article/number mistakes (e.g. "It is a stairs"). */
    function isClearlyUngrammatical(answer, hotspotWord) {
        const n = normalize(answer);
        if (!n) return false;
        const w = String(hotspotWord || '').toLowerCase().trim();
        // a/an + known plural noun anywhere
        for (const pl of ALWAYS_PLURAL) {
            if (new RegExp(`\\b(a|an)\\s+${pl.replace(/\s+/g, '\\s+')}\\b`).test(n)) return true;
        }
        if (w && isPluralNoun(w)) {
            const wRe = w.replace(/\s+/g, '\\s+');
            if (new RegExp(`\\b(a|an)\\s+${wRe}\\b`).test(n)) return true;
            if (new RegExp(`\\b(it\\s+is|it's|this\\s+is)\\s+(a|an)\\s+${wRe}\\b`).test(n)) return true;
            if (new RegExp(`\\bit\\s+is\\s+${wRe}\\b`).test(n) && !new RegExp(`\\bit\\s+is\\s+the\\s+${wRe}\\b`).test(n)) {
                // "It is stairs" is weak; prefer they/these — still allow "it is the stairs"
                if (!/\bthe\b/.test(n)) return true;
            }
        }
        if (w && isUncountableNoun(w)) {
            const wRe = w.replace(/\s+/g, '\\s+');
            if (new RegExp(`\\b(a|an)\\s+${wRe}\\b`).test(n)) return true;
        }
        return false;
    }

    function tilesFromAnswer(answer) {
        return String(answer || '')
            .replace(/([.?!,])/g, ' $1 ')
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(Boolean);
    }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function eligibleHotspots(sceneId) {
        return hotspotsForScene(sceneId)
            .filter((h) => h && h.w && h.b)
            .filter((h) => !SKIP_HOTSPOTS.has(String(h.w).toLowerCase()))
            .filter((h) => hotspotArea(h) >= MIN_HOTSPOT_AREA)
            .sort((a, b) => hotspotArea(b) - hotspotArea(a));
    }

    function grammarCard(grammar, word) {
        const w = String(word || '').toLowerCase();
        const obj = withArticle(w); // the stairs / a desk / the water
        const pred = beComplement(w); // stairs / a desk / water
        const subj = beSubject(w); // They / It
        const verb = beVerb(w); // are / is
        const pron = personPronoun(w);
        const person = isPerson(w);
        const plural = isPluralNoun(w);

        if (grammar === 'be') {
            if (pron) {
                return {
                    promptEn: 'Who is in the red circle? Use to be.',
                    promptPl: 'Kto jest w czerwonym kółku? Użyj to be.',
                    answer: pron + ' is ' + obj + '.',
                    accept: [pron + "'s " + obj + '.', 'This is ' + obj + '.']
                };
            }
            if (person) {
                return {
                    promptEn: 'Who is in the red circle? Use to be.',
                    promptPl: 'Kto jest w czerwonym kółku? Użyj to be.',
                    answer: 'This is ' + obj + '.',
                    accept: ['It is ' + obj + '.', "It's " + obj + '.']
                };
            }
            if (plural) {
                return {
                    promptEn: 'What is in the red circle? Use to be.',
                    promptPl: 'Co jest w czerwonym kółku? Użyj to be.',
                    answer: 'They are ' + pred + '.',
                    accept: [
                        'These are ' + pred + '.',
                        'Those are ' + pred + '.',
                        'It is the ' + w + '.',
                        "It's the " + w + '.'
                    ]
                };
            }
            return {
                promptEn: 'What is in the red circle? Use to be.',
                promptPl: 'Co jest w czerwonym kółku? Użyj to be.',
                answer: subj + ' ' + verb + ' ' + pred + '.',
                accept: ["It's " + pred + '.', 'This is ' + pred + '.']
            };
        }

        if (grammar === 'have_got') {
            if (person) return null;
            return {
                promptEn: 'Talk about the circled thing with have got.',
                promptPl: 'Powiedz o zakreślonej rzeczy używając have got.',
                answer: 'I have got ' + obj + '.',
                accept: ["I've got " + obj + '.', 'I have ' + obj + '.']
            };
        }

        if (grammar === 'can') {
            return {
                promptEn: 'Look at the circle. Say what you can see (use can).',
                promptPl: 'Spójrz na kółko. Powiedz, co możesz zobaczyć (użyj can).',
                answer: 'I can see ' + obj + '.',
                accept: ['I can see the ' + w + '.']
            };
        }

        if (grammar === 'like') {
            return {
                promptEn: 'Do you like the circled thing? Answer with like.',
                promptPl: 'Czy lubisz to, co jest w kółku? Odpowiedz z like.',
                answer: 'I like the ' + w + '.',
                accept: plural || isUncountableNoun(w) ? ['I like ' + w + '.'] : ['I like ' + obj + '.']
            };
        }

        if (grammar === 'present_simple') {
            return {
                promptEn: 'Look at the circle. Make a present simple sentence with see.',
                promptPl: 'Spójrz na kółko. Zrób zdanie w present simple z see.',
                answer: 'I see ' + obj + '.',
                accept: ['I see the ' + w + '.']
            };
        }

        if (grammar === 'negatives') {
            if (person && pron) {
                const base = pron + ' is ' + obj + '.';
                return {
                    promptEn: 'Make it negative: ' + base,
                    promptPl: 'Zrób przeczenie: ' + base,
                    answer: pron + ' is not ' + obj + '.',
                    accept: [pron + " isn't " + obj + '.'],
                    transformFrom: base,
                    transformTo: 'negative'
                };
            }
            const base = subj + ' ' + verb + ' ' + pred + '.';
            return {
                promptEn: 'Make it negative: ' + base,
                promptPl: 'Zrób przeczenie: ' + base,
                answer: subj + ' ' + verb + ' not ' + pred + '.',
                accept: plural
                    ? ["They aren't " + pred + '.', "These aren't " + pred + '.', 'These are not ' + pred + '.']
                    : ["It isn't " + pred + '.', "It's not " + pred + '.'],
                transformFrom: base,
                transformTo: 'negative'
            };
        }

        if (grammar === 'questions') {
            if (person && pron) {
                const base = pron + ' is ' + obj + '.';
                return {
                    promptEn: 'Make a question: ' + base,
                    promptPl: 'Zrób pytanie: ' + base,
                    answer: 'Is ' + pron.toLowerCase() + ' ' + obj + '?',
                    accept: [],
                    transformFrom: base,
                    transformTo: 'question'
                };
            }
            const base = subj + ' ' + verb + ' ' + pred + '.';
            return {
                promptEn: 'Make a question: ' + base,
                promptPl: 'Zrób pytanie: ' + base,
                answer: plural ? ('Are they ' + pred + '?') : ('Is it ' + pred + '?'),
                accept: plural ? ['Are these ' + pred + '?', 'Are those ' + pred + '?'] : [],
                transformFrom: base,
                transformTo: 'question'
            };
        }

        return null;
    }

    function distractorsForWord(sceneId, word, grammar, answer) {
        const others = eligibleHotspots(sceneId)
            .map((h) => String(h.w).toLowerCase())
            .filter((w) => w !== String(word).toLowerCase());
        const uniq = [...new Set(others)];
        const out = [];
        for (const alt of shuffle(uniq).slice(0, 8)) {
            const card = grammarCard(grammar, alt);
            if (!card || card.answer === answer) continue;
            out.push(card.answer);
            if (out.length >= 3) break;
        }
        return out;
    }

    function picturePoolSize(topicId, grammar) {
        let n = 0;
        scenesForTopic(topicId).forEach((src) => {
            const id = sceneIdFromSrc(src);
            eligibleHotspots(id).forEach((h) => {
                if (grammarCard(grammar, h.w)) n += 1;
            });
        });
        return n;
    }

    function buildPictureTask(topicId, grammar) {
        const scenes = scenesForTopic(topicId);
        if (!scenes.length) return null;

        const candidates = [];
        scenes.forEach((src) => {
            const id = sceneIdFromSrc(src);
            const hs = eligibleHotspots(id);
            const pool = hs.slice(0, Math.max(6, Math.ceil(hs.length * 0.55)));
            pool.forEach((h) => {
                const card = grammarCard(grammar, h.w);
                if (!card) return;
                candidates.push({ src, id, h, card });
            });
        });
        if (!candidates.length) return null;

        const fresh = candidates.filter((c) => {
            const tid = 'pic-' + c.id + '-' + c.h.w + '-' + grammar;
            return !state.usedIds.includes(tid);
        });
        const list = fresh.length ? fresh : candidates;
        if (!fresh.length) {
            state.usedIds = state.usedIds.filter((x) => !String(x).startsWith('pic-'));
        }
        const pick = list[Math.floor(Math.random() * list.length)];
        const word = String(pick.h.w).toLowerCase();
        const id = 'pic-' + pick.id + '-' + word + '-' + grammar;
        const answer = pick.card.answer;
        return {
            id,
            topic: topicId,
            grammar,
            modeHints: ['picture', 'speak'],
            cue: '🔍',
            promptEn: pick.card.promptEn,
            promptPl: pick.card.promptPl,
            answer,
            accept: pick.card.accept || [],
            speakPromptEn: 'Say: ' + answer,
            speakPromptPl: 'Powiedz: ' + answer,
            distractors: distractorsForWord(pick.id, word, grammar, answer),
            tiles: tilesFromAnswer(answer),
            transformFrom: pick.card.transformFrom || null,
            transformTo: pick.card.transformTo || null,
            pairCueEn: null,
            pairCuePl: null,
            hotspotWord: word,
            cueImg: cueImgForText(word),
            sceneSrc: pick.src,
            sceneId: pick.id,
            highlightBoxes: [{ w: pick.h.w, b: pick.h.b }],
            spotSay: true
        };
    }

    function t(en, pl) {
        return state.lang === 'pl' ? (pl || en) : en;
    }

    function cueImgForText(text) {
        if (typeof global.peTopicChallengeCueImg === 'function') {
            return global.peTopicChallengeCueImg(text);
        }
        return null;
    }

    function taskCueHtml(task) {
        const img = task.cueImg || cueImgForText(task.hotspotWord || task.answer || task.promptEn);
        if (img) {
            return `<div class="tc-cue tc-cue-img-wrap"><img class="tc-cue-img" src="${escapeAttr(img)}" alt="" loading="lazy"></div>`;
        }
        if (task.cue) {
            return `<div class="tc-cue" aria-hidden="true">${task.cue}</div>`;
        }
        return '';
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
.tc-cue-img-wrap { font-size: 0; }
.tc-cue-img { width: min(112px, 34vw); height: auto; display: inline-block; vertical-align: middle; }
.tc-scene + .tc-cue-img-wrap .tc-cue-img { width: min(92px, 26vw); }
.tc-scene { margin: 0 0 0.9rem; border-radius: 0.75rem; overflow: visible; border: 1px solid #e2e8f0; background: #f8fafc; }
.tc-scene-frame { width: 100%; background: #f1f5f9; display: flex; justify-content: center; align-items: flex-start; padding: 0.5rem; }
.tc-scene-stage { position: relative; display: block; width: 100%; max-width: 960px; line-height: 0; margin: 0 auto; }
.tc-scene-stage img { display: block; width: 100%; height: auto; max-width: 100%; max-height: none; object-fit: contain; }
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
        if (isClearlyUngrammatical(user, task && task.hotspotWord)) return false;
        const opts = [task.answer].concat(task.accept || []);
        return opts.some((a) => normalize(a) === n);
    }

    function filterPool(mode) {
        const m = mode || state.mode;
        if (m === 'picture') return []; // picture uses Spot & Say builder, not the bank
        return bank().filter((item) => {
            if (item.topic !== state.topic || item.grammar !== state.grammar) return false;
            const hints = item.modeHints || [];
            if (m === 'transform') return hints.includes('transform') && item.transformFrom;
            if (m === 'tiles') {
                return (hints.includes('tiles') || hints.includes('transform') || hints.includes('picture'))
                    && Array.isArray(item.tiles) && item.tiles.length >= 2;
            }
            return false;
        });
    }

    function availableModes() {
        const modes = [];
        if (picturePoolSize(state.topic, state.grammar) > 0) modes.push('picture');
        if (filterPool('tiles').length) modes.push('tiles');
        if (filterPool('transform').length) modes.push('transform');
        return modes;
    }

    function ensureValidMode() {
        if (state.mode === 'text') state.mode = 'picture';
        const modes = availableModes();
        if (!modes.length) return;
        if (!modes.includes(state.mode)) state.mode = modes[0];
    }

    function pickTask() {
        ensureValidMode();
        if (state.mode === 'picture') {
            const task = buildPictureTask(state.topic, state.grammar);
            if (task) {
                state.usedIds.push(task.id);
                return task;
            }
            const modes = availableModes().filter((m) => m !== 'picture');
            if (modes.length) state.mode = modes[0];
            else return null;
        }
        let pool = filterPool(state.mode);
        if (!pool.length) {
            const modes = availableModes();
            for (const m of modes) {
                if (m === 'picture') {
                    const task = buildPictureTask(state.topic, state.grammar);
                    if (task) {
                        state.mode = 'picture';
                        state.usedIds.push(task.id);
                        return task;
                    }
                    continue;
                }
                pool = filterPool(m);
                if (pool.length) {
                    state.mode = m;
                    break;
                }
            }
        }
        if (!pool.length) return null;
        const fresh = pool.filter((i) => !state.usedIds.includes(i.id));
        const list = fresh.length ? fresh : pool;
        if (!fresh.length) state.usedIds = state.usedIds.filter((x) => String(x).startsWith('pic-'));
        const task = list[Math.floor(Math.random() * list.length)];
        state.usedIds.push(task.id);
        return task;
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
        const cueHtml = taskCueHtml(task);
        if (state.mode === 'picture') {
            if (state.sceneSrc) {
                const hasFocus = (state.highlightBoxes || []).length > 0;
                const caption = hasFocus
                    ? t('Answer only about the red circle', 'Odpowiedz tylko o czerwonym kółku')
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
                if (cueHtml) body += cueHtml;
            } else if (cueHtml) {
                body += cueHtml;
            }
        } else if (cueHtml) {
            body += cueHtml;
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
        } else if (state.mode === 'picture' || state.mode === 'transform') {
            const useMcq = state.mode === 'picture' && (task.distractors || []).length >= 2 && Math.random() < 0.35 && !state._forceType;
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
            <button type="button" class="btn btn-blue" id="tc-check" ${state.checked || state.aiChecking ? 'disabled' : ''}><i class="fa-solid fa-check"></i> ${t('Check', 'Sprawdź')}</button>
            <button type="button" class="btn btn-outline" id="tc-new"><i class="fa-solid fa-rotate"></i> ${t('New task', 'Nowe zadanie')}</button>
            <button type="button" class="btn btn-outline tc-lang-toggle" id="tc-lang">${state.lang === 'en' ? 'PL' : 'EN'}</button>
            <button type="button" class="btn btn-outline" id="tc-why" style="display:none;"><i class="fa-solid fa-robot"></i> ${t('Ask why', 'Dopytaj AI')}</button>
        </div>
        <div class="tc-feedback" id="tc-feedback"></div>
        <div class="tc-why" id="tc-why-box" hidden></div>`;

        const modeTabs = availableModes().map((m) => {
            const labels = {
                picture: t('Picture', 'Obrazek'),
                tiles: t('Tiles', 'Kafelki'),
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
            if (state.checked || state.aiChecking) return;
            if (!state.speakHeard) {
                if (fb) {
                    fb.className = 'tc-feedback info';
                    fb.textContent = t('Hear the model first, then say it and tap I said it.', 'Najpierw posłuchaj wzoru, potem powiedz i kliknij Powiedziałem/am.');
                }
                return;
            }
            state.speakOk = true;

            // Tiles: validate (prefer built sentence; else accept spoken self-check), then auto-advance.
            if (state.mode === 'tiles') {
                const tiles = state.task && Array.isArray(state.task.tiles) ? state.task.tiles : [];
                const user = getUserAnswer();
                const built = normalize(user);
                const target = normalize(tiles.join(' '));
                const hasBuild = state.tileOrder.length > 0;
                let ok = !hasBuild; // empty build → honour spoken model after Hear
                let soft = !hasBuild;
                if (hasBuild) {
                    ok = built === target || answersMatch(user.replace(/\s+([.?!,])/g, '$1'), state.task);
                    soft = false;
                }
                if (ok) {
                    if (!hasBuild && tiles.length) {
                        state.tileOrder = tiles.map((_, i) => i);
                        const build = root.querySelector('#tc-build');
                        if (build) {
                            build.innerHTML = state.tileOrder.map((idx) => {
                                const word = tiles[idx];
                                const color = TILE_COLORS[idx % TILE_COLORS.length];
                                return `<button type="button" class="tc-tile" data-built="${idx}" style="background:${color}">${escapeHtml(word)}</button>`;
                            }).join('');
                        }
                    }
                    finishCorrect(
                        soft
                            ? t('Nice speaking! Next task…', 'Świetnie! Następne zadanie…')
                            : t('Correct! Next task…', 'Dobrze! Następne zadanie…'),
                        soft
                    );
                    scheduleNextRound();
                } else {
                    markPictureWrong(user);
                }
                return;
            }

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
        if (input) return String(input.value || '').trim();
        return '';
    }

    async function sceneImagePayload() {
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
        const img = rootEl()?.querySelector('#tc-scene-img');
        if (img && img.complete && img.naturalWidth) {
            try {
                const payload = draw(img);
                if (payload) return payload;
            } catch { /* fall through */ }
        }
        if (!state.sceneSrc) return null;
        try {
            const el = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = () => reject(new Error('scene load'));
                i.src = state.sceneSrc;
            });
            return draw(el);
        } catch {
            return null;
        }
    }

    function markPictureWrong(user, whyExtra) {
        state.checked = true;
        state.streak = 0;
        const root = rootEl();
        const fb = root?.querySelector('#tc-feedback');
        const whyBtn = root?.querySelector('#tc-why');
        if (fb) {
            fb.className = 'tc-feedback bad';
            const extra = whyExtra ? (' ' + whyExtra) : '';
            fb.textContent = t('Not quite. Model: ', 'Niezupełnie. Wzór: ') + state.task.answer + extra;
        }
        if (whyBtn) whyBtn.style.display = '';
        root?.querySelectorAll('[data-mcq]').forEach((btn) => {
            const v = btn.getAttribute('data-mcq');
            if (answersMatch(v, state.task)) btn.classList.add('correct');
            else if (v === state.chosenMcq) btn.classList.add('wrong');
        });
        if (typeof global.recordGameSessionApi === 'function') {
            global.recordGameSessionApi('pe_topic', { score: 0, pointsEarned: 0 });
        }
    }

    async function challengePictureWithAi(user) {
        const root = rootEl();
        const fb = root?.querySelector('#tc-feedback');
        const checkBtn = root?.querySelector('#tc-check');
        if (typeof global.fetchGenerativeAI !== 'function') {
            markPictureWrong(user);
            return;
        }
        state.aiChecking = true;
        if (checkBtn) checkBtn.disabled = true;
        if (fb) {
            fb.className = 'tc-feedback info';
            fb.textContent = t('Close — checking with AI if your reading of the picture also works…', 'Prawie — AI sprawdza, czy Twoje odczytanie obrazka też pasuje…');
        }

        const accept = (state.task.accept || []).join(' | ') || '(none)';
        const focusNote = (state.highlightBoxes || []).length
            ? 'A region of the picture is circled/highlighted — judge that focus mainly.'
            : 'Judge the whole scene.';
        const prompt = `Primary English Topic Challenge — Spot & Say judge for ages 9–11 (CEFR A1–A2).
Return ONLY valid JSON: {"ok":true|false,"reasonEn":"one short sentence","reasonPl":"one short Polish sentence"}

Student grammar focus: ${state.grammar}
Topic: ${state.topic}
Prompt: ${state.task.promptEn}
Circled hotspot label (author key): ${state.task.hotspotWord || '(unknown)'}
Model key answer: ${state.task.answer}
Also listed as accept: ${accept}
Student answer: ${user}
${focusNote}

Rules:
- The red circle marks one hotspot. The model answer names that hotspot with the selected grammar.
- Accept ok=true ONLY when grammar is fully correct for PE A1–A2 AND the student fairly names the same circled thing (synonyms OK: woman/mum/sister, boy/brother, bag/backpack, etc.).
- REJECT ungrammatical article/number mistakes even if the object is right. Examples of REJECT: "It is a stairs", "This is a jeans", "It is a glasses", "I have got a shoes", "a scissors". For plural nouns use they/these/those are … or the … — never a/an + plural.
- Reject answers about a different object than the circle, or wrong grammar for this focus.
- Keep reasons kind and very short.`;

        const images = [];
        const scene = await sceneImagePayload();
        if (scene) images.push(scene);

        let data = null;
        try {
            data = await global.fetchGenerativeAI(prompt, images);
        } catch {
            data = null;
        }
        state.aiChecking = false;
        if (state.checked) return; // new round meanwhile

        if (!data || data.__error) {
            markPictureWrong(user);
            return;
        }
        if ((data.ok === true || data.ok === 'true')
            && !isClearlyUngrammatical(user, state.task.hotspotWord)) {
            const note = state.lang === 'pl'
                ? (data.reasonPl || data.reasonEn || '')
                : (data.reasonEn || data.reasonPl || '');
            const msg = note
                ? t('Good reading of the picture! ', 'Dobre odczytanie obrazka! ') + note
                : t('Good reading of the picture — that works too!', 'Dobre odczytanie obrazka — to też pasuje!');
            finishCorrect(msg, false);
            return;
        }
        if ((data.ok === true || data.ok === 'true')
            && isClearlyUngrammatical(user, state.task.hotspotWord)) {
            markPictureWrong(user, t(
                ' — Check a/an and singular/plural (e.g. They are stairs — not It is a stairs).',
                ' — Sprawdź a/an oraz liczbę (np. They are stairs — nie It is a stairs).'
            ));
            return;
        }
        const tip = state.lang === 'pl'
            ? (data.reasonPl || data.reasonEn || '')
            : (data.reasonEn || data.reasonPl || '');
        markPictureWrong(user, tip ? (' — ' + tip) : '');
    }

    async function checkAnswer() {
        if (!state.task || state.checked || state.aiChecking) return;
        const root = rootEl();
        const fb = root?.querySelector('#tc-feedback');
        const whyBtn = root?.querySelector('#tc-why');

        if (state.response === 'speak') {
            // Prefer recognition result; else require I said it after hear
            if (state.lastTranscript && answersMatch(state.lastTranscript, state.task)) {
                finishCorrect(t('Great speaking!', 'Świetne mówienie!'), false);
                return;
            }
            if (state.mode === 'picture' && state.lastTranscript && !state._useMcq) {
                await challengePictureWithAi(state.lastTranscript);
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
        if (state.mode === 'tiles') {
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
            return;
        }

        // Picture free-text: AI may accept a fair alternate reading of the scene.
        if (state.mode === 'picture' && !state._useMcq && user) {
            await challengePictureWithAi(user);
            return;
        }

        markPictureWrong(user);
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
Explain in simple English (max 3 short sentences) why the model is right and what to fix. If mode is picture, note that another fair reading of the person/object can sometimes also be OK when grammar is correct — but explain this attempt. Then one Polish sentence summary. No new examples beyond the model answer.`;
        const data = await global.fetchGenerativeAI(prompt);
        if (btn) btn.disabled = false;
        if (!data || data.__error) {
            box.textContent = (data && data.__error) || t('Could not get help.', 'Nie udało się uzyskać pomocy.');
            return;
        }
        const text = data.text || data.content || data.message || JSON.stringify(data);
        box.textContent = typeof text === 'string' ? text : String(text);
    }

    function scheduleNextRound(delayMs) {
        if (advanceTimer) {
            clearTimeout(advanceTimer);
            advanceTimer = null;
        }
        const ms = delayMs == null ? 1100 : delayMs;
        const token = state.task && state.task.id;
        advanceTimer = setTimeout(() => {
            advanceTimer = null;
            // Only advance if we are still on the same completed task
            if (state.checked && state.task && state.task.id === token) newRound();
        }, ms);
    }

    function newRound() {
        stopListening();
        if (advanceTimer) {
            clearTimeout(advanceTimer);
            advanceTimer = null;
        }
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
        state._forceType = false;
        state.aiChecking = false;
        state.sceneSrc = null;
        state.sceneId = null;
        state.highlightBoxes = [];
        if (state.task && state.task.spotSay) {
            state.sceneSrc = state.task.sceneSrc;
            state.sceneId = state.task.sceneId;
            state.highlightBoxes = state.task.highlightBoxes || [];
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
        getState() { return Object.assign({}, state); },
        buildPictureTask,
        picturePoolSize
    };
})(typeof window !== 'undefined' ? window : globalThis);

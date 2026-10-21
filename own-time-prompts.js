/**
 * Server-owned prompts for "In your own time" practice lessons.
 */

const CEFR_OK = new Set(['A0', 'A1', 'A2', 'B1', 'B2', 'C1']);
const INTENSITY_OK = new Set(['light', 'standard', 'stretch']);
const TASK_OK = new Set(['writing', 'drill', 'uoe', 'reading', 'vocab']);

/** Max "Keep going" extra practice sets per student per day (Europe/Warsaw day). */
export const OWN_TIME_EXTRA_DAILY_LIMIT = 3;

/** Context sent with an extra set, built from the lesson just finished (for prompt + storage). */
export function buildOwnTimeExtraContext(lesson, answers = {}) {
    const avoid = [];
    const weak = [];
    (lesson?.tasks || []).forEach((t, i) => {
        const a = answers[`t${i}`] || {};
        (t.items || []).forEach((it, j) => {
            if (it.answer) avoid.push(String(it.answer));
            if (it.q) avoid.push(String(it.q).slice(0, 80));
            const given = String((a.items || [])[j] || '').trim().toLowerCase();
            const ok = [it.answer, ...(it.alts || [])].map((x) => String(x || '').trim().toLowerCase());
            if (it.answer && !ok.includes(given)) weak.push(`${it.q} → ${it.answer}${given ? ` (wrote: ${given})` : ' (blank)'}`);
        });
    });
    return { previousTitle: lesson?.title || '', focus: lesson?.focus || '', avoid: avoid.slice(0, 40), weak: weak.slice(0, 12) };
}

export function validateOwnTimeGenerateRequest(body = {}) {
    const profile = body.profile && typeof body.profile === 'object' ? body.profile : null;
    if (!profile) return { ok: false, error: 'Profile is required.' };

    const cefr = String(profile.cefr || 'A2').toUpperCase();
    if (!CEFR_OK.has(cefr)) return { ok: false, error: 'Invalid CEFR level.' };

    let intensity = String(profile.intensity || 'standard').toLowerCase();
    if (!INTENSITY_OK.has(intensity)) intensity = 'standard';

    const instrLang = profile.instrLang === 'en' ? 'en' : 'pl';
    const age = Number(profile.age);
    const taskPrefs = (Array.isArray(profile.taskPrefs) ? profile.taskPrefs : [])
        .map((t) => String(t || '').toLowerCase())
        .filter((t) => TASK_OK.has(t));
    const interests = (Array.isArray(profile.interests) ? profile.interests : [])
        .map((s) => String(s || '').trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 12);

    const topic = String(body.topic != null ? body.topic : profile.topic || '').trim().slice(0, 200);
    const vocab = String(body.vocab != null ? body.vocab : profile.vocab || '').trim().slice(0, 2000);
    const recentFeedback = Array.isArray(body.recentFeedback)
        ? body.recentFeedback.slice(0, 2)
        : [];
    const extra = body.extra === true;
    const ctx = body.extraContext && typeof body.extraContext === 'object' ? body.extraContext : {};
    const strs = (arr, max, len) => (Array.isArray(arr) ? arr : [])
        .map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, len)).filter(Boolean).slice(0, max);
    const extraContext = extra ? {
        previousTitle: String(ctx.previousTitle || '').trim().slice(0, 120),
        focus: String(ctx.focus || '').trim().slice(0, 80),
        avoid: strs(ctx.avoid, 40, 80),
        weak: strs(ctx.weak, 12, 160),
        setNumber: Math.max(1, Math.min(OWN_TIME_EXTRA_DAILY_LIMIT, Number(ctx.setNumber) || 1)),
    } : null;

    return {
        ok: true,
        value: {
            age: Number.isFinite(age) ? age : null,
            classLabel: String(profile.classLabel || '').trim().slice(0, 80),
            cefr,
            interests,
            taskPrefs: taskPrefs.length ? taskPrefs : ['writing', 'vocab'],
            purpose: String(profile.purpose || '').trim().slice(0, 200),
            intensity,
            instrLang,
            topic,
            vocab,
            recentFeedback,
            extra,
            extraContext,
        },
    };
}

/** Writing length by CEFR (keeps the original "2–6 sentences depending on level" rule). */
export const WRITING_TARGETS = {
    A0: { sentences: [2, 3], words: [15, 30] },
    A1: { sentences: [2, 3], words: [20, 40] },
    A2: { sentences: [3, 4], words: [35, 60] },
    B1: { sentences: [4, 5], words: [60, 90] },
    B2: { sentences: [5, 6], words: [90, 120] },
    C1: { sentences: [5, 6], words: [110, 150] },
};

export function writingTarget(cefr) {
    return WRITING_TARGETS[String(cefr || '').toUpperCase()] || WRITING_TARGETS.A2;
}

/** Every lesson and every "Keep going" extra set has 5–6 tasks (no time frame). */
export const OWN_TIME_TASKS_MIN = 5;
export const OWN_TIME_TASKS_MAX = 6;

/**
 * Use of English formats modelled on CKE exam papers (Informator o egzaminie ósmoklasisty z j. angielskiego
 * od 2024/2025; Informator o egzaminie maturalnym z j. angielskiego od 2024/2025 — PP, PR, poziom dwujęzyczny).
 * kind: mc = closed (options), open = typed answer. text: gaps live in the task prompt as {{n}}.
 */
export const UOE_FORMATS = {
    simple: { kind: 'open', name: 'Proste luki', instr: '' },
    mc_sentences: { kind: 'mc', name: 'Wybór wielokrotny — zdania', instr: 'Wybierz właściwą odpowiedź spośród podanych, tak aby otrzymać logiczne i gramatycznie poprawne zdania.' },
    mc_dialogue: { kind: 'mc', name: 'Wybór wielokrotny — minidialogi', instr: 'Przeczytaj dialogi. Wybierz właściwą odpowiedź spośród podanych, tak aby otrzymać logiczne i poprawne językowo wypowiedzi.' },
    mc_translation: { kind: 'mc', needsPl: true, name: 'Tłumaczenie fragmentu — wybór', instr: 'Wybierz właściwą odpowiedź spośród podanych, tak aby otrzymać poprawne tłumaczenie fragmentu podanego w nawiasie.' },
    mc_text: { kind: 'mc', text: true, name: 'Tekst z lukami — wybór wielokrotny', instr: 'Przeczytaj tekst. Wybierz właściwą odpowiedź spośród podanych, tak aby otrzymać logiczny, spójny i poprawny językowo tekst.' },
    two_sentences: { kind: 'mc', name: 'Jeden wyraz do dwóch zdań', instr: 'Wybierz wyraz, który poprawnie uzupełnia luki w obu zdaniach.' },
    brackets: { kind: 'open', cue: true, name: 'Wyrazy z nawiasu w odpowiedniej formie', instr: 'Uzupełnij zdania. Wpisz w każdą lukę wyrazy podane w nawiasach w odpowiedniej formie. Jeśli to konieczne, dodaj inne wyrazy, tak aby otrzymać logiczne i gramatycznie poprawne zdania. W każdą lukę możesz wpisać maksymalnie trzy wyrazy, wliczając w to wyrazy już podane.' },
    translation: { kind: 'open', needsPl: true, name: 'Tłumaczenie fragmentów zdań', instr: 'Przetłumacz na język angielski fragmenty podane w nawiasach, tak aby otrzymać logiczne i gramatycznie poprawne zdania. Wymagana jest pełna poprawność ortograficzna wpisywanych fragmentów.' },
    word_formation: { kind: 'open', text: true, cue: true, name: 'Słowotwórstwo', instr: 'Przeczytaj tekst. Uzupełnij każdą lukę, przekształcając wyraz podany w nawiasie, tak aby otrzymać logiczny, spójny i poprawny językowo tekst. W każdą lukę możesz wpisać tylko jeden wyraz.' },
    open_cloze: { kind: 'open', text: true, name: 'Tekst z lukami (open cloze)', instr: 'Przeczytaj tekst. Uzupełnij każdą lukę jednym wyrazem, tak aby otrzymać logiczny, spójny i poprawny gramatycznie tekst.' },
    transformation: { kind: 'open', needsKey: true, name: 'Transformacje (parafrazy)', instr: 'Uzupełnij każde zdanie, wykorzystując wyraz podany wielkimi literami, tak aby zachować znaczenie zdania wyjściowego. Nie zmieniaj formy podanego wyrazu. W każdą lukę możesz wpisać maksymalnie pięć wyrazów, wliczając w to wyraz już podany.' },
    lexical_set: { kind: 'open', name: 'Set leksykalny (kolokacje)', instr: 'Wpisz jeden wyraz, który poprawnie uzupełnia luki we wszystkich trzech zdaniach. Wyraz musi mieć tę samą formę w każdym zdaniu.' },
};

/** CKE exam mapping per CEFR level (A0/A1: no exam → simple gaps). */
export const UOE_LEVELS = {
    A2: { exam: 'E8', name: 'Egzamin ósmoklasisty', options: 3, open: 'brackets', formats: ['mc_sentences', 'mc_dialogue', 'mc_translation', 'mc_text', 'brackets', 'translation'] },
    B1: { exam: 'MP', name: 'Matura — poziom podstawowy', options: 3, open: 'brackets', formats: ['mc_text', 'mc_sentences', 'two_sentences', 'mc_dialogue', 'brackets', 'translation'] },
    B2: { exam: 'MR', name: 'Matura — poziom rozszerzony', options: 4, open: 'open_cloze', formats: ['word_formation', 'open_cloze', 'transformation', 'translation', 'mc_text'] },
    C1: { exam: 'MD', name: 'Matura — poziom dwujęzyczny', options: 4, open: 'open_cloze', formats: ['open_cloze', 'word_formation', 'transformation', 'translation', 'lexical_set', 'mc_text'] },
};

export function uoeInstruction(format, cefr) {
    const f = UOE_FORMATS[format];
    if (!f || !f.instr) return '';
    const limit = format === 'translation' && ['B2', 'C1'].includes(cefr) ? ' Uwaga: w każdą lukę możesz wpisać maksymalnie pięć wyrazów.' : '';
    return f.instr + limit;
}

export const OWN_TIME_TASK_TYPES = ['vocab_drill', 'uoe', 'reading', 'writing', 'word_order', 'unscramble'];

/** Small deterministic PRNG so the same item always gets the same scramble (stable re-renders, testable). */
function seededShuffle(arr, seedText) {
    let h = 2166136261;
    for (const ch of String(seedText)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
        const j = h % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.length > 1 && out.join('\u0001') === arr.join('\u0001')) out.push(out.shift());
    return out;
}

/** Comparison key: case-, punctuation- and spacing-insensitive (word order + unscramble). */
export function looseKey(s) {
    return String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Word tiles for a sentence: words in order, final punctuation dropped (added back by the app). */
export function sentenceTiles(answer) {
    return String(answer || '').trim().replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean);
}

/** Build a word_order / unscramble item with shuffled tiles; returns null if unusable. */
export function buildTileItem(type, it) {
    const answer = String(it?.answer || '').replace(/\s+/g, ' ').trim();
    if (!answer) return null;
    const alts = (Array.isArray(it?.alts) ? it.alts : []).map((a) => String(a || '').replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, 6);
    const q = String(it?.q || it?.clue || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (type === 'word_order') {
        const words = sentenceTiles(answer);
        if (words.length < 3 || words.length > 12) return null;
        const end = (answer.match(/[.!?]+$/) || ['.'])[0];
        // Don't give the first word away with its capital letter (the app capitalises the built sentence).
        const shown = words.map((w, i) => (i === 0 && w !== 'I' && !/^I'/.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w));
        return { q, answer: answer.slice(0, 200), alts, tiles: seededShuffle(shown, answer), end };
    }
    const word = answer.replace(/[^\p{L}'-]/gu, '');
    if (word.length < 3 || word.length > 12 || /\s/.test(answer)) return null;
    const emoji = String(it?.emoji || '').trim().slice(0, 8);
    return { q, answer: word, alts, emoji, tiles: seededShuffle(word.toLowerCase().split(''), word) };
}



/**
 * Default student guidance per task type (steps + hint; the success checklist was removed), used when the AI leaves a field out
 * (and for lessons generated before guidance existed).
 */
export function defaultGuidance(type, instrLang, cefr) {
    const en = instrLang === 'en';
    const w = writingTarget(cefr);
    const zd = w.sentences[1] <= 4 ? 'zdania' : 'zdań';
    const T = {
        word_order: {
            steps: en
                ? ['Tap the words in the right order (or drag them).', 'Tap a word in your sentence to send it back.', 'Press “Check”.']
                : ['Klikaj słowa we właściwej kolejności (albo je przeciągnij).', 'Kliknij słowo w zdaniu, żeby je cofnąć.', 'Kliknij „Sprawdź”.'],
            hint: en ? 'English sentences usually go: who → does what → what/where → when.' : 'Szyk angielski: kto → co robi → co/gdzie → kiedy.',
        },
        unscramble: {
            steps: en
                ? ['Read the clue.', 'Tap the letters in order — or type the word.', 'Press “Check”.']
                : ['Przeczytaj podpowiedź.', 'Klikaj litery po kolei — albo wpisz słowo.', 'Kliknij „Sprawdź”.'],
            hint: en ? 'Find the first letter, then say the word aloud.' : 'Znajdź pierwszą literę i powiedz słowo na głos.',
        },
        vocab_drill: {
            steps: en
                ? ['Read the example first.', 'Fill in every item — guess if you are not sure.', 'Press “Check”, then fix the red ones.']
                : ['Najpierw przeczytaj przykład.', 'Uzupełnij każdy punkt — jeśli nie wiesz, zgaduj.', 'Kliknij „Sprawdź” i popraw czerwone odpowiedzi.'],
            hint: en ? 'Say the word aloud — it helps you remember the spelling.' : 'Powiedz słowo na głos — łatwiej zapamiętasz pisownię.',
        },
        uoe: {
            steps: en
                ? ['Read the whole sentence before you write.', 'Decide what kind of word fits (verb, noun, adjective…).', 'Write one word per gap, then press “Check”.']
                : ['Przeczytaj całe zdanie, zanim coś wpiszesz.', 'Zastanów się, jakie słowo pasuje (czasownik, rzeczownik, przymiotnik…).', 'Wpisz jedno słowo w lukę i kliknij „Sprawdź”.'],
            hint: en ? 'Look at the words just before and after the gap.' : 'Spójrz na słowa tuż przed luką i tuż po niej.',
        },
        reading: {
            steps: en
                ? ['Read the questions first.', 'Read the text and underline the answers in your head.', 'Answer in short English phrases, then press “Check”.']
                : ['Najpierw przeczytaj pytania.', 'Przeczytaj tekst i znajdź w nim odpowiedzi.', 'Odpowiedz krótko po angielsku i kliknij „Sprawdź”.'],
            hint: en ? 'The answers are in the same order as the questions.' : 'Odpowiedzi są w tekście w tej samej kolejności co pytania.',
        },
        writing: {
            steps: en
                ? ['Plan: write 2–3 key words for your ideas.', `Write ${w.sentences[0]}–${w.sentences[1]} sentences. Use the useful language.`, 'Read it again and check spelling and full stops.']
                : ['Zaplanuj: zapisz 2–3 słowa-klucze z pomysłami.', `Napisz ${w.sentences[0]}–${w.sentences[1]} ${zd}. Użyj przydatnych zwrotów.`, 'Przeczytaj jeszcze raz i sprawdź pisownię oraz kropki.'],
            hint: en ? 'Start with the starter sentence if you are stuck.' : 'Jeśli utkniesz, zacznij od zdania-startera.',
        },
    };
    return T[type] || T.writing;
}

/** The profile "intensity" setting is now DIFFICULTY only (task count is always 5–6). */
function difficultyGuide(intensity) {
    if (intensity === 'light') return 'easier: the lower end of the CEFR band, shorter items, more support.';
    if (intensity === 'stretch') return 'challenge: the upper end of the CEFR band, trickier items.';
    return 'standard: solid practice in the middle of the CEFR band.';
}

function uoeRuleText(cefr, nameLang) {
    const lv = UOE_LEVELS[cefr];
    if (!lv) return `CEFR ${cefr} has no exam mapping: use "format": "simple" — EITHER a short text in "prompt" with {{1}}, {{2}}… gaps (item "q" = cue word or "") OR sentences where each item "q" has ONE "___" exactly where the answer goes (e.g. "She ___ (be) my friend.").`;
    const spec = {
        mc_sentences: `"mc_sentences": 3–5 single sentences (or a sentence + reply); item "q" with ONE "___"; "options": ${lv.options} short choices; "answer" = the correct option text.`,
        mc_dialogue: '"mc_dialogue": 3–4 two-line mini-dialogues ("A: …\nB: ___ …"); "q" with ONE "___"; "options"; "answer" = the option text.',
        mc_translation: `"mc_translation": 3–5 English sentences with ONE "___"; "pl" = the Polish fragment that the gap translates (shown in brackets); "options": ${lv.options} English versions; "answer" = the right one.`,
        mc_text: `"mc_text": a 60–110 word English text in "prompt" with {{1}}…{{n}} gaps (4–5 gaps); each item: "q": "", "options": ${lv.options} choices, "answer" = the option text.`,
        two_sentences: '"two_sentences": 3–4 items; "q" = TWO sentences separated by "\n", each with ONE "___", the same word fits both; "options": 3 words; "answer".',
        brackets: '"brackets": 3–5 sentences; "q" with ONE "___"; "cue" = the word(s) in brackets to use in the right form (e.g. "not / like"); "answer" = the full gap (max 3 words); "alts" = other correct versions (e.g. contractions).',
        translation: `"translation": 3–5 English sentences with ONE "___"; "pl" = the Polish fragment to translate (max ${['B2', 'C1'].includes(cefr) ? 5 : 4} English words); "answer" + "alts" (all correct translations, contractions).`,
        word_formation: '"word_formation": a 70–120 word English text in "prompt" with {{1}}…{{n}} gaps (4–5); each item "cue" = the base word in CAPITALS to transform, "answer" = ONE word, "alts" = other correct forms.',
        open_cloze: '"open_cloze": a 70–120 word English text in "prompt" with {{1}}…{{n}} gaps (4–6); each item "q": "", "answer" = ONE word (grammar/collocation words), "alts".',
        transformation: '"transformation": 3–4 items; "lead" = the original sentence; "key" = ONE given word (shown in capitals, must be used unchanged); "q" = the second sentence with ONE "___" (max 5 words incl. the key word); "answer" + "alts".',
        lexical_set: '"lexical_set": 3 items; "q" = THREE sentences separated by "\n", each with ONE "___"; ONE word (same form) fits all three — collocations/phrasal meanings; "answer" + "alts".',
    };
    return `Use of English must follow the Polish CKE exam (${lv.name}, "znajomość środków językowych") for ${cefr}. Set "format" on every "uoe" task to ONE of: ${lv.formats.join(', ')}. Use 1–2 uoe tasks with DIFFERENT formats; at least one closed (options) and one open format over the lesson when there are two. Keep the exam style but use the session topic/vocabulary. Write "instruction" in Polish in CKE style (the app shows the official wording). Formats:
${lv.formats.map((f) => `    - ${spec[f]}`).join('\n')}`;
}

export function buildOwnTimeLessonPrompt(v) {
    const instrLangName = v.instrLang === 'en' ? 'English' : 'Polish';
    const young = (v.age != null && v.age < 15) || ['A0', 'A1', 'A2'].includes(v.cefr);
    const lowLevel = ['A0', 'A1', 'A2'].includes(v.cefr) || (v.age != null && v.age < 12 && v.cefr !== 'B2' && v.cefr !== 'C1');
    const x = v.extraContext;
    const extraBlock = v.extra && x ? `
EXTRA PRACTICE ("Keep going" set ${x.setNumber} today): the student already finished today's lesson${x.previousTitle ? ` "${x.previousTitle}"` : ''} and wants more.
- Same format, level and rules as below; build on the same topic/focus${x.focus ? ` (${x.focus})` : ''} from a fresh angle.
- Recycle the weak spots below with NEW sentences/items (do not copy them):
${x.weak.length ? x.weak.map((w) => `  * ${w}`).join('\n') : '  * (none recorded — consolidate the same skills)'}
- Do NOT reuse any of these items, answers or texts: ${x.avoid.length ? x.avoid.join(' | ') : '(none)'}
- Use a different title from the previous lesson.
` : '';
    const feedbackBlock = v.recentFeedback.length
        ? `Recent student feedback (adapt level/focus):\n${JSON.stringify(v.recentFeedback)}`
        : 'No prior feedback yet — start gently at the stated level.';

    return `You are a friendly English practice coach for Polish school students (LingoSpark "In your own time").
Create ONE short personalised practice lesson JSON for this student.

STUDENT:
- Age: ${v.age ?? 'unknown'}
- Class / year: ${v.classLabel || 'n/a'}
- CEFR: ${v.cefr}
- Interests: ${v.interests.join(', ') || 'general school topics'}
- Preferred task types: ${v.taskPrefs.join(', ')}
- Why they need English: ${v.purpose || 'school'}
- Difficulty: ${v.intensity} → ${difficultyGuide(v.intensity)}
- Optional topic for this session: ${v.topic || '(invent a fresh topic from interests)'}
- Optional vocabulary to weave in: ${v.vocab || '(none — pick useful words for the topic/level)'}
${feedbackBlock}${extraBlock}

HARD RULES:
1. The lesson has EXACTLY 5 or 6 tasks (never fewer than 5, never more than 6) — also for extra sets. No time limits or minutes anywhere.
2. Practice MATERIAL (reading texts, gap sentences, writing prompts, vocab items) MUST be in English at CEFR ${v.cefr}, suitable for age ${v.age ?? 'teen'}.
3. Every coach-facing string — task "instruction", "coachNote", lesson "title" — MUST be written in ${instrLangName} (${v.instrLang}).
4. ${young
        ? 'Keep instructions VERY short and concrete (e.g. Polish: "Uzupełnij lukę." / "Napisz 2–3 zdania."). No teacher jargon.'
        : 'Keep instructions clear and concise; still avoid dense meta jargon.'}
5. Prefer the student's task types. Allowed types: vocab_drill, uoe, reading, writing, word_order, unscramble (map prefs: vocab/drill→vocab_drill or unscramble, uoe→uoe or word_order, reading→reading, writing→writing).
5a. TASK MIX for the 5–6 tasks: at most ONE writing and at most ONE reading task; 1–2 "uoe" tasks; fill the rest with vocab_drill (and tile tasks for lower levels). Order from easier (vocabulary) to harder (writing last).
5b. LOWER LEVELS: ${lowLevel
        ? `this student is ${v.cefr}${v.age != null ? `, age ${v.age}` : ''} — include ONE–TWO tile tasks ("word_order" and/or "unscramble") within the 5–6 tasks (they count towards the 5–6).`
        : v.cefr === 'B1' ? 'B1: you MAY use one short "word_order" task (tricky word order: adverbs, questions) — optional.' : 'B2+: do NOT use word_order or unscramble.'}
    - "word_order": 3–5 items; each item "answer" = ONE correct English sentence of 4–9 words using the session topic/vocabulary (the app shuffles the words; don't start with a name); "q" = short ${instrLangName} translation or cue (optional); "alts" = other fully correct word orders if any (e.g. moved time phrase).
    - "unscramble": 4–6 items; each "answer" = ONE English word (3–10 letters, from the session vocabulary); "q" = short English clue/definition (or ${instrLangName} translation for A0–A1); "emoji" = one fitting emoji or "".
6. Include modelAnswers or expected answers for closed items so the app can check locally.
7. For reading: short English text (60–120 words) + 2–3 comprehension questions with short answers (1–4 words, in English). A question may be a sentence to complete with ONE "___" gap.
8. For writing: one short prompt (2–6 sentences depending on level).
9. USE OF ENGLISH ("uoe"): ${uoeRuleText(v.cefr)} Never put a gap only at the end as a separate question; text gaps are {{1}}, {{2}}… in order, one per item.
10. For vocab_drill: translate / definition → word / gap sentences with the session vocabulary. Gap sentences use ONE "___" in "q"; definition/translation items put the cue in "q" with no gap. Keep each q under 90 characters so the task fits on one screen.
10b. ONE-SCREEN RULE: each task must fit on one screen — at most 6 items, reading text ≤ 120 words, instructions one short sentence.
11. STUDENT GUIDANCE (every task): the student works ALONE at home, so each task must be self-explanatory.
    - "steps": 2–4 very short numbered actions in ${instrLangName} (what to do first, next, last).
    - "example": ONE worked example in English showing exactly how to answer (for closed items: a solved item that is NOT one of the items).
    - "usefulLanguage": 3–6 English words/phrases/sentence starters at ${v.cefr} that help with THIS task (writing: starters + linking words).
    - "hint": one short tip in ${instrLangName} for when they are stuck.
12. WRITING length at ${v.cefr}: ${writingTarget(v.cefr).sentences[0]}–${writingTarget(v.cefr).sentences[1]} sentences (about ${writingTarget(v.cefr).words[0]}–${writingTarget(v.cefr).words[1]} words); put {"minSentences": n, "maxSentences": n} in "target" and one full model answer in "modelAnswers".
13. Lesson "goal": one sentence in ${instrLangName} starting "Po tej lekcji…" / "By the end…" saying what the student will be able to do.

Return ONLY valid JSON (no markdown):
{
  "title": "short lesson title in ${instrLangName}",
  "cefr": "${v.cefr}",
  "instrLang": "${v.instrLang}",
  "focus": "short focus tag",
  "goal": "what the student can do after this lesson — in ${instrLangName}",
  "coachNote": "one encouraging tip in ${instrLangName}",
  "tasks": [
    {
      "n": 1,
      "type": "vocab_drill",
      "instruction": "what to do — in ${instrLangName}",
      "format": "(uoe only) one of the allowed formats",
      "steps": ["krok 1", "krok 2"],
      "example": "worked example in English",
      "usefulLanguage": ["phrase 1", "phrase 2", "phrase 3"],
      "hint": "short tip in ${instrLangName}",
      "target": {"minSentences": 3, "maxSentences": 4},
      "prompt": "English material / stem",
      "items": [
        {"q": "sentence with ___ where the answer goes (or cue / question)", "answer": "…", "alts": ["…"], "options": ["(mc formats only)"], "cue": "(brackets / word_formation)", "pl": "(translation formats: Polish fragment)", "lead": "(transformation: original sentence)", "key": "(transformation: KEY WORD)"}
      ],
      "modelAnswers": []
    }
  ]
}`;
}

/** Canonical gap marker in item text: ____ / … / [...] → "___" (prompt-level {{n}} markers are kept). */
export function normalizeGapMarker(q) {
    return String(q ?? '').replace(/_{3,}|\[\s*(?:…|\.\.\.)\s*\]/g, '___');
}

/** Resolve the uoe format for a level; unknown/mismatched formats are inferred from the item structure. */
export function resolveUoeFormat(task, cefr) {
    const lv = UOE_LEVELS[cefr];
    if (!lv) return 'simple';
    const want = String(task?.format || '').trim().toLowerCase();
    if (lv.formats.includes(want)) return want;
    const items = Array.isArray(task?.items) ? task.items : [];
    const has = (k) => items.some((it) => it && it[k] != null && String(it[k]).length && (!Array.isArray(it[k]) || it[k].length));
    const textGaps = /\{\{\s*\d+\s*\}\}/.test(String(task?.prompt || task?.text || ''));
    const pick = (...fs) => fs.find((f) => lv.formats.includes(f));
    if (has('options')) return pick(textGaps ? 'mc_text' : (has('pl') ? 'mc_translation' : 'mc_sentences'), 'mc_text', 'mc_sentences') || lv.open;
    if (has('key') && has('lead')) return pick('transformation') || lv.open;
    if (has('pl')) return pick('translation') || lv.open;
    if (textGaps) return pick(has('cue') ? 'word_formation' : 'open_cloze', 'open_cloze', 'word_formation') || lv.open;
    return lv.open;
}

const clean = (s, n) => String(s ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, n);

/** Normalise one Use of English item for its CKE format; returns null if the item doesn't fit the format. */
export function buildUoeItem(format, it, cefr) {
    const f = UOE_FORMATS[format] || UOE_FORMATS.simple;
    const q = normalizeGapMarker(clean(it?.q || it?.question, 500));
    let answer = clean(it?.answer || it?.expected, 300);
    const alts = (Array.isArray(it?.alts) ? it.alts : []).map((a) => clean(a, 300)).filter(Boolean).slice(0, 8);
    const out = { q, answer, alts };
    if (f.kind === 'mc') {
        const lv = UOE_LEVELS[cefr];
        const want = lv ? lv.options : 3;
        const opts = [];
        for (const o of (Array.isArray(it?.options) ? it.options : [])) {
            const s = clean(String(o).replace(/^[A-D][).:]\s+/, ''), 120);
            if (s && !opts.some((x) => looseKey(x) === looseKey(s))) opts.push(s);
        }
        if (/^[A-D]$/i.test(answer) && opts.length) answer = opts['ABCD'.indexOf(answer.toUpperCase())] || answer;
        const hit = opts.find((o) => looseKey(o) === looseKey(answer));
        if (!hit || opts.length < 3) return null;
        out.answer = hit;
        out.options = opts.slice(0, Math.max(want, opts.indexOf(hit) + 1)).slice(0, 4);
        if (out.options.length > want && out.options.indexOf(hit) < want) out.options = out.options.slice(0, want);
    }
    if (!out.answer) return null;
    const cue = clean(it?.cue, 60).replace(/^\(|\)$/g, '');
    if (cue) out.cue = cue;
    else if (f.text && q && !/___/.test(q) && q.length <= 30) { out.cue = q.replace(/^\(|\)$/g, ''); out.q = ''; }
    if (f.needsPl) {
        let pl = clean(it?.pl || it?.polish, 120).replace(/^\(|\)$/g, '');
        if (!pl) { const m = q.match(/\(([^()]{2,80})\)\s*___/); if (m) { pl = m[1]; out.q = q.replace(m[0], '___'); } }
        if (!pl || !/___/.test(out.q)) return null;
        out.pl = pl;
    }
    if (f.needsKey) {
        const key = clean(it?.key || it?.keyword, 30).replace(/[^\p{L}'-]/gu, '').toUpperCase();
        const lead = clean(it?.lead || it?.source, 300);
        if (!key || !lead || !/___/.test(q)) return null;
        out.key = key; out.lead = lead;
    }
    if (format === 'lexical_set' && (q.match(/___/g) || []).length < 2) return null;
    if (format === 'two_sentences' && (q.match(/___/g) || []).length < 2) return null;
    return out;
}

/** Repair a 1–4 task lesson towards 5 by splitting sentence-based closed tasks with 4+ items in two. */
function splitToMinimum(tasks) {
    const out = tasks.slice();
    let guard = 0;
    while (out.length < OWN_TIME_TASKS_MIN && guard++ < 6) {
        let best = -1;
        out.forEach((t, i) => {
            const textGaps = /\{\{\s*\d+\s*\}\}/.test(t.prompt);
            if (t.items.length >= 4 && !textGaps && t.type !== 'reading' && t.type !== 'writing' && (best < 0 || t.items.length > out[best].items.length)) best = i;
        });
        if (best < 0) break;
        const t = out[best];
        const half = Math.ceil(t.items.length / 2);
        out.splice(best, 1, { ...t, items: t.items.slice(0, half) }, { ...t, items: t.items.slice(half), example: '' });
    }
    return out.map((t, i) => ({ ...t, n: i + 1 }));
}

export function normalizeOwnTimeLesson(parsed, fallback = {}) {
    const raw = parsed && typeof parsed === 'object' ? parsed : {};
    const tasksIn = Array.isArray(raw.tasks) ? raw.tasks : [];
    const lessonCefr = String(raw.cefr || fallback.cefr || 'A2').toUpperCase();
    let tasks = tasksIn.slice(0, OWN_TIME_TASKS_MAX).map((t, i) => {
        const type = OWN_TIME_TASK_TYPES.includes(t?.type)
            ? t.type
            : 'writing';
        const isTile = type === 'word_order' || type === 'unscramble';
        let format = null;
        let items;
        if (isTile) {
            items = (Array.isArray(t?.items) ? t.items : []).map((it) => buildTileItem(type, it)).filter(Boolean).slice(0, type === 'word_order' ? 5 : 6);
        } else if (type === 'uoe') {
            format = resolveUoeFormat(t, lessonCefr);
            const cap = { mc_text: 5, word_formation: 5, transformation: 4, lexical_set: 3, two_sentences: 4, mc_dialogue: 4 }[format] || 6;
            const raws = Array.isArray(t?.items) ? t.items : [];
            items = raws.map((it) => buildUoeItem(format, it, lessonCefr)).filter(Boolean).slice(0, cap);
            if (items.length < Math.min(2, raws.length) && UOE_LEVELS[lessonCefr]) {
                // The AI's items don't fit the format: fall back to the level's plain open format.
                format = UOE_LEVELS[lessonCefr].open;
                items = raws.map((it) => buildUoeItem(format, it, lessonCefr)).filter(Boolean).slice(0, 6);
            }
        } else {
            items = Array.isArray(t?.items)
                ? t.items.slice(0, 12).map((it) => ({
                    q: normalizeGapMarker(it?.q || it?.question || '').slice(0, 500),
                    answer: String(it?.answer || it?.expected || '').slice(0, 300),
                    alts: Array.isArray(it?.alts)
                        ? it.alts.map((a) => String(a || '').slice(0, 300)).filter(Boolean).slice(0, 6)
                        : [],
                })).filter((it) => it.q || it.answer)
                : [];
        }
        const strList = (arr, max, len) => (Array.isArray(arr) ? arr : [])
            .map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, len)).filter(Boolean).slice(0, max);
        const lang = raw.instrLang === 'en' || fallback.instrLang === 'en' ? 'en' : 'pl';
        const cefr = lessonCefr;
        const def = defaultGuidance(type, lang, cefr);
        const wt = writingTarget(cefr);
        const minS = Math.max(1, Math.min(10, Number(t?.target?.minSentences) || wt.sentences[0]));
        const maxS = Math.max(minS, Math.min(12, Number(t?.target?.maxSentences) || wt.sentences[1]));
        const steps = strList(t?.steps, 4, 160);
        const examInstr = format ? uoeInstruction(format, cefr) : '';
        return {
            n: Number(t?.n) || (i + 1),
            type,
            ...(format ? { format, exam: UOE_LEVELS[cefr]?.exam || null } : {}),
            steps: steps.length >= 2 ? steps : (format && UOE_FORMATS[format].kind === 'mc'
                ? (lang === 'en' ? ['Read the whole sentence or text first.', 'Choose the right option for each gap.', 'Press “Check”.'] : ['Najpierw przeczytaj całe zdanie lub tekst.', 'Wybierz właściwą odpowiedź do każdej luki.', 'Kliknij „Sprawdź”.'])
                : def.steps),
            example: String(t?.example || '').replace(/\s+/g, ' ').trim().slice(0, 300),
            usefulLanguage: strList(t?.usefulLanguage, 6, 80),
            hint: String(t?.hint || def.hint || '').slice(0, 200),
            target: type === 'writing' ? { minSentences: minS, maxSentences: maxS, minWords: wt.words[0], maxWords: wt.words[1] } : null,
            instruction: examInstr || String(t?.instruction || '').slice(0, 500),
            prompt: String(t?.prompt || t?.text || '').slice(0, 4000),
            items,
            modelAnswers: Array.isArray(t?.modelAnswers)
                ? t.modelAnswers.map((a) => String(a || '').slice(0, 500)).filter(Boolean).slice(0, 8)
                : [],
        };
    }).filter((t) => ((t.type === 'word_order' || t.type === 'unscramble' || t.type === 'uoe') ? t.items.length > 0 : (t.instruction || t.prompt || t.items.length)));
    if (tasks.length && tasks.length < OWN_TIME_TASKS_MIN) tasks = splitToMinimum(tasks);

    return {
        title: String(raw.title || 'Practice').slice(0, 120),
        cefr: lessonCefr,
        instrLang: raw.instrLang === 'en' || fallback.instrLang === 'en' ? 'en' : 'pl',
        focus: String(raw.focus || '').slice(0, 80),
        goal: String(raw.goal || '').slice(0, 200),
        coachNote: String(raw.coachNote || '').slice(0, 400),
        taskCountOk: tasks.length >= OWN_TIME_TASKS_MIN && tasks.length <= OWN_TIME_TASKS_MAX,
        tasks: tasks.length ? tasks : [{
            n: 1,
            type: 'writing',
            ...(() => { const d = defaultGuidance('writing', fallback.instrLang === 'en' ? 'en' : 'pl', fallback.cefr); return { steps: d.steps, hint: d.hint }; })(),
            example: '',
            usefulLanguage: ['This week I…', 'First,', 'After that,', 'It was…because…'],
            target: (() => { const w = writingTarget(fallback.cefr); return { minSentences: w.sentences[0], maxSentences: w.sentences[1], minWords: w.words[0], maxWords: w.words[1] }; })(),
            instruction: fallback.instrLang === 'en' ? 'Write 3–4 sentences about your day.' : 'Napisz 3–4 zdania o swoim dniu.',
            prompt: 'Write a short paragraph about something you did this week.',
            items: [],
            modelAnswers: [],
        }],
    };
}

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

/** Per-task minutes so the whole session stays inside 15–20 min (light: 12–15). */
const TYPE_MINUTES = { vocab_drill: 4, uoe: 5, reading: 6, writing: 7 };

/**
 * Default student guidance per task type (steps + hint; the success checklist was removed), used when the AI leaves a field out
 * (and for lessons generated before guidance existed).
 */
export function defaultGuidance(type, instrLang, cefr) {
    const en = instrLang === 'en';
    const w = writingTarget(cefr);
    const zd = w.sentences[1] <= 4 ? 'zdania' : 'zdań';
    const T = {
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

function intensityGuide(intensity) {
    if (intensity === 'light') return '2 short tasks, easier end of the CEFR band, ~12–15 minutes.';
    if (intensity === 'stretch') return '3–4 tasks, slightly challenging for the CEFR band, ~18–20 minutes.';
    return '2–3 tasks, solid practice at the CEFR band, ~15–18 minutes.';
}

export function buildOwnTimeLessonPrompt(v) {
    const instrLangName = v.instrLang === 'en' ? 'English' : 'Polish';
    const young = (v.age != null && v.age < 15) || ['A0', 'A1', 'A2'].includes(v.cefr);
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
- Intensity: ${v.intensity} → ${intensityGuide(v.intensity)}
- Optional topic for this session: ${v.topic || '(invent a fresh topic from interests)'}
- Optional vocabulary to weave in: ${v.vocab || '(none — pick useful words for the topic/level)'}
${feedbackBlock}${extraBlock}

HARD RULES:
1. Target about 15–20 minutes total (${intensityGuide(v.intensity)}).
2. Practice MATERIAL (reading texts, gap sentences, writing prompts, vocab items) MUST be in English at CEFR ${v.cefr}, suitable for age ${v.age ?? 'teen'}.
3. Every coach-facing string — task "instruction", "coachNote", lesson "title" — MUST be written in ${instrLangName} (${v.instrLang}).
4. ${young
        ? 'Keep instructions VERY short and concrete (e.g. Polish: "Uzupełnij lukę." / "Napisz 2–3 zdania."). No teacher jargon.'
        : 'Keep instructions clear and concise; still avoid dense meta jargon.'}
5. Prefer the student's task types. Allowed types: vocab_drill, uoe, reading, writing (map prefs: vocab/drill→vocab_drill, uoe→uoe, reading→reading, writing→writing).
6. Include modelAnswers or expected answers for closed items so the app can check locally.
7. For reading: short English text + 2–3 comprehension questions (answers in English).
8. For writing: one short prompt (2–6 sentences depending on level).
9. For uoe: gap-fill or word-formation style items at ${v.cefr}.
10. For vocab_drill: match / translate / gap with the session vocabulary.
11. STUDENT GUIDANCE (every task): the student works ALONE at home, so each task must be self-explanatory.
    - "steps": 2–4 very short numbered actions in ${instrLangName} (what to do first, next, last).
    - "example": ONE worked example in English showing exactly how to answer (for closed items: a solved item that is NOT one of the items).
    - "usefulLanguage": 3–6 English words/phrases/sentence starters at ${v.cefr} that help with THIS task (writing: starters + linking words).
    - "hint": one short tip in ${instrLangName} for when they are stuck.
    - "minutes": realistic minutes for this task; all tasks together = the lesson "minutes".
12. WRITING length at ${v.cefr}: ${writingTarget(v.cefr).sentences[0]}–${writingTarget(v.cefr).sentences[1]} sentences (about ${writingTarget(v.cefr).words[0]}–${writingTarget(v.cefr).words[1]} words); put {"minSentences": n, "maxSentences": n} in "target" and one full model answer in "modelAnswers".
13. Lesson "goal": one sentence in ${instrLangName} starting "Po tej lekcji…" / "By the end…" saying what the student will be able to do.

Return ONLY valid JSON (no markdown):
{
  "title": "short lesson title in ${instrLangName}",
  "minutes": 16,
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
      "minutes": 4,
      "steps": ["krok 1", "krok 2"],
      "example": "worked example in English",
      "usefulLanguage": ["phrase 1", "phrase 2", "phrase 3"],
      "hint": "short tip in ${instrLangName}",
      "target": {"minSentences": 3, "maxSentences": 4},
      "prompt": "English material / stem",
      "items": [
        {"q": "…", "answer": "…", "alts": ["…"]}
      ],
      "modelAnswers": []
    }
  ]
}`;
}

export function normalizeOwnTimeLesson(parsed, fallback = {}) {
    const raw = parsed && typeof parsed === 'object' ? parsed : {};
    const tasksIn = Array.isArray(raw.tasks) ? raw.tasks : [];
    const tasks = tasksIn.slice(0, 4).map((t, i) => {
        const type = ['vocab_drill', 'uoe', 'reading', 'writing'].includes(t?.type)
            ? t.type
            : 'writing';
        const items = Array.isArray(t?.items)
            ? t.items.slice(0, 12).map((it) => ({
                q: String(it?.q || it?.question || '').slice(0, 500),
                answer: String(it?.answer || it?.expected || '').slice(0, 300),
                alts: Array.isArray(it?.alts)
                    ? it.alts.map((a) => String(a || '').slice(0, 300)).filter(Boolean).slice(0, 6)
                    : [],
            })).filter((it) => it.q || it.answer)
            : [];
        const strList = (arr, max, len) => (Array.isArray(arr) ? arr : [])
            .map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, len)).filter(Boolean).slice(0, max);
        const lang = raw.instrLang === 'en' || fallback.instrLang === 'en' ? 'en' : 'pl';
        const cefr = String(raw.cefr || fallback.cefr || 'A2').toUpperCase();
        const def = defaultGuidance(type, lang, cefr);
        const wt = writingTarget(cefr);
        const minS = Math.max(1, Math.min(10, Number(t?.target?.minSentences) || wt.sentences[0]));
        const maxS = Math.max(minS, Math.min(12, Number(t?.target?.maxSentences) || wt.sentences[1]));
        const steps = strList(t?.steps, 4, 160);
        return {
            n: Number(t?.n) || (i + 1),
            type,
            minutes: Math.max(2, Math.min(12, Number(t?.minutes) || TYPE_MINUTES[type] || 5)),
            steps: steps.length >= 2 ? steps : def.steps,
            example: String(t?.example || '').replace(/\s+/g, ' ').trim().slice(0, 300),
            usefulLanguage: strList(t?.usefulLanguage, 6, 80),
            hint: String(t?.hint || def.hint || '').slice(0, 200),
            target: type === 'writing' ? { minSentences: minS, maxSentences: maxS, minWords: wt.words[0], maxWords: wt.words[1] } : null,
            instruction: String(t?.instruction || '').slice(0, 500),
            prompt: String(t?.prompt || t?.text || '').slice(0, 4000),
            items,
            modelAnswers: Array.isArray(t?.modelAnswers)
                ? t.modelAnswers.map((a) => String(a || '').slice(0, 500)).filter(Boolean).slice(0, 8)
                : [],
        };
    }).filter((t) => t.instruction || t.prompt || t.items.length);

    return {
        title: String(raw.title || 'Practice').slice(0, 120),
        minutes: Math.max(10, Math.min(25, Number(raw.minutes) || 16)),
        cefr: String(raw.cefr || fallback.cefr || 'A2').toUpperCase(),
        instrLang: raw.instrLang === 'en' || fallback.instrLang === 'en' ? 'en' : 'pl',
        focus: String(raw.focus || '').slice(0, 80),
        goal: String(raw.goal || '').slice(0, 200),
        coachNote: String(raw.coachNote || '').slice(0, 400),
        tasks: tasks.length ? tasks : [{
            n: 1,
            type: 'writing',
            minutes: 7,
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

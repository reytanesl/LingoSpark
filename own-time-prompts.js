/**
 * Server-owned prompts for "In your own time" practice lessons.
 */

const CEFR_OK = new Set(['A0', 'A1', 'A2', 'B1', 'B2', 'C1']);
const INTENSITY_OK = new Set(['light', 'standard', 'stretch']);
const TASK_OK = new Set(['writing', 'drill', 'uoe', 'reading', 'vocab']);

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
        },
    };
}

function intensityGuide(intensity) {
    if (intensity === 'light') return '2 short tasks, easier end of the CEFR band, ~12–15 minutes.';
    if (intensity === 'stretch') return '3–4 tasks, slightly challenging for the CEFR band, ~18–20 minutes.';
    return '2–3 tasks, solid practice at the CEFR band, ~15–18 minutes.';
}

export function buildOwnTimeLessonPrompt(v) {
    const instrLangName = v.instrLang === 'en' ? 'English' : 'Polish';
    const young = (v.age != null && v.age < 15) || ['A0', 'A1', 'A2'].includes(v.cefr);
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
${feedbackBlock}

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

Return ONLY valid JSON (no markdown):
{
  "title": "short lesson title in ${instrLangName}",
  "minutes": 16,
  "cefr": "${v.cefr}",
  "instrLang": "${v.instrLang}",
  "focus": "short focus tag",
  "coachNote": "one encouraging tip in ${instrLangName}",
  "tasks": [
    {
      "n": 1,
      "type": "vocab_drill",
      "instruction": "what to do — in ${instrLangName}",
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
        return {
            n: Number(t?.n) || (i + 1),
            type,
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
        coachNote: String(raw.coachNote || '').slice(0, 400),
        tasks: tasks.length ? tasks : [{
            n: 1,
            type: 'writing',
            instruction: fallback.instrLang === 'en' ? 'Write 3–4 sentences about your day.' : 'Napisz 3–4 zdania o swoim dniu.',
            prompt: 'Write a short paragraph about something you did this week.',
            items: [],
            modelAnswers: [],
        }],
    };
}

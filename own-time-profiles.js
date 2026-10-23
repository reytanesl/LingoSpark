/**
 * "In your own time" — several named student profiles per account (pure helpers; server-only).
 * Each profile has its own settings, lesson history, today's lesson, Keep going count and in-progress lesson.
 */

export const OWN_TIME_PROFILE_LIMIT = 5;
export const OWN_TIME_DEFAULT_PROFILE_NAME = 'Mój profil';
/** Max serialized size of a saved in-progress lesson (lesson JSON + answers). */
export const OWN_TIME_PROGRESS_MAX_BYTES = 200000;

/** Avatar colours a student can pick (index into the browser's palette; '' = automatic by profile id). */
export const OWN_TIME_AVATAR_TONES = ['navy', 'teal', 'violet', 'amber', 'green', 'rose'];
export function sanitizeOwnTimeAvatar(v) {
    const s = String(v ?? '').trim().toLowerCase();
    return OWN_TIME_AVATAR_TONES.includes(s) ? s : '';
}

export function sanitizeOwnTimeProfileName(name, fallback = '') {
    const s = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return s || fallback;
}

/**
 * In-progress lesson state saved server-side so switching profiles (or reloading) resumes exactly:
 * { lesson, taskIndex, answers, view: 'lesson'|'feedback', startedAt, tileState, openPanels }.
 * Returns null when the payload is unusable (it is then cleared).
 */
export function sanitizeOwnTimeProgress(p) {
    if (!p || typeof p !== 'object') return null;
    const lesson = p.lesson && typeof p.lesson === 'object' && Array.isArray(p.lesson.tasks) && p.lesson.tasks.length ? p.lesson : null;
    if (!lesson) return null;
    const n = lesson.tasks.length;
    const view = p.view === 'feedback' ? 'feedback' : 'lesson';
    const taskIndex = Math.max(0, Math.min(n - 1, Math.floor(Number(p.taskIndex) || 0)));
    const answers = {};
    if (p.answers && typeof p.answers === 'object') {
        for (let i = 0; i < n; i += 1) {
            const a = p.answers[`t${i}`];
            if (!a || typeof a !== 'object') continue;
            answers[`t${i}`] = {
                type: String(a.type || '').slice(0, 20),
                text: String(a.text || '').slice(0, 5000),
                plan: String(a.plan || '').slice(0, 1000),
                items: (Array.isArray(a.items) ? a.items : []).slice(0, 20).map((x) => (x == null ? '' : String(x).slice(0, 300))),
                ...(a.checked && typeof a.checked === 'object' ? { checked: { ok: Number(a.checked.ok) || 0, total: Number(a.checked.total) || 0 } } : {}),
            };
        }
    }
    const tileState = {};
    if (p.tileState && typeof p.tileState === 'object') {
        for (const [k, v] of Object.entries(p.tileState)) {
            if (/^\d{1,2}:\d{1,2}$/.test(k) && Array.isArray(v)) tileState[k] = v.slice(0, 20).map((x) => Math.max(0, Math.floor(Number(x) || 0)));
        }
    }
    const out = {
        lesson,
        taskIndex,
        view,
        answers,
        tileState,
        openPanels: (Array.isArray(p.openPanels) ? p.openPanels : []).slice(0, 40).map((x) => String(x).slice(0, 40)),
        startedAt: Number(p.startedAt) || Date.now(),
        savedAt: Date.now(),
    };
    if (JSON.stringify(out).length > OWN_TIME_PROGRESS_MAX_BYTES) return null;
    return out;
}

/** Short summary for the switcher ("Zadanie 3 z 6"). */
export function ownTimeProgressSummary(progress) {
    if (!progress || !progress.lesson) return null;
    return {
        title: String(progress.lesson.title || '').slice(0, 120),
        taskIndex: progress.taskIndex || 0,
        tasks: (progress.lesson.tasks || []).length,
        view: progress.view || 'lesson',
        extra: progress.lesson.extra === true,
        savedAt: progress.savedAt || null,
    };
}

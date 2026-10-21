import test from 'node:test';
import assert from 'node:assert/strict';
import { OWN_TIME_PROFILE_LIMIT, sanitizeOwnTimeProfileName, sanitizeOwnTimeProgress, ownTimeProgressSummary, OWN_TIME_PROGRESS_MAX_BYTES } from './own-time-profiles.js';

const lesson = { title: 'L', tasks: [{ type: 'uoe', items: [{ q: 'a', answer: 'b' }] }, { type: 'word_order', items: [] }, { type: 'writing', items: [] }] };

test('profile names are trimmed, cleaned and capped', () => {
    assert.equal(sanitizeOwnTimeProfileName('  Ola   <b>  '), 'Ola b');
    assert.equal(sanitizeOwnTimeProfileName('x'.repeat(80)).length, 40);
    assert.equal(sanitizeOwnTimeProfileName('   ', 'Mój profil'), 'Mój profil');
    assert.equal(OWN_TIME_PROFILE_LIMIT, 5);
});

test('progress keeps the current task, typed answers and word-order tiles', () => {
    const p = sanitizeOwnTimeProgress({
        lesson, taskIndex: 1, view: 'lesson', startedAt: 123,
        answers: { t0: { type: 'uoe', items: ['b'], checked: { ok: 1, total: 1 } }, t2: { type: 'writing', text: 'Hi Jake!' }, t9: { items: ['x'] } },
        tileState: { '1:0': [2, 0, 1], bad: [1], '1:1': 'x' }, openPanels: ['1:hint'],
    });
    assert.equal(p.taskIndex, 1);
    assert.equal(p.view, 'lesson');
    assert.deepEqual(p.answers.t0.items, ['b']);
    assert.deepEqual(p.answers.t0.checked, { ok: 1, total: 1 });
    assert.equal(p.answers.t2.text, 'Hi Jake!');
    assert.equal(p.answers.t9, undefined, 'answers for tasks that do not exist are dropped');
    assert.deepEqual(p.tileState, { '1:0': [2, 0, 1] });
    assert.deepEqual(p.openPanels, ['1:hint']);
    assert.equal(p.startedAt, 123);
});

test('progress: task index clamped, feedback view kept, junk rejected', () => {
    assert.equal(sanitizeOwnTimeProgress({ lesson, taskIndex: 99 }).taskIndex, 2);
    assert.equal(sanitizeOwnTimeProgress({ lesson, taskIndex: -3 }).taskIndex, 0);
    assert.equal(sanitizeOwnTimeProgress({ lesson, view: 'feedback' }).view, 'feedback');
    assert.equal(sanitizeOwnTimeProgress({ lesson, view: 'dash' }).view, 'lesson');
    assert.equal(sanitizeOwnTimeProgress(null), null);
    assert.equal(sanitizeOwnTimeProgress({ lesson: { tasks: [] } }), null);
    const huge = { title: 'x', tasks: [{ type: 'reading', prompt: 'y'.repeat(OWN_TIME_PROGRESS_MAX_BYTES + 10), items: [] }] };
    assert.equal(sanitizeOwnTimeProgress({ lesson: huge }), null, 'oversized payloads are refused');
});

test('progress summary for the switcher', () => {
    const s = ownTimeProgressSummary(sanitizeOwnTimeProgress({ lesson, taskIndex: 2 }));
    assert.deepEqual({ title: s.title, taskIndex: s.taskIndex, tasks: s.tasks, view: s.view }, { title: 'L', taskIndex: 2, tasks: 3, view: 'lesson' });
    assert.equal(ownTimeProgressSummary(null), null);
});

// Optional: real Postgres (LS_PG_TESTS=1 DATABASE_URL=...). Never runs in plain `npm test`.
test('pg: migration, per-profile history/extras/progress, cap, rename, delete, switch', { skip: process.env.LS_PG_TESTS !== '1' && 'set LS_PG_TESTS=1 with DATABASE_URL to run' }, async () => {
    const db = await import('./db.js');
    await db.initDb();
    const pool = db.getPool();
    const email = `ot-prof-${Date.now()}@local.test`;
    const u = await pool.query(`INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`, [email]);
    const uid = u.rows[0].id;
    try {
        // Legacy single profile + a legacy lesson → migrated into a default, active profile.
        await pool.query(`INSERT INTO own_time_profiles (user_id, age, cefr) VALUES ($1, 13, 'A2')`, [uid]);
        await pool.query(`INSERT INTO own_time_lessons (user_id, lesson) VALUES ($1, '{"title":"old"}'::jsonb)`, [uid]);
        await db.migrateOwnTimeProfiles();
        await db.migrateOwnTimeProfiles(); // idempotent
        let list = await db.listOwnTimeProfiles(uid);
        assert.equal(list.profiles.length, 1);
        assert.equal(list.profiles[0].name, 'Mój profil');
        assert.equal(list.profiles[0].cefr, 'A2');
        const first = list.activeId;
        assert.equal((await db.listOwnTimeLessons(uid)).length, 1);

        await db.saveOwnTimeProgress(uid, first, { lesson, taskIndex: 1, answers: { t0: { items: ['b'] } } });
        const created = await db.createOwnTimeProfile(uid, { name: 'Kuba' });
        assert.ok(created.ok);
        assert.equal(await db.getOwnTimeProfile(uid), null, 'new profile is not set up yet');
        await db.upsertOwnTimeProfile(uid, { age: 17, cefr: 'B2' });
        assert.equal((await db.getOwnTimeProfile(uid)).cefr, 'B2');
        assert.equal((await db.listOwnTimeLessons(uid)).length, 0, 'history is per profile');
        await db.reserveOwnTimeExtra(uid, 3);
        assert.equal((await db.getOwnTimeToday(uid, 3)).extrasUsed, 1);
        assert.equal((await db.getOwnTimeToday(uid, 3, first)).extrasUsed, 0, 'Keep going count is per profile');

        await db.activateOwnTimeProfile(uid, first);
        const pr = await db.getOwnTimeProgress(uid, first);
        assert.equal(pr.taskIndex, 1);
        assert.deepEqual(pr.answers.t0.items, ['b']);
        list = await db.listOwnTimeProfiles(uid);
        assert.equal(list.profiles.find((p) => p.id === first).progress.taskIndex, 1);

        await db.saveOwnTimeLesson(uid, { lesson: { title: 'done' }, feedback: {}, profileId: first });
        assert.equal(await db.getOwnTimeProgress(uid, first), null, 'finishing clears progress');

        for (const n of ['C', 'D', 'E']) assert.ok((await db.createOwnTimeProfile(uid, { name: n })).ok);
        assert.equal((await db.createOwnTimeProfile(uid, { name: 'F' })).code, 'limit');
        assert.ok((await db.renameOwnTimeProfile(uid, first, '  Ola  ')).ok);
        list = await db.listOwnTimeProfiles(uid);
        assert.equal(list.profiles.find((p) => p.id === first).name, 'Ola');
        const active = list.activeId;
        assert.ok((await db.deleteOwnTimeProfile(uid, active)).ok);
        list = await db.listOwnTimeProfiles(uid);
        assert.equal(list.profiles.length, 4);
        assert.ok(list.activeId && list.activeId !== active, 'another profile becomes active');
        assert.equal((await db.renameOwnTimeProfile(uid, 999999999, 'x')).code, 'not_found');
    } finally {
        await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
    }
});

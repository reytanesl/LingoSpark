import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { isPublicStaticPath } from './static-allowlist.js';
import {
    validateFrankAiRequest, buildFrankAiPrompt, validateFrankAiResult, createRateLimiter,
    createFrankGenerateHandler, countWords, hasCohesiveMarker, isEssayLikeArticleOpening, WHOLE_WORDS,
} from './frank-ai.js';

const FO = globalThis.FrankOptions;

export const ESSAY_WHOLE = {
    task: 'W ostatnich latach coraz więcej szkół rezygnuje z zadawania prac domowych. Napisz rozprawkę, w której przedstawisz zalety i wady takiego rozwiązania, odnosząc się do jego wpływu na wyniki uczniów oraz na ich czas wolny.',
    elements: ['wpływ rezygnacji z prac domowych na wyniki uczniów', 'wpływ tego rozwiązania na czas wolny uczniów'],
    topic: 'Abolishing homework',
    title: '',
    paragraphs: [
        { type: 'introduction', sentences: [
            'In recent years, a growing number of schools have decided to abolish homework altogether.',
            'This controversial move has sparked a heated debate among parents, teachers and students alike.',
            'Before passing judgement, it is worth weighing up both its benefits and its drawbacks.',
        ] },
        { type: 'body_for', sentences: [
            'On the one hand, scrapping homework gives teenagers far more free time to pursue their passions.',
            'Instead of spending whole evenings on repetitive exercises, they can take up sports, music or volunteering.',
            'As a result, they are likely to develop skills that no textbook can teach, such as teamwork and resilience.',
            'What is more, well-rested students tend to be noticeably more motivated and focused during lessons.',
        ] },
        { type: 'body_against', sentences: [
            "On the other hand, abolishing homework may have a detrimental effect on students' results.",
            'Without regular practice at home, however, many learners would struggle to consolidate what they have been taught in class.',
            'This is particularly true of subjects like mathematics, where skills are built step by step.',
            'Consequently, their marks could drop, especially in the run-up to the final exams.',
        ] },
        { type: 'conclusion_for_against', sentences: [
            'To sum up, abolishing homework is a double-edged sword.',
            "While it undoubtedly frees up time for valuable activities, it might well undermine students' academic performance.",
            'In my view, schools should therefore opt for a sensible compromise: fewer but carefully designed assignments that genuinely reinforce learning.',
        ] },
    ],
};

export const COUNTER_PARAGRAPH = {
    task: 'Coraz więcej firm pozwala pracownikom na pracę zdalną. Napisz rozprawkę, w której przedstawisz swoją opinię na ten temat, odnosząc się do wpływu pracy zdalnej na produktywność oraz na relacje między współpracownikami.',
    elements: ['wpływ pracy zdalnej na produktywność', 'wpływ pracy zdalnej na relacje między współpracownikami'],
    topic: 'Remote work',
    paragraph: { type: 'body_counter', sentences: [
        'Admittedly, some argue that working from home weakens the bonds between colleagues.',
        'In their view, video calls can never replace spontaneous conversations in the office kitchen.',
        'However, regular team meetings and occasional office days can easily keep these relationships alive.',
        'Therefore, I remain convinced that the benefits of remote work clearly outweigh this drawback.',
    ] },
};

const words = (r) => r.paragraphs.flatMap((p) => p.sentences).reduce((n, s) => n + countWords(s), 0);

test('fixture essay is a valid CKE-length whole text', () => {
    const n = words(ESSAY_WHOLE);
    assert.ok(n >= WHOLE_WORDS.min && n <= WHOLE_WORDS.max, `fixture has ${n} words`);
});

test('request validation: whitelist, resolves Any, topic limits', () => {
    assert.deepEqual(validateFrankAiRequest({ textType: 'for_against', paraType: 'whole', topic: '  school  uniforms ' }).value,
        { textType: 'for_against', paraType: 'whole', whole: true, topic: 'school uniforms' });
    const anyWhole = validateFrankAiRequest({ textType: 'any', paraType: 'whole' }, () => 0).value;
    assert.equal(anyWhole.textType, FO.TEXT_TYPES[0].id);
    assert.equal(anyWhole.whole, true);
    const role = validateFrankAiRequest({ textType: 'any', paraType: 'role:end' }, () => 0).value;
    assert.equal(role.textType, 'for_against');
    assert.equal(FO.findPara('for_against', role.paraType).role, 'end');
    // Legacy / removed forms fall back to Any, then a concrete active type.
    const legacy = validateFrankAiRequest({ textType: 'story', paraType: 'ending' }, () => 0).value;
    assert.equal(legacy.textType, 'for_against');
    assert.ok(FO.findPara(legacy.textType, legacy.paraType));
    const opinionPara = validateFrankAiRequest({ textType: 'opinion', paraType: 'body_counter' }).value;
    assert.equal(opinionPara.paraType, 'body_counter');
    const bad = validateFrankAiRequest({ textType: 'for_against', paraType: 'closing' }).value;
    assert.notEqual(bad.paraType, 'closing', 'mismatched paragraph type falls back');
    assert.equal(validateFrankAiRequest({ topic: 'x'.repeat(200) }).ok, false);
    assert.ok(!/[<>{}]/.test(validateFrankAiRequest({ topic: '<script>{x}</script>' }).value.topic));
});

test('prompt targets CKE extended matura (2023+) requirements', () => {
    const whole = buildFrankAiPrompt({ textType: 'formal_letter', paraType: 'whole', whole: true, topic: 'cycle lanes' });
    assert.match(whole, /rozszerzony|rozszerzona/);
    assert.match(whole, /2023/);
    assert.match(whole, /200–250 words/);
    assert.match(whole, /list formalny/);
    assert.match(whole, /Zgodność z poleceniem/);
    assert.match(whole, /Spójność i logika/);
    assert.match(whole, /Zakres środków językowych/);
    assert.match(whole, /Poprawność środków językowych/);
    assert.match(whole, /max 13 points/);
    assert.match(whole, /BOTH elements|both prompt elements/i);
    assert.match(whole, /B2\+/);
    assert.match(whole, /POLISH/);
    assert.match(whole, /cycle lanes/);
    assert.match(whole, /XYZ/);
    assert.match(whole, /STANDARD PARAGRAPH PLAN/);
    assert.match(whole, /Return ONLY valid JSON/);
    const para = buildFrankAiPrompt({ textType: 'opinion', paraType: 'body_counter', whole: false, topic: '' });
    assert.match(para, /ONE paragraph only/);
    assert.match(para, /Opposing view and rebuttal/);
    const article = buildFrankAiPrompt({ textType: 'article', paraType: 'whole', whole: true, topic: '' });
    assert.match(article, /artykuł publicystyczny/);
    assert.match(article, /In this article/);
    assert.match(article, /lively hook|magazine-like/i);
    assert.match(buildFrankAiPrompt({ textType: 'for_against', paraType: 'whole', whole: true, topic: '' }, { retryNote: 'REJECTED: too short' }), /REJECTED: too short/);
    assert.match(buildFrankAiPrompt({ textType: 'for_against', paraType: 'whole', whole: true, topic: '' }), /for and against/);
    assert.match(buildFrankAiPrompt({ textType: 'opinion', paraType: 'whole', whole: true, topic: '' }), /opinion/);
});

test('article openings reject essay-style roadmaps', () => {
    assert.equal(isEssayLikeArticleOpening([
        'In this article, I will first explain how AI can support independent study.',
        'At the same time, I will show why relying on it too often may weaken exam skills.',
    ]), true);
    assert.equal(isEssayLikeArticleOpening([
        'How often do you ask a chatbot for help with homework?',
        'Used wisely it can be a brilliant study buddy — used lazily it can steal your matura skills.',
    ]), false);
});

test('result validation: accepts good texts, chunks them, rejects bad ones with a reason', () => {
    const v = { textType: 'for_against', paraType: 'whole', whole: true, topic: '' };
    const ok = validateFrankAiResult(ESSAY_WHOLE, v);
    assert.equal(ok.ok, true, ok.error);
    assert.equal(ok.value.paragraphs.length, 4);
    assert.equal(ok.value.textType, 'for_against');
    assert.equal(ok.value.ai, true);
    const chunks = FO.chunkWholeText(ok.value);
    assert.ok(chunks.length >= 8 && chunks.length <= 12);

    const short = structuredClone(ESSAY_WHOLE); short.paragraphs[1].sentences = short.paragraphs[1].sentences.slice(0, 1); short.paragraphs[2].sentences = short.paragraphs[2].sentences.slice(0, 1);
    assert.match(validateFrankAiResult(short, v).error, /words/);
    const noLinks = structuredClone(ESSAY_WHOLE); noLinks.paragraphs[2].sentences[0] = "Abolishing homework may have a detrimental effect on students' results.";
    assert.match(validateFrankAiResult(noLinks, v).error, /open with a linking/);
    const flat = structuredClone(ESSAY_WHOLE);
    flat.paragraphs[2].sentences = ['On the other hand, results may suffer.', 'Students forget things quickly.', 'Mathematics needs steady practice at home.', 'Marks drop in the final year.', 'Teachers notice gaps.'];
    assert.match(validateFrankAiResult(flat, v).error, /words|linking/);
    assert.match(validateFrankAiResult({ ...ESSAY_WHOLE, elements: ['one'] }, v).error, /two elements/);
    assert.match(validateFrankAiResult({ ...ESSAY_WHOLE, task: '' }, v).error, /polecenie/);
    assert.equal(validateFrankAiResult('nope', v).ok, false);
    const dup = structuredClone(ESSAY_WHOLE); dup.paragraphs[3].sentences.push(dup.paragraphs[0].sentences[0]);
    assert.match(validateFrankAiResult(dup, v).error, /Duplicate/);

    const pv = { textType: 'opinion', paraType: 'body_counter', whole: false, topic: '' };
    const p = validateFrankAiResult(COUNTER_PARAGRAPH, pv);
    assert.equal(p.ok, true, p.error);
    assert.equal(p.value.type, 'body_counter');
    assert.equal(p.value.sentences.length, 4);
    assert.ok(hasCohesiveMarker('However, this is fine.') && hasCohesiveMarker('These results matter.') && !hasCohesiveMarker('Students forget things quickly.'));
});

test('rate limiter: per user, minimum gap, hourly cap, one at a time', () => {
    let t = 0;
    const rl = createRateLimiter({ max: 3, windowMs: 1000, minGapMs: 100, now: () => t });
    assert.equal(rl.check('a').ok, true); rl.start('a');
    assert.equal(rl.check('a').ok, false, 'busy');
    rl.finish('a');
    assert.equal(rl.check('a').ok, false, 'min gap');
    assert.equal(rl.check('b').ok, true, 'other users unaffected');
    t = 200; rl.start('a'); rl.finish('a');
    t = 400; rl.start('a'); rl.finish('a');
    t = 600; assert.match(rl.check('a').error, /Limit reached/);
    t = 1100; assert.equal(rl.check('a').ok, true, 'window slides');
});

async function withApp(handler, fn, user = { id: 7 }) {
    const app = express();
    app.use(express.json());
    app.post('/api/frank/generate', (req, _res, next) => { req.user = user; next(); }, handler);
    const server = createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}/api/frank/generate`;
    try { return await fn((body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })); }
    finally { server.close(); }
}

test('endpoint with mocked AI: success, retry after a bad reply, fallback on failure, 429, 503', async () => {
    const prompts = [];
    const replies = [{ task: 'x' }, ESSAY_WHOLE];
    const handler = createFrankGenerateHandler({ runPrompt: async (prompt) => { prompts.push(prompt); return replies.shift(); }, limiter: createRateLimiter({ minGapMs: 0 }) });
    await withApp(handler, async (post) => {
        const res = await post({ textType: 'for_against', paraType: 'whole', topic: 'homework' });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.item.task, ESSAY_WHOLE.task);
        assert.equal(prompts.length, 2, 'retried once');
        assert.match(prompts[1], /PREVIOUS ATTEMPT WAS REJECTED/);
        assert.match(prompts[0], /homework/);
    });
    const failing = createFrankGenerateHandler({ runPrompt: async () => { throw new Error('upstream down'); }, limiter: createRateLimiter({ minGapMs: 0 }) });
    await withApp(failing, async (post) => {
        const res = await post({ textType: 'for_against', paraType: 'whole' });
        assert.equal(res.status, 502);
        const data = await res.json();
        assert.equal(data.fallback, true);
        assert.match(data.error, /upstream down/);
    });
    const limited = createFrankGenerateHandler({ runPrompt: async () => COUNTER_PARAGRAPH, limiter: createRateLimiter({ max: 1, minGapMs: 0 }) });
    await withApp(limited, async (post) => {
        assert.equal((await post({ textType: 'opinion', paraType: 'body_counter' })).status, 200);
        const r2 = await post({ textType: 'opinion', paraType: 'body_counter' });
        assert.equal(r2.status, 429);
        assert.ok(r2.headers.get('retry-after'));
    });
    const unconfigured = createFrankGenerateHandler({ runPrompt: async () => ESSAY_WHOLE, isConfigured: () => false });
    await withApp(unconfigured, async (post) => assert.equal((await post({ textType: 'for_against', paraType: 'whole' })).status, 503));
    await withApp(handler, async (post) => assert.equal((await post({ topic: 'y'.repeat(300) })).status, 400));
});

test('server mounts the endpoint behind Writing Suite access; module is never served', async () => {
    const { readFileSync } = await import('node:fs');
    const server = readFileSync(new URL('./server.js', import.meta.url), 'utf8');
    assert.match(server, /app\.post\('\/api\/frank\/generate', requireWritingAccess, createFrankGenerateHandler\(/);
    assert.equal(isPublicStaticPath('/frank-ai.js'), false);
    assert.equal(isPublicStaticPath('/frank-ai.test.js'), false);
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.ok(html.includes("fetch('/api/frank/generate'") && html.includes('Showing a ready-made model instead'));
});

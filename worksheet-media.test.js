import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseYoutubeSearchHtml, parseItunesEpisodes, topicKeywords, rankForClass, searchMedia, sanitizeCompanionMedia, parseClock, MAX_VIDEO_SEC,
} from './worksheet-maker/lib/media-search.js';
import { buildLessonPrompt, companionMediaNote } from './worksheet-maker/lib/lesson-prompt.js';
import { STRINGS, t } from './worksheet-maker/lib/ui-strings.js';

const ytHtml = fs.readFileSync(new URL('./worksheet-media-fixtures/youtube-search.html', import.meta.url), 'utf8');
const itunes = JSON.parse(fs.readFileSync(new URL('./worksheet-media-fixtures/itunes-episodes.json', import.meta.url), 'utf8'));

test('YouTube results page (ytInitialData) parses into real video cards; live + duplicate dropped', () => {
  const v = parseYoutubeSearchHtml(ytHtml);
  assert.equal(v.length, 4);
  for (const x of v) {
    assert.match(x.id, /^[\w-]{11}$/);
    assert.equal(x.url, `https://www.youtube.com/watch?v=${x.id}`);
    assert.ok(x.title && x.source && x.durationSec > 0 && x.duration);
  }
  assert.equal(v[0].title, 'What lack of sleep does to the teenage brain - Wendy Troxel');
  assert.equal(v[0].durationSec, 405);
  assert.ok(!v.some((x) => /Live/.test(x.title)));
  assert.deepEqual(parseYoutubeSearchHtml('<html>no data</html>'), []);
});

test('iTunes podcast episodes map to audio cards with duration, artwork and https audio', () => {
  const a = parseItunesEpisodes(itunes);
  assert.ok(a.length >= 3);
  for (const x of a) {
    assert.equal(x.kind, 'audio');
    assert.match(x.url, /^https:\/\/podcasts\.apple\.com\//);
    assert.ok(x.title && x.source && x.durationSec > 0);
  }
  assert.deepEqual(parseItunesEpisodes({}), []);
});

test('keyword extraction picks topic words, title weighted, no stop words', () => {
  const k = topicKeywords({ title: 'Teenagers and sleep', text: 'Teenagers need more sleep. Screen time at night keeps teenagers awake. Screen time and phones hurt sleep. The phones glow.' });
  assert.ok(k.keywords.includes('screen'));
  assert.ok(k.query.includes('sleep') && k.query.includes('teenagers'));
  assert.ok(!/\bthe\b|\band\b/.test(k.query));
  assert.equal(topicKeywords({ topic: 'ocean plastic', text: 'x' }).query, 'ocean plastic');
});

test('class ranking drops overly long / off-topic items and prefers short classroom lengths', () => {
  const items = [
    { title: 'Ocean plastic documentary', durationSec: 3600 },
    { title: 'Cooking pasta', durationSec: 300 },
    { title: 'Plastic in the ocean explained', durationSec: 1100 },
    { title: 'Ocean plastic in 5 minutes', durationSec: 300 },
  ];
  const r = rankForClass(items, 'video', 'ocean plastic');
  assert.deepEqual(r.map((x) => x.title), ['Ocean plastic in 5 minutes', 'Plastic in the ocean explained']);
  assert.ok(r.every((x) => x.durationSec <= MAX_VIDEO_SEC));
  assert.equal(parseClock('1:02:03'), 3723);
});

test('searchMedia: only oEmbed-confirmed videos are returned; a failing source reports its own error', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('youtube.com/results')) return { ok: true, text: async () => ytHtml };
    if (url.includes('/oembed')) {
      const ok = !url.includes('Jt3vGDl_ibs'); // pretend one video was removed
      return { ok, json: async () => ({ title: 'T', author_name: 'A' }) };
    }
    if (url.includes('itunes.apple.com')) return { ok: false, status: 503 };
    throw new Error('unexpected');
  };
  const out = await searchMedia({ query: 'teenage sleep phones', kind: 'both', fetchImpl });
  assert.ok(out.video.length >= 1);
  assert.ok(!out.video.some((x) => x.id === 'Jt3vGDl_ibs'));
  assert.ok(out.video.every((x) => x.verified));
  assert.deepEqual(out.audio, []);
  assert.match(out.errors.audio, /503/);
  await assert.rejects(searchMedia({ query: '  ', fetchImpl }), /search words/);
});

test('companion media pick is sanitised: https + known host only', () => {
  assert.equal(sanitizeCompanionMedia({ kind: 'video', url: 'http://www.youtube.com/watch?v=abc' }), null);
  assert.equal(sanitizeCompanionMedia({ kind: 'video', url: 'https://evil.example/x' }), null);
  const ok = sanitizeCompanionMedia({ kind: 'audio', url: 'https://podcasts.apple.com/gb/podcast/x?i=1', title: ' A  b ', durationSec: 300, thumbnail: 'javascript:x' });
  assert.equal(ok.title, 'A b');
  assert.equal(ok.duration, '5:00');
  assert.equal(ok.thumbnail, '');
});

const src = { title: 'Article · Video', url: 'https://www.youtube.com/watch?v=WJhCa12UTsg', skillHint: 'combined', combinedSources: true, wordCount: 300, text: '[VIDEO — listening source]\n...\n\n[READING TEXT]\n...' };

test('lesson prompt carries media metadata + teacher plan; transcript vs honest no-transcript rules', () => {
  const media = { kind: 'video', title: 'What lack of sleep does to the teenage brain', source: 'TED-Ed', url: src.url, duration: '6:45', transcriptFound: true };
  const p = buildLessonPrompt({ source: { ...src, transcriptFound: true }, cefr: 'B1', tasks: ['mcq', 'discussion'], companionMedia: media, mediaPlan: 'Pre-listening warm-up, then questions on minutes 0-3' });
  assert.match(p, /COMPANION MEDIA PICKED BY THE TEACHER \(video\)/);
  assert.match(p, /TED-Ed/);
  assert.match(p, /6:45/);
  assert.match(p, /Pre-listening warm-up, then questions on minutes 0-3/);
  assert.match(p, /answerable from the transcript alone/);
  assert.match(p, /mediaSection/);
  const audio = companionMediaNote({ kind: 'audio', title: 'Ocean episode', url: 'https://podcasts.apple.com/x', description: 'We talk about plastic.' }, '', {});
  assert.match(audio, /Transcript: NOT available/);
  assert.match(audio, /We talk about plastic\./);
  assert.match(audio, /HONESTY/);
  assert.match(audio, /Do NOT write gap-fills, true\/false, MCQ keys/);
  assert.equal(companionMediaNote(null), '');
  assert.doesNotMatch(buildLessonPrompt({ source: src, cefr: 'B1', tasks: ['mcq'] }), /COMPANION MEDIA/);
});

test('media finder UI strings exist in EN, DE and PL; EN default fallback', () => {
  const keys = Object.keys(STRINGS.en).filter((k) => k.startsWith('media'));
  assert.ok(keys.length >= 25);
  for (const lang of ['de', 'pl']) for (const k of keys) assert.ok(STRINGS[lang][k], `${lang}.${k}`);
  assert.equal(t('pl', 'mediaFindBtn'), 'Znajdź wideo lub audio do tego artykułu');
  assert.equal(t('xx', 'mediaFindBtn'), 'Find a video or audio for this article');
});

test('worksheet page wires the finder, the plan box with chips, and sends the pick to generation', () => {
  const html = fs.readFileSync(new URL('./worksheet-maker/index.html', import.meta.url), 'utf8');
  for (const id of ['mediaFindBtn', 'mediaQuery', 'mediaSearchBtn', 'mediaResults', 'mediaPlan', 'mediaChips']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /data-kind="video"[\s\S]*data-kind="audio"[\s\S]*data-kind="both"/);
  assert.match(html, /body\.companionMedia = media/);
  assert.match(html, /body\.mediaPlan = /);
  assert.match(html, /api\/media-search/);
  assert.match(html, /class="media-sheet/);
  const server = fs.readFileSync(new URL('./worksheet-maker/server.js', import.meta.url), 'utf8');
  assert.match(server, /app\.post\('\/api\/media-search'/);
  assert.match(server, /requireSignedIn/);
});

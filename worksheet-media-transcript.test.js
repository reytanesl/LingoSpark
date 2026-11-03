import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseRssItems, findEpisode, pickTranscript, parseSrtVtt, parseJsonTranscript, fetchPodcastTranscript, resolveApplePodcastEpisode, timedText,
} from './worksheet-maker/lib/media-transcript.js';
import { parseCaptionPayload, loadSource } from './worksheet-maker/lib/fetch-source.js';
import { searchPodcasts, searchYoutube, rankByTranscript } from './worksheet-maker/lib/media-search.js';
import { buildLessonPrompt } from './worksheet-maker/lib/lesson-prompt.js';

const fx = (f) => fs.readFileSync(new URL(`./worksheet-media-fixtures/${f}`, import.meta.url), 'utf8');
const res = (body, ok = true) => ({ ok, status: ok ? 200 : 404, text: async () => body, json: async () => JSON.parse(body) });
const podcastFetch = (url) => {
  if (url.startsWith('https://itunes.apple.com/lookup')) return res(fx('itunes-lookup.json'));
  if (url === 'https://feeds.example.com/ocean.xml') return res(fx('feed.xml'));
  if (url === 'https://cdn.example.com/ep42.srt') return res(fx('ep42.srt'));
  if (url === 'https://cdn.example.com/ep42.html') return res('<p>html version</p>');
  return res('', false);
};

test('RSS: episode found by guid / enclosure / title; timed transcript preferred over HTML', () => {
  const items = parseRssItems(fx('feed.xml'));
  assert.equal(items.length, 2);
  assert.equal(items[1].title, 'No transcript & no luck');
  assert.equal(findEpisode(items, { guid: 'ep-42' }).title, 'Rivers carry plastic');
  assert.equal(findEpisode(items, { audioUrl: 'https://other.cdn/x/ep42.mp3' }).guid, 'ep-42');
  assert.equal(findEpisode(items, { title: 'rivers CARRY plastic!' }).guid, 'ep-42');
  assert.equal(pickTranscript(items[0].transcripts).url, 'https://cdn.example.com/ep42.srt');
  assert.equal(pickTranscript(items[1].transcripts), null);
});

test('SRT/VTT/JSON transcripts keep [m:ss] markers and speaker labels', () => {
  const t = parseSrtVtt(fx('ep42.srt'));
  assert.match(t, /^\[0:00\] ANNA: Welcome to Ocean Talk/);
  assert.match(t, /\[1:05\] TOM: In Jakarta/);
  assert.match(t, /\[2:10\] TOM: Every barrier collects about two tonnes/);
  const j = parseJsonTranscript(JSON.stringify({ segments: [{ startTime: 0, body: 'Hello there.', speaker: 'Ann' }, { startTime: 75, body: 'Later part.', speaker: 'Ann' }] }));
  assert.equal(j, '[0:00] Ann: Hello there.\n\n[1:15] Ann: Later part.');
  assert.equal(timedText([]), '');
});

test('YouTube json3 captions keep minute markers and drop [Music] cues (same parser as pasted links)', () => {
  const t = parseCaptionPayload(fx('captions.json3'));
  assert.equal(t, '[0:00] Plastic travels down rivers to the ocean every day.\n\n[1:05] Scientists counted one thousand rivers.');
});

test('Apple Podcasts link → iTunes lookup → RSS feed → transcript', async () => {
  const ep = await resolveApplePodcastEpisode('https://podcasts.apple.com/gb/podcast/rivers/id555?i=777', { fetchImpl: podcastFetch });
  assert.equal(ep.feedUrl, 'https://feeds.example.com/ocean.xml');
  assert.equal(ep.guid, 'ep-42');
  const tr = await fetchPodcastTranscript(ep, { fetchImpl: podcastFetch });
  assert.equal(tr.timed, true);
  assert.match(tr.transcript, /TOM: In Jakarta/);
});

test('unified pipeline: a picked podcast and the same pasted link give the same transcribed source; article is kept', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => podcastFetch(String(url));
  try {
    const link = 'https://podcasts.apple.com/gb/podcast/rivers/id555?i=777';
    const article = 'Rivers carry most of the plastic that ends up in the ocean. '.repeat(10);
    const picked = await loadSource({ videoUrl: link, pastedText: article, companionMedia: { kind: 'audio', url: link, title: 'ignored meta' } });
    const pastedWithArticleLink = await loadSource({ videoUrl: link });
    assert.equal(picked.combinedSources, true);
    assert.equal(picked.transcriptFound, true);
    assert.match(picked.text, /\[VIDEO — listening source\][\s\S]*TOM: In Jakarta[\s\S]*\[READING TEXT\][\s\S]*Rivers carry most/);
    assert.equal(pastedWithArticleLink.transcriptFound, true);
    assert.match(pastedWithArticleLink.text, /TOM: In Jakarta/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('search marks + ranks results with a transcript first (audio via RSS, video via caption probe)', async () => {
  const itunes = fx('itunes-episodes.json');
  const fetchImpl = async (url) => (url.includes('itunes.apple.com/search') ? res(itunes) : res('', false));
  const audio = await searchPodcasts('ocean plastic pollution', { fetchImpl, esl: false, transcriptInfo: async (r) => (/Boyan/.test(r.title) ? null : { url: 'x' }) });
  assert.ok(audio.length >= 2);
  assert.ok(audio.every((a) => ['yes', 'no', 'unknown'].includes(a.transcript)));
  assert.equal(audio[audio.length - 1].transcript, 'no');
  assert.deepEqual(rankByTranscript([{ transcript: 'no' }, { transcript: 'unknown' }, { transcript: 'yes' }]).map((x) => x.transcript), ['yes', 'unknown', 'no']);
  const yt = fx('youtube-search.html');
  const vfetch = async (url) => (url.includes('/results') ? res(yt) : { ok: true, json: async () => ({ title: 'T', author_name: 'A' }) });
  const video = await searchYoutube('teenage sleep phones', { fetchImpl: vfetch, esl: false, captionProbe: async (id) => (id === 'WJhCa12UTsg' ? 'no' : 'yes') });
  assert.equal(video.find((v) => v.id === 'WJhCa12UTsg')?.transcript ?? 'no', 'no');
  assert.equal(video[0].transcript, 'yes');
});

test('prompt: media tasks built from the transcript, minute ranges/speakers/quotes, keys reverse-tested', () => {
  const source = { title: 'A · B', url: 'https://podcasts.apple.com/x', skillHint: 'combined', combinedSources: true, transcriptFound: true, wordCount: 500,
    text: '[VIDEO — listening source]\nTitle: Rivers\n[0:00] ANNA: Welcome…\n\n[READING TEXT]\nTitle: Article\nRivers…' };
  const p = buildLessonPrompt({ source, cefr: 'B1', tasks: ['mcq', 'tf'], companionMedia: { kind: 'audio', title: 'Rivers carry plastic', url: source.url, transcriptFound: true }, mediaPlan: 'After reading, listen and compare.' });
  assert.match(p, /same pipeline as a pasted link/);
  assert.match(p, /AUDIO transcript/);
  assert.match(p, /\[m:ss\] time markers/);
  assert.match(p, /name speakers/);
  assert.match(p, /reverse-test every key against the transcript/);
  assert.match(p, /After reading, listen and compare\./);
  assert.doesNotMatch(p, /HONESTY/);
  assert.match(p, /\[0:00\] ANNA: Welcome/);
});

test('worksheet shows the media transcript on the teacher side and transcript badges on result cards', () => {
  const html = fs.readFileSync(new URL('./worksheet-maker/index.html', import.meta.url), 'utf8');
  assert.match(html, /mediaTranscriptHtml/);
  assert.match(html, /class="transcript-teacher"/);
  assert.match(html, /mc-tx is-/);
});

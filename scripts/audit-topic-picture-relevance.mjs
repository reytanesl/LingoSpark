/**
 * Audit picture-mode Topic Challenge items vs scene hotspots (exact matches only).
 */
import fs from 'fs';
import vm from 'vm';

const ctx = { console };
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
  querySelectorAll: () => [],
  querySelector: () => null,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('pe-topic-challenge-banks.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('pe-topic-challenge-hotspots.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('pe-topic-challenge.js', 'utf8'), ctx);

const src = fs.readFileSync('pe-topic-challenge.js', 'utf8');
const WORD_ALIASES = vm.runInNewContext('(' + src.match(/const WORD_ALIASES = (\{[\s\S]*?\n    \});/)[1] + ')');
const STOP_WORDS = new Set(
  src
    .match(/const STOP_WORDS = new Set\(\[([\s\S]*?)\]\);/)[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
);

function expandLexicalToken(w) {
  const out = [];
  const seen = new Set();
  const queue = [w];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    (WORD_ALIASES[cur] || []).forEach((a) => queue.push(a));
    if (cur.endsWith('ies') && cur.length > 4) queue.push(cur.slice(0, -3) + 'y');
    else if (/(?:ches|shes|sses|xes|zes)$/.test(cur) && cur.length > 4) queue.push(cur.slice(0, -2));
    else if (cur.endsWith('s') && !cur.endsWith('ss') && cur.length > 3) queue.push(cur.slice(0, -1));
    if (cur.includes('-')) queue.push(cur.replace(/-/g, ''));
    if (out.length > 40) break;
  }
  return out;
}

function tokensFor(task) {
  const text = [task.answer, task.promptEn, ...(task.tiles || []), ...(task.accept || [])]
    .join(' ')
    .toLowerCase();
  const raw = text.replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  const tokens = [];
  raw.forEach((w) => {
    if (w.length < 2 || STOP_WORDS.has(w)) return;
    expandLexicalToken(w).forEach((t) => tokens.push(t));
  });
  const compact = text.replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
  [
    'ice cream', 'pencil case', 'traffic light', 'street lamp', 'board game',
    't-shirt', 'bus stop', 'police officer', 'shopping cart'
  ].forEach((phrase) => {
    if (compact.includes(phrase)) tokens.push(phrase);
  });
  if (/\b(he|him|his|boy|man|brother|father|dad)\b/.test(text)) {
    tokens.push('boy', 'man', 'grandfather');
  }
  if (/\b(she|her|girl|woman|sister|mother|mum|mom)\b/.test(text)) {
    tokens.push('girl', 'woman', 'teacher', 'grandmother');
  }
  return [...new Set(tokens)];
}

function score(hsWord, token) {
  const hw = String(hsWord || '').toLowerCase();
  const t = String(token || '').toLowerCase();
  if (!hw || !t || t.length < 2) return 0;
  if (hw === t) return 3;
  const parts = hw.split(/\s+/);
  if (parts.length > 1 && parts.includes(t) && t.length >= 3) return 3;
  const norm = (s) => s.replace(/[-\s]/g, '');
  if (norm(hw) === norm(t) && norm(t).length >= 4) return 3;
  return 0;
}

function pickHighlight(sceneId, task) {
  const hs = ctx.PE_TOPIC_CHALLENGE_HOTSPOTS[sceneId] || [];
  const tokens = tokensFor(task);
  const scored = hs
    .map((h, i) => ({
      h,
      i,
      score: Math.max(0, ...tokens.map((t) => score(h.w, t))),
    }))
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  return scored[0] || null;
}

const misses = [];
const byTopic = {};
let hit = 0;
let miss = 0;

for (const task of ctx.PE_TOPIC_CHALLENGE_BANK) {
  if (!(task.modeHints || []).includes('picture')) continue;
  const paths = ctx.PE_TOPIC_CHALLENGE_SCENES[task.topic] || [];
  let best = null;
  for (const p of paths) {
    const id = p.split('/').pop().replace(/\.(png|jpe?g|webp)$/i, '');
    const found = pickHighlight(id, task);
    if (found && (!best || found.score > best.score)) {
      best = { scene: id, word: found.h.w, score: found.score };
    }
  }
  byTopic[task.topic] = byTopic[task.topic] || { n: 0, hit: 0, miss: 0 };
  byTopic[task.topic].n++;
  if (best) {
    hit++;
    byTopic[task.topic].hit++;
  } else {
    miss++;
    byTopic[task.topic].miss++;
    misses.push(`${task.id}: ${task.answer}`);
  }
}

console.log({ hit, miss, pct: Math.round((100 * hit) / (hit + miss)) + '%' });
console.log('byTopic', JSON.stringify(byTopic, null, 2));
if (misses.length) console.log('misses:\n' + misses.join('\n'));

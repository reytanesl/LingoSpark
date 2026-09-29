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
  querySelector: () => null
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('pe-topic-challenge-banks.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('pe-topic-challenge-hotspots.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('pe-topic-challenge.js', 'utf8'), ctx);

// Access internals via a tiny eval hook if not exported — re-implement check using hotspots + aliases by launching newRound won't work without DOM.
// Instead inspect bank answers against hotspots with engine-compatible token expansion from source.
const src = fs.readFileSync('pe-topic-challenge.js', 'utf8');
const aliasMatch = src.match(/const WORD_ALIASES = (\{[\s\S]*?\n    \});/);
const stopMatch = src.match(/const STOP_WORDS = new Set\(\[([\s\S]*?)\]\);/);
if (!aliasMatch) throw new Error('WORD_ALIASES missing');
const WORD_ALIASES = vm.runInNewContext('(' + aliasMatch[1] + ')');
const STOP_WORDS = new Set(
  stopMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
);

function tokensFor(task) {
  const text = [task.answer, task.promptEn, ...(task.tiles || [])].join(' ').toLowerCase();
  const raw = text.replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  const tokens = [];
  raw.forEach((w) => {
    if (w.length < 2 || STOP_WORDS.has(w)) return;
    tokens.push(w);
    (WORD_ALIASES[w] || []).forEach((a) => tokens.push(a));
  });
  if (/\b(he|him|his|boy|man|brother|father|dad)\b/.test(text)) tokens.push('boy', 'man', 'grandfather');
  if (/\b(she|her|girl|woman|sister|mother|mum|mom)\b/.test(text)) tokens.push('girl', 'woman', 'teacher', 'grandmother');
  return [...new Set(tokens)];
}

function score(hsWord, token) {
  const hw = hsWord.toLowerCase();
  const t = token.toLowerCase();
  if (hw === t) return 3;
  if (hw.includes(t) || t.includes(hw)) return t.length >= 4 || hw.length >= 4 ? 1 : 0;
  return 0;
}

let hit = 0;
let miss = 0;
const misses = [];
for (const task of ctx.PE_TOPIC_CHALLENGE_BANK) {
  if (!(task.modeHints || []).includes('picture')) continue;
  const paths = ctx.PE_TOPIC_CHALLENGE_SCENES[task.topic] || [];
  const tokens = tokensFor(task);
  let found = false;
  let label = '';
  for (const src of paths) {
    const id = src.split('/').pop().replace(/\.(png|jpe?g)$/i, '');
    const hs = ctx.PE_TOPIC_CHALLENGE_HOTSPOTS[id] || [];
    for (const h of hs) {
      if (tokens.some((t) => score(h.w, t) > 0)) {
        found = true;
        label = h.w;
        break;
      }
    }
    if (found) break;
  }
  if (found) hit++;
  else {
    miss++;
    if (misses.length < 20) misses.push(`${task.answer} [${tokens.slice(0, 6).join(',')}]`);
  }
}
console.log({ hit, miss, pct: Math.round((100 * hit) / (hit + miss)) + '%' });
console.log('misses:\n' + misses.join('\n'));

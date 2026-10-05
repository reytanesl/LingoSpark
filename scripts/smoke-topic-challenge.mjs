import fs from 'fs';
import vm from 'vm';

const ctx = {};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('pe-topic-challenge-banks.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('pe-topic-challenge-hotspots.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('pe-topic-challenge.js', 'utf8'), ctx);

const bank = ctx.PE_TOPIC_CHALLENGE_BANK;
const topics = ctx.PE_TOPIC_CHALLENGE_TOPICS.map((t) => t.id);
const grammars = ctx.PE_TOPIC_CHALLENGE_GRAMMARS.map((g) => g.id);
const modes = ['picture', 'tiles', 'transform'];
const api = ctx.PETopicChallenge;

console.log('bank size', bank.length);
console.log('initTopicChallenge', typeof ctx.initTopicChallenge);
console.log('buildPictureTask', typeof api.buildPictureTask);
console.log('text modeHints', bank.filter((i) => (i.modeHints || []).includes('text')).length);

const hardGaps = [];
const softEmptyMode = [];
const pictureThin = [];
for (const t of topics) {
  for (const g of grammars) {
    const picN = api.picturePoolSize(t, g);
    if (picN < 3) pictureThin.push(`${t}×${g}=${picN}`);
    for (const m of modes) {
      if (m === 'picture') {
        if (picN < 1) softEmptyMode.push(`${t}×${g}×picture`);
        continue;
      }
      const pool = bank.filter((item) => {
        if (item.topic !== t || item.grammar !== g) return false;
        const hints = item.modeHints || [];
        if (m === 'transform') return hints.includes('transform') && item.transformFrom;
        if (m === 'tiles') {
          return (hints.includes('tiles') || hints.includes('transform') || hints.includes('picture'))
            && Array.isArray(item.tiles) && item.tiles.length >= 2;
        }
        return false;
      });
      const fallback = bank.filter((i) => i.topic === t && i.grammar === g);
      if (!pool.length && !fallback.length && picN < 1) hardGaps.push(`${t}×${g}×${m}`);
      if (!pool.length && fallback.length) softEmptyMode.push(`${t}×${g}×${m}`);
    }
  }
}
console.log('hard gaps', hardGaps.length ? hardGaps : 'none');
console.log('soft empty modes', softEmptyMode.length, softEmptyMode.slice(0, 10).join(', ') + (softEmptyMode.length > 10 ? '…' : ''));
console.log('picture thin (<3)', pictureThin.length ? pictureThin.join(', ') : 'none');

// Sample a few Spot & Say cards — circle label must appear in the answer
const samples = [];
for (const t of topics.slice(0, 3)) {
  for (const g of ['be', 'have_got', 'can']) {
    const task = api.buildPictureTask(t, g);
    if (!task) {
      samples.push(`${t}×${g}: NONE`);
      continue;
    }
    const ok = task.answer.toLowerCase().includes(task.hotspotWord)
      && task.highlightBoxes?.length === 1
      && task.sceneSrc;
    samples.push(`${t}×${g}: ${ok ? 'ok' : 'BAD'} [${task.hotspotWord}] → ${task.answer}`);
  }
}
console.log('spot-say samples:\n ', samples.join('\n  '));

let transformOk = true;
for (const t of topics) {
  for (const g of ['negatives', 'questions']) {
    const n = bank.filter((i) => i.topic === t && i.grammar === g && (i.modeHints || []).includes('transform')).length;
    if (n < 1) {
      transformOk = false;
      console.log('missing transform', t, g);
    }
  }
}
console.log('transform coverage', transformOk ? 'ok' : 'FAIL');

const html = fs.readFileSync('index.html', 'utf8');
console.log('no Text mode copy', !/Picture \/ Tiles \/ Text/.test(html) && !/Tiles, Text, Transform/.test(html));
console.log('spot say copy', /Spot/.test(html));
console.log('scripts', html.includes('pe-topic-challenge-banks.js') && html.includes('pe-topic-challenge.js'));
console.log('hotspots script', html.includes('pe-topic-challenge-hotspots.js'));
console.log('scene images registered', Object.keys(ctx.PE_TOPIC_CHALLENGE_SCENES || {}).length);
const sceneFiles = Object.values(ctx.PE_TOPIC_CHALLENGE_SCENES || {}).flat();
const missingScenes = sceneFiles.filter((p) => !fs.existsSync(p));
console.log('scene files on disk', missingScenes.length ? `MISSING ${missingScenes.length}` : `${sceneFiles.length} ok`);
console.log('hotspot scenes', Object.keys(ctx.PE_TOPIC_CHALLENGE_HOTSPOTS || {}).length);

// Grammar purity of Spot & Say model answers (all hotspot labels × grammars)
const ALWAYS_PLURAL = [
  'stairs', 'jeans', 'trousers', 'pants', 'shorts', 'glasses', 'goggles',
  'sunglasses', 'scissors', 'clothes', 'binoculars', 'shoes', 'boots', 'socks'
];
const grammarBugs = [];
const hsMap = ctx.PE_TOPIC_CHALLENGE_HOTSPOTS || {};
const allWords = [...new Set(Object.values(hsMap).flat().map((h) => String(h.w).toLowerCase()))];
for (const w of allWords) {
  for (const g of grammars) {
    const card = api.grammarCard(g, w);
    if (!card) continue;
    const texts = [card.answer].concat(card.accept || []);
    for (const t of texts) {
      const n = String(t).toLowerCase();
      for (const pl of ALWAYS_PLURAL) {
        // Flag "a stairs." / "a jeans" but not compounds like "a clothes peg"
        if (new RegExp(`\\b(a|an)\\s+${pl}(?=\\s*[.!?,]|$)`).test(n)) {
          grammarBugs.push(`${w}×${g}: ${t}`);
        }
      }
      if (/\bit is (a|an) .+\.$/i.test(t) && api.isPluralNoun(w) && !/\bthe\b/i.test(t)) {
        grammarBugs.push(`plural-as-it ${w}×${g}: ${t}`);
      }
      if (/\bthey are (thermos|bus|dress|compass|hourglass|chest of drawers)\b/i.test(n)) {
        grammarBugs.push(`false-plural ${w}×${g}: ${t}`);
      }
      if (/\b(a|an)\s+hour/i.test(n) && /\ba hour/i.test(n)) {
        grammarBugs.push(`article ${w}×${g}: ${t}`);
      }
      if (/\ba hourglass\b/i.test(n) || /\ba hour\b/i.test(n)) {
        grammarBugs.push(`article-h ${w}×${g}: ${t}`);
      }
      if (/\ba floss\b/i.test(n) || /\ban floss\b/i.test(n)) {
        grammarBugs.push(`floss ${w}×${g}: ${t}`);
      }
    }
  }
}
if (grammarBugs.length) {
  console.error('grammar bugs in model answers:', grammarBugs.slice(0, 40));
  process.exitCode = 1;
} else {
  console.log('spot-say grammar purity: ok (' + allWords.length + ' labels)');
}
// Spot checks for known fixes
const expect = {
  stairs: { be: 'They are stairs.' },
  thermos: { be: 'It is a thermos.' },
  hourglass: { be: 'It is an hourglass.' },
  'chest of drawers': { be: 'It is a chest of drawers.' },
  floss: { be: 'It is floss.' },
  jeans: { be: 'They are jeans.' }
};
for (const [w, byG] of Object.entries(expect)) {
  for (const [g, want] of Object.entries(byG)) {
    const got = api.grammarCard(g, w)?.answer;
    if (got !== want) {
      console.error(`expected ${w}×${g} → ${want}, got ${got}`);
      process.exitCode = 1;
    }
  }
}
if (!process.exitCode) console.log('known noun fixes: ok');


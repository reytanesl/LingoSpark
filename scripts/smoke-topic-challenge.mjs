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

console.log('bank size', bank.length);
console.log('initTopicChallenge', typeof ctx.initTopicChallenge);
console.log('text modeHints', bank.filter((i) => (i.modeHints || []).includes('text')).length);

const hardGaps = [];
const softEmptyMode = [];
for (const t of topics) {
  for (const g of grammars) {
    for (const m of modes) {
      const pool = bank.filter((item) => {
        if (item.topic !== t || item.grammar !== g) return false;
        const hints = item.modeHints || [];
        if (m === 'transform') return hints.includes('transform') && item.transformFrom;
        if (m === 'tiles') {
          return (hints.includes('tiles') || hints.includes('transform') || hints.includes('picture'))
            && Array.isArray(item.tiles) && item.tiles.length >= 2;
        }
        if (m === 'picture') return hints.includes('picture');
        return false;
      });
      const fallback = bank.filter((i) => i.topic === t && i.grammar === g);
      if (!pool.length && !fallback.length) hardGaps.push(`${t}×${g}×${m}`);
      if (!pool.length && fallback.length) softEmptyMode.push(`${t}×${g}×${m}`);
    }
  }
}
console.log('hard gaps', hardGaps.length ? hardGaps : 'none');
console.log('modes using fallback', softEmptyMode.length, softEmptyMode.slice(0, 12).join(', ') + (softEmptyMode.length > 12 ? '…' : ''));

// Transform only for negatives/questions; structure grids never offer transform.
let transformOk = true;
for (const t of topics) {
  for (const g of ['negatives', 'questions']) {
    const n = bank.filter((i) => i.topic === t && i.grammar === g && (i.modeHints || []).includes('transform')).length;
    if (n < 1) {
      transformOk = false;
      console.log('missing transform', t, g);
    }
  }
  for (const g of ['be', 'have_got', 'can', 'like', 'present_simple']) {
    const n = bank.filter((i) => i.topic === t && i.grammar === g && (i.modeHints || []).includes('transform')).length;
    if (n) {
      transformOk = false;
      console.log('unexpected transform on structure grammar', t, g, n);
    }
  }
}
console.log('transform coverage', transformOk ? 'ok' : 'FAIL');
console.log('speak-ready', bank.filter((i) => (i.modeHints || []).includes('speak')).length);

// be / have_got / can must not model do-support answers
const impure = [];
for (const i of bank) {
  const a = i.answer || '';
  if (i.grammar === 'be' && (/\b(do|does|don't|doesn't)\b/i.test(a) || /\bshows?\b/i.test(a))) impure.push(i.id + ' ' + a);
  if ((i.grammar === 'have_got' || i.grammar === 'can') && /\b(do|does|don't|doesn't)\b/i.test(a)) impure.push(i.id + ' ' + a);
}
console.log('grammar purity', impure.length ? impure : 'ok');

const html = fs.readFileSync('index.html', 'utf8');
const freeMatch = html.match(/FREE_PE_GAMES = new Set\(\[([^\]]+)\]\)/);
const writingMatch = html.match(/WRITING_GAMES = new Set\(\[([^\]]+)\]\)/);
const peMatch = html.match(/PE_GAMES = new Set\(\[([^\]]+)\]\)/);
const free = freeMatch ? freeMatch[1] : '';
const writing = writingMatch ? writingMatch[1] : '';
const pe = peMatch ? peMatch[1] : '';
console.log('FREE_PE_GAMES', free);
console.log('pe-topic in WRITING', writing.includes("'pe-topic'"));
console.log('pe-topic in PE_GAMES', pe.includes("'pe-topic'"));
console.log('pe-topic NOT in FREE', !free.includes("'pe-topic'"));
console.log('screen-pe-topic', html.includes('id="screen-pe-topic"'));
console.log('scripts', html.includes('pe-topic-challenge-banks.js') && html.includes('pe-topic-challenge.js'));
console.log('card setup link', html.includes('#/setup/pe-topic'));
console.log('simplified setup', html.includes('topic-setup-speak') && !html.includes('name="topic-setup-mode"'));
console.log('no Text mode copy', !/Picture \/ Tiles \/ Text/.test(html) && !/Tiles, Text, Transform/.test(html) && !/Tiles, Text or Transform/.test(html));
console.log('hotspots script', html.includes('pe-topic-challenge-hotspots.js'));
console.log('scene images registered', Object.keys(ctx.PE_TOPIC_CHALLENGE_SCENES || {}).length);
const sceneFiles = Object.values(ctx.PE_TOPIC_CHALLENGE_SCENES || {}).flat();
const missingScenes = sceneFiles.filter((p) => !fs.existsSync(p));
console.log('scene files on disk', missingScenes.length ? `MISSING ${missingScenes.length}: ${missingScenes.slice(0,3)}` : `${sceneFiles.length} ok`);
const hotspotScenes = Object.keys(ctx.PE_TOPIC_CHALLENGE_HOTSPOTS || {});
console.log('hotspot scenes', hotspotScenes.length);

const db = fs.readFileSync('db.js', 'utf8');
console.log('db pe_topic', db.includes("'pe_topic'"));

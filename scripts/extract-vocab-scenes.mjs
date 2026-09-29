/**
 * Extract vocab-scenes.html: pull base64 images to assets/vocab-scenes/
 * and write a lean vocab-scenes.html that references those files.
 * Usage: node scripts/extract-vocab-scenes.mjs [source.html]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcPath = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads', 'vocab-scenes.html');
const outHtml = path.join(root, 'vocab-scenes.html');
const outDir = path.join(root, 'assets', 'vocab-scenes');

if (!fs.existsSync(srcPath)) {
  console.error('Source not found:', srcPath);
  process.exit(1);
}

const html = fs.readFileSync(srcPath, 'utf8');
const m = html.match(/const SCENES=(\[.*?\]);\s*const \$=/s);
if (!m) {
  console.error('Could not find SCENES array in source HTML');
  process.exit(1);
}

const scenes = JSON.parse(m[1]);
fs.mkdirSync(outDir, { recursive: true });

function writeDataUrl(dataUrl, filePath) {
  const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error('Bad data URL for ' + filePath);
  fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
  return match[1];
}

const leanScenes = scenes.map((s) => {
  const imgPath = path.join(outDir, `${s.id}.jpg`);
  const thumbPath = path.join(outDir, `${s.id}-thumb.jpg`);
  writeDataUrl(s.img, imgPath);
  writeDataUrl(s.thumb || s.img, thumbPath);
  return {
    id: s.id,
    title: s.title,
    img: `assets/vocab-scenes/${s.id}.jpg`,
    thumb: `assets/vocab-scenes/${s.id}-thumb.jpg`,
    hotspots: s.hotspots
  };
});

// Rebuild HTML: take everything before SCENES and after the closing ];const $=
const before = html.slice(0, html.indexOf('const SCENES='));
const afterStart = html.indexOf('const $=');
const after = html.slice(afterStart);

let head = before;
// Fix title encoding and brand the page
head = head.replace(
  /<title>.*?<\/title>/,
  '<title>Vocab Scenes · LingoSpark</title>'
);
head = head.replace(
  '</style>',
  `.ls-brand{text-decoration:none;font:700 13px/1 inherit;color:#fff;background:rgba(0,0,0,.18);padding:8px 12px;border-radius:999px;border:2px solid rgba(255,255,255,.35);white-space:nowrap}
.ls-brand:hover{background:rgba(0,0,0,.28)}
</style>`
);
head = head.replace(
  /<body>\s*<header>\s*<h1>[^<]*<\/h1>/,
  `<body>\n<header>\n  <a class="ls-brand" href="index.html" title="Back to LingoSpark">← LingoSpark</a>\n  <h1>🖼 Vocab Scenes</h1>`
);
// Fallback if structure differs
if (!head.includes('ls-brand')) {
  head = head.replace('<body>', `<body>\n<header><a class="ls-brand" href="index.html">← LingoSpark</a></header>\n`);
}
head = head.replace(/<h1>[^<]*Picture Vocabulary[^<]*<\/h1>/, '<h1>🖼 Vocab Scenes</h1>');

const out = head + `const SCENES=${JSON.stringify(leanScenes)};\n` + after;
fs.writeFileSync(outHtml, out, 'utf8');

const sizeMb = (fs.statSync(outHtml).size / 1024 / 1024).toFixed(2);
const imgCount = fs.readdirSync(outDir).length;
console.log('Wrote', outHtml, `(${sizeMb} MB)`);
console.log('Images in', outDir, ':', imgCount);
console.log('Scenes:', leanScenes.length);
